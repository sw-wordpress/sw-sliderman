<?php
/**
 * Retention rule for stored stylesheet artifacts.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Tests\Unit;

use PHPUnit\Framework\TestCase;
use SW\Slider\Application\ArtifactRetention;

final class ArtifactRetentionTest extends TestCase {

	private const NOW = 2000000000;

	public function test_grace_period_starts_when_the_last_reference_disappears_not_at_file_age(): void {
		// Published 90 days ago, replaced just now: the old file must survive the grace period.
		$files = array( 'old-r1.css' => self::NOW - 90 * 86400 );
		$first = ArtifactRetention::plan( $files, array(), array(), self::NOW );
		$this->assertSame( array(), $first['delete'] );
		$this->assertSame( array( 'old-r1.css' => self::NOW ), $first['since'] );

		$later = ArtifactRetention::plan( $files, array(), $first['since'], self::NOW + ArtifactRetention::GRACE_SECONDS - 1 );
		$this->assertSame( array(), $later['delete'] );
		$due = ArtifactRetention::plan( $files, array(), $first['since'], self::NOW + ArtifactRetention::GRACE_SECONDS );
		$this->assertSame( array( 'old-r1.css' ), $due['delete'] );
		$this->assertSame( array(), $due['since'] );
	}

	public function test_referenced_files_are_kept_and_forgotten_by_the_record(): void {
		$plan = ArtifactRetention::plan(
			array( 'active-r1.css' => 0 ),
			array( 'artifacts/active-r1.css' ),
			array( 'active-r1.css' => self::NOW - 30 * 86400 ),
			self::NOW
		);
		$this->assertSame(
			array(
				'delete' => array(),
				'since'  => array(),
			),
			$plan
		);
	}

	public function test_a_republished_file_restarts_the_grace_period(): void {
		$files = array( 'a-r1.css' => 0 );
		$old   = array( 'a-r1.css' => self::NOW - 30 * 86400 );
		$this->assertSame( array( 'a-r1.css' ), ArtifactRetention::plan( $files, array(), $old, self::NOW )['delete'] );
		$kept = ArtifactRetention::plan( $files, array( 'artifacts/a-r1.css' ), $old, self::NOW );
		$this->assertSame( array(), $kept['since'], 'referenced again: record dropped' );
		$this->assertSame( array( 'a-r1.css' => self::NOW + 1 ), ArtifactRetention::plan( $files, array(), $kept['since'], self::NOW + 1 )['since'] );
	}

	public function test_temporary_files_use_their_age_and_a_future_record_is_clamped(): void {
		$files = array(
			'.tmp-abc.css' => self::NOW - ArtifactRetention::TEMPORARY_SECONDS,
			'.tmp-new.css' => self::NOW - 60,
			'x-r1.css'     => 0,
		);
		$plan  = ArtifactRetention::plan( $files, array(), array( 'x-r1.css' => self::NOW + 999999 ), self::NOW );
		$this->assertSame( array( '.tmp-abc.css' ), $plan['delete'] );
		$this->assertSame( array( 'x-r1.css' => self::NOW ), $plan['since'], 'clock skew cannot postpone deletion indefinitely' );
	}

	public function test_nothing_happens_without_files_and_references_need_the_whole_path(): void {
		$this->assertSame(
			array(
				'delete' => array(),
				'since'  => array(),
			),
			ArtifactRetention::plan( array(), array(), array(), self::NOW )
		);
		$plan = ArtifactRetention::plan( array( 'a-r1.css' => 0 ), array( 'a-r1.css', 'fonts/a-r1.css' ), array(), self::NOW );
		$this->assertSame( array( 'a-r1.css' => self::NOW ), $plan['since'] );
	}
}

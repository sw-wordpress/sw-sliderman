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

	public function test_only_old_unreferenced_files_expire(): void {
		$files = array(
			'active-r1.css'  => self::NOW - 90 * 86400,
			'old-r1.css'     => self::NOW - ArtifactRetention::GRACE_SECONDS,
			'recent-r1.css'  => self::NOW - ArtifactRetention::GRACE_SECONDS + 1,
			'.tmp-abc.css'   => self::NOW - ArtifactRetention::TEMPORARY_SECONDS,
			'.tmp-new.css'   => self::NOW - 60,
		);
		$this->assertSame(
			array( '.tmp-abc.css', 'old-r1.css' ),
			ArtifactRetention::expired( $files, array( 'artifacts/active-r1.css' ), self::NOW )
		);
	}

	public function test_nothing_expires_without_files(): void {
		$this->assertSame( array(), ArtifactRetention::expired( array(), array(), self::NOW ) );
	}

	public function test_reference_must_match_the_whole_relative_path(): void {
		$files = array( 'a-r1.css' => 0 );
		$this->assertSame( array( 'a-r1.css' ), ArtifactRetention::expired( $files, array( 'a-r1.css', 'fonts/a-r1.css' ), self::NOW ) );
	}
}

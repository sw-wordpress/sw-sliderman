<?php
/**
 * Shared migration dispatcher contract.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Tests\Unit;

use InvalidArgumentException;
use PHPUnit\Framework\TestCase;
use SW\Slider\Domain\CanonicalJson;
use SW\Slider\Domain\DocumentMigrator;
use SW\Slider\Tests\Support\Fixtures;
use stdClass;

final class DocumentMigratorTest extends TestCase {

	public function test_sequential_steps_preserve_the_source(): void {
		$data   = json_decode( (string) file_get_contents( dirname( __DIR__, 2 ) . '/fixtures/migrations/dispatcher.json' ) );
		$before = CanonicalJson::encode( $data->source );
		$steps  = array(
			1 => static function ( stdClass $source ): stdClass {
				$source->schemaVersion = 2;
				return $source; },
			2 => static function ( stdClass $source ): stdClass {
				$source->schemaVersion = 3;
				$source->label = 'migrated';
				return $source; },
		);
		self::assertEquals( $data->expected, ( new DocumentMigrator( $steps, $data->targetVersion ) )->migrate( $data->source ) );
		self::assertSame( $before, CanonicalJson::encode( $data->source ) );
		foreach ( $data->rejectedVersions as $version ) {
			$source                = clone $data->source;
			$source->schemaVersion = $version;
			try {
				( new DocumentMigrator( $steps, 3 ) )->migrate( $source );
				self::fail( 'Unsupported version was accepted.' ); } catch ( InvalidArgumentException ) {
				self::assertTrue( true ); }
		}
	}

	public function test_missing_step_is_rejected(): void {
		$this->expectException( InvalidArgumentException::class );
		( new DocumentMigrator( array(), 2 ) )->migrate(
			(object) array(
				'id'            => 'stable',
				'schemaVersion' => 1,
			)
		);
	}

	public function test_identity_change_is_rejected(): void {
		$this->expectException( InvalidArgumentException::class );
		$step = static function ( stdClass $source ): stdClass {
			$source->schemaVersion = 2;
			$source->id            = 'changed';
			return $source;
		};
		( new DocumentMigrator( array( 1 => $step ), 2 ) )->migrate(
			(object) array(
				'id'            => 'stable',
				'schemaVersion' => 1,
			)
		);
	}
}

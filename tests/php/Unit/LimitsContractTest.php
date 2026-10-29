<?php
/**
 * Keeps PHP and TypeScript limits identical.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Tests\Unit;

use PHPUnit\Framework\TestCase;
use ReflectionClass;
use SW\Slider\Domain\Limits;

final class LimitsContractTest extends TestCase {

	public function test_typescript_limits_match_php_constants(): void {
		$source = (string) file_get_contents( dirname( __DIR__, 3 ) . '/assets/shared/limits.ts' );
		preg_match_all( '/^\s+([a-zA-Z]+): (-?[0-9.]+),$/m', $source, $matches, PREG_SET_ORDER );
		$typescript = array();
		foreach ( $matches as $match ) {
			$constant                = strtoupper( (string) preg_replace( '/(?<!^)[A-Z]/', '_$0', $match[1] ) );
			$typescript[ $constant ] = (float) $match[2];
		}
		$php = array_map( 'floatval', ( new ReflectionClass( Limits::class ) )->getConstants() );
		ksort( $typescript );
		ksort( $php );
		self::assertSame( $php, $typescript );
	}
}

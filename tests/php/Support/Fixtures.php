<?php
/**
 * Access to the shared contract fixtures.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Tests\Support;

use RuntimeException;
use stdClass;

/**
 * Loads tests/fixtures and applies the patch operations of invalid document cases.
 *
 * Must behave exactly like tests/unit/fixtures.ts.
 */
final class Fixtures {

	public static function path( string $relative ): string {
		return dirname( __DIR__, 2 ) . '/fixtures/' . $relative;
	}

	public static function read( string $relative ): string {
		$json = file_get_contents( self::path( $relative ) );
		if ( false === $json ) {
			throw new RuntimeException( 'Missing fixture ' . $relative );
		}
		return $json;
	}

	/** Decoded with objects preserved (validator input). */
	public static function object( string $relative ): mixed {
		return json_decode( self::read( $relative ), false, 512, JSON_THROW_ON_ERROR );
	}

	/**
	 * Decoded as associative arrays (resolver/renderer input).
	 *
	 * @return array<string, mixed>
	 */
	public static function assoc( string $relative ): array {
		$value = json_decode( self::read( $relative ), true, 512, JSON_THROW_ON_ERROR );
		if ( ! is_array( $value ) ) {
			throw new RuntimeException( 'Fixture is not an object: ' . $relative );
		}
		return $value;
	}

	/**
	 * Applies `set`/`remove` operations at JSON pointers to an object tree.
	 *
	 * @param list<stdClass> $ops Operations.
	 */
	public static function patch( mixed $document, array $ops ): mixed {
		foreach ( $ops as $op ) {
			$value = property_exists( $op, 'value' ) ? self::expand( $op->value ) : null;
			if ( '' === $op->path ) {
				$document = $value;
				continue;
			}
			$segments = array_slice( explode( '/', $op->path ), 1 );
			$last     = (string) array_pop( $segments );
			$target   = &$document;
			foreach ( $segments as $segment ) {
				if ( is_array( $target ) ) {
					$target = &$target[ (int) $segment ];
				} else {
					$target = &$target->$segment;
				}
			}
			if ( 'remove' === $op->op ) {
				if ( is_array( $target ) ) {
					array_splice( $target, (int) $last, 1 );
				} else {
					unset( $target->$last );
				}
			} elseif ( is_array( $target ) ) {
				$target[ (int) $last ] = $value;
			} else {
				$target->$last = $value;
			}
			unset( $target );
		}
		return $document;
	}

	private static function expand( mixed $value ): mixed {
		if ( $value instanceof stdClass && array( 'repeat', 'times' ) === array_keys( get_object_vars( $value ) ) ) {
			return str_repeat( (string) $value->repeat, (int) $value->times );
		}
		return $value;
	}
}

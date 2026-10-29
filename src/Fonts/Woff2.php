<?php
/**
 * WOFF2 container check.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Fonts;

/**
 * Minimal structural check of a WOFF2 file (CODE-STYLE 10.8): signature `wOF2` and the length
 * field of the header equal to the actual size. File extension and Content-Type are never
 * trusted. This is not a font engine; browsers still decode the file themselves.
 */
final class Woff2 {

	public const MAX_BYTES = 2097152;

	public static function is_valid( string $bytes ): bool {
		$size = strlen( $bytes );
		if ( $size < 48 || $size > self::MAX_BYTES || 'wOF2' !== substr( $bytes, 0, 4 ) ) {
			return false;
		}
		$header = unpack( 'Nlength', substr( $bytes, 8, 4 ) );
		return is_array( $header ) && $header['length'] === $size;
	}
}

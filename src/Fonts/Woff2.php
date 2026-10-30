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

	public const MAX_BYTES = \SW\Slider\Domain\Limits::FONT_FILE_BYTES;

	public static function is_valid( string $bytes ): bool {
		$size = strlen( $bytes );
		if ( $size < 48 || $size > self::MAX_BYTES || 'wOF2' !== substr( $bytes, 0, 4 ) ) {
			return false;
		}
		$header = unpack( 'Nlength', substr( $bytes, 8, 4 ) );
		return is_array( $header ) && $header['length'] === $size;
	}
	/** Structural static-font check; Brotli/outline decoding remains the browser's responsibility.
	 * Source: https://www.w3.org/TR/WOFF2/#table_dir_format
	 */
	public static function is_static( string $bytes ): bool {
		if ( ! self::is_valid( $bytes ) || ! in_array( substr( $bytes, 4, 4 ), array( "\x00\x01\x00\x00", 'OTTO' ), true ) ) {
			return false;
		}
		$header = unpack( 'ncount/nreserved/Nsfnt/Ncompressed', substr( $bytes, 12, 12 ) );
		if ( false === $header || $header['count'] < 1 || $header['count'] > 256 || 0 !== $header['reserved'] || $header['sfnt'] > \SW\Slider\Domain\Limits::FONT_JOB_BYTES || $header['compressed'] < 1 ) {
			return false;
		}
		$offset = 48;
		$seen   = array();
		for ( $index = 0; $index < $header['count']; ++$index ) {
			if ( $offset >= strlen( $bytes ) ) {
				return false;
			}
			$flag      = ord( $bytes[ $offset++ ] );
			$tag_index = $flag & 63;
			$version   = $flag >> 6;
			$tag       = (string) $tag_index;
			if ( 63 === $tag_index ) {
				$tag     = substr( $bytes, $offset, 4 );
				$offset += 4;
				if ( 4 !== strlen( $tag ) ) {
					return false;
				}
			}
			if ( in_array( $tag, array( '39', '43', '47', '48', 'fvar', 'gvar', 'avar', 'cvar', 'HVAR', 'MVAR', 'VVAR' ), true ) || isset( $seen[ 'tag:' . $tag ] ) ) {
				return false;
			}
			$seen[ 'tag:' . $tag ] = true;
			$original              = self::base128( $bytes, $offset );
			if ( null === $original || $original > \SW\Slider\Domain\Limits::FONT_JOB_BYTES ) {
				return false;
			}
			$glyf = in_array( $tag, array( '10', '11', 'glyf', 'loca' ), true );
			if ( $glyf ? ! in_array( $version, array( 0, 3 ), true ) : ( 0 !== $version && ! ( in_array( $tag, array( '3', 'hmtx' ), true ) && 1 === $version ) ) ) {
				return false;
			}
			if ( ( $glyf && 0 === $version ) || ( ! $glyf && 0 !== $version ) ) {
				if ( null === self::base128( $bytes, $offset ) ) {
					return false;
				}
			}
		}
		return $offset + $header['compressed'] <= strlen( $bytes ) && ( isset( $seen['tag:0'] ) || isset( $seen['tag:cmap'] ) ) && ( isset( $seen['tag:1'] ) || isset( $seen['tag:head'] ) );
	}

	private static function base128( string $bytes, int &$offset ): ?int {
		$value = 0;
		for ( $index = 0; $index < 5; ++$index ) {
			if ( $offset >= strlen( $bytes ) ) {
				return null;
			}
			$byte = ord( $bytes[ $offset++ ] );
			if ( ( 0 === $index && 128 === $byte ) || $value > 33554431 ) {
				return null;
			}
			$value = ( $value << 7 ) | ( $byte & 127 );
			if ( 0 === ( $byte & 128 ) ) {
				return $value;
			}
		}
		return null;
	}
}

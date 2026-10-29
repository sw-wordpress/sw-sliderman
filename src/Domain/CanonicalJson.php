<?php
/**
 * Storage encoding of slider documents.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Domain;

use JsonException;
use stdClass;

/**
 * Canonical JSON encoding used for post_content, revisions and published snapshots.
 *
 * WordPress save filters may touch post_content (KSES for users without `unfiltered_html`,
 * emoji encoding on utf8 tables, `wp_kses_no_null()` removing backslash-zero sequences). The
 * encoding is therefore pure ASCII without `<`, `>`, `&`, quotes inside strings, and without any
 * backslash followed by a digit: every escaped backslash is written as `\` (CODE-STYLE 8.2).
 * The round trip is covered by unit tests and by the WordPress integration tests.
 */
final class CanonicalJson {

	private const FLAGS = JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR;

	/**
	 * Encodes a decoded document tree.
	 *
	 * @param mixed $value Tree from json_decode( $json, false ).
	 * @throws JsonException When the value cannot be encoded.
	 */
	public static function encode( mixed $value ): string {
		// The domain layer is WordPress-free (CODE-STYLE 3.1); wp_json_encode() is not available here.
		$json = json_encode( $value, self::FLAGS, 64 ); // phpcs:ignore WordPress.WP.AlternativeFunctions.json_encode_json_encode
		return self::escape_backslashes( $json );
	}

	/**
	 * Replaces every escaped backslash (`\\`) by `\`; all other escapes are kept.
	 */
	private static function escape_backslashes( string $json ): string {
		$out    = '';
		$length = strlen( $json );
		for ( $i = 0; $i < $length; $i++ ) {
			$char = $json[ $i ];
			if ( '\\' !== $char ) {
				$out .= $char;
				continue;
			}
			$next = $json[ $i + 1 ] ?? '';
			$out .= '\\' === $next ? '\\u005c' : '\\' . $next;
			++$i;
		}
		return $out;
	}

	/**
	 * Decodes stored JSON keeping objects (validator input).
	 *
	 * @throws JsonException When the JSON is malformed.
	 */
	public static function decode_tree( string $json ): mixed {
		return json_decode( $json, false, 64, JSON_THROW_ON_ERROR );
	}

	/**
	 * Decodes stored JSON as associative arrays (renderer input).
	 *
	 * @return array<string, mixed>
	 * @throws JsonException When the JSON is malformed or not an object.
	 */
	public static function decode_assoc( string $json ): array {
		$value = json_decode( $json, true, 64, JSON_THROW_ON_ERROR );
		if ( ! is_array( $value ) ) {
			throw new JsonException( 'Document is not an object.' );
		}
		return $value;
	}

	public static function hash( string $canonical_json ): string {
		return hash( 'sha256', $canonical_json );
	}

	/** Whether a decoded value is an object node. */
	public static function is_object( mixed $value ): bool {
		return $value instanceof stdClass;
	}
}

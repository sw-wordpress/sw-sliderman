<?php
/**
 * Request body decoding.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Rest;

use stdClass;
use SW\Slider\Domain\Limits;
use WP_Error;
use WP_REST_Request;

/**
 * Decodes the raw JSON body with objects preserved, so `{}` and `[]` stay distinguishable for the
 * validator. REST JSON is not slashed, therefore no `wp_unslash()` (CODE-STYLE 6.1).
 */
final class JsonBody {

	/** Body limit: document plus a small envelope. */
	public const MAX_BYTES = Limits::DOCUMENT_BYTES + 4096;

	public static function decode( WP_REST_Request $request ): stdClass|WP_Error {
		$body = $request->get_body();
		if ( strlen( $body ) > self::MAX_BYTES ) {
			return new WP_Error( 'sws_too_large', __( 'The slider is too large.', 'sw-sliderman' ), array( 'status' => 413 ) );
		}
		$decoded = json_decode( $body, false, 64 );
		if ( ! $decoded instanceof stdClass ) {
			return new WP_Error( 'sws_bad_request', __( 'The request body is not a JSON object.', 'sw-sliderman' ), array( 'status' => 400 ) );
		}
		return $decoded;
	}

	/** Plain text title, at most 200 characters. */
	public static function title( mixed $value ): string|WP_Error {
		if ( ! is_string( $value ) ) {
			return new WP_Error( 'sws_bad_request', __( 'The title must be text.', 'sw-sliderman' ), array( 'status' => 400 ) );
		}
		$title = trim( sanitize_text_field( $value ) );
		if ( '' === $title || mb_strlen( $title ) > 200 ) {
			return new WP_Error( 'sws_invalid_title', __( 'Please enter a name with at most 200 characters.', 'sw-sliderman' ), array( 'status' => 422 ) );
		}
		return $title;
	}

	/** Strict positive integer (no "12abc", no floats, no strings). */
	public static function version( mixed $value ): int|WP_Error {
		if ( ! is_int( $value ) || $value < 1 ) {
			return new WP_Error( 'sws_bad_request', __( 'The version is missing or invalid.', 'sw-sliderman' ), array( 'status' => 400 ) );
		}
		return $value;
	}
}

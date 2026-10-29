<?php
/**
 * WordPress HTTP API adapter.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Fonts;

/**
 * Uses the Safe HTTP API (`wp_safe_remote_get`) with redirects disabled, TLS verification and a
 * response size limit. The Safe HTTP API is an additional layer, not a replacement for
 * DownloadPolicy.
 */
final class WpHttpClient implements HttpClient {

	public function get( string $url, int $max_bytes, int $timeout_seconds, array $headers = array() ): array {
		$response = wp_safe_remote_get(
			$url,
			array(
				'timeout'             => $timeout_seconds,
				'redirection'         => 0,
				'sslverify'           => true,
				'reject_unsafe_urls'  => true,
				'limit_response_size' => $max_bytes + 1,
				'headers'             => $headers,
			)
		);
		if ( is_wp_error( $response ) ) {
			throw new FontError( 'sws_font_network', $response->get_error_message() );
		}
		$body = (string) wp_remote_retrieve_body( $response );
		return array(
			'status'    => (int) wp_remote_retrieve_response_code( $response ),
			'body'      => $body,
			'location'  => self::first_header( wp_remote_retrieve_header( $response, 'location' ) ),
			'truncated' => strlen( $body ) > $max_bytes,
		);
	}

	/**
	 * @param string|array<int, string> $value Header value (repeated headers arrive as array).
	 */
	private static function first_header( string|array $value ): string {
		return is_array( $value ) ? (string) reset( $value ) : $value;
	}
}

<?php
/**
 * Test double.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Tests\Support;

use SW\Slider\Fonts\FontError;
use SW\Slider\Fonts\FontRepository;
use SW\Slider\Fonts\FontStorage;
use SW\Slider\Fonts\HttpClient;

/** Scripted HTTP client: URL => response or exception. */
final class FakeHttp implements HttpClient {

	/** @var array<string, array{status: int, body: string, location?: string}|FontError> */
	public array $routes = array();

	/** @var list<string> */
	public array $requested = array();

	public function get( string $url, int $max_bytes, int $timeout_seconds, array $headers = array() ): array {
		$this->requested[] = $url;
		$route             = $this->routes[ $url ] ?? array(
			'status' => 404,
			'body'   => '',
		);
		if ( $route instanceof FontError ) {
			throw $route;
		}
		return array(
			'status'    => $route['status'],
			'body'      => substr( $route['body'], 0, $max_bytes + 1 ),
			'location'  => $route['location'] ?? '',
			'truncated' => strlen( $route['body'] ) > $max_bytes,
		);
	}

	/** Structurally valid WOFF2 container (not a usable font; no third-party font data). */
	public static function woff2( string $seed ): string {
		$compressed = str_repeat( $seed . '-', 40 );
		$body       = 'wOF2' . "\x00\x01\x00\x00" . pack( 'NnnNN', 0, 2, 0, 72, strlen( $compressed ) ) . str_repeat( "\0", 24 ) . "\x00\x01\x01\x01" . $compressed;
		return substr_replace( $body, pack( 'N', strlen( $body ) ), 8, 4 );
	}
}

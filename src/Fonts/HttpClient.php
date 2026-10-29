<?php
/**
 * Outbound HTTP port for font downloads.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Fonts;

/**
 * Minimal GET client. Implementations must not follow redirects themselves (the provider checks
 * every target against DownloadPolicy), must verify TLS certificates and must stop reading after
 * `$max_bytes`.
 */
interface HttpClient {

	/**
	 * @param array<string, string> $headers Request headers.
	 * @return array{status: int, body: string, location: string, truncated: bool}
	 * @throws FontError On transport errors.
	 */
	public function get( string $url, int $max_bytes, int $timeout_seconds, array $headers = array() ): array;
}

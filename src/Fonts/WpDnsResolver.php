<?php
/**
 * Resolve all address families before server-side downloads.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Fonts;

/** No A-only validation while the transport may choose an AAAA address. */
final class WpDnsResolver {
	/** @return list<string> All resolved A/AAAA addresses or an empty list on DNS failure. */
	public static function resolve( string $host ): array {
		if ( ! function_exists( 'dns_get_record' ) ) {
			return array();
		}
		set_error_handler( static fn (): bool => true, E_WARNING );
		try {
			$records = dns_get_record( $host, DNS_A | DNS_AAAA );
		} finally {
			restore_error_handler();
		}
		if ( false === $records ) {
			return array();
		}
		$addresses = array();
		foreach ( $records as $record ) {
			$address = $record['ip'] ?? $record['ipv6'] ?? null;
			if ( is_string( $address ) ) {
				$addresses[] = $address;
			}
		}
		return array_values( array_unique( $addresses ) );
	}
}

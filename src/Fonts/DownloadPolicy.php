<?php
/**
 * Outbound request policy for font downloads.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Fonts;

use Closure;

/**
 * Decides whether the server may request a URL for a font purpose (CODE-STYLE 10.3-10.5).
 *
 * Only provider-generated HTTPS URLs on known hosts and paths are allowed; ports, user info,
 * query strings (except for the CSS API) and fragments are rejected. Every resolved address of
 * the host must be public: private, loopback, link-local, reserved and cloud metadata ranges are
 * blocked. The same check runs again for every redirect target.
 */
final class DownloadPolicy {

	public const PURPOSE_CSS      = 'css';
	public const PURPOSE_FONT     = 'font';
	public const PURPOSE_LICENSE  = 'license';
	public const PURPOSE_METADATA = 'metadata';

	private const RULES = array(
		self::PURPOSE_METADATA => array( 'raw.githubusercontent.com', '~\A/google/fonts/main/(?:ofl|ufl|apache)/[a-z0-9]+/METADATA\.pb\z~', false ),
		self::PURPOSE_CSS      => array( 'fonts.googleapis.com', '~\A/css2\z~', true ),
		self::PURPOSE_FONT     => array( 'fonts.gstatic.com', '~\A/s/[a-z0-9]+/v\d+/[A-Za-z0-9_-]+\.woff2\z~', false ),
		self::PURPOSE_LICENSE  => array( 'raw.githubusercontent.com', '~\A/google/fonts/main/(?:ofl|ufl|apache)/[a-z0-9]+/(?:OFL|UFL|LICENSE)\.txt\z~', false ),
	);

	/**
	 * @param Closure(string): list<string> $resolve Returns all IP addresses of a host name.
	 */
	public function __construct( private readonly Closure $resolve ) {
	}

	/**
	 * @throws FontError When the URL is not allowed.
	 */
	public function assert_allowed( string $url, string $purpose ): void {
		$rule  = self::RULES[ $purpose ] ?? null;
		$parts = parse_url( $url ); // phpcs:ignore WordPress.WP.AlternativeFunctions.parse_url_parse_url -- WordPress-free policy class; PHP 8.2+ parses consistently.
		if ( null === $rule || false === $parts || 'https' !== ( $parts['scheme'] ?? '' ) || isset( $parts['port'] ) || isset( $parts['user'] ) || isset( $parts['pass'] ) || isset( $parts['fragment'] ) ) {
			throw new FontError( 'sws_font_url_rejected' );
		}
		[ $host, $path_pattern, $query_allowed ] = $rule;
		if ( strtolower( (string) ( $parts['host'] ?? '' ) ) !== $host || 1 !== preg_match( $path_pattern, (string) ( $parts['path'] ?? '' ) ) ) {
			throw new FontError( 'sws_font_url_rejected' );
		}
		if ( isset( $parts['query'] ) && ! $query_allowed ) {
			throw new FontError( 'sws_font_url_rejected' );
		}
		$addresses = ( $this->resolve )( $host );
		if ( array() === $addresses ) {
			throw new FontError( 'sws_font_dns_failed' );
		}
		foreach ( $addresses as $address ) {
			if ( ! self::is_public_ip( $address ) ) {
				throw new FontError( 'sws_font_url_rejected' );
			}
		}
	}

	/** Public unicast address (no private, loopback, link-local, reserved or metadata range). */
	public static function is_public_ip( string $address ): bool {
		if ( false === filter_var( $address, FILTER_VALIDATE_IP ) ) {
			return false;
		}
		if ( false === filter_var( $address, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE ) ) {
			return false;
		}
		$lower = strtolower( $address );
		// Ranges not covered by the filter flags on every PHP version: CGNAT, IPv6 ULA/link-local, mapped IPv4.
		$blocked = array( '100.64.', '169.254.', '0.', 'fc', 'fd', 'fe80', '::ffff:', '64:ff9b:' );
		foreach ( $blocked as $prefix ) {
			if ( str_starts_with( $lower, $prefix ) ) {
				return false;
			}
		}
		if ( str_starts_with( $lower, '100.' ) ) {
			$second = (int) explode( '.', $lower )[1];
			if ( $second >= 64 && $second <= 127 ) {
				return false;
			}
		}
		return true;
	}
}

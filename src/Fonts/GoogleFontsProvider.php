<?php
/**
 * Google Fonts provider adapter.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Fonts;

/**
 * Resolves static WOFF2 files through the Google Fonts CSS2 API and downloads files and license
 * texts (PLAN.md 8.2, ADR docs/adr/0002-font-provider.md).
 *
 * Every request target, including redirect targets, passes DownloadPolicy. The CSS response is
 * only parsed, never stored. Requested variants must be present exactly; families whose weights
 * resolve to one shared (variable) file are rejected in 1.0.
 *
 * @phpstan-import-type Family from FontCatalog
 */
final class GoogleFontsProvider implements FontProvider {

	/** A current browser user agent; the CSS2 API selects the WOFF2 format by user agent. */
	public const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

	private const CSS_MAX_BYTES     = 262144;
	private const LICENSE_MAX_BYTES = 131072;
	private const TIMEOUT_SECONDS   = 15;
	private const MAX_REDIRECTS     = 2;

	public function __construct(
		private readonly HttpClient $http,
		private readonly DownloadPolicy $policy,
		private readonly FontFaceParser $parser
	) {
	}

	/**
	 * CSS2 API URL for the requested variants.
	 *
	 * @param Family                                  $family   Catalog family.
	 * @param list<array{weight: int, style: string}> $variants Requested variants.
	 */
	public static function css_url( array $family, array $variants ): string {
		$tuples = array();
		foreach ( $variants as $variant ) {
			$tuples[] = ( 'italic' === $variant['style'] ? 1 : 0 ) . ',' . (int) $variant['weight'];
		}
		usort(
			$tuples,
			static function ( string $a, string $b ): int {
				return array_map( 'intval', explode( ',', $a ) ) <=> array_map( 'intval', explode( ',', $b ) );
			}
		);
		return 'https://fonts.googleapis.com/css2?family=' . str_replace( '%20', '+', rawurlencode( $family['family'] ) ) . ':ital,wght@' . implode( ';', array_unique( $tuples ) ) . '&display=swap';
	}

	/**
	 * Resolves the WOFF2 files of the requested variants and subsets.
	 *
	 * @param Family                                  $family   Catalog family.
	 * @param list<array{weight: int, style: string}> $variants Requested variants (validated against the catalog).
	 * @param list<string>                            $subsets  Requested subsets (validated against the catalog).
	 * @return list<FontFace>
	 * @throws FontError When the response is unusable or a variant is missing.
	 */
	public function resolve( array $family, array $variants, array $subsets ): array {
		$css   = $this->fetch( self::css_url( $family, $variants ), DownloadPolicy::PURPOSE_CSS, self::CSS_MAX_BYTES, array( 'User-Agent' => self::USER_AGENT ) );
		$faces = array_values(
			array_filter(
				$this->parser->parse( $css ),
				static fn ( FontFace $face ): bool => in_array( $face->subset, $subsets, true )
			)
		);
		foreach ( $faces as $face ) {
			if ( $face->family !== $family['family'] ) {
				throw new FontError( 'sws_font_css_unexpected' );
			}
		}
		foreach ( $variants as $variant ) {
			foreach ( $subsets as $subset ) {
				$matches = array_filter(
					$faces,
					static fn ( FontFace $face ): bool => $face->weight === $variant['weight'] && $face->style === $variant['style'] && $face->subset === $subset
				);
				if ( 1 !== count( $matches ) ) {
					throw new FontError( 'sws_font_variant_unavailable' );
				}
			}
		}
		$this->assert_static( $faces );
		return $faces;
	}

	/**
	 * Different weights of one style and subset sharing a file mean a variable font.
	 *
	 * @param list<FontFace> $faces Resolved faces.
	 * @throws FontError For variable-only families.
	 */
	private function assert_static( array $faces ): void {
		$seen = array();
		foreach ( $faces as $face ) {
			$key = $face->style . '|' . $face->subset . '|' . $face->url;
			if ( isset( $seen[ $key ] ) && $seen[ $key ] !== $face->weight ) {
				throw new FontError( 'sws_font_variable_unsupported' );
			}
			$seen[ $key ] = $face->weight;
		}
	}

	/**
	 * Downloads and verifies one WOFF2 file.
	 *
	 * @throws FontError When the download fails or the file is not WOFF2.
	 */
	public function download_font( string $url ): string {
		$bytes = $this->fetch( $url, DownloadPolicy::PURPOSE_FONT, Woff2::MAX_BYTES );
		if ( ! Woff2::is_static( $bytes ) ) {
			throw new FontError( 'sws_font_invalid_file' );
		}
		return $bytes;
	}

	/**
	 * Downloads the license text of a catalog family.
	 *
	 * @throws FontError When the license is unavailable or implausible.
	 */
	public function download_license( string $license_path ): string {
		$text = $this->fetch( 'https://raw.githubusercontent.com/google/fonts/main/' . $license_path, DownloadPolicy::PURPOSE_LICENSE, self::LICENSE_MAX_BYTES );
		if ( 1 !== preg_match( '//u', $text ) || 1 !== preg_match( '/licen[cs]e/i', $text ) ) {
			throw new FontError( 'sws_font_license_missing' );
		}
		return $text;
	}

	public function metadata( string $license_path ): string {
		$path = dirname( $license_path ) . '/METADATA.pb';
		return $this->fetch( 'https://raw.githubusercontent.com/google/fonts/main/' . $path, DownloadPolicy::PURPOSE_METADATA, self::CSS_MAX_BYTES );
	}

	/**
	 * GET with policy check on the URL and on every redirect target.
	 *
	 * @param array<string, string> $headers Request headers.
	 * @throws FontError On policy, transport, status or size errors.
	 */
	private function fetch( string $url, string $purpose, int $max_bytes, array $headers = array() ): string {
		for ( $redirects = 0; $redirects <= self::MAX_REDIRECTS; $redirects++ ) {
			$this->policy->assert_allowed( $url, $purpose );
			$response = $this->http->get( $url, $max_bytes, self::TIMEOUT_SECONDS, $headers );
			if ( in_array( $response['status'], array( 301, 302, 303, 307, 308 ), true ) && '' !== $response['location'] ) {
				$url = $response['location'];
				continue;
			}
			if ( 200 !== $response['status'] ) {
				throw new FontError( 'sws_font_http_status', 'HTTP ' . $response['status'] );
			}
			if ( $response['truncated'] ) {
				throw new FontError( 'sws_font_too_large' );
			}
			return $response['body'];
		}
		throw new FontError( 'sws_font_too_many_redirects' );
	}
}

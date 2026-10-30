<?php
/**
 * Explicit refresh of the curated metadata catalog.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Fonts;

use Closure;
use SW\Slider\Infrastructure\UploadPaths;
/** All families validate before a single local catalog pointer is switched. No font binaries. */
final class CatalogUpdater {
	public const OPTION = 'sws_font_catalog_file';
	public function __construct( private readonly FontCatalog $catalog, private readonly FontInstaller $installer ) {
	}
	public function refresh( Closure $checkpoint ): string {
		$families = array();
		foreach ( $this->catalog->families() as $family ) {
			$checkpoint();
			$text = $this->installer->catalog_metadata( $family['licensePath'] );
			preg_match( '/^name: "([^"\r\n]{1,80})"/m', $text, $name );
			preg_match( '/^license: "([A-Z0-9_-]+)"/m', $text, $license );
			preg_match_all( '/fonts\s*\{[^}]*style: "(normal|italic)"[^}]*weight: (\d+)/s', $text, $variants, PREG_SET_ORDER );
			preg_match_all( '/^subsets: "([a-z-]+)"/m', $text, $subsets );
			if ( ! isset( $name[1], $license[1] ) || $family['license'] !== $license[1] || array() === $variants ) {
				throw new FontError( 'sws_font_catalog_invalid' );
			}
			$checkpoint();
			$this->installer->catalog_license( $family['licensePath'] );
			$styles = array();
			foreach ( $variants as $variant ) {
				$weight = (int) $variant[2];
				if ( $weight < 100 || $weight > 900 || 0 !== $weight % 100 ) {
					throw new FontError( 'sws_font_catalog_invalid' );
				}
				$styles[ $weight . $variant[1] ] = array(
					'weight' => $weight,
					'style'  => $variant[1],
				);
			}
			$family['family']   = $name[1];
			$family['variants'] = array_values( $styles );
			$family['subsets']  = array_values( array_intersect( array( 'latin', 'latin-ext', 'cyrillic', 'cyrillic-ext', 'greek', 'greek-ext', 'vietnamese' ), $subsets[1] ) );
			$family['static']   = 1 !== preg_match( '/\baxes\s*\{/', $text );
			if ( array() === $family['subsets'] ) {
				throw new FontError( 'sws_font_catalog_invalid' );
			}
			$families[] = $family;
		}
		$checkpoint();
		$version = gmdate( 'Y-m-d' ) . '-' . substr( hash( 'sha256', (string) wp_json_encode( $families ) ), 0, 12 );
		$json    = (string) wp_json_encode(
			array(
				'catalogVersion' => $version,
				'families'       => $families,
			),
			JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
		);
		if ( strlen( $json ) > \SW\Slider\Domain\Limits::JOB_BYTES ) {
			throw new FontError( 'sws_font_catalog_invalid' );
		}
		$relative = 'fonts/catalog-' . substr( hash( 'sha256', $json ), 0, 24 ) . '.json';
		$path     = UploadPaths::path( $relative );
		if ( null === $path || ! UploadPaths::ensure_dir( dirname( $path ) ) ) {
			throw new FontError( 'sws_font_storage' );
		}
		$temp = dirname( $path ) . '/.catalog-' . wp_generate_uuid4();
		try {
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- complete bounded catalog in the own uploads directory.
			if ( strlen( $json ) !== file_put_contents( $temp, $json, LOCK_EX ) ) {
				throw new FontError( 'sws_font_storage' );
			}
			// phpcs:ignore WordPress.WP.AlternativeFunctions.rename_rename -- atomic catalog activation.
			if ( ! rename( $temp, $path ) ) {
				throw new FontError( 'sws_font_storage' );
			}
			if ( get_option( self::OPTION ) !== $relative && false === update_option( self::OPTION, $relative, false ) ) {
				throw new FontError( 'sws_font_storage' );
			}
			return $version;
		} finally {
			if ( is_file( $temp ) ) {
				wp_delete_file( $temp );
			}
		}
	}
}

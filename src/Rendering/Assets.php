<?php
/**
 * Frontend asset loading.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Rendering;

use JsonException;
use SW\Slider\Application\PublishedSnapshot;
use SW\Slider\Application\SliderRepository;
use SW\Slider\Domain\CanonicalJson;
use SW\Slider\Fonts\FontRepository;
use SW\Slider\Infrastructure\UploadPaths;

/**
 * Loads runtime, slider stylesheet and local font stylesheets only where a slider is rendered
 * (PLAN.md 11).
 *
 * Sliders found early (shortcode in the queried post) are prepared in `<head>`. For late
 * embeddings (templates, widgets) the styles are printed directly before the slider markup, so
 * the static first slide is never shown unstyled. Font URLs are built from the uploads base on
 * every request and are always same-origin files of this site; no external font host is used.
 */
final class Assets {

	public const RUNTIME = 'sws-runtime';

	/** @var array<string, true> Style handles already printed or enqueued. */
	private array $used = array();
	/** @var list<array<string,mixed>> One conservative start-slide font preload. */
	private array $font_preloads = array();

	public function __construct(
		private readonly SliderRepository $sliders,
		private readonly FontRepository $fonts,
		private readonly string $plugin_url,
		private readonly string $plugin_dir,
		private readonly string $version
	) {
	}

	public function register(): void {
		add_action( 'wp_enqueue_scripts', array( $this, 'register_runtime' ), 5 );
		add_action( 'admin_enqueue_scripts', array( $this, 'register_runtime' ), 5 );
		add_action( 'wp', array( $this, 'prepare_queried_post' ) );
		add_filter( 'wp_preload_resources', array( $this, 'preloads' ) );
	}

	public function register_runtime(): void {
		$version = $this->asset_version( 'build/runtime/runtime.js' );
		wp_register_style( self::RUNTIME, $this->plugin_url . 'build/runtime/runtime.css', array(), $version );
		wp_register_script(
			self::RUNTIME,
			$this->plugin_url . 'build/runtime/runtime.js',
			array(),
			$version,
			array(
				'in_footer' => true,
				'strategy'  => 'defer',
			)
		);
	}

	/**
	 * @param list<array<string,mixed>> $resources WordPress preload list.
	 * @return list<array<string,mixed>> */
	public function preloads( array $resources ): array {
		return array_merge( $resources, $this->font_preloads );
	}

	private function asset_version( string $relative ): string {
		$file = $this->plugin_dir . $relative;
		return is_readable( $file ) ? $this->version . '-' . filemtime( $file ) : $this->version;
	}

	/** Prepares sliders of a shortcode in the main queried post before `<head>` is printed. */
	public function prepare_queried_post(): void {
		if ( is_admin() || ! is_singular() ) {
			return;
		}
		$post = get_queried_object();
		if ( ! $post instanceof \WP_Post || ! has_shortcode( $post->post_content, Shortcode::TAG ) ) {
			return;
		}
		preg_match_all( '/' . get_shortcode_regex( array( Shortcode::TAG ) ) . '/', $post->post_content, $matches, PREG_SET_ORDER );
		foreach ( $matches as $match ) {
			$attributes = shortcode_parse_atts( $match[3] );
			$id         = isset( $attributes['id'] ) && ctype_digit( (string) $attributes['id'] ) ? (int) $attributes['id'] : 0;
			$published  = $id > 0 ? $this->sliders->find( $id )?->published : null;
			if ( null === $published ) {
				continue;
			}
			try {
				$this->enqueue( $published, CanonicalJson::decode_assoc( $published->document_json ), substr( $published->document_hash, 0, 12 ) );
			} catch ( JsonException ) {
				continue;
			}
		}
	}

	/**
	 * Ensures every asset of a slider is loaded.
	 *
	 * @param array<string, mixed> $document Published document.
	 *
	 * @return string Style markup to print before the slider when `<head>` was already sent, else ''.
	 */
	public function use_slider( PublishedSnapshot $published, array $document, string $scope ): string {
		$handles = $this->enqueue( $published, $document, $scope );
		if ( ! did_action( 'wp_head' ) || array() === $handles ) {
			return '';
		}
		ob_start();
		wp_print_styles( $handles );
		return (string) ob_get_clean();
	}

	/**
	 * Enqueues runtime, slider and font styles; returns the style handles not yet used.
	 *
	 * @param array<string, mixed> $document Published document.
	 *
	 * @return list<string>
	 */
	private function enqueue( PublishedSnapshot $published, array $document, string $scope ): array {
		if ( ! wp_script_is( self::RUNTIME, 'registered' ) ) {
			$this->register_runtime();
		}
		wp_enqueue_script( self::RUNTIME );
		$handles = array( self::RUNTIME );

		$handle = 'sws-slider-' . $scope;
		if ( ! wp_style_is( $handle, 'registered' ) ) {
			$url  = null === $published->stylesheet ? null : UploadPaths::url( $published->stylesheet );
			$path = null === $published->stylesheet ? null : UploadPaths::path( $published->stylesheet );
			if ( null !== $url && null !== $path && is_readable( $path ) ) {
				// Content-addressed, immutable file name: no version query string needed.
				wp_register_style( $handle, $url, array( self::RUNTIME ), null ); // phpcs:ignore WordPress.WP.EnqueuedResourceParameters.MissingVersion
			} else {
				// Artifact missing (not writable, deleted, migrated site): safe recalculation.
				wp_register_style( $handle, false, array( self::RUNTIME ), $this->version );
				wp_add_inline_style( $handle, StyleSerializer::document_css( $document, $scope ) );
			}
		}
		$handles[] = $handle;

		$references = array_column( $document['fontRefs'], null, 'id' );
		$used_refs  = array();
		$first_ref  = null;
		foreach ( $document['slides'] as $slide ) {
			if ( ! $slide['enabled'] ) {
				continue;
			}
			foreach ( $slide['layers'] as $layer ) {
				if ( null !== $layer['style']['fontRef'] && 'image' !== $layer['type'] ) {
					$used_refs[ $layer['style']['fontRef'] ] = true;
				}
			}
			if ( null === $first_ref ) {
				foreach ( $slide['layers'] as $layer ) {
					if ( 'image' !== $layer['type'] && $layer['layout']['visible'] && null !== $layer['style']['fontRef'] ) {
						$first_ref = $layer['style']['fontRef'];
						break;
					}
				}
			}
			// Only the first enabled slide is eligible for preload.
			if ( null === $first_ref ) {
				$first_ref = '';
			}
		}
		foreach ( array_keys( $used_refs ) as $id ) {
			$ref          = $references[ $id ] ?? null;
			$installation = null === $ref ? null : $this->fonts->find( $ref['installationId'] );
			if ( null === $ref || null === $installation || null === UploadPaths::local_font_url( $installation['stylesheet'] ) ) {
				continue;
			}
			$variants    = array_values( array_filter( $installation['variants'], static fn ( array $variant ): bool => $variant['weight'] === $ref['weight'] && $variant['style'] === $ref['style'] ) );
			$font_handle = 'sws-font-' . $installation['id'] . '-' . $ref['weight'] . '-' . $ref['style'];
			if ( ! wp_style_is( $font_handle, 'registered' ) ) {
				$css = \SW\Slider\Fonts\LocalFontCss::build(
					'sws-' . $installation['id'],
					$variants,
					static function ( string $file ) use ( $installation ): ?string {
						$path = UploadPaths::path( $installation['directory'] . '/' . $file );
						return null !== $path && is_readable( $path ) ? UploadPaths::local_font_url( $installation['directory'] . '/' . $file ) : null;
					}
				);
				wp_register_style( $font_handle, false, array(), $this->version );
				wp_add_inline_style( $font_handle, $css );
			}
			$handles[] = $font_handle;
			if ( $id === $first_ref && array() === $this->font_preloads ) {
				foreach ( $variants as $variant ) {
					foreach ( $variant['files'] as $file ) {
						if ( 'latin' !== $file['subset'] ) {
							continue;
						}
						$url  = UploadPaths::local_font_url( $installation['directory'] . '/' . $file['file'] );
						$path = UploadPaths::path( $installation['directory'] . '/' . $file['file'] );
						if ( null !== $url && null !== $path && is_readable( $path ) ) {
							$this->font_preloads[] = array(
								'href'        => $url,
								'as'          => 'font',
								'type'        => 'font/woff2',
								'crossorigin' => 'anonymous',
							);
							break 2;
						}
					}
				}
			}
		}

		$new = array();
		foreach ( $handles as $style ) {
			wp_enqueue_style( $style );
			if ( ! isset( $this->used[ $style ] ) ) {
				$this->used[ $style ] = true;
				$new[]                = $style;
			}
		}
		return $new;
	}
}

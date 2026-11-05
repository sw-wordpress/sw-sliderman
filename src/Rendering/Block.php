<?php
/**
 * Gutenberg block and template function.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Rendering;

/**
 * Dynamic block `sw-sliderman/slider` and the `sws_render_slider_html` filter behind the
 * template helper `sws_render_slider()`. Both use the same renderer as the shortcode (PLAN.md 11).
 */
final class Block {

	public const NAME   = 'sw-sliderman/slider';
	public const FILTER = 'sws_render_slider_html';

	public function __construct( private readonly SliderRenderer $renderer, private readonly string $plugin_dir ) {
	}

	public function register(): void {
		add_action( 'init', array( $this, 'register_block' ) );
		add_filter( self::FILTER, array( $this, 'filter' ), 10, 2 );
	}

	/**
	 * Directory with `block.json`: the shipped `build/block` (the release ZIP contains no `assets/`),
	 * or the sources in `assets/block` in a checkout that was not built yet.
	 */
	public function directory(): ?string {
		foreach ( array( 'build/block', 'assets/block' ) as $relative ) {
			if ( is_readable( $this->plugin_dir . $relative . '/block.json' ) ) {
				return $this->plugin_dir . $relative;
			}
		}
		return null;
	}

	public function register_block(): void {
		$directory = $this->directory();
		if ( null === $directory ) {
			return;
		}
		$type = register_block_type(
			$directory,
			array( 'render_callback' => array( $this, 'render' ) )
		);
		if ( $type instanceof \WP_Block_Type && array() !== $type->editor_script_handles ) {
			wp_add_inline_script(
				$type->editor_script_handles[0],
				'window.swsBlockStrings=' . wp_json_encode( self::strings(), JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT ) . ';',
				'before'
			);
		}
	}

	/**
	 * Translated editor texts (also the source of the block.json title/description translations).
	 *
	 * @return array<string, string>
	 */
	public static function strings(): array {
		return array(
			'title'        => __( 'SW SliderMan', 'sw-sliderman' ),
			'description'  => __( 'Displays a published SW SliderMan slider.', 'sw-sliderman' ),
			'slider'       => __( 'Slider', 'sw-sliderman' ),
			'select'       => __( 'Select a slider.', 'sw-sliderman' ),
			'choose'       => __( '— Select a slider —', 'sw-sliderman' ),
			'notPublished' => __( 'not published', 'sw-sliderman' ),
			/* translators: %s: slider title. */
			'published'    => __( 'Published slider: %s', 'sw-sliderman' ),
			'unpublished'  => __( 'This slider is not published yet; visitors see nothing.', 'sw-sliderman' ),
			'missing'      => __( 'The selected slider was not found.', 'sw-sliderman' ),
			'loadFailed'   => __( 'The slider list could not be loaded. The saved slider ID stays unchanged.', 'sw-sliderman' ),
		);
	}

	/**
	 * @param array<string, mixed> $attributes Block attributes.
	 */
	public function render( array $attributes ): string {
		$id = $attributes['sliderId'] ?? 0;
		return $this->renderer->render( is_int( $id ) && $id > 0 ? $id : 0 );
	}

	/**
	 * @param mixed $html      Previous filter value (ignored).
	 * @param mixed $slider_id Slider ID.
	 */
	public function filter( mixed $html, mixed $slider_id ): string {
		unset( $html );
		return $this->renderer->render( is_int( $slider_id ) && $slider_id > 0 ? $slider_id : 0 );
	}
}

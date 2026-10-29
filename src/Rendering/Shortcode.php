<?php
/**
 * Shortcode integration.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Rendering;

/**
 * `[sw_slider id="123"]` uses the same renderer as the block (M4) and `sws_render_slider()`.
 */
final class Shortcode {

	public const TAG = 'sw_slider';

	public function __construct( private readonly SliderRenderer $renderer ) {
	}

	public function register(): void {
		add_shortcode( self::TAG, array( $this, 'render' ) );
	}

	/**
	 * @param array<string, string>|string $attributes Shortcode attributes.
	 */
	public function render( array|string $attributes = array() ): string {
		$attributes = shortcode_atts( array( 'id' => '' ), is_array( $attributes ) ? $attributes : array(), self::TAG );
		$id         = (string) $attributes['id'];
		// Only plain positive integers; "12abc" or "-1" are not silently turned into an ID.
		if ( 1 !== preg_match( '/\A[1-9][0-9]{0,18}\z/', $id ) ) {
			return $this->renderer->render( 0 );
		}
		return $this->renderer->render( (int) $id );
	}
}

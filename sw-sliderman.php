<?php
/**
 * Plugin Name:       SW Sliderman
 * Description:       Responsive layer slider with a visual editor, container-based mobile layouts and locally hosted Google Fonts.
 * Version:           0.1.0
 * Requires at least: 6.6
 * Update URI:        https://github.com/sw-wordpress/sw-sliderman
 * Requires PHP:      8.2
 * Author:            sw-wordpress
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       sw-sliderman
 * Domain Path:       /languages
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

defined( 'ABSPATH' ) || exit;

define( 'SWS_VERSION', '0.1.0' );
define( 'SWS_FILE', __FILE__ );
define( 'SWS_DIR', plugin_dir_path( __FILE__ ) );
define( 'SWS_URL', plugin_dir_url( __FILE__ ) );
define( 'SWS_MIN_PHP', '8.2' );

if ( version_compare( PHP_VERSION, SWS_MIN_PHP, '<' ) ) {
	add_action(
		'admin_notices',
		static function (): void {
			printf(
				'<div class="notice notice-error"><p>%s</p></div>',
				esc_html(
					sprintf(
						/* translators: 1: required PHP version, 2: current PHP version */
						__( 'SW Sliderman requires PHP %1$s or newer. You are running PHP %2$s.', 'sw-sliderman' ),
						SWS_MIN_PHP,
						PHP_VERSION
					)
				)
			);
		}
	);
	return;
}

// SWS_AUTOLOADER may be defined by the test environment to supply its own dependency set.
$sws_autoload = defined( 'SWS_AUTOLOADER' ) ? SWS_AUTOLOADER : SWS_DIR . 'vendor/autoload.php';
if ( ! is_readable( $sws_autoload ) ) {
	add_action(
		'admin_notices',
		static function (): void {
			printf(
				'<div class="notice notice-error"><p>%s</p></div>',
				esc_html__( 'SW Sliderman: the vendor directory is missing. Install the release package or run "composer install".', 'sw-sliderman' )
			);
		}
	);
	return;
}
require $sws_autoload;
unset( $sws_autoload );

register_activation_hook( __FILE__, array( \SW\Slider\Infrastructure\Lifecycle::class, 'activate' ) );
register_deactivation_hook( __FILE__, array( \SW\Slider\Infrastructure\Lifecycle::class, 'deactivate' ) );

( new \SW\Slider\Plugin() )->boot();

if ( ! function_exists( 'sws_render_slider' ) ) {
	/**
	 * Template helper: renders a published slider (same renderer as shortcode and block).
	 *
	 * @param int  $slider_id Slider ID.
	 * @param bool $display   Echo the markup (default) or only return it.
	 *
	 * @return string Slider markup (already escaped by the renderer); '' for visitors when unavailable.
	 */
	function sws_render_slider( int $slider_id, bool $display = true ): string {
		$html = apply_filters( \SW\Slider\Rendering\Block::FILTER, '', $slider_id );
		$html = is_string( $html ) ? $html : '';
		if ( $display ) {
			echo $html; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped by SliderRenderer.
		}
		return $html;
	}
}

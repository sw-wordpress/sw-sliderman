<?php
/**
 * Private saved-draft preview endpoint.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Admin;

use SW\Slider\Application\SliderService;
use SW\Slider\Infrastructure\Capabilities;
use SW\Slider\Infrastructure\PostTypes;
use SW\Slider\Rendering\SliderRenderer;
use Throwable;
/** Cookie-authenticated, object-authorized, nonce-bound HTML. No public draft files or tokens. */
final class DraftPreview {
	public function __construct( private readonly SliderService $sliders, private readonly SliderRenderer $renderer ) {
	}
	public function register(): void {
		add_action( 'admin_post_sws_preview', array( $this, 'output' ) );
	}
	public function can_preview( int $id, string $nonce ): bool {
		$post = get_post( $id );
		return current_user_can( Capabilities::EDIT ) && $post instanceof \WP_Post && PostTypes::SLIDER === $post->post_type && 'trash' !== $post->post_status
			&& current_user_can( 'edit_post', $id ) && false !== wp_verify_nonce( $nonce, 'sws_preview_' . $id );
	}

	public function output(): void {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- can_preview() checks the object-bound nonce before reading any draft.
		$id = isset( $_GET['id'] ) ? absint( $_GET['id'] ) : 0;
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- verified by can_preview() below.
		$nonce = isset( $_GET['_wpnonce'] ) && is_string( $_GET['_wpnonce'] ) ? sanitize_text_field( wp_unslash( $_GET['_wpnonce'] ) ) : '';
		if ( ! $this->can_preview( $id, $nonce ) ) {
			wp_die( esc_html__( 'This preview is not available.', 'sw-sliderman' ), '', array( 'response' => 403 ) );
		}

		nocache_headers();
		header( 'Cache-Control: private, no-store, max-age=0' );
		header( 'X-Robots-Tag: noindex, nofollow, noarchive' );
		header( 'X-Frame-Options: SAMEORIGIN' );
		header( 'Referrer-Policy: no-referrer' );
		header( 'Content-Type: text/html; charset=UTF-8' );
		try {
			$slider = $this->sliders->get( $id );
			$html   = $this->renderer->render_preview( $slider );
		} catch ( Throwable ) {
			wp_die( esc_html__( 'This preview is not available.', 'sw-sliderman' ), '', array( 'response' => 404 ) );
		}
			echo '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>' . esc_html( $slider->title ) . '</title>';
			wp_print_styles();
			echo '</head><body>';
        // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- rendered and context-escaped by SliderRenderer.
			echo $html;
			wp_print_footer_scripts();
			echo '</body></html>';
			exit;
	}
}

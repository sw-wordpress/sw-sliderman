<?php
/**
 * Admin menu page hosting the editor.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Admin;

use SW\Slider\Fonts\FontRepository;
use SW\Slider\Infrastructure\Capabilities;
use SW\Slider\Infrastructure\UploadPaths;
use SW\Slider\Rendering\Assets;
use SW\Slider\Rest\SliderController;

/**
 * Registers the "Sliderman" menu and loads the Vue editor only on its own screen.
 *
 * The editor bundle is an ES module; `wp-i18n` provides translations (script translations from
 * `languages/`), `wp.media` the media library. Installed fonts are loaded from local stylesheets
 * so the editor never requests a remote font (PLAN.md 8.1).
 */
final class AdminPage {

	public const SLUG   = 'sw-sliderman';
	public const HANDLE = 'sws-editor';

	private string $hook = '';

	public function __construct(
		private readonly FontRepository $fonts,
		private readonly string $plugin_url,
		private readonly string $plugin_dir,
		private readonly string $version,
		private readonly bool $fonts_offline
	) {
	}

	public function register(): void {
		add_action( 'admin_menu', array( $this, 'add_menu' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue' ) );
		add_filter( 'script_loader_tag', array( $this, 'module_tag' ), 10, 2 );
	}

	public function add_menu(): void {
		$this->hook = (string) add_menu_page(
			__( 'SW Sliderman', 'sw-sliderman' ),
			__( 'Sliderman', 'sw-sliderman' ),
			Capabilities::EDIT,
			self::SLUG,
			array( $this, 'render' ),
			'dashicons-images-alt2',
			58
		);
	}

	private function built(): bool {
		return is_readable( $this->plugin_dir . 'build/editor/editor.js' );
	}

	public function render(): void {
		if ( ! current_user_can( Capabilities::EDIT ) ) {
			wp_die( esc_html__( 'You do not have permission to access this page.', 'sw-sliderman' ), 403 );
		}
		if ( ! $this->built() ) {
			echo '<div class="wrap"><div class="notice notice-error"><p>' . esc_html__( 'The SW Sliderman editor has not been built. Install the release package or run "npm run build".', 'sw-sliderman' ) . '</p></div></div>';
			return;
		}
		echo '<div class="wrap sws-wrap"><div id="sw-sliderman-app"></div><noscript>' . esc_html__( 'The slider editor requires JavaScript.', 'sw-sliderman' ) . '</noscript></div>';
	}

	public function enqueue( string $hook ): void {
		if ( $hook !== $this->hook || '' === $this->hook || ! $this->built() ) {
			return;
		}
		$version = $this->version . '-' . (string) filemtime( $this->plugin_dir . 'build/editor/editor.js' );
		wp_enqueue_media();
		wp_enqueue_style( Assets::RUNTIME );
		foreach ( $this->fonts->all() as $installation ) {
			$url = UploadPaths::local_font_url( $installation['stylesheet'] );
			if ( null !== $url ) {
				// Installation directories are content-addressed and immutable.
				wp_enqueue_style( 'sws-font-' . $installation['id'], $url, array(), null ); // phpcs:ignore WordPress.WP.EnqueuedResourceParameters.MissingVersion
			}
		}
		wp_enqueue_style( self::HANDLE, $this->plugin_url . 'build/editor/editor.css', array( Assets::RUNTIME ), $version );
		wp_enqueue_script( self::HANDLE, $this->plugin_url . 'build/editor/editor.js', array( 'wp-i18n' ), $version, true );
		wp_set_script_translations( self::HANDLE, 'sw-sliderman', $this->plugin_dir . 'languages' );
		wp_add_inline_script( self::HANDLE, 'window.swsEditorConfig = ' . wp_json_encode( $this->config(), JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_SLASHES ) . ';', 'before' );
	}

	/**
	 * Configuration contract with the editor (assets/editor/types/config.ts).
	 *
	 * @return array<string, mixed>
	 */
	public function config(): array {
		return array(
			'restRoot'     => esc_url_raw( rest_url( SliderController::NAMESPACE . '/' ) ),
			'nonce'        => wp_create_nonce( 'wp_rest' ),
			'locale'       => determine_locale(),
			'userId'       => get_current_user_id(),
			'siteId'       => get_current_blog_id(),
			'version'      => $this->version,
			'adminUrl'     => esc_url_raw( admin_url( 'admin.php?page=' . self::SLUG ) ),
			'capabilities' => Capabilities::current_user_caps(),
			'fontsOffline' => $this->fonts_offline,
		);
	}

	public function module_tag( string $tag, string $handle ): string {
		if ( self::HANDLE !== $handle ) {
			return $tag;
		}
		// The filtered tag also contains the inline translation/config scripts; only the external
		// bundle becomes a module.
		return (string) preg_replace( '/<script(?=[^>]*\ssrc=)/', '<script type="module"', $tag, 1 );
	}
}

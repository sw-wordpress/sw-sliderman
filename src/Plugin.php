<?php
/**
 * Composition root.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider;

use SW\Slider\Admin\AdminPage;
use SW\Slider\Admin\DraftPreview;
use SW\Slider\Application\SliderService;
use SW\Slider\Domain\DocumentValidator;
use SW\Slider\Fonts\DownloadPolicy;
use SW\Slider\Fonts\FontCatalog;
use SW\Slider\Fonts\FontFaceParser;
use SW\Slider\Fonts\FontInstaller;
use SW\Slider\Fonts\FontLibrary;
use SW\Slider\Fonts\GoogleFontsProvider;
use SW\Slider\Fonts\UploadsFontStorage;
use SW\Slider\Fonts\WpFontRepository;
use SW\Slider\Fonts\WpHttpClient;
use SW\Slider\Infrastructure\Lifecycle;
use SW\Slider\Infrastructure\SliderWriteScope;
use SW\Slider\Infrastructure\PostTypes;
use SW\Slider\Infrastructure\Translations;
use SW\Slider\Infrastructure\UploadsArtifactStore;
use SW\Slider\Infrastructure\WpResourceChecker;
use SW\Slider\Infrastructure\WpSliderRepository;
use SW\Slider\Infrastructure\WpSystemPorts;
use SW\Slider\Rendering\Assets;
use SW\Slider\Rendering\CssArtifactBuilder;
use SW\Slider\Rendering\Shortcode;
use SW\Slider\Rendering\SliderRenderer;
use SW\Slider\Rest\FontController;
use SW\Slider\Rest\SliderController;

/**
 * Wires the concrete implementations and registers all hooks in one place (CODE-STYLE 3.1/5).
 */
final class Plugin {

	/** Option that blocks every outbound font connection (PLAN.md 8.1 offline mode). */
	public const OFFLINE_OPTION = 'sws_fonts_offline';

	public function boot(): void {
		global $wpdb;

		$offline      = (bool) get_option( self::OFFLINE_OPTION, false );
		$template     = (string) file_get_contents( SWS_DIR . 'schemas/defaults/new-slider.json' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- bundled local file.
		$system       = new WpSystemPorts();
		$sliders      = new WpSliderRepository( $wpdb );
		$font_repo    = new WpFontRepository();
		$font_storage = new UploadsFontStorage();
		$catalog      = new FontCatalog( SWS_DIR . 'fonts/catalog.json' );
		$policy       = new DownloadPolicy(
			static function ( string $host ): array {
				$addresses = gethostbynamel( $host );
				return false === $addresses ? array() : $addresses;
			}
		);
		$provider     = new GoogleFontsProvider( new WpHttpClient(), $policy, new FontFaceParser() );
		$installer    = new FontInstaller( $catalog, $provider, $font_repo, $font_storage, static fn (): string => $system->now_gmt(), $offline );
		$library      = new FontLibrary( $font_repo, $font_storage, static fn (): iterable => $sliders->all_documents() );
		$service      = new SliderService(
			$sliders,
			new DocumentValidator(),
			new WpResourceChecker( $font_repo, $font_storage ),
			new UploadsArtifactStore(),
			new CssArtifactBuilder(),
			$system,
			$template
		);
		$assets       = new Assets( $sliders, $font_repo, SWS_URL, SWS_DIR, SWS_VERSION );

		( new Translations( SWS_DIR . 'languages' ) )->register();
		( new Lifecycle() )->register();
		( new PostTypes() )->register();
		( new SliderWriteScope() )->register();
		$assets->register();
		$renderer = new SliderRenderer( $sliders, $assets );
		( new Shortcode( $renderer ) )->register();
		( new DraftPreview( $service, $renderer ) )->register();
		( new SliderController( $service ) )->register();
		( new FontController( $catalog, $installer, $library, $offline ) )->register();
		if ( is_admin() ) {
			( new AdminPage( $font_repo, SWS_URL, SWS_DIR, SWS_VERSION, $offline ) )->register();
		}
	}
}

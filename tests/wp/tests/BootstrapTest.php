<?php
/**
 * Composition and admin asset contracts; no provider requests.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

final class BootstrapTest extends WP_UnitTestCase {
	public function test_composition_registers_private_types_and_local_admin_assets(): void {
		$admin = self::factory()->user->create( array( 'role' => 'administrator' ) );
		wp_set_current_user( $admin );
		set_current_screen( 'dashboard' );
		\SW\Slider\Infrastructure\Capabilities::grant_defaults();
		( new \SW\Slider\Plugin() )->boot();
		$types = new \SW\Slider\Infrastructure\PostTypes();
		$types->register_post_types();
		foreach ( array( $types::SLIDER, $types::FONT ) as $type ) {
			$this->assertFalse( get_post_type_object( $type )->public );
			$this->assertFalse( get_post_type_object( $type )->show_in_rest );
		}
		$bundle_dir = get_temp_dir() . 'sws-admin-test-' . wp_generate_uuid4() . '/';
		wp_mkdir_p( $bundle_dir . 'build/editor' );
		file_put_contents( $bundle_dir . 'build/editor/editor.js', '/* test editor bundle */' );
		$page = new \SW\Slider\Admin\AdminPage( new \SW\Slider\Fonts\WpFontRepository(), SWS_URL, $bundle_dir, SWS_VERSION, false );
		$page->register();
		$page->add_menu();
		$page->enqueue( 'toplevel_page_sw-sliderman' );
		$this->assertTrue( wp_script_is( 'sws-editor', 'enqueued' ) );
		$this->assertContains( 'sws_manage_fonts', $page->config()['capabilities'] );
		$this->assertStringContainsString( 'type="module"', $page->module_tag( '<script src="local.js"></script>', 'sws-editor' ) );
		$this->assertSame( '<script>local</script>', $page->module_tag( '<script>local</script>', 'other' ) );
		ob_start();
		$page->render();
		$this->assertStringContainsString( 'sw-sliderman-app', ob_get_clean() );
		$page->enqueue( 'unrelated' );
		wp_delete_file( $bundle_dir . 'build/editor/editor.js' );
		rmdir( $bundle_dir . 'build/editor' );
		rmdir( $bundle_dir . 'build' );
		rmdir( $bundle_dir );
		$unbuilt = new \SW\Slider\Admin\AdminPage( new \SW\Slider\Fonts\WpFontRepository(), SWS_URL, '/missing/', SWS_VERSION, false );
		ob_start();
		$unbuilt->render();
		$this->assertStringContainsString( 'has not been built', ob_get_clean() );
	}
	public function test_translation_fallback_keeps_german_catalogs_local(): void {
		$translations = new \SW\Slider\Infrastructure\Translations( SWS_DIR . 'languages' );
		$translations->register();
		$locale = static fn (): string => 'de_DE_formal';
		add_filter( 'determine_locale', $locale );
		try {
			$translations->load();
			$this->assertSame( SWS_DIR . 'languages/sw-sliderman-de_DE-sws-editor.json', $translations->script_file( false, 'sws-editor', 'sw-sliderman' ) );
			$this->assertFalse( $translations->script_file( false, 'other', 'other-domain' ) );
		} finally {
			remove_filter( 'determine_locale', $locale );
		}
	}
	public function test_safe_http_adapter_keeps_size_timeout_and_redirect_bounds(): void {
		$http      = new \SW\Slider\Fonts\WpHttpClient();
		$intercept = static function ( $response, array $args ): array {
			self::assertSame( 0, $args['redirection'] );
			self::assertSame( 11, $args['limit_response_size'] );
			self::assertTrue( $args['sslverify'] );
			return array(
				'headers'  => array( 'location' => array( 'https://fonts.gstatic.com/s/lato/v1/a.woff2' ) ),
				'body'     => str_repeat( 'a', 11 ),
				'response' => array(
					'code'    => 302,
					'message' => 'Found',
				),
				'cookies'  => array(),
			);
		};
		add_filter( 'pre_http_request', $intercept, 10, 2 );
		try {
			$result = $http->get( 'https://fonts.gstatic.com/s/lato/v1/a.woff2', 10, 15 );
			$this->assertTrue( $result['truncated'] );
			$this->assertSame( 302, $result['status'] );
			$this->assertStringStartsWith( 'https://fonts.gstatic.com/', $result['location'] );
		} finally {
			remove_filter( 'pre_http_request', $intercept );
		}
	}
}

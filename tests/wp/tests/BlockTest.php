<?php
/**
 * Gutenberg block, template helper and early asset detection.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

use SW\Slider\Infrastructure\Capabilities;
use SW\Slider\Rendering\Assets;
use SW\Slider\Rendering\Block;
use SW\Slider\Rendering\Shortcode;
use SW\Slider\Rendering\SliderRenderer;

/**
 * Block, shortcode and helper must produce the same markup from the one renderer.
 */
final class BlockTest extends WP_UnitTestCase {

	private int $admin;

	public function set_up(): void {
		parent::set_up();
		Capabilities::grant_defaults();
		$this->admin = self::factory()->user->create( array( 'role' => 'administrator' ) );
		wp_set_current_user( $this->admin );
		do_action( 'rest_api_init' );
	}

	private function repository(): \SW\Slider\Infrastructure\WpSliderRepository {
		global $wpdb;
		return new \SW\Slider\Infrastructure\WpSliderRepository( $wpdb );
	}

	private function assets(): Assets {
		return new Assets( $this->repository(), new \SW\Slider\Fonts\WpFontRepository(), SWS_URL, SWS_DIR, SWS_VERSION );
	}

	private function renderer(): SliderRenderer {
		return new SliderRenderer( $this->repository(), $this->assets() );
	}

	private function published_slider(): int {
		$create = new WP_REST_Request( 'POST', '/sw-sliderman/v1/sliders' );
		$create->set_header( 'Content-Type', 'application/json' );
		$create->set_body( (string) wp_json_encode( array( 'title' => 'Hero' ) ) );
		$id      = rest_get_server()->dispatch( $create )->get_data()['id'];
		$publish = new WP_REST_Request( 'POST', '/sw-sliderman/v1/sliders/' . $id . '/publish' );
		$publish->set_header( 'Content-Type', 'application/json' );
		$publish->set_body( (string) wp_json_encode( array( 'version' => 1 ) ) );
		$this->assertSame( 200, rest_get_server()->dispatch( $publish )->get_status() );
		return (int) $id;
	}

	public function test_block_is_registered_as_dynamic_block_with_plugin_version(): void {
		// Registered by the plugin's own boot on `init`.
		$type = WP_Block_Type_Registry::get_instance()->get_registered( Block::NAME );
		$this->assertNotNull( $type );
		$this->assertTrue( $type->is_dynamic() );
		$this->assertSame( 0, $type->attributes['sliderId']['default'] );
		$this->assertSame( SWS_VERSION, wp_scripts()->query( $type->editor_script_handles[0], 'registered' )->ver );
	}

	public function test_block_directory_prefers_the_shipped_build_and_falls_back_to_the_sources(): void {
		$root = get_temp_dir() . 'sws-plugin-' . wp_generate_uuid4() . '/';
		$make = static function ( string $relative ) use ( $root ): void {
			wp_mkdir_p( $root . $relative );
			file_put_contents( $root . $relative . '/block.json', '{}' ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		};
		$block = new Block( $this->renderer(), $root );
		$this->assertNull( $block->directory() );
		$block->register_block(); // Nothing to register; must not fail.

		$make( 'assets/block' );
		$this->assertSame( $root . 'assets/block', $block->directory(), 'source checkout without a build' );
		$make( 'build/block' );
		$this->assertSame( $root . 'build/block', $block->directory(), 'the shipped build wins' );
	}

	public function test_the_plugin_registers_the_block_from_a_directory_that_exists_in_the_release_zip(): void {
		$type = WP_Block_Type_Registry::get_instance()->get_registered( Block::NAME );
		$this->assertNotNull( $type );
		$release_excludes = (string) file_get_contents( SWS_DIR . 'bin/build-zip.sh' ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		$this->assertStringContainsString( "\n/assets\n", $release_excludes, 'the ZIP ships no assets/ directory' );
		$block = ( new Block( $this->renderer(), SWS_DIR ) )->directory();
		$this->assertNotNull( $block );
		if ( is_readable( SWS_DIR . 'build/block/block.json' ) ) {
			$this->assertSame( SWS_DIR . 'build/block', $block );
		}
	}

	public function test_editor_strings_are_handed_to_the_script_json_safely(): void {
		$type   = WP_Block_Type_Registry::get_instance()->get_registered( Block::NAME );
		$before = wp_scripts()->get_data( $type->editor_script_handles[0], 'before' );
		$this->assertIsArray( $before );
		$this->assertStringContainsString( 'window.swsBlockStrings=', implode( '', $before ) );
		$this->assertSame( array_keys( Block::strings() ), array_keys( array_filter( Block::strings() ) ), 'no empty text' );
		$this->assertStringContainsString( '%s', Block::strings()['published'] );
	}

	public function test_block_shortcode_and_helper_render_the_same_markup(): void {
		$id    = $this->published_slider();
		$block = new Block( $this->renderer(), SWS_DIR );
		$html  = $block->render( array( 'sliderId' => $id ) );
		$this->assertStringContainsString( 'data-sws-slider', $html );
		$this->assertSame( 1, preg_match( '/id="sws-' . $id . '-(\d+)"/', $html, $first ) );
		// Same markup apart from the per-render instance number.
		$strip = static fn ( string $markup ): string => (string) preg_replace( '/sws-' . $id . '-\d+/', 'sws-I', $markup );
		$this->assertSame( $strip( $html ), $strip( $block->filter( '', $id ) ) );
		$this->assertSame( $strip( $html ), $strip( ( new Shortcode( $this->renderer() ) )->render( array( 'id' => (string) $id ) ) ) );
	}

	public function test_helper_returns_and_optionally_prints(): void {
		$id = $this->published_slider();
		( new Block( $this->renderer(), SWS_DIR ) )->register();
		ob_start();
		$returned = sws_render_slider( $id );
		$printed  = (string) ob_get_clean();
		$this->assertSame( $returned, $printed );
		$this->assertStringContainsString( 'data-sws-slider', $printed );
		ob_start();
		$silent = sws_render_slider( $id, false );
		$this->assertSame( '', (string) ob_get_clean() );
		$this->assertStringContainsString( 'data-sws-slider', $silent );
	}

	public function test_invalid_ids_yield_nothing_for_visitors_and_a_note_for_editors(): void {
		$block = new Block( $this->renderer(), SWS_DIR );
		$this->assertStringContainsString( 'sws-diagnostic', $block->render( array( 'sliderId' => 999999 ) ) );
		$this->assertStringContainsString( 'sws-diagnostic', $block->render( array( 'sliderId' => '12abc' ) ) );
		wp_set_current_user( 0 );
		$this->assertSame( '', $block->render( array( 'sliderId' => 999999 ) ) );
		$this->assertSame( '', $block->render( array() ) );
		$this->assertSame( '', $block->filter( '', 'x' ) );
	}

	public function test_unpublished_slider_is_not_rendered_publicly(): void {
		$create = new WP_REST_Request( 'POST', '/sw-sliderman/v1/sliders' );
		$create->set_header( 'Content-Type', 'application/json' );
		$create->set_body( (string) wp_json_encode( array( 'title' => 'Draft' ) ) );
		$id = (int) rest_get_server()->dispatch( $create )->get_data()['id'];
		wp_set_current_user( 0 );
		$this->assertSame( '', ( new Block( $this->renderer(), SWS_DIR ) )->render( array( 'sliderId' => $id ) ) );
	}

	public function test_embedded_ids_find_shortcodes_and_nested_blocks(): void {
		$content = '[sw_slider id="5"] [sw_slider id="x"]'
			. '<!-- wp:sw-sliderman/slider {"sliderId":7} /-->'
			. '<!-- wp:group --><div><!-- wp:sw-sliderman/slider {"sliderId":9} /--><!-- wp:sw-sliderman/slider {"sliderId":5} /--></div><!-- /wp:group -->'
			. '<!-- wp:sw-sliderman/slider /-->';
		$this->assertSame( array( 5, 7, 9 ), $this->assets()->embedded_ids( $content ) );
		$this->assertSame( array(), $this->assets()->embedded_ids( 'plain text' ) );
	}

	public function test_block_in_queried_post_prepares_runtime_in_head(): void {
		$id   = $this->published_slider();
		$post = self::factory()->post->create( array( 'post_content' => '<!-- wp:sw-sliderman/slider {"sliderId":' . $id . '} /-->' ) );
		$this->go_to( get_permalink( $post ) );
		$assets = $this->assets();
		$assets->register_runtime();
		$assets->prepare_queried_post();
		$this->assertTrue( wp_script_is( Assets::RUNTIME, 'enqueued' ) );
	}
}

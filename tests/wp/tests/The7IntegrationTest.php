<?php
/**
 * The7 page header slideshow integration.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

use SW\Slider\Infrastructure\Capabilities;
use SW\Slider\Integration\The7;

if ( ! function_exists( 'presscore_config' ) ) {
	/**
	 * Minimal stand-in for The7's template config (the theme is not installed in the test site).
	 */
	function presscore_config(): object { // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedFunctionFound -- test double of a theme function.
		return new class() {
			public function get( string $key ): mixed {
				return 'post_id' === $key ? ( $GLOBALS['sws_the7_post_id'] ?? 0 ) : null;
			}
		};
	}
}

/**
 * Meta box extension and header output against the real repository and renderer.
 */
final class The7IntegrationTest extends WP_UnitTestCase {

	private int $admin;

	public function set_up(): void {
		parent::set_up();
		Capabilities::grant_defaults();
		$this->admin = self::factory()->user->create( array( 'role' => 'administrator' ) );
		wp_set_current_user( $this->admin );
		do_action( 'rest_api_init' );
	}

	public function tear_down(): void {
		unset( $GLOBALS['DT_META_BOXES'], $GLOBALS['sws_the7_post_id'] );
		parent::tear_down();
	}

	private function integration(): The7 {
		global $wpdb;
		$repository = new \SW\Slider\Infrastructure\WpSliderRepository( $wpdb );
		$assets     = new \SW\Slider\Rendering\Assets( $repository, new \SW\Slider\Fonts\WpFontRepository(), SWS_URL, SWS_DIR, SWS_VERSION );
		return new The7( $repository, new \SW\Slider\Rendering\SliderRenderer( $repository, $assets ) );
	}

	private function rest( string $method, string $route, ?array $body = null ): WP_REST_Response {
		$request = new WP_REST_Request( $method, '/sw-sliderman/v1' . $route );
		if ( null !== $body ) {
			$request->set_header( 'Content-Type', 'application/json' );
			$request->set_body( (string) wp_json_encode( $body ) );
		}
		return rest_get_server()->dispatch( $request );
	}

	/** The relevant shape of The7's boxes when no own slider source is active. */
	private function the7_boxes( array $modes ): array {
		return array(
			'dt_page_box-header_options'    => array(
				'fields' => array(
					array(
						'id'      => '_dt_header_title',
						'options' => array(
							'enabled' => array( 'Show page title', array( 'regular-title.gif', 100, 60 ) ),
							'fancy'   => array( 'Fancy title', array( 'fancy-title.gif', 100, 60 ) ),
						),
					),
				),
			),
			'dt_page_box-slideshow_options' => array(
				'fields' => array(
					array(
						'id'          => '_dt_slideshow_mode',
						'std'         => false,
						'options'     => $modes,
						'hide_fields' => array( 'revolution' => array( '_dt_slideshow_sliders' ) ),
					),
					array( 'id' => '_dt_slideshow_sliders' ),
				),
			),
		);
	}

	public function test_hooks_are_registered(): void {
		$the7 = $this->integration();
		$the7->register();
		$this->assertSame( 10, has_action( 'the7_before_meta_box_registration', array( $the7, 'extend_meta_boxes' ) ) );
		$this->assertSame( 10, has_action( 'presscore_do_header_slideshow', array( $the7, 'render_header' ) ) );
	}

	public function test_meta_boxes_offer_slideshow_mode_and_slider_selection(): void {
		$published = $this->rest( 'POST', '/sliders', array( 'title' => 'Hero' ) )->get_data();
		$this->assertSame( 200, $this->rest( 'POST', '/sliders/' . $published['id'] . '/publish', array( 'version' => 1 ) )->get_status() );
		$draft = $this->rest( 'POST', '/sliders', array( 'title' => 'Draft' ) )->get_data();

		$GLOBALS['DT_META_BOXES'] = $this->the7_boxes( array() );
		$this->integration()->extend_meta_boxes();
		$boxes = $GLOBALS['DT_META_BOXES'];

		$this->assertArrayHasKey( 'slideshow', $boxes['dt_page_box-header_options']['fields'][0]['options'] );
		$mode = $boxes['dt_page_box-slideshow_options']['fields'][0];
		$this->assertSame( 'SW SliderMan', $mode['options'][ The7::MODE ][0] );
		$this->assertSame( The7::MODE, $mode['std'], 'only mode becomes the default' );
		$this->assertContains( '_dt_slideshow_revolution_slider', $mode['hide_fields'][ The7::MODE ] );
		$this->assertContains( The7::SLIDER_META, $mode['hide_fields']['revolution'] );

		$select = $boxes['dt_page_box-slideshow_options']['fields'][1];
		$this->assertSame( The7::SLIDER_META, $select['id'] );
		$this->assertSame( 'select', $select['type'] );
		$this->assertSame( 'Hero', $select['options'][ (string) $published['id'] ] );
		$this->assertSame( sprintf( __( '%s (not published)', 'sw-sliderman' ), 'Draft' ), $select['options'][ (string) $draft['id'] ] );
		$this->assertSame( '_dt_slideshow_sliders', $boxes['dt_page_box-slideshow_options']['fields'][2]['id'] );
	}

	public function test_existing_the7_modes_and_options_are_kept(): void {
		$GLOBALS['DT_META_BOXES'] = $this->the7_boxes( array( 'revolution' => array( 'Slider Revolution', array( 'sliderrevolution.gif', 75, 50 ) ) ) );
		$GLOBALS['DT_META_BOXES']['dt_page_box-header_options']['fields'][0]['options']['slideshow'] = array( 'Theme label', array() );
		$this->integration()->extend_meta_boxes();
		$mode = $GLOBALS['DT_META_BOXES']['dt_page_box-slideshow_options']['fields'][0];
		$this->assertSame( array( 'revolution', The7::MODE ), array_keys( $mode['options'] ) );
		$this->assertFalse( $mode['std'], 'The7 default stays' );
		$this->assertSame( 'Theme label', $GLOBALS['DT_META_BOXES']['dt_page_box-header_options']['fields'][0]['options']['slideshow'][0] );
	}

	public function test_missing_the7_boxes_are_ignored(): void {
		$GLOBALS['DT_META_BOXES'] = array( 'other' => array( 'fields' => array() ) );
		$this->integration()->extend_meta_boxes();
		$this->assertSame( array( 'other' => array( 'fields' => array() ) ), $GLOBALS['DT_META_BOXES'] );
	}

	public function test_header_renders_selected_published_slider_only_for_own_mode(): void {
		$slider = $this->rest( 'POST', '/sliders', array( 'title' => 'Hero' ) )->get_data();
		$this->assertSame( 200, $this->rest( 'POST', '/sliders/' . $slider['id'] . '/publish', array( 'version' => 1 ) )->get_status() );
		$page = self::factory()->post->create( array( 'post_type' => 'page' ) );
		update_post_meta( $page, The7::SLIDER_META, (string) $slider['id'] );
		$GLOBALS['sws_the7_post_id'] = $page;
		$the7                        = $this->integration();
		wp_set_current_user( 0 );

		ob_start();
		$the7->render_header( 'revolution' );
		$this->assertSame( '', ob_get_clean(), 'other modes are left to The7' );

		ob_start();
		$the7->render_header( The7::MODE );
		$html = (string) ob_get_clean();
		$this->assertStringStartsWith( '<div id="main-slideshow" class="sws-the7-slideshow">', $html );
		$this->assertStringContainsString( 'id="sws-' . $slider['id'] . '-1"', $html );
	}

	public function test_header_without_slider_is_empty_for_visitors_and_diagnosed_for_editors(): void {
		$GLOBALS['sws_the7_post_id'] = self::factory()->post->create( array( 'post_type' => 'page' ) );
		$the7                        = $this->integration();

		ob_start();
		$the7->render_header( The7::MODE );
		$this->assertStringContainsString( 'sws-diagnostic', (string) ob_get_clean() );

		wp_set_current_user( 0 );
		ob_start();
		$the7->render_header( The7::MODE );
		$this->assertSame( '', ob_get_clean() );
	}
}

<?php
/**
 * M4.14–M4.16: instances, artifact lifecycle, responsive images.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

use SW\Slider\Infrastructure\ArtifactCleanup;
use SW\Slider\Infrastructure\Capabilities;
use SW\Slider\Infrastructure\UploadPaths;

final class PlaybackOutputTest extends WP_UnitTestCase {

	/** @var list<string> */
	private array $created = array();

	public function set_up(): void {
		parent::set_up();
		Capabilities::grant_defaults();
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );
		do_action( 'rest_api_init' );
	}

	/** Private uploads root, so the count of deleted files does not depend on earlier runs. */
	private function isolate_uploads(): void {
		$base = get_temp_dir() . 'sws-uploads-' . wp_generate_uuid4();
		add_filter(
			'upload_dir',
			static function ( array $dirs ) use ( $base ): array {
				$dirs['basedir'] = $base;
				return $dirs;
			}
		);
	}

	public function tear_down(): void {
		foreach ( $this->created as $file ) {
			wp_delete_file( $file );
		}
		parent::tear_down();
	}

	private function request( string $method, string $route, ?array $body = null ): WP_REST_Response {
		$request = new WP_REST_Request( $method, '/sw-sliderman/v1' . $route );
		if ( null !== $body ) {
			$request->set_header( 'Content-Type', 'application/json' );
			$request->set_body( (string) wp_json_encode( $body ) );
		}
		return rest_get_server()->dispatch( $request );
	}

	private function image_layer( string $id, int $attachment ): array {
		return array(
			'id'        => $id,
			'type'      => 'image',
			'name'      => $id,
			'locked'    => false,
			'content'   => array(
				'attachmentId' => $attachment,
				'alt'          => 'Alt',
				'decorative'   => false,
				'fit'          => 'cover',
			),
			'layout'    => array(
				'x'        => 0,
				'y'        => 0,
				'width'    => 400,
				'height'   => 300,
				'anchorX'  => 'left',
				'anchorY'  => 'top',
				'rotation' => 0,
				'visible'  => true,
			),
			'style'     => array(
				'fontRef'         => null,
				'fontSize'        => 16,
				'lineHeight'      => 1.2,
				'letterSpacing'   => 0,
				'color'           => '#ffffff',
				'textAlign'       => 'left',
				'backgroundColor' => null,
				'borderRadius'    => 0,
				'paddingX'        => 0,
				'paddingY'        => 0,
				'opacity'         => 1,
			),
			'overrides' => (object) array(),
			'animation' => array(
				'enter' => array(
					'preset'     => 'none',
					'startMs'    => 0,
					'durationMs' => 0,
					'easing'     => 'ease',
					'distance'   => 0,
				),
				'exit'  => array( 'mode' => 'slide-end' ),
			),
		);
	}

	/**
	 * Publishes a two-slide slider; each slide has one image layer, the first slide optionally a background.
	 *
	 * @return int Slider ID.
	 */
	private function publish_two_slides( bool $background ): int {
		$attachment = self::factory()->attachment->create_upload_object( dirname( __DIR__ ) . '/vendor/wp-phpunit/wp-phpunit/data/images/canola.jpg' );
		$this->assertGreaterThan( 0, $attachment );
		$detail = $this->request( 'POST', '/sliders', array( 'title' => 'Images' ) )->get_data();
		$doc    = json_decode( (string) wp_json_encode( $detail['document'] ), true );
		$second = $doc['slides'][0];
		$second['id']                = 'slide-two';
		$doc['slides'][0]['layers']  = array( $this->image_layer( 'first-image', $attachment ) );
		$second['layers']            = array( $this->image_layer( 'second-image', $attachment ) );
		$doc['slides'][]             = $second;
		if ( $background ) {
			$doc['slides'][0]['background']['attachmentId'] = $attachment;
			$doc['slides'][1]['background']['attachmentId'] = $attachment;
		}
		$saved = $this->request(
			'PUT',
			'/sliders/' . $detail['id'],
			array(
				'title'           => 'Images',
				'expectedVersion' => 1,
				'document'        => $doc,
			)
		);
		$this->assertSame( 200, $saved->get_status(), wp_json_encode( $saved->get_data() ) );
		$this->assertSame( 200, $this->request( 'POST', '/sliders/' . $detail['id'] . '/publish', array( 'version' => 2 ) )->get_status() );
		return (int) $detail['id'];
	}

	public function test_first_image_is_eager_with_priority_and_later_slides_are_lazy(): void {
		$id   = $this->publish_two_slides( false );
		$html = do_shortcode( '[sw_slider id="' . $id . '"]' );
		$this->assertSame( 2, preg_match_all( '/<img [^>]*class="sws-image/', $html ) );
		preg_match_all( '/<img [^>]*>/', $html, $images );
		$this->assertStringContainsString( 'loading="eager"', $images[0][0] );
		$this->assertStringContainsString( 'fetchpriority="high"', $images[0][0] );
		$this->assertStringContainsString( 'loading="lazy"', $images[0][1] );
		$this->assertStringNotContainsString( 'fetchpriority', $images[0][1] );
		foreach ( $images[0] as $image ) {
			$this->assertMatchesRegularExpression( '/ width="\d+" height="\d+"/', $image );
			$this->assertStringContainsString( ' sizes="', $image );
			$this->assertStringContainsString( ' srcset="', $image );
		}
	}

	public function test_background_of_first_slide_takes_the_priority_instead_of_layers(): void {
		$id   = $this->publish_two_slides( true );
		$html = do_shortcode( '[sw_slider id="' . $id . '"]' );
		preg_match_all( '/<img [^>]*>/', $html, $images );
		$this->assertCount( 4, $images[0] );
		$this->assertStringContainsString( 'sws-slide__bg', $images[0][0] );
		$this->assertStringContainsString( 'fetchpriority="high"', $images[0][0] );
		$this->assertStringContainsString( 'loading="eager"', $images[0][0] );
		$this->assertStringNotContainsString( 'fetchpriority', $images[0][1], 'one priority image only' );
		$this->assertStringContainsString( 'loading="lazy"', $images[0][2] );
	}

	public function test_same_slider_twice_and_two_sliders_get_unique_instances(): void {
		$one = $this->publish_two_slides( false );
		$two = $this->publish_two_slides( false );
		$out = do_shortcode( '[sw_slider id="' . $one . '"][sw_slider id="' . $one . '"][sw_slider id="' . $two . '"]' );
		preg_match_all( '/<section class="sws-slider[^"]*" id="([^"]+)"/', $out, $ids );
		$this->assertCount( 3, $ids[1] );
		$this->assertCount( 3, array_unique( $ids[1] ), 'unique instance IDs' );
		preg_match_all( '/ id="(sws-[^"]+)"/', $out, $all );
		$this->assertSame( $all[1], array_values( array_unique( $all[1] ) ), 'no duplicate element IDs, including slides and viewports' );
		$this->assertSame( 3, substr_count( $out, 'class="sws-config"' ) );
		$this->assertSame( 1, count( array_filter( wp_scripts()->queue, static fn ( string $handle ): bool => 'sws-runtime' === $handle ) ), 'runtime enqueued once' );
	}

	public function test_artifact_of_other_renderer_version_is_recalculated_not_loaded(): void {
		global $wpdb;
		$id   = $this->publish_two_slides( false );
		$meta = (string) get_post_meta( $id, '_sws_published', true );
		$snap = json_decode( $meta, true );
		$this->assertStringStartsWith( 'artifacts/', $snap['stylesheet'] );
		$this->assertFileExists( UploadPaths::path( $snap['stylesheet'] ) );

		$handle = 'sws-slider-' . substr( $snap['documentHash'], 0, 12 );
		do_shortcode( '[sw_slider id="' . $id . '"]' );
		$this->assertNotFalse( wp_styles()->registered[ $handle ]->src, 'current artifact is loaded as file' );

		wp_deregister_style( $handle );
		$snap['rendererVersion'] = 0 + $snap['rendererVersion'] + 1;
		$wpdb->update( $wpdb->postmeta, array( 'meta_value' => wp_json_encode( $snap, JSON_UNESCAPED_SLASHES ) ), array( 'post_id' => $id, 'meta_key' => '_sws_published' ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
		wp_cache_delete( $id, 'post_meta' );
		do_shortcode( '[sw_slider id="' . $id . '"]' );
		$this->assertFalse( wp_styles()->registered[ $handle ]->src, 'foreign renderer version: inline fallback' );
		$this->assertStringContainsString( '.sws-stage', (string) wp_styles()->get_data( $handle, 'after' )[0] );
	}

	public function test_cleanup_waits_the_grace_period_after_the_reference_is_gone(): void {
		global $wpdb;
		delete_option( ArtifactCleanup::OPTION );
		$this->isolate_uploads();
		$id     = $this->publish_two_slides( false );
		$snap   = json_decode( (string) get_post_meta( $id, '_sws_published', true ), true );
		$active = UploadPaths::path( $snap['stylesheet'] );
		$dir    = dirname( $active );
		$old    = $dir . '/0000000000000000-r1.css';
		$temp   = $dir . '/.tmp-aaaaaaaaaaaa.css';
		foreach ( array( $old, $temp ) as $file ) {
			file_put_contents( $file, 'x' ); // phpcs:ignore WordPress.WP.AlternativeFunctions
			$this->created[] = $file;
		}
		$now = time();
		// A long-published artifact that was just replaced: ancient file age, but only now unreferenced.
		touch( $old, $now - 90 * DAY_IN_SECONDS );
		touch( $temp, $now - 2 * DAY_IN_SECONDS );
		touch( $active, $now - 60 * DAY_IN_SECONDS );

		$cleanup = new ArtifactCleanup( $wpdb );
		$this->assertSame( 1, $cleanup->run( $now ), 'only the stale temporary file goes on the first run' );
		$this->assertFileDoesNotExist( $temp );
		$this->assertFileExists( $old, 'still available for cached pages' );
		$this->assertSame( $now, get_option( ArtifactCleanup::OPTION )['0000000000000000-r1.css'] );
		$this->assertArrayNotHasKey( basename( $active ), get_option( ArtifactCleanup::OPTION ), 'referenced file is not tracked' );

		$this->assertSame( 0, $cleanup->run( $now + 6 * DAY_IN_SECONDS ) );
		$this->assertFileExists( $old );
		$this->assertSame( 1, $cleanup->run( $now + 7 * DAY_IN_SECONDS ) );
		$this->assertFileDoesNotExist( $old );
		$this->assertFileExists( $active, 'referenced by the active snapshot' );
		$this->assertSame( array(), get_option( ArtifactCleanup::OPTION ) );
	}

	public function test_cleanup_does_nothing_when_a_snapshot_is_unreadable(): void {
		global $wpdb;
		$this->isolate_uploads();
		$id   = $this->publish_two_slides( false );
		$path = UploadPaths::path( 'artifacts/9999999999999999-r1.css' );
		file_put_contents( $path, 'x' ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		$this->created[] = $path;
		touch( $path, time() - 30 * DAY_IN_SECONDS );
		update_post_meta( $id, '_sws_published', wp_slash( '{broken' ) );
		update_option( ArtifactCleanup::OPTION, array( '9999999999999999-r1.css' => time() - 30 * DAY_IN_SECONDS ), false );
		$this->assertSame( 0, ( new ArtifactCleanup( $wpdb ) )->run() );
		$this->assertFileExists( $path );
	}

	public function test_cleanup_is_scheduled_daily_and_removed_on_deactivation(): void {
		ArtifactCleanup::unschedule();
		$this->assertFalse( wp_next_scheduled( ArtifactCleanup::HOOK ) );
		\SW\Slider\Infrastructure\Lifecycle::activate();
		$this->assertNotFalse( wp_next_scheduled( ArtifactCleanup::HOOK ) );
		$this->assertSame( 'daily', wp_get_schedule( ArtifactCleanup::HOOK ) );
		\SW\Slider\Infrastructure\Lifecycle::deactivate();
		$this->assertFalse( wp_next_scheduled( ArtifactCleanup::HOOK ) );
	}

	public function test_layers_keep_layout_animation_and_rotation_on_separate_elements(): void {
		$id   = $this->publish_two_slides( false );
		$html = do_shortcode( '[sw_slider id="' . $id . '"]' );
		$this->assertMatchesRegularExpression( '/<div class="sws-layer [^"]*" data-sws-layer="first-image"><div class="sws-layer__anim"><div class="sws-layer__body">/', $html );
	}

	public function test_stage_reserves_its_height_per_breakpoint(): void {
		$document = json_decode( (string) file_get_contents( dirname( __DIR__, 2 ) . '/fixtures/documents/valid/basic.json' ), true ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		$css      = \SW\Slider\Rendering\StyleSerializer::document_css( $document, 'abc' );
		$this->assertStringContainsString( '.sws-stage{aspect-ratio:1440 / 600;}', $css );
		$this->assertStringContainsString( 'aspect-ratio:390 / 520', $css );
	}

	public function test_late_embedding_prints_its_styles_before_the_markup(): void {
		$id = $this->publish_two_slides( false );
		wp_styles()->done = array();
		$GLOBALS['wp_actions']['wp_head'] = 1; // Simulates a template embedding after `<head>` was printed.
		$html                             = do_shortcode( '[sw_slider id="' . $id . '"]' );
		unset( $GLOBALS['wp_actions']['wp_head'] );
		$this->assertStringStartsWith( '<link', ltrim( $html ) );
		$this->assertLessThan( strpos( $html, '<section' ), strpos( $html, 'sws-runtime' ), 'styles precede the slider markup' );
		$this->assertTrue( wp_script_is( 'sws-runtime', 'enqueued' ), 'runtime script is printed in the footer' );
	}
}

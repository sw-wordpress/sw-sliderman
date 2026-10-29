<?php
/**
 * WordPress integration: persistence, versions, permissions, publishing and output.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

use SW\Slider\Infrastructure\Capabilities;

/**
 * Exercises the real REST API, post type storage, revisions and the shortcode renderer.
 */
final class SliderRestTest extends WP_UnitTestCase {

	private int $admin;

	public function set_up(): void {
		parent::set_up();
		Capabilities::grant_defaults();
		$this->admin = self::factory()->user->create( array( 'role' => 'administrator' ) );
		wp_set_current_user( $this->admin );
		do_action( 'rest_api_init' );
	}

	/**
	 * @param array<string, mixed>|null $body JSON body.
	 */
	private function request( string $method, string $route, ?array $body = null ): WP_REST_Response {
		$request = new WP_REST_Request( $method, '/sw-sliderman/v1' . $route );
		if ( null !== $body ) {
			$request->set_header( 'Content-Type', 'application/json' );
			$request->set_body( (string) wp_json_encode( $body ) );
		}
		return rest_get_server()->dispatch( $request );
	}

	/** Creates a slider and returns its detail response data. */
	private function create( string $title = 'Test' ): array {
		$response = $this->request( 'POST', '/sliders', array( 'title' => $title ) );
		$this->assertSame( 201, $response->get_status() );
		return $response->get_data();
	}

	/**
	 * Draft document as associative array (as a browser would send it).
	 *
	 * @return array<string, mixed>
	 */
	private function document_of( array $detail ): array {
		return json_decode( (string) wp_json_encode( $detail['document'] ), true );
	}

	/** Text that typically breaks naive JSON storage in post_content. */
	private const TRICKY = "Quote \" backslash \\ zero \\0 slash / <b>tag</b> & amp ' apos – ÄÖÜäöüß € 😀\nnew line";

	/**
	 * @return array<string, mixed>
	 */
	private function with_text_layer( array $document, string $text ): array {
		$document['slides'][0]['layers'][] = array(
			'id'        => 'headline',
			'type'      => 'text',
			'name'      => 'Headline',
			'locked'    => false,
			'content'   => array(
				'text' => $text,
				'tag'  => 'h2',
			),
			'layout'    => array(
				'x'        => 10,
				'y'        => 20,
				'width'    => 600,
				'height'   => 100,
				'anchorX'  => 'left',
				'anchorY'  => 'top',
				'rotation' => 0,
				'visible'  => true,
			),
			'style'     => array(
				'fontRef'         => null,
				'fontSize'        => 48,
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
					'preset'     => 'fade',
					'startMs'    => 0,
					'durationMs' => 500,
					'easing'     => 'ease-out',
					'distance'   => 0,
				),
				'exit'  => array( 'mode' => 'slide-end' ),
			),
		);
		return $document;
	}

	public function test_tricky_text_survives_save_and_load_for_users_without_unfiltered_html(): void {
		$detail   = $this->create();
		$document = $this->with_text_layer( $this->document_of( $detail ), self::TRICKY );

		// KSES runs for users without unfiltered_html; the storage encoding must survive it.
		$editor = self::factory()->user->create( array( 'role' => 'editor' ) );
		get_userdata( $editor )->add_cap( Capabilities::EDIT );
		add_filter(
			'map_meta_cap',
			static fn ( array $caps, string $cap ): array => 'unfiltered_html' === $cap ? array( 'do_not_allow' ) : $caps,
			10,
			2
		);
		wp_set_current_user( $editor );
		kses_init();

		$saved = $this->request(
			'PUT',
			'/sliders/' . $detail['id'],
			array(
				'title'           => 'Täst <b>',
				'expectedVersion' => 1,
				'document'        => $document,
			)
		);
		$this->assertSame( 200, $saved->get_status(), wp_json_encode( $saved->get_data() ) );
		$this->assertSame( 2, $saved->get_data()['version'] );

		$loaded = $this->request( 'GET', '/sliders/' . $detail['id'] )->get_data();
		$this->assertSame( self::TRICKY, $this->document_of( $loaded )['slides'][0]['layers'][0]['content']['text'] );
		$this->assertSame( $document['slides'][0]['layers'][0]['style'], $this->document_of( $loaded )['slides'][0]['layers'][0]['style'] );
		$this->assertSame( 'Täst', $loaded['title'] );
		$this->assertMatchesRegularExpression( '/^[\x20-\x7E]+$/', get_post( $detail['id'] )->post_content, 'stored JSON is plain ASCII' );
		kses_remove_filters();
	}

	public function test_outdated_version_returns_409_and_keeps_the_newer_draft(): void {
		$detail   = $this->create();
		$document = $this->document_of( $detail );
		$first    = $this->request( 'PUT', '/sliders/' . $detail['id'], array( 'title' => 'A', 'expectedVersion' => 1, 'document' => $document ) );
		$this->assertSame( 200, $first->get_status() );

		$document['slides'][0]['name'] = 'Overwritten?';
		$second                        = $this->request( 'PUT', '/sliders/' . $detail['id'], array( 'title' => 'B', 'expectedVersion' => 1, 'document' => $document ) );
		$this->assertSame( 409, $second->get_status() );
		$this->assertSame( 'sws_revision_conflict', $second->as_error()->get_error_code() );
		$this->assertSame( 2, $second->as_error()->get_error_data()['currentVersion'] );

		$loaded = $this->request( 'GET', '/sliders/' . $detail['id'] )->get_data();
		$this->assertSame( 'A', $loaded['title'] );
		$this->assertNotSame( 'Overwritten?', $loaded['document']->slides[0]->name );
	}

	public function test_saves_create_revisions(): void {
		$detail = $this->create();
		$doc    = $this->document_of( $detail );
		$doc['slides'][0]['name'] = 'Changed';
		$this->request( 'PUT', '/sliders/' . $detail['id'], array( 'title' => 'T', 'expectedVersion' => 1, 'document' => $doc ) );
		$this->assertNotEmpty( wp_get_post_revisions( $detail['id'] ) );
	}

	public function test_invalid_document_is_rejected_with_issue_paths(): void {
		$detail = $this->create();
		$doc    = $this->with_text_layer( $this->document_of( $detail ), 'x' );
		$doc['slides'][0]['layers'][0]['style']['color'] = 'red;background:url(//evil)';
		$response = $this->request( 'PUT', '/sliders/' . $detail['id'], array( 'title' => 'T', 'expectedVersion' => 1, 'document' => $doc ) );
		$this->assertSame( 422, $response->get_status() );
		$this->assertSame(
			array(
				array(
					'path' => '/slides/0/layers/0/style/color',
					'code' => 'pattern',
				),
			),
			$response->as_error()->get_error_data()['issues']
		);
	}

	public function test_document_identity_is_immutable(): void {
		$detail       = $this->create();
		$doc          = $this->document_of( $detail );
		$doc['id']    = 'another-document';
		$response     = $this->request( 'PUT', '/sliders/' . $detail['id'], array( 'title' => 'T', 'expectedVersion' => 1, 'document' => $doc ) );
		$this->assertSame( 422, $response->get_status() );
		$this->assertSame( 'immutable', $response->as_error()->get_error_data()['issues'][0]['code'] );
	}

	public function test_permissions(): void {
		$detail     = $this->create();
		$subscriber = self::factory()->user->create( array( 'role' => 'subscriber' ) );
		wp_set_current_user( $subscriber );
		$this->assertSame( 403, $this->request( 'GET', '/sliders/' . $detail['id'] )->get_status() );
		$this->assertSame( 403, $this->request( 'GET', '/sliders' )->get_status() );
		$this->assertSame( 403, $this->request( 'POST', '/sliders/' . $detail['id'] . '/publish', array( 'version' => 1 ) )->get_status() );
		$this->assertSame( 403, $this->request( 'POST', '/fonts', array( 'familyId' => 'lato' ) )->get_status() );

		$editor = self::factory()->user->create( array( 'role' => 'editor' ) );
		get_userdata( $editor )->add_cap( Capabilities::EDIT );
		wp_set_current_user( $editor );
		$this->assertSame( 200, $this->request( 'GET', '/sliders/' . $detail['id'] )->get_status() );
		$this->assertSame( 403, $this->request( 'POST', '/sliders/' . $detail['id'] . '/publish', array( 'version' => 1 ) )->get_status(), 'edit without publish capability' );

		wp_set_current_user( 0 );
		$this->assertSame( 401, $this->request( 'GET', '/sliders/' . $detail['id'] )->get_status() );
	}

	public function test_other_post_types_are_not_reachable_as_sliders(): void {
		$page = self::factory()->post->create( array( 'post_type' => 'page' ) );
		$this->assertSame( 404, $this->request( 'GET', '/sliders/' . $page )->get_status() );
	}

	public function test_publish_requires_current_version_and_existing_resources(): void {
		$detail = $this->create();
		$this->assertSame( 409, $this->request( 'POST', '/sliders/' . $detail['id'] . '/publish', array( 'version' => 5 ) )->get_status() );

		$doc = $this->document_of( $detail );
		$doc['slides'][0]['background']['attachmentId'] = 999999;
		$this->request( 'PUT', '/sliders/' . $detail['id'], array( 'title' => 'T', 'expectedVersion' => 1, 'document' => $doc ) );
		$response = $this->request( 'POST', '/sliders/' . $detail['id'] . '/publish', array( 'version' => 2 ) );
		$this->assertSame( 422, $response->get_status() );
		$this->assertSame( 'missing_resource', $response->as_error()->get_error_data()['issues'][0]['code'] );
		$this->assertStringContainsString( 'sws-diagnostic', do_shortcode( '[sw_slider id="' . $detail['id'] . '"]' ), 'editors see why nothing is shown' );
		wp_set_current_user( 0 );
		$this->assertSame( '', do_shortcode( '[sw_slider id="' . $detail['id'] . '"]' ), 'visitors see nothing' );
	}

	public function test_published_output_is_static_escaped_and_independent_of_later_drafts(): void {
		$detail = $this->create( 'Hero' );
		$doc    = $this->with_text_layer( $this->document_of( $detail ), "Hello <script>alert(1)</script>\nWorld" );
		$doc['slides'][] = array_merge(
			$doc['slides'][0],
			array(
				'id'     => 'second',
				'name'   => 'Second',
				'layers' => array(),
			)
		);
		$this->request( 'PUT', '/sliders/' . $detail['id'], array( 'title' => 'Hero', 'expectedVersion' => 1, 'document' => $doc ) );
		$published = $this->request( 'POST', '/sliders/' . $detail['id'] . '/publish', array( 'version' => 2 ) );
		$this->assertSame( 200, $published->get_status(), wp_json_encode( $published->get_data() ) );

		$doc['slides'][0]['layers'][0]['content']['text'] = 'Draft only';
		$this->request( 'PUT', '/sliders/' . $detail['id'], array( 'title' => 'Hero', 'expectedVersion' => 2, 'document' => $doc ) );

		wp_set_current_user( 0 );
		$html = do_shortcode( '[sw_slider id="' . $detail['id'] . '"][sw_slider id="' . $detail['id'] . '"]' );
		$this->assertStringContainsString( "Hello &lt;script&gt;alert(1)&lt;/script&gt;<br>\nWorld", $html );
		$this->assertStringNotContainsString( '<script>alert', $html );
		$this->assertStringNotContainsString( 'Draft only', $html, 'drafts are never public' );
		$this->assertSame( 2, substr_count( $html, 'data-sws-slider' ), 'two instances' );
		$this->assertMatchesRegularExpression( '/id="sws-' . $detail['id'] . '-1".*id="sws-' . $detail['id'] . '-2"/s', $html, 'unique instance ids' );
		$this->assertMatchesRegularExpression( '/<div class="sws-slide [^"]*sws-is-active"[^>]*role="group"/', $html, 'first slide visible' );
		$this->assertMatchesRegularExpression( '/<div class="sws-slide sws-sl-second"[^>]*hidden inert>/', $html, 'later slides hidden and inert' );
		$this->assertTrue( wp_style_is( 'sws-runtime', 'enqueued' ) );
		$this->assertTrue( wp_script_is( 'sws-runtime', 'enqueued' ) );

		$this->assertSame( 'changed', $this->request_as_admin_status( $detail['id'] ) );
	}

	private function request_as_admin_status( int $id ): string {
		wp_set_current_user( $this->admin );
		return $this->request( 'GET', '/sliders/' . $id )->get_data()['status'];
	}

	public function test_invalid_shortcode_ids_render_nothing_for_visitors_and_a_note_for_editors(): void {
		wp_set_current_user( 0 );
		$this->assertSame( '', do_shortcode( '[sw_slider id="12abc"]' ) );
		$this->assertSame( '', do_shortcode( '[sw_slider id="999999"]' ) );
		wp_set_current_user( $this->admin );
		$this->assertStringContainsString( 'sws-diagnostic', do_shortcode( '[sw_slider id="999999"]' ) );
	}

	public function test_javascript_links_cannot_be_saved(): void {
		$detail = $this->create();
		$doc    = $this->with_text_layer( $this->document_of( $detail ), 'x' );
		$layer  = $doc['slides'][0]['layers'][0];
		$layer['id']      = 'cta';
		$layer['type']    = 'button';
		$layer['content'] = array(
			'label'  => 'Click',
			'url'    => 'JavaScript:alert(1)',
			'newTab' => false,
		);
		$doc['slides'][0]['layers'][] = $layer;
		$response = $this->request( 'PUT', '/sliders/' . $detail['id'], array( 'title' => 'T', 'expectedVersion' => 1, 'document' => $doc ) );
		$this->assertSame( 422, $response->get_status() );
		$this->assertSame( 'url', $response->as_error()->get_error_data()['issues'][0]['code'] );
	}

	public function test_oversized_body_is_rejected(): void {
		$detail  = $this->create();
		$request = new WP_REST_Request( 'PUT', '/sw-sliderman/v1/sliders/' . $detail['id'] );
		$request->set_header( 'Content-Type', 'application/json' );
		$request->set_body( '{"title":"' . str_repeat( 'x', 600000 ) . '"}' );
		$this->assertSame( 413, rest_get_server()->dispatch( $request )->get_status() );
	}
}

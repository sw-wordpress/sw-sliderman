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
		$first    = $this->request(
			'PUT',
			'/sliders/' . $detail['id'],
			array(
				'title'           => 'A',
				'expectedVersion' => 1,
				'document'        => $document,
			)
		);
		$this->assertSame( 200, $first->get_status() );

		$document['slides'][0]['name'] = 'Overwritten?';
		$second                        = $this->request(
			'PUT',
			'/sliders/' . $detail['id'],
			array(
				'title'           => 'B',
				'expectedVersion' => 1,
				'document'        => $document,
			)
		);
		$this->assertSame( 409, $second->get_status() );
		$this->assertSame( 'sws_revision_conflict', $second->as_error()->get_error_code() );
		$this->assertSame( 2, $second->as_error()->get_error_data()['currentVersion'] );

		$loaded = $this->request( 'GET', '/sliders/' . $detail['id'] )->get_data();
		$this->assertSame( 'A', $loaded['title'] );
		$this->assertNotSame( 'Overwritten?', $loaded['document']->slides[0]->name );
	}

	public function test_saves_create_revisions(): void {
		$detail                   = $this->create();
		$doc                      = $this->document_of( $detail );
		$doc['slides'][0]['name'] = 'Changed';
		$this->request(
			'PUT',
			'/sliders/' . $detail['id'],
			array(
				'title'           => 'T',
				'expectedVersion' => 1,
				'document'        => $doc,
			)
		);
		$this->assertNotEmpty( wp_get_post_revisions( $detail['id'] ) );
	}

	public function test_invalid_document_is_rejected_with_issue_paths(): void {
		$detail = $this->create();
		$doc    = $this->with_text_layer( $this->document_of( $detail ), 'x' );
		$doc['slides'][0]['layers'][0]['style']['color'] = 'red;background:url(//evil)';
		$response                                        = $this->request(
			'PUT',
			'/sliders/' . $detail['id'],
			array(
				'title'           => 'T',
				'expectedVersion' => 1,
				'document'        => $doc,
			)
		);
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
		$detail    = $this->create();
		$doc       = $this->document_of( $detail );
		$doc['id'] = 'another-document';
		$response  = $this->request(
			'PUT',
			'/sliders/' . $detail['id'],
			array(
				'title'           => 'T',
				'expectedVersion' => 1,
				'document'        => $doc,
			)
		);
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
		$this->request(
			'PUT',
			'/sliders/' . $detail['id'],
			array(
				'title'           => 'T',
				'expectedVersion' => 1,
				'document'        => $doc,
			)
		);
		$response = $this->request( 'POST', '/sliders/' . $detail['id'] . '/publish', array( 'version' => 2 ) );
		$this->assertSame( 422, $response->get_status() );
		$this->assertSame( 'missing_resource', $response->as_error()->get_error_data()['issues'][0]['code'] );
		$this->assertStringContainsString( 'sws-diagnostic', do_shortcode( '[sw_slider id="' . $detail['id'] . '"]' ), 'editors see why nothing is shown' );
		wp_set_current_user( 0 );
		$this->assertSame( '', do_shortcode( '[sw_slider id="' . $detail['id'] . '"]' ), 'visitors see nothing' );
	}

	public function test_published_output_is_static_escaped_and_independent_of_later_drafts(): void {
		$detail          = $this->create( 'Hero' );
		$doc             = $this->with_text_layer( $this->document_of( $detail ), "Hello <script>alert(1)</script>\nWorld" );
		$doc['slides'][] = array_merge(
			$doc['slides'][0],
			array(
				'id'     => 'second',
				'name'   => 'Second',
				'layers' => array(),
			)
		);
		$this->request(
			'PUT',
			'/sliders/' . $detail['id'],
			array(
				'title'           => 'Hero',
				'expectedVersion' => 1,
				'document'        => $doc,
			)
		);
		$published = $this->request( 'POST', '/sliders/' . $detail['id'] . '/publish', array( 'version' => 2 ) );
		$this->assertSame( 200, $published->get_status(), wp_json_encode( $published->get_data() ) );

		$doc['slides'][0]['layers'][0]['content']['text'] = 'Draft only';
		$this->request(
			'PUT',
			'/sliders/' . $detail['id'],
			array(
				'title'           => 'Hero',
				'expectedVersion' => 2,
				'document'        => $doc,
			)
		);

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
		$detail                       = $this->create();
		$doc                          = $this->with_text_layer( $this->document_of( $detail ), 'x' );
		$layer                        = $doc['slides'][0]['layers'][0];
		$layer['id']                  = 'cta';
		$layer['type']                = 'button';
		$layer['content']             = array(
			'label'  => 'Click',
			'url'    => 'JavaScript:alert(1)',
			'newTab' => false,
		);
		$doc['slides'][0]['layers'][] = $layer;
		$response                     = $this->request(
			'PUT',
			'/sliders/' . $detail['id'],
			array(
				'title'           => 'T',
				'expectedVersion' => 1,
				'document'        => $doc,
			)
		);
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
	public function test_duplicate_remaps_local_ids_and_keeps_resources_pinned(): void {
		$detail    = $this->create();
		$doc       = json_decode( (string) file_get_contents( dirname( __DIR__, 2 ) . '/fixtures/documents/valid/basic.json' ), true );
		$doc['id'] = $detail['document']->id;
		$this->assertSame(
			200,
			$this->request(
				'PUT',
				'/sliders/' . $detail['id'],
				array(
					'title'           => 'Original',
					'expectedVersion' => 1,
					'document'        => $doc,
				)
			)->get_status()
		);
		$response = $this->request( 'POST', '/sliders/' . $detail['id'] . '/duplicate', array( 'title' => 'Copy' ) );
		$this->assertSame( 201, $response->get_status(), wp_json_encode( $response->get_data() ) );
		$copy = $this->document_of( $response->get_data() );
		$this->assertNotSame( $doc['id'], $copy['id'] );
		$this->assertNotSame( $doc['slides'][0]['id'], $copy['slides'][0]['id'] );
		$this->assertNotSame( $doc['slides'][0]['layers'][0]['id'], $copy['slides'][0]['layers'][0]['id'] );
		$this->assertNotSame( $doc['fontRefs'][0]['id'], $copy['fontRefs'][0]['id'] );
		$this->assertSame( $copy['fontRefs'][0]['id'], $copy['slides'][0]['layers'][0]['style']['fontRef'] );
		$this->assertSame( $doc['fontRefs'][0]['installationId'], $copy['fontRefs'][0]['installationId'] );
		$this->assertSame( 'unpublished', $response->get_data()['status'] );
	}

	public function test_revision_restore_creates_a_draft_and_preserves_live_output(): void {
		$detail = $this->create();
		$doc    = $this->with_text_layer( $this->document_of( $detail ), 'Live text' );
		$this->request(
			'PUT',
			'/sliders/' . $detail['id'],
			array(
				'title'           => 'Live',
				'expectedVersion' => 1,
				'document'        => $doc,
			)
		);
		$this->assertSame( 200, $this->request( 'POST', '/sliders/' . $detail['id'] . '/publish', array( 'version' => 2 ) )->get_status() );
		$doc['slides'][0]['layers'][0]['content']['text'] = 'New draft';
		$this->request(
			'PUT',
			'/sliders/' . $detail['id'],
			array(
				'title'           => 'New',
				'expectedVersion' => 2,
				'document'        => $doc,
			)
		);
		$revisions = $this->request( 'GET', '/sliders/' . $detail['id'] . '/revisions' )->get_data();
		$old       = array_values( array_filter( $revisions, static fn ( array $item ): bool => 'Live' === $item['title'] ) )[0];
		$result    = $this->request(
			'POST',
			'/sliders/' . $detail['id'] . '/restore',
			array(
				'revisionId'      => $old['id'],
				'expectedVersion' => 3,
			)
		);
		$this->assertSame( 200, $result->get_status(), wp_json_encode( $result->get_data() ) );
		$this->assertSame( 4, $result->get_data()['version'] );
		$loaded = $this->request( 'GET', '/sliders/' . $detail['id'] )->get_data();
		$this->assertSame( 'Live text', $loaded['document']->slides[0]->layers[0]->content->text );
		$this->assertSame( 2, $loaded['published']['version'] );
		wp_set_current_user( 0 );
		$this->assertStringContainsString( 'Live text', do_shortcode( '[sw_slider id="' . $detail['id'] . '"]' ) );
	}

	public function test_autosave_is_separate_and_foreign_revisions_cannot_be_restored(): void {
		$first                    = $this->create();
		$second                   = $this->create();
		$doc                      = $this->document_of( $first );
		$doc['slides'][0]['name'] = 'Recovery only';
		$response                 = $this->request(
			'POST',
			'/sliders/' . $first['id'] . '/autosave',
			array(
				'title'           => 'Recovery',
				'expectedVersion' => 1,
				'document'        => $doc,
			)
		);
		$this->assertSame( 200, $response->get_status(), wp_json_encode( $response->get_data() ) );
		$loaded = $this->request( 'GET', '/sliders/' . $first['id'] )->get_data();
		$this->assertSame( 1, $loaded['version'] );
		$this->assertNotSame( 'Recovery only', $loaded['document']->slides[0]->name );
		$this->assertSame(
			404,
			$this->request(
				'POST',
				'/sliders/' . $second['id'] . '/restore',
				array(
					'revisionId'      => $response->get_data()['revisionId'],
					'expectedVersion' => 1,
				)
			)->get_status()
		);
		$this->assertSame(
			200,
			$this->request(
				'POST',
				'/sliders/' . $first['id'] . '/restore',
				array(
					'revisionId'      => $response->get_data()['revisionId'],
					'expectedVersion' => 1,
				)
			)->get_status()
		);
	}

	public function test_failed_version_write_rolls_back_the_document(): void {
		$detail                   = $this->create();
		$doc                      = $this->document_of( $detail );
		$doc['slides'][0]['name'] = 'Must roll back';
		$fail                     = static fn ( mixed $check, int $id, string $key ): mixed => '_sws_version' === $key ? false : $check;
		add_filter( 'update_post_metadata', $fail, 10, 3 );
		try {
			$response = $this->request(
				'PUT',
				'/sliders/' . $detail['id'],
				array(
					'title'           => 'Changed',
					'expectedVersion' => 1,
					'document'        => $doc,
				)
			);
		} finally {
			remove_filter( 'update_post_metadata', $fail, 10 ); }
		$this->assertSame( 500, $response->get_status() );
		$loaded = $this->request( 'GET', '/sliders/' . $detail['id'] )->get_data();
		$this->assertSame( 1, $loaded['version'] );
		$this->assertSame( $detail['title'], $loaded['title'] );
		$this->assertSame( $detail['document']->slides[0]->name, $loaded['document']->slides[0]->name );
	}

	public function test_generic_wordpress_writes_cannot_bypass_validation_and_versioning(): void {
		$detail = $this->create();
		$result = wp_update_post(
			array(
				'ID'           => $detail['id'],
				'post_content' => '{}',
			),
			true
		);
		$this->assertWPError( $result );
		$this->assertSame( $detail['document']->id, $this->request( 'GET', '/sliders/' . $detail['id'] )->get_data()['document']->id );
	}

	public function test_object_permission_revocation_applies_to_every_draft_route(): void {
		$detail = $this->create();
		$deny   = static fn ( array $caps, string $cap, int $user, array $args ): array => in_array( $cap, array( 'edit_post', Capabilities::EDIT ), true ) && (int) ( $args[0] ?? 0 ) === $detail['id'] ? array( 'do_not_allow' ) : $caps;
		add_filter( 'map_meta_cap', $deny, 10, 4 );
		try {
			foreach ( array( array( 'GET', '' ), array( 'PUT', '' ), array( 'DELETE', '' ), array( 'GET', '/revisions' ), array( 'POST', '/restore' ), array( 'POST', '/duplicate' ), array( 'POST', '/publish' ), array( 'POST', '/autosave' ) ) as $route ) {
				$this->assertSame( 403, $this->request( $route[0], '/sliders/' . $detail['id'] . $route[1] )->get_status(), $route[0] . $route[1] );
			}
			$listed = $this->request( 'GET', '/sliders' )->get_data();
			$this->assertNotContains( $detail['id'], array_column( $listed, 'id' ) );
		} finally {
			remove_filter( 'map_meta_cap', $deny, 10 ); }
	}
	private function service( ?\SW\Slider\Application\ArtifactStore $store = null ): \SW\Slider\Application\SliderService {
		global $wpdb;
		return new \SW\Slider\Application\SliderService(
			new \SW\Slider\Infrastructure\WpSliderRepository( $wpdb ),
			new \SW\Slider\Domain\DocumentValidator(),
			new \SW\Slider\Infrastructure\WpResourceChecker( new \SW\Slider\Fonts\WpFontRepository(), new \SW\Slider\Fonts\UploadsFontStorage() ),
			$store ?? new \SW\Slider\Infrastructure\UploadsArtifactStore(),
			new \SW\Slider\Rendering\CssArtifactBuilder(),
			new \SW\Slider\Infrastructure\WpSystemPorts(),
			(string) file_get_contents( SWS_DIR . 'schemas/defaults/new-slider.json' )
		);
	}

	public function test_artifact_failure_preserves_the_last_publication(): void {
		$detail = $this->create();
		$this->assertSame( 200, $this->request( 'POST', '/sliders/' . $detail['id'] . '/publish', array( 'version' => 1 ) )->get_status() );
		$before = get_post_meta( $detail['id'], '_sws_published', true );
		$store  = new class() implements \SW\Slider\Application\ArtifactStore {
			public function store_stylesheet( string $name, string $css ): ?string {
				return null; }
		};
		try {
			$this->service( $store )->publish( $detail['id'], 1 );
			$this->fail( 'Publication should fail.' ); } catch ( \SW\Slider\Application\StorageFailure ) {
			$this->assertSame( $before, get_post_meta( $detail['id'], '_sws_published', true ) ); }
	}

	public function test_failed_publication_metadata_write_keeps_the_live_snapshot(): void {
		$detail = $this->create();
		$this->request( 'POST', '/sliders/' . $detail['id'] . '/publish', array( 'version' => 1 ) );
		$before                   = get_post_meta( $detail['id'], '_sws_published', true );
		$doc                      = $this->document_of( $detail );
		$doc['slides'][0]['name'] = 'New draft';
		$this->request(
			'PUT',
			'/sliders/' . $detail['id'],
			array(
				'title'           => 'New',
				'expectedVersion' => 1,
				'document'        => $doc,
			)
		);
		$fail = static fn ( mixed $check, int $id, string $key ): mixed => '_sws_published' === $key ? false : $check;
		add_filter( 'update_post_metadata', $fail, 10, 3 );
		try {
			$response = $this->request( 'POST', '/sliders/' . $detail['id'] . '/publish', array( 'version' => 2 ) ); } finally {
			remove_filter( 'update_post_metadata', $fail, 10 ); }
			$this->assertSame( 500, $response->get_status() );
			$this->assertSame( $before, get_post_meta( $detail['id'], '_sws_published', true ) );
	}

	public function test_two_independent_processes_cannot_both_save_the_same_version(): void {
		$detail    = $this->create();
		$processes = array();
		foreach ( array( 'Writer A', 'Writer B' ) as $title ) {
			$process = proc_open( array( PHP_BINARY, dirname( __DIR__ ) . '/workers/save.php', (string) $this->admin, (string) $detail['id'], $title ), array( array( 'pipe', 'r' ), array( 'pipe', 'w' ), array( 'pipe', 'w' ) ), $pipes );
			$this->assertIsResource( $process );
			stream_set_timeout( $pipes[1], 20 );
			$this->assertSame( "ready\n", fgets( $pipes[1] ) );
			$processes[] = array( $process, $pipes );
		}
		foreach ( $processes as $entry ) {
			fwrite( $entry[1][0], "go\n" );
			fclose( $entry[1][0] ); }
		$statuses = array();
		foreach ( $processes as $entry ) {
			$result = json_decode( stream_get_contents( $entry[1][1] ), true );
			$stderr = stream_get_contents( $entry[1][2] );
			fclose( $entry[1][1] );
			fclose( $entry[1][2] );
			$this->assertSame( 0, proc_close( $entry[0] ), $stderr );
			$this->assertSame( 2, $result['version'] );
			$statuses[] = $result['status'];
		}
		sort( $statuses );
		$this->assertSame( array( 200, 409 ), $statuses );
			// The test harness disables autocommit; end its read snapshot before observing workers.
			self::commit_transaction();
		$loaded = $this->request( 'GET', '/sliders/' . $detail['id'] )->get_data();
		$this->assertSame( 2, $loaded['version'] );
		$this->assertSame( $loaded['title'], $loaded['document']->slides[0]->name );
	}
	public function test_draft_preview_is_private_object_bound_and_does_not_publish(): void {
		global $wpdb;
		$detail   = $this->create();
		$service  = $this->service();
		$assets   = new \SW\Slider\Rendering\Assets( new \SW\Slider\Infrastructure\WpSliderRepository( $wpdb ), new \SW\Slider\Fonts\WpFontRepository(), SWS_URL, SWS_DIR, SWS_VERSION );
		$renderer = new \SW\Slider\Rendering\SliderRenderer( new \SW\Slider\Infrastructure\WpSliderRepository( $wpdb ), $assets );
		$preview  = new \SW\Slider\Admin\DraftPreview( $service, $renderer );
		$nonce    = wp_create_nonce( 'sws_preview_' . $detail['id'] );
		$this->assertTrue( $preview->can_preview( $detail['id'], $nonce ) );
		$this->assertFalse( $preview->can_preview( $detail['id'], '' ) );
		$other = $this->create();
		$this->assertFalse( $preview->can_preview( $other['id'], $nonce ) );
		$this->assertStringNotContainsString( '&amp;', $detail['previewUrl'] );
		$this->assertStringContainsString( 'data-sws-slider', $renderer->render_preview( $service->get( $detail['id'] ) ) );
		$this->assertSame( '', get_post_meta( $detail['id'], '_sws_published', true ) );
		wp_set_current_user( 0 );
		$this->assertFalse( $preview->can_preview( $detail['id'], $nonce ) );
		$this->assertSame( '', do_shortcode( '[sw_slider id="' . $detail['id'] . '"]' ) );
	}
	public function test_migration_is_explicit_and_unknown_versions_leave_the_source_intact(): void {
		global $wpdb;
		$detail   = $this->create();
		$raw      = get_post( $detail['id'] )->post_content;
		$response = $this->request( 'POST', '/sliders/' . $detail['id'] . '/migrate', array( 'expectedVersion' => 1 ) );
		$this->assertSame( 200, $response->get_status() );
		$this->assertSame( 1, $response->get_data()['version'] );
		$future                  = $this->document_of( $detail );
		$future['schemaVersion'] = 999;
		$json                    = \SW\Slider\Domain\CanonicalJson::encode( $future );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery -- deliberately seed an unknown stored schema behind the normal write guard.
		$wpdb->update( $wpdb->posts, array( 'post_content' => $json ), array( 'ID' => $detail['id'] ) );
		clean_post_cache( $detail['id'] );
		$rejected = $this->request( 'POST', '/sliders/' . $detail['id'] . '/migrate', array( 'expectedVersion' => 1 ) );
		$this->assertSame( 422, $rejected->get_status() );
		$this->assertSame( $json, get_post( $detail['id'] )->post_content );
		$this->assertSame( 422, $this->request( 'GET', '/sliders/' . $detail['id'] )->get_status() );
		$this->assertNotSame( $raw, $json );
	}

	public function test_missing_rest_cookie_nonce_cannot_read_a_draft(): void {
		global $wp_rest_auth_cookie;
		$detail              = $this->create();
		$previous            = $wp_rest_auth_cookie;
		$wp_rest_auth_cookie = true;
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- snapshot raw fixture state solely for restoration after the missing-nonce test.
		$request_before = $_REQUEST;
		$server_before  = $_SERVER;
		unset( $_REQUEST['_wpnonce'], $_SERVER['HTTP_X_WP_NONCE'] );
		try {
			$this->assertTrue( rest_cookie_check_errors( null ) );
			$this->assertSame( 0, get_current_user_id() );
			$this->assertSame( 401, $this->request( 'GET', '/sliders/' . $detail['id'] )->get_status() );
		} finally {
			$wp_rest_auth_cookie = $previous;
			$_REQUEST            = $request_before;
			$_SERVER             = $server_before;
		}
	}

	public function test_a_later_draft_title_does_not_leak_into_the_live_accessible_name(): void {
		$detail = $this->create( 'Public title' );
		$this->request( 'POST', '/sliders/' . $detail['id'] . '/publish', array( 'version' => 1 ) );
		$this->request(
			'PUT',
			'/sliders/' . $detail['id'],
			array(
				'title'           => 'Private draft title',
				'expectedVersion' => 1,
				'document'        => $this->document_of( $detail ),
			)
		);
		wp_set_current_user( 0 );
		$html = do_shortcode( '[sw_slider id="' . $detail['id'] . '"]' );
		$this->assertStringContainsString( 'aria-label="Public title"', $html );
		$this->assertStringNotContainsString( 'Private draft title', $html );
	}
	public function test_missing_image_file_blocks_publish_and_keeps_the_live_version(): void {
		$detail = $this->create();
		$this->request( 'POST', '/sliders/' . $detail['id'] . '/publish', array( 'version' => 1 ) );
		$before = get_post_meta( $detail['id'], '_sws_published', true );
		$image  = self::factory()->attachment->create( array( 'post_mime_type' => 'image/jpeg' ) );
		update_post_meta( $image, '_wp_attached_file', 'sws-nonexistent-image.jpg' );
		$this->assertTrue( wp_attachment_is_image( $image ) );
		$doc = $this->document_of( $detail );
		$doc['slides'][0]['background']['attachmentId'] = $image;
		$this->request(
			'PUT',
			'/sliders/' . $detail['id'],
			array(
				'title'           => 'Missing file',
				'expectedVersion' => 1,
				'document'        => $doc,
			)
		);
		$this->assertSame( 422, $this->request( 'POST', '/sliders/' . $detail['id'] . '/publish', array( 'version' => 2 ) )->get_status() );
		$this->assertSame( $before, get_post_meta( $detail['id'], '_sws_published', true ) );
	}

	public function test_deleted_font_file_is_detected_even_when_its_stylesheet_still_exists(): void {
		$storage   = new \SW\Slider\Fonts\UploadsFontStorage();
		$repo      = new \SW\Slider\Fonts\WpFontRepository();
		$checker   = new \SW\Slider\Infrastructure\WpResourceChecker( $repo, $storage );
		$directory = 'fonts/' . substr( hash( 'sha256', wp_generate_uuid4() ), 0, 24 );
		$bytes     = 'font-resource';
		$hash      = hash( 'sha256', $bytes );
		$variants  = array(
			array(
				'weight' => 400,
				'style'  => 'normal',
				'files'  => array(
					array(
						'file'         => $hash . '.woff2',
						'sha256'       => $hash,
						'sizeBytes'    => strlen( $bytes ),
						'subset'       => 'latin',
						'unicodeRange' => 'U+0000-00FF',
					),
				),
			),
		);
		$temp      = $storage->create_temp();
		$storage->write( $temp, $hash . '.woff2', $bytes );
		$storage->write( $temp, 'font.css', \SW\Slider\Fonts\LocalFontCss::build( 'sws-test-installation', $variants ) );
		$storage->write( $temp, 'LICENSE.txt', 'Test license' );
		$storage->activate( $temp, $directory );
		try {
			$repo->save(
				array(
					'id'           => 'test-installation',
					'familyId'     => 'test',
					'family'       => 'Test',
					'category'     => 'sans-serif',
					'directory'    => $directory,
					'stylesheet'   => $directory . '/font.css',
					'variants'     => $variants,
					'license'      => array(
						'id'         => 'test',
						'file'       => $directory . '/LICENSE.txt',
						'sourcePath' => 'test',
					),
					'source'       => array(
						'provider'       => 'test',
						'catalogVersion' => '1',
					),
					'installedGmt' => gmdate( 'Y-m-d H:i:s' ),
				)
			);
			$doc             = $this->document_of( $this->create() );
			$doc['fontRefs'] = array(
				array(
					'id'             => 'font',
					'installationId' => 'test-installation',
					'weight'         => 400,
					'style'          => 'normal',
				),
			);
			$this->assertSame( array(), $checker->missing_resources( $doc ) );
			wp_delete_file( \SW\Slider\Infrastructure\UploadPaths::path( $directory . '/' . $hash . '.woff2' ) );
			$this->assertTrue( $storage->exists( $directory ) );
			$this->assertSame( 'missing_resource', $checker->missing_resources( $doc )[0]->code );
		} finally {
			$storage->discard( $temp );
			$storage->remove( $directory ); }
	}
	public function test_rejected_trash_is_not_reported_as_success(): void {
		$detail = $this->create();
		add_filter( 'pre_trash_post', '__return_false' );
		try {
			$response = $this->request( 'DELETE', '/sliders/' . $detail['id'] ); } finally {
			remove_filter( 'pre_trash_post', '__return_false' ); }
			$this->assertSame( 500, $response->get_status() );
			$this->assertSame( 200, $this->request( 'GET', '/sliders/' . $detail['id'] )->get_status() );
	}
}

<?php
/**
 * Slider REST endpoints.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Rest;

use SW\Slider\Application\SliderService;
use SW\Slider\Application\StoredSlider;
use SW\Slider\Application\SliderRevision;
use SW\Slider\Domain\CanonicalJson;
use SW\Slider\Infrastructure\Capabilities;
use SW\Slider\Rendering\Shortcode;
use Throwable;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;

/**
 * `sw-sliderman/v1/sliders` (docs/rest-api.md).
 *
 * Cookie-authenticated requests need the REST nonce; WordPress resets the user to anonymous
 * without it, so the capability checks below fail. Capabilities are checked per route; the
 * object check (existence, post type, not trashed) happens in the service.
 */
final class SliderController {

	public const NAMESPACE = 'sw-sliderman/v1';

	public function __construct( private readonly SliderService $sliders ) {
	}

	public function register(): void {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	public function register_routes(): void {
		$id_arg = array(
			'id' => array(
				'type'     => 'integer',
				'minimum'  => 1,
				'required' => true,
			),
		);
		register_rest_route(
			self::NAMESPACE,
			'/sliders',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'list_sliders' ),
					'permission_callback' => array( $this, 'can_edit' ),
					'args'                => array(
						'page'    => array(
							'type'    => 'integer',
							'minimum' => 1,
							'default' => 1,
						),
						'perPage' => array(
							'type'    => 'integer',
							'minimum' => 1,
							'maximum' => 100,
							'default' => 20,
						),
						'search'  => array(
							'type'      => 'string',
							'default'   => '',
							'maxLength' => 100,
						),
					),
				),
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'create_slider' ),
					'permission_callback' => array( $this, 'can_edit' ),
				),
			)
		);
		register_rest_route(
			self::NAMESPACE,
			'/sliders/(?P<id>\d+)',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_slider' ),
					'permission_callback' => array( $this, 'can_edit' ),
					'args'                => $id_arg,
				),
				array(
					'methods'             => 'PUT',
					'callback'            => array( $this, 'save_slider' ),
					'permission_callback' => array( $this, 'can_edit' ),
					'args'                => $id_arg,
				),
				array(
					'methods'             => WP_REST_Server::DELETABLE,
					'callback'            => array( $this, 'trash_slider' ),
					'permission_callback' => array( $this, 'can_edit' ),
					'args'                => $id_arg,
				),
			)
		);
		register_rest_route(
			self::NAMESPACE,
			'/sliders/(?P<id>\d+)/publish',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( $this, 'publish_slider' ),
				'permission_callback' => array( $this, 'can_publish' ),
				'args'                => $id_arg,
			)
		);
		foreach ( array( 'duplicate', 'autosave', 'restore', 'migrate' ) as $action ) {
			register_rest_route(
				self::NAMESPACE,
				'/sliders/(?P<id>\d+)/' . $action,
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( $this, $action . '_slider' ),
					'permission_callback' => array( $this, 'can_edit' ),
					'args'                => $id_arg,
				)
			);
		}
		register_rest_route(
			self::NAMESPACE,
			'/sliders/(?P<id>\d+)/revisions',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'list_revisions' ),
				'permission_callback' => array( $this, 'can_edit' ),
				'args'                => $id_arg,
			)
		);
	}

	public function can_edit( ?WP_REST_Request $request = null ): bool {
		if ( ! current_user_can( Capabilities::EDIT ) ) {
			return false; }
		if ( null === $request || ! $request['id'] ) {
			return true; }
		$post = get_post( (int) $request['id'] );
		// Missing/wrong objects are handled as 404 by the service, never exposed as other posts.
		return ! $post instanceof \WP_Post || \SW\Slider\Infrastructure\PostTypes::SLIDER !== $post->post_type || current_user_can( 'edit_post', $post->ID );
	}

	public function can_publish( WP_REST_Request $request ): bool {
		return $this->can_edit( $request ) && current_user_can( Capabilities::PUBLISH );
	}

	public function list_sliders( WP_REST_Request $request ): WP_REST_Response {
		$result   = $this->sliders_list( (int) $request['page'], (int) $request['perPage'], (string) $request['search'] );
		$visible  = array_values( array_filter( $result['items'], static fn ( StoredSlider $slider ): bool => current_user_can( 'edit_post', $slider->id ) ) );
		$response = new WP_REST_Response( array_map( array( $this, 'summary' ), $visible ) );
		$response->header( 'Cache-Control', 'private, no-store' );
		$response->header( 'X-WP-Total', (string) $result['total'] );
		return $response;
	}

	/**
	 * @return array{items: list<StoredSlider>, total: int}
	 */
	private function sliders_list( int $page, int $per_page, string $search ): array {
		return $this->sliders->list_sliders( $page, $per_page, sanitize_text_field( $search ) );
	}

	public function create_slider( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$body = JsonBody::decode( $request );
		if ( $body instanceof WP_Error ) {
			return $body;
		}
		$title = JsonBody::title( $body->title ?? null );
		if ( $title instanceof WP_Error ) {
			return $title;
		}
		try {
			$id = $this->sliders->create_slider( $title );
			return new WP_REST_Response( $this->detail( $this->sliders->get( $id ) ), 201 );
		} catch ( Throwable $error ) {
			return Errors::from( $error );
		}
	}

	public function get_slider( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		try {
			$response = new WP_REST_Response( $this->detail( $this->sliders->get_draft( (int) $request['id'] ) ) );
			$response->header( 'Cache-Control', 'no-store' );
			return $response;
		} catch ( Throwable $error ) {
			return Errors::from( $error );
		}
	}

	public function save_slider( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$body = JsonBody::decode( $request );
		if ( $body instanceof WP_Error ) {
			return $body;
		}
		$title   = JsonBody::title( $body->title ?? null );
		$version = JsonBody::version( $body->expectedVersion ?? null );
		if ( $title instanceof WP_Error ) {
			return $title;
		}
		if ( $version instanceof WP_Error ) {
			return $version;
		}
		try {
			$new_version = $this->sliders->save_draft( (int) $request['id'], $title, $body->document ?? null, $version );
			return new WP_REST_Response( array( 'version' => $new_version ) );
		} catch ( Throwable $error ) {
			return Errors::from( $error );
		}
	}

	public function publish_slider( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$body = JsonBody::decode( $request );
		if ( $body instanceof WP_Error ) {
			return $body;
		}
		$version = JsonBody::version( $body->version ?? null );
		if ( $version instanceof WP_Error ) {
			return $version;
		}
		try {
			$snapshot = $this->sliders->publish( (int) $request['id'], $version );
			return new WP_REST_Response(
				array(
					'version'      => $snapshot->version,
					'publishedGmt' => $snapshot->published_gmt,
				)
			);
		} catch ( Throwable $error ) {
			return Errors::from( $error );
		}
	}

	public function migrate_slider( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$body = JsonBody::decode( $request );
		if ( $body instanceof WP_Error ) {
			return $body; }
		$version = JsonBody::version( $body->expectedVersion ?? null );
		if ( $version instanceof WP_Error ) {
			return $version; }
		try {
			return new WP_REST_Response( array( 'version' => $this->sliders->migrate_draft( (int) $request['id'], $version ) ) ); } catch ( Throwable $error ) {
			return Errors::from( $error ); }
	}

	public function duplicate_slider( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$body = JsonBody::decode( $request );
		if ( $body instanceof WP_Error ) {
			return $body; }
		$title = JsonBody::title( $body->title ?? null );
		if ( $title instanceof WP_Error ) {
			return $title; }
		try {
			$id = $this->sliders->duplicate( (int) $request['id'], $title );
			return new WP_REST_Response( $this->detail( $this->sliders->get( $id ) ), 201 );
		} catch ( Throwable $error ) {
			return Errors::from( $error ); }
	}

	public function list_revisions( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		try {
			$response = new WP_REST_Response(
				array_map(
					static fn ( SliderRevision $revision ): array => array(
						'id'          => $revision->id,
						'title'       => $revision->title,
						'modifiedGmt' => $revision->modified_gmt,
						'autosave'    => $revision->autosave,
					),
					$this->sliders->revisions( (int) $request['id'] )
				)
			);
			$response->header( 'Cache-Control', 'private, no-store' );
			return $response;
		} catch ( Throwable $error ) {
			return Errors::from( $error ); }
	}

	public function restore_slider( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$body = JsonBody::decode( $request );
		if ( $body instanceof WP_Error ) {
			return $body; }
		$version  = JsonBody::version( $body->expectedVersion ?? null );
		$revision = JsonBody::version( $body->revisionId ?? null );
		if ( $version instanceof WP_Error ) {
			return $version; }
		if ( $revision instanceof WP_Error ) {
			return $revision; }
		try {
			$new_version = $this->sliders->restore_revision( (int) $request['id'], $revision, $version );
			return new WP_REST_Response( array( 'version' => $new_version ) );
		} catch ( Throwable $error ) {
			return Errors::from( $error ); }
	}

	public function autosave_slider( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$body = JsonBody::decode( $request );
		if ( $body instanceof WP_Error ) {
			return $body; }
		$title   = JsonBody::title( $body->title ?? null );
		$version = JsonBody::version( $body->expectedVersion ?? null );
		if ( $title instanceof WP_Error ) {
			return $title; }
		if ( $version instanceof WP_Error ) {
			return $version; }
		try {
			$revision = $this->sliders->autosave( (int) $request['id'], $title, $body->document ?? null, $version );
			return new WP_REST_Response( array( 'revisionId' => $revision ) );
		} catch ( Throwable $error ) {
			return Errors::from( $error ); }
	}

	public function trash_slider( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		try {
			$this->sliders->trash( (int) $request['id'] );
			return new WP_REST_Response( array( 'trashed' => true ) );
		} catch ( Throwable $error ) {
			return Errors::from( $error );
		}
	}

	/**
	 * @return array<string, mixed>
	 */
	public function summary( StoredSlider $slider ): array {
		return array(
			'id'           => $slider->id,
			'title'        => $slider->title,
			'status'       => $slider->status(),
			'version'      => $slider->version,
			'modifiedGmt'  => $slider->modified_gmt,
			'publishedGmt' => $slider->published?->published_gmt,
			'shortcode'    => '[' . Shortcode::TAG . ' id="' . $slider->id . '"]',
		);
	}

	/**
	 * @return array<string, mixed>
	 */
	private function detail( StoredSlider $slider ): array {
		$detail               = $this->summary( $slider );
		$detail['previewUrl'] = add_query_arg(
			array(
				'action'   => 'sws_preview',
				'id'       => $slider->id,
				'_wpnonce' => wp_create_nonce( 'sws_preview_' . $slider->id ),
			),
			admin_url( 'admin-post.php' )
		);
		$detail['document']   = CanonicalJson::decode_tree( $slider->document_json );
		$detail['published']  = null === $slider->published ? null : array(
			'version'      => $slider->published->version,
			'publishedGmt' => $slider->published->published_gmt,
		);
		$detail['media']      = (object) $this->media( CanonicalJson::decode_assoc( $slider->document_json ) );
		return $detail;
	}

	/**
	 * Preview data of image attachments referenced by a document (editor display only).
	 *
	 * @param array<string, mixed> $document Draft document.
	 * @return array<int, array{url: string, width: int, height: int}>
	 */
	private function media( array $document ): array {
		$ids = array();
		foreach ( $document['slides'] as $slide ) {
			$ids[] = $slide['background']['attachmentId'];
			foreach ( $slide['layers'] as $layer ) {
				if ( 'image' === $layer['type'] ) {
					$ids[] = $layer['content']['attachmentId'];
				}
			}
		}
		$media = array();
		foreach ( array_unique( array_filter( $ids, 'is_int' ) ) as $id ) {
			$source = wp_get_attachment_image_src( $id, 'large' );
			if ( false !== $source && current_user_can( 'read_post', $id ) ) {
				$media[ $id ] = array(
					'url'    => (string) $source[0],
					'width'  => (int) $source[1],
					'height' => (int) $source[2],
				);
			}
		}
		return $media;
	}
}

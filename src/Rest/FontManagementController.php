<?php
/**
 * Explicit settings, offline import and background job endpoints.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Rest;

use Closure;
use SW\Slider\Fonts\FontInstaller;
use SW\Slider\Fonts\FontCatalog;
use SW\Slider\Fonts\FontError;
use SW\Slider\Fonts\Woff2;
use SW\Slider\Infrastructure\Capabilities;
use SW\Slider\Infrastructure\WpFontJobs;
use WP_REST_Request;
use WP_REST_Response;
use WP_Error;
/** Administrative font operations; all mutations require the independent font capability. */
final class FontManagementController {
	/**
	 * @param Closure(): bool $offline Current server setting. */
	public function __construct( private readonly FontCatalog $catalog, private readonly FontInstaller $installer, private readonly WpFontJobs $jobs, private readonly Closure $offline ) {
	}
	public function register(): void {
		add_action( 'rest_api_init', array( $this, 'routes' ) );
	}
	public function can_manage(): bool {
		return current_user_can( Capabilities::FONTS );
	}
	public function routes(): void {
		foreach ( array(
			'/fonts/settings' => array( 'GET', 'POST' ),
			'/fonts/import'   => array( 'POST' ),
			'/fonts/jobs'     => array( 'GET', 'POST' ),
		) as $path => $methods ) {
			$handlers = array();
			foreach ( $methods as $method ) {
				$handlers[] = array(
					'methods'             => $method,
					'callback'            => array( $this, '/fonts/settings' === $path ? 'settings' : ( '/fonts/import' === $path ? 'import_file' : ( 'GET' === $method ? 'list_jobs' : 'create_job' ) ) ),
					'permission_callback' => array( $this, 'can_manage' ),
				);
			}
			register_rest_route( SliderController::NAMESPACE, $path, $handlers );
		}
		register_rest_route(
			SliderController::NAMESPACE,
			'/fonts/jobs/(?P<id>[a-f0-9-]{36})',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( $this, 'get_job' ),
					'permission_callback' => array( $this, 'can_manage' ),
				),
				array(
					'methods'             => 'DELETE',
					'callback'            => array( $this, 'cancel_job' ),
					'permission_callback' => array( $this, 'can_manage' ),
				),
			)
		);
		foreach ( array( 'run', 'retry' ) as $action ) {
			register_rest_route(
				SliderController::NAMESPACE,
				'/fonts/jobs/(?P<id>[a-f0-9-]{36})/' . $action,
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, $action . '_job' ),
					'permission_callback' => array( $this, 'can_manage' ),
				)
			);
		}
	}
	public function settings( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		if ( 'POST' === $request->get_method() ) {
			$body = JsonBody::decode( $request );
			if ( $body instanceof WP_Error ) {
				return $body;
			}
			if ( ! is_bool( $body->offline ?? null ) ) {
				return Errors::from( new FontError( 'sws_font_invalid_request' ) );
			}
			if ( ! update_option( \SW\Slider\Plugin::OFFLINE_OPTION, $body->offline, false ) && ( $this->offline )() !== $body->offline ) {
				return Errors::from( new FontError( 'sws_font_registry' ) );
			}
		}
		return new WP_REST_Response( array( 'offline' => ( $this->offline )() ) );
	}
	public function import_file( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		if ( strlen( $request->get_body() ) > Woff2::MAX_BYTES * 2 + 262144 ) {
			return new WP_Error( 'sws_too_large', __( 'The font file is too large.', 'sw-sliderman' ), array( 'status' => 413 ) );
		}
		$body = json_decode( $request->get_body(), true, 32 );
		if ( ! is_array( $body ) || ! is_string( $body['fileBase64'] ?? null ) || strlen( $body['fileBase64'] ) > (int) ceil( Woff2::MAX_BYTES / 3 ) * 4 ) {
			return Errors::from( new FontError( 'sws_font_invalid_request' ) );
		}
		$bytes = base64_decode( $body['fileBase64'], true );
		if ( false === $bytes ) {
			return Errors::from( new FontError( 'sws_font_invalid_file' ) );
		}
		unset( $body['fileBase64'] );
		try {
			$installation = $this->installer->import_file( $body, $bytes );
			return new WP_REST_Response( array( 'id' => $installation['id'] ), 201 );
		} catch ( \Throwable $error ) {
			return Errors::from( $error );
		}
	}
	public function create_job( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$body = JsonBody::decode( $request );
		if ( $body instanceof WP_Error ) {
			return $body;
		}
		try {
			$kind = $body->kind ?? 'install';
			if ( ! in_array( $kind, array( 'install', 'catalog' ), true ) ) {
				throw new FontError( 'sws_font_invalid_request' );
			}
			$payload = array();
			if ( 'install' === $kind ) {
				$family = is_string( $body->familyId ?? null ) ? $this->catalog->find( $body->familyId ) : null;
				if ( null === $family ) {
					throw new FontError( 'sws_font_unknown_family' );
				}
				if ( ! $family['static'] ) {
					throw new FontError( 'sws_font_variable_unsupported' );
				}
				$payload = array(
					'familyId' => $family['id'],
					'variants' => FontInstaller::validated_variants( $family, json_decode( (string) wp_json_encode( $body->variants ?? null ), true ) ),
					'subsets'  => FontInstaller::validated_subsets( $family, $body->subsets ?? null ),
				);
			}
			return new WP_REST_Response( $this->present( $this->jobs->enqueue( $kind, $payload, get_current_user_id() ) ), 202 );
		} catch ( \Throwable $error ) {
			return Errors::from( $error );
		}
	}
	public function list_jobs(): WP_REST_Response {
		return new WP_REST_Response( array_map( array( $this, 'present' ), $this->jobs->all() ) );
	}
	public function get_job( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		return $this->job_action( $request, 'get' );
	}
	public function run_job( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		return $this->job_action( $request, 'run' );
	}
	public function cancel_job( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		return $this->job_action( $request, 'cancel' );
	}
	public function retry_job( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		try {
			$job = $this->jobs->get( (string) $request['id'] );
			return new WP_REST_Response( $this->present( $this->jobs->enqueue( $job['kind'], $job['payload'], get_current_user_id() ) ), 202 );
		} catch ( \Throwable $error ) {
			return Errors::from( $error );
		}
	}
	private function job_action( WP_REST_Request $request, string $action ): WP_REST_Response|WP_Error {
		try {
			$response = new WP_REST_Response( $this->present( $this->jobs->$action( (string) $request['id'] ) ) );
			$response->header( 'Cache-Control', 'private, no-store' );
			return $response;
		} catch ( \Throwable $error ) {
			return Errors::from( $error );
		}
	}
	/**
	 * @param array<string,mixed> $job Private record.
	 * @return array<string,mixed> */
	public function present( array $job ): array {
		return array(
			'id'         => $job['id'],
			'kind'       => $job['kind'],
			'familyId'   => $job['payload']['familyId'] ?? null,
			'state'      => $job['state'],
			'updatedGmt' => $job['updatedGmt'],
			'result'     => $job['result'],
			'error'      => 'cancelled' !== $job['state'] && is_string( $job['errorCode'] ) ? Errors::from( new FontError( $job['errorCode'] ) )->get_error_message() : null,
		);
	}
}

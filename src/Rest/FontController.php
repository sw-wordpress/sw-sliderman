<?php
/**
 * Font REST endpoints.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Rest;

use SW\Slider\Fonts\FontCatalog;
use SW\Slider\Fonts\FontInstaller;
use SW\Slider\Fonts\FontLibrary;
use SW\Slider\Infrastructure\Capabilities;
use SW\Slider\Infrastructure\UploadPaths;
use Throwable;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;

/**
 * `sw-sliderman/v1/fonts` (docs/rest-api.md).
 *
 * Reading the catalog and installations needs the edit capability (typography panel). Installing
 * and removing fonts is a separate capability and the only path that makes the server contact
 * the font provider (explicit administrative action, PLAN.md 8.1).
 *
 * @phpstan-import-type Installation from \SW\Slider\Fonts\FontRepository
 */
final class FontController {

	public function __construct(
		private readonly FontCatalog $catalog,
		private readonly FontInstaller $installer,
		private readonly FontLibrary $library,
		private readonly bool $offline
	) {
	}

	public function register(): void {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	public function register_routes(): void {
		register_rest_route(
			SliderController::NAMESPACE,
			'/fonts/catalog',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'catalog' ),
				'permission_callback' => array( $this, 'can_read' ),
			)
		);
		register_rest_route(
			SliderController::NAMESPACE,
			'/fonts',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'installations' ),
					'permission_callback' => array( $this, 'can_read' ),
				),
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'install' ),
					'permission_callback' => array( $this, 'can_manage' ),
				),
			)
		);
		register_rest_route(
			SliderController::NAMESPACE,
			'/fonts/(?P<id>[A-Za-z0-9][A-Za-z0-9_-]{0,63})',
			array(
				'methods'             => WP_REST_Server::DELETABLE,
				'callback'            => array( $this, 'uninstall' ),
				'permission_callback' => array( $this, 'can_manage' ),
			)
		);
	}

	public function can_read(): bool {
		return current_user_can( Capabilities::EDIT ) || current_user_can( Capabilities::FONTS );
	}

	public function can_manage(): bool {
		return current_user_can( Capabilities::FONTS );
	}

	public function catalog(): WP_REST_Response {
		$installed = array();
		foreach ( $this->library->installations() as $installation ) {
			$installed[ $installation['familyId'] ] = true;
		}
		$families = array();
		foreach ( $this->catalog->families() as $family ) {
			$families[] = $family + array( 'installed' => isset( $installed[ $family['id'] ] ) );
		}
		return new WP_REST_Response(
			array(
				'catalogVersion' => $this->catalog->version(),
				'offline'        => (bool) get_option( \SW\Slider\Plugin::OFFLINE_OPTION, $this->offline ),
				'families'       => $families,
			)
		);
	}

	public function installations(): WP_REST_Response|WP_Error {
		try {
			$referenced = $this->library->referenced_ids();
		} catch ( Throwable $error ) {
			return Errors::from( $error );
		}
		$items = array();
		foreach ( $this->library->installations() as $installation ) {
			$items[] = $this->present( $installation, isset( $referenced[ $installation['id'] ] ) );
		}
		return new WP_REST_Response( $items );
	}

	public function install( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$body = JsonBody::decode( $request );
		if ( $body instanceof WP_Error ) {
			return $body;
		}
		$family = $body->familyId ?? null;
		if ( ! is_string( $family ) || 1 !== preg_match( '/\A[a-z0-9]{1,64}\z/', $family ) ) {
			return new WP_Error( 'sws_font_invalid_request', __( 'The font selection is invalid.', 'sw-sliderman' ), array( 'status' => 400 ) );
		}
		// Plain arrays for the installer's own validation (variants: list of {weight, style}).
		$variants = json_decode( (string) wp_json_encode( $body->variants ?? null ), true );
		$subsets  = json_decode( (string) wp_json_encode( $body->subsets ?? null ), true );
		try {
			$installation = $this->installer->install( $family, $variants, $subsets );
			return new WP_REST_Response( $this->present( $installation, false ), 201 );
		} catch ( Throwable $error ) {
			return Errors::from( $error );
		}
	}

	public function uninstall( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		try {
			$this->library->uninstall( (string) $request['id'] );
			return new WP_REST_Response( array( 'deleted' => true ) );
		} catch ( Throwable $error ) {
			return Errors::from( $error );
		}
	}

	/**
	 * Public shape of an installation; URLs are rebuilt from the current uploads base.
	 *
	 * @param Installation $installation Installation manifest.
	 * @return array<string, mixed>
	 */
	private function present( array $installation, bool $in_use ): array {
		return array(
			'id'             => $installation['id'],
			'familyId'       => $installation['familyId'],
			'family'         => $installation['family'],
			'category'       => $installation['category'],
			'variants'       => array_map(
				static fn ( array $variant ): array => array(
					'weight'  => $variant['weight'],
					'style'   => $variant['style'],
					'subsets' => array_map( static fn ( array $file ): string => $file['subset'], $variant['files'] ),
				),
				$installation['variants']
			),
			'stylesheetUrl'  => UploadPaths::local_font_url( $installation['stylesheet'] ),
			'licenseId'      => $installation['license']['id'],
			'licenseUrl'     => UploadPaths::local_font_url( $installation['license']['file'] ),
			'installedGmt'   => $installation['installedGmt'],
			'filesPresent'   => $this->library->files_present( $installation ),
			'originMismatch' => null === UploadPaths::local_font_url( $installation['stylesheet'] ),
			'inUse'          => $in_use,
		);
	}
}

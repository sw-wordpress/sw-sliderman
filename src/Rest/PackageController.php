<?php
/** Authorized package preview, takeover and download endpoints.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Rest;

use Closure;
use SW\Slider\Infrastructure\WpPackageJobs;
use SW\Slider\Domain\Limits;
use SW\Slider\ImportExport\PackageArchive;
use SW\Slider\ImportExport\PackageError;
use SW\Slider\ImportExport\PackageExporter;
use SW\Slider\ImportExport\PackageImporter;
use SW\Slider\ImportExport\PrivateWorkspace;
use SW\Slider\Infrastructure\Capabilities;
use SW\Slider\Infrastructure\ResourceGuard;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;

final class PackageController {
	private const PREFIX = 'sws_package_';
	public const CLEANUP = 'sws_package_cleanup';

	/** @param Closure():PrivateWorkspace $workspace_factory Deferred private filesystem adapter. */
	public function __construct( private readonly PackageExporter $exporter, private readonly PackageImporter $importer, private readonly WpPackageJobs $jobs, private readonly Closure $workspace_factory ) {
	}

	public function register(): void {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
		add_action( 'admin_post_sws_package_download', array( $this, 'download' ) );
		add_action( self::CLEANUP, array( $this, 'cleanup' ) );
	}

	public function register_routes(): void {
		foreach ( array( 'preview', 'commit', 'cancel', 'export', 'run' ) as $action ) {
			register_rest_route(
				SliderController::NAMESPACE,
				'/packages/' . $action,
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, $action ),
					'permission_callback' => 'export' === $action ? array( $this, 'can_export' ) : array( $this, 'can_import' ),
				)
			);
		}
		register_rest_route(
			SliderController::NAMESPACE,
			'/packages/status',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'status' ),
				'permission_callback' => array( $this, 'can_import' ),
			)
		);
	}

	public function can_import(): bool {
		return current_user_can( Capabilities::EDIT ) && current_user_can( Capabilities::IMPORT ) && current_user_can( Capabilities::FONTS ) && current_user_can( 'upload_files' );
	}

	public function can_export( WP_REST_Request $request ): bool {
		$id = $request->get_param( 'id' );
		return is_int( $id ) && $id > 0 && current_user_can( Capabilities::EDIT ) && current_user_can( 'edit_post', $id );
	}

	private function workspace(): PrivateWorkspace {
		return ( $this->workspace_factory )();
	}

	/** @return array<string,mixed> */
	private function session( string $token, string $mode ): array {
		$this->workspace()->path( $token );
		$state = get_option( self::PREFIX . $token );
		if ( ! is_array( $state ) || ( $state['user'] ?? null ) !== get_current_user_id() || ( $state['mode'] ?? null ) !== $mode || ( $state['expires'] ?? 0 ) < time() ) {
			throw new PackageError( 'session' );
		}
		return $state;
	}

	private function remember( string $token, string $mode, ?int $slider_id = null ): void {
		global $wpdb;
		ResourceGuard::run(
			$wpdb,
			function () use ( $token, $mode, $slider_id, $wpdb ): void {
				$count = (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM %i WHERE option_name LIKE %s', $wpdb->options, $wpdb->esc_like( self::PREFIX ) . '%' ) );
				if ( $count >= 100 ) {
					throw new PackageError( 'limit' );
				}

				if ( ! add_option(
					self::PREFIX . $token,
					array(
						'user'    => get_current_user_id(),
						'mode'    => $mode,
						'slider'  => $slider_id,
						'expires' => time() + HOUR_IN_SECONDS,
						'result'  => null,
					),
					'',
					false
				) ) {
					throw new PackageError( 'storage' );
				}
			}
		);
	}

	public function preview( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$token = null;
		try {
			$this->cleanup();
			global $wpdb;
			$count = (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM %i WHERE option_name LIKE %s', $wpdb->options, $wpdb->esc_like( self::PREFIX ) . '%' ) );
			if ( $count >= 100 ) {
				throw new PackageError( 'limit' );
			}
			$files = $request->get_file_params();
			$file  = $files['archive'] ?? null;
			if ( ! is_array( $file ) || UPLOAD_ERR_OK !== $file['error'] || ! is_uploaded_file( $file['tmp_name'] ) || filesize( $file['tmp_name'] ) > Limits::ARCHIVE_BYTES ) {
				throw new PackageError( 'archive' );
			}
			$work  = $this->workspace();
			$token = $work->create();
			$path  = $work->path( $token ) . '/package.zip';
			if ( ! move_uploaded_file( $file['tmp_name'], $path ) ) {
				throw new PackageError( 'storage' );
			}
			$summary = $this->inspect_path( $path );
			$this->remember( $token, 'import' );
			return $this->response( array( 'token' => $token ) + $summary );
		} catch ( \Throwable $error ) {
			if ( null !== $token ) {
				$this->workspace()->remove( $token );
			}
			return Errors::from( $error );
		}
	}

	/** @return array<string,mixed> */
	private function inspect_path( string $path ): array {
		$archive = new PackageArchive( $path );
		try {
			$checked  = $this->importer->inspect( $archive );
			$manifest = $checked['manifest'];
			$fonts    = array_map(
				static fn ( array $font ): array => array(
					'id'     => $font['id'],
					'family' => $font['family'],
				),
				$manifest['fonts']
			);
			return array(
				'title'     => $manifest['title'],
				'conflicts' => $this->importer->conflicts( $manifest ),
				'complete'  => $manifest['complete'],
				'media'     => $manifest['media'],
				'fonts'     => $fonts,
			);
		} finally {
			$archive->close();
		}
	}

	public function commit( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$body = JsonBody::decode( $request );
		if ( $body instanceof WP_Error ) {
			return $body;
		}
		try {
			$token = is_string( $body->token ?? null ) ? $body->token : '';
			return $this->response( $this->jobs->enqueue( $token, (array) ( $body->media ?? new \stdClass() ), (array) ( $body->fonts ?? new \stdClass() ) ) );
		} catch ( \Throwable $error ) {
			return Errors::from( $error );
		}
	}

	public function run( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		try {
			$token = (string) $request->get_param( 'token' );
			$this->jobs->status( $token );
			$this->jobs->run( $token );
			return $this->status( $request );
		} catch ( \Throwable $error ) {
			return Errors::from( $error );
		}
	}

	public function status( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		try {
			$status = $this->jobs->status( (string) $request->get_param( 'token' ) );
			if ( is_string( $status['error'] ) ) {
				$status['message'] = Errors::from( new PackageError( $status['error'] ) )->get_error_message();
			}
			return $this->response( $status );
		} catch ( \Throwable $error ) {
			return Errors::from( $error );
		}
	}

	public function cancel( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		try {
			$token  = (string) $request->get_param( 'token' );
			$status = $this->jobs->status( $token );
			if ( 'completed' === $status['state'] ) {
				return $this->response( $status );
			}
			$this->jobs->cancel( $token );
			if ( 'running' === $status['state'] ) {
				return $this->response( array( 'state' => 'cancelling' ) );
			}
			global $wpdb;
			return ResourceGuard::run(
				$wpdb,
				function () use ( $token ): WP_REST_Response {
					// A queued worker may have completed while cancellation waited for the guard.
					$current = $this->jobs->status( $token );
					if ( 'completed' === $current['state'] ) {
						return $this->response( $current );
					}
					$this->workspace()->remove( $token );
					delete_option( self::PREFIX . $token );
					WpPackageJobs::discard_cancel( $token );
					return $this->response( array( 'cancelled' => true ) );
				}
			);
		} catch ( \Throwable $error ) {
			return Errors::from( $error );
		}
	}

	public function export( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$token = null;
		try {
			$include = $request->get_param( 'includeFiles' );
			if ( ! is_bool( $include ) ) {
				throw new PackageError( 'manifest' );
			}
			$work  = $this->workspace();
			$token = $work->create();
			global $wpdb;
			ResourceGuard::run( $wpdb, fn () => $this->exporter->write( (int) $request['id'], $include, $work->path( $token ) . '/package.zip' ) );
			$this->remember( $token, 'export', (int) $request['id'] );
			return $this->response(
				array(
					'url' => add_query_arg(
						array(
							'action' => 'sws_package_download',
							'token'  => $token,
						),
						admin_url( 'admin-post.php' )
					),
				)
			);
		} catch ( \Throwable $error ) {
			if ( null !== $token ) {
				$this->workspace()->remove( $token );
			}
			return Errors::from( $error );
		}
	}

	public function download(): void {
		try {
			$token = isset( $_GET['token'] ) && is_string( $_GET['token'] ) ? sanitize_text_field( wp_unslash( $_GET['token'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- random user-bound read-only download token, no mutation.
			$state = $this->session( $token, 'export' );
			if ( ! current_user_can( Capabilities::EDIT ) || ! is_int( $state['slider'] ?? null ) || ! current_user_can( 'edit_post', $state['slider'] ) ) {
				throw new PackageError( 'session' );
			}
			$file = $this->workspace()->path( $token ) . '/package.zip';
			if ( ! is_file( $file ) || is_link( $file ) ) {
				throw new PackageError( 'session' );
			}
			nocache_headers();
			header( 'Content-Type: application/zip' );
			header( 'X-Content-Type-Options: nosniff' );
			header( 'Content-Disposition: attachment; filename="sw-sliderman.zip"' );
			header( 'Content-Length: ' . filesize( $file ) );
			readfile( $file ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_readfile, WordPress.Security.EscapeOutput.OutputNotEscaped -- verified ZIP download, not HTML.
		} catch ( \Throwable $error ) {
			wp_die( esc_html( Errors::from( $error )->get_error_message() ), '', array( 'response' => 403 ) );
		}
		exit;
	}

	public function cleanup(): void {
		global $wpdb;
		ResourceGuard::run( $wpdb, fn () => $this->workspace()->cleanup_orphans() );
		$names = $wpdb->get_col( $wpdb->prepare( 'SELECT option_name FROM %i WHERE option_name LIKE %s LIMIT 200', $wpdb->options, $wpdb->esc_like( self::PREFIX ) . '%' ) );
		foreach ( $names as $name ) {
			$token = substr( $name, strlen( self::PREFIX ) );
			if ( ! preg_match( '/\A[a-f0-9]{32}\z/', $token ) ) {
				continue;
			}
			$state = get_option( $name );
			if ( is_array( $state ) && ( $state['expires'] ?? PHP_INT_MAX ) < time() ) {
				ResourceGuard::run(
					$wpdb,
					function () use ( $token, $name ): void {
						$this->workspace()->remove( $token );
						delete_option( $name );
						WpPackageJobs::discard_cancel( $token );
					}
				);
			}
		}
	}

	/** @param array<string,mixed> $data Response body. */
	private function response( array $data ): WP_REST_Response {
		$response = new WP_REST_Response( $data );
		$response->header( 'Cache-Control', 'private, no-store' );
		return $response;
	}
}

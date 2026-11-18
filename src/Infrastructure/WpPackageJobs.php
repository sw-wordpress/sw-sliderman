<?php
/** Durable, bounded import jobs; cron and browser fallback execute the same operation.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Infrastructure;

use Closure;
use SW\Slider\Application\RepositoryBusy;
use SW\Slider\Domain\Limits;
use SW\Slider\ImportExport\PackageArchive;
use SW\Slider\ImportExport\PackageError;
use SW\Slider\ImportExport\PackageImporter;
use SW\Slider\ImportExport\PrivateWorkspace;

final class WpPackageJobs {
	public const HOOK    = 'sws_package_run';
	private const PREFIX = 'sws_package_';
	private const CANCEL = '_sws_package_cancel_';

	/** @param Closure():PrivateWorkspace $workspace_factory Deferred private filesystem adapter. */
	public function __construct( private readonly PackageImporter $importer, private readonly Closure $workspace_factory ) {
	}

	public function register(): void {
		add_action( self::HOOK, array( $this, 'run' ) );
	}

	/** @return array<string,mixed> */
	public function status( string $token ): array {
		$state = $this->load( $token );
		if ( get_current_user_id() !== $state['user'] ) {
			throw new PackageError( 'session' );
		}
		return array(
			'state' => $state['state'] ?? 'ready',
			'id'    => $state['result'] ?? null,
			'done'  => $state['done'] ?? 0,
			'total' => $state['total'] ?? 0,
			'error' => $state['error'] ?? null,
		);
	}

	/** @param array<int|string,mixed> $media Local image mappings.
	 * @param array<string,mixed>     $fonts Local installation mappings.
	 * @return array<string,mixed>
	 */
	public function enqueue( string $token, array $media, array $fonts ): array {
		global $wpdb;
		return ResourceGuard::run(
			$wpdb,
			function () use ( $token, $media, $fonts ): array {
				$this->status( $token );
				$state = $this->load( $token );
				if ( is_int( $state['result'] ) || in_array( $state['state'] ?? '', array( 'queued', 'running', 'cancelled', 'unknown' ), true ) ) {
					return $this->status( $token );
				}
				if ( strlen( (string) wp_json_encode( array( $media, $fonts ) ) ) > Limits::JOB_BYTES - 4096 ) {
					throw new PackageError( 'limit' );
				}
				$state['state']   = 'queued';
				$state['expires'] = time() + HOUR_IN_SECONDS;
				$state['media']   = $media;
				$state['fonts']   = $fonts;
				$state['done']    = 0;
				$state['total']   = 0;
				$state['error']   = null;
				delete_option( self::CANCEL . $token );
				$this->save( $token, $state );
				$scheduled = wp_schedule_single_event( time() + 1, self::HOOK, array( $token ), true );
				if ( is_wp_error( $scheduled ) ) {
					$state['state'] = 'failed';
					$state['error'] = 'storage';
					$this->save( $token, $state );
					throw new PackageError( 'storage' );
				}
				return $this->status( $token );
			}
		);
	}

	public function run( string $token ): void {
		global $wpdb;
		$previous_user = get_current_user_id();
		try {
			ResourceGuard::run(
				$wpdb,
				function () use ( $token, $wpdb ): void {
					$state = $this->load( $token );
					if ( 'running' === ( $state['state'] ?? '' ) ) {
						// The connection-owned guard was released by an interrupted process.
						// The final DB commit may have succeeded; never replay an uncertain creation.
						$state['state'] = 'unknown';
						$state['error'] = 'outcome';
						$this->save( $token, $state );
						return;
					}
					if ( 'queued' !== ( $state['state'] ?? '' ) ) {
						return;
					}
					wp_set_current_user( (int) $state['user'] );
					$state['state'] = 'running';
					$this->save( $token, $state );
					$archive    = null;
					$start      = microtime( true );
					$checkpoint = function ( int $done, int $total ) use ( $wpdb, $token, &$state, $start ): void {
						if ( '1' === $wpdb->get_var( $wpdb->prepare( 'SELECT option_value FROM %i WHERE option_name=%s', $wpdb->options, self::CANCEL . $token ) ) ) {
							throw new PackageError( 'cancelled' );
						}
						if ( ! current_user_can( Capabilities::IMPORT ) || ! current_user_can( Capabilities::EDIT ) || ! current_user_can( Capabilities::FONTS ) || ! current_user_can( 'upload_files' ) ) {
							throw new PackageError( 'permission' );
						}
						if ( microtime( true ) - $start > 180 ) {
							throw new PackageError( 'timeout' );
						}
						$state['done']  = $done;
						$state['total'] = $total;
						$this->save( $token, $state );
					};
					try {
						$checkpoint( 0, 0 );
						$work    = ( $this->workspace_factory )();
						$dir     = $work->path( $token );
						$archive = new PackageArchive( $dir . '/package.zip' );
						$id      = $this->importer->commit( $archive, $dir . '/resource.bin', $state['media'], $state['fonts'], $checkpoint );
						// Creation is durable. A later status-write failure must never reset to retryable.
						$state['result'] = $id;
						$state['state']  = 'completed';
						$state['done']   = $state['total'];
						$this->save( $token, $state );
					} catch ( \Throwable $error ) {
						if ( is_int( $state['result'] ) ) {
							return;
						}
						$code           = $error instanceof PackageError ? $error->error_code : 'storage';
						$state['state'] = 'cancelled' === $code ? 'cancelled' : 'failed';
						$state['error'] = $code;
						$this->save( $token, $state );
					} finally {
						if ( null !== $archive ) {
							$archive->close();
						}
					}
					if ( in_array( $state['state'], array( 'completed', 'cancelled' ), true ) ) {
						( ( $this->workspace_factory )() )->remove( $token );
					}
				}
			);
		} catch ( PackageError | RepositoryBusy ) {
			// Expired/cancelled sessions may still have a previously queued cron event.
			return;
		} finally {
			wp_set_current_user( $previous_user );
		}
	}

	/** Cancellation is independent of the resource guard so a running worker can observe it. */
	public function cancel( string $token ): void {
		$this->status( $token );
		update_option( self::CANCEL . $token, true, false );
	}

	public static function discard_cancel( string $token ): void {
		delete_option( self::CANCEL . $token );
		wp_clear_scheduled_hook( self::HOOK, array( $token ) );
	}

	/** @return array<string,mixed> */
	private function load( string $token ): array {
		global $wpdb;
		( ( $this->workspace_factory )() )->path( $token );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- A concurrent worker can update the job after this request has checked ownership.
		$value = $wpdb->get_var( $wpdb->prepare( 'SELECT option_value FROM %i WHERE option_name=%s', $wpdb->options, self::PREFIX . $token ) );
		$state = maybe_unserialize( $value );
		if ( ! is_array( $state ) || 'import' !== ( $state['mode'] ?? '' ) || ( $state['expires'] ?? 0 ) < time() ) {
			throw new PackageError( 'session' );
		}
		return $state;
	}

	/** @param array<string,mixed> $state Owned session. */
	private function save( string $token, array $state ): void {
		if ( ! update_option( self::PREFIX . $token, $state, false ) && get_option( self::PREFIX . $token ) !== $state ) {
			throw new PackageError( 'storage' );
		}
	}
}

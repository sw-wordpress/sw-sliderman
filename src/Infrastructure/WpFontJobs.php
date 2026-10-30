<?php
/**
 * Bounded, explicitly requested font jobs.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Infrastructure;

use Closure;
use SW\Slider\Fonts\FontInstaller;
use SW\Slider\Fonts\FontRepository;
use SW\Slider\Fonts\FontError;
use SW\Slider\Fonts\CatalogUpdater;
use SW\Slider\Domain\Limits;
/** Private non-autoloaded records; WP-Cron and manual fallback share the same leased runner. */
final class WpFontJobs {
	public const HOOK    = 'sws_run_font_job';
	private const PREFIX = 'sws_font_job_';
	/**
	 * @param Closure(): bool $offline Current offline state, not a cached request snapshot. */
	public function __construct( private readonly FontInstaller $installer, private readonly CatalogUpdater $catalog, private readonly FontRepository $locks, private readonly Closure $offline ) {
	}
	public function register(): void {
		add_action(
			self::HOOK,
			function ( string $id ): void {
				try {
					$this->run( $id );
				} catch ( FontError $error ) {
					if ( 'sws_font_job_not_found' !== $error->error_code ) {
						throw $error;
					}
				}
			}
		);
	}
	/**
	 * @param array<string,mixed> $payload Validated request.
	 * @return array<string,mixed> */
	public function enqueue( string $kind, array $payload, int $owner ): array {
		if ( ! user_can( $owner, Capabilities::FONTS ) ) {
			throw new FontError( 'sws_font_job_forbidden' );
		}
		if ( ( $this->offline )() ) {
			throw new FontError( 'sws_font_offline' );
		}
		if ( ! in_array( $kind, array( 'install', 'catalog' ), true ) || strlen( (string) wp_json_encode( $payload ) ) > Limits::JOB_BYTES ) {
			throw new FontError( 'sws_font_invalid_request' );
		}
		$key         = $this->target( $kind, $payload );
		$existing_id = get_option( $key );
		if ( is_string( $existing_id ) ) {
			$existing = $this->get( $existing_id );
			if ( ! $this->terminal( $existing ) ) {
				if ( $existing['owner'] === $owner && $existing['payload'] === $payload ) {
					return $existing;
				}
				throw new FontError( 'sws_font_install_running' );
			}
			$this->delete_exact( $key, $existing_id );
		}
		if ( count( $this->all() ) >= 100 ) {
			$this->prune();
		}
		if ( count( $this->all() ) >= 100 ) {
			throw new FontError( 'sws_font_job_limit' );
		}
		$id = wp_generate_uuid4();
		if ( ! add_option( $key, $id, '', false ) ) {
			throw new FontError( 'sws_font_install_running' );
		}
		$job = array(
			'id'         => $id,
			'kind'       => $kind,
			'owner'      => $owner,
			'payload'    => $payload,
			'state'      => 'queued',
			'attempts'   => 0,
			'created'    => time(),
			'updatedGmt' => gmdate( 'Y-m-d H:i:s' ),
			'errorCode'  => null,
			'result'     => null,
		);
		try {
			$this->put( $job );
			$scheduled = wp_schedule_single_event( time() + 1, self::HOOK, array( $id ), true );
			if ( is_wp_error( $scheduled ) ) {
				throw new FontError( 'sws_font_job_schedule' );
			}
			return $job;
		} catch ( \Throwable $error ) {
			$this->delete_exact( $key, $id );
			throw $error;
		}
	}
	/**
	 * @return array<string,mixed> */
	public function get( string $id ): array {
		global $wpdb;
		if ( ! preg_match( '/\A[a-f0-9-]{36}\z/', $id ) ) {
			throw new FontError( 'sws_font_job_not_found' );
		}
		$json = $wpdb->get_var( $wpdb->prepare( 'SELECT option_value FROM %i WHERE option_name=%s', $wpdb->options, self::PREFIX . $id ) );
		$job  = is_string( $json ) ? json_decode( $json, true ) : null;
		if ( ! is_array( $job ) || ( $job['id'] ?? null ) !== $id ) {
			throw new FontError( 'sws_font_job_not_found' );
		}
		return $job;
	}
	/**
	 * @return list<array<string,mixed>> */
	public function all(): array {
		global $wpdb;
		$rows = $wpdb->get_col( $wpdb->prepare( 'SELECT option_value FROM %i WHERE option_name LIKE %s ORDER BY option_id DESC LIMIT 100', $wpdb->options, $wpdb->esc_like( self::PREFIX ) . '%' ) );
		$jobs = array();
		foreach ( $rows as $row ) {
			$job = json_decode( (string) $row, true );
			if ( is_array( $job ) && isset( $job['id'], $job['state'] ) ) {
				$jobs[] = $job;
			}
		}
		return $jobs;
	}
	/**
	 * @param array<string,mixed> $job Internal bounded record. */
	private function put( array $job ): void {
		$job['updatedGmt'] = gmdate( 'Y-m-d H:i:s' );
		$json              = (string) wp_json_encode( $job );
		if ( strlen( $json ) > Limits::JOB_BYTES ) {
			throw new FontError( 'sws_font_invalid_request' );
		}
		$key = self::PREFIX . $job['id'];
		if ( ! update_option( $key, $json, false ) && get_option( $key ) !== $json ) {
			throw new FontError( 'sws_font_registry' );
		}
	}
	/**
	 * @return array<string,mixed> */
	public function run( string $id ): array {
		$job = $this->get( $id );
		if ( $this->terminal( $job ) ) {
			return $job;
		}
		$token = $this->locks->acquire_lock( 'job_' . $id, 300 );
		if ( null === $token ) {
			return $this->get( $id );
		}
		$previous_user = get_current_user_id();
		try {
			$job = $this->get( $id );
			if ( $this->terminal( $job ) ) {
				return $job;
			}
			if ( $job['attempts'] >= 3 ) {
				throw new FontError( 'sws_font_job_timeout' );
			}
			++$job['attempts'];
			$job['state'] = 'running';
			$this->put( $job );
			wp_set_current_user( $job['owner'] );
			$start = microtime( true );
			$check = function () use ( $job, $id, $token, $start ): void {
				if ( $this->cancelled( $id ) ) {
					throw new FontError( 'sws_font_job_cancelled' );
				}
				if ( ! user_can( $job['owner'], Capabilities::FONTS ) ) {
					throw new FontError( 'sws_font_job_forbidden' );
				}
				if ( ( $this->offline )() ) {
					throw new FontError( 'sws_font_offline' );
				}
				if ( microtime( true ) - $start > 180 || ! $this->locks->renew_lock( 'job_' . $id, $token, 300 ) ) {
					throw new FontError( 'sws_font_job_timeout' );
				}
			};
			$check();
			if ( 'catalog' === $job['kind'] ) {
				$job['result'] = $this->catalog->refresh( $check );
			} else {
				$result        = $this->installer->install( $job['payload']['familyId'], $job['payload']['variants'], $job['payload']['subsets'], $check );
				$job['result'] = $result['id'];
			}
			$job['state']     = 'completed';
			$job['errorCode'] = null;
		} catch ( \Throwable $error ) {
			$job['errorCode'] = $error instanceof FontError ? $error->error_code : 'sws_font_install_failed';
			$job['state']     = 'sws_font_job_cancelled' === $job['errorCode'] ? 'cancelled' : 'failed';
		} finally {
			wp_set_current_user( $previous_user );
			try {
				$this->put( $job );
			} finally {
				$this->locks->release_lock( 'job_' . $id, $token );
			}
			if ( $this->terminal( $job ) ) {
				$this->delete_exact( $this->target( $job['kind'], $job['payload'] ), $id );
				delete_option( 'sws_font_cancel_' . $id );
				wp_clear_scheduled_hook( self::HOOK, array( $id ) );
			}
		}
		return $this->get( $id );
	}
	/**
	 * @return array<string,mixed> */
	public function cancel( string $id ): array {
		$job = $this->get( $id );
		if ( $this->terminal( $job ) ) {
			return $job;
		}
		update_option( 'sws_font_cancel_' . $id, true, false );
		if ( 'queued' === $job['state'] ) {
			return $this->run( $id );
		}
		return $job;
	}
	/**
	 * @param array<string,mixed> $job State. */
	private function terminal( array $job ): bool {
		return in_array( $job['state'], array( 'completed', 'failed', 'cancelled' ), true );
	}
	/**
	 * @param array<string,mixed> $payload Identity. */
	private function target( string $kind, array $payload ): string {
		return 'sws_font_pending_' . md5( $kind . ':' . ( $payload['familyId'] ?? '' ) );
	}
	private function delete_exact( string $key, string $value ): void {
		global $wpdb;
		$wpdb->query( $wpdb->prepare( 'DELETE FROM %i WHERE option_name=%s AND option_value=%s', $wpdb->options, $key, $value ) );
		wp_cache_delete( $key, 'options' );
		wp_cache_delete( 'notoptions', 'options' );
	}
	private function cancelled( string $id ): bool {
		global $wpdb;
		return null !== $wpdb->get_var( $wpdb->prepare( 'SELECT option_value FROM %i WHERE option_name=%s', $wpdb->options, 'sws_font_cancel_' . $id ) );
	}

	private function prune(): void {
		$jobs      = $this->all();
		$remaining = count( $jobs );
		foreach ( array_reverse( $jobs ) as $job ) {
			if ( $this->terminal( $job ) && ( $remaining > 80 || $job['created'] < time() - DAY_IN_SECONDS ) ) {
				delete_option( self::PREFIX . $job['id'] );
				--$remaining;
			}
		}
	}
}

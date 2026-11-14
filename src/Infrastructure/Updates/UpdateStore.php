<?php
/**
 * Non-autoloaded, network-wide state and compare-and-delete locks.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Infrastructure\Updates;

final class UpdateStore {
	public const STATE = 'sws_verified_github_updates_v1';
	public const LOCK  = 'sws_verified_github_updates_lock_v1';

	private static function name( bool $lock = false ): string {
		$source = require dirname( __DIR__, 3 ) . '/includes/update/source.php';
		return $source[ $lock ? 'lock_key' : 'state_key' ];
	}

	/**
	 * @return array<string,mixed>
	 */
	public static function read(): array {
		$value = get_site_option( self::name(), array() );
		return is_array( $value ) ? $value : array();
	}

	/**
	 * @param array<string,mixed> $state
	 */
	public static function write( array $state ): bool {
		if ( is_multisite() ) {
			return update_site_option( self::name(), $state );
		} else {
			return update_option( self::name(), $state, false );
		}
	}

	/**
	 * @return array{token:string,expires:int}|false
	 */
	public static function acquire(): array|false {
		if ( ! self::lock_mutex() ) {
			return false;
		}
		try {
			$previous = self::current_lock();
			if ( is_array( $previous ) ) {
				if ( ( $previous['expires'] ?? PHP_INT_MAX ) >= time() ) {
					return false;
				}
				self::release( $previous );
			}
			$lock  = array(
				'token'   => wp_generate_password( 32, false ),
				'expires' => time() + 120,
			);
			$added = is_multisite() ? add_site_option( self::name( true ), $lock ) : add_option( self::name( true ), $lock, '', false );
			return $added ? $lock : false;
		} finally {
			self::unlock_mutex();
		}
	}

	/**
	 * Check ownership and publish under the same mutex used by lease takeover.
	 * An expired worker cannot overwrite a successor between its check and write.
	 *
	 * @param array<string,mixed> $state New persistent state.
	 * @param array<string,mixed> $lock Exact lease held by the caller.
	 */
	public static function write_if_owned( array $state, array $lock ): bool {
		if ( ! self::lock_mutex() ) {
			return false;
		}
		try {
			return self::owns( $lock ) && ( self::write( $state ) || self::read() === $state );
		} finally {
			self::unlock_mutex();
		}
	}

	private static function mutex_name(): string {
		global $wpdb;
		return substr( 'sws_updates_' . hash( 'sha256', $wpdb->base_prefix . ':' . get_current_network_id() ), 0, 64 );
	}

	private static function lock_mutex(): bool {
		global $wpdb;
		// sitemeta has no unique key; serialize lease acquisition and state publication.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery -- Connection-owned mutex, no cached SQL result.
		return '1' === (string) $wpdb->get_var( $wpdb->prepare( 'SELECT GET_LOCK(%s, 0)', self::mutex_name() ) );
	}

	private static function unlock_mutex(): void {
		global $wpdb;
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery -- Release connection-owned mutex.
		$wpdb->get_var( $wpdb->prepare( 'SELECT RELEASE_LOCK(%s)', self::mutex_name() ) );
	}

	/** @param array<string,mixed> $lock Exact lease acquired by this request. */
	public static function owns( array $lock ): bool {
		return self::current_lock() === $lock && time() < $lock['expires'];
	}

	/** Read leases directly: another process may have replaced an object-cached lease.
	 *
	 * @return array<string,mixed>|false
	 */
	private static function current_lock(): array|false {
		global $wpdb;
		// phpcs:disable WordPress.DB.DirectDatabaseQuery -- Ownership requires a fresh DB read.
		if ( is_multisite() ) {
			$value = $wpdb->get_var( $wpdb->prepare( 'SELECT meta_value FROM %i WHERE site_id=%d AND meta_key=%s', $wpdb->sitemeta, get_current_network_id(), self::name( true ) ) );
		} else {
			$value = $wpdb->get_var( $wpdb->prepare( 'SELECT option_value FROM %i WHERE option_name=%s', $wpdb->options, self::name( true ) ) );
		}
		// phpcs:enable WordPress.DB.DirectDatabaseQuery
		$value = maybe_unserialize( $value );
		return is_array( $value ) ? $value : false;
	}

	/**
	 * Atomic ownership check: an expired request must never delete its successor's lock.
	 * Uses conditional WordPress option SQL because the option API has no compare-and-delete.
	 *
	 * @param array<string,mixed> $lock Exact value originally acquired.
	 */
	public static function release( array $lock ): void {
		global $wpdb;
		// phpcs:disable WordPress.DB.DirectDatabaseQuery, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Atomic platform lock; values are prepared, table identifiers are WordPress-owned.
		if ( is_multisite() ) {
			$wpdb->query( $wpdb->prepare( "DELETE FROM {$wpdb->sitemeta} WHERE site_id = %d AND meta_key = %s AND meta_value = %s", get_current_network_id(), self::name( true ), maybe_serialize( $lock ) ) );
			wp_cache_delete( get_current_network_id() . ':' . self::name( true ), 'site-options' );
		} else {
			$wpdb->query( $wpdb->prepare( "DELETE FROM {$wpdb->options} WHERE option_name = %s AND option_value = %s", self::name( true ), maybe_serialize( $lock ) ) );
			wp_cache_delete( self::name( true ), 'options' );
		}
		// phpcs:enable WordPress.DB.DirectDatabaseQuery, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
	}
}

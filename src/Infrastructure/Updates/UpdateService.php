<?php
/**
 * Backend-only release checking, persistent daily throttling and verified downloads.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Infrastructure\Updates;

use WP_Error;
use Throwable;

final class UpdateService {
	/**
	 * @return array<string,string>
	 */
	public static function keys(): array {
		$keys = defined( 'SWS_RELEASE_PUBLIC_KEYS' ) ? SWS_RELEASE_PUBLIC_KEYS : require dirname( __DIR__, 3 ) . '/includes/update/trusted-keys.php';
		return (array) apply_filters( 'sws_verified_release_public_keys', is_array( $keys ) ? $keys : array() );
	}

	public static function interactive(): bool {
		if ( ! is_admin() || wp_doing_cron() || ( defined( 'WP_CLI' ) && WP_CLI ) || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) ) {
			return false;
		}
		// admin-ajax.php does not set WP_NETWORK_ADMIN, even for network-admin requests.
		$network_context = ! is_multisite() || ( current_user_can( 'manage_network_plugins' ) && ( is_network_admin() || wp_doing_ajax() ) );
		return $network_context && current_user_can( 'update_plugins' ) && wp_is_file_mod_allowed( 'plugin_updates' );
	}

	/**
	 * @return array<string,mixed>|WP_Error
	 */
	public static function check( bool $manual = false ): array|WP_Error {
		if ( ! self::interactive() ) {
			return new WP_Error( 'updates_forbidden', __( 'Update checks require an authorized admin session.', 'sw-sliderman' ) );
		}
		if ( ! self::keys() || ! function_exists( 'sodium_crypto_sign_verify_detached' ) || ! class_exists( 'ZipArchive' ) ) {
			return new WP_Error( 'updates_not_configured', __( 'Public release key or Sodium is missing. GitHub updates are blocked.', 'sw-sliderman' ) );
		}
		$lock = UpdateStore::acquire();
		if ( false === $lock ) {
			return new WP_Error( 'updates_busy', __( 'An update check is already running.', 'sw-sliderman' ) );
		}
		try {
			$state = UpdateStore::read();
			if ( time() - ( $state['last_attempt'] ?? 0 ) < ( $manual ? 60 : DAY_IN_SECONDS ) ) {
				return new WP_Error( 'updates_throttled', __( 'The previous update attempt is still within the check interval.', 'sw-sliderman' ) );
			}
			$state['last_attempt'] = time();
			if ( ! UpdateStore::write_if_owned( $state, $lock ) ) {
				return new WP_Error( 'updates_state_unavailable', __( 'Update state or lock is unavailable. The check was stopped safely.', 'sw-sliderman' ) );
			}
			$result = self::retrieve( $state );
			if ( is_wp_error( $result ) ) {
				$state['error'] = $result->get_error_message();
			}
			if ( ! UpdateStore::write_if_owned( is_wp_error( $result ) ? $state : $result, $lock ) ) {
				return new WP_Error( 'updates_state_unavailable', __( 'Update state or lock is unavailable. The check was stopped safely.', 'sw-sliderman' ) );
			}
			if ( is_wp_error( $result ) ) {
				return $result;
			}
			return array( 'message' => __( 'Signed release metadata checked. Install manually through the Plugins screen.', 'sw-sliderman' ) );
		} catch ( Throwable $error ) {
			$state['error'] = __( 'Invalid release response.', 'sw-sliderman' );
			UpdateStore::write_if_owned( $state, $lock );
			return new WP_Error( 'invalid_release', $state['error'] );
		} finally {
			UpdateStore::release( $lock );
		}
	}

	/**
	 * @param array<string,mixed> $state
	 * @return array<string,mixed>|WP_Error
	 */
	private static function retrieve( array $state ): array|WP_Error {
		$raw = UpdateTransport::fetch( 'https://api.github.com/repos/' . UpdateManifest::source()['repository'] . '/releases/latest', 262144 );
		if ( is_wp_error( $raw ) ) {
			return $raw;
		}
		$release = json_decode( $raw, true );
		if ( ! is_array( $release ) || ! is_int( $release['id'] ?? null ) || ( $release['draft'] ?? null ) !== false || ( $release['prerelease'] ?? null ) !== false ) {
			return new WP_Error( 'invalid_release', __( 'No valid stable release was returned.', 'sw-sliderman' ) );
		}
		$files = array();
		foreach ( array(
			'sw-plugin-release.json'     => 262144,
			'sw-plugin-release.json.sig' => 1024,
		) as $name => $limit ) {
			$assets = array_values( array_filter( $release['assets'] ?? array(), static fn ( $a ) => ( $a['name'] ?? '' ) === $name ) );
			if ( count( $assets ) !== 1 || ! is_int( $assets[0]['id'] ?? null ) ) {
				return new WP_Error( 'missing_signature_asset', __( 'Release manifest or signature is missing.', 'sw-sliderman' ) );
			}
			// Construct from locally fixed identity, never trust an API-provided download URL.
			$url            = 'https://github.com/' . UpdateManifest::source()['repository'] . '/releases/download/' . rawurlencode( $release['tag_name'] ?? '' ) . '/' . $name;
			$files[ $name ] = UpdateTransport::fetch( $url, $limit );
			if ( is_wp_error( $files[ $name ] ) ) {
				return $files[ $name ];
			}
		}
		$manifest = UpdateManifest::verify( $files['sw-plugin-release.json'], $files['sw-plugin-release.json.sig'], self::keys(), $release );
		if ( is_wp_error( $manifest ) ) {
			return $manifest;
		}
		foreach ( $manifest['packages'] as $package ) {
			$previous = $state['highest'][ $package['slug'] ] ?? '0';
			if ( version_compare( $package['version'], $previous, '<' ) ) {
				return new WP_Error( 'release_rollback', __( 'A previously verified newer version cannot be rolled back.', 'sw-sliderman' ) );
			}
			$state['highest'][ $package['slug'] ] = $package['version'];
		}
		$state['raw']          = $files['sw-plugin-release.json'];
		$state['signature']    = $files['sw-plugin-release.json.sig'];
		$state['release']      = $release;
		$state['manifest']     = $manifest;
		$state['last_success'] = time();
		$state['error']        = '';
		return $state;
	}

	/**
	 * @return array<string,mixed>|WP_Error
	 */
	public static function verified_snapshot() {
		$state = UpdateStore::read();
		if ( empty( $state['last_success'] ) || $state['last_success'] > time() || time() - $state['last_success'] >= 7 * DAY_IN_SECONDS ) {
			return new WP_Error( 'stale_update', __( 'Check for updates again before installing.', 'sw-sliderman' ) );
		}
		$manifest = UpdateManifest::verify( $state['raw'] ?? '', $state['signature'] ?? '', self::keys(), $state['release'] ?? array() );
		if ( ! is_wp_error( $manifest ) ) {
			foreach ( $manifest['packages'] as $package ) {
				if ( version_compare( $package['version'], $state['highest'][ $package['slug'] ] ?? '0', '<' ) ) {
					return new WP_Error( 'release_rollback', __( 'Outdated release offer.', 'sw-sliderman' ) );
				}
			}
		}
		return $manifest;
	}

	/**
	 * @param string              $url Expected package URL.
	 * @param array<string,mixed> $descriptor
	 * @return string|WP_Error
	 */
	public static function download( string $url, array $descriptor ): string|WP_Error {
		$manifest = self::verified_snapshot();
		if ( is_wp_error( $manifest ) ) {
			return $manifest;
		}
		$package = UpdateManifest::package( $manifest, $descriptor['slug'] );
		if ( null === $package || UpdateManifest::url( $manifest, $package ) !== $url || ! self::compatible( $package ) || ! version_compare( $package['version'], $descriptor['version'], '>' ) ) {
			return new WP_Error( 'untrusted_package', __( 'Package, version or system requirements do not match.', 'sw-sliderman' ) );
		}
		$file = wp_tempnam( 'sw-verified-update.zip' );
		if ( ! $file || ! chmod( $file, 0600 ) ) {
			if ( $file ) {
				wp_delete_file( $file );
			}
			return new WP_Error( 'update_tempfile', __( 'Temporary update file is unavailable.', 'sw-sliderman' ) );
		}
		// Register cleanup before third-party HTTP filters can throw or abort the request.
		register_shutdown_function(
			static function () use ( $file ): void {
				if ( is_file( $file ) ) {
					wp_delete_file( $file );
				}
			}
		);
		$verified = false;
		try {
			$result = UpdateTransport::fetch( $url, $package['bytes'], $file );
			if ( ! is_wp_error( $result ) ) {
				$result = UpdatePackage::verify( $file, $package );
			}
			if ( is_wp_error( $result ) ) {
				return $result;
			}
			$verified = true;
		} catch ( Throwable $error ) {
			return new WP_Error( 'update_network_error', __( 'GitHub could not be reached.', 'sw-sliderman' ) );
		} finally {
			if ( ! $verified ) {
				wp_delete_file( $file );
			}
		}
		return $file;
	}

	/**
	 * @param array<string,mixed> $package
	 */
	public static function compatible( array $package ): bool {
		return version_compare( PHP_VERSION, $package['requires_php'], '>=' ) && version_compare( get_bloginfo( 'version' ), $package['requires_wp'], '>=' );
	}
}

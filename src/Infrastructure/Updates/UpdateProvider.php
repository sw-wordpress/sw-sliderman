<?php
/**
 * Thin WordPress policy adapter. No state reads or network activity on frontend requests.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Infrastructure\Updates;

use WP_Error;
use stdClass;

final class UpdateProvider {
	public static function init(): void {
		add_filter( 'auto_update_plugin', array( self::class, 'automatic' ), PHP_INT_MAX, 2 );
		add_filter( 'plugin_auto_update_setting_html', array( self::class, 'automatic_html' ), 10, 2 );
		add_filter( 'upgrader_pre_download', array( self::class, 'download_guard' ), PHP_INT_MAX, 4 );
		add_filter( 'site_transient_update_plugins', array( self::class, 'offers' ) );
		add_filter( 'pre_set_site_transient_update_plugins', array( self::class, 'offers' ) );
		add_filter( 'update_plugins_github.com', array( self::class, 'update_uri' ), 10, 3 );
		add_filter( 'plugins_api', array( self::class, 'details' ), 10, 3 );
		add_filter( 'plugin_row_meta', array( self::class, 'row_meta' ), 10, 2 );
		add_action( 'admin_init', array( self::class, 'migrate' ) );
		add_action( 'admin_enqueue_scripts', array( self::class, 'enqueue' ) );
		add_action( 'wp_ajax_sws_check_github_updates', array( self::class, 'ajax_check' ) );
	}

	/**
	 * @return array<string,array{slug:string,version:string}>
	 */
	public static function descriptors(): array {
		return (array) apply_filters( 'sws_verified_update_descriptors', require dirname( __DIR__, 3 ) . '/includes/update/descriptors.php' );
	}

	private static function uri(): string {
		$source = require dirname( __DIR__, 3 ) . '/includes/update/source.php';
		return 'https://github.com/' . $source['repository'];
	}


	/**
	 * @param mixed  $allowed
	 * @param object $item
	 * @return mixed
	 */
	public static function automatic( mixed $allowed, object $item ): mixed {
		return isset( self::descriptors()[ $item->plugin ?? '' ] ) ? false : $allowed;
	}

	public static function automatic_html( string $html, string $file ): string {
		return isset( self::descriptors()[ $file ] ) ? esc_html__( 'Manual updates only', 'sw-sliderman' ) : $html;
	}

	/**
	 * @param mixed               $reply
	 * @param string              $url Expected package URL.
	 * @param mixed               $upgrader
	 * @param array<string,mixed> $extra
	 * @return mixed
	 */
	public static function download_guard( mixed $reply, string $url, mixed $upgrader, array $extra = array() ): mixed {
		$descriptor = self::descriptors()[ $extra['plugin'] ?? '' ] ?? null;
		// Also catch a known provider URL when hook_extra is missing or was tampered with.
		$provider_url = str_starts_with( $url, self::uri() . '/releases/download/' );
		if ( null === $descriptor && ! $provider_url ) {
			return $reply;
		}
		if ( null === $descriptor || ! is_admin() || wp_doing_cron() || ! current_user_can( 'update_plugins' ) || ( defined( 'WP_CLI' ) && WP_CLI ) || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) ) {
			return new WP_Error( 'manual_update_required', __( 'GitHub installation requires a manual WordPress admin action.', 'sw-sliderman' ) );
		}
		if ( ! UpdateService::interactive() || ( isset( $upgrader->skin ) && is_a( $upgrader->skin, 'Automatic_Upgrader_Skin' ) && ! is_a( $upgrader->skin, 'WP_Ajax_Upgrader_Skin' ) ) ) {
			return new WP_Error( 'manual_update_required', __( 'Automatic GitHub installation is blocked.', 'sw-sliderman' ) );
		}
		// Core authenticated the native single/bulk/updates-AJAX action before invoking its upgrader.
		$action        = isset( $_REQUEST['action'] ) && is_string( $_REQUEST['action'] ) ? sanitize_key( $_REQUEST['action'] ) : '';
		$nonce_actions = array(
			'upgrade-plugin'    => 'upgrade-plugin_' . $extra['plugin'],
			'update-plugin'     => 'updates',
			'update-selected'   => 'bulk-update-plugins',
			'do-plugin-upgrade' => 'upgrade-core',
		);
		$nonce         = '';
		if ( isset( $_REQUEST['_ajax_nonce'] ) && is_string( $_REQUEST['_ajax_nonce'] ) ) {
			$nonce = sanitize_text_field( wp_unslash( $_REQUEST['_ajax_nonce'] ) );
		} elseif ( isset( $_REQUEST['_wpnonce'] ) && is_string( $_REQUEST['_wpnonce'] ) ) {
			$nonce = sanitize_text_field( wp_unslash( $_REQUEST['_wpnonce'] ) );
		}
		if ( ! isset( $nonce_actions[ $action ] ) || ! wp_verify_nonce( $nonce, $nonce_actions[ $action ] ) ) {
			return new WP_Error( 'manual_update_required', __( 'A valid manual WordPress update action is required.', 'sw-sliderman' ) );
		}
		if ( ! function_exists( 'get_plugin_data' ) ) {
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
		}
		$installed = WP_PLUGIN_DIR . '/' . $extra['plugin'];
		if ( is_file( $installed ) ) {
			$descriptor['version'] = get_plugin_data( $installed, false, false )['Version'];
		}
		return UpdateService::download( $url, $descriptor );
	}

	/**
	 * @param mixed $transient
	 * @return mixed
	 */
	public static function offers( mixed $transient ): mixed {
		if ( ! UpdateService::interactive() || ! $transient instanceof stdClass ) {
			return $transient;
		}
		$state = UpdateStore::read();
		foreach ( self::descriptors() as $file => $descriptor ) {
			if ( ! isset( $transient->checked[ $file ] ) ) {
				continue;
			}
			unset( $transient->response[ $file ], $transient->no_update[ $file ] );
			if ( empty( $state['last_success'] ) || time() - $state['last_success'] > 7 * DAY_IN_SECONDS || empty( $state['manifest'] ) || ! UpdateService::keys() ) {
				continue;
			}
			$package = UpdateManifest::package( $state['manifest'], $descriptor['slug'] );
			if ( null === $package || ! UpdateService::compatible( $package ) ) {
				continue;
			}
			$offer                         = (object) array(
				'id'           => self::uri(),
				'slug'         => $descriptor['slug'],
				'plugin'       => $file,
				'new_version'  => $package['version'],
				'version'      => $package['version'],
				'url'          => self::uri() . '/releases',
				'package'      => UpdateManifest::url( $state['manifest'], $package ),
				'requires'     => $package['requires_wp'],
				'requires_php' => $package['requires_php'],
				'autoupdate'   => false,
			);
			$bucket                        = version_compare( $package['version'], $transient->checked[ $file ], '>' ) ? 'response' : 'no_update';
			$transient->{$bucket}[ $file ] = $offer;
		}
		return $transient;
	}

	/**
	 * @param mixed               $reply
	 * @param array<string,mixed> $data
	 * @return mixed
	 */
	public static function update_uri( mixed $reply, array $data, string $file ): mixed {
		if ( ! isset( self::descriptors()[ $file ] ) || ( $data['UpdateURI'] ?? '' ) !== self::uri() ) {
			return $reply;
		}
		$transient = self::offers(
			(object) array(
				'checked'   => array( $file => $data['Version'] ),
				'response'  => array(),
				'no_update' => array(),
			)
		);
		return $transient->response[ $file ] ?? $transient->no_update[ $file ] ?? false;
	}

	/**
	 * @param mixed  $reply
	 * @param string $action API action.
	 * @param mixed  $args
	 * @return mixed
	 */
	public static function details( mixed $reply, string $action, mixed $args ): mixed {
		if ( 'plugin_information' !== $action || ! is_admin() || ! current_user_can( 'update_plugins' ) ) {
			return $reply;
		}
		foreach ( self::descriptors() as $file => $descriptor ) {
			if ( ( $args->slug ?? '' ) !== $descriptor['slug'] ) {
				continue;
			}
			$offers = self::offers( (object) array( 'checked' => array( $file => $descriptor['version'] ) ) );
			$offer  = $offers->response[ $file ] ?? $offers->no_update[ $file ] ?? null;
			if ( null !== $offer ) {
				return (object) array(
					'name'          => $descriptor['slug'],
					'slug'          => $descriptor['slug'],
					'version'       => $offer->new_version,
					'requires'      => $offer->requires,
					'requires_php'  => $offer->requires_php,
					'download_link' => $offer->package,
					'sections'      => array( 'description' => esc_html__( 'Signed GitHub release. Install manually through WordPress.', 'sw-sliderman' ) ),
				);
			}
		}
		return $reply;
	}

	public static function ajax_check(): void {
		check_ajax_referer( 'sws_verified_updates', 'nonce' );
		$manual = isset( $_POST['manual'] ) && '1' === $_POST['manual'];
		$result = UpdateService::check( $manual );
		if ( is_wp_error( $result ) ) {
			wp_send_json_error( array( 'message' => $result->get_error_message() ) );
		} else {
			wp_send_json_success( $result );
		}
	}

	public static function enqueue(): void {
		if ( ! UpdateService::interactive() || ! in_array( get_current_screen()->base ?? '', array( 'plugins', 'plugins-network' ), true ) ) {
			return;
		}
		$state = UpdateStore::read();
		wp_enqueue_script( 'sws-verified-updates', SWS_URL . 'build/admin/updates.js', array(), SWS_VERSION, true );
		wp_add_inline_script(
			'sws-verified-updates',
			'window.swsVerifiedUpdates=' . wp_json_encode(
				array(
					'checking'  => __( 'Checking signed releases …', 'sw-sliderman' ),
					'completed' => __( 'Update check completed.', 'sw-sliderman' ),
					'failed'    => __( 'GitHub could not be reached. Try again later.', 'sw-sliderman' ),
					'url'       => admin_url( 'admin-ajax.php' ),
					'nonce'     => wp_create_nonce( 'sws_verified_updates' ),
					'ready'     => self::ready(),
					'due'       => self::ready() && time() - ( $state['last_attempt'] ?? 0 ) >= DAY_IN_SECONDS,
				)
			) . ';',
			'before'
		);
	}

	private static function ready(): bool {
		return (bool) UpdateService::keys() && function_exists( 'sodium_crypto_sign_verify_detached' ) && class_exists( 'ZipArchive' );
	}

	/**
	 * Native plugin overview controls; foreign rows are returned unchanged.
	 *
	 * @param list<string> $meta Existing plugin metadata.
	 * @return list<string>
	 */
	public static function row_meta( array $meta, string $file ): array {
		if ( ! is_admin() || ! isset( self::descriptors()[ $file ] ) || ! UpdateService::interactive() ) {
			return $meta;
		}
		$meta[] = '<span class="sws-verified-updates">'
			. '<button type="button" class="button-link" id="sws-verified-updates-check"' . disabled( ! self::ready(), true, false ) . '>' . esc_html__( 'Check for updates now', 'sw-sliderman' ) . '</button>'
			. ' <span id="sws-verified-updates-result" role="status" aria-live="polite" hidden></span>'
			. ' <a id="sws-verified-updates-reload" href="' . esc_url( is_multisite() ? network_admin_url( 'plugins.php' ) : admin_url( 'plugins.php' ) ) . '" hidden>' . esc_html__( 'Reload the plugin list to show available updates', 'sw-sliderman' ) . '</a>'
			. ' <span id="sws-verified-updates-status">' . esc_html( self::status_text() ) . '</span></span>';
		return $meta;
	}

	/** Local status only; rendering never triggers a release request. */
	public static function status_text(): string {
		if ( ! self::ready() ) {
			return __( 'Public release key or required extensions missing. GitHub updates are blocked.', 'sw-sliderman' );
		}
		$state = UpdateStore::read();
		$text  = __( 'No successful update check yet.', 'sw-sliderman' );
		if ( ! empty( $state['last_success'] ) ) {
			/* translators: %s: elapsed time since the last successful check. */
			$text = sprintf( __( 'Last successful check: %s ago.', 'sw-sliderman' ), human_time_diff( $state['last_success'] ) );
		}
		if ( ! empty( $state['last_attempt'] ) ) {
			/* translators: %s: elapsed time since the last attempt, including failures. */
			$text .= ' ' . sprintf( __( 'Last attempt: %s ago.', 'sw-sliderman' ), human_time_diff( $state['last_attempt'] ) );
		}
		if ( ! empty( $state['error'] ) ) {
			$text .= ' ' . $state['error'];
		}
		return $text;
	}

	public static function migrate(): void {
		if ( ! UpdateService::interactive() || get_option( 'sws_verified_updates_migrated', false ) ) {
			return;
		}
		self::clear_automatic_selection();
		$transient = get_site_transient( 'update_plugins' );
		if ( $transient instanceof stdClass ) {
			foreach ( array_keys( self::descriptors() ) as $file ) {
				unset( $transient->response[ $file ], $transient->no_update[ $file ] );
			}
			set_site_transient( 'update_plugins', $transient );
		}
		update_option( 'sws_verified_updates_migrated', 1, false );
	}

	private static function clear_automatic_selection(): void {
		$selected = get_site_option( 'auto_update_plugins', array() );
		if ( is_array( $selected ) ) {
			update_site_option( 'auto_update_plugins', array_values( array_diff( $selected, array_keys( self::descriptors() ) ) ) );
		}
	}

	/** Remove executable cached offers before this plugin's guards stop loading. */
	public static function deactivate(): void {
		self::clear_automatic_selection();
		remove_filter( 'site_transient_update_plugins', array( self::class, 'offers' ) );
		remove_filter( 'pre_set_site_transient_update_plugins', array( self::class, 'offers' ) );
		$transient = get_site_transient( 'update_plugins' );
		if ( $transient instanceof stdClass ) {
			foreach ( array_keys( self::descriptors() ) as $file ) {
				unset( $transient->response[ $file ], $transient->no_update[ $file ] );
			}
			set_site_transient( 'update_plugins', $transient );
		}
	}
}

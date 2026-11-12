<?php
declare(strict_types=1);
use SW\Slider\Infrastructure\Updates\{UpdateManifest, UpdatePackage, UpdateProvider, UpdateService, UpdateStore, UpdateTransport};
/** End-to-end signed releases with isolated HTTP and disposable signing keys. */
final class SWS_Verified_Update_Exit extends Error {}

final class VerifiedUpdatesTest extends WP_UnitTestCase {
	private int $admin_id;
	private string $secret;
	private array $keys;
	private array $release;
	private array $manifest;
	private string $raw;
	private string $signature;
	private string $zip;
	private array $requests = array();

	public function set_up(): void {
		parent::set_up();
		$this->admin_id = self::factory()->user->create( array( "role" => "administrator" ) );
		wp_set_current_user( $this->admin_id );
		UpdateProvider::init();
		if ( is_multisite() ) {
			grant_super_admin( $this->admin_id );
		}
		set_current_screen( is_multisite() ? 'plugins-network' : 'plugins' );

		delete_site_option( UpdateStore::STATE );
		delete_site_option( UpdateStore::LOCK );
		$keypair = sodium_crypto_sign_keypair();
		$this->secret = sodium_crypto_sign_secretkey( $keypair );
		$this->keys = array( 'test' => base64_encode( sodium_crypto_sign_publickey( $keypair ) ) );
		add_filter( 'sws_verified_release_public_keys', fn () => $this->keys );
		$this->zip = wp_tempnam( 'sws-signed-test.zip' );
		$archive = new ZipArchive();
		$archive->open( $this->zip, ZipArchive::OVERWRITE );
		$archive->addFromString( 'sw-sliderman/sw-sliderman.php', "<?php\n/**\n * Plugin Name: Signed test plugin\n * Version: 9.0.0\n * Requires PHP: 8.2\n * Requires at least: 6.0\n * Update URI: https://github.com/sw-wordpress/sw-sliderman\n */\n" );
		$archive->close();
		$package = array( 'slug' => 'sw-sliderman', 'version' => '9.0.0', 'asset_id' => 55, 'filename' => 'sw-sliderman-9.0.0.zip', 'bytes' => filesize( $this->zip ), 'sha256' => hash_file( 'sha256', $this->zip ), 'requires_php' => '8.2', 'requires_wp' => '6.0', 'main_file' => 'sw-sliderman.php' );
		$this->release = array( 'id' => 42, 'tag_name' => 'v9.0.0', 'draft' => false, 'prerelease' => false, 'assets' => array( array( 'id' => 55, 'name' => $package['filename'], 'size' => $package['bytes'] ), array( 'id' => 56, 'name' => 'sw-plugin-release.json' ), array( 'id' => 57, 'name' => 'sw-plugin-release.json.sig' ) ) );
		$this->manifest = array( 'schema' => 1, 'repository' => UpdateManifest::source()['repository'], 'repository_id' => UpdateManifest::source()['repository_id'], 'release_id' => 42, 'tag' => 'v9.0.0', 'commit' => str_repeat( 'a', 40 ), 'issued_at' => time(), 'packages' => array( $package ) );
		$this->sign();
		remove_all_filters( 'pre_http_request' );
		add_filter( 'pre_http_request', function ( $pre, $args, $url ) {
			$this->requests[] = $url;
			if ( str_contains( $url, 'api.wordpress.org/' ) ) {
				$body = wp_json_encode( array( 'plugins' => array(), 'themes' => array(), 'no_update' => array(), 'translations' => array() ) );
			} elseif ( ! empty( $args['stream'] ) ) {
				copy( $this->zip, $args['filename'] );
				$body = '';
			} elseif ( str_ends_with( $url, '/releases/latest' ) ) {
				$body = wp_json_encode( $this->release );
			} elseif ( str_ends_with( $url, '.json.sig' ) ) {
				$body = $this->signature;
			} else {
				$body = $this->raw;
			}
			return array( 'headers' => array(), 'body' => $body, 'response' => array( 'code' => 200 ) );
		}, 10, 3 );
	}

	private function sign(): void {
		$this->raw = wp_json_encode( $this->manifest );
		$this->signature = wp_json_encode( array( 'key_id' => 'test', 'signature' => base64_encode( sodium_crypto_sign_detached( $this->raw, $this->secret ) ) ) );
	}

	public function tear_down(): void {
		if ( is_multisite() ) {
			revoke_super_admin( $this->admin_id );
		}
		wp_delete_file( $this->zip );
		set_current_screen( 'front' );
		parent::tear_down();
	}

	public function test_signed_release_is_cached_and_displayed_without_additional_http(): void {
		$this->assertIsArray( UpdateService::check() );
		$this->assertCount( 3, $this->requests );
		$file = array_key_first( UpdateProvider::descriptors() );
		$offers = UpdateProvider::offers( (object) array( 'checked' => array( $file => SWS_VERSION ) ) );
		$this->assertSame( '9.0.0', $offers->response[ $file ]->new_version );
		$this->assertFalse( $offers->response[ $file ]->autoupdate );
		$this->assertCount( 3, $this->requests );
		$this->assertWPError( UpdateService::check() );
		delete_site_transient( 'update_plugins' );
		$this->assertWPError( UpdateService::check( true ) );
		$this->assertCount( 3, $this->requests );
	}

	public function test_failed_requests_are_throttled_and_manual_check_can_override_daily_limit(): void {
		$this->release['draft'] = true;
		$this->assertWPError( UpdateService::check() );
		$this->assertWPError( UpdateService::check() );
		$this->assertCount( 1, $this->requests );
		$state = UpdateStore::read();
		$state['last_attempt'] = time() - 61;
		UpdateStore::write( $state );
		$this->release['draft'] = false;
		$this->assertIsArray( UpdateService::check( true ) );
		$this->assertCount( 4, $this->requests );
	}

	public function test_frontend_and_unprivileged_users_never_check_or_load_remote_offers(): void {
		set_current_screen( 'front' );
		$this->assertWPError( UpdateService::check( true ) );
		$value = (object) array( 'checked' => array() );
		$this->assertSame( $value, UpdateProvider::offers( $value ) );
		set_current_screen( is_multisite() ? 'plugins-network' : 'plugins' );
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );
		$this->assertWPError( UpdateService::check( true ) );
		$this->assertCount( 0, $this->requests );
	}

	public function test_unknown_key_and_modified_signature_fail_closed(): void {
		$this->keys = array();
		$this->assertWPError( UpdateService::check() );
		$this->assertCount( 0, $this->requests );
		$this->keys = array( 'test' => base64_encode( random_bytes( 32 ) ) );
		$this->assertWPError( UpdateService::check() );
		$this->assertArrayNotHasKey( 'manifest', UpdateStore::read() );
	}

	/** @dataProvider invalid_manifests */
	public function test_signed_but_invalid_metadata_is_rejected( string $field, $value ): void {
		$this->manifest[ $field ] = $value;
		$this->sign();
		$this->assertWPError( UpdateService::check() );
	}
	public static function invalid_manifests(): array {
		return array( 'repository' => array( 'repository', 'attacker/repo' ), 'repository ID' => array( 'repository_id', 1 ), 'release ID' => array( 'release_id', 1 ), 'schema' => array( 'schema', 2 ), 'future' => array( 'issued_at', time() + 3600 ), 'duplicates' => array( 'packages', array() ) );
	}

	public function test_even_validly_signed_duplicate_json_keys_are_rejected(): void {
		$this->raw = str_replace( '"schema":1', '"schema":2,"schema":1', $this->raw );
		$this->signature = wp_json_encode( array( 'key_id' => 'test', 'signature' => base64_encode( sodium_crypto_sign_detached( $this->raw, $this->secret ) ) ) );
		$this->assertWPError( UpdateService::check() );
	}

	public function test_lock_owner_cannot_release_another_request_lock(): void {
		$lock = UpdateStore::acquire();
		$this->assertIsArray( $lock );
		$this->assertFalse( UpdateStore::acquire() );
		UpdateStore::release( array( 'token' => 'wrong', 'expires' => 0 ) );
		$this->assertFalse( UpdateStore::acquire() );
		UpdateStore::release( $lock );
		$this->assertIsArray( $next = UpdateStore::acquire() );
		UpdateStore::release( $lock );
		$this->assertSame( $next, get_site_option( UpdateStore::LOCK ) );
	}

	public function test_core_download_boundary_returns_only_verified_zip_and_rejects_tampered_urls(): void {
		$this->assertIsArray( UpdateService::check() );
		$file = array_key_first( UpdateProvider::descriptors() );
		$_REQUEST['action'] = 'upgrade-plugin';
		$_REQUEST['_wpnonce'] = wp_create_nonce( 'upgrade-plugin_' . $file );
		$url = UpdateManifest::url( $this->manifest, $this->manifest['packages'][0] );
		$download = apply_filters( 'upgrader_pre_download', false, $url, new stdClass(), array( 'plugin' => $file ) );
		$this->assertIsString( $download );
		$this->assertSame( $this->manifest['packages'][0]['sha256'], hash_file( 'sha256', $download ) );
		wp_delete_file( $download );
		$this->assertWPError( apply_filters( 'upgrader_pre_download', false, 'https://evil.invalid/a.zip', new stdClass(), array( 'plugin' => $file ) ) );
		$_REQUEST['action'] = 'other-action';
		$this->assertWPError( apply_filters( 'upgrader_pre_download', false, $url, new stdClass(), array( 'plugin' => $file ) ) );
		$this->assertFalse( apply_filters( 'auto_update_plugin', true, (object) array( 'plugin' => $file ) ) );
		$this->assertTrue( apply_filters( 'auto_update_plugin', true, (object) array( 'plugin' => 'other/other.php' ) ) );
	}

	/** @dataProvider unsafe_entries */
	public function test_zip_paths_are_rejected_even_with_a_matching_hash( string $entry, bool $symlink = false ): void {
		$zip = new ZipArchive();
		$zip->open( $this->zip );
		$zip->addFromString( $entry, 'outside' );
		if ( $symlink ) $zip->setExternalAttributesName( $entry, ZipArchive::OPSYS_UNIX, 0120777 << 16 );
		$zip->close();
		$package = $this->manifest['packages'][0];
		$package['bytes'] = filesize( $this->zip );
		$package['sha256'] = hash_file( 'sha256', $this->zip );
		$this->assertWPError( UpdatePackage::verify( $this->zip, $package ) );
	}
	public static function unsafe_entries(): array {
		return array( array( 'sw-sliderman/../outside.php' ), array( '/absolute.php' ), array( 'sw-sliderman\\outside.php' ), array( 'sw-sliderman/C:/outside' ), array( 'sw-sliderman/link', true ), array( 'Churchtools-suite/CHURCHTOOLS-SUITE.PHP' ) );
	}

	public function test_frontend_filters_add_no_database_queries_and_cron_cannot_download(): void {
		set_current_screen( 'front' );
		$value = (object) array( 'checked' => array() );
		$before = get_num_queries();
		$this->assertSame( $value, UpdateProvider::offers( $value ) );
		$this->assertSame( $before, get_num_queries() );
		set_current_screen( is_multisite() ? 'plugins-network' : 'plugins' );
		add_filter( 'wp_doing_cron', '__return_true' );
		$this->assertWPError( UpdateService::check( true ) );
		$this->assertCount( 0, $this->requests );
	}

	public function test_expired_snapshot_and_corrupt_zip_are_rejected_before_core_installation(): void {
		$this->assertIsArray( UpdateService::check() );
		$state = UpdateStore::read();
		$state['last_success'] = time() - 8 * DAY_IN_SECONDS;
		UpdateStore::write( $state );
		$this->assertWPError( UpdateService::verified_snapshot() );
		$state['last_success'] = time();
		UpdateStore::write( $state );
		file_put_contents( $this->zip, 'tampered package' );
		$descriptors = UpdateProvider::descriptors();
		$descriptor = reset( $descriptors );
		$url = UpdateManifest::url( $this->manifest, $this->manifest['packages'][0] );
		$this->assertWPError( UpdateService::download( $url, $descriptor ) );
	}

	public function test_rediresws_and_size_limits_fail_closed(): void {
		remove_all_filters( 'pre_http_request' );
		$seen = array();
		add_filter( 'pre_http_request', static function ( $pre, $args, $url ) use ( &$seen ) {
			$seen[] = $url;
			return array( 'headers' => array( 'location' => 'https://127.0.0.1/private' ), 'body' => '', 'response' => array( 'code' => 302 ) );
		}, 10, 3 );
		$this->assertWPError( UpdateTransport::fetch( 'https://api.github.com/repos/sw-wordpress/sw-sliderman/releases/latest', 1024 ) );
		$this->assertCount( 1, $seen );
		remove_all_filters( 'pre_http_request' );
		add_filter( 'pre_http_request', static fn () => array( 'headers' => array(), 'body' => str_repeat( 'a', 1025 ), 'response' => array( 'code' => 200 ) ) );
		$this->assertWPError( UpdateTransport::fetch( 'https://api.github.com/repos/sw-wordpress/sw-sliderman/releases/latest', 1024 ) );
	}

	public function test_release_signer_and_runtime_verifier_agree(): void {
		$directory = get_temp_dir() . 'sws-sign-' . wp_generate_uuid4();
		wp_mkdir_p( $directory );
		$zipfile = $directory . '/' . $this->manifest['packages'][0]['filename'];
		copy( $this->zip, $zipfile );
		$metadata = $directory . '/release.json';
		file_put_contents( $metadata, wp_json_encode( $this->release ) );
		$process = proc_open( array( PHP_BINARY, SWS_DIR . 'bin/release-manifest.php', 'sign', $metadata, $directory, str_repeat( 'a', 40 ) ), array( array( 'pipe', 'r' ), array( 'pipe', 'w' ), array( 'pipe', 'w' ) ), $pipes, null, array( 'SW_PLUGIN_RELEASE_SIGNING_KEY' => base64_encode( $this->secret ), 'SW_PLUGIN_RELEASE_KEY_ID' => 'test' ) );
		fclose( $pipes[0] );
		$output = stream_get_contents( $pipes[1] ) . stream_get_contents( $pipes[2] );
		fclose( $pipes[1] );
		fclose( $pipes[2] );
		$exit = proc_close( $process );
		try {
			$this->assertSame( 0, $exit, $output );
			$this->assertIsArray( UpdateManifest::verify( file_get_contents( $directory . '/sw-plugin-release.json' ), file_get_contents( $directory . '/sw-plugin-release.json.sig' ), $this->keys, $this->release ) );
			$this->assertStringNotContainsString( base64_encode( $this->secret ), $output );
		} finally {
			foreach ( glob( $directory . '/*' ) as $file ) wp_delete_file( $file );
			rmdir( $directory );
		}
	}

	/** @dataProvider core_modes */
	public function test_native_wordpress_upgrader_installs_verified_package_only_in_private_wp( string $mode ): void {
		$this->assertStringStartsWith( SWS_DIR . 'tests/wp/vendor/', realpath( WP_PLUGIN_DIR ) );
		$root = WP_PLUGIN_DIR . '/sw-sliderman';
		$this->assertDirectoryDoesNotExist( $root );
		wp_mkdir_p( $root );
		$buffer_level = ob_get_level();
		ob_start();
		try {
			$file = 'sw-sliderman/sw-sliderman.php';
			add_filter( 'sws_verified_update_descriptors', static fn () => array( $file => array( 'slug' => 'sw-sliderman', 'version' => '1.0.0' ) ) );
			file_put_contents( $root . '/sw-sliderman.php', "<?php\n/*\nPlugin Name: Old test plugin\nVersion: 1.0.0\n*/\n" );
			$this->assertIsArray( UpdateService::check() );
			require_once ABSPATH . 'wp-admin/includes/file.php';
			require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
			WP_Filesystem();
			set_site_transient( 'update_plugins', (object) array( 'checked' => array( $file => '1.0.0' ) ) );
			$this->assertArrayHasKey( $file, get_site_transient( 'update_plugins' )->response ?? array() );
			$bulk = 'bulk' === $mode;
			$_REQUEST['action'] = $bulk ? 'update-selected' : ( 'ajax' === $mode ? 'update-plugin' : 'upgrade-plugin' );
			$_REQUEST['_wpnonce'] = wp_create_nonce( $bulk ? 'bulk-update-plugins' : ( 'ajax' === $mode ? 'updates' : 'upgrade-plugin_' . $file ) );
			$upgrader = new Plugin_Upgrader( new WP_Ajax_Upgrader_Skin() );
			$result = $bulk ? $upgrader->bulk_upgrade( array( $file ), array( 'clear_update_cache' => false ) ) : $upgrader->upgrade( $file, array( 'clear_update_cache' => false ) );
			if ( $bulk ) {
				$this->assertIsArray( $result );
				$this->assertIsArray( $result[ $file ] );
				$result = true;
			}
			$this->assertTrue( $result, is_wp_error( $result ) ? $result->get_error_message() : 'Native upgrade failed: ' . $upgrader->skin->get_error_messages() );
			$this->assertStringContainsString( 'Version: 9.0.0', file_get_contents( $root . '/sw-sliderman.php' ) );
		} finally {
			while ( ob_get_level() > $buffer_level ) ob_end_clean();
			wp_delete_file( $root . '/sw-sliderman.php' );
			if ( is_dir( $root ) ) rmdir( $root );
		}
	}
	public static function core_modes(): array { return array( 'single' => array( 'single' ), 'bulk' => array( 'bulk' ), 'ajax' => array( 'ajax' ) ); }
	public function test_wordpress_details_and_update_uri_use_only_cached_signed_metadata(): void {
		$this->assertIsArray( UpdateService::check() );
		$file = array_key_first( UpdateProvider::descriptors() );
		$uri = 'https://github.com/sw-wordpress/sw-sliderman';
		$offer = UpdateProvider::update_uri( false, array( 'UpdateURI' => $uri, 'Version' => SWS_VERSION ), $file );
		$this->assertSame( '9.0.0', $offer->new_version );
		$details = UpdateProvider::details( false, 'plugin_information', (object) array( 'slug' => 'sw-sliderman' ) );
		$this->assertSame( '9.0.0', $details->version );
		$original = (object) array( 'foreign' => true );
		$this->assertSame( $original, UpdateProvider::update_uri( $original, array( 'UpdateURI' => 'https://evil.invalid', 'Version' => '1' ), $file ) );
		$this->assertSame( $original, UpdateProvider::details( $original, 'plugin_information', (object) array( 'slug' => 'other-plugin' ) ) );
		$this->assertCount( 3, $this->requests );
		$this->assertSame( esc_html__( 'Manual updates only', 'sw-sliderman' ), UpdateProvider::automatic_html( '', $file ) );
		$this->assertSame( 'unchanged', UpdateProvider::automatic_html( 'unchanged', 'foreign/plugin.php' ) );
	}

	private function ajax( string $nonce ): mixed {
		$_POST = array( 'nonce' => $nonce, 'manual' => '1' );
		$_REQUEST = $_POST;
		add_filter( 'wp_doing_ajax', '__return_true' );
		add_filter( 'wp_die_ajax_handler', static fn () => static function ( $message ) { echo $message; throw new SWS_Verified_Update_Exit(); } );
		ob_start();
		try {
			do_action( 'wp_ajax_sws_check_github_updates' );
		} catch ( SWS_Verified_Update_Exit $exception ) {
			// Capture WordPress's terminating response without ending the test process.
		}
		return json_decode( ob_get_clean(), true, 32, JSON_THROW_ON_ERROR );
	}

	public function test_check_ajax_rejects_invalid_nonce_before_http(): void {
		$this->assertSame( -1, $this->ajax( 'invalid' ) );
		$this->assertCount( 0, $this->requests );
	}

	public function test_check_ajax_rejects_users_without_wordpress_update_capability(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );
		$this->assertFalse( $this->ajax( wp_create_nonce( 'sws_verified_updates' ) )['success'] );
		$this->assertCount( 0, $this->requests );
	}

	public function test_authorized_check_ajax_checks_but_never_installs(): void {
		// The shared AJAX endpoint has a site-admin screen even when called by network admin.
		set_current_screen( 'dashboard' );
		$this->assertTrue( $this->ajax( wp_create_nonce( 'sws_verified_updates' ) )['success'] );
		$this->assertCount( 3, $this->requests );
		$this->assertFalse( $this->ajax( wp_create_nonce( 'sws_verified_updates' ) )['success'] );
		$this->assertCount( 3, $this->requests );
	}

	public function test_multisite_site_admin_context_cannot_check_without_network_ajax(): void {
		if ( ! is_multisite() ) {
			$this->assertTrue( UpdateService::interactive() );
			return;
		}
		set_current_screen( 'dashboard' );
		$this->assertWPError( UpdateService::check( true ) );
		$this->assertCount( 0, $this->requests );
		add_filter( 'wp_doing_ajax', '__return_true' );
		revoke_super_admin( $this->admin_id );
		$this->assertWPError( UpdateService::check( true ) );
		$this->assertCount( 0, $this->requests );
	}

	public function test_deactivation_clears_only_own_offers_and_automatic_selections(): void {
		$this->assertIsArray( UpdateService::check() );
		$file = array_key_first( UpdateProvider::descriptors() );
		update_site_option( 'auto_update_plugins', array( $file, 'other/other.php' ) );
		set_site_transient( 'update_plugins', (object) array(
			'checked' => array( $file => '1.0.0', 'other/other.php' => '1.0.0' ),
			'response' => array( 'other/other.php' => (object) array( 'new_version' => '2.0.0' ) ),
		) );
		$this->assertArrayHasKey( $file, get_site_transient( 'update_plugins' )->response );
		UpdateProvider::deactivate();
		$this->assertSame( array( 'other/other.php' ), get_site_option( 'auto_update_plugins' ) );
		$this->assertArrayNotHasKey( $file, get_site_transient( 'update_plugins' )->response );
		$this->assertArrayHasKey( 'other/other.php', get_site_transient( 'update_plugins' )->response );
	}

	public function test_expired_lock_is_taken_over_and_new_owner_is_preserved(): void {
		$old = array( 'token' => 'expired', 'expires' => time() - 10 );
		add_site_option( UpdateStore::LOCK, $old );
		$this->assertIsArray( $new = UpdateStore::acquire() );
		UpdateStore::release( $old );
		$this->assertSame( $new, get_site_option( UpdateStore::LOCK ) );
	}

	public function test_signed_rollback_cannot_replace_a_previously_verified_release(): void {
		$this->assertIsArray( UpdateService::check() );
		$state = UpdateStore::read();
		$state['last_attempt'] = time() - 61;
		UpdateStore::write( $state );
		$this->manifest['packages'][0]['version'] = '8.0.0';
		$this->manifest['packages'][0]['filename'] = 'sw-sliderman-8.0.0.zip';
		$this->manifest['tag'] = 'v8.0.0';
		$this->release['tag_name'] = 'v8.0.0';
		$this->release['assets'][0]['name'] = 'sw-sliderman-8.0.0.zip';
		$this->sign();
		$this->assertWPError( UpdateService::check( true ) );
		$this->assertSame( '9.0.0', UpdateStore::read()['highest']['sw-sliderman'] );
	}

	public function test_invalid_native_update_nonce_never_downloads_a_package(): void {
		$this->assertIsArray( UpdateService::check() );
		$file = array_key_first( UpdateProvider::descriptors() );
		$_REQUEST = array( 'action' => 'upgrade-plugin', '_wpnonce' => 'forged' );
		$url = UpdateManifest::url( $this->manifest, $this->manifest['packages'][0] );
		$this->assertWPError( apply_filters( 'upgrader_pre_download', false, $url, new stdClass(), array( 'plugin' => $file ) ) );
		$this->assertCount( 3, $this->requests );
	}

	/** @dataProvider invalid_packages */
	public function test_signed_package_bindings_are_strict( string $field, mixed $value ): void {
		$this->manifest['packages'][0][$field] = $value;
		$this->sign();
		$this->assertWPError( UpdateService::check() );
	}
	public static function invalid_packages(): array {
		return array(
			array( 'asset_id', 999 ), array( 'asset_id', '55' ), array( 'slug', 'other-plugin' ),
			array( 'filename', 'source.zip' ), array( 'main_file', 'other.php' ), array( 'bytes', 52428801 ),
			array( 'sha256', str_repeat( 'A', 64 ) ), array( 'version', '9.0.0-rc1' ), array( 'requires_php', '' ),
		);
	}

	public function test_duplicate_asset_names_and_ids_are_rejected(): void {
		$this->release['assets'][] = $this->release['assets'][0];
		$this->assertWPError( UpdateService::check() );
	}

	public function test_signature_is_rechecked_at_installation_and_rollback_cache_is_enforced(): void {
		$this->assertIsArray( UpdateService::check() );
		$state = UpdateStore::read();
		$state['raw'] .= ' ';
		UpdateStore::write( $state );
		$this->assertWPError( UpdateService::verified_snapshot() );
		$state['raw'] = $this->raw;
		$state['highest']['sw-sliderman'] = '10.0.0';
		UpdateStore::write( $state );
		$this->assertWPError( UpdateService::verified_snapshot() );
	}

	public function test_expired_owner_does_not_publish_a_delayed_response(): void {
		add_filter( 'pre_http_request', static function ( $reply ) {
			update_site_option( UpdateStore::LOCK, array( 'token' => 'successor', 'expires' => time() + 120 ) );
			return $reply;
		}, 20 );
		$this->assertWPError( UpdateService::check() );
		$this->assertArrayNotHasKey( 'manifest', UpdateStore::read() );
		$this->assertSame( 'successor', get_site_option( UpdateStore::LOCK )['token'] );
	}

	public function test_http_errors_and_redirect_limit_are_bounded_and_persist_attempts(): void {
		remove_all_filters( 'pre_http_request' );
		$count = 0;
		add_filter( 'pre_http_request', static function () use ( &$count ) {
			++$count;
			return array( 'headers' => array(), 'body' => '', 'response' => array( 'code' => 503 ) );
		} );
		$this->assertWPError( UpdateService::check() );
		delete_site_transient( 'update_plugins' );
		$this->assertWPError( UpdateService::check() );
		$this->assertSame( 1, $count );
		remove_all_filters( 'pre_http_request' );
		$count = 0;
		add_filter( 'pre_http_request', static function () use ( &$count ) {
			++$count;
			return array( 'headers' => array( 'location' => 'https://objects.githubusercontent.com/loop' ), 'body' => '', 'response' => array( 'code' => 302 ) );
		} );
		$this->assertWPError( UpdateTransport::fetch( 'https://objects.githubusercontent.com/start', 32 ) );
		$this->assertSame( 5, $count );
	}

	/** @dataProvider forbidden_urls */
	public function test_transport_allows_only_explicit_https_hosts_and_paths( string $url ): void {
		$this->assertFalse( UpdateTransport::allowed( $url ) );
		$this->assertCount( 0, $this->requests );
	}
	public static function forbidden_urls(): array {
		return array_map( static fn ( $url ) => array( $url ), array(
			'http://github.com/sw-wordpress/sw-sliderman/releases/download/v1/a.zip',
			'https://github.com:444/sw-wordpress/sw-sliderman/releases/download/v1/a.zip',
			'https://user@objects.githubusercontent.com/a', 'https://objects.githubusercontent.com/a#fragment',
			'https://github.com/sw-wordpress/other/releases/download/v1/a.zip',
			'https://objects.githubusercontent.com/%2e%2e/private', 'https://evil.githubusercontent.com/a',
			'https://api.github.com/repos/sw-wordpress/other/releases/latest', 'file:///tmp/a',
		) );
	}

	public function test_zip_bombs_duplicate_case_and_file_directory_collisions_fail(): void {
		$original = file_get_contents( $this->zip );
		foreach ( array( 'sw-sliderman/SW-SLIDERMAN.PHP', 'sw-sliderman/file/child', 'sw-sliderman/bomb' ) as $entry ) {
			file_put_contents( $this->zip, $original );
			$zip = new ZipArchive(); $zip->open( $this->zip );
			$zip->addFromString( 'sw-sliderman/file', 'file' );
			$zip->addFromString( $entry, str_repeat( 'a', 2 * 1024 * 1024 ) ); $zip->close();
			$package = $this->manifest['packages'][0];
			clearstatcache( true, $this->zip );
			$package['bytes'] = filesize( $this->zip ); $package['sha256'] = hash_file( 'sha256', $this->zip );
			$this->assertWPError( UpdatePackage::verify( $this->zip, $package ) );
		}
	}

	public function test_headers_missing_identity_and_incompatible_requirements_block_updates(): void {
		$package = $this->manifest['packages'][0];
		$this->assertTrue( UpdatePackage::verify( $this->zip, $package ) );
		$zip = new ZipArchive(); $zip->open( $this->zip );
		$zip->addFromString( 'sw-sliderman/sw-sliderman.php', '<?php /* Plugin Name: Wrong plugin */' ); $zip->close();
		clearstatcache( true, $this->zip );
		$package['bytes'] = filesize( $this->zip ); $package['sha256'] = hash_file( 'sha256', $this->zip );
		$this->assertWPError( UpdatePackage::verify( $this->zip, $package ) );
		$package['requires_php'] = '99.0';
		$this->assertFalse( UpdateService::compatible( $package ) );
	}

	public function test_migration_and_status_preserve_foreign_plugin_state(): void {
		delete_option( 'sws_verified_updates_migrated' );
		$file = array_key_first( UpdateProvider::descriptors() );
		update_site_option( 'auto_update_plugins', array( $file, 'sw-forms/sw-forms.php' ) );
		UpdateProvider::migrate();
		$this->assertSame( array( 'sw-forms/sw-forms.php' ), get_site_option( 'auto_update_plugins' ) );
		$this->keys = array();
		$html = implode( '', apply_filters( 'plugin_row_meta', array(), $file ) );
		$this->assertStringContainsString( esc_html__( 'Public release key or required extensions missing. GitHub updates are blocked.', 'sw-sliderman' ), $html );
		$this->assertStringContainsString( 'sws-verified-updates-check', $html );
	}

	public function test_background_skin_and_cron_cannot_download_even_with_cached_offer(): void {
		$this->assertIsArray( UpdateService::check() );
		require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
		$file = array_key_first( UpdateProvider::descriptors() );
		$_REQUEST = array( 'action' => 'upgrade-plugin', '_wpnonce' => wp_create_nonce( 'upgrade-plugin_' . $file ) );
		$url = UpdateManifest::url( $this->manifest, $this->manifest['packages'][0] );
		$this->assertWPError( UpdateProvider::download_guard( false, $url, (object) array( 'skin' => new Automatic_Upgrader_Skin() ), array( 'plugin' => $file ) ) );
		add_filter( 'wp_doing_cron', '__return_true' );
		$this->assertWPError( UpdateProvider::download_guard( false, $url, new stdClass(), array( 'plugin' => $file ) ) );
		$this->assertCount( 3, $this->requests );
	}

	public function test_two_activated_provider_plugins_have_isolated_hooks_keys_and_storage(): void {
		$this->assertStringStartsWith( SWS_DIR . 'tests/wp/vendor/', realpath( WP_PLUGIN_DIR ) );
		$root = WP_PLUGIN_DIR . '/peer-test';
		wp_mkdir_p( $root . '/includes/update' );
		$peer_secret = sodium_crypto_sign_keypair();
		$peer_public = base64_encode( sodium_crypto_sign_publickey( $peer_secret ) );
		try {
			$source = UpdateManifest::source();
			$source['repository'] = 'fixture/sw-peer'; $source['repository_id'] = 999;
			$source['main_slug'] = 'peer-test'; $source['allowed_slugs'] = array( 'peer-test' );
			$source['state_key'] = 'sw_peer_verified_github_updates_v1'; $source['lock_key'] = 'sw_peer_verified_github_updates_lock_v1';
			file_put_contents( $root . '/includes/update/source.php', '<?php return ' . var_export( $source, true ) . ';' );
			file_put_contents( $root . '/includes/update/descriptors.php', '<?php return array("peer-test/peer-test.php" => array("slug" => "peer-test", "version" => "1.0.0"));' );
			file_put_contents( $root . '/includes/update/trusted-keys.php', '<?php return ' . var_export( array( 'peer' => $peer_public ), true ) . ';' );
			$loader = '<?php /* Plugin Name: SW peer updater fixture */' . "\n";
			foreach ( array( 'Manifest', 'Package', 'Provider', 'Service', 'Store', 'Transport' ) as $class ) {
				$code = file_get_contents( SWS_DIR . 'src/Infrastructure/Updates/Update' . $class . '.php' );
				$code = str_replace( array( 'namespace SW\\Slider\\Infrastructure\\Updates;', 'dirname( __DIR__, 3 )', 'sws_', 'sws-', 'swsVerified', 'SWS_RELEASE_PUBLIC_KEYS' ), array( 'namespace SW\\Slider\\Tests\\PeerUpdates;', var_export( $root, true ), 'sw_peer_', 'sw-peer-', 'swPeerVerified', 'SW_PEER_RELEASE_PUBLIC_KEYS' ), $code );
				file_put_contents( $root . '/Update' . $class . '.php', $code );
				$loader .= 'require_once __DIR__ . "/Update' . $class . '.php";' . "\n";
			}
			$loader .= '\\SW\\Slider\\Tests\\PeerUpdates\\UpdateProvider::init();';
			file_put_contents( $root . '/peer-test.php', $loader );
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
			$this->assertNull( activate_plugin( 'peer-test/peer-test.php', '', is_multisite() ) );
			$this->assertTrue( is_plugin_active( 'peer-test/peer-test.php' ) );
			$this->assertSame( array( 'peer' => $peer_public ), \SW\Slider\Tests\PeerUpdates\UpdateService::keys() );
			$this->assertSame( $this->keys, UpdateService::keys() );
			$peer_lock = \SW\Slider\Tests\PeerUpdates\UpdateStore::acquire();
			$own_lock = UpdateStore::acquire();
			$this->assertIsArray( $peer_lock ); $this->assertIsArray( $own_lock );
			\SW\Slider\Tests\PeerUpdates\UpdateStore::write( array( 'last_attempt' => 123 ) );
			$this->assertSame( array(), UpdateStore::read() );
			$this->assertSame( 123, \SW\Slider\Tests\PeerUpdates\UpdateStore::read()['last_attempt'] );
			$foreign = (object) array( 'new_version' => '2.0.0' );
			$this->assertSame( $foreign, apply_filters( 'update_plugins_github.com', $foreign, array( 'UpdateURI' => 'https://github.com/another/plugin' ), 'another/plugin.php' ) );
			$this->assertTrue( apply_filters( 'auto_update_plugin', true, (object) array( 'plugin' => 'another/plugin.php' ) ) );
			$this->assertFalse( apply_filters( 'auto_update_plugin', true, (object) array( 'plugin' => 'peer-test/peer-test.php' ) ) );
			UpdateStore::release( $own_lock );
			$this->assertTrue( \SW\Slider\Tests\PeerUpdates\UpdateStore::owns( $peer_lock ) );
			\SW\Slider\Tests\PeerUpdates\UpdateStore::release( $peer_lock );
		} finally {
			deactivate_plugins( 'peer-test/peer-test.php', true, is_multisite() );
			$entries = new RecursiveIteratorIterator( new RecursiveDirectoryIterator( $root, FilesystemIterator::SKIP_DOTS ), RecursiveIteratorIterator::CHILD_FIRST );
			foreach ( $entries as $entry ) { if ( $entry->isDir() ) rmdir( $entry->getPathname() ); else unlink( $entry->getPathname() ); }
			rmdir( $root );
		}
	}

	public function test_plugin_overview_contains_check_status_and_native_reload_but_no_editor_controls(): void {
		$file = array_key_first( UpdateProvider::descriptors() );
		$meta = apply_filters( 'plugin_row_meta', array( 'existing' ), $file );
		$this->assertCount( 2, $meta );
		$this->assertSame( 'existing', $meta[0] );
		$this->assertStringContainsString( 'sws-verified-updates-check', $meta[1] );
		$this->assertStringContainsString( 'sws-verified-updates-status', $meta[1] );
		$this->assertStringContainsString( is_multisite() ? network_admin_url( 'plugins.php' ) : admin_url( 'plugins.php' ), $meta[1] );
		$this->assertSame( array( 'foreign' ), apply_filters( 'plugin_row_meta', array( 'foreign' ), 'other/plugin.php' ) );
		$this->assertCount( 0, $this->requests );
		UpdateProvider::enqueue();
		$this->assertTrue( wp_script_is( 'sws-verified-updates', 'enqueued' ) );
		$this->assertSame( SWS_VERSION, wp_scripts()->registered['sws-verified-updates']->ver );
		wp_dequeue_script( 'sws-verified-updates' );
		set_current_screen( 'toplevel_page_sw-sliderman' );
		UpdateProvider::enqueue();
		$this->assertFalse( wp_script_is( 'sws-verified-updates', 'enqueued' ) );
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );
		$this->assertSame( array(), UpdateProvider::row_meta( array(), $file ) );
	}

	public function test_cli_and_rest_contexts_stop_before_capability_storage_or_network_apis(): void {
		foreach ( array( 'WP_CLI', 'REST_REQUEST' ) as $constant ) {
			$script = 'define(' . var_export( $constant, true ) . ', true); function is_admin() { return true; } function wp_doing_cron() { return false; } require ' . var_export( SWS_DIR . 'src/Infrastructure/Updates/UpdateService.php', true ) . '; exit(\\SW\\Slider\\Infrastructure\\Updates\\UpdateService::interactive() ? 1 : 0);';
			$process = proc_open( array( PHP_BINARY, '-r', $script ), array( 1 => array( 'pipe', 'w' ), 2 => array( 'pipe', 'w' ) ), $pipes );
			$output = stream_get_contents( $pipes[1] ) . stream_get_contents( $pipes[2] );
			fclose( $pipes[1] ); fclose( $pipes[2] );
			$this->assertSame( 0, proc_close( $process ), $output );
		}
	}

}

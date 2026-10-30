<?php
/**
 * M2 jobs, offline import and local-origin guarantees on the private WordPress database.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

use SW\Slider\Infrastructure\Capabilities;
use SW\Slider\Infrastructure\WpFontJobs;
use SW\Slider\Infrastructure\UploadPaths;
use SW\Slider\Fonts\FontCatalog;
use SW\Slider\Fonts\FontInstaller;
use SW\Slider\Fonts\FontProvider;
use SW\Slider\Fonts\FontFace;
use SW\Slider\Fonts\FontError;
use SW\Slider\Fonts\FontLibrary;
use SW\Slider\Fonts\CatalogUpdater;
use SW\Slider\Fonts\UploadsFontStorage;
use SW\Slider\Fonts\WpFontRepository;

final class FontManagementTest extends WP_UnitTestCase {
	private int $admin;
	private FontInstaller $installer;
	private WpFontJobs $jobs;
	private WpFontRepository $repo;
	private UploadsFontStorage $storage;
	private FontCatalog $catalog;
	private FontProvider $provider;


	public function set_up(): void {
		parent::set_up();
		global $wpdb;
		// These job lifecycles span HTTP/cron requests; exercise WordPress' normal autocommit boundary.
		self::commit_transaction();
		$wpdb->query( 'SET autocommit=1' );
		Capabilities::grant_defaults();
		$this->admin = self::factory()->user->create( array( 'role' => 'administrator' ) );
		wp_set_current_user( $this->admin );
		update_option( \SW\Slider\Plugin::OFFLINE_OPTION, false, false );
		$this->catalog   = new FontCatalog( SWS_DIR . 'fonts/catalog.json' );
		$this->repo      = new WpFontRepository();
		$this->storage   = new UploadsFontStorage();
		$this->provider  = new class( $this->catalog ) implements FontProvider {
			public int $calls               = 0;
			public bool $fail               = false;
			public ?Closure $beforeDownload = null;
			public function __construct( private FontCatalog $catalog ) {
			}
			public function resolve( array $family, array $variants, array $subsets ): array {
				++$this->calls;
				$faces = array();
				foreach ( $variants as $variant ) {
					foreach ( $subsets as $subset ) {
						$faces[] = new FontFace( $subset, $family['family'], $variant['style'], $variant['weight'], 'U+0000-024F,U+20AC', 'https://fonts.gstatic.com/s/test/v1/test.woff2' );
					}
				}
				return $faces;
			}
			public function download_font( string $url ): string {
				++$this->calls;
				if ( null !== $this->beforeDownload ) {
					$callback             = $this->beforeDownload;
					$this->beforeDownload = null;
					$callback();
				}
				if ( $this->fail ) {
					throw new FontError( 'sws_font_network' );
				}
				return (string) file_get_contents( SWS_DIR . 'tests/fixtures/fonts/lato-400-latin.woff2' );
			}
			public function download_license( string $license_path ): string {
				++$this->calls;
				return (string) file_get_contents( SWS_DIR . 'tests/fixtures/fonts/OFL-Lato.txt' );
			}
			public function metadata( string $license_path ): string {
				++$this->calls;
				$family = $this->catalog->find( basename( dirname( $license_path ) ) );
				$text   = 'name: "' . $family['family'] . '"' . "\nlicense: \"" . $family['license'] . "\"\nsubsets: \"latin\"\nfonts { style: \"normal\" weight: 400 }";
				return $text;
			}
		};
		$this->installer = new FontInstaller( $this->catalog, $this->provider, $this->repo, $this->storage, static fn (): string => gmdate( 'Y-m-d H:i:s' ), static fn (): bool => (bool) get_option( \SW\Slider\Plugin::OFFLINE_OPTION ) );
		$this->jobs      = new WpFontJobs( $this->installer, new CatalogUpdater( $this->catalog, $this->installer ), $this->repo, static fn (): bool => (bool) get_option( \SW\Slider\Plugin::OFFLINE_OPTION ) );
		do_action( 'rest_api_init' );
	}
	public function tear_down(): void {
		foreach ( $this->repo->all() as $installation ) {
			$this->storage->remove( $installation['directory'] );
			$this->repo->delete( $installation['id'] );
		}
		foreach ( $this->jobs->all() as $job ) {
			wp_clear_scheduled_hook( WpFontJobs::HOOK, array( $job['id'] ) );
			delete_option( 'sws_font_job_' . $job['id'] );
		}
		$relative = get_option( CatalogUpdater::OPTION );
		if ( is_string( $relative ) && preg_match( '#^fonts/catalog-[a-f0-9]{24}\.json$#D', $relative ) ) {
			wp_delete_file( UploadPaths::path( $relative ) );
		}
		delete_option( CatalogUpdater::OPTION );
		delete_option( \SW\Slider\Plugin::OFFLINE_OPTION );
		wp_delete_user( $this->admin );
		parent::tear_down();
	}
	private function request( string $method, string $path, ?array $body = null ): WP_REST_Response {
		$request = new WP_REST_Request( $method, '/sw-sliderman/v1' . $path );
		if ( null !== $body ) {
			$request->set_header( 'Content-Type', 'application/json' );
			$request->set_body( (string) wp_json_encode( $body ) );
		}
		return rest_get_server()->dispatch( $request );
	}
	private function selection(): array {
		return array(
			'familyId' => 'lato',
			'variants' => array(
				array(
					'weight' => 400,
					'style'  => 'normal',
				),
			),
			'subsets'  => array( 'latin' ),
		);
	}
	private function import(): array {
		$response = $this->request(
			'POST',
			'/fonts/import',
			array(
				'family'      => 'Test Local ' . $this->admin,
				'weight'      => 400,
				'style'       => 'normal',
				'subset'      => 'latin',
				'licenseId'   => 'OFL-1.1',
				'licenseText' => (string) file_get_contents( SWS_DIR . 'tests/fixtures/fonts/OFL-Lato.txt' ),
				'fileBase64'  => base64_encode( (string) file_get_contents( SWS_DIR . 'tests/fixtures/fonts/lato-400-latin.woff2' ) ),
			)
		);
		$this->assertSame( 201, $response->get_status(), wp_json_encode( $response->get_data() ) );
		return $this->repo->find( $response->get_data()['id'] );
	}
	public function test_offline_import_works_but_remote_jobs_are_rejected(): void {
		$this->assertSame( 200, $this->request( 'POST', '/fonts/settings', array( 'offline' => true ) )->get_status() );
		$installation = $this->import();
		$this->assertSame( 409, $this->request( 'POST', '/fonts/jobs', $this->selection() )->get_status() );
		$this->assertSame( 0, $this->provider->calls );
		$items = $this->request( 'GET', '/fonts' )->get_data();
		$item  = array_values( array_filter( $items, static fn ( array $item ): bool => $item['id'] === $installation['id'] ) )[0];
		$this->assertTrue( $item['filesPresent'] );
		$this->assertStringContainsString( 'LICENSE.txt', $item['licenseUrl'] );
	}
	public function test_duplicate_job_is_reused_and_completed_work_is_not_run_twice(): void {
		$first  = $this->jobs->enqueue( 'install', $this->selection(), $this->admin );
		$second = $this->jobs->enqueue( 'install', $this->selection(), $this->admin );
		$this->assertSame( $first['id'], $second['id'] );
		$this->assertSame( 0, $this->provider->calls );
		$done = $this->jobs->run( $first['id'] );
		$this->assertSame( 'completed', $done['state'] );
		$count = $this->provider->calls;
		$this->jobs->run( $first['id'] );
		$this->assertSame( $count, $this->provider->calls );
		$this->assertNotNull( $this->repo->find( $done['result'] ) );
	}
	public function test_cancellation_and_revoked_permissions_prevent_downloads(): void {
		$job = $this->jobs->enqueue( 'install', $this->selection(), $this->admin );
		$this->assertSame( 'cancelled', $this->jobs->cancel( $job['id'] )['state'] );
		$next = $this->jobs->enqueue( 'install', $this->selection(), $this->admin );
		get_userdata( $this->admin )->add_cap( Capabilities::FONTS, false );
		$failed = $this->jobs->run( $next['id'] );
		$this->assertSame( 'failed', $failed['state'] );
		$this->assertSame( 'sws_font_job_forbidden', $failed['errorCode'] );
		$this->assertSame( 0, $this->provider->calls );
	}
	public function test_a_network_failure_keeps_existing_fonts_and_allows_an_explicit_retry(): void {
		$existing             = $this->import();
		$this->provider->fail = true;
		$job                  = $this->jobs->enqueue( 'install', $this->selection(), $this->admin );
		$this->assertSame( 'failed', $this->jobs->run( $job['id'] )['state'] );
		$this->assertTrue( $this->storage->exists( $existing['directory'] ) );
		$this->provider->fail = false;
		$retry                = $this->jobs->enqueue( 'install', $this->selection(), $this->admin );
		$this->assertNotSame( $job['id'], $retry['id'] );
		$this->assertSame( 'completed', $this->jobs->run( $retry['id'] )['state'] );
	}
	public function test_offloaded_urls_are_blocked_and_reported(): void {
		$installation = $this->import();
		$offload      = static function ( array $uploads ): array {
			$uploads['baseurl'] = 'https://cdn.example.invalid/uploads';
			return $uploads;
		};
		add_filter( 'upload_dir', $offload );
		try {
			$this->assertNull( UploadPaths::local_font_url( $installation['stylesheet'] ) );
			$items = $this->request( 'GET', '/fonts' )->get_data();
			$item  = array_values( array_filter( $items, static fn ( array $item ): bool => $item['id'] === $installation['id'] ) )[0];
			$this->assertTrue( $item['originMismatch'] );
			$this->assertNull( $item['stylesheetUrl'] );
		} finally {
			remove_filter( 'upload_dir', $offload );
		}
	}
	public function test_old_lock_owner_cannot_release_or_renew_a_new_lease(): void {
		global $wpdb;
		$old = $this->repo->acquire_lock( 'lease-test', 300 );
		$key = 'sws_lock_' . md5( 'lease-test' );
		$wpdb->update( $wpdb->options, array( 'option_value' => $old . '|1' ), array( 'option_name' => $key ) );
		wp_cache_delete( $key, 'options' );
		$new = $this->repo->acquire_lock( 'lease-test', 300 );
		$this->assertNotSame( $old, $new );
		$this->repo->release_lock( 'lease-test', $old );
		$this->assertTrue( $this->repo->renew_lock( 'lease-test', $new, 300 ) );
		$this->assertFalse( $this->repo->renew_lock( 'lease-test', $old, 300 ) );
		$this->repo->release_lock( 'lease-test', $new );
	}
	public function test_catalog_changes_only_after_a_complete_explicit_job(): void {
		$job = $this->jobs->enqueue( 'catalog', array(), $this->admin );
		$this->assertFalse( get_option( CatalogUpdater::OPTION ) );
		$result = $this->jobs->run( $job['id'] );
		$this->assertSame( 'completed', $result['state'] );
		$relative = get_option( CatalogUpdater::OPTION );
		$this->assertTrue( is_string( $relative ) && is_file( UploadPaths::path( $relative ) ) );
	}
	public function test_switching_offline_during_work_stops_the_next_download_step(): void {
		$selection                      = $this->selection();
		$selection['subsets']           = array( 'latin', 'latin-ext' );
		$job                            = $this->jobs->enqueue( 'install', $selection, $this->admin );
		$this->provider->beforeDownload = static function (): void {
			update_option( \SW\Slider\Plugin::OFFLINE_OPTION, true, false );
		};
		$result                         = $this->jobs->run( $job['id'] );
		$this->assertSame( 'failed', $result['state'] );
		$this->assertSame( 'sws_font_offline', $result['errorCode'] );
		$this->assertSame( 3, $this->provider->calls ); // Resolve, license, first file; no second download.
		$this->assertSame( array(), $this->repo->all() );
	}
	public function test_catalog_failure_preserves_the_previous_pointer(): void {
		update_option( CatalogUpdater::OPTION, 'fonts/catalog-000000000000000000000000.json', false );
		$this->provider->fail = true;
		// Failure injected between metadata requests uses the same bounded checkpoint as cancellation.
		$updater = new CatalogUpdater( $this->catalog, $this->installer );
		$steps   = 0;
		try {
			$updater->refresh(
				static function () use ( &$steps ): void {
					if ( ++$steps === 3 ) {
						throw new FontError( 'sws_font_network' );
					}
				}
			);
			$this->fail( 'Expected catalog interruption.' );
		} catch ( FontError $error ) {
			$this->assertSame( 'sws_font_network', $error->error_code );
		}
		$this->assertSame( 'fonts/catalog-000000000000000000000000.json', get_option( CatalogUpdater::OPTION ) );
	}

	public function test_frontend_emits_only_referenced_variants_and_one_local_preload(): void {
		$installation         = $this->import();
		$document             = json_decode( (string) file_get_contents( SWS_DIR . 'tests/fixtures/documents/valid/basic.json' ), true );
		$document['fontRefs'] = array(
			array(
				'id'             => 'used',
				'installationId' => $installation['id'],
				'weight'         => 400,
				'style'          => 'normal',
			),
			array(
				'id'             => 'unused',
				'installationId' => $installation['id'],
				'weight'         => 700,
				'style'          => 'normal',
			),
		);
		$document['slides'][0]['layers'][0]['style']['fontRef'] = 'used';
		$json      = (string) wp_json_encode( $document );
		$published = new \SW\Slider\Application\PublishedSnapshot( 1, hash( 'sha256', $json ), 1, gmdate( 'Y-m-d H:i:s' ), $json, null, array( $installation['id'] ) );
		$assets    = new \SW\Slider\Rendering\Assets( new \SW\Slider\Infrastructure\WpSliderRepository( $GLOBALS['wpdb'] ), $this->repo, SWS_URL, SWS_DIR, 'test' );
		$assets->use_slider( $published, $document, 'fonts-test' );
		$assets->use_slider( $published, $document, 'fonts-test' );
		$handle = 'sws-font-' . $installation['id'] . '-400-normal';
		$css    = implode( '', wp_styles()->get_data( $handle, 'after' ) );
		$this->assertStringContainsString( 'font-weight:400;', $css );
		$this->assertStringNotContainsString( 'font-weight:700;', $css );
		$this->assertStringContainsString( 'font-display:swap;', $css );
		$this->assertStringNotContainsString( '@import', $css );
		$this->assertCount( 1, $assets->preloads( array() ) );
		$this->assertTrue( UploadPaths::same_origin( $assets->preloads( array() )[0]['href'], home_url() ) );
		$this->assertFalse( wp_style_is( 'sws-font-' . $installation['id'] . '-700-normal', 'registered' ) );
	}
	public function test_rest_jobs_expose_only_public_status_and_support_explicit_retry(): void {
		$response = $this->request( 'POST', '/fonts/jobs', array( 'kind' => 'install' ) + $this->selection() );
		$this->assertSame( 202, $response->get_status() );
		$job = $response->get_data();
		$this->assertArrayNotHasKey( 'owner', $job );
		$this->assertArrayNotHasKey( 'payload', $job );
		$this->assertSame( 'queued', $this->request( 'GET', '/fonts/jobs/' . $job['id'] )->get_data()['state'] );
		$this->assertSame( 'cancelled', $this->request( 'DELETE', '/fonts/jobs/' . $job['id'] )->get_data()['state'] );
		$retry = $this->request( 'POST', '/fonts/jobs/' . $job['id'] . '/retry' );
		$this->assertSame( 202, $retry->get_status() );
		$this->assertNotSame( $job['id'], $retry->get_data()['id'] );
		$this->request( 'DELETE', '/fonts/jobs/' . $retry->get_data()['id'] );
		$this->assertCount( 2, $this->request( 'GET', '/fonts/jobs' )->get_data() );
	}
	public function test_a_second_runner_cannot_execute_a_claimed_job(): void {
		$job   = $this->jobs->enqueue( 'install', $this->selection(), $this->admin );
		$token = $this->repo->acquire_lock( 'job_' . $job['id'], 300 );
		try {
			$this->assertSame( 'queued', $this->jobs->run( $job['id'] )['state'] );
			$this->assertSame( 0, $this->provider->calls );
		} finally {
			$this->repo->release_lock( 'job_' . $job['id'], $token );
		}
		$this->assertSame( 'completed', $this->jobs->run( $job['id'] )['state'] );
	}
	public function test_damaged_reference_data_returns_a_stable_rest_error(): void {
		$library    = new FontLibrary( $this->repo, $this->storage, static fn (): array => array( '{broken' ) );
		$controller = new \SW\Slider\Rest\FontController( $this->catalog, $this->installer, $library, false );
		$error      = $controller->installations();
		$this->assertInstanceOf( WP_Error::class, $error );
		$this->assertSame( 'sws_font_reference_unknown', $error->get_error_code() );
		$this->assertSame( 409, $error->get_error_data()['status'] );
	}
}

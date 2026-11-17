<?php
/** M5 resource takeover and portable snapshots on the private test database only.
 * @package sw-sliderman
 */

declare(strict_types=1);

use SW\Slider\Application\SliderService;
use SW\Slider\Domain\CanonicalJson;
use SW\Slider\Domain\DocumentValidator;
use SW\Slider\Fonts\FontCatalog;
use SW\Slider\Fonts\FontInstaller;
use SW\Slider\Fonts\UploadsFontStorage;
use SW\Slider\Fonts\WpFontRepository;
use SW\Slider\ImportExport\PackageArchive;
use SW\Slider\ImportExport\PackageExporter;
use SW\Slider\ImportExport\PackageImporter;
use SW\Slider\ImportExport\PackageError;
use SW\Slider\ImportExport\PrivateWorkspace;
use SW\Slider\Infrastructure\Capabilities;
use SW\Slider\Infrastructure\WpSliderRepository;
use SW\Slider\Infrastructure\WpSystemPorts;
use SW\Slider\Infrastructure\WpResourceChecker;
use SW\Slider\Infrastructure\UploadsArtifactStore;
use SW\Slider\Rendering\CssArtifactBuilder;

final class PackagesTest extends WP_UnitTestCase {
	private SliderService $sliders;
	private PackageExporter $exporter;
	private PackageImporter $importer;
	private FontInstaller $installer;
	private WpFontRepository $fonts;
	private UploadsFontStorage $storage;
	private PrivateWorkspace $work;
	private string $token;
	private string $dir;
	private array $created = array();

	public function set_up(): void {
		parent::set_up();
		global $wpdb;
		Capabilities::grant_defaults();
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );
		$this->fonts = new WpFontRepository();
		$this->storage = new UploadsFontStorage();
		$validator = new DocumentValidator();
		$this->sliders = new SliderService( new WpSliderRepository( $wpdb ), $validator, new WpResourceChecker( $this->fonts, $this->storage ), new UploadsArtifactStore(), new CssArtifactBuilder(), new WpSystemPorts(), file_get_contents( SWS_DIR . 'schemas/defaults/new-slider.json' ) );
		$provider = new \SW\Slider\Fonts\GoogleFontsProvider( new \SW\Slider\Fonts\WpHttpClient(), new \SW\Slider\Fonts\DownloadPolicy( static fn (): array => array() ), new \SW\Slider\Fonts\FontFaceParser() );
		$this->installer = new FontInstaller( new FontCatalog( SWS_DIR . 'fonts/catalog.json' ), $provider, $this->fonts, $this->storage, static fn (): string => gmdate( 'Y-m-d H:i:s' ), true );
		$this->exporter = new PackageExporter( $this->sliders, $this->fonts, $this->storage, SWS_VERSION );
		$this->importer = new PackageImporter( $this->sliders, $validator, $this->installer, $this->fonts, $this->storage, SWS_VERSION );
		$this->work = new PrivateWorkspace( sys_get_temp_dir() );
		$this->token = $this->work->create();
		$this->dir = $this->work->path( $this->token );
		add_filter( 'pre_http_request', array( $this, 'no_network' ), 1, 3 );
		do_action( 'rest_api_init' );
	}

	public function no_network( $pre, $args, $url ): never {
		throw new RuntimeException( 'Unexpected network request: ' . $url );
	}

	public function tear_down(): void {
		remove_filter( 'pre_http_request', array( $this, 'no_network' ), 1 );
		foreach ( $this->created as $id ) {
			if ( 'attachment' === get_post_type( $id ) ) {
				wp_delete_attachment( $id, true );
			} else {
				$this->sliders->trash( $id );
				$this->sliders->delete_permanently( $id );
			}
		}
		foreach ( $this->fonts->all() as $font ) {
			$this->storage->remove( $font['directory'] );
			$this->fonts->delete( $font['id'] );
		}
		$this->work->remove( $this->token );
		force_ssl_admin( false );
		parent::tear_down();
	}

	private function import( string $path, array $media = array(), array $fonts = array() ): int {
		$archive = new PackageArchive( $path );
		try {
			$id = $this->importer->commit( $archive, $this->dir . '/resource.bin', $media, $fonts );
			$this->created[] = $id;
			$document = CanonicalJson::decode_tree( $this->sliders->get( $id )->document_json );
			$this->created = array_values( array_unique( array_merge( $this->created, \SW\Slider\ImportExport\DocumentResources::media_ids( $document ) ) ) );
			return $id;
		} finally {
			$archive->close();
		}
	}

	private function font(): array {
		return $this->installer->import_file( array( 'family' => 'Lato', 'weight' => 400, 'style' => 'normal', 'subset' => 'latin', 'licenseId' => 'OFL-1.1', 'licenseText' => file_get_contents( SWS_DIR . 'tests/fixtures/fonts/OFL-Lato.txt' ) ), file_get_contents( SWS_DIR . 'tests/fixtures/fonts/lato-400-latin.woff2' ) );
	}

	private function with_font(): int {
		$id = $this->import( SWS_DIR . 'templates/image-slider.zip' );
		$font = $this->font();
		$stored = $this->sliders->get( $id );
		$doc = CanonicalJson::decode_tree( $stored->document_json );
		$doc->fontRefs[] = (object) array( 'id' => 'local-font', 'installationId' => $font['id'], 'weight' => 400, 'style' => 'normal' );
		$doc->slides[0]->layers[0]->style->fontRef = 'local-font';
		$this->sliders->save_draft( $id, 'Portable font and image', $doc, $stored->version );
		return $id;
	}

	public function test_full_roundtrip_remaps_ids_preserves_live_and_reuses_verified_assets(): void {
		$template_hash = hash_file( 'sha256', SWS_DIR . 'templates/image-slider.zip' );
		$id = $this->with_font();
		$this->sliders->publish( $id, $this->sliders->get( $id )->version );
		$before = $this->sliders->get( $id );
		$this->exporter->write( $id, true, $this->dir . '/package.zip' );
		$copy_id = $this->import( $this->dir . '/package.zip' );
		$copy = $this->sliders->get( $copy_id );
		self::assertNull( $copy->published );
		$source_doc = CanonicalJson::decode_tree( $before->document_json );
		$copy_doc = CanonicalJson::decode_tree( $copy->document_json );
		self::assertNotSame( $source_doc->id, $copy_doc->id );
		self::assertNotSame( $source_doc->slides[0]->id, $copy_doc->slides[0]->id );
		self::assertNotSame( $source_doc->slides[0]->layers[0]->id, $copy_doc->slides[0]->layers[0]->id );
		self::assertNotSame( $source_doc->fontRefs[0]->id, $copy_doc->fontRefs[0]->id );
		self::assertSame( $copy_doc->fontRefs[0]->id, $copy_doc->slides[0]->layers[0]->style->fontRef );
		self::assertSame( $source_doc->fontRefs[0]->installationId, $copy_doc->fontRefs[0]->installationId );
		self::assertSame( $source_doc->slides[0]->background->attachmentId, $copy_doc->slides[0]->background->attachmentId );
		self::assertSame( $before->document_json, $this->sliders->get( $id )->document_json );
		self::assertEquals( $before->published, $this->sliders->get( $id )->published );
		$this->sliders->publish( $copy_id, $copy->version );
		self::assertNotNull( $this->sliders->get( $copy_id )->published );
		self::assertSame( $template_hash, hash_file( 'sha256', SWS_DIR . 'templates/image-slider.zip' ), 'Editing and exporting an instance leaves its original template immutable.' );
	}

	public function test_incomplete_package_requires_explicit_local_mapping(): void {
		$id = $this->with_font();
		$doc = CanonicalJson::decode_tree( $this->sliders->get( $id )->document_json );
		$this->exporter->write( $id, false, $this->dir . '/package.zip' );
		$archive = new PackageArchive( $this->dir . '/package.zip' );
		try {
			$checked = $this->importer->inspect( $archive );
			self::assertFalse( $checked['manifest']['complete'] );
			try {
				$this->importer->commit( $archive, $this->dir . '/resource.bin', array(), array() );
				self::fail( 'Missing mapping accepted.' );
			} catch ( PackageError $error ) {
				self::assertSame( 'mapping', $error->error_code );
			}
		} finally {
			$archive->close();
		}
		$image = $doc->slides[0]->background->attachmentId;
		$font_id = $doc->fontRefs[0]->installationId;
		$copy = $this->import( $this->dir . '/package.zip', array( $image => $image ), array( $font_id => $font_id ) );
		self::assertNull( $this->sliders->get( $copy )->published );
	}

	public function test_templates_create_independent_drafts_and_rest_permissions(): void {
		$list = rest_do_request( '/sw-sliderman/v1/templates' );
		self::assertCount( 3, $list->get_data() );
		foreach ( array( 'image-slider', 'text-hero', 'event' ) as $template ) {
			$request = new WP_REST_Request( 'POST', '/sw-sliderman/v1/templates/' . $template );
			$response = rest_do_request( $request );
			self::assertSame( 201, $response->get_status(), wp_json_encode( $response->get_data() ) );
			$id = $response->get_data()['id'];
			$this->created[] = $id;
			$doc = CanonicalJson::decode_tree( $this->sliders->get( $id )->document_json );
			$this->created = array_values( array_unique( array_merge( $this->created, \SW\Slider\ImportExport\DocumentResources::media_ids( $doc ) ) ) );
			$stored = $this->sliders->get( $id );
			self::assertNull( $stored->published );
			$this->sliders->publish( $id, $stored->version );
		}
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );
		self::assertSame( 403, rest_do_request( new WP_REST_Request( 'POST', '/sw-sliderman/v1/packages/preview' ) )->get_status() );
		self::assertSame( 403, rest_do_request( '/sw-sliderman/v1/templates' )->get_status() );
	}

	public function test_export_download_is_private_and_invalid_upload_does_not_create_session(): void {
		$id = $this->import( SWS_DIR . 'templates/text-hero.zip' );
		$request = new WP_REST_Request( 'POST', '/sw-sliderman/v1/packages/export' );
		$request->set_header( 'Content-Type', 'application/json' );
		$request->set_body( wp_json_encode( array( 'id' => $id, 'includeFiles' => true ) ) );
		$response = rest_do_request( $request );
		self::assertSame( 200, $response->get_status(), wp_json_encode( $response->get_data() ) );
		self::assertSame( 'private, no-store', $response->get_headers()['Cache-Control'] );
		parse_str( parse_url( $response->get_data()['url'], PHP_URL_QUERY ), $query );
		self::assertSame( 'sws_package_download', $query['action'] );
		$this->work->remove( $query['token'] );
		delete_option( 'sws_package_' . $query['token'] );
		self::assertSame( 422, rest_do_request( new WP_REST_Request( 'POST', '/sw-sliderman/v1/packages/preview' ) )->get_status() );
	}

	public function test_private_workspace_rejects_webroot_symlink_and_foreign_tokens(): void {
		try {
			new PrivateWorkspace( ABSPATH );
			self::fail( 'Web root accepted.' );
		} catch ( PackageError $error ) {
			self::assertSame( 'staging', $error->error_code );
		}
		$this->expectException( PackageError::class );
		$this->work->path( '../foreign' );
	}

	private function json_request( string $route, array $body ): WP_REST_Response {
		$request = new WP_REST_Request( 'POST', '/sw-sliderman/v1' . $route );
		$request->set_header( 'Content-Type', 'application/json' );
		$request->set_body( wp_json_encode( $body ) );
		return rest_do_request( $request );
	}

	public function test_confirmation_is_user_bound_repeatable_and_cancel_cleans_only_staging(): void {
		copy( SWS_DIR . 'templates/text-hero.zip', $this->dir . '/package.zip' );
		add_option( 'sws_package_' . $this->token, array( 'user' => get_current_user_id(), 'mode' => 'import', 'expires' => time() + 3600, 'result' => null ), '', false );
		$queued = $this->json_request( '/packages/commit', array( 'token' => $this->token ) );
		self::assertSame( 'queued', $queued->get_data()['state'] );
		$response = $this->json_request( '/packages/run', array( 'token' => $this->token ) );
		self::assertSame( 200, $response->get_status(), wp_json_encode( $response->get_data() ) );
		$id = $response->get_data()['id'];
		$this->created[] = $id;
		self::assertNull( $this->sliders->get( $id )->published );
		self::assertDirectoryDoesNotExist( $this->dir );
		$again = $this->json_request( '/packages/commit', array( 'token' => $this->token ) );
		self::assertSame( $id, $again->get_data()['id'] );
		$owner = get_current_user_id();
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );
		self::assertSame( 422, $this->json_request( '/packages/commit', array( 'token' => $this->token ) )->get_status() );
		wp_set_current_user( $owner );
		self::assertSame( $id, $this->json_request( '/packages/cancel', array( 'token' => $this->token ) )->get_data()['id'] );
		delete_option( 'sws_package_' . $this->token );
		\SW\Slider\Infrastructure\WpPackageJobs::discard_cancel( $this->token );
		self::assertNotNull( $this->sliders->get( $id ) );
	}

	public function test_failed_draft_creation_removes_only_new_resources(): void {
		$id = $this->with_font();
		$this->exporter->write( $id, true, $this->dir . '/package.zip' );
		$document = CanonicalJson::decode_tree( $this->sliders->get( $id )->document_json );
		$image = $document->slides[0]->background->attachmentId;
		$font = $this->fonts->find( $document->fontRefs[0]->installationId );
		// Remove only these test resources to force a fresh takeover on the destination.
		wp_delete_attachment( $image, true );
		$this->fonts->delete( $font['id'] );
		$this->storage->remove( $font['directory'] );
		$before = get_posts( array( 'post_type' => 'attachment', 'post_status' => 'inherit', 'fields' => 'ids', 'numberposts' => -1 ) );
		$reject = static fn ( bool $empty, array $data ): bool => $empty || 'sw_slider' === ( $data['post_type'] ?? '' );
		add_filter( 'wp_insert_post_empty_content', $reject, 99, 2 );
		$archive = new PackageArchive( $this->dir . '/package.zip' );
		try {
			$this->importer->commit( $archive, $this->dir . '/resource.bin', array(), array() );
			self::fail( 'Creation should have failed.' );
		} catch ( \SW\Slider\Application\StorageFailure $error ) {
			self::assertNotSame( '', $error->getMessage() );
		} finally {
			remove_filter( 'wp_insert_post_empty_content', $reject, 99 );
			$archive->close();
		}
		self::assertSame( $before, get_posts( array( 'post_type' => 'attachment', 'post_status' => 'inherit', 'fields' => 'ids', 'numberposts' => -1 ) ) );
		self::assertNull( $this->fonts->find( $font['id'] ) );
		self::assertFalse( $this->storage->exists( $font['directory'] ) );
		self::assertNotNull( $this->sliders->get( $id ) );
		$this->created = array_values( array_diff( $this->created, array( $image ) ) );
	}

	public function test_corrupt_duplicate_is_not_reused_and_existing_assets_survive_failure(): void {
		$id = $this->with_font();
		$this->exporter->write( $id, true, $this->dir . '/package.zip' );
		$document = CanonicalJson::decode_tree( $this->sliders->get( $id )->document_json );
		$image = $document->slides[0]->background->attachmentId;
		file_put_contents( get_attached_file( $image ), 'corrupt existing media' );
		$check = new PackageArchive( $this->dir . '/package.zip' );
		try {
			$manifest = $check->verify( SWS_VERSION );
			self::assertNotEmpty( $this->importer->conflicts( $manifest ) );
			$manifest['fonts'][0]['variants'][0]['weight'] = 600;
			self::assertContains( 'Lato', $this->importer->conflicts( $manifest ) );
		} finally {
			$check->close();
		}
		$copy = $this->import( $this->dir . '/package.zip' );
		$copied = CanonicalJson::decode_tree( $this->sliders->get( $copy )->document_json );
		self::assertNotSame( $image, $copied->slides[0]->background->attachmentId );
		self::assertSame( 'corrupt existing media', file_get_contents( get_attached_file( $image ) ) );
	}

	public function test_cancelled_queue_and_revoked_owner_do_not_create_sliders(): void {
		copy( SWS_DIR . 'templates/text-hero.zip', $this->dir . '/package.zip' );
		$owner = get_current_user_id();
		add_option( 'sws_package_' . $this->token, array( 'user' => $owner, 'mode' => 'import', 'expires' => time() + 3600, 'result' => null ), '', false );
		$jobs = new \SW\Slider\Infrastructure\WpPackageJobs( $this->importer, fn (): PrivateWorkspace => $this->work );
		self::assertSame( 'queued', $jobs->enqueue( $this->token, array(), array() )['state'] );
		$jobs->cancel( $this->token );
		$jobs->run( $this->token );
		self::assertSame( 'cancelled', $jobs->status( $this->token )['state'] );
		self::assertNull( $jobs->status( $this->token )['id'] );
		self::assertDirectoryDoesNotExist( $this->dir );
		\SW\Slider\Infrastructure\WpPackageJobs::discard_cancel( $this->token );
		delete_option( 'sws_package_' . $this->token );
	}

	public function test_rest_cancellation_signals_a_running_worker_without_removing_its_files(): void {
		copy( SWS_DIR . 'templates/text-hero.zip', $this->dir . '/package.zip' );
		add_option( 'sws_package_' . $this->token, array( 'user' => get_current_user_id(), 'mode' => 'import', 'state' => 'running', 'expires' => time() + 3600, 'result' => null ), '', false );
		$response = $this->json_request( '/packages/cancel', array( 'token' => $this->token ) );
		self::assertSame( 200, $response->get_status() );
		self::assertSame( 'cancelling', $response->get_data()['state'] );
		self::assertFileExists( $this->dir . '/package.zip' );
		self::assertTrue( get_option( '_sws_package_cancel_' . $this->token ) );
		\SW\Slider\Infrastructure\WpPackageJobs::discard_cancel( $this->token );
		delete_option( 'sws_package_' . $this->token );
	}

	public function test_worker_rechecks_permissions_and_does_not_replay_unknown_outcome(): void {
		copy( SWS_DIR . 'templates/text-hero.zip', $this->dir . '/package.zip' );
		$owner = get_current_user_id();
		$state = array( 'user' => $owner, 'mode' => 'import', 'expires' => time() + 3600, 'result' => null );
		add_option( 'sws_package_' . $this->token, $state, '', false );
		$jobs = new \SW\Slider\Infrastructure\WpPackageJobs( $this->importer, fn (): PrivateWorkspace => $this->work );
		$jobs->enqueue( $this->token, array(), array() );
		$user = new WP_User( $owner );
		$user->remove_cap( Capabilities::IMPORT );
		$user->add_cap( Capabilities::IMPORT, false );
		wp_set_current_user( 0 );
		$jobs->run( $this->token );
		self::assertSame( 0, get_current_user_id(), 'Cron restores its original user.' );
		wp_set_current_user( $owner );
		self::assertSame( 'permission', $jobs->status( $this->token )['error'] );
		$user->add_cap( Capabilities::IMPORT, true );
		$state['state'] = 'running';
		update_option( 'sws_package_' . $this->token, $state, false );
		$jobs->run( $this->token );
		self::assertSame( 'unknown', $jobs->status( $this->token )['state'] );
		self::assertSame( 'unknown', $jobs->enqueue( $this->token, array(), array() )['state'] );
		\SW\Slider\Infrastructure\WpPackageJobs::discard_cancel( $this->token );
		delete_option( 'sws_package_' . $this->token );
	}

	public function test_cancel_after_asset_takeover_rolls_back_and_reports_real_progress(): void {
		$id = $this->with_font();
		$this->exporter->write( $id, true, $this->dir . '/package.zip' );
		$doc = CanonicalJson::decode_tree( $this->sliders->get( $id )->document_json );
		$image = $doc->slides[0]->background->attachmentId;
		$original_path = get_attached_file( $image );
		$archive = new PackageArchive( $this->dir . '/package.zip' );
		$progress = array();
		try {
			$this->importer->commit( $archive, $this->dir . '/resource.bin', array(), array(), static function ( int $done, int $total ) use ( &$progress ): void {
				$progress[] = array( $done, $total );
				if ( 1 === $done ) {
					throw new PackageError( 'cancelled' );
				}
			} );
			self::fail( 'Cancellation ignored.' );
		} catch ( PackageError $error ) {
			self::assertSame( 'cancelled', $error->error_code );
		} finally {
			$archive->close();
		}
		self::assertSame( array( 0, 3 ), $progress[0] );
		self::assertSame( array( 1, 3 ), $progress[count( $progress ) - 1] );
		self::assertFileExists( $original_path );
		self::assertSame( $original_path, get_attached_file( $image ) );
	}

	/** Run in two separate PHPUnit installations/DBs with SWS_M5_ROUNDTRIP=source|target. */
	public function test_cross_installation_roundtrip(): void {
		$mode = getenv( 'SWS_M5_ROUNDTRIP' );
		if ( ! in_array( $mode, array( 'source', 'target' ), true ) ) {
			$this->markTestSkipped( 'Explicit two-installation runner only.' );
		}
		$path = getenv( 'SWS_M5_PACKAGE' );
		self::assertNotFalse( $path );
		update_option( 'home', 'http://' . $mode . '.example.test' );
		update_option( 'siteurl', 'http://' . $mode . '.example.test' );
		update_option( 'upload_path', $this->dir . '-uploads-' . $mode );
		update_option( 'upload_url_path', 'http://' . $mode . '.example.test/local-assets' );
		wp_upload_dir( null, false, true );
		if ( 'source' === $mode ) {
			$id = $this->with_font();
			$this->exporter->write( $id, true, $path );
			self::assertFileExists( $path );
			return;
		}
		$id = $this->import( $path );
		$slider = $this->sliders->get( $id );
		$document = CanonicalJson::decode_tree( $slider->document_json );
		$image = $document->slides[0]->background->attachmentId;
		$url = wp_get_attachment_url( $image );
		self::assertStringStartsWith( 'http://target.example.test/local-assets/', $url );
		self::assertFileExists( get_attached_file( $image ) );
		self::assertStringNotContainsString( 'source.example', $slider->document_json );
		$this->sliders->publish( $id, $slider->version );
		$html = do_shortcode( '[sw_slider id="' . $id . '"]' );
		self::assertStringContainsString( 'target.example.test/local-assets/', $html );
		self::assertStringNotContainsString( 'source.example', $html );
		$font = $this->fonts->find( $document->fontRefs[0]->installationId );
		self::assertTrue( \SW\Slider\Fonts\FontIntegrity::complete( $this->storage, $font ) );
		self::assertStringStartsWith( 'http://target.example.test/local-assets/', \SW\Slider\Infrastructure\UploadPaths::local_font_url( $font['stylesheet'] ) );
	}
}

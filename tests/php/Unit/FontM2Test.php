<?php
/**
 * M2 import, lifecycle and bounded failure checks without external networking.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Tests\Unit;

use PHPUnit\Framework\TestCase;
use SW\Slider\Fonts\FontCatalog;
use SW\Slider\Fonts\FontError;
use SW\Slider\Fonts\FontInstaller;
use SW\Slider\Fonts\FontLibrary;
use SW\Slider\Fonts\FontIntegrity;
use SW\Slider\Fonts\FontFaceParser;
use SW\Slider\Fonts\DownloadPolicy;
use SW\Slider\Fonts\GoogleFontsProvider;
use SW\Slider\Fonts\Woff2;
use SW\Slider\Tests\Support\FakeHttp;
use SW\Slider\Tests\Support\MemoryFontRepository;
use SW\Slider\Tests\Support\MemoryFontStorage;
use SW\Slider\Domain\CanonicalJson;

final class FontM2Test extends TestCase {
	private MemoryFontRepository $repo;
	private MemoryFontStorage $storage;
	private FakeHttp $http;
	private FontInstaller $installer;

	protected function setUp(): void {
		$this->repo      = new MemoryFontRepository();
		$this->storage   = new MemoryFontStorage();
		$this->http      = new FakeHttp();
		$provider        = new GoogleFontsProvider( $this->http, new DownloadPolicy( static fn ( string $host ): array => array( '8.8.8.8' ) ), new FontFaceParser() );
		$this->installer = new FontInstaller( new FontCatalog( dirname( __DIR__, 3 ) . '/fonts/catalog.json' ), $provider, $this->repo, $this->storage, static fn (): string => '2026-10-30 12:00:00', true );
	}
	private function selection(): array {
		return array(
			'family'      => 'Local Test',
			'weight'      => 400,
			'style'       => 'normal',
			'subset'      => 'latin',
			'licenseId'   => 'OFL-1.1',
			'licenseText' => 'Copyright test. This Font Software is licensed under the SIL OPEN FONT LICENSE.',
		);
	}
	private function bytes(): string {
		return (string) file_get_contents( dirname( __DIR__, 2 ) . '/fixtures/fonts/lato-400-latin.woff2' );
	}

	public function test_real_static_font_import_works_offline_and_is_idempotent(): void {
		$first  = $this->installer->import_file( $this->selection(), $this->bytes() );
		$second = $this->installer->import_file( $this->selection(), $this->bytes() );
		self::assertSame( $first['id'], $second['id'] );
		self::assertSame( array(), $this->http->requested );
		self::assertSame( array(), $this->storage->temp );
		self::assertCount( 1, $this->repo->all() );
		self::assertTrue( FontIntegrity::complete( $this->storage, $first ) );
	}
	public function test_reimport_repairs_missing_bytes_without_changing_pinned_identity(): void {
		$first = $this->installer->import_file( $this->selection(), $this->bytes() );
		$file  = $first['variants'][0]['files'][0]['file'];
		unset( $this->storage->active[ $first['directory'] ][ $file ] );
		self::assertFalse( FontIntegrity::complete( $this->storage, $first ) );
		$second = $this->installer->import_file( $this->selection(), $this->bytes() );
		self::assertSame( $first['id'], $second['id'] );
		self::assertTrue( FontIntegrity::complete( $this->storage, $second ) );
		self::assertSame( array(), $this->storage->temp );
	}
	public function test_invalid_binary_and_missing_license_do_not_activate_anything(): void {
		foreach ( array( array( $this->selection(), '<html>error</html>' ), array( array_merge( $this->selection(), array( 'licenseText' => '' ) ), $this->bytes() ), array( array_merge( $this->selection(), array( 'weight' => 450 ) ), $this->bytes() ) ) as $case ) {
			try {
				$this->installer->import_file( $case[0], $case[1] );
				self::fail( 'Expected a rejection.' );
			} catch ( FontError ) {
				self::assertSame( array(), $this->repo->all() );
			}
		}
		self::assertSame( array(), $this->storage->active );
		self::assertSame( array(), $this->storage->temp );
	}
	public function test_static_parser_rejects_variable_and_truncated_table_directories(): void {
		$bytes = FakeHttp::woff2( 'test' );
		self::assertTrue( Woff2::is_static( $bytes ) );
		$bytes[48] = chr( 47 ); // W3C known fvar table tag.
		self::assertFalse( Woff2::is_static( $bytes ) );
		self::assertFalse( Woff2::is_static( substr( $this->bytes(), 0, 48 ) ) );
	}
	public function test_every_reference_source_protects_an_installation(): void {
		$installation = $this->installer->import_file( $this->selection(), $this->bytes() );
		foreach ( array( 'draft', 'snapshot', 'revision', 'autosave', 'template' ) as $source ) {
			$json    = CanonicalJson::encode(
				array(
					'schemaVersion' => 1,
					'fontRefs'      => array( array( 'installationId' => $installation['id'] ) ),
				)
			);
			$library = new FontLibrary( $this->repo, $this->storage, static fn (): array => array( $source => $json ) );
			try {
				$library->uninstall( $installation['id'] );
				self::fail( 'A referenced font was removed.' );
			} catch ( FontError $error ) {
				self::assertSame( 'sws_font_in_use', $error->error_code );
			}
		}
		$library = new FontLibrary( $this->repo, $this->storage, static fn (): array => array() );
		$library->uninstall( $installation['id'] );
		self::assertSame( array(), $this->storage->active );
	}
	public function test_unknown_documents_make_deletion_fail_closed(): void {
		$installation = $this->installer->import_file( $this->selection(), $this->bytes() );
		$library      = new FontLibrary( $this->repo, $this->storage, static fn (): array => array( '{broken' ) );
		$this->expectException( FontError::class );
		$library->uninstall( $installation['id'] );
	}
}

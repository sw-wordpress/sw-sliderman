<?php
/** Font package metadata, local install and ownership tracking.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Tests\Unit;

use PHPUnit\Framework\TestCase;
use SW\Slider\Fonts\FontInstaller;
use SW\Slider\Fonts\FontCatalog;
use SW\Slider\Fonts\FontError;
use SW\Slider\Fonts\GoogleFontsProvider;
use SW\Slider\Fonts\FontFaceParser;
use SW\Slider\Fonts\DownloadPolicy;
use SW\Slider\ImportExport\PackageFonts;
use SW\Slider\ImportExport\PackageError;
use SW\Slider\Tests\Support\FakeHttp;
use SW\Slider\Tests\Support\Fixtures;
use SW\Slider\Tests\Support\MemoryFontRepository;
use SW\Slider\Tests\Support\MemoryFontStorage;

final class PackageFontsTest extends TestCase {
	private MemoryFontRepository $repository;
	private MemoryFontStorage $storage;
	private FontInstaller $installer;
	private array $font;

	protected function setUp(): void {
		$this->repository = new MemoryFontRepository();
		$this->storage    = new MemoryFontStorage();
		$this->installer  = new FontInstaller( new FontCatalog( dirname( __DIR__, 3 ) . '/fonts/catalog.json' ), new GoogleFontsProvider( new FakeHttp(), new DownloadPolicy( static fn (): array => array() ), new FontFaceParser() ), $this->repository, $this->storage, static fn (): string => '2026-11-17 00:00:00', true );
		$this->font       = $this->installer->import_file(
			array(
				'family'      => 'Lato',
				'weight'      => 400,
				'style'       => 'normal',
				'subset'      => 'latin',
				'licenseId'   => 'OFL-1.1',
				'licenseText' => Fixtures::read( 'fonts/OFL-Lato.txt' ),
			),
			Fixtures::read( 'fonts/lato-400-latin.woff2' )
		);
	}

	private function read( string $file, int $limit ): string {
		return 'LICENSE.txt' === $file ? Fixtures::read( 'fonts/OFL-Lato.txt' ) : Fixtures::read( 'fonts/lato-400-latin.woff2' );
	}

	public function test_roundtrip_reuses_existing_installation_without_ownership(): void {
		$font   = PackageFonts::parse( $this->font );
		$result = $this->installer->import_package( $font, $this->read( ... ) );
		self::assertSame( $this->font, $result['installation'] );
		self::assertFalse( $result['ownedRegistry'] );
		self::assertFalse( $result['ownedDirectory'] );
	}

	public function test_new_installation_tracks_only_own_files_and_regenerates_css(): void {
		$font = PackageFonts::parse( $this->font );
		$this->repository->delete( $this->font['id'] );
		$this->storage->remove( $this->font['directory'] );
		$result = $this->installer->import_package( $font, $this->read( ... ) );
		self::assertTrue( $result['ownedRegistry'] );
		self::assertTrue( $result['ownedDirectory'] );
		self::assertSame( $this->font['id'], $result['installation']['id'] );
		self::assertSame( $this->font['source'], $result['installation']['source'] );
		self::assertTrue( \SW\Slider\Fonts\FontIntegrity::complete( $this->storage, $result['installation'] ) );
	}

	public function test_existing_unregistered_directory_is_never_claimed_as_owned(): void {
		$this->repository->delete( $this->font['id'] );
		$result = $this->installer->import_package( PackageFonts::parse( $this->font ), $this->read( ... ) );
		self::assertTrue( $result['ownedRegistry'] );
		self::assertFalse( $result['ownedDirectory'] );
	}

	public function test_parallel_family_install_is_rejected(): void {
		$this->repository->acquire_lock( 'install_' . $this->font['familyId'], 300 );
		$this->expectException( FontError::class );
		$this->installer->import_package( PackageFonts::parse( $this->font ), $this->read( ... ) );
	}

	public function test_invalid_license_and_binary_leave_existing_files_intact(): void {
		foreach ( array( 'font', 'license' ) as $kind ) {
			try {
				$this->installer->import_package( PackageFonts::parse( $this->font ), fn ( string $file ): string => ( 'font' === $kind || 'LICENSE.txt' === $file ) ? 'invalid' : $this->read( $file, 2097152 ) );
				self::fail( $kind );
			} catch ( FontError $error ) {
				self::assertContains( $error->error_code, array( 'sws_font_invalid_file', 'sws_font_license_missing' ) );
			}
			self::assertTrue( \SW\Slider\Fonts\FontIntegrity::complete( $this->storage, $this->font ) );
		}
	}

	public function test_css_injection_bad_variants_and_paths_are_rejected(): void {
		$cases = array();
		foreach ( array(
			'id'       => '../font',
			'familyId' => "bad');}",
			'family'   => "bad';}",
			'category' => 'url(x)',
			'variants' => array(),
			'license'  => array(),
			'source'   => array(),
		) as $key => $value ) {
			$font         = $this->font;
			$font[ $key ] = $value;
			$cases[]      = $font;
		}
		foreach ( array(
			'weight' => 450,
			'style'  => 'oblique',
			'files'  => array(),
		) as $key => $value ) {
			$font                        = $this->font;
			$font['variants'][0][ $key ] = $value;
			$cases[]                     = $font;
		}
		foreach ( array(
			'unicodeRange' => 'U+00FF;src:url(x)',
			'file'         => '../font.woff2',
			'sha256'       => 'bad',
			'subset'       => 'bad/*',
			'sizeBytes'    => 99999999,
		) as $key => $value ) {
			$font                                    = $this->font;
			$font['variants'][0]['files'][0][ $key ] = $value;
			$cases[]                                 = $font;
		}
		$font               = $this->font;
		$font['variants'][] = $font['variants'][0];
		$cases[]            = $font;
		foreach ( $cases as $font ) {
			try {
				PackageFonts::parse( $font );
				self::fail( 'Unsafe font descriptor accepted.' );
			} catch ( PackageError $error ) {
				self::assertSame( 'font', $error->error_code );
			}
		}
	}
}

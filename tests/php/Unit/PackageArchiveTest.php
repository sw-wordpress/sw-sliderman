<?php
/** Package contract and adversarial ZIP fixtures.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Tests\Unit;

use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\DataProvider;
use SW\Slider\ImportExport\PackageManifest;
use SW\Slider\ImportExport\PackageArchive;
use SW\Slider\ImportExport\PackageError;
use SW\Slider\ImportExport\DocumentResources;
use SW\Slider\Tests\Support\Fixtures;
use ZipArchive;

final class PackageArchiveTest extends TestCase {
	private string $path;

	protected function setUp(): void {
		$this->path = tempnam( sys_get_temp_dir(), 'sws-archive-test-' );
	}

	protected function tearDown(): void {
		if ( is_file( $this->path ) ) {
			unlink( $this->path );
		}
	}

	public function test_manifest_contract_fixture(): void {
		$manifest = PackageManifest::parse( Fixtures::read( 'packages/manifest.json' ), '0.7.0' );
		self::assertTrue( $manifest['complete'] );
		self::assertSame( 'slider.json', $manifest['files'][0]['path'] );
	}

	/** @return iterable<string,array{string}> */
	public static function unsafe_names(): iterable {
		foreach ( array( '../slider.json', '/slider.json', 'C:/slider.json', 'media\\file.png', 'media/../slider.json', "media/x\0.png", 'script.php', 'script.js', 'media/image.svg', './slider.json', 'SLIDER.json', 'fonts/family/font.css' ) as $name ) {
			yield bin2hex( $name ) => array( $name );
		}
	}

	#[DataProvider( 'unsafe_names' )]
	public function test_unsafe_paths_and_executables_rejected( string $name ): void {
		$zip = new ZipArchive();
		$zip->open( $this->path, ZipArchive::OVERWRITE );
		$zip->addFromString( $name, '{}' );
		$zip->close();
		$this->expectException( PackageError::class );
		new PackageArchive( $this->path );
	}

	public function test_symlink_and_special_files_rejected(): void {
		foreach ( array( 0120777, 0020600, 0040755 ) as $mode ) {
			$zip = new ZipArchive();
			$zip->open( $this->path, ZipArchive::OVERWRITE );
			$zip->addFromString( 'slider.json', '/etc/passwd' );
			$zip->setExternalAttributesName( 'slider.json', ZipArchive::OPSYS_UNIX, $mode << 16 );
			$zip->close();
			try {
				new PackageArchive( $this->path );
				self::fail( 'Special file accepted.' );
			} catch ( PackageError $error ) {
				self::assertSame( 'path', $error->error_code );
			}
		}
	}

	public function test_zip_bomb_rejected_before_reading(): void {
		$zip = new ZipArchive();
		$zip->open( $this->path, ZipArchive::OVERWRITE );
		$zip->addFromString( 'slider.json', str_repeat( 'a', 2000000 ) );
		$zip->setCompressionName( 'slider.json', ZipArchive::CM_DEFLATE, 9 );
		$zip->close();
		$this->expectException( PackageError::class );
		new PackageArchive( $this->path );
	}

	public function test_entry_count_and_compressed_size_limits(): void {
		$zip = new ZipArchive();
		$zip->open( $this->path, ZipArchive::OVERWRITE );
		for ( $index = 0; $index < 501; ++$index ) {
			$zip->addFromString( 'media/' . hash( 'sha256', (string) $index ) . '.png', '{}' );
		}
		$zip->close();
		try {
			new PackageArchive( $this->path );
			self::fail( 'Entry limit ignored.' );
		} catch ( PackageError $error ) {
			self::assertSame( 'limit', $error->error_code );
		}
		$stream = fopen( $this->path, 'wb' );
		ftruncate( $stream, 26214401 );
		fclose( $stream );
		clearstatcache( true, $this->path );
		$this->expectException( PackageError::class );
		$this->expectExceptionMessage( 'limit' );
		new PackageArchive( $this->path );
	}

	public function test_case_collisions_and_encrypted_entries_rejected(): void {
		$zip = new ZipArchive();
		$zip->open( $this->path, ZipArchive::OVERWRITE );
		$zip->addFromString( 'fonts/Case/LICENSE.txt', 'license text' );
		$zip->addFromString( 'fonts/case/LICENSE.txt', 'license text' );
		$zip->close();
		try {
			new PackageArchive( $this->path );
			self::fail( 'Case collision ignored.' );
		} catch ( PackageError $error ) {
			self::assertSame( 'path', $error->error_code );
		}
		$zip->open( $this->path, ZipArchive::OVERWRITE );
		$zip->addFromString( 'slider.json', '{}' );
		$zip->setEncryptionName( 'slider.json', ZipArchive::EM_AES_256, 'test-only' );
		$zip->close();
		$this->expectException( PackageError::class );
		new PackageArchive( $this->path );
	}

	public function test_missing_corrupt_and_tampered_archives(): void {
		foreach ( array( '', 'not zip' ) as $data ) {
			file_put_contents( $this->path, $data );
			try {
				new PackageArchive( $this->path );
				self::fail( 'Corrupt archive accepted.' );
			} catch ( PackageError $error ) {
				self::assertSame( 'archive', $error->error_code );
			}
		}
		$zip = new ZipArchive();
		$zip->open( $this->path, ZipArchive::OVERWRITE );
		$zip->addFromString( 'manifest.json', Fixtures::read( 'packages/manifest.json' ) );
		$zip->addFromString( 'slider.json', '[]' );
		$zip->close();
		$archive = new PackageArchive( $this->path );
		try {
			$this->expectException( PackageError::class );
			$this->expectExceptionMessage( 'hash' );
			$archive->verify( '0.7.0' );
		} finally {
			$archive->close();
		}
	}

	public function test_required_new_versions_and_malformed_manifests_rejected(): void {
		$base  = json_decode( Fixtures::read( 'packages/manifest.json' ), true );
		$cases = array(
			'formatVersion'    => 2,
			'schemaVersion'    => 99,
			'minPluginVersion' => '999.0.0',
			'complete'         => 'true',
			'files'            => array(),
			'media'            => array(
				array(
					'id'   => 1,
					'file' => null,
				),
			),
			'fonts'            => array( 'bad' ),
			'title'            => '',
		);
		foreach ( $cases as $key => $value ) {
			$raw         = $base;
			$raw[ $key ] = $value;
			try {
				PackageManifest::parse( json_encode( $raw ), '0.7.0' );
				self::fail( $key );
			} catch ( PackageError $error ) {
				self::assertNotSame( '', $error->error_code );
			}
		}
		$this->expectException( PackageError::class );
		PackageManifest::parse( '{', '0.7.0' );
	}

	public function test_templates_are_valid_bounded_archives_with_valid_documents(): void {
		foreach ( array( 'image-slider', 'text-hero', 'event' ) as $id ) {
			$archive = new PackageArchive( dirname( __DIR__, 3 ) . '/templates/' . $id . '.zip' );
			try {
				$manifest = $archive->verify( '0.7.0' );
				self::assertTrue( $manifest['complete'] );
				$validator = new \SW\Slider\Domain\DocumentValidator();
				self::assertSame( array(), $validator->validate_json( $archive->read( 'slider.json', 524288 ) ), $id );
			} finally {
				$archive->close();
			}
		}
	}

	public function test_effect_resource_remapping_keeps_parameters_and_links(): void {
		$document = Fixtures::object( 'documents/valid/effect.json' );
		$ids      = DocumentResources::media_ids( $document );
		self::assertNotEmpty( $ids );
		DocumentResources::map_media( $document, static fn ( int $id ): int => $id + 1000 );
		$expected = array_map( static fn ( int $id ): int => $id + 1000, $ids );
		self::assertSame( $expected, DocumentResources::media_ids( $document ) );
	}

	public function test_unassigned_image_layer_survives_media_remapping(): void {
		$document                      = Fixtures::object( 'documents/valid/effect.json' );
		$layer                         = (object) array(
			'type'    => 'image',
			'content' => (object) array( 'attachmentId' => null ),
		);
		$document->slides[0]->layers[] = $layer;
		self::assertNotEmpty( DocumentResources::media_ids( $document ) );
		DocumentResources::map_media( $document, static fn ( int $id ): int => $id + 1000 );
		self::assertNull( $layer->content->attachmentId );
	}

	public function test_invalid_image_and_oversize_dimensions_rejected(): void {
		$this->expectException( PackageError::class );
		PackageArchive::image_mime( '<?php echo 1;', 'media/fake.png' );
	}
}

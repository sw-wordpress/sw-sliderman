<?php
/** Export a validated draft and its pinned local resources.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\ImportExport;

use SW\Slider\Application\SliderService;
use SW\Slider\Domain\CanonicalJson;
use SW\Slider\Domain\Limits;
use SW\Slider\Fonts\FontRepository;
use SW\Slider\Fonts\FontStorage;
use ZipArchive;

final class PackageExporter {
	public function __construct( private readonly SliderService $sliders, private readonly FontRepository $fonts, private readonly FontStorage $storage, private readonly string $version ) {
	}

	/** Caller owns the private output path and removes it on failure. */
	public function write( int $id, bool $include_files, string $path ): void {
		if ( ! class_exists( ZipArchive::class ) ) {
			throw new PackageError( 'zip_support' );
		}
		$slider   = $this->sliders->get_draft( $id );
		$document = CanonicalJson::decode_tree( $slider->document_json );
		$zip      = new ZipArchive();
		if ( true !== $zip->open( $path, ZipArchive::CREATE | ZipArchive::EXCL ) ) {
			throw new PackageError( 'storage' );
		}
		$files = array();
		$total = 0;
		$add   = static function ( string $name, string $bytes ) use ( $zip, &$files, &$total ): void {
			if ( isset( $files[ $name ] ) ) {
				return;
			}
			$total += strlen( $bytes );
			if ( strlen( $bytes ) > Limits::FONT_JOB_BYTES || $total > Limits::ARCHIVE_BYTES - Limits::DOCUMENT_BYTES || count( $files ) >= Limits::ARCHIVE_ENTRIES - 1 || ! $zip->addFromString( $name, $bytes ) ) {
				throw new PackageError( 'limit' );
			}
			// STORE keeps valid highly repetitive resources below the import ratio limit.
			$zip->setCompressionName( $name, ZipArchive::CM_STORE );
			$files[ $name ] = array(
				'path'      => $name,
				'sizeBytes' => strlen( $bytes ),
				'sha256'    => hash( 'sha256', $bytes ),
			);
		};
		try {
			$add( 'slider.json', $slider->document_json );
			$media = array();
			foreach ( DocumentResources::media_ids( $document ) as $attachment ) {
				if ( ! current_user_can( 'read_post', $attachment ) ) {
					throw new PackageError( 'resource' );
				}
				$mime  = get_post_mime_type( $attachment );
				$types = array(
					'image/png'  => 'png',
					'image/jpeg' => 'jpg',
					'image/gif'  => 'gif',
					'image/webp' => 'webp',
					'image/avif' => 'avif',
				);
				if ( ! is_string( $mime ) || ! isset( $types[ $mime ] ) ) {
					throw new PackageError( 'mime' );
				}
				$name = null;
				if ( $include_files ) {
					$path_local = get_attached_file( $attachment, true );
					$uploads    = wp_upload_dir( null, false );
					$base       = realpath( (string) $uploads['basedir'] );
					$real       = is_string( $path_local ) ? realpath( $path_local ) : false;
					if ( false === $base || false === $real || ! str_starts_with( $real, $base . '/' ) || ! is_file( $real ) || is_link( $path_local ) || filesize( $real ) > Limits::FONT_JOB_BYTES ) {
						throw new PackageError( 'resource' );
					}
					$bytes = file_get_contents( $real ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- bounded local attachment.
					if ( false === $bytes ) {
						throw new PackageError( 'resource' );
					}
					$name = 'media/' . hash( 'sha256', $bytes ) . '.' . $types[ $mime ];
					PackageArchive::image_mime( $bytes, $name );
					$add( $name, $bytes );
				}
				$media[] = array(
					'id'      => $attachment,
					'file'    => $name,
					'mime'    => $mime,
					'alt'     => (string) get_post_meta( $attachment, '_wp_attachment_image_alt', true ),
					'license' => (string) get_post_meta( $attachment, '_sws_asset_license', true ),
				);
			}
			$fonts = array();
			foreach ( $document->fontRefs as $ref ) {
				if ( isset( $fonts[ $ref->installationId ] ) ) {
					continue;
				}
				$installation = $this->fonts->find( $ref->installationId );
				if ( null === $installation ) {
					throw new PackageError( 'resource' );
				}
				PackageFonts::parse( $installation );
				$fonts[ $ref->installationId ] = $installation;
				if ( ! $include_files ) {
					continue;
				}
				foreach ( $installation['variants'] as $variant ) {
					foreach ( $variant['files'] as $file ) {
						$bytes = $this->storage->read_file( $installation['directory'], $file['file'], Limits::FONT_FILE_BYTES );
						if ( null === $bytes || ! hash_equals( $file['sha256'], hash( 'sha256', $bytes ) ) ) {
							throw new PackageError( 'resource' );
						}
						$add( 'fonts/' . $installation['id'] . '/' . $file['file'], $bytes );
					}
				}
				$license = $this->storage->read_file( $installation['directory'], 'LICENSE.txt', 131072 );
				if ( null === $license ) {
					throw new PackageError( 'resource' );
				}
				$add( 'fonts/' . $installation['id'] . '/LICENSE.txt', $license );
			}
			$manifest = array(
				'formatVersion'    => 1,
				'schemaVersion'    => 1,
				'pluginVersion'    => $this->version,
				'minPluginVersion' => PackageManifest::MIN_PLUGIN_VERSION,
				'complete'         => $include_files,
				'title'            => $slider->title,
				'files'            => array_values( $files ),
				'media'            => $media,
				'fonts'            => array_values( $fonts ),
			);
			$zip->addFromString( 'manifest.json', CanonicalJson::encode( $manifest ) );
		} finally {
			$zip->close();
		}
		if ( filesize( $path ) > Limits::ARCHIVE_BYTES ) {
			throw new PackageError( 'limit' );
		}
		$check = new PackageArchive( $path );
		try {
			$check->verify( $this->version );
		} finally {
			$check->close();
		}
	}
}

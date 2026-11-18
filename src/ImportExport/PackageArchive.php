<?php
/** Bounded ZIP access without raw extraction.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\ImportExport;

use SW\Slider\Domain\Limits;
use ZipArchive;

/**
 * Reads one bounded entry at a time. Raw ZIP names are never used as destination paths.
 *
 * @phpstan-import-type Manifest from PackageManifest
 */
final class PackageArchive {
	private ZipArchive $zip;
	/** @var array<string,int> */
	private array $entries = array();

	public function __construct( string $path ) {
		if ( ! class_exists( ZipArchive::class ) ) {
			throw new PackageError( 'zip_support' );
		}
		if ( ! is_file( $path ) || is_link( $path ) || filesize( $path ) > Limits::ARCHIVE_BYTES ) {
			throw new PackageError( 'limit' );
		}
		$this->zip = new ZipArchive();
		if ( true !== $this->zip->open( $path, ZipArchive::RDONLY | ZipArchive::CHECKCONS ) ) {
			throw new PackageError( 'archive' );
		}
		try {
			$this->inspect();
		} catch ( \Throwable $error ) {
			$this->zip->close();
			throw $error;
		}
	}

	private function inspect(): void {
		if ( $this->zip->numFiles > Limits::ARCHIVE_ENTRIES ) {
			throw new PackageError( 'limit' );
		}
		$total = 0;
		$seen  = array();
		for ( $index = 0; $index < $this->zip->numFiles; ++$index ) {
			$stat = $this->zip->statIndex( $index );
			if ( false === $stat || ! PackageManifest::safe_name( $stat['name'] ) || isset( $seen[ strtolower( $stat['name'] ) ] ) ) {
				throw new PackageError( 'path' );
			}
			$seen[ strtolower( $stat['name'] ) ] = true;
			$opsys                               = 0;
			$attrs                               = 0;
			if ( ! $this->zip->getExternalAttributesIndex( $index, $opsys, $attrs ) || ( ZipArchive::OPSYS_UNIX === $opsys && ! in_array( ( $attrs >> 16 ) & 0170000, array( 0, 0100000 ), true ) ) || 0 !== $stat['encryption_method'] ) {
				throw new PackageError( 'path' );
			}
			$total += $stat['size'];
			if ( $stat['size'] < 1 || $stat['size'] > Limits::FONT_JOB_BYTES || $total > Limits::ARCHIVE_EXTRACTED_BYTES || $stat['size'] > max( 1, $stat['comp_size'] ) * 200 ) {
				throw new PackageError( 'limit' );
			}
			$this->entries[ $stat['name'] ] = $stat['size'];
		}
	}

	public function read( string $name, int $limit ): string {
		if ( ! isset( $this->entries[ $name ] ) || $this->entries[ $name ] > $limit ) {
			throw new PackageError( 'limit', $name );
		}
		$stream = $this->zip->getStream( $name );
		if ( false === $stream ) {
			throw new PackageError( 'archive' );
		}
		try {
			$bytes = stream_get_contents( $stream, $limit + 1 );
		} finally {
			fclose( $stream ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose -- ZIP stream.
		}
		if ( false === $bytes || strlen( $bytes ) !== $this->entries[ $name ] || strlen( $bytes ) > $limit ) {
			throw new PackageError( 'archive' );
		}
		return $bytes;
	}

	/** Checks the entire file table, hashes and media types before any resource is activated.
	 *
	 * @return Manifest
	 */
	public function verify( string $version ): array {
		$manifest = PackageManifest::parse( $this->read( 'manifest.json', Limits::DOCUMENT_BYTES ), $version );
		if ( count( $manifest['files'] ) + 1 !== count( $this->entries ) ) {
			throw new PackageError( 'manifest' );
		}
		foreach ( $manifest['files'] as $entry ) {
			$bytes = $this->read( $entry['path'], $entry['sizeBytes'] );
			if ( ! hash_equals( $entry['sha256'], hash( 'sha256', $bytes ) ) ) {
				throw new PackageError( 'hash' );
			}
			if ( str_starts_with( $entry['path'], 'media/' ) ) {
				self::image_mime( $bytes, $entry['path'] );
			}
			if ( str_ends_with( $entry['path'], '.woff2' ) && ! \SW\Slider\Fonts\Woff2::is_static( $bytes ) ) {
				throw new PackageError( 'font' );
			}
		}
		foreach ( $manifest['media'] as $item ) {
			if ( null !== $item['file'] && self::image_mime( $this->read( $item['file'], Limits::FONT_JOB_BYTES ), $item['file'] ) !== $item['mime'] ) {
				throw new PackageError( 'mime' );
			}
		}
		return $manifest;
	}

	public static function image_mime( string $bytes, string $name ): string {
		// getimagesize parses local bytes; no remote resource resolution is possible.
		$info  = @getimagesizefromstring( $bytes ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- malformed input is an expected rejection.
		$types = array(
			'png'  => 'image/png',
			'jpg'  => 'image/jpeg',
			'gif'  => 'image/gif',
			'webp' => 'image/webp',
			'avif' => 'image/avif',
		);
		if ( false === $info || ( $types[ pathinfo( $name, PATHINFO_EXTENSION ) ] ?? '' ) !== $info['mime'] || $info[0] > 20000 || $info[1] > 20000 || $info[0] * $info[1] > 40000000 ) {
			throw new PackageError( 'mime' );
		}
		return $info['mime'];
	}

	public function close(): void {
		$this->zip->close();
	}
}

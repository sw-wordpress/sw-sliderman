<?php
/** Package format 1: JSON metadata and content-addressed local resources.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\ImportExport;

use SW\Slider\Domain\Limits;

/**
 * Archive metadata is input, never a source of filesystem paths or executable CSS.
 *
 * @phpstan-type Entry array{path:string,sizeBytes:int,sha256:string}
 * @phpstan-type Media array{id:int,file:?string,mime:string,alt:string,license:string}
 * @phpstan-type Manifest array{formatVersion:int,schemaVersion:int,pluginVersion:string,minPluginVersion:string,complete:bool,title:string,files:list<Entry>,media:list<Media>,fonts:list<array<string,mixed>>}
 */
final class PackageManifest {
	/** First plugin version with the format-1 reader; independent of future plugin releases. */
	public const MIN_PLUGIN_VERSION = '0.7.0';

	/** @return Manifest */
	public static function parse( string $json, string $plugin_version ): array {
		try {
			$raw = json_decode( $json, true, 32, JSON_THROW_ON_ERROR );
		} catch ( \JsonException ) {
			throw new PackageError( 'manifest' );
		}
		if ( ! is_array( $raw ) || 1 !== ( $raw['formatVersion'] ?? null ) || 1 !== ( $raw['schemaVersion'] ?? null ) || ! is_string( $raw['minPluginVersion'] ?? null ) || ! preg_match( '/\A\d+\.\d+\.\d+(?:\.\d+)?\z/', $raw['minPluginVersion'] ) || version_compare( $raw['minPluginVersion'], $plugin_version, '>' ) ) {
			throw new PackageError( 'version' );
		}
		if ( ! is_string( $raw['pluginVersion'] ?? null ) || strlen( $raw['pluginVersion'] ) > 40 || ! is_bool( $raw['complete'] ?? null ) || ! is_string( $raw['title'] ?? null ) || '' === trim( $raw['title'] ) || strlen( $raw['title'] ) > 800 ) {
			throw new PackageError( 'manifest' );
		}
		foreach ( array( 'files', 'media', 'fonts' ) as $key ) {
			if ( ! isset( $raw[ $key ] ) || ! is_array( $raw[ $key ] ) || ! array_is_list( $raw[ $key ] ) || count( $raw[ $key ] ) > Limits::ARCHIVE_ENTRIES ) {
				throw new PackageError( 'manifest' );
			}
		}
		$files = array();
		$names = array();
		$total = 0;
		foreach ( $raw['files'] as $entry ) {
			if ( ! is_array( $entry ) || ! is_string( $entry['path'] ?? null ) || ! self::safe_name( $entry['path'] ) || ! is_int( $entry['sizeBytes'] ?? null ) || $entry['sizeBytes'] < 1 || $entry['sizeBytes'] > Limits::FONT_JOB_BYTES || ! is_string( $entry['sha256'] ?? null ) || ! preg_match( '/\A[a-f0-9]{64}\z/', $entry['sha256'] ) || isset( $names[ strtolower( $entry['path'] ) ] ) || 'manifest.json' === $entry['path'] ) {
				throw new PackageError( 'manifest' );
			}
			$names[ strtolower( $entry['path'] ) ] = true;
			$total                                += $entry['sizeBytes'];
			$files[]                               = array(
				'path'      => $entry['path'],
				'sizeBytes' => $entry['sizeBytes'],
				'sha256'    => $entry['sha256'],
			);
		}
		if ( $total > Limits::ARCHIVE_EXTRACTED_BYTES || ! isset( $names['slider.json'] ) ) {
			throw new PackageError( 'limit' );
		}
		$media = array();
		$ids   = array();
		foreach ( $raw['media'] as $item ) {
			if ( ! is_array( $item ) || ! is_int( $item['id'] ?? null ) || $item['id'] < 1 || isset( $ids[ $item['id'] ] ) || ! array_key_exists( 'file', $item ) || ( null !== $item['file'] && ( ! is_string( $item['file'] ) || ! preg_match( '#\Amedia/[a-f0-9]{64}\.(?:png|jpg|gif|webp|avif)\z#', $item['file'] ) || ! isset( $names[ $item['file'] ] ) ) ) || ! in_array( $item['mime'] ?? null, array( 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif' ), true ) || ! is_string( $item['alt'] ?? null ) || strlen( $item['alt'] ) > 1200 || ( isset( $item['license'] ) && ( ! is_string( $item['license'] ) || strlen( $item['license'] ) > 131072 ) ) || ( $raw['complete'] && null === $item['file'] ) ) {
				throw new PackageError( 'manifest' );
			}
			$ids[ $item['id'] ] = true;
			$media[]            = array(
				'id'      => $item['id'],
				'file'    => $item['file'],
				'mime'    => $item['mime'],
				'alt'     => $item['alt'],
				'license' => $item['license'] ?? '',
			);
		}
		$fonts = array();
		foreach ( $raw['fonts'] as $font ) {
			if ( ! is_array( $font ) || array_is_list( $font ) ) {
				throw new PackageError( 'manifest' );
			}
			$fonts[] = $font;
		}
		return array(
			'formatVersion'    => 1,
			'schemaVersion'    => 1,
			'pluginVersion'    => $raw['pluginVersion'],
			'minPluginVersion' => $raw['minPluginVersion'],
			'complete'         => $raw['complete'],
			'title'            => $raw['title'],
			'files'            => $files,
			'media'            => $media,
			'fonts'            => $fonts,
		);
	}

	public static function safe_name( string $name ): bool {
		return 1 === preg_match( '#\A(?:manifest\.json|slider\.json|media/[a-f0-9]{64}\.(?:png|jpg|gif|webp|avif)|fonts/[a-zA-Z0-9_-]{1,64}/(?:[a-f0-9]{64}\.woff2|LICENSE\.txt))\z#', $name );
	}
}

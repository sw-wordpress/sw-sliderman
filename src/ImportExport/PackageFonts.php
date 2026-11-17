<?php
/** Font descriptor validation for portable packages.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\ImportExport;

use SW\Slider\Fonts\FontRepository;
use SW\Slider\Domain\Limits;

/** @phpstan-import-type Installation from FontRepository */
final class PackageFonts {
	/**
	 * Paths are rebuilt locally. Neither incoming CSS nor absolute URLs are accepted.
	 *
	 * @param array<string,mixed> $raw Exported installation descriptor.
	 * @return Installation
	 */
	public static function parse( array $raw ): array {
		$id        = self::text( $raw, 'id', '/\A[a-zA-Z0-9_-]{1,64}\z/' );
		$family_id = self::text( $raw, 'familyId', '/\A[a-zA-Z0-9_-]{1,40}\z/' );
		$family    = self::text( $raw, 'family', '/\A[\pL\pN][\pL\pN ._-]{0,79}\z/u' );
		$category  = self::text( $raw, 'category', '/\A[a-z-]{1,30}\z/' );
		if ( ! is_array( $raw['license'] ?? null ) || ! is_array( $raw['source'] ?? null ) || ! is_array( $raw['variants'] ?? null ) || ! array_is_list( $raw['variants'] ) || count( $raw['variants'] ) < 1 || count( $raw['variants'] ) > 18 ) {
			throw new PackageError( 'font' );
		}
		$license_id  = self::text( $raw['license'], 'id', '/\A[A-Za-z0-9][A-Za-z0-9.+_-]{0,39}\z/' );
		$source_path = self::text( $raw['license'], 'sourcePath', '/\A[a-zA-Z0-9._\/-]{1,240}\z/' );
		$provider    = self::text( $raw['source'], 'provider', '/\A[a-zA-Z0-9._-]{1,40}\z/' );
		$version     = self::text( $raw['source'], 'catalogVersion', '/\A[a-zA-Z0-9._-]{1,80}\z/' );
		$variants    = array();
		$seen        = array();
		$total       = 0;
		$count       = 0;
		foreach ( $raw['variants'] as $variant ) {
			if ( ! is_array( $variant ) || ! is_int( $variant['weight'] ?? null ) || $variant['weight'] < 100 || $variant['weight'] > 900 || 0 !== $variant['weight'] % 100 || ! in_array( $variant['style'] ?? null, array( 'normal', 'italic' ), true ) || ! is_array( $variant['files'] ?? null ) || ! array_is_list( $variant['files'] ) || array() === $variant['files'] ) {
				throw new PackageError( 'font' );
			}
			$key = $variant['weight'] . $variant['style'];
			if ( isset( $seen[ $key ] ) ) {
				throw new PackageError( 'font' );
			}
			$seen[ $key ] = true;
			$files        = array();
			foreach ( $variant['files'] as $file ) {
				if ( ! is_array( $file ) || ! is_int( $file['sizeBytes'] ?? null ) || $file['sizeBytes'] < 48 || $file['sizeBytes'] > Limits::FONT_FILE_BYTES ) {
					throw new PackageError( 'font' );
				}
				$hash   = self::text( $file, 'sha256', '/\A[a-f0-9]{64}\z/' );
				$subset = self::text( $file, 'subset', '/\A[a-z0-9-]{1,40}\z/' );
				$range  = self::text( $file, 'unicodeRange', '/\A[U+0-9A-F?, -]{1,4000}\z/' );
				if ( ( $file['file'] ?? null ) !== $hash . '.woff2' ) {
					throw new PackageError( 'font' );
				}
				$total += $file['sizeBytes'];
				++$count;
				$files[] = array(
					'subset'       => $subset,
					'unicodeRange' => $range,
					'file'         => $hash . '.woff2',
					'sha256'       => $hash,
					'sizeBytes'    => $file['sizeBytes'],
				);
			}
			$variants[] = array(
				'weight' => $variant['weight'],
				'style'  => $variant['style'],
				'files'  => $files,
			);
		}
		if ( $count > 60 || $total > Limits::FONT_JOB_BYTES ) {
			throw new PackageError( 'limit' );
		}
		return array(
			'id'           => $id,
			'familyId'     => $family_id,
			'family'       => $family,
			'category'     => $category,
			'directory'    => '',
			'stylesheet'   => '',
			'variants'     => $variants,
			'license'      => array(
				'id'         => $license_id,
				'file'       => '',
				'sourcePath' => $source_path,
			),
			'source'       => array(
				'provider'       => $provider,
				'catalogVersion' => $version,
			),
			'installedGmt' => '',
		);
	}

	/** @param array<array-key,mixed> $raw Input object. */
	private static function text( array $raw, string $key, string $pattern ): string {
		if ( ! is_string( $raw[ $key ] ?? null ) || 1 !== preg_match( $pattern, $raw[ $key ] ) ) {
			throw new PackageError( 'font' );
		}
		return $raw[ $key ];
	}
}

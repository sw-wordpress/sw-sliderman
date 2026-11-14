<?php
/**
 * Validate the exact file handed to WordPress before any extraction.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Infrastructure\Updates;

use WP_Error;
use RuntimeException;
use Throwable;
use ZipArchive;

final class UpdatePackage {
	/**
	 * @param string              $file Downloaded ZIP.
	 * @param array<string,mixed> $package
	 * @return true|WP_Error
	 * @throws RuntimeException Caught and converted into WP_Error.
	 */
	public static function verify( string $file, array $package ): true|WP_Error {
		clearstatcache( true, $file );
		$hash = is_file( $file ) ? hash_file( 'sha256', $file ) : false;
		if ( ! class_exists( 'ZipArchive' ) || ! is_file( $file ) || filesize( $file ) !== $package['bytes'] || ! is_string( $hash ) || ! hash_equals( $package['sha256'], $hash ) ) {
			return new WP_Error( 'invalid_update_file', __( 'ZIP size or SHA-256 mismatch, or ZIP verification is unavailable.', 'sw-sliderman' ) );
		}
		$zip = new ZipArchive();
		if ( true !== $zip->open( $file ) ) {
			return new WP_Error( 'invalid_update_zip', __( 'Invalid ZIP archive.', 'sw-sliderman' ) );
		}
		try {
			// phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- ZipArchive API.
			$count = $zip->numFiles;
			if ( $count < 1 || $count > 10000 ) {
				throw new RuntimeException( 'Zu viele ZIP-Einträge.' );
			}
			$total   = 0;
			$seen    = array();
			$parents = array();
			foreach ( range( 0, $count - 1 ) as $index ) {
				$stat = $zip->statIndex( $index );
				if ( false === $stat ) {
					throw new RuntimeException( 'ZIP-Eintrag unlesbar.' );
				}
				$name  = $stat['name'];
				$parts = explode( '/', rtrim( $name, '/' ) );
				$key   = strtolower( rtrim( $name, '/' ) );
				if ( ! $zip->getExternalAttributesIndex( $index, $opsys, $attributes ) ) {
					throw new RuntimeException( 'ZIP-Dateityp unlesbar.' );
				}
				$mode = ( $attributes >> 16 ) & 0170000;
				if ( $parts[0] !== $package['slug'] || preg_match( '/[\\\\:\x00-\x1f]/', $name ) || in_array( '..', $parts, true ) || in_array( '.', $parts, true ) || in_array( '', $parts, true ) || isset( $seen[ $key ] ) || ( 0 !== $mode && ! in_array( $mode, array( 0100000, 0040000 ), true ) ) || ! empty( $stat['encryption_method'] ) ) {
					throw new RuntimeException( 'Unsicherer ZIP-Pfad oder Dateityp.' );
				}
				// A file must not also be an ancestor directory (including case-folded paths).
				$ancestor = $key;
				while ( str_contains( $ancestor, '/' ) ) {
					$ancestor             = substr( $ancestor, 0, (int) strrpos( $ancestor, '/' ) );
					$parents[ $ancestor ] = true;
					if ( isset( $seen[ $ancestor ] ) && false === $seen[ $ancestor ] ) {
						throw new RuntimeException( 'ZIP file/directory collision.' );
					}
				}
				$is_directory = str_ends_with( $name, '/' );
				if ( ! $is_directory && isset( $parents[ $key ] ) ) {
					throw new RuntimeException( 'ZIP file/directory collision.' );
				}
				if ( ( 0040000 === $mode && ! $is_directory ) || ( 0100000 === $mode && $is_directory ) ) {
					throw new RuntimeException( 'ZIP path/type mismatch.' );
				}
				$seen[ $key ] = $is_directory;
				$total       += $stat['size'];
				if ( $total > 262144000 || $stat['size'] > max( 1048576, 200 * $stat['comp_size'] ) ) {
					throw new RuntimeException( 'Entpacklimit überschritten.' );
				}
			}
			$main = $zip->getFromName( $package['slug'] . '/' . $package['main_file'], 16384 );
			if ( ! is_string( $main ) || ! preg_match( '/^[ \t\/*#@]*Plugin Name:\s*\S.+$/mi', $main ) ) {
				throw new RuntimeException( 'Plugin-Hauptdatei fehlt.' );
			}
			foreach ( array(
				'Version'           => 'version',
				'Requires PHP'      => 'requires_php',
				'Requires at least' => 'requires_wp',
			) as $header => $field ) {
				if ( ! preg_match( '/^[ \t\/*#@]*' . preg_quote( $header, '/' ) . ':\s*(.+)$/mi', $main, $match ) || trim( $match[1], " \t\r\n*/" ) !== $package[ $field ] ) {
					throw new RuntimeException( 'Plugin-Header widerspricht dem Manifest: ' . $header );
				}
			}
			if ( ! preg_match( '/^[ \t\/*#@]*Update URI:\s*(.+)$/mi', $main, $identity ) || trim( $identity[1], " \t\r\n*/" ) !== 'https://github.com/' . UpdateManifest::source()['repository'] ) {
				throw new RuntimeException( 'Plugin Update URI does not match the local release source.' );
			}
			return true;
		} catch ( Throwable $error ) {
			return new WP_Error( 'unsafe_update_zip', __( 'Unsafe ZIP paths, types, limits or plugin headers.', 'sw-sliderman' ) );
		} finally {
			$zip->close();
		}
	}
}

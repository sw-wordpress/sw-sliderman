<?php
/** Non-public, per-site package workspaces.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\ImportExport;

final class PrivateWorkspace {
	private readonly string $prefix;
	public function __construct( private readonly string $root ) {
		$this->prefix = 'sws-package-' . substr( hash( 'sha256', ABSPATH . '|' . DB_NAME . '|' . get_current_blog_id() ), 0, 12 ) . '-';
		$resolved     = realpath( $root );
		if ( false === $resolved || is_link( $root ) || ! is_writable( $resolved ) ) {
			throw new PackageError( 'staging' );
		}
		// phpcs:ignore WordPress.Security.ValidatedSanitizedInput -- server filesystem configuration; realpath is the required normalization.
		foreach ( array( ABSPATH, $_SERVER['DOCUMENT_ROOT'] ?? '' ) as $web_root ) {
			$web = '' === $web_root ? false : realpath( $web_root );
			if ( false !== $web && ( $resolved === $web || str_starts_with( $resolved . '/', rtrim( $web, '/' ) . '/' ) ) ) {
				throw new PackageError( 'staging' );
			}
		}
	}

	public function create(): string {
		$token = bin2hex( random_bytes( 16 ) );
		$path  = $this->path( $token );
		if ( ! mkdir( $path, 0700 ) ) { // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_mkdir -- private directory permissions are deliberate.
			throw new PackageError( 'staging' );
		}
		return $token;
	}

	public function path( string $token ): string {
		if ( 1 !== preg_match( '/\A[a-f0-9]{32}\z/', $token ) ) {
			throw new PackageError( 'staging' );
		}
		$path = rtrim( $this->root, '/' ) . '/' . $this->prefix . $token;
		if ( is_link( $path ) ) {
			throw new PackageError( 'staging' );
		}
		return $path;
	}

	public function remove( string $token ): void {
		$path = $this->path( $token );
		if ( ! is_dir( $path ) ) {
			return;
		}
		foreach ( (array) scandir( $path ) as $name ) {
			if ( in_array( $name, array( 'package.zip', 'resource.bin' ), true ) && ! is_link( $path . '/' . $name ) ) {
				wp_delete_file( $path . '/' . $name );
			}
		}
		if ( array( '.', '..' ) !== scandir( $path ) ) {
			return;
		}
		rmdir( $path ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_rmdir -- only our own flat directory.
	}
	/** Recover private directories left before a session record could be persisted. */
	public function cleanup_orphans(): void {
		$paths = glob( rtrim( $this->root, '/' ) . '/' . $this->prefix . '*' );
		if ( false === $paths ) {
			return;
		}
		foreach ( $paths as $path ) {
			$token = substr( basename( $path ), strlen( $this->prefix ) );
			if ( 1 !== preg_match( '/\A[a-f0-9]{32}\z/', $token ) || is_link( $path ) || ! is_dir( $path ) || filemtime( $path ) > time() - DAY_IN_SECONDS || false !== get_option( 'sws_package_' . $token, false ) ) {
				continue;
			}
			$this->remove( $token );
		}
	}
}

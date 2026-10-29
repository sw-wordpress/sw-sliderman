<?php
/**
 * Published stylesheet storage in the uploads area.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Infrastructure;

use SW\Slider\Application\ArtifactStore;

/**
 * Writes stylesheets to `uploads/sw-sliderman/artifacts/` atomically: a temporary file in the
 * same directory is renamed into place, existing artifacts are never rewritten (their name is
 * derived from the document hash and renderer version).
 */
final class UploadsArtifactStore implements ArtifactStore {

	public function store_stylesheet( string $name, string $css ): ?string {
		$relative = 'artifacts/' . $name;
		$target   = UploadPaths::path( $relative );
		if ( null === $target ) {
			return null;
		}
		if ( is_file( $target ) ) {
			return hash_equals( hash( 'sha256', $css ), (string) hash_file( 'sha256', $target ) ) ? $relative : null;
		}
		$dir = dirname( $target );
		if ( ! UploadPaths::ensure_dir( $dir ) ) {
			return null;
		}
		$temporary = $dir . '/.tmp-' . wp_generate_password( 12, false ) . '.css';
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- direct, atomic write inside our own uploads root; WP_Filesystem may require credentials.
		if ( strlen( $css ) !== file_put_contents( $temporary, $css, LOCK_EX ) ) {
			wp_delete_file( $temporary );
			return null;
		}
		// phpcs:ignore WordPress.WP.AlternativeFunctions.rename_rename -- atomic switch within one directory.
		if ( ! rename( $temporary, $target ) ) {
			wp_delete_file( $temporary );
			return null;
		}
		return $relative;
	}
}

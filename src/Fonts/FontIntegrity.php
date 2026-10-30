<?php
/**
 * Installed font integrity shared by diagnostics and activation.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Fonts;

/** @phpstan-import-type Installation from FontRepository */
final class FontIntegrity {
	/** @param Installation $installation Stored manifest. */
	public static function complete( FontStorage $storage, array $installation ): bool {
		if ( ! $storage->exists( $installation['directory'] ) || array() === $installation['variants'] ) {
			return false;
		}
		$css = LocalFontCss::build( 'sws-' . $installation['id'], $installation['variants'] );
		if ( ! $storage->verify_file( $installation['directory'], 'font.css', hash( 'sha256', $css ) ) ) {
			return false;
		}
		foreach ( $installation['variants'] as $variant ) {
			if ( array() === $variant['files'] ) {
				return false;
			}
			foreach ( $variant['files'] as $file ) {
				if ( ! $storage->verify_file( $installation['directory'], $file['file'], $file['sha256'] ) ) {
					return false;
				}
			}
		}
		$license = $storage->read_file( $installation['directory'], 'LICENSE.txt', 131072 );
		return null !== $license && '' !== trim( $license );
	}
}

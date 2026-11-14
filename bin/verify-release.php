<?php
/** Artifact validation using the runtime verifier; this tool is never shipped.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

// Only the WordPress error/translation boundary is replaced; verification code is unchanged.
require __DIR__ . '/../tests/fixtures/update-wordpress-shim.php';
require __DIR__ . '/../src/Infrastructure/Updates/UpdateManifest.php';
require __DIR__ . '/../src/Infrastructure/Updates/UpdatePackage.php';

$sws_directory = $argv[1] ?? '';
$sws_release   = json_decode( (string) file_get_contents( $argv[2] ?? '' ), true, 32, JSON_THROW_ON_ERROR );
$sws_keys      = require $argv[3];
// Signing occurs while draft; verify the metadata as it will appear after publication.
$sws_release['draft']      = false;
$sws_manifest              = \SW\Slider\Infrastructure\Updates\UpdateManifest::verify(
	(string) file_get_contents( $sws_directory . '/sw-plugin-release.json' ),
	(string) file_get_contents( $sws_directory . '/sw-plugin-release.json.sig' ),
	$sws_keys,
	$sws_release
);
if ( $sws_manifest instanceof WP_Error ) {
	throw new RuntimeException( $sws_manifest->get_error_message() );
}
foreach ( $sws_manifest['packages'] as $sws_package ) {
	$sws_result = \SW\Slider\Infrastructure\Updates\UpdatePackage::verify( $sws_directory . '/' . $sws_package['filename'], $sws_package );
	if ( true !== $sws_result ) {
		throw new RuntimeException( $sws_result->get_error_message() );
	}
}
echo "Runtime manifest and package verification passed.\n";

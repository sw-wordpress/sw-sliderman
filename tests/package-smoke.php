<?php
/**
 * Smoke test of a built plugin directory (run on the staging tree and on the unpacked ZIP).
 *
 * Usage: php tests/package-smoke.php <plugin-dir>
 * Loads the packaged autoloader and checks that all runtime classes resolve and that the built
 * assets, catalog and translations are present. Runs without WordPress.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

$sws_dir = rtrim( $argv[1] ?? '', '/' );
if ( '' === $sws_dir || ! is_dir( $sws_dir ) ) {
	fwrite( STDERR, "usage: php tests/package-smoke.php <plugin-dir>\n" );
	exit( 2 );
}
require $sws_dir . '/vendor/autoload.php';

$sws_failures = array();
$sws_iterator = new RecursiveIteratorIterator( new RecursiveDirectoryIterator( $sws_dir . '/src', FilesystemIterator::SKIP_DOTS ) );
foreach ( $sws_iterator as $sws_file ) {
	$sws_class = 'SW\\Slider\\' . str_replace( array( '/', '.php' ), array( '\\', '' ), substr( $sws_file->getPathname(), strlen( $sws_dir . '/src/' ) ) );
	if ( ! class_exists( $sws_class ) && ! interface_exists( $sws_class ) ) {
		$sws_failures[] = 'class not autoloadable: ' . $sws_class;
	}
}
$sws_required = array(
	'sw-sliderman.php',
	'uninstall.php',
	'build/editor/editor.js',
	'build/editor/editor.css',
	'build/runtime/runtime.js',
	'build/runtime/effects.js',
	'build/runtime/runtime.css',
	'fonts/catalog.json',
	'schemas/defaults/new-slider.json',
	'languages/sw-sliderman-de_DE.mo',
	'languages/sw-sliderman-de_DE-sws-editor.json',
);
foreach ( $sws_required as $sws_path ) {
	if ( ! is_file( $sws_dir . '/' . $sws_path ) ) {
		$sws_failures[] = 'missing file: ' . $sws_path;
	}
}
if ( array() !== $sws_failures ) {
	fwrite( STDERR, implode( "\n", $sws_failures ) . "\n" );
	exit( 1 );
}
echo "package smoke test passed\n";

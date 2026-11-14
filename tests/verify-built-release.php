<?php
/** Checks a real built ZIP with disposable signing material; no live release/account writes.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

$sws_zip = realpath( $argv[1] ?? '' );
if ( false === $sws_zip ) {
	throw new RuntimeException( 'Pass the built ZIP path.' );
}
$sws_root = dirname( __DIR__ );
$sws_temp = sys_get_temp_dir() . '/sws-build-proof-' . bin2hex( random_bytes( 8 ) );
mkdir( $sws_temp, 0700 );
/** @param list<string> $command @param array<string,string> $environment */
function sws_artifact_run( array $command, array $environment = array(), bool $failure = false ): void {
	$process = proc_open( $command, array( 1 => array( 'pipe', 'w' ), 2 => array( 'pipe', 'w' ) ), $pipes, null, $environment );
	if ( ! is_resource( $process ) ) {
		throw new RuntimeException( 'Cannot execute artifact check.' );
	}
	$output = stream_get_contents( $pipes[1] ) . stream_get_contents( $pipes[2] );
	fclose( $pipes[1] ); fclose( $pipes[2] );
	$exit = proc_close( $process );
	if ( $failure ? 0 === $exit : 0 !== $exit ) {
		throw new RuntimeException( 'Artifact check failed: ' . $output );
	}
}
try {
	copy( $sws_zip, $sws_temp . '/' . basename( $sws_zip ) );
	$sws_archive = new ZipArchive();
	if ( true !== $sws_archive->open( $sws_zip ) ) {
		throw new RuntimeException( 'Cannot open package.' );
	}
	$sws_main = $sws_archive->getFromName( 'sw-sliderman/sw-sliderman.php' );
	preg_match( '/Version:\s*([0-9.]+)/', $sws_main, $sws_match );
	$sws_release = array( 'id' => 101, 'tag_name' => 'v' . $sws_match[1], 'draft' => true, 'prerelease' => false, 'assets' => array( array( 'id' => 102, 'name' => basename( $sws_zip ), 'size' => filesize( $sws_zip ), 'digest' => 'sha256:' . hash_file( 'sha256', $sws_zip ) ) ) );
	file_put_contents( $sws_temp . '/release.json', json_encode( $sws_release, JSON_THROW_ON_ERROR ) );
	file_put_contents( $sws_temp . '/keys.php', '<?php return array();' );
	$sws_pair = sodium_crypto_sign_keypair();
	$sws_environment = array( 'SW_PLUGIN_RELEASE_SIGNING_KEY' => base64_encode( sodium_crypto_sign_secretkey( $sws_pair ) ), 'SW_PLUGIN_RELEASE_KEY_ID' => 'disposable-build' );
	sws_artifact_run( array( PHP_BINARY, $sws_root . '/bin/release-manifest.php', 'public-key', $sws_temp . '/keys.php' ), $sws_environment );
	sws_artifact_run( array( PHP_BINARY, $sws_root . '/bin/release-manifest.php', 'sign', $sws_temp . '/release.json', $sws_temp, str_repeat( 'a', 40 ) ), $sws_environment );
	sws_artifact_run( array( PHP_BINARY, $sws_root . '/bin/verify-release.php', $sws_temp, $sws_temp . '/release.json', $sws_temp . '/keys.php' ) );
	sws_artifact_run( array( PHP_BINARY, '-n', $sws_root . '/bin/verify-release.php', $sws_temp, $sws_temp . '/release.json', $sws_temp . '/keys.php' ), array(), true );
	sws_artifact_run( array( PHP_BINARY, '-d', 'disable_functions=sodium_crypto_sign_verify_detached', $sws_root . '/bin/verify-release.php', $sws_temp, $sws_temp . '/release.json', $sws_temp . '/keys.php' ), array(), true );
	sws_artifact_run( array( PHP_BINARY, $sws_root . '/bin/release-manifest.php', 'sign', $sws_temp . '/release.json', $sws_temp, str_repeat( 'a', 40 ) ), array(), true );
	// Runtime verification above established the ZIP structure before test extraction.
	$sws_archive->extractTo( $sws_temp . '/unpacked' );
	$sws_archive->close();
	sws_artifact_run( array( PHP_BINARY, $sws_root . '/tests/package-smoke.php', $sws_temp . '/unpacked/sw-sliderman' ) );
	$sws_entries = new RecursiveIteratorIterator( new RecursiveDirectoryIterator( $sws_temp . '/unpacked/sw-sliderman', FilesystemIterator::SKIP_DOTS ) );
	foreach ( $sws_entries as $sws_entry ) {
		$sws_path = substr( $sws_entry->getPathname(), strlen( $sws_temp . '/unpacked/sw-sliderman/' ) );
		if ( preg_match( '#^(?:assets|tests|bin|node_modules|coverage|\.git|\.github)/|^vendor/(?:phpunit|phpstan|squizlabs|wp-coding-standards)/#', $sws_path ) ) {
			throw new RuntimeException( 'Development files in package: ' . $sws_path );
		}
	}
	echo "Built ZIP: signed with disposable key; runtime verification, missing Sodium/secret rejection and completeness passed.\n";
} finally {
	$sws_entries = new RecursiveIteratorIterator( new RecursiveDirectoryIterator( $sws_temp, FilesystemIterator::SKIP_DOTS ), RecursiveIteratorIterator::CHILD_FIRST );
	foreach ( $sws_entries as $sws_entry ) {
		if ( $sws_entry->isDir() ) { rmdir( $sws_entry->getPathname() ); } else { unlink( $sws_entry->getPathname() ); }
	}
	rmdir( $sws_temp );
}

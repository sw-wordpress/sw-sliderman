<?php
/**
 * Independent connection for the two-process write test. Never loads the development site.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

require dirname( __DIR__ ) . '/wp-tests-config.php';
if ( ! str_contains( DB_NAME, '_tests' ) ) {
	exit( 2 );
}
// phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- WordPress bootstrap constant, required by the isolated CLI worker.
define( 'WP_INSTALLING', true );
// phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- WordPress bootstrap constant.
define( 'WP_USE_THEMES', false );
require ABSPATH . 'wp-settings.php';
// Same dependency set as tests/wp/bootstrap.php (CI installs only tests/wp/vendor, not the plugin's own vendor).
// phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- plugin constant used by the test environment.
define( 'SWS_AUTOLOADER', dirname( __DIR__ ) . '/vendor/autoload.php' );
require dirname( __DIR__, 3 ) . '/sw-sliderman.php';
( new \SW\Slider\Infrastructure\PostTypes() )->register_post_types();
wp_set_current_user( (int) $argv[1] );
$sws_worker_repository = new \SW\Slider\Infrastructure\WpSliderRepository( $wpdb );
$sws_worker_stored     = $sws_worker_repository->find( (int) $argv[2] );
if ( null === $sws_worker_stored ) {
	exit( 3 ); }
$sws_worker_document                  = \SW\Slider\Domain\CanonicalJson::decode_tree( $sws_worker_stored->document_json );
$sws_worker_document->slides[0]->name = $argv[3];
// Hold the winner's lock long enough for the second independent request to contend for it.
add_action(
	'pre_post_update',
	static function (): void {
		usleep( 150000 );
	}
);
echo "ready\n";
fflush( STDOUT );
fgets( STDIN );
try {
	$sws_worker_version = $sws_worker_repository->save_draft( $sws_worker_stored->id, $argv[3], \SW\Slider\Domain\CanonicalJson::encode( $sws_worker_document ), 1 );
	echo wp_json_encode(
		array(
			'status'  => 200,
			'version' => $sws_worker_version,
		)
	);
} catch ( \SW\Slider\Application\VersionConflict $sws_worker_error ) {
	echo wp_json_encode(
		array(
			'status'  => 409,
			'version' => $sws_worker_error->current_version,
		)
	);
}

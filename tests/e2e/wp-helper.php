<?php
/**
 * Local end-to-end helper (development site only, never shipped).
 *
 * Usage: php tests/e2e/wp-helper.php auth|activate|page <slider-id>|slider <title>|bulk <prefix> <count>|age <id>|cleanup <title-prefix>
 * Prints JSON. `auth` returns admin cookies for Playwright; `page` creates/updates a test page
 * that embeds the slider twice.
 *
 * @package sw-sliderman
 */

define( 'WP_USE_THEMES', false );
$_SERVER['HTTP_HOST'] = 'localhost';
require ( getenv( 'WP_ROOT' ) ?: dirname( __DIR__, 5 ) ) . '/wp-load.php';

$sws_command = $argv[1] ?? 'auth';
if ( 'activate' === $sws_command ) {
	require_once ABSPATH . 'wp-admin/includes/plugin.php';
	$sws_result = activate_plugin( 'sw-sliderman/sw-sliderman.php' );
	echo wp_json_encode( array( 'active' => ! is_wp_error( $sws_result ) && is_plugin_active( 'sw-sliderman/sw-sliderman.php' ) ) ), "\n";
	exit;
}
if ( 'page' === $sws_command ) {
	$sws_id      = (int) ( $argv[2] ?? 0 );
	$sws_content = "<!-- wp:paragraph --><p>Vor dem Slider.</p><!-- /wp:paragraph -->\n[sw_slider id=\"$sws_id\"]\n<!-- wp:paragraph --><p>Zweite Instanz:</p><!-- /wp:paragraph -->\n[sw_slider id=\"$sws_id\"]";
	$sws_page    = get_page_by_path( 'sws-e2e' );
	$sws_page_id = wp_insert_post(
		array(
			'ID'           => $sws_page ? $sws_page->ID : 0,
			'post_type'    => 'page',
			'post_status'  => 'publish',
			'post_title'   => 'SW Sliderman E2E',
			'post_name'    => 'sws-e2e',
			'post_content' => $sws_content,
		)
	);
	echo wp_json_encode( array( 'url' => get_permalink( $sws_page_id ) ) ), "\n";
	exit;
}
if ( 'slider' === $sws_command ) {
	// Creates and publishes a default slider (title must start with E2E so cleanup removes it).
	$sws_admins = get_users( array( 'role' => 'administrator', 'number' => 1, 'fields' => 'ID' ) );
	wp_set_current_user( (int) ( $sws_admins[0] ?? 0 ) );
	do_action( 'rest_api_init' );
	$sws_call = static function ( string $method, string $route, array $body ): array {
		$request = new WP_REST_Request( $method, '/sw-sliderman/v1' . $route );
		$request->set_header( 'Content-Type', 'application/json' );
		$request->set_body( (string) wp_json_encode( $body ) );
		$response = rest_get_server()->dispatch( $request );
		return array( $response->get_status(), $response->get_data() );
	};
	list( , $sws_created ) = $sws_call( 'POST', '/sliders', array( 'title' => $argv[2] ?? 'E2E Block' ) );
	list( $sws_status )    = $sws_call( 'POST', '/sliders/' . $sws_created['id'] . '/publish', array( 'version' => $sws_created['version'] ) );
	echo wp_json_encode( array( 'id' => $sws_created['id'], 'published' => 200 === $sws_status ) ), "\n";
	exit;
}
if ( 'bulk' === $sws_command ) {
	// Many unpublished sliders, to exercise paginated lists.
	$sws_admins = get_users( array( 'role' => 'administrator', 'number' => 1, 'fields' => 'ID' ) );
	wp_set_current_user( (int) ( $sws_admins[0] ?? 0 ) );
	do_action( 'rest_api_init' );
	$sws_count = max( 1, min( 300, (int) ( $argv[3] ?? 1 ) ) );
	for ( $sws_i = 1; $sws_i <= $sws_count; $sws_i++ ) {
		$request = new WP_REST_Request( 'POST', '/sw-sliderman/v1/sliders' );
		$request->set_header( 'Content-Type', 'application/json' );
		$request->set_body( (string) wp_json_encode( array( 'title' => ( $argv[2] ?? 'E2E Block' ) . ' bulk ' . $sws_i ) ) );
		rest_get_server()->dispatch( $request );
	}
	echo wp_json_encode( array( 'created' => $sws_count ) ), "\n";
	exit;
}
if ( 'age' === $sws_command ) {
	// Makes a slider the oldest one, so newest-first lists show it last.
	global $wpdb;
	$wpdb->update( $wpdb->posts, array( 'post_modified' => '2001-01-01 00:00:00', 'post_modified_gmt' => '2001-01-01 00:00:00' ), array( 'ID' => (int) ( $argv[2] ?? 0 ) ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
	clean_post_cache( (int) ( $argv[2] ?? 0 ) );
	echo "{}\n";
	exit;
}
if ( 'cleanup-pages' === $sws_command ) {
	foreach ( get_posts( array( 'post_type' => 'page', 'posts_per_page' => -1, 'post_status' => 'any', 's' => (string) ( $argv[2] ?? 'E2E' ) ) ) as $sws_post ) {
		wp_delete_post( $sws_post->ID, true );
	}
	echo "{}\n";
	exit;
}
if ( 'cleanup' === $sws_command ) {
	foreach ( get_posts( array( 'post_type' => 'sw_slider', 'posts_per_page' => -1, 'post_status' => 'any' ) ) as $sws_post ) {
		if ( str_starts_with( $sws_post->post_title, (string) ( $argv[2] ?? 'E2E' ) ) ) {
			wp_delete_post( $sws_post->ID, true );
		}
	}
	echo "{}\n";
	exit;
}
$sws_admins = get_users( array( 'role' => 'administrator', 'number' => 1, 'fields' => 'ID' ) );
$sws_user   = (int) ( $sws_admins[0] ?? 0 );
$sws_exp    = time() + HOUR_IN_SECONDS;
echo wp_json_encode(
	array(
		'cookies' => array(
			array( 'name' => AUTH_COOKIE, 'value' => wp_generate_auth_cookie( $sws_user, $sws_exp, 'auth' ) ),
			array( 'name' => LOGGED_IN_COOKIE, 'value' => wp_generate_auth_cookie( $sws_user, $sws_exp, 'logged_in' ) ),
		),
		'admin'   => admin_url( 'admin.php?page=sw-sliderman' ),
		'locale'  => get_locale(),
	)
), "\n";

<?php
/**
 * WordPress test suite configuration. Uses ONLY the private throw-away MariaDB instance
 * (bin/test-db.sh) or the CI service, never the development site's database.
 *
 * @package sw-sliderman
 */

define( 'ABSPATH', __DIR__ . '/vendor/johnpbloch/wordpress-core/' );
define( 'WP_DEFAULT_THEME', 'default' );
define( 'WP_DEBUG', true );

define( 'DB_NAME', getenv( 'SWS_WP_TEST_DB_NAME' ) ?: 'sws_wp_tests' );
define( 'DB_USER', getenv( 'SWS_TEST_DB_USER' ) ?: 'sws' );
define( 'DB_PASSWORD', getenv( 'SWS_TEST_DB_PASSWORD' ) ?: 'sws' );
define( 'DB_HOST', ( getenv( 'SWS_TEST_DB_HOST' ) ?: '127.0.0.1' ) . ':' . ( getenv( 'SWS_TEST_DB_PORT' ) ?: '33078' ) );
define( 'DB_CHARSET', 'utf8mb4' );
define( 'DB_COLLATE', '' );

define( 'WP_TESTS_DOMAIN', 'example.org' );
define( 'WP_TESTS_EMAIL', 'admin@example.org' );
define( 'WP_TESTS_TITLE', 'SW Sliderman Tests' );
define( 'WP_PHP_BINARY', 'php' );
define( 'WPLANG', '' );

$table_prefix = 'wptests_'; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited

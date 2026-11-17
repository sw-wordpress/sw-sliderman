<?php
/**
 * Constants defined by the plugin bootstrap, declared for static analysis only.
 *
 * @package sw-sliderman
 */

define( 'SWS_VERSION', '0.0.0' );
define( 'SWS_FILE', __FILE__ );
define( 'SWS_DIR', __DIR__ . '/' );
define( 'SWS_URL', 'https://example.org/' );
define( 'SWS_MIN_PHP', '8.2' );

// WordPress defines the database identity before loading plugins.
// phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- WordPress bootstrap constant, static-analysis stub only.
define( 'DB_NAME', 'sws_static_analysis' );

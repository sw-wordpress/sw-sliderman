<?php
/**
 * Activation, deactivation and versioned upgrades.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Infrastructure;

/**
 * Plugin lifecycle (CODE-STYLE 5).
 *
 * Activation only grants capabilities and records the version; it never connects to font
 * providers or installs anything. Later plugin updates run the same idempotent upgrade routine
 * once, triggered by a cheap version comparison on `init`.
 */
final class Lifecycle {

	public const VERSION_OPTION = 'sws_db_version';

	/** Data/upgrade version, independent of the plugin version. */
	public const DATA_VERSION = 1;

	public static function activate(): void {
		self::upgrade();
	}

	public static function deactivate(): void {
		// No scheduled tasks exist yet; sliders, fonts and revisions are intentionally kept.
	}

	public function register(): void {
		add_action( 'init', array( $this, 'maybe_upgrade' ), 5 );
	}

	public function maybe_upgrade(): void {
		if ( self::DATA_VERSION !== (int) get_option( self::VERSION_OPTION, 0 ) ) {
			self::upgrade();
		}
	}

	private static function upgrade(): void {
		Capabilities::grant_defaults();
		update_option( self::VERSION_OPTION, self::DATA_VERSION, true );
	}
}

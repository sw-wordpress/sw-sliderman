<?php
/**
 * Plugin capabilities.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Infrastructure;

/**
 * Own capabilities for editing, publishing and font management (PLAN.md 13).
 *
 * Granted to administrators on activation/upgrade; site owners may assign them to other roles.
 * Import gets its own capability with M5.
 */
final class Capabilities {

	public const EDIT    = 'sws_edit_sliders';
	public const PUBLISH = 'sws_publish_sliders';
	public const FONTS   = 'sws_manage_fonts';

	public const ALL = array( self::EDIT, self::PUBLISH, self::FONTS );

	/** Grants all plugin capabilities to the administrator role of the current site. */
	public static function grant_defaults(): void {
		$role = get_role( 'administrator' );
		if ( null === $role ) {
			return;
		}
		foreach ( self::ALL as $capability ) {
			$role->add_cap( $capability );
		}
	}

	/**
	 * Plugin capabilities of the current user (UX hint for the editor; the server stays authoritative).
	 *
	 * @return list<string>
	 */
	public static function current_user_caps(): array {
		return array_values( array_filter( self::ALL, static fn ( string $capability ): bool => current_user_can( $capability ) ) );
	}
}

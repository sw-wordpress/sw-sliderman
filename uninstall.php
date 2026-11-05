<?php
/**
 * Uninstall entry point.
 *
 * Slider data, revisions and installed fonts are kept unless the site owner explicitly opted in
 * to deletion (PLAN.md 13). The opt-in and the deletion routine are part of M6.03; until then
 * uninstall only removes the plugin's capability grants and version marker.
 *
 * @package sw-sliderman
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

foreach ( wp_roles()->role_objects as $sws_role ) {
	foreach ( array( 'sws_edit_sliders', 'sws_publish_sliders', 'sws_manage_fonts' ) as $sws_capability ) {
		$sws_role->remove_cap( $sws_capability );
	}
}
delete_option( 'sws_db_version' );
delete_option( 'sws_artifact_unreferenced' );

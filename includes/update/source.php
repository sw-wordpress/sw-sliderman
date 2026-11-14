<?php
/**
 * Local trust and storage configuration; never populated from release metadata.
 * Copies in other plugins change this file and descriptors.php, with their own class prefix.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

return array(
	'repository'    => 'sw-wordpress/sw-sliderman',
	'repository_id' => 1438174384,
	'allowed_slugs' => array( 'sw-sliderman' ),
	'main_slug'     => 'sw-sliderman',
	'state_key'     => 'sws_verified_github_updates_v1',
	'lock_key'      => 'sws_verified_github_updates_lock_v1',
);

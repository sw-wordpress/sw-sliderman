<?php
/**
 * Dependencies and version of the block editor script (the plugin version, no timestamps).
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

return array(
	'dependencies' => array( 'wp-api-fetch', 'wp-block-editor', 'wp-blocks', 'wp-components', 'wp-element', 'wp-i18n' ),
	'version'      => defined( 'SWS_VERSION' ) ? SWS_VERSION : '0',
);

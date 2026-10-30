<?php
/**
 * Serializes font reference writes and deletion.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Infrastructure;

use SW\Slider\Application\RepositoryBusy;
use wpdb;

/** Downloads stay outside this short site-wide guard; only references and deletion enter it. */
final class ResourceGuard {
	/**
	 * @template T
	 * @param callable(): T $operation Reference mutation or deletion.
	 * @return T
	 */
	public static function run( wpdb $db, callable $operation ): mixed {
		$name = 'sws_resources_' . get_current_blog_id() . '_' . substr( md5( $db->prefix ), 0, 8 );
		$lock = $db->get_var( $db->prepare( 'SELECT GET_LOCK(%s,5)', $name ) );
		if ( '1' !== (string) $lock ) {
			throw new RepositoryBusy( 'Resources are locked by another write.' );
		}
		try {
			return $operation();
		} finally {
			$db->get_var( $db->prepare( 'SELECT RELEASE_LOCK(%s)', $name ) );
		}
	}
}

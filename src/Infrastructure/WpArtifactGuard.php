<?php
/**
 * Site-wide artifact guard on a database named lock.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Infrastructure;

use Closure;
use SW\Slider\Application\ArtifactGuard;
use SW\Slider\Application\RepositoryBusy;
use wpdb;

/**
 * `GET_LOCK` is atomic and owned by the database connection, so it excludes other PHP processes
 * and is released with the connection even after a crash. It is held only for the short interval
 * from storing an artifact to activating its snapshot, and for one cleanup pass.
 */
final class WpArtifactGuard implements ArtifactGuard {

	public function __construct( private readonly wpdb $db, private readonly int $timeout_seconds = 5 ) {
	}

	/**
	 * @template T
	 *
	 * @param Closure(): T $operation Guarded operation.
	 *
	 * @return T
	 */
	public function run( Closure $operation ): mixed {
		$name = 'sws_artifacts_' . get_current_blog_id() . '_' . substr( md5( $this->db->prefix ), 0, 8 );
		$lock = $this->db->get_var( $this->db->prepare( 'SELECT GET_LOCK(%s,%d)', $name, $this->timeout_seconds ) );
		if ( '1' !== (string) $lock ) {
			throw new RepositoryBusy( 'Artifacts are locked by another publication or cleanup.' );
		}
		try {
			return $operation();
		} finally {
			$this->db->get_var( $this->db->prepare( 'SELECT RELEASE_LOCK(%s)', $name ) );
		}
	}
}

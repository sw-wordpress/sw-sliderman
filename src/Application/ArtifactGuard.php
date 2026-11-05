<?php
/**
 * Artifact publication/cleanup coordination port.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Application;

use Closure;

/**
 * Mutual exclusion between publishing (artifact stored or reused until the snapshot is active) and
 * artifact cleanup (references read until files are deleted). Without it, a cleanup could delete a
 * stylesheet that a concurrent publication just reused and activated.
 */
interface ArtifactGuard {

	/**
	 * @template T
	 *
	 * @param Closure(): T $operation Runs while no cleanup/publication of another process is inside the guard.
	 *
	 * @return T Result of the operation.
	 *
	 * @throws RepositoryBusy When the guard cannot be acquired in time.
	 */
	public function run( Closure $operation ): mixed;
}

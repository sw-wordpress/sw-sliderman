<?php
/**
 * Durable storage failed without changing the active publication.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Application;

use RuntimeException;

/** Infrastructure failure, distinct from a competing request holding the write lock. */
final class StorageFailure extends RuntimeException {
}

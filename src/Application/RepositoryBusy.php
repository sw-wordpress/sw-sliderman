<?php
/**
 * RepositoryBusy exception.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Application;

use RuntimeException;

/**
 * Another save of the same slider is in progress.
 */
final class RepositoryBusy extends RuntimeException {
}

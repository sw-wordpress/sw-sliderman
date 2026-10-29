<?php
/**
 * SliderNotFound exception.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Application;

use RuntimeException;

/**
 * The slider does not exist or is not accessible.
 */
final class SliderNotFound extends RuntimeException {
}

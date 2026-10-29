<?php
/**
 * Font installation failure.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Fonts;

use RuntimeException;

/**
 * A font operation was rejected or failed; `error_code` is a stable machine-readable value.
 */
final class FontError extends RuntimeException {

	public function __construct( public readonly string $error_code, string $message = '' ) {
		parent::__construct( '' === $message ? $error_code : $message );
	}
}

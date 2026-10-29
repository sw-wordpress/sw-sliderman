<?php
/**
 * Version conflict exception.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Application;

use RuntimeException;

/**
 * The expected draft version is outdated; nothing was written (HTTP 409).
 */
final class VersionConflict extends RuntimeException {

	public function __construct( public readonly int $current_version ) {
		parent::__construct( 'Version conflict.' );
	}
}

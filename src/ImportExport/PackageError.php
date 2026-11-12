<?php
/**
 * Package rejection.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\ImportExport;

use RuntimeException;

/**
 * An export or import package was rejected or could not be processed. `error_code` is a stable
 * machine-readable value (mapped to a translated message at the REST boundary); `detail` is a short
 * technical hint such as the offending entry name and never contains file contents.
 */
final class PackageError extends RuntimeException {

	public function __construct( public readonly string $error_code, public readonly string $detail = '' ) {
		parent::__construct( '' === $detail ? $error_code : $error_code . ': ' . $detail );
	}
}

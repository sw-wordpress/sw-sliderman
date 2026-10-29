<?php
/**
 * Invalid document exception.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Application;

use RuntimeException;
use SW\Slider\Domain\ValidationIssue;

/**
 * The document violates the schema or references missing resources (HTTP 422).
 */
final class InvalidDocument extends RuntimeException {

	/**
	 * @param list<ValidationIssue> $issues Issues with JSON pointer paths.
	 */
	public function __construct( public readonly array $issues ) {
		parent::__construct( 'Invalid slider document.' );
	}
}

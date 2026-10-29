<?php
/**
 * Resource availability port.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Application;

use SW\Slider\Domain\ValidationIssue;

/**
 * Checks that media attachments and font variants referenced by a document exist locally.
 */
interface ResourceChecker {

	/**
	 * @param array<string, mixed> $document Validated document (associative arrays).
	 * @return list<ValidationIssue> One `missing_resource` issue per missing reference.
	 */
	public function missing_resources( array $document ): array;
}

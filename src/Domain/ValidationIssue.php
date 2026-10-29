<?php
/**
 * A single document validation issue.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Domain;

/**
 * One rule violation: JSON pointer of the offending value and a stable machine-readable code.
 *
 * Codes and paths are part of the contract with assets/shared/validate.ts.
 */
final class ValidationIssue {

	/**
	 * @param string $path JSON pointer, e.g. `/slides/0/layers/2/layout/x`; empty for the root.
	 * @param string $code Stable issue code, e.g. `range` or `duplicate_id`.
	 */
	public function __construct(
		public readonly string $path,
		public readonly string $code
	) {
	}

	/**
	 * @return array{path: string, code: string}
	 */
	public function to_array(): array {
		return array(
			'path' => $this->path,
			'code' => $this->code,
		);
	}
}

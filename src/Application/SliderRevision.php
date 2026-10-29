<?php
/**
 * Immutable revision value object.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Application;

/** Immutable historical draft; never a publication. */
final class SliderRevision {
	public function __construct(
		public readonly int $id,
		public readonly string $title,
		public readonly string $document_json,
		public readonly string $modified_gmt,
		public readonly bool $autosave
	) {}
}

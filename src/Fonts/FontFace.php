<?php
/**
 * One parsed remote font face.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Fonts;

/**
 * A single `@font-face` rule of a provider response, reduced to the allowed descriptors.
 */
final class FontFace {

	public function __construct(
		public readonly string $subset,
		public readonly string $family,
		public readonly string $style,
		public readonly int $weight,
		public readonly string $unicode_range,
		public readonly string $url
	) {
	}
}

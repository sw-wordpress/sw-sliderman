<?php
/**
 * Registered GPU effect type.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Domain;

use stdClass;

/**
 * What the document layer needs to know about an effect type: its parameter schema version and
 * schema (validated with {@see EffectSchema}) and whether it moves continuously (pause switch).
 */
final class EffectDescriptor {

	public function __construct(
		public readonly string $type,
		public readonly int $schema_version,
		public readonly bool $continuous,
		public readonly stdClass $schema
	) {
	}
}

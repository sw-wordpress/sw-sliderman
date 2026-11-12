<?php
/**
 * Effect catalog backed by tests/fixtures/documents/effect-catalog.json.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Tests\Support;

use stdClass;
use SW\Slider\Domain\EffectCatalog;
use SW\Slider\Domain\EffectDescriptor;

/** Same catalog as `effectCatalog()` in tests/unit/fixtures.ts. */
final class FixtureCatalog implements EffectCatalog {

	public function find( string $type ): ?EffectDescriptor {
		$catalog = Fixtures::object( 'documents/effect-catalog.json' );
		if ( 'description' === $type || ! $catalog instanceof stdClass || ! property_exists( $catalog, $type ) ) {
			return null;
		}
		$entry = $catalog->$type;
		return new EffectDescriptor( $type, (int) $entry->schemaVersion, (bool) $entry->continuous, $entry->schema );
	}
}

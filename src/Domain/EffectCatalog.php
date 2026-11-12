<?php
/**
 * Effect type lookup port.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Domain;

/**
 * Lets the document validator check effect parameters against the registered schema without
 * knowing where effects come from (built-in modules or add-on plugins).
 */
interface EffectCatalog {

	/** The descriptor of an effect type, or null when no (active) module provides it. */
	public function find( string $type ): ?EffectDescriptor;
}

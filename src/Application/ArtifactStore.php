<?php
/**
 * Published artifact storage port.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Application;

/**
 * Immutable, content-addressed storage for published stylesheets.
 */
interface ArtifactStore {

	/**
	 * Stores a stylesheet under a content-derived name; existing files are never rewritten.
	 *
	 * @return string|null Relative path, or null when the store is not writable (the renderer then
	 *                     recalculates the CSS on output).
	 */
	public function store_stylesheet( string $name, string $css ): ?string;
}

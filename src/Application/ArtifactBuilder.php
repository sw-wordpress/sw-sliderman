<?php
/**
 * Artifact building port.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Application;

/**
 * Builds the published output artifacts of a validated document.
 */
interface ArtifactBuilder {

	/** Version of the renderer contract; a change invalidates stored artifacts. */
	public function renderer_version(): int;

	/**
	 * @param array<string, mixed> $document Validated document (associative arrays).
	 * @param string               $scope    Scope suffix derived from the document hash.
	 */
	public function build_stylesheet( array $document, string $scope ): string;
}

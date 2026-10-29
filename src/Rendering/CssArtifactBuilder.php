<?php
/**
 * Stylesheet artifact builder.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Rendering;

use SW\Slider\Application\ArtifactBuilder;

final class CssArtifactBuilder implements ArtifactBuilder {

	/** Increment when generated markup or CSS changes incompatibly. */
	public const RENDERER_VERSION = 1;

	public function renderer_version(): int {
		return self::RENDERER_VERSION;
	}

	public function build_stylesheet( array $document, string $scope ): string {
		return StyleSerializer::document_css( $document, $scope );
	}
}

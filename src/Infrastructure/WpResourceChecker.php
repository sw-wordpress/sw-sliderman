<?php
/**
 * Resource availability in WordPress.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Infrastructure;

use SW\Slider\Application\ResourceChecker;
use SW\Slider\Domain\ValidationIssue;
use SW\Slider\Fonts\FontRepository;
use SW\Slider\Fonts\FontStorage;

/**
 * Publishing requires every referenced image attachment and font variant to exist locally
 * (PLAN.md 4.3, 8.4: a new missing resource rejects the publication).
 */
final class WpResourceChecker implements ResourceChecker {

	public function __construct(
		private readonly FontRepository $fonts,
		private readonly FontStorage $font_storage
	) {
	}

	public function missing_resources( array $document ): array {
		$issues = array();
		foreach ( $document['fontRefs'] as $index => $ref ) {
			if ( ! $this->has_font_variant( (string) $ref['installationId'], (int) $ref['weight'], (string) $ref['style'] ) ) {
				$issues[] = new ValidationIssue( '/fontRefs/' . $index, 'missing_resource' );
			}
		}
		foreach ( $document['slides'] as $slide_index => $slide ) {
			$background = $slide['background']['attachmentId'];
			if ( is_int( $background ) && ! wp_attachment_is_image( $background ) ) {
				$issues[] = new ValidationIssue( '/slides/' . $slide_index . '/background/attachmentId', 'missing_resource' );
			}
			foreach ( $slide['layers'] as $layer_index => $layer ) {
				if ( 'image' !== $layer['type'] ) {
					continue;
				}
				$attachment = $layer['content']['attachmentId'];
				if ( ! is_int( $attachment ) || ! wp_attachment_is_image( $attachment ) ) {
					$issues[] = new ValidationIssue( '/slides/' . $slide_index . '/layers/' . $layer_index . '/content/attachmentId', 'missing_resource' );
				}
			}
		}
		return $issues;
	}

	private function has_font_variant( string $installation_id, int $weight, string $style ): bool {
		$installation = $this->fonts->find( $installation_id );
		if ( null === $installation || ! $this->font_storage->exists( $installation['directory'] ) ) {
			return false;
		}
		foreach ( $installation['variants'] as $variant ) {
			if ( $variant['weight'] === $weight && $variant['style'] === $style ) {
				return true;
			}
		}
		return false;
	}
}

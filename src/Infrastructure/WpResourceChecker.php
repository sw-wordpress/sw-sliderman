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
			if ( is_int( $background ) && ! $this->has_image( $background ) ) {
				$issues[] = new ValidationIssue( '/slides/' . $slide_index . '/background/attachmentId', 'missing_resource' );
			}
			foreach ( $slide['layers'] as $layer_index => $layer ) {
				if ( 'effect' === $layer['type'] ) {
					foreach ( $this->effect_attachments( $layer['content'] ) as $path => $attachment ) {
						if ( ! $this->has_image( $attachment ) ) {
							$issues[] = new ValidationIssue( '/slides/' . $slide_index . '/layers/' . $layer_index . '/content/' . $path, 'missing_resource' );
						}
					}
					continue;
				}
				if ( 'image' !== $layer['type'] ) {
					continue;
				}
				$attachment = $layer['content']['attachmentId'];
				if ( ! is_int( $attachment ) || ! $this->has_image( $attachment ) ) {
					$issues[] = new ValidationIssue( '/slides/' . $slide_index . '/layers/' . $layer_index . '/content/attachmentId', 'missing_resource' );
				}
			}
		}
		return $issues;
	}

	/**
	 * Attachment ids an effect layer references (fallback image and named assets), keyed by JSON path.
	 *
	 * @param array<string, mixed> $content Effect layer content.
	 * @return array<string, int>
	 */
	private function effect_attachments( array $content ): array {
		$found = array();
		if ( isset( $content['fallbackImageId'] ) && is_int( $content['fallbackImageId'] ) ) {
			$found['fallbackImageId'] = $content['fallbackImageId'];
		}
		if ( isset( $content['assets'] ) && is_array( $content['assets'] ) ) {
			foreach ( $content['assets'] as $key => $id ) {
				if ( is_int( $id ) ) {
					$found[ 'assets/' . $key ] = $id;
				}
			}
		}
		return $found;
	}

	private function has_image( int $id ): bool {
		$file = get_attached_file( $id );
		return wp_attachment_is_image( $id ) && current_user_can( 'read_post', $id ) && is_string( $file ) && is_file( $file ) && is_readable( $file );
	}

	private function has_font_variant( string $installation_id, int $weight, string $style ): bool {
		$installation = $this->fonts->find( $installation_id );
		if ( null === $installation || ! $this->font_storage->exists( $installation['directory'] ) ) {
			return false;
		}
		if ( ! $this->font_storage->verify_file( $installation['directory'], 'font.css', hash( 'sha256', \SW\Slider\Fonts\LocalFontCss::build( 'sws-' . $installation_id, $installation['variants'] ) ) ) ) {
			return false; }
		foreach ( $installation['variants'] as $variant ) {
			if ( $variant['weight'] === $weight && $variant['style'] === $style ) {
				if ( array() === $variant['files'] ) {
					return false; }
				foreach ( $variant['files'] as $file ) {
					if ( ! $this->font_storage->verify_file( $installation['directory'], $file['file'], $file['sha256'] ) ) {
						return false; }
				}
				$directory = UploadPaths::path( $installation['directory'] );
				$license   = null === $directory ? null : $directory . '/LICENSE.txt';
				return null !== $license && is_file( $license ) && is_readable( $license );
			}
		}
		return false;
	}
}

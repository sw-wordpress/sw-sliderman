<?php
/**
 * Published slider state.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Application;

/**
 * Immutable published artifact reference (PLAN.md 9.1).
 *
 * The snapshot keeps its own copy of the document, so later draft saves never change the live
 * output. The stylesheet is a cache keyed by document hash and renderer version; when it is
 * missing the renderer recalculates the CSS.
 */
final class PublishedSnapshot {

	/**
	 * @param int          $version          Draft version that was published.
	 * @param string       $document_hash    SHA-256 of the canonical document JSON.
	 * @param int          $renderer_version Renderer version that built the artifact.
	 * @param string       $published_gmt    Publication time, `Y-m-d H:i:s` UTC.
	 * @param string       $document_json    Canonical published document.
	 * @param string|null  $stylesheet       Artifact path relative to the artifact root, if stored.
	 * @param list<string> $font_installations Font installation IDs referenced by the document.
	 */
	public function __construct(
		public readonly int $version,
		public readonly string $document_hash,
		public readonly int $renderer_version,
		public readonly string $published_gmt,
		public readonly string $document_json,
		public readonly ?string $stylesheet,
		public readonly array $font_installations
	) {
	}

	/**
	 * @return array<string, mixed>
	 */
	public function to_array(): array {
		return array(
			'version'           => $this->version,
			'documentHash'      => $this->document_hash,
			'rendererVersion'   => $this->renderer_version,
			'publishedGmt'      => $this->published_gmt,
			'document'          => $this->document_json,
			'stylesheet'        => $this->stylesheet,
			'fontInstallations' => $this->font_installations,
		);
	}

	/**
	 * Restores a snapshot from its stored form; returns null for malformed data.
	 *
	 * @param mixed $data Stored array.
	 */
	public static function from_array( mixed $data ): ?self {
		if ( ! is_array( $data ) || ! isset( $data['version'], $data['documentHash'], $data['rendererVersion'], $data['publishedGmt'], $data['document'] ) ) {
			return null;
		}
		$fonts = is_array( $data['fontInstallations'] ?? null ) ? array_values( array_filter( $data['fontInstallations'], 'is_string' ) ) : array();
		return new self(
			(int) $data['version'],
			(string) $data['documentHash'],
			(int) $data['rendererVersion'],
			(string) $data['publishedGmt'],
			(string) $data['document'],
			is_string( $data['stylesheet'] ?? null ) ? $data['stylesheet'] : null,
			$fonts
		);
	}
}

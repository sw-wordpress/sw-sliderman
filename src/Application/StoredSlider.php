<?php
/**
 * Persisted slider state.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Application;

/**
 * Draft document with its version and, if any, the active published snapshot.
 */
final class StoredSlider {

	/**
	 * @param int                    $id            WordPress post ID (not the document UUID).
	 * @param string                 $title         Plain text title.
	 * @param string                 $document_json Canonical draft JSON.
	 * @param int                    $version       Draft version, incremented by every save.
	 * @param string                 $modified_gmt  Last modification, `Y-m-d H:i:s` UTC.
	 * @param PublishedSnapshot|null $published     Active published state.
	 */
	public function __construct(
		public readonly int $id,
		public readonly string $title,
		public readonly string $document_json,
		public readonly int $version,
		public readonly string $modified_gmt,
		public readonly ?PublishedSnapshot $published
	) {
	}

	/** Publication state shown in the slider list (PLAN.md 4.1). */
	public function status(): string {
		if ( null === $this->published ) {
			return 'unpublished';
		}
		return $this->published->version === $this->version ? 'published' : 'changed';
	}
}

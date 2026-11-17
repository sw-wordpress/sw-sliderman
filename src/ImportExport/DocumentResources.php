<?php
/** Package resource references in the validated document model.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\ImportExport;

use stdClass;

final class DocumentResources {
	/** @return list<int> */
	public static function media_ids( stdClass $document ): array {
		$ids = array();
		self::map_media(
			$document,
			static function ( int $id ) use ( &$ids ): int {
				$ids[ $id ] = $id;
				return $id;
			}
		);
		return array_values( $ids );
	}

	/** Only resource fields; numeric effect parameters and navigation links are untouched.
	 *
	 * @param \Closure(int):int $map Maps a source attachment ID to a local ID.
	 */
	public static function map_media( stdClass $document, \Closure $map ): void {
		foreach ( $document->slides as $slide ) {
			if ( is_int( $slide->background->attachmentId ) ) {
				$slide->background->attachmentId = $map( $slide->background->attachmentId );
			}
			foreach ( $slide->layers as $layer ) {
				if ( 'image' === $layer->type ) {
					$layer->content->attachmentId = $map( $layer->content->attachmentId );
				}
				if ( 'effect' === $layer->type ) {
					if ( is_int( $layer->content->fallbackImageId ) ) {
						$layer->content->fallbackImageId = $map( $layer->content->fallbackImageId );
					}
					foreach ( $layer->content->assets as $key => $id ) {
						$layer->content->assets->$key = $map( $id );
					}
				}
			}
		}
	}
}

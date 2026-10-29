<?php
/**
 * Keeps generic WordPress write paths out of the internal slider document store.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Infrastructure;

/** Only repository operations may write slider parents; revisions remain WordPress-managed. */
final class SliderWriteScope {

	private static int $depth = 0;

	public function register(): void {
		add_filter( 'wp_insert_post_empty_content', array( $this, 'reject_generic_write' ), 10, 2 );
	}

	/**
	 * @param array<string, mixed> $postarr Pending WordPress write.
	 */
	public function reject_generic_write( bool $is_empty, array $postarr ): bool {
		return $is_empty || ( 0 === self::$depth && PostTypes::SLIDER === ( $postarr['post_type'] ?? '' ) );
	}

	/**
	 * @template T
	 * @param callable(): T $operation Authorized repository operation.
	 * @return T
	 */
	public static function run( callable $operation ): mixed {
		++self::$depth;
		try {
			return $operation();
		} finally {
			--self::$depth;
		}
	}
}

<?php
/**
 * WordPress persistence of sliders.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Infrastructure;

use SW\Slider\Application\PublishedSnapshot;
use SW\Slider\Application\RepositoryBusy;
use SW\Slider\Application\SliderRepository;
use SW\Slider\Application\StoredSlider;
use SW\Slider\Application\VersionConflict;
use WP_Post;
use wpdb;

/**
 * Stores the canonical draft JSON in `post_content` of the `sw_slider` post type (revisions
 * included), the draft version in `_sws_version` and the active snapshot in `_sws_published`.
 *
 * Concurrency (ADR docs/adr/0001-write-serialization.md): every write runs under a database
 * named lock per slider (`GET_LOCK`). The lock is atomic, owned by the DB connection and
 * released automatically when the request dies, so no stale lock survives a crash. Inside the
 * lock the version is read without object cache, compared, the content written and only then the
 * version incremented, so a reader can never pair new content with an old version that would let
 * a later save pass the check.
 */
final class WpSliderRepository implements SliderRepository {

	private const VERSION_KEY   = '_sws_version';
	private const PUBLISHED_KEY = '_sws_published';
	private const LOCK_TIMEOUT  = 5;

	public function __construct( private readonly wpdb $db ) {
	}

	public function find( int $id ): ?StoredSlider {
		$post = get_post( $id );
		if ( ! $post instanceof WP_Post || PostTypes::SLIDER !== $post->post_type || 'trash' === $post->post_status ) {
			return null;
		}
		return $this->to_stored( $post );
	}

	public function create( string $title, string $document_json ): int {
		$id = wp_insert_post(
			wp_slash(
				array(
					'post_type'    => PostTypes::SLIDER,
					'post_status'  => 'publish',
					'post_title'   => $title,
					'post_content' => $document_json,
				)
			),
			true
		);
		if ( is_wp_error( $id ) ) {
			throw new RepositoryBusy( $id->get_error_message() );
		}
		add_post_meta( $id, self::VERSION_KEY, '1', true );
		return $id;
	}

	public function save_draft( int $id, string $title, string $document_json, int $expected_version ): int {
		return $this->locked(
			$id,
			function () use ( $id, $title, $document_json, $expected_version ): int {
				$current = $this->current_version( $id );
				if ( $current !== $expected_version ) {
					throw new VersionConflict( $current );
				}
				$result = wp_update_post(
					wp_slash(
						array(
							'ID'           => $id,
							'post_title'   => $title,
							'post_content' => $document_json,
						)
					),
					true
				);
				if ( is_wp_error( $result ) ) {
					throw new RepositoryBusy( $result->get_error_message() );
				}
				$next = $current + 1;
				update_post_meta( $id, self::VERSION_KEY, (string) $next );
				return $next;
			}
		);
	}

	public function activate_snapshot( int $id, int $expected_version, PublishedSnapshot $snapshot ): void {
		$this->locked(
			$id,
			function () use ( $id, $expected_version, $snapshot ): int {
				$current = $this->current_version( $id );
				if ( $current !== $expected_version ) {
					throw new VersionConflict( $current );
				}
				// Metadata APIs expect slashed input; the snapshot is stored as JSON text.
				update_post_meta( $id, self::PUBLISHED_KEY, wp_slash( (string) wp_json_encode( $snapshot->to_array(), JSON_UNESCAPED_SLASHES ) ) );
				return $current;
			}
		);
	}

	public function list_sliders( int $page, int $per_page, string $search ): array {
		$query = new \WP_Query(
			array(
				'post_type'      => PostTypes::SLIDER,
				'post_status'    => 'publish',
				'posts_per_page' => $per_page,
				'paged'          => $page,
				's'              => $search,
				'orderby'        => 'modified',
				'order'          => 'DESC',
				'no_found_rows'  => false,
			)
		);
		$items = array();
		foreach ( $query->posts ?? array() as $post ) {
			if ( $post instanceof WP_Post ) {
				$items[] = $this->to_stored( $post );
			}
		}
		return array(
			'items' => $items,
			'total' => (int) $query->found_posts,
		);
	}

	public function all_documents(): iterable {
		$ids = get_posts(
			array(
				'post_type'      => PostTypes::SLIDER,
				'post_status'    => array( 'publish', 'trash' ),
				'posts_per_page' => -1,
				'fields'         => 'ids',
			)
		);
		foreach ( $ids as $id ) {
			$post = get_post( $id );
			if ( ! $post instanceof WP_Post ) {
				continue;
			}
			yield $post->post_content;
			$published = $this->published( $id );
			if ( null !== $published ) {
				yield $published->document_json;
			}
			foreach ( wp_get_post_revisions( $id ) as $revision ) {
				if ( $revision instanceof WP_Post ) {
					yield $revision->post_content;
				}
			}
		}
	}

	public function trash( int $id ): bool {
		return null !== wp_trash_post( $id );
	}

	private function to_stored( WP_Post $post ): StoredSlider {
		return new StoredSlider(
			(int) $post->ID,
			$post->post_title,
			$post->post_content,
			max( 1, (int) get_post_meta( $post->ID, self::VERSION_KEY, true ) ),
			$post->post_modified_gmt,
			$this->published( (int) $post->ID )
		);
	}

	private function published( int $id ): ?PublishedSnapshot {
		$raw = get_post_meta( $id, self::PUBLISHED_KEY, true );
		if ( ! is_string( $raw ) || '' === $raw ) {
			return null;
		}
		return PublishedSnapshot::from_array( json_decode( $raw, true ) );
	}

	/** Version read directly from the database, bypassing a possibly stale object cache. */
	private function current_version( int $id ): int {
		$value = $this->db->get_var(
			$this->db->prepare( 'SELECT meta_value FROM %i WHERE post_id = %d AND meta_key = %s LIMIT 1', $this->db->postmeta, $id, self::VERSION_KEY )
		);
		return max( 1, (int) $value );
	}

	/**
	 * Runs `$operation` while holding the named lock of the slider.
	 *
	 * @param callable(): int $operation Write operation.
	 * @throws RepositoryBusy When the lock cannot be acquired.
	 */
	private function locked( int $id, callable $operation ): int {
		$name     = 'sws_slider_' . get_current_blog_id() . '_' . $id . '_' . substr( md5( $this->db->prefix ), 0, 8 );
		$acquired = $this->db->get_var( $this->db->prepare( 'SELECT GET_LOCK(%s, %d)', $name, self::LOCK_TIMEOUT ) );
		if ( '1' !== (string) $acquired ) {
			throw new RepositoryBusy( 'Slider is locked by another save.' );
		}
		try {
			return $operation();
		} finally {
			$this->db->query( (string) $this->db->prepare( 'SELECT RELEASE_LOCK(%s)', $name ) );
			wp_cache_delete( $id, 'post_meta' );
			clean_post_cache( $id );
		}
	}
}

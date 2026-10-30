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
use SW\Slider\Application\StorageFailure;
use SW\Slider\Application\SliderRepository;
use SW\Slider\Application\StoredSlider;
use SW\Slider\Application\SliderRevision;
use SW\Slider\Application\SliderNotFound;
use Throwable;
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
 * version incremented inside one transaction. Reads pair content and version in one SQL statement.
 */
final class WpSliderRepository implements SliderRepository {

	private const VERSION_KEY   = '_sws_version';
	private const PUBLISHED_KEY = '_sws_published';
	private const LOCK_TIMEOUT  = 5;
	private bool $transactional = false;

	public function __construct( private readonly wpdb $db ) {
	}

	public function find( int $id ): ?StoredSlider {
		// One SQL statement pairs content, version and publication from the same DB snapshot.
		$row = $this->db->get_row(
			$this->db->prepare(
				"SELECT p.*, (SELECT meta_value FROM %i WHERE post_id=p.ID AND meta_key=%s LIMIT 1) AS sws_version,
            (SELECT meta_value FROM %i WHERE post_id=p.ID AND meta_key=%s LIMIT 1) AS sws_published
            FROM %i p WHERE p.ID=%d AND p.post_type=%s AND p.post_status<>'trash'",
				$this->db->postmeta,
				self::VERSION_KEY,
				$this->db->postmeta,
				self::PUBLISHED_KEY,
				$this->db->posts,
				$id,
				PostTypes::SLIDER
			),
			ARRAY_A
		);
		if ( ! is_array( $row ) ) {
			return null;
		}
		return new StoredSlider(
			$id,
			(string) $row['post_title'],
			(string) $row['post_content'],
			max( 1, (int) $row['sws_version'] ),
			(string) $row['post_modified_gmt'],
			PublishedSnapshot::from_array( json_decode( (string) $row['sws_published'], true ) )
		);
	}

	public function create( string $title, string $document_json ): int {
		return SliderWriteScope::run(
			function () use ( $title, $document_json ): int {
				$this->require_transactions();
				if ( false === $this->db->query( 'START TRANSACTION' ) ) {
					throw new StorageFailure( 'Could not start transaction.' );
				}
				$id = 0;
				try {
					$result = wp_insert_post(
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
					if ( is_wp_error( $result ) ) {
						throw new StorageFailure( $result->get_error_message() );
					}
					$id = $result;
					if ( false === add_post_meta( $id, self::VERSION_KEY, '1', true ) ) {
						throw new StorageFailure( 'Could not initialize version.' );
					}
					if ( false === $this->db->query( 'COMMIT' ) ) {
						throw new StorageFailure( 'Could not commit transaction.' );
					}
					return $id;
				} catch ( Throwable $error ) {
					$this->db->query( 'ROLLBACK' );
					if ( $id > 0 ) {
						clean_post_cache( $id );
					}
					throw $error;
				}
			}
		);
	}

	public function save_draft( int $id, string $title, string $document_json, int $expected_version ): int {
		return $this->locked(
			$id,
			function () use ( $id, $title, $document_json, $expected_version ): int {
				$current = $this->current_version( $id );
				if ( $current !== $expected_version ) {
					throw new VersionConflict( $current );
				}
				// Preserve the exact source before any replacement (including future migrations).
				$this->backup( $id );
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
					throw new StorageFailure( $result->get_error_message() );
				}
				$next = $current + 1;
				if ( false === update_post_meta( $id, self::VERSION_KEY, (string) $next ) ) {
					throw new StorageFailure( 'Could not persist draft version.' );
				}
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
				$encoded = (string) wp_json_encode( $snapshot->to_array(), JSON_UNESCAPED_SLASHES );
				if ( get_post_meta( $id, self::PUBLISHED_KEY, true ) !== $encoded && false === update_post_meta( $id, self::PUBLISHED_KEY, wp_slash( $encoded ) ) ) {
					throw new StorageFailure( 'Could not activate published snapshot.' );
				}
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
				$stored = $this->find( (int) $post->ID );
				if ( null !== $stored ) {
					$items[] = $stored;
				}
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

	public function revisions( int $id ): array {
		$items = array();
		foreach ( wp_get_post_revisions( $id, array( 'posts_per_page' => 100 ) ) as $revision ) {
			if ( ! $revision instanceof WP_Post ) {
				continue;
			}
			$items[] = new SliderRevision( (int) $revision->ID, $revision->post_title, $revision->post_content, $revision->post_modified_gmt, is_int( wp_is_post_autosave( $revision ) ) );
		}
		return $items;
	}

	public function revision( int $id, int $revision_id ): ?SliderRevision {
		$post = wp_get_post_revision( $revision_id );
		if ( ! $post instanceof WP_Post || $id !== (int) $post->post_parent ) {
			return null;
		}
		return new SliderRevision( (int) $post->ID, $post->post_title, $post->post_content, $post->post_modified_gmt, is_int( wp_is_post_autosave( $post ) ) );
	}

	public function autosave( int $id, string $title, string $document_json, int $expected_version ): int {
		return $this->locked(
			$id,
			function () use ( $id, $title, $document_json, $expected_version ): int {
				$current = $this->current_version( $id );
				if ( $current !== $expected_version ) {
					throw new VersionConflict( $current );
				}
				require_once ABSPATH . 'wp-admin/includes/post.php';
				$source = get_post( $id, ARRAY_A );
				if ( ! is_array( $source ) ) {
					throw new SliderNotFound( 'Slider not found.' ); }
				$source['post_ID']      = $id;
				$source['post_title']   = $title;
				$source['post_content'] = $document_json;
				$revision               = wp_create_post_autosave( wp_slash( $source ) );

				if ( is_wp_error( $revision ) || ! $revision ) {
					throw new StorageFailure( 'Could not autosave.' );
				}
				return $revision;
			}
		);
	}

	private function backup( int $id ): void {
		$post = get_post( $id, ARRAY_A );
		if ( ! is_array( $post ) ) {
			throw new SliderNotFound( 'Slider not found.' );
		}
		$revision = _wp_put_post_revision( $post );
		if ( is_wp_error( $revision ) || ! $revision ) {
			throw new StorageFailure( 'Could not back up draft.' );
		}
	}

	public function trash( int $id ): bool {
		return 1 === $this->locked(
			$id,
			static function () use ( $id ): int {
				if ( ! wp_trash_post( $id ) instanceof WP_Post ) {
					throw new StorageFailure( 'Could not move slider to trash.' );
				}
				return 1;
			}
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

	private function require_transactions(): void {
		if ( ! $this->transactional ) {
				$count = $this->db->get_var(
					$this->db->prepare(
						"SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (%s,%s) AND ENGINE='InnoDB'",
						$this->db->posts,
						$this->db->postmeta
					)
				);
			if ( '2' !== (string) $count ) {
				throw new StorageFailure( 'Transactional posts and postmeta tables are required.' );
			}
				$this->transactional = true;
		}
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
			$this->require_transactions();
			clean_post_cache( $id );
			if ( null === $this->find( $id ) ) {
				throw new SliderNotFound( 'Slider not found.' );
			}
			if ( false === $this->db->query( 'START TRANSACTION' ) ) {
				throw new StorageFailure( 'Could not start transaction.' );
			}
			try {
				$result = SliderWriteScope::run( $operation );
				if ( false === $this->db->query( 'COMMIT' ) ) {
					throw new StorageFailure( 'Could not commit transaction.' );
				}
				return $result;
			} catch ( Throwable $error ) {
				$this->db->query( 'ROLLBACK' );
				throw $error;
			}
		} finally {
			$this->db->query( (string) $this->db->prepare( 'SELECT RELEASE_LOCK(%s)', $name ) );
			wp_cache_delete( $id, 'post_meta' );
			clean_post_cache( $id );
		}
	}
}

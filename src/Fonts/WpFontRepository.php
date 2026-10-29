<?php
/**
 * WordPress font registry.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Fonts;

use SW\Slider\Infrastructure\PostTypes;
use WP_Post;

/**
 * Stores one non-public `sw_slider_font` post per installation; the manifest is JSON in
 * `_sws_installation`, the installation ID in `_sws_installation_id` for lookups.
 *
 * Locks use `add_option()`, which is an atomic INSERT on the unique option name. The value holds
 * owner token and expiry, so a crashed request cannot block installations forever and an expired
 * owner cannot release a newer owner's lock.
 *
 * @phpstan-import-type Installation from FontRepository
 */
final class WpFontRepository implements FontRepository {

	private const MANIFEST_KEY = '_sws_installation';
	private const ID_KEY       = '_sws_installation_id';

	public function all(): array {
		$posts         = get_posts(
			array(
				'post_type'      => PostTypes::FONT,
				'post_status'    => 'publish',
				'posts_per_page' => 500, // phpcs:ignore WordPress.WP.PostsPerPage.posts_per_page_posts_per_page -- bounded registry of installed families.
				'orderby'        => 'title',
				'order'          => 'ASC',
			)
		);
		$installations = array();
		foreach ( $posts as $post ) {
			$installation = $this->manifest( $post );
			if ( null !== $installation ) {
				$installations[] = $installation;
			}
		}
		return $installations;
	}

	public function find( string $installation_id ): ?array {
		$post = $this->post( $installation_id );
		return null === $post ? null : $this->manifest( $post );
	}

	public function save( array $installation ): void {
		$id = wp_insert_post(
			wp_slash(
				array(
					'post_type'   => PostTypes::FONT,
					'post_status' => 'publish',
					'post_title'  => $installation['family'],
				)
			),
			true
		);
		if ( is_wp_error( $id ) ) {
			throw new FontError( 'sws_font_registry', $id->get_error_message() );
		}
		update_post_meta( $id, self::ID_KEY, $installation['id'] );
		update_post_meta( $id, self::MANIFEST_KEY, wp_slash( (string) wp_json_encode( $installation, JSON_UNESCAPED_SLASHES ) ) );
	}

	public function delete( string $installation_id ): void {
		$post = $this->post( $installation_id );
		if ( null !== $post ) {
			wp_delete_post( $post->ID, true );
		}
	}

	public function acquire_lock( string $key, int $ttl_seconds ): ?string {
		$option = 'sws_lock_' . md5( $key );
		$token  = wp_generate_password( 20, false );
		$value  = $token . '|' . ( time() + $ttl_seconds );
		if ( $this->insert_lock( $option, $value ) ) {
			return $token;
		}
		$current = (string) get_option( $option, '' );
		$expiry  = (int) ( explode( '|', $current )[1] ?? 0 );
		if ( $expiry > 0 && $expiry < time() ) {
			// Expired: remove only the exact stale value, then compete again atomically.
			global $wpdb;
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- conditional delete of the exact expired value must bypass caches.
			$wpdb->delete(
				$wpdb->options,
				array(
					'option_name'  => $option,
					'option_value' => $current,
				)
			); // phpcs:ignore WordPress.DB.DirectDatabaseQuery -- conditional delete of an expired lock value; must bypass caches.
			wp_cache_delete( $option, 'options' );
			wp_cache_delete( 'notoptions', 'options' );
			return $this->insert_lock( $option, $value ) ? $token : null;
		}
		return null;
	}

	/**
	 * Atomic INSERT of the lock option; false when the name already exists.
	 *
	 * @phpstan-impure
	 */
	private function insert_lock( string $option, string $value ): bool {
		return add_option( $option, $value, '', false );
	}

	public function release_lock( string $key, string $token ): void {
		$option  = 'sws_lock_' . md5( $key );
		$current = (string) get_option( $option, '' );
		if ( str_starts_with( $current, $token . '|' ) ) {
			delete_option( $option );
		}
	}

	private function post( string $installation_id ): ?WP_Post {
		$posts = get_posts(
			array(
				'post_type'      => PostTypes::FONT,
				'post_status'    => 'publish',
				'posts_per_page' => 1,
				'meta_key'       => self::ID_KEY, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key -- small registry, lookup by installation ID.
				'meta_value'     => $installation_id, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value -- see above.
			)
		);
		$post  = $posts[0] ?? null;
		return $post instanceof WP_Post ? $post : null;
	}

	/**
	 * @return Installation|null
	 */
	private function manifest( WP_Post $post ): ?array {
		$raw     = get_post_meta( $post->ID, self::MANIFEST_KEY, true );
		$decoded = is_string( $raw ) ? json_decode( $raw, true ) : null;
		if ( ! is_array( $decoded ) || ! is_string( $decoded['id'] ?? null ) || ! is_array( $decoded['variants'] ?? null ) ) {
			return null;
		}
		/** @var Installation $decoded */
		return $decoded;
	}
}

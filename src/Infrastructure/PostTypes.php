<?php
/**
 * Internal post types.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Infrastructure;

/**
 * Registers the non-public post types for sliders and installed fonts (PLAN.md 9.1).
 *
 * Neither type is queryable, shown in the admin UI or exposed through the generic REST API: all
 * writes go through the plugin's own validated endpoints.
 */
final class PostTypes {

	public const SLIDER = 'sw_slider';
	public const FONT   = 'sw_slider_font';

	public function register(): void {
		add_action( 'init', array( $this, 'register_post_types' ) );
	}

	public function register_post_types(): void {
		$capabilities = self::capability_map( Capabilities::EDIT );
		register_post_type(
			self::SLIDER,
			array(
				'labels'              => array(
					'name'          => __( 'Sliders', 'sw-sliderman' ),
					'singular_name' => __( 'Slider', 'sw-sliderman' ),
				),
				'public'              => false,
				'publicly_queryable'  => false,
				'exclude_from_search' => true,
				'show_ui'             => false,
				'show_in_rest'        => false,
				'show_in_nav_menus'   => false,
				'rewrite'             => false,
				'query_var'           => false,
				'can_export'          => true,
				'delete_with_user'    => false,
				'supports'            => array( 'title', 'editor', 'author', 'revisions' ),
				'capabilities'        => $capabilities,
				'map_meta_cap'        => false,
			)
		);
		register_post_type(
			self::FONT,
			array(
				'labels'              => array(
					'name'          => __( 'Installed fonts', 'sw-sliderman' ),
					'singular_name' => __( 'Installed font', 'sw-sliderman' ),
				),
				'public'              => false,
				'publicly_queryable'  => false,
				'exclude_from_search' => true,
				'show_ui'             => false,
				'show_in_rest'        => false,
				'show_in_nav_menus'   => false,
				'rewrite'             => false,
				'query_var'           => false,
				'can_export'          => true,
				'delete_with_user'    => false,
				'supports'            => array( 'title' ),
				'capabilities'        => self::capability_map( Capabilities::FONTS ),
				'map_meta_cap'        => false,
			)
		);
	}

	/**
	 * Maps every post type capability to one plugin capability.
	 *
	 * @return array<string, string>
	 */
	private static function capability_map( string $capability ): array {
		$keys = array( 'edit_post', 'read_post', 'delete_post', 'edit_posts', 'edit_others_posts', 'delete_posts', 'publish_posts', 'read_private_posts', 'create_posts', 'delete_private_posts', 'delete_published_posts', 'delete_others_posts', 'edit_private_posts', 'edit_published_posts' );
		return array_fill_keys( $keys, $capability );
	}
}

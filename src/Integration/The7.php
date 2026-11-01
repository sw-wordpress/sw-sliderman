<?php
/**
 * The7 theme integration.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Integration;

use SW\Slider\Application\SliderRepository;
use SW\Slider\Rendering\SliderRenderer;

/**
 * Offers sliders as "SW SliderMan" mode in The7's page header slideshow (classic page options).
 *
 * The7 hides the "Slideshow" header option unless one of its own slider sources is active, so the
 * option is added back here. Both hooks are fired only by The7; with another theme nothing happens.
 * Output goes through the shared renderer, so drafts stay private (PLAN.md 11).
 */
final class The7 {

	public const MODE        = 'sw_sliderman';
	public const SLIDER_META = '_dt_slideshow_sw_sliderman';

	private const HEADER_BOX    = 'dt_page_box-header_options';
	private const SLIDESHOW_BOX = 'dt_page_box-slideshow_options';
	private const TITLE_FIELD   = '_dt_header_title';
	private const MODE_FIELD    = '_dt_slideshow_mode';

	/** Containers/fields of The7's own slideshow modes (porthole, photo scroller, Revolution, LayerSlider). */
	private const THE7_FIELDS = array(
		'_dt_slideshow_porthole_container',
		'_dt_slideshow_photo_scroller_container',
		'_dt_slideshow_sliders',
		'_dt_slideshow_revolution_slider',
		'_dt_slideshow_layer_container',
	);

	/** Upper bound for the slider dropdown; keeps the page editor fast on large sites. */
	private const MAX_OPTIONS = 500;

	public function __construct(
		private readonly SliderRepository $repository,
		private readonly SliderRenderer $renderer
	) {
	}

	public function register(): void {
		add_action( 'the7_before_meta_box_registration', array( $this, 'extend_meta_boxes' ) );
		add_action( 'presscore_do_header_slideshow', array( $this, 'render_header' ) );
	}

	/** Adds the header option, the slideshow mode and the slider selection to The7's meta boxes. */
	public function extend_meta_boxes(): void {
		global $DT_META_BOXES; // phpcs:ignore WordPress.NamingConventions.ValidVariableName.VariableNotSnakeCase -- The7 global.
		// phpcs:ignore WordPress.NamingConventions.ValidVariableName.VariableNotSnakeCase -- The7 global.
		if ( ! is_array( $DT_META_BOXES ) || ! isset( $DT_META_BOXES[ self::HEADER_BOX ], $DT_META_BOXES[ self::SLIDESHOW_BOX ] ) ) {
			return;
		}
		// phpcs:ignore WordPress.NamingConventions.ValidVariableName.VariableNotSnakeCase -- The7 global.
		$boxes = &$DT_META_BOXES;

		foreach ( $boxes[ self::HEADER_BOX ]['fields'] as &$field ) {
			if ( self::TITLE_FIELD === ( $field['id'] ?? null ) && ! isset( $field['options']['slideshow'] ) ) {
				$field['options']['slideshow'] = array( __( 'Slideshow', 'sw-sliderman' ), array( 'slider.gif', 100, 60 ) );
			}
		}
		unset( $field );

		$fields = array();
		foreach ( $boxes[ self::SLIDESHOW_BOX ]['fields'] as $field ) {
			if ( self::MODE_FIELD === ( $field['id'] ?? null ) ) {
				$field = $this->extend_mode_field( $field );
			}
			$fields[] = $field;
			if ( self::MODE_FIELD === ( $field['id'] ?? null ) ) {
				$fields[] = $this->slider_field();
			}
		}
		$boxes[ self::SLIDESHOW_BOX ]['fields'] = $fields;
	}

	/** The7 action after its own slideshow types; renders the slider chosen for the current page. */
	public function render_header( mixed $type ): void {
		if ( self::MODE !== $type ) {
			return;
		}
		$post_id   = function_exists( 'presscore_config' ) ? (int) presscore_config()->get( 'post_id' ) : (int) get_queried_object_id();
		$slider_id = (int) get_post_meta( $post_id, self::SLIDER_META, true );
		$html      = $this->renderer->render( max( 0, $slider_id ) );
		if ( '' === $html ) {
			return;
		}
		echo '<div id="main-slideshow" class="sws-the7-slideshow">' . $html . '</div>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- renderer escapes every value.
	}

	/**
	 * @param array<string, mixed> $field The7 radio field for the slideshow mode.
	 * @return array<string, mixed>
	 */
	private function extend_mode_field( array $field ): array {
		$options = is_array( $field['options'] ?? null ) ? $field['options'] : array();
		$hide    = is_array( $field['hide_fields'] ?? null ) ? $field['hide_fields'] : array();
		foreach ( array_keys( $hide ) as $mode ) {
			$hide[ $mode ] = array_merge( (array) $hide[ $mode ], array( self::SLIDER_META ) );
		}
		if ( array() === $options ) {
			// The7 picks the first option as default; without own sources that is this mode.
			$field['std'] = self::MODE;
		}
		$options[ self::MODE ] = array( 'SW SliderMan', array( 'slider.gif', 75, 50 ) );
		// The7's own slideshow fields stay in the box even without their source; hide them all.
		$hide[ self::MODE ]   = self::THE7_FIELDS;
		$field['options']     = $options;
		$field['hide_fields'] = $hide;
		return $field;
	}

	/** @return array<string, mixed> */
	private function slider_field(): array {
		return array(
			'name'        => __( 'Choose slider', 'sw-sliderman' ),
			'id'          => self::SLIDER_META,
			'type'        => 'select',
			'std'         => '',
			'options'     => $this->slider_options(),
			'multiple'    => false,
			'top_divider' => true,
		);
	}

	/** @return array<int|string, string> Slider post ID (PHP turns it into an int key) => title, unpublished marked. */
	private function slider_options(): array {
		$options = array( '' => __( '– Select slider –', 'sw-sliderman' ) );
		$items   = $this->repository->list_sliders( 1, self::MAX_OPTIONS, '' )['items'];
		foreach ( $items as $slider ) {
			$title = '' !== trim( $slider->title ) ? $slider->title : sprintf( '#%d', $slider->id );
			/* translators: %s: slider title */
			$options[ (string) $slider->id ] = null === $slider->published ? sprintf( __( '%s (not published)', 'sw-sliderman' ), $title ) : $title;
		}
		return $options;
	}
}

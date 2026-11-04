<?php
/**
 * CSS serialization of validated layer values.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Rendering;

use SW\Slider\Domain\DocumentValidator;
use SW\Slider\Domain\LayoutResolver;

/**
 * Builds the published slider CSS from validated, typed document values only (CODE-STYLE 6.1).
 *
 * Declarations mirror assets/shared/css.ts exactly (positions in % of the stage, lengths in
 * `cqw` of the slider container); the contract fixtures in tests/fixtures/css compare both.
 * Breakpoints are applied with container queries on `.sws-slider`, so layout works before and
 * without JavaScript.
 */
final class StyleSerializer {

	public const SYSTEM_FONT_STACK = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

	/** Fixed-precision formatting identical to formatNumber() in css.ts. */
	public static function format_number( float $value ): string {
		$rounded = round( $value, 4 );
		if ( 0.0 === $rounded ) {
			return '0';
		}
		$text = number_format( $rounded, 4, '.', '' );
		return rtrim( rtrim( $text, '0' ), '.' );
	}

	private static function percent( float $value, float $total ): string {
		return self::format_number( $value / $total * 100 ) . '%';
	}

	private static function cqw( float $value, float $stage_width ): string {
		return self::format_number( $value * 100 / $stage_width ) . 'cqw';
	}

	public static function font_family_name( string $installation_id ): string {
		return 'sws-' . $installation_id;
	}

	/**
	 * Validates a value against the color pattern before it reaches CSS.
	 */
	private static function color( mixed $value, string $fallback ): string {
		if ( is_string( $value ) && 1 === preg_match( DocumentValidator::COLOR_PATTERN, $value ) ) {
			return strtolower( $value );
		}
		return $fallback;
	}

	/** `#rrggbb` and alpha as rgba(); invalid colours fall back to black. */
	private static function rgba( string $hex, float $alpha ): string {
		$hex   = self::color( $hex, '#000000' );
		$value = (int) hexdec( substr( $hex, 1 ) );
		return 'rgba(' . ( ( $value >> 16 ) & 255 ) . ',' . ( ( $value >> 8 ) & 255 ) . ',' . ( $value & 255 ) . ',' . self::format_number( $alpha ) . ')';
	}

	/**
	 * Font declarations for a style.
	 *
	 * @param array<string, mixed>                $style     Effective style.
	 * @param array<string, array<string, mixed>> $font_refs Font references by ID.
	 * @return list<array{0: string, 1: string}>
	 */
	private static function font_declarations( array $style, array $font_refs ): array {
		$ref = is_string( $style['fontRef'] ) ? ( $font_refs[ $style['fontRef'] ] ?? null ) : null;
		if ( null === $ref || 1 !== preg_match( DocumentValidator::ID_PATTERN, (string) $ref['installationId'] ) ) {
			return array( array( 'font-family', self::SYSTEM_FONT_STACK ) );
		}
		return array(
			array( 'font-family', "'" . self::font_family_name( (string) $ref['installationId'] ) . "', " . self::SYSTEM_FONT_STACK ),
			array( 'font-weight', (string) (int) $ref['weight'] ),
			array( 'font-style', 'italic' === $ref['style'] ? 'italic' : 'normal' ),
		);
	}

	/**
	 * Declarations of a resolved layer.
	 *
	 * @param array{id: string, layout: array<string, mixed>, style: array<string, mixed>, box: array{left: float, top: float, width: float, height: float}} $layer Resolved layer.
	 * @param array<string, array<string, mixed>>                                                                                                            $font_refs Font references by ID.
	 * @param string|null                                                                                                                                    $shape_kind `circle` forces a fully rounded box.
	 * @return array{box: list<array{0: string, 1: string}>, body: list<array{0: string, 1: string}>}
	 */
	public static function layer_declarations( array $layer, float $stage_width, float $stage_height, array $font_refs, ?string $shape_kind = null ): array {
		$box    = $layer['box'];
		$layout = $layer['layout'];
		$style  = $layer['style'];

		$rotation = (float) $layout['rotation'];
		$body     = array(
			array( 'transform', 0.0 === $rotation ? 'none' : 'rotate(' . self::format_number( $rotation ) . 'deg)' ),
		);
		$body     = array_merge( $body, self::font_declarations( $style, $font_refs ) );
		$align    = in_array( $style['textAlign'], array( 'left', 'center', 'right' ), true ) ? $style['textAlign'] : 'left';
		$body     = array_merge(
			$body,
			array(
				array( 'font-size', self::cqw( (float) $style['fontSize'], $stage_width ) ),
				array( 'line-height', self::format_number( (float) $style['lineHeight'] ) ),
				array( 'letter-spacing', self::cqw( (float) $style['letterSpacing'], $stage_width ) ),
				array( 'color', self::color( $style['color'], '#000000' ) ),
				array( 'text-align', $align ),
				array( 'background-color', null === $style['backgroundColor'] ? 'transparent' : self::color( $style['backgroundColor'], 'transparent' ) ),
				array( 'border-radius', 'circle' === $shape_kind ? '50%' : self::cqw( (float) $style['borderRadius'], $stage_width ) ),
				array( 'padding', self::cqw( (float) $style['paddingY'], $stage_width ) . ' ' . self::cqw( (float) $style['paddingX'], $stage_width ) ),
				array( 'opacity', self::format_number( (float) $style['opacity'] ) ),
			)
		);

		// Optional style fields: declarations appear only when they differ from "none" (css.ts).
		$border_width = (float) ( $style['borderWidth'] ?? 0 );
		if ( $border_width > 0 ) {
			$body[] = array( 'border', self::cqw( $border_width, $stage_width ) . ' solid ' . self::color( $style['borderColor'] ?? '#000000', '#000000' ) );
		}
		if ( is_string( $style['shadowColor'] ?? null ) ) {
			$body[] = array(
				'box-shadow',
				self::cqw( (float) ( $style['shadowX'] ?? 0 ), $stage_width ) . ' ' . self::cqw( (float) ( $style['shadowY'] ?? 0 ), $stage_width ) . ' ' . self::cqw( (float) ( $style['shadowBlur'] ?? 0 ), $stage_width ) . ' ' . self::rgba( $style['shadowColor'], (float) ( $style['shadowOpacity'] ?? 0.25 ) ),
			);
		}

		return array(
			'box'  => array(
				array( 'left', self::percent( $box['left'], $stage_width ) ),
				array( 'top', self::percent( $box['top'], $stage_height ) ),
				array( 'width', self::percent( $box['width'], $stage_width ) ),
				array( 'height', self::percent( $box['height'], $stage_height ) ),
				array( 'display', true === $layout['visible'] ? 'block' : 'none' ),
			),
			'body' => $body,
		);
	}

	/**
	 * Hover and keyboard-focus rules of a button layer (mirrors buttonStateCss() in css.ts).
	 *
	 * @param string               $selector Scoped layer selector (`.sws-s-<scope> .sws-l-<id>`).
	 * @param array<string, mixed> $content  Validated button content.
	 */
	public static function button_state_css( string $selector, array $content ): string {
		$css   = '';
		$hover = array();
		foreach ( array(
			'hoverBackgroundColor' => 'background-color',
			'hoverColor'           => 'color',
		) as $key => $property ) {
			if ( isset( $content[ $key ] ) && is_string( $content[ $key ] ) && '' !== $content[ $key ] ) {
				$hover[] = array( $property, self::color( $content[ $key ], '#000000' ) );
			}
		}
		if ( array() !== $hover ) {
			$css .= $selector . ' .sws-layer__body:hover{' . self::serialize( $hover ) . '}';
			$css .= $selector . ' .sws-button:hover{filter:none;}';
		}
		if ( isset( $content['focusOutlineColor'] ) && is_string( $content['focusOutlineColor'] ) && '' !== $content['focusOutlineColor'] ) {
			$css .= $selector . ' .sws-button:focus-visible{outline:3px solid ' . self::color( $content['focusOutlineColor'], '#000000' ) . ';outline-offset:3px;}';
		}
		return $css;
	}

	/**
	 * Serializes declarations as `prop:value;` pairs.
	 *
	 * @param list<array{0: string, 1: string}> $declarations Declarations.
	 */
	public static function serialize( array $declarations ): string {
		$out = '';
		foreach ( $declarations as $declaration ) {
			$out .= $declaration[0] . ':' . $declaration[1] . ';';
		}
		return $out;
	}

	/** `object-position` value for a focal point in percent; null while it is the default centre. */
	private static function focal_position( mixed $focal_x, mixed $focal_y ): ?string {
		$x = is_int( $focal_x ) || is_float( $focal_x ) ? (float) $focal_x : 50.0;
		$y = is_int( $focal_y ) || is_float( $focal_y ) ? (float) $focal_y : 50.0;
		if ( 50.0 === $x && 50.0 === $y ) {
			return null;
		}
		return self::format_number( $x ) . '% ' . self::format_number( $y ) . '%';
	}

	/**
	 * Overlay and focal point of a slide background. `$selector` is `.sws-s-<scope> .sws-sl-<id>`;
	 * the overlay sits between the background image and the stage. Mirrors slideBackgroundCss().
	 *
	 * @param array<string, mixed> $background Validated slide background.
	 */
	public static function slide_background_css( string $selector, array $background ): string {
		$css     = '';
		$overlay = $background['overlayColor'] ?? null;
		if ( is_string( $overlay ) && 1 === preg_match( DocumentValidator::COLOR_PATTERN, $overlay ) ) {
			$opacity = $background['overlayOpacity'] ?? 0.4;
			$alpha   = is_int( $opacity ) || is_float( $opacity ) ? (float) $opacity : 0.4;
			$css    .= $selector . '::before{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;background-color:' . self::rgba( $overlay, $alpha ) . ';}';
			$css    .= $selector . ' .sws-stage{z-index:2;}';
		}
		$position = self::focal_position( $background['focalX'] ?? null, $background['focalY'] ?? null );
		if ( null !== $position ) {
			$css .= $selector . ' .sws-slide__bg{object-position:' . $position . ';}';
		}
		return $css;
	}

	/**
	 * Focal point of an image layer (`$selector` is `.sws-s-<scope> .sws-l-<id>`). Mirrors imageFocalCss().
	 *
	 * @param array<string, mixed> $content Validated image content.
	 */
	public static function image_focal_css( string $selector, array $content ): string {
		$position = self::focal_position( $content['focalX'] ?? null, $content['focalY'] ?? null );
		return null === $position ? '' : $selector . ' .sws-image{object-position:' . $position . ';}';
	}

	/**
	 * Complete stylesheet of a published document.
	 *
	 * Selectors are scoped to the document class `.sws-s-<scope>` so several instances of the same
	 * slider share one stylesheet. Layer and slide IDs are validated against the ID pattern, so they
	 * are safe as class name parts.
	 *
	 * @param array<string, mixed> $document Validated document (associative arrays).
	 * @param string               $scope    Scope suffix (document hash prefix, [a-f0-9]).
	 */
	public static function document_css( array $document, string $scope ): string {
		$root        = '.sws-s-' . preg_replace( '/[^a-f0-9]/', '', $scope );
		$breakpoints = $document['breakpoints'];
		$font_refs   = array();
		foreach ( $document['fontRefs'] as $ref ) {
			$font_refs[ (string) $ref['id'] ] = $ref;
		}

		$settings  = $document['settings'];
		$max_width = 'boxed' === $settings['layout'] ? ( (int) $settings['maxWidth'] ) . 'px' : 'none';
		$css       = $root . '{max-width:' . $max_width . ';}';
		foreach ( $document['slides'] as $slide ) {
			$color = $slide['background']['color'] ?? null;
			if ( null !== $color && 1 === preg_match( DocumentValidator::ID_PATTERN, (string) $slide['id'] ) ) {
				$css .= $root . ' .sws-sl-' . $slide['id'] . '{background-color:' . self::color( $color, 'transparent' ) . ';}';
			}
			if ( 1 === preg_match( DocumentValidator::ID_PATTERN, (string) $slide['id'] ) ) {
				$css .= self::slide_background_css( $root . ' .sws-sl-' . $slide['id'], $slide['background'] );
			}
		}

		$tablet_min  = (int) $breakpoints['tablet']['minWidth'];
		$desktop_min = (int) $breakpoints['desktop']['minWidth'];
		$queries     = array(
			'desktop' => '@container sws (min-width: ' . $desktop_min . 'px)',
			'tablet'  => '@container sws (min-width: ' . $tablet_min . 'px) and (max-width: ' . self::format_number( $desktop_min - 0.02 ) . 'px)',
			'mobile'  => '@container sws (max-width: ' . self::format_number( $tablet_min - 0.02 ) . 'px)',
		);

		// Hover/focus colours are not breakpoint-specific: one set of rules per button layer.
		foreach ( $document['slides'] as $slide ) {
			foreach ( $slide['layers'] as $layer ) {
				if ( 'button' === $layer['type'] && 1 === preg_match( DocumentValidator::ID_PATTERN, (string) $layer['id'] ) ) {
					$css .= self::button_state_css( $root . ' .sws-l-' . $layer['id'], $layer['content'] );
				}
				if ( 'image' === $layer['type'] && 1 === preg_match( DocumentValidator::ID_PATTERN, (string) $layer['id'] ) ) {
					$css .= self::image_focal_css( $root . ' .sws-l-' . $layer['id'], $layer['content'] );
				}
			}
		}

		foreach ( LayoutResolver::BREAKPOINTS as $name ) {
			$stage_width  = (float) $breakpoints[ $name ]['stageWidth'];
			$stage_height = (float) $breakpoints[ $name ]['stageHeight'];
			$rules        = $root . ' .sws-stage{aspect-ratio:' . self::format_number( $stage_width ) . ' / ' . self::format_number( $stage_height ) . ';}';
			foreach ( $document['slides'] as $slide ) {
				foreach ( $slide['layers'] as $layer ) {
					if ( 1 !== preg_match( DocumentValidator::ID_PATTERN, (string) $layer['id'] ) ) {
						continue;
					}
					$resolved     = LayoutResolver::resolve_layer( $layer, $name, $breakpoints );
					$shape_kind   = 'shape' === $layer['type'] && is_string( $layer['content']['kind'] ?? null ) ? $layer['content']['kind'] : null;
					$declarations = self::layer_declarations( $resolved, $stage_width, $stage_height, $font_refs, $shape_kind );
					$selector     = $root . ' .sws-l-' . $layer['id'];
					$rules       .= $selector . '{' . self::serialize( $declarations['box'] ) . '}';
					$rules       .= $selector . ' .sws-layer__body{' . self::serialize( $declarations['body'] ) . '}';
				}
			}
			$css .= $queries[ $name ] . '{' . $rules . '}';
		}
		return $css;
	}
}

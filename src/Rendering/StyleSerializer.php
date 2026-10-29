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
	 * @return array{box: list<array{0: string, 1: string}>, body: list<array{0: string, 1: string}>}
	 */
	public static function layer_declarations( array $layer, float $stage_width, float $stage_height, array $font_refs ): array {
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
				array( 'border-radius', self::cqw( (float) $style['borderRadius'], $stage_width ) ),
				array( 'padding', self::cqw( (float) $style['paddingY'], $stage_width ) . ' ' . self::cqw( (float) $style['paddingX'], $stage_width ) ),
				array( 'opacity', self::format_number( (float) $style['opacity'] ) ),
			)
		);

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
		}

		$tablet_min  = (int) $breakpoints['tablet']['minWidth'];
		$desktop_min = (int) $breakpoints['desktop']['minWidth'];
		$queries     = array(
			'desktop' => '@container sws (min-width: ' . $desktop_min . 'px)',
			'tablet'  => '@container sws (min-width: ' . $tablet_min . 'px) and (max-width: ' . self::format_number( $desktop_min - 0.02 ) . 'px)',
			'mobile'  => '@container sws (max-width: ' . self::format_number( $tablet_min - 0.02 ) . 'px)',
		);

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
					$declarations = self::layer_declarations( $resolved, $stage_width, $stage_height, $font_refs );
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

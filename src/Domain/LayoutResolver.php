<?php
/**
 * Container-based layout resolution.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Domain;

/**
 * Resolves effective layer layout and style per breakpoint (PLAN.md 6).
 *
 * Mirrors assets/shared/layout.ts; both are tested against tests/fixtures/layout. Works on a
 * validated document decoded as associative arrays.
 *
 * Overrides inherit property by property in the order desktop (base) -> tablet -> mobile. A
 * missing override value means "inherit".
 *
 * @phpstan-type Layout array{x: int|float, y: int|float, width: int|float, height: int|float, anchorX: string, anchorY: string, rotation: int|float, visible: bool}
 * @phpstan-type Box array{left: float, top: float, width: float, height: float}
 */
final class LayoutResolver {

	public const BREAKPOINTS = array( 'desktop', 'tablet', 'mobile' );

	/**
	 * Breakpoints whose overrides apply to `$breakpoint`, in resolution order.
	 *
	 * @return list<string>
	 */
	public static function override_chain( string $breakpoint ): array {
		switch ( $breakpoint ) {
			case 'tablet':
				return array( 'tablet' );
			case 'mobile':
				return array( 'tablet', 'mobile' );
			default:
				return array();
		}
	}

	/**
	 * Effective layout of a layer for a breakpoint.
	 *
	 * @param array<string, mixed> $layer Validated layer.
	 * @return array<string, mixed>
	 */
	public static function resolve_layout( array $layer, string $breakpoint ): array {
		$layout = (array) $layer['layout'];
		foreach ( self::override_chain( $breakpoint ) as $name ) {
			$override = $layer['overrides'][ $name ]['layout'] ?? null;
			if ( is_array( $override ) ) {
				$layout = array_merge( $layout, $override );
			}
		}
		return $layout;
	}

	/**
	 * Effective style of a layer for a breakpoint; only overridable keys are taken from overrides.
	 *
	 * @param array<string, mixed> $layer Validated layer.
	 * @return array<string, mixed>
	 */
	public static function resolve_style( array $layer, string $breakpoint ): array {
		$style = (array) $layer['style'];
		foreach ( self::override_chain( $breakpoint ) as $name ) {
			$override = $layer['overrides'][ $name ]['style'] ?? null;
			if ( ! is_array( $override ) ) {
				continue;
			}
			foreach ( DocumentValidator::OVERRIDABLE_STYLE_KEYS as $key ) {
				if ( array_key_exists( $key, $override ) ) {
					$style[ $key ] = $override[ $key ];
				}
			}
		}
		return $style;
	}

	/**
	 * Converts anchor-relative coordinates into the top-left box in stage pixels.
	 *
	 * @param array<string, mixed> $layout Effective layout.
	 * @return array{left: float, top: float, width: float, height: float}
	 */
	public static function resolve_box( array $layout, float $stage_width, float $stage_height ): array {
		$x      = (float) $layout['x'];
		$y      = (float) $layout['y'];
		$width  = (float) $layout['width'];
		$height = (float) $layout['height'];

		$left = $x;
		if ( 'center' === $layout['anchorX'] ) {
			$left = ( $stage_width - $width ) / 2 + $x;
		} elseif ( 'right' === $layout['anchorX'] ) {
			$left = $stage_width - $width - $x;
		}
		$top = $y;
		if ( 'center' === $layout['anchorY'] ) {
			$top = ( $stage_height - $height ) / 2 + $y;
		} elseif ( 'bottom' === $layout['anchorY'] ) {
			$top = $stage_height - $height - $y;
		}
		return array(
			'left'   => $left,
			'top'    => $top,
			'width'  => $width,
			'height' => $height,
		);
	}

	/**
	 * Resolves layout, style and box of a layer for a breakpoint.
	 *
	 * @param array<string, mixed>                $layer       Validated layer.
	 * @param array<string, array<string, mixed>> $breakpoints Validated breakpoints.
	 * @return array{id: string, layout: array<string, mixed>, style: array<string, mixed>, box: array{left: float, top: float, width: float, height: float}}
	 */
	public static function resolve_layer( array $layer, string $breakpoint, array $breakpoints ): array {
		$layout = self::resolve_layout( $layer, $breakpoint );
		return array(
			'id'     => (string) $layer['id'],
			'layout' => $layout,
			'style'  => self::resolve_style( $layer, $breakpoint ),
			'box'    => self::resolve_box(
				$layout,
				(float) $breakpoints[ $breakpoint ]['stageWidth'],
				(float) $breakpoints[ $breakpoint ]['stageHeight']
			),
		);
	}

	/**
	 * Active breakpoint for a container width.
	 *
	 * @param array<string, array<string, mixed>> $breakpoints Validated breakpoints.
	 */
	public static function breakpoint_for_width( array $breakpoints, float $container_width ): string {
		if ( $container_width >= (float) $breakpoints['desktop']['minWidth'] ) {
			return 'desktop';
		}
		if ( $container_width >= (float) $breakpoints['tablet']['minWidth'] ) {
			return 'tablet';
		}
		return 'mobile';
	}
}

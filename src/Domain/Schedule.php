<?php
/**
 * Slide timing rules.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Domain;

/**
 * Effective slide duration (PLAN.md 7.1): at least the end of every mandatory animation.
 *
 * Mirrors assets/shared/schedule.ts (fixtures in tests/fixtures/schedule).
 */
final class Schedule {

	/**
	 * End of all mandatory animations of a layer in milliseconds.
	 *
	 * @param array<string, mixed> $layer Validated layer.
	 */
	public static function layer_animation_end_ms( array $layer ): int {
		$enter = $layer['animation']['enter'];
		$end   = 'none' === $enter['preset'] ? 0 : (int) $enter['startMs'] + (int) $enter['durationMs'];
		$exit  = $layer['animation']['exit'];
		if ( 'timed' === $exit['mode'] && 'none' !== $exit['preset'] ) {
			$end = max( $end, (int) $exit['startMs'] + (int) $exit['durationMs'] );
		}
		return $end;
	}

	/**
	 * Effective duration of a slide in milliseconds.
	 *
	 * @param array<string, mixed> $slide Validated slide.
	 */
	public static function effective_slide_duration_ms( array $slide ): int {
		$duration = (int) $slide['durationMs'];
		foreach ( $slide['layers'] as $layer ) {
			$duration = max( $duration, self::layer_animation_end_ms( $layer ) );
		}
		return $duration;
	}
}

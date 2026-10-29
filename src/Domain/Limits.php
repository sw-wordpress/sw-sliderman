<?php
/**
 * Binding document limits.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Domain;

/**
 * Binding document limits (PLAN.md 13, TODO M1.05).
 *
 * Mirrors assets/shared/limits.ts. The contract test compares both definitions, so a change here
 * must be made in the TypeScript file as well.
 */
final class Limits {

	public const DOCUMENT_BYTES            = 524288;
	public const SLIDES                    = 50;
	public const LAYERS_PER_SLIDE          = 100;
	public const FONT_REFS                 = 40;
	public const ID_LENGTH                 = 64;
	public const NAME_LENGTH               = 80;
	public const LABEL_LENGTH              = 120;
	public const TEXT_LENGTH               = 5000;
	public const ALT_LENGTH                = 300;
	public const BUTTON_LABEL_LENGTH       = 200;
	public const URL_LENGTH                = 2000;
	public const COORDINATE                = 20000;
	public const SIZE_MIN                  = 1;
	public const SIZE_MAX                  = 20000;
	public const STAGE_MIN                 = 200;
	public const STAGE_MAX                 = 4000;
	public const STAGE_HEIGHT_MIN          = 100;
	public const STAGE_HEIGHT_MAX          = 3000;
	public const BREAKPOINT_MAX            = 10000;
	public const MAX_WIDTH_MIN             = 320;
	public const MAX_WIDTH_MAX             = 4000;
	public const SLIDE_DURATION_MIN_MS     = 1000;
	public const SLIDE_DURATION_MAX_MS     = 60000;
	public const TRANSITION_MAX_MS         = 3000;
	public const ANIMATION_START_MAX_MS    = 60000;
	public const ANIMATION_DURATION_MAX_MS = 10000;
	public const ANIMATION_DISTANCE_MAX    = 4000;
	public const FONT_SIZE_MIN             = 4;
	public const FONT_SIZE_MAX             = 400;
	public const LINE_HEIGHT_MIN           = 0.5;
	public const LINE_HEIGHT_MAX           = 4;
	public const LETTER_SPACING_MIN        = -20;
	public const LETTER_SPACING_MAX        = 100;
	public const PADDING_MAX               = 400;
	public const RADIUS_MAX                = 2000;
	public const ROTATION_MAX              = 360;
}

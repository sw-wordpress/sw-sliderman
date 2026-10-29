<?php
/**
 * Server-side validation of slider documents.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Domain;

use stdClass;

/**
 * Validates a decoded slider document (schema v1) independently of the browser.
 *
 * Mirrors assets/shared/validate.ts rule by rule: both report the same set of issues for every
 * fixture in tests/fixtures/documents. The input must be decoded with objects preserved
 * (`json_decode( $json, false )`), otherwise `{}` and `[]` cannot be told apart.
 *
 * A wrongly typed value is reported once and not inspected further; unknown keys are reported
 * individually (server-side allowlist, PLAN.md 13).
 */
final class DocumentValidator {

	public const SCHEMA_VERSION = 1;

	public const ID_PATTERN    = '/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/D';
	public const COLOR_PATTERN = '/^#[0-9a-fA-F]{6}$/D';
	public const LINK_PATTERN  = '~^(?:https?://[^\x00-\x20\x7F<>"]+|mailto:[^\x00-\x20\x7F<>"]+|tel:[0-9+().\- ]+|/(?!/)[^\x00-\x20\x7F<>"]*|#[^\x00-\x20\x7F<>"]*)$~iD';

	private const ANIMATION_PRESETS = array( 'none', 'fade', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'zoom-in', 'zoom-out', 'rotate' );
	private const EASINGS           = array( 'linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out' );
	private const TEXT_TAGS         = array( 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div' );
	private const LAYOUT_KEYS       = array( 'x', 'y', 'width', 'height', 'anchorX', 'anchorY', 'rotation', 'visible' );
	private const STYLE_KEYS        = array( 'fontRef', 'fontSize', 'lineHeight', 'letterSpacing', 'color', 'textAlign', 'backgroundColor', 'borderRadius', 'paddingX', 'paddingY', 'opacity' );
	private const PHASE_KEYS        = array( 'preset', 'startMs', 'durationMs', 'easing', 'distance' );

	/** Style keys that may be overridden per breakpoint (types.ts OVERRIDABLE_STYLE_KEYS). */
	public const OVERRIDABLE_STYLE_KEYS = array( 'fontSize', 'lineHeight', 'letterSpacing', 'textAlign', 'paddingX', 'paddingY' );

	/**
	 * Collected issues of the current run.
	 *
	 * @var list<ValidationIssue>
	 */
	private array $issues = array();

	/**
	 * Document-wide slide/layer IDs seen so far.
	 *
	 * @var array<string, true>
	 */
	private array $ids = array();

	/**
	 * Validates a decoded document.
	 *
	 * @param mixed $document Result of `json_decode( $json, false )`.
	 * @return list<ValidationIssue> Empty when the document is valid.
	 */
	public function validate( mixed $document ): array {
		$this->issues = array();
		$this->ids    = array();

		if ( $document instanceof stdClass && property_exists( $document, 'schemaVersion' ) && ! $this->is_schema_version( $document->schemaVersion ) ) {
			// Unknown (newer or older) versions are never inspected or silently converted.
			return array( new ValidationIssue( '/schemaVersion', 'schema_version' ) );
		}

		$doc = $this->object( $document, '', array( 'schemaVersion', 'id', 'settings', 'breakpoints', 'fontRefs', 'slides' ) );
		if ( null !== $doc ) {
			$this->id( $doc, 'id', '', false );
			if ( property_exists( $doc, 'settings' ) ) {
				$this->validate_settings( $doc->settings, '/settings' );
			}
			if ( property_exists( $doc, 'breakpoints' ) ) {
				$this->validate_breakpoints( $doc->breakpoints, '/breakpoints' );
			}
			$font_refs = $this->validate_font_refs( $doc );
			foreach ( $this->list_of( $doc, 'slides', '', 1, Limits::SLIDES ) as $index => $slide ) {
				$this->validate_slide( $slide, '/slides/' . $index, $font_refs );
			}
		}

		if ( array() === $this->issues && strlen( CanonicalJson::encode( $document ) ) > Limits::DOCUMENT_BYTES ) {
			return array( new ValidationIssue( '', 'too_large' ) );
		}

		return $this->issues;
	}

	/**
	 * Decodes a JSON string and validates it.
	 *
	 * @param string $json Raw JSON.
	 * @return list<ValidationIssue>
	 */
	public function validate_json( string $json ): array {
		if ( strlen( $json ) > Limits::DOCUMENT_BYTES ) {
			return array( new ValidationIssue( '', 'too_large' ) );
		}
		$decoded = json_decode( $json, false, 64 );
		if ( JSON_ERROR_NONE !== json_last_error() ) {
			return array( new ValidationIssue( '', 'json' ) );
		}
		return $this->validate( $decoded );
	}

	private function is_schema_version( mixed $value ): bool {
		return self::SCHEMA_VERSION === $value || ( is_float( $value ) && (float) self::SCHEMA_VERSION === $value );
	}

	private function add( string $path, string $code ): void {
		$this->issues[] = new ValidationIssue( $path, $code );
	}

	/**
	 * Checks that a value is an object with the required keys and no keys outside the allowlist.
	 *
	 * @param mixed        $value    Value to check.
	 * @param string       $path     JSON pointer of the value.
	 * @param list<string> $required Required keys.
	 * @param list<string> $optional Optional keys.
	 */
	private function object( mixed $value, string $path, array $required, array $optional = array() ): ?stdClass {
		if ( ! $value instanceof stdClass ) {
			$this->add( $path, 'type' );
			return null;
		}
		foreach ( $required as $key ) {
			if ( ! property_exists( $value, $key ) ) {
				$this->add( $path . '/' . $key, 'required' );
			}
		}
		foreach ( array_keys( get_object_vars( $value ) ) as $key ) {
			$key = (string) $key;
			if ( ! in_array( $key, $required, true ) && ! in_array( $key, $optional, true ) ) {
				$this->add( $path . '/' . $key, 'unknown_key' );
			}
		}
		return $value;
	}

	private function str( stdClass $obj, string $key, string $path, int $min, int $max ): void {
		if ( ! property_exists( $obj, $key ) ) {
			return;
		}
		$value = $obj->$key;
		$at    = $path . '/' . $key;
		if ( ! is_string( $value ) ) {
			$this->add( $at, 'type' );
			return;
		}
		$length = mb_strlen( $value, 'UTF-8' );
		if ( $length < $min || $length > $max ) {
			$this->add( $at, 'length' );
		}
	}

	private function bool( stdClass $obj, string $key, string $path ): void {
		if ( property_exists( $obj, $key ) && ! is_bool( $obj->$key ) ) {
			$this->add( $path . '/' . $key, 'type' );
		}
	}

	/** Whether a decoded JSON value is a finite number (and, if requested, an integer). */
	public static function is_number( mixed $value, bool $integer = false ): bool {
		if ( is_int( $value ) ) {
			return true;
		}
		if ( ! is_float( $value ) || ! is_finite( $value ) ) {
			return false;
		}
		return ! $integer || floor( $value ) === $value;
	}

	private function num( stdClass $obj, string $key, string $path, float $min, float $max, bool $integer = false ): void {
		if ( ! property_exists( $obj, $key ) ) {
			return;
		}
		$value = $obj->$key;
		$at    = $path . '/' . $key;
		if ( ! self::is_number( $value, $integer ) ) {
			$this->add( $at, 'type' );
			return;
		}
		if ( $value < $min || $value > $max ) {
			$this->add( $at, 'range' );
		}
	}

	/**
	 * Checks an enumerated string value.
	 *
	 * @param stdClass     $obj     Parent object.
	 * @param string       $key     Property name.
	 * @param string       $path    JSON pointer of the parent.
	 * @param list<string> $allowed Allowed values.
	 */
	private function enumeration( stdClass $obj, string $key, string $path, array $allowed ): void {
		if ( ! property_exists( $obj, $key ) ) {
			return;
		}
		$value = $obj->$key;
		$at    = $path . '/' . $key;
		if ( ! is_string( $value ) ) {
			$this->add( $at, 'type' );
			return;
		}
		if ( ! in_array( $value, $allowed, true ) ) {
			$this->add( $at, 'enum' );
		}
	}

	private function color( stdClass $obj, string $key, string $path, bool $nullable ): void {
		if ( ! property_exists( $obj, $key ) ) {
			return;
		}
		$value = $obj->$key;
		$at    = $path . '/' . $key;
		if ( null === $value && $nullable ) {
			return;
		}
		if ( ! is_string( $value ) ) {
			$this->add( $at, 'type' );
			return;
		}
		if ( 1 !== preg_match( self::COLOR_PATTERN, $value ) ) {
			$this->add( $at, 'pattern' );
		}
	}

	private function attachment( stdClass $obj, string $key, string $path ): void {
		if ( ! property_exists( $obj, $key ) || null === $obj->$key ) {
			return;
		}
		$this->num( $obj, $key, $path, 1, 9007199254740991, true );
	}

	private function id( stdClass $obj, string $key, string $path, bool $unique ): void {
		if ( ! property_exists( $obj, $key ) ) {
			return;
		}
		$value = $obj->$key;
		$at    = $path . '/' . $key;
		if ( ! is_string( $value ) ) {
			$this->add( $at, 'type' );
			return;
		}
		if ( 1 !== preg_match( self::ID_PATTERN, $value ) ) {
			$this->add( $at, 'pattern' );
			return;
		}
		if ( $unique ) {
			if ( isset( $this->ids[ $value ] ) ) {
				$this->add( $at, 'duplicate_id' );
			}
			$this->ids[ $value ] = true;
		}
	}

	/**
	 * Returns the list stored under `$key`, reporting type and count issues.
	 *
	 * @return array<int, mixed>
	 */
	private function list_of( stdClass $obj, string $key, string $path, int $min, int $max ): array {
		if ( ! property_exists( $obj, $key ) ) {
			return array();
		}
		$value = $obj->$key;
		$at    = $path . '/' . $key;
		if ( ! is_array( $value ) || ! array_is_list( $value ) ) {
			$this->add( $at, 'type' );
			return array();
		}
		$count = count( $value );
		if ( $count < $min || $count > $max ) {
			$this->add( $at, 'count' );
		}
		return $value;
	}

	private function validate_settings( mixed $value, string $path ): void {
		$settings = $this->object( $value, $path, array( 'label', 'layout', 'maxWidth', 'autoplay', 'loop', 'showArrows', 'showDots' ) );
		if ( null === $settings ) {
			return;
		}
		$this->str( $settings, 'label', $path, 0, Limits::LABEL_LENGTH );
		$this->enumeration( $settings, 'layout', $path, array( 'boxed', 'full' ) );
		$this->num( $settings, 'maxWidth', $path, Limits::MAX_WIDTH_MIN, Limits::MAX_WIDTH_MAX, true );
		$this->bool( $settings, 'autoplay', $path );
		$this->bool( $settings, 'loop', $path );
		$this->bool( $settings, 'showArrows', $path );
		$this->bool( $settings, 'showDots', $path );
	}

	private function validate_breakpoints( mixed $value, string $path ): void {
		$breakpoints = $this->object( $value, $path, array( 'desktop', 'tablet', 'mobile' ) );
		if ( null === $breakpoints ) {
			return;
		}
		$min_widths = array();
		foreach ( array( 'desktop', 'tablet', 'mobile' ) as $name ) {
			if ( ! property_exists( $breakpoints, $name ) ) {
				continue;
			}
			$at         = $path . '/' . $name;
			$breakpoint = $this->object( $breakpoints->$name, $at, array( 'minWidth', 'stageWidth', 'stageHeight' ) );
			if ( null === $breakpoint ) {
				continue;
			}
			$this->num( $breakpoint, 'minWidth', $at, 0, Limits::BREAKPOINT_MAX, true );
			$this->num( $breakpoint, 'stageWidth', $at, Limits::STAGE_MIN, Limits::STAGE_MAX, true );
			$this->num( $breakpoint, 'stageHeight', $at, Limits::STAGE_HEIGHT_MIN, Limits::STAGE_HEIGHT_MAX, true );
			if ( property_exists( $breakpoint, 'minWidth' ) && self::is_number( $breakpoint->minWidth, true ) ) {
				$min_widths[ $name ] = (float) $breakpoint->minWidth;
			}
		}
		$mobile  = $min_widths['mobile'] ?? null;
		$tablet  = $min_widths['tablet'] ?? null;
		$desktop = $min_widths['desktop'] ?? null;
		if ( null !== $mobile && 0.0 !== $mobile ) {
			$this->add( $path . '/mobile/minWidth', 'breakpoint_order' );
		}
		if ( null !== $mobile && null !== $tablet && $tablet <= $mobile ) {
			$this->add( $path . '/tablet/minWidth', 'breakpoint_order' );
		}
		if ( null !== $tablet && null !== $desktop && $desktop <= $tablet ) {
			$this->add( $path . '/desktop/minWidth', 'breakpoint_order' );
		}
	}

	/**
	 * Validates the font reference table.
	 *
	 * @return array<string, true> Known font reference IDs.
	 */
	private function validate_font_refs( stdClass $doc ): array {
		$ref_ids = array();
		foreach ( $this->list_of( $doc, 'fontRefs', '', 0, Limits::FONT_REFS ) as $index => $entry ) {
			$at  = '/fontRefs/' . $index;
			$ref = $this->object( $entry, $at, array( 'id', 'installationId', 'weight', 'style' ) );
			if ( null === $ref ) {
				continue;
			}
			$this->id( $ref, 'id', $at, false );
			if ( property_exists( $ref, 'id' ) && is_string( $ref->id ) ) {
				if ( isset( $ref_ids[ $ref->id ] ) ) {
					$this->add( $at . '/id', 'duplicate_id' );
				}
				$ref_ids[ $ref->id ] = true;
			}
			$this->id( $ref, 'installationId', $at, false );
			$this->num( $ref, 'weight', $at, 100, 900, true );
			if ( property_exists( $ref, 'weight' ) && self::is_number( $ref->weight, true ) && $ref->weight >= 100 && $ref->weight <= 900 && 0.0 !== fmod( (float) $ref->weight, 100.0 ) ) {
				$this->add( $at . '/weight', 'range' );
			}
			$this->enumeration( $ref, 'style', $at, array( 'normal', 'italic' ) );
		}
		return $ref_ids;
	}

	private function validate_layout_value( stdClass $obj, string $key, string $path ): void {
		switch ( $key ) {
			case 'x':
			case 'y':
				$this->num( $obj, $key, $path, -Limits::COORDINATE, Limits::COORDINATE );
				return;
			case 'width':
			case 'height':
				$this->num( $obj, $key, $path, Limits::SIZE_MIN, Limits::SIZE_MAX );
				return;
			case 'anchorX':
				$this->enumeration( $obj, $key, $path, array( 'left', 'center', 'right' ) );
				return;
			case 'anchorY':
				$this->enumeration( $obj, $key, $path, array( 'top', 'center', 'bottom' ) );
				return;
			case 'rotation':
				$this->num( $obj, $key, $path, -Limits::ROTATION_MAX, Limits::ROTATION_MAX );
				return;
			case 'visible':
				$this->bool( $obj, $key, $path );
				return;
		}
	}

	private function validate_style_value( stdClass $obj, string $key, string $path ): void {
		switch ( $key ) {
			case 'fontRef':
				if ( property_exists( $obj, 'fontRef' ) && null !== $obj->fontRef ) {
					$this->id( $obj, 'fontRef', $path, false );
				}
				return;
			case 'fontSize':
				$this->num( $obj, $key, $path, Limits::FONT_SIZE_MIN, Limits::FONT_SIZE_MAX );
				return;
			case 'lineHeight':
				$this->num( $obj, $key, $path, Limits::LINE_HEIGHT_MIN, Limits::LINE_HEIGHT_MAX );
				return;
			case 'letterSpacing':
				$this->num( $obj, $key, $path, Limits::LETTER_SPACING_MIN, Limits::LETTER_SPACING_MAX );
				return;
			case 'color':
				$this->color( $obj, $key, $path, false );
				return;
			case 'textAlign':
				$this->enumeration( $obj, $key, $path, array( 'left', 'center', 'right' ) );
				return;
			case 'backgroundColor':
				$this->color( $obj, $key, $path, true );
				return;
			case 'borderRadius':
				$this->num( $obj, $key, $path, 0, Limits::RADIUS_MAX );
				return;
			case 'paddingX':
			case 'paddingY':
				$this->num( $obj, $key, $path, 0, Limits::PADDING_MAX );
				return;
			case 'opacity':
				$this->num( $obj, $key, $path, 0, 1 );
				return;
		}
	}

	private function validate_phase( stdClass $obj, string $path ): void {
		$this->enumeration( $obj, 'preset', $path, self::ANIMATION_PRESETS );
		$this->num( $obj, 'startMs', $path, 0, Limits::ANIMATION_START_MAX_MS, true );
		$this->num( $obj, 'durationMs', $path, 0, Limits::ANIMATION_DURATION_MAX_MS, true );
		$this->enumeration( $obj, 'easing', $path, self::EASINGS );
		$this->num( $obj, 'distance', $path, 0, Limits::ANIMATION_DISTANCE_MAX );
	}

	private static function is_animation_number( mixed $value ): bool {
		return self::is_number( $value, true ) && $value >= 0;
	}

	private function validate_animation( mixed $value, string $path ): void {
		$animation = $this->object( $value, $path, array( 'enter', 'exit' ) );
		if ( null === $animation ) {
			return;
		}
		$enter_end = null;
		if ( property_exists( $animation, 'enter' ) ) {
			$enter = $this->object( $animation->enter, $path . '/enter', self::PHASE_KEYS );
			if ( null !== $enter ) {
				$this->validate_phase( $enter, $path . '/enter' );
				if ( property_exists( $enter, 'startMs' ) && property_exists( $enter, 'durationMs' )
					&& self::is_animation_number( $enter->startMs ) && self::is_animation_number( $enter->durationMs ) ) {
					$enter_end = $enter->startMs + $enter->durationMs;
				}
			}
		}
		if ( ! property_exists( $animation, 'exit' ) ) {
			return;
		}
		$at  = $path . '/exit';
		$raw = $animation->exit;
		if ( ! $raw instanceof stdClass ) {
			$this->add( $at, 'type' );
			return;
		}
		$mode = property_exists( $raw, 'mode' ) ? $raw->mode : null;
		if ( 'slide-end' === $mode ) {
			$this->object( $raw, $at, array( 'mode' ) );
			return;
		}
		if ( 'timed' !== $mode ) {
			$this->add( $at . '/mode', property_exists( $raw, 'mode' ) ? 'enum' : 'required' );
			return;
		}
		$exit = $this->object( $raw, $at, array_merge( array( 'mode' ), self::PHASE_KEYS ) );
		if ( null === $exit ) {
			return;
		}
		$this->validate_phase( $exit, $at );
		if ( null !== $enter_end && property_exists( $exit, 'startMs' ) && self::is_animation_number( $exit->startMs ) && $exit->startMs < $enter_end ) {
			$this->add( $at . '/startMs', 'animation_order' );
		}
	}

	private function validate_overrides( mixed $value, string $path ): void {
		$overrides = $this->object( $value, $path, array(), array( 'tablet', 'mobile' ) );
		if ( null === $overrides ) {
			return;
		}
		foreach ( array( 'tablet', 'mobile' ) as $name ) {
			if ( ! property_exists( $overrides, $name ) ) {
				continue;
			}
			$at       = $path . '/' . $name;
			$override = $this->object( $overrides->$name, $at, array(), array( 'layout', 'style' ) );
			if ( null === $override ) {
				continue;
			}
			if ( property_exists( $override, 'layout' ) ) {
				$layout = $this->object( $override->layout, $at . '/layout', array(), self::LAYOUT_KEYS );
				if ( null !== $layout ) {
					foreach ( self::LAYOUT_KEYS as $key ) {
						$this->validate_layout_value( $layout, $key, $at . '/layout' );
					}
				}
			}
			if ( property_exists( $override, 'style' ) ) {
				$style = $this->object( $override->style, $at . '/style', array(), self::OVERRIDABLE_STYLE_KEYS );
				if ( null !== $style ) {
					foreach ( self::OVERRIDABLE_STYLE_KEYS as $key ) {
						$this->validate_style_value( $style, $key, $at . '/style' );
					}
				}
			}
		}
	}

	private function validate_content( mixed $type, mixed $value, string $path ): void {
		switch ( $type ) {
			case 'text':
				$content = $this->object( $value, $path, array( 'text', 'tag' ) );
				if ( null === $content ) {
					return;
				}
				$this->str( $content, 'text', $path, 0, Limits::TEXT_LENGTH );
				$this->enumeration( $content, 'tag', $path, self::TEXT_TAGS );
				return;
			case 'image':
				$content = $this->object( $value, $path, array( 'attachmentId', 'alt', 'decorative', 'fit' ) );
				if ( null === $content ) {
					return;
				}
				$this->attachment( $content, 'attachmentId', $path );
				$this->str( $content, 'alt', $path, 0, Limits::ALT_LENGTH );
				$this->bool( $content, 'decorative', $path );
				$this->enumeration( $content, 'fit', $path, array( 'cover', 'contain' ) );
				return;
			case 'button':
				$content = $this->object( $value, $path, array( 'label', 'url', 'newTab' ) );
				if ( null === $content ) {
					return;
				}
				$this->str( $content, 'label', $path, 1, Limits::BUTTON_LABEL_LENGTH );
				$this->str( $content, 'url', $path, 1, Limits::URL_LENGTH );
				if ( property_exists( $content, 'url' ) && is_string( $content->url ) && '' !== $content->url && 1 !== preg_match( self::LINK_PATTERN, $content->url ) ) {
					$this->add( $path . '/url', 'url' );
				}
				$this->bool( $content, 'newTab', $path );
				return;
			default:
				// The layer type itself is reported by validate_layer(); content cannot be checked.
				return;
		}
	}

	/**
	 * Validates one layer.
	 *
	 * @param mixed               $value     Decoded layer.
	 * @param string              $path      JSON pointer.
	 * @param array<string, true> $font_refs Known font reference IDs.
	 */
	private function validate_layer( mixed $value, string $path, array $font_refs ): void {
		$layer = $this->object( $value, $path, array( 'id', 'type', 'name', 'locked', 'content', 'layout', 'style', 'overrides', 'animation' ) );
		if ( null === $layer ) {
			return;
		}
		$this->id( $layer, 'id', $path, true );
		$this->enumeration( $layer, 'type', $path, array( 'text', 'image', 'button' ) );
		$this->str( $layer, 'name', $path, 0, Limits::NAME_LENGTH );
		$this->bool( $layer, 'locked', $path );
		if ( property_exists( $layer, 'content' ) ) {
			$this->validate_content( property_exists( $layer, 'type' ) ? $layer->type : null, $layer->content, $path . '/content' );
		}
		if ( property_exists( $layer, 'layout' ) ) {
			$layout = $this->object( $layer->layout, $path . '/layout', self::LAYOUT_KEYS );
			if ( null !== $layout ) {
				foreach ( self::LAYOUT_KEYS as $key ) {
					$this->validate_layout_value( $layout, $key, $path . '/layout' );
				}
			}
		}
		if ( property_exists( $layer, 'style' ) ) {
			$style = $this->object( $layer->style, $path . '/style', self::STYLE_KEYS );
			if ( null !== $style ) {
				foreach ( self::STYLE_KEYS as $key ) {
					$this->validate_style_value( $style, $key, $path . '/style' );
				}
				if ( property_exists( $style, 'fontRef' ) && is_string( $style->fontRef ) && 1 === preg_match( self::ID_PATTERN, $style->fontRef ) && ! isset( $font_refs[ $style->fontRef ] ) ) {
					$this->add( $path . '/style/fontRef', 'reference' );
				}
			}
		}
		if ( property_exists( $layer, 'overrides' ) ) {
			$this->validate_overrides( $layer->overrides, $path . '/overrides' );
		}
		if ( property_exists( $layer, 'animation' ) ) {
			$this->validate_animation( $layer->animation, $path . '/animation' );
		}
	}

	/**
	 * Validates one slide.
	 *
	 * @param mixed               $value     Decoded slide.
	 * @param string              $path      JSON pointer.
	 * @param array<string, true> $font_refs Known font reference IDs.
	 */
	private function validate_slide( mixed $value, string $path, array $font_refs ): void {
		$slide = $this->object( $value, $path, array( 'id', 'name', 'enabled', 'durationMs', 'background', 'transition', 'layers' ) );
		if ( null === $slide ) {
			return;
		}
		$this->id( $slide, 'id', $path, true );
		$this->str( $slide, 'name', $path, 0, Limits::NAME_LENGTH );
		$this->bool( $slide, 'enabled', $path );
		$this->num( $slide, 'durationMs', $path, Limits::SLIDE_DURATION_MIN_MS, Limits::SLIDE_DURATION_MAX_MS, true );
		if ( property_exists( $slide, 'background' ) ) {
			$at         = $path . '/background';
			$background = $this->object( $slide->background, $at, array( 'color', 'attachmentId', 'fit' ) );
			if ( null !== $background ) {
				$this->color( $background, 'color', $at, true );
				$this->attachment( $background, 'attachmentId', $at );
				$this->enumeration( $background, 'fit', $at, array( 'cover', 'contain' ) );
			}
		}
		if ( property_exists( $slide, 'transition' ) ) {
			$at         = $path . '/transition';
			$transition = $this->object( $slide->transition, $at, array( 'type', 'durationMs' ) );
			if ( null !== $transition ) {
				$this->enumeration( $transition, 'type', $at, array( 'cut', 'fade', 'slide' ) );
				$this->num( $transition, 'durationMs', $at, 0, Limits::TRANSITION_MAX_MS, true );
			}
		}
		foreach ( $this->list_of( $slide, 'layers', $path, 0, Limits::LAYERS_PER_SLIDE ) as $index => $layer ) {
			$this->validate_layer( $layer, $path . '/layers/' . $index, $font_refs );
		}
	}
}

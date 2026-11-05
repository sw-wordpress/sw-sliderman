<?php
/**
 * Parameter schema dialect of effect modules.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Domain;

use stdClass;

/**
 * Closed JSON Schema subset (ADR 0005), identical in behaviour to assets/gpu/core/schema.ts:
 * both must report the same `{path, code}` set for every case in tests/fixtures/effects/schema.json.
 *
 * Schemas and values are decoded with objects preserved (`json_decode( …, false )`). Objects are
 * closed; numbers need `minimum`/`maximum`, strings `maxLength`, arrays `maxItems`, so effect
 * parameters stay bounded.
 */
final class EffectSchema {

	private const TYPES        = array( 'object', 'array', 'string', 'number', 'integer', 'boolean' );
	private const KEYWORDS     = array( 'type', 'properties', 'required', 'items', 'minItems', 'maxItems', 'enum', 'const', 'minimum', 'maximum', 'minLength', 'maxLength', 'format', 'oneOf', 'discriminator', 'default', 'title', 'description' );
	private const ONE_OF_KEYS  = array( 'oneOf', 'discriminator', 'default', 'title', 'description' );
	private const MAX_DEPTH    = 8;
	private const MAX_ENUM     = 64;
	private const MAX_ONE_OF   = 32;
	private const MAX_PROPS    = 64;
	private const COLOR_FORMAT = '/^#[0-9a-fA-F]{6}$/D';
	private const ID_FORMAT    = '/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/D';

	/**
	 * Structural check of a schema; an empty result means the schema is usable and bounded.
	 *
	 * @param mixed $schema Decoded schema.
	 *
	 * @return list<ValidationIssue>
	 */
	public static function check( mixed $schema ): array {
		$issues = array();
		self::check_node( $schema, '', 0, $issues );
		if ( array() === $issues && $schema instanceof stdClass ) {
			self::collect_defaults( $schema, '', $issues );
		}
		return $issues;
	}

	/**
	 * Validates a value against a checked schema.
	 *
	 * @param mixed $schema Decoded, checked schema.
	 * @param mixed $value  Decoded value (objects preserved).
	 *
	 * @return list<ValidationIssue>
	 */
	public static function validate( mixed $schema, mixed $value ): array {
		$issues = array();
		if ( $schema instanceof stdClass ) {
			self::validate_node( $schema, $value, '', $issues );
		}
		return $issues;
	}

	/** RFC 6901 escaping of a property name. */
	public static function escape( string $segment ): string {
		return str_replace( array( '~', '/' ), array( '~0', '~1' ), $segment );
	}

	/**
	 * @param list<ValidationIssue> $issues Collected issues.
	 */
	private static function bad( array &$issues, string $path ): void {
		$issues[] = new ValidationIssue( $path, 'schema' );
	}

	private static function is_count( mixed $value ): bool {
		return is_int( $value ) && $value >= 0;
	}

	private static function is_whole( mixed $value ): bool {
		return is_int( $value ) || ( is_float( $value ) && is_finite( $value ) && floor( $value ) === $value );
	}

	private static function is_number( mixed $value ): bool {
		return is_int( $value ) || ( is_float( $value ) && is_finite( $value ) );
	}

	private static function is_scalar( mixed $value ): bool {
		return is_string( $value ) || is_bool( $value ) || self::is_number( $value );
	}

	/** Strict equality with numeric awareness: JSON `1` and `1.0` are the same number (as in JavaScript). */
	private static function same( mixed $a, mixed $b ): bool {
		if ( self::is_number( $a ) && self::is_number( $b ) ) {
			return (float) $a === (float) $b;
		}
		return $a === $b;
	}

	/**
	 * @param list<ValidationIssue> $issues Collected issues.
	 */
	private static function check_node( mixed $node, string $path, int $depth, array &$issues ): void {
		if ( ! $node instanceof stdClass || $depth > self::MAX_DEPTH ) {
			self::bad( $issues, $path );
			return;
		}
		foreach ( array_keys( get_object_vars( $node ) ) as $key ) {
			if ( ! in_array( $key, self::KEYWORDS, true ) && ! str_starts_with( (string) $key, 'x-' ) ) {
				self::bad( $issues, $path . '/' . self::escape( (string) $key ) );
			}
		}
		if ( property_exists( $node, 'oneOf' ) ) {
			self::check_one_of( $node, $path, $depth, $issues );
			return;
		}
		$type = $node->type ?? null;
		if ( ! is_string( $type ) || ! in_array( $type, self::TYPES, true ) ) {
			self::bad( $issues, $path . '/type' );
			return;
		}
		if ( property_exists( $node, 'discriminator' ) ) {
			self::bad( $issues, $path . '/discriminator' );
		}
		$only = array(
			'object' => array( 'properties', 'required' ),
			'array'  => array( 'items', 'minItems', 'maxItems' ),
			'string' => array( 'minLength', 'maxLength', 'format' ),
			'number' => array( 'minimum', 'maximum' ),
		);
		foreach ( $only as $owner => $keys ) {
			$allowed = $type === $owner || ( 'number' === $owner && 'integer' === $type );
			foreach ( $keys as $key ) {
				if ( property_exists( $node, $key ) && ! $allowed ) {
					self::bad( $issues, $path . '/' . $key );
				}
			}
		}
		if ( 'object' === $type ) {
			self::check_object( $node, $path, $depth, $issues );
		}
		if ( 'array' === $type ) {
			if ( ! property_exists( $node, 'items' ) ) {
				self::bad( $issues, $path . '/items' );
			} else {
				self::check_node( $node->items, $path . '/items', $depth + 1, $issues );
			}
			$max = $node->maxItems ?? null;
			if ( ! self::is_count( $max ) ) {
				self::bad( $issues, $path . '/maxItems' );
			}
			if ( property_exists( $node, 'minItems' ) && ( ! self::is_count( $node->minItems ) || ( self::is_count( $max ) && $node->minItems > $max ) ) ) {
				self::bad( $issues, $path . '/minItems' );
			}
		}
		if ( 'string' === $type ) {
			$max = $node->maxLength ?? null;
			if ( ! self::is_count( $max ) ) {
				self::bad( $issues, $path . '/maxLength' );
			}
			if ( property_exists( $node, 'minLength' ) && ( ! self::is_count( $node->minLength ) || ( self::is_count( $max ) && $node->minLength > $max ) ) ) {
				self::bad( $issues, $path . '/minLength' );
			}
			if ( property_exists( $node, 'format' ) && 'color' !== $node->format && 'id' !== $node->format ) {
				self::bad( $issues, $path . '/format' );
			}
		}
		if ( 'number' === $type || 'integer' === $type ) {
			$min = $node->minimum ?? null;
			$max = $node->maximum ?? null;
			if ( ! self::is_number( $min ) ) {
				self::bad( $issues, $path . '/minimum' );
			}
			if ( ! self::is_number( $max ) ) {
				self::bad( $issues, $path . '/maximum' );
			}
			if ( self::is_number( $min ) && self::is_number( $max ) && $min > $max ) {
				self::bad( $issues, $path . '/minimum' );
			}
		}
		if ( property_exists( $node, 'enum' ) ) {
			$values = $node->enum;
			if ( ! is_array( $values ) || array() === $values || count( $values ) > self::MAX_ENUM || array_filter( $values, array( self::class, 'is_scalar' ) ) !== $values ) {
				self::bad( $issues, $path . '/enum' );
			}
		}
		if ( property_exists( $node, 'const' ) && ! self::is_scalar( $node->const ) ) {
			self::bad( $issues, $path . '/const' );
		}
	}

	/**
	 * @param list<ValidationIssue> $issues Collected issues.
	 */
	private static function check_object( stdClass $node, string $path, int $depth, array &$issues ): void {
		$properties = $node->properties ?? null;
		if ( ! $properties instanceof stdClass || count( get_object_vars( $properties ) ) > self::MAX_PROPS ) {
			self::bad( $issues, $path . '/properties' );
			return;
		}
		foreach ( get_object_vars( $properties ) as $key => $child ) {
			self::check_node( $child, $path . '/properties/' . self::escape( (string) $key ), $depth + 1, $issues );
		}
		if ( property_exists( $node, 'required' ) ) {
			$required = $node->required;
			$valid    = is_array( $required );
			foreach ( $valid ? $required : array() as $key ) {
				$valid = $valid && is_string( $key ) && property_exists( $properties, $key );
			}
			if ( ! $valid ) {
				self::bad( $issues, $path . '/required' );
			}
		}
	}

	/**
	 * @param list<ValidationIssue> $issues Collected issues.
	 */
	private static function check_one_of( stdClass $node, string $path, int $depth, array &$issues ): void {
		foreach ( array_keys( get_object_vars( $node ) ) as $key ) {
			if ( ! in_array( $key, self::ONE_OF_KEYS, true ) && ! str_starts_with( (string) $key, 'x-' ) ) {
				self::bad( $issues, $path . '/' . self::escape( (string) $key ) );
			}
		}
		$branches      = $node->oneOf;
		$discriminator = $node->discriminator ?? null;
		if ( ! is_string( $discriminator ) || '' === $discriminator ) {
			self::bad( $issues, $path . '/discriminator' );
		}
		if ( ! is_array( $branches ) || array() === $branches || count( $branches ) > self::MAX_ONE_OF ) {
			self::bad( $issues, $path . '/oneOf' );
			return;
		}
		$seen = array();
		foreach ( $branches as $index => $branch ) {
			$at = $path . '/oneOf/' . $index;
			self::check_node( $branch, $at, $depth + 1, $issues );
			// Without a valid discriminator the tag checks would only repeat the same root cause.
			if ( ! is_string( $discriminator ) || '' === $discriminator || ! $branch instanceof stdClass || 'object' !== ( $branch->type ?? null ) || ! ( $branch->properties ?? null ) instanceof stdClass ) {
				continue;
			}
			$tag      = $branch->properties->$discriminator ?? null;
			$value    = $tag instanceof stdClass ? ( $tag->const ?? null ) : null;
			$required = is_array( $branch->required ?? null ) ? $branch->required : array();
			if ( ! is_string( $value ) || in_array( $value, $seen, true ) || ! in_array( $discriminator, $required, true ) ) {
				self::bad( $issues, $at . '/properties' );
			}
			$seen[] = $value;
		}
	}

	/**
	 * @param list<ValidationIssue> $issues Collected issues.
	 */
	private static function collect_defaults( stdClass $node, string $path, array &$issues ): void {
		if ( property_exists( $node, 'default' ) ) {
			$copy = clone $node;
			unset( $copy->default );
			if ( array() !== self::validate( $copy, $node->default ) ) {
				self::bad( $issues, $path . '/default' );
			}
		}
		$children = array();
		if ( ( $node->properties ?? null ) instanceof stdClass ) {
			foreach ( get_object_vars( $node->properties ) as $key => $child ) {
				$children[ $path . '/properties/' . self::escape( (string) $key ) ] = $child;
			}
		}
		if ( ( $node->items ?? null ) instanceof stdClass ) {
			$children[ $path . '/items' ] = $node->items;
		}
		if ( is_array( $node->oneOf ?? null ) ) {
			foreach ( $node->oneOf as $index => $child ) {
				$children[ $path . '/oneOf/' . $index ] = $child;
			}
		}
		foreach ( $children as $at => $child ) {
			if ( $child instanceof stdClass ) {
				self::collect_defaults( $child, (string) $at, $issues );
			}
		}
	}

	/**
	 * @param list<ValidationIssue> $issues Collected issues.
	 */
	private static function validate_node( stdClass $node, mixed $value, string $path, array &$issues ): void {
		if ( is_array( $node->oneOf ?? null ) ) {
			self::validate_one_of( $node, $value, $path, $issues );
			return;
		}
		switch ( $node->type ?? null ) {
			case 'object':
				self::validate_object( $node, $value, $path, $issues );
				break;
			case 'array':
				self::validate_array( $node, $value, $path, $issues );
				break;
			case 'string':
				self::validate_string( $node, $value, $path, $issues );
				break;
			case 'number':
			case 'integer':
				self::validate_number( $node, $value, $path, $issues );
				break;
			case 'boolean':
				if ( ! is_bool( $value ) ) {
					$issues[] = new ValidationIssue( $path, 'type' );
				} else {
					self::check_enum( $node, $value, $path, $issues );
				}
				break;
		}
	}

	/**
	 * @param list<ValidationIssue> $issues Collected issues.
	 */
	private static function check_enum( stdClass $node, mixed $value, string $path, array &$issues ): void {
		$violated = false;
		if ( is_array( $node->enum ?? null ) ) {
			$violated = true;
			foreach ( $node->enum as $entry ) {
				if ( self::same( $entry, $value ) ) {
					$violated = false;
					break;
				}
			}
		} elseif ( property_exists( $node, 'const' ) && ! self::same( $node->const, $value ) ) {
			$violated = true;
		}
		if ( $violated ) {
			$issues[] = new ValidationIssue( $path, 'enum' );
		}
	}

	/**
	 * @param list<ValidationIssue> $issues Collected issues.
	 */
	private static function validate_object( stdClass $node, mixed $value, string $path, array &$issues ): void {
		if ( ! $value instanceof stdClass ) {
			$issues[] = new ValidationIssue( $path, 'type' );
			return;
		}
		$properties = $node->properties instanceof stdClass ? $node->properties : new stdClass();
		foreach ( array_keys( get_object_vars( $value ) ) as $key ) {
			if ( ! property_exists( $properties, (string) $key ) ) {
				$issues[] = new ValidationIssue( $path . '/' . self::escape( (string) $key ), 'unknown_key' );
			}
		}
		foreach ( is_array( $node->required ?? null ) ? $node->required : array() as $key ) {
			if ( ! property_exists( $value, (string) $key ) ) {
				$issues[] = new ValidationIssue( $path . '/' . self::escape( (string) $key ), 'required' );
			}
		}
		foreach ( get_object_vars( $properties ) as $key => $child ) {
			if ( property_exists( $value, (string) $key ) && $child instanceof stdClass ) {
				self::validate_node( $child, $value->$key, $path . '/' . self::escape( (string) $key ), $issues );
			}
		}
	}

	/**
	 * @param list<ValidationIssue> $issues Collected issues.
	 */
	private static function validate_one_of( stdClass $node, mixed $value, string $path, array &$issues ): void {
		if ( ! $value instanceof stdClass ) {
			$issues[] = new ValidationIssue( $path, 'type' );
			return;
		}
		$discriminator = (string) $node->discriminator;
		$at            = $path . '/' . self::escape( $discriminator );
		if ( ! property_exists( $value, $discriminator ) ) {
			$issues[] = new ValidationIssue( $at, 'required' );
			return;
		}
		foreach ( $node->oneOf as $branch ) {
			if ( $branch instanceof stdClass && self::same( $branch->properties->$discriminator->const, $value->$discriminator ) ) {
				self::validate_object( $branch, $value, $path, $issues );
				return;
			}
		}
		$issues[] = new ValidationIssue( $at, 'enum' );
	}

	/**
	 * @param list<ValidationIssue> $issues Collected issues.
	 */
	private static function validate_array( stdClass $node, mixed $value, string $path, array &$issues ): void {
		if ( ! is_array( $value ) ) {
			$issues[] = new ValidationIssue( $path, 'type' );
			return;
		}
		$min = is_int( $node->minItems ?? null ) ? $node->minItems : 0;
		if ( count( $value ) < $min || count( $value ) > $node->maxItems ) {
			$issues[] = new ValidationIssue( $path, 'count' );
		}
		foreach ( $value as $index => $item ) {
			if ( $node->items instanceof stdClass ) {
				self::validate_node( $node->items, $item, $path . '/' . $index, $issues );
			}
		}
	}

	/**
	 * @param list<ValidationIssue> $issues Collected issues.
	 */
	private static function validate_string( stdClass $node, mixed $value, string $path, array &$issues ): void {
		if ( ! is_string( $value ) ) {
			$issues[] = new ValidationIssue( $path, 'type' );
			return;
		}
		$length = mb_strlen( $value, 'UTF-8' );
		$min    = is_int( $node->minLength ?? null ) ? $node->minLength : 0;
		if ( $length < $min || $length > $node->maxLength ) {
			$issues[] = new ValidationIssue( $path, 'length' );
		}
		if ( 'color' === ( $node->format ?? null ) && 1 !== preg_match( self::COLOR_FORMAT, $value ) ) {
			$issues[] = new ValidationIssue( $path, 'pattern' );
		}
		if ( 'id' === ( $node->format ?? null ) && 1 !== preg_match( self::ID_FORMAT, $value ) ) {
			$issues[] = new ValidationIssue( $path, 'pattern' );
		}
		self::check_enum( $node, $value, $path, $issues );
	}

	/**
	 * @param list<ValidationIssue> $issues Collected issues.
	 */
	private static function validate_number( stdClass $node, mixed $value, string $path, array &$issues ): void {
		$valid = 'integer' === $node->type ? self::is_whole( $value ) : self::is_number( $value );
		if ( ! $valid ) {
			$issues[] = new ValidationIssue( $path, 'type' );
			return;
		}
		if ( $value < $node->minimum || $value > $node->maximum ) {
			$issues[] = new ValidationIssue( $path, 'range' );
		}
		self::check_enum( $node, $value, $path, $issues );
	}
}

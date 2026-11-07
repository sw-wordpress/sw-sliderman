<?php
/**
 * Contract test of the effect parameter schema dialect (PHP copy).
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Tests\Unit;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use stdClass;
use SW\Slider\Domain\EffectSchema;
use SW\Slider\Domain\ValidationIssue;
use SW\Slider\Tests\Support\Fixtures;

final class EffectSchemaTest extends TestCase {

	/**
	 * Expands `{"repeat": s, "times": n}` like the TypeScript test.
	 */
	private static function expand( mixed $value ): mixed {
		if ( $value instanceof stdClass && property_exists( $value, 'repeat' ) && property_exists( $value, 'times' ) ) {
			return str_repeat( (string) $value->repeat, (int) $value->times );
		}
		if ( $value instanceof stdClass ) {
			foreach ( get_object_vars( $value ) as $key => $entry ) {
				$value->$key = self::expand( $entry );
			}
			return $value;
		}
		return is_array( $value ) ? array_map( array( self::class, 'expand' ), $value ) : $value;
	}

	/**
	 * @param list<ValidationIssue> $issues Issues.
	 *
	 * @return list<string>
	 */
	private static function keys( array $issues ): array {
		$keys = array_map( static fn ( ValidationIssue $issue ): string => $issue->path . ' ' . $issue->code, $issues );
		sort( $keys );
		return $keys;
	}

	public static function value_cases(): iterable {
		$suite = Fixtures::object( 'effects/schema.json' );
		foreach ( $suite->cases as $case ) {
			yield $case->name => array( $suite->schemas->{$case->schema}, $case );
		}
	}

	#[DataProvider( 'value_cases' )]
	public function test_value_cases_report_exactly_the_expected_issues( stdClass $schema, stdClass $case ): void {
		$expected = array_map( static fn ( stdClass $issue ): string => $issue->path . ' ' . $issue->code, $case->issues );
		sort( $expected );
		self::assertSame( $expected, self::keys( EffectSchema::validate( $schema, self::expand( $case->value ) ) ) );
	}

	public function test_the_shared_schema_is_itself_valid(): void {
		$suite = Fixtures::object( 'effects/schema.json' );
		self::assertSame( array(), self::keys( EffectSchema::check( $suite->schemas->particle ) ) );
	}

	public static function bad_schemas(): iterable {
		$suite = Fixtures::object( 'effects/schema.json' );
		foreach ( $suite->badSchemas as $case ) {
			yield $case->name => array( $case );
		}
	}

	#[DataProvider( 'bad_schemas' )]
	public function test_schema_problems_are_located( stdClass $case ): void {
		$expected = array_map( static fn ( string $path ): string => $path . ' schema', $case->paths );
		sort( $expected );
		self::assertSame( $expected, self::keys( EffectSchema::check( $case->schema ) ) );
	}

	public function test_numbers_that_differ_only_by_json_notation_are_equal(): void {
		$schema = json_decode( '{"type":"number","minimum":0,"maximum":5,"enum":[1,2]}', false );
		self::assertSame( array(), EffectSchema::validate( $schema, 1.0 ) );
		self::assertSame( array( ' enum' ), self::keys( EffectSchema::validate( $schema, 3 ) ) );
	}

	public function test_non_finite_numbers_are_rejected(): void {
		$schema = json_decode( '{"type":"number","minimum":0,"maximum":5}', false );
		self::assertSame( array( ' type' ), self::keys( EffectSchema::validate( $schema, NAN ) ) );
		self::assertSame( array( ' type' ), self::keys( EffectSchema::validate( $schema, INF ) ) );
	}

	public function test_boolean_enum_and_const_are_checked(): void {
		$flag = json_decode( '{"type":"boolean","const":true}', false );
		self::assertSame( array(), EffectSchema::validate( $flag, true ) );
		self::assertSame( array( ' enum' ), self::keys( EffectSchema::validate( $flag, false ) ) );
	}
}

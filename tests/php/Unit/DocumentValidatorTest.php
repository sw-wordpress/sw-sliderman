<?php
/**
 * Contract tests of the document validator.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Tests\Unit;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use stdClass;
use SW\Slider\Domain\DocumentValidator;
use SW\Slider\Domain\Limits;
use SW\Slider\Domain\ValidationIssue;
use SW\Slider\Tests\Support\FixtureCatalog;
use SW\Slider\Tests\Support\Fixtures;

final class DocumentValidatorTest extends TestCase {

	/**
	 * @return iterable<string, array{string}>
	 */
	public static function valid_documents(): iterable {
		foreach ( (array) glob( Fixtures::path( 'documents/valid/*.json' ) ) as $file ) {
			yield basename( $file ) => array( 'documents/valid/' . basename( $file ) );
		}
	}

	#[DataProvider( 'valid_documents' )]
	public function test_valid_fixture_has_no_issues( string $fixture ): void {
		$issues = ( new DocumentValidator( new FixtureCatalog() ) )->validate( Fixtures::object( $fixture ) );
		self::assertSame( array(), array_map( static fn ( ValidationIssue $issue ): array => $issue->to_array(), $issues ) );
	}

	public function test_default_template_is_valid(): void {
		$json   = (string) file_get_contents( dirname( __DIR__, 3 ) . '/schemas/defaults/new-slider.json' );
		$issues = ( new DocumentValidator() )->validate_json( $json );
		self::assertSame( array(), $issues );
	}

	/**
	 * @return iterable<string, array{stdClass}>
	 */
	public static function invalid_cases(): iterable {
		$suite = Fixtures::object( 'documents/invalid.json' );
		foreach ( $suite->cases as $case ) {
			yield $case->name => array( $case );
		}
	}

	#[DataProvider( 'invalid_cases' )]
	public function test_invalid_case_reports_exactly_the_expected_issues( stdClass $fixture ): void {
		$document = Fixtures::patch( Fixtures::object( 'documents/valid/' . $fixture->base . '.json' ), $fixture->ops );
		$actual   = array_map(
			static fn ( ValidationIssue $issue ): string => $issue->path . ' ' . $issue->code,
			( new DocumentValidator( new FixtureCatalog() ) )->validate( $document )
		);
		$expected = array_map( static fn ( stdClass $issue ): string => $issue->path . ' ' . $issue->code, $fixture->issues );
		sort( $actual );
		sort( $expected );
		self::assertSame( $expected, $actual );
	}

	public function test_empty_object_and_list_are_distinguished(): void {
		$document           = Fixtures::object( 'documents/valid/basic.json' );
		$document->fontRefs = new stdClass();
		$issues             = ( new DocumentValidator() )->validate( $document );
		self::assertSame( '/fontRefs type', $issues[0]->path . ' ' . $issues[0]->code );
	}

	public function test_oversized_json_is_rejected_before_decoding(): void {
		$issues = ( new DocumentValidator() )->validate_json( str_repeat( ' ', Limits::DOCUMENT_BYTES + 1 ) );
		self::assertSame( 'too_large', $issues[0]->code );
	}

	public function test_malformed_json(): void {
		$issues = ( new DocumentValidator() )->validate_json( '{"schemaVersion":1,' );
		self::assertSame( 'json', $issues[0]->code );
	}

	public function test_non_finite_number_from_json_is_a_type_error(): void {
		$json   = str_replace( '"fontSize": 64', '"fontSize": 1e400', Fixtures::read( 'documents/valid/basic.json' ) );
		$issues = ( new DocumentValidator() )->validate_json( $json );
		self::assertSame( '/slides/0/layers/0/style/fontSize type', $issues[0]->path . ' ' . $issues[0]->code );
	}
	public function test_canonical_storage_size_matches_the_shared_cases(): void {
		$data = Fixtures::object( 'documents/size.json' );
		foreach ( $data->samples as $sample ) {
			self::assertSame( $sample->bytes, strlen( \SW\Slider\Domain\CanonicalJson::encode( $sample->value ) ) ); }
		foreach ( $data->cases as $case ) {
			$doc                    = Fixtures::object( 'documents/valid/basic.json' );
			$layer                  = $doc->slides[0]->layers[0];
			$doc->slides            = array( $doc->slides[0] );
			$doc->slides[0]->layers = array();
			for ( $index = 0; $index < $case->layers; ++$index ) {
				$copy                     = \SW\Slider\Domain\CanonicalJson::decode_tree( \SW\Slider\Domain\CanonicalJson::encode( $layer ) );
				$copy->id                 = 'layer-' . $index;
				$copy->content->text      = str_repeat( $case->text, $case->repeat );
				$doc->slides[0]->layers[] = $copy;
			}
			$issues = ( new DocumentValidator() )->validate( $doc );
			self::assertSame( $case->tooLarge, strlen( \SW\Slider\Domain\CanonicalJson::encode( $doc ) ) > Limits::DOCUMENT_BYTES, $case->name );
			self::assertSame( $case->tooLarge ? array( 'too_large' ) : array(), array_map( static fn ( ValidationIssue $issue ): string => $issue->code, $issues ), $case->name );
		}
	}
}

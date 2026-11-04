<?php
/**
 * Contract tests of layout resolution, CSS serialization and slide timing.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Tests\Unit;

use PHPUnit\Framework\TestCase;
use SW\Slider\Domain\LayoutResolver;
use SW\Slider\Domain\Schedule;
use SW\Slider\Rendering\StyleSerializer;
use SW\Slider\Tests\Support\Fixtures;

final class LayoutContractTest extends TestCase {

	/**
	 * @return array<string, array<string, mixed>>
	 */
	private static function layers_by_id( array $document ): array {
		$layers = array();
		foreach ( $document['slides'] as $slide ) {
			foreach ( $slide['layers'] as $layer ) {
				$layers[ $layer['id'] ] = $layer;
			}
		}
		return $layers;
	}

	public function test_golden_layout_and_css(): void {
		$document = Fixtures::assoc( 'documents/valid/basic.json' );
		$golden   = Fixtures::assoc( 'css/basic.json' );
		$layers   = self::layers_by_id( $document );
		$refs     = array( 'font-heading' => $document['fontRefs'][0] );
		foreach ( $golden['cases'] as $case ) {
			$stage    = $document['breakpoints'][ $case['breakpoint'] ];
			$resolved = LayoutResolver::resolve_layer( $layers[ $case['layer'] ], $case['breakpoint'], $document['breakpoints'] );
			$layer    = $layers[ $case['layer'] ];
			$kind     = 'shape' === $layer['type'] ? $layer['content']['kind'] : null;
			$css      = StyleSerializer::layer_declarations( $resolved, (float) $stage['stageWidth'], (float) $stage['stageHeight'], $refs, $kind );
			$label    = $case['breakpoint'] . '/' . $case['layer'];
			foreach ( $case['box'] as $key => $value ) {
				self::assertEqualsWithDelta( $value, $resolved['box'][ $key ], 1e-9, $label . ' ' . $key );
			}
			self::assertSame( $case['boxCss'], StyleSerializer::serialize( $css['box'] ), $label );
			self::assertSame( $case['bodyCss'], StyleSerializer::serialize( $css['body'] ), $label );
			self::assertSame( $case['stateCss'], 'button' === $layer['type'] ? StyleSerializer::button_state_css( '.sws-l-' . $layer['id'], $layer['content'] ) : '', $label );
		}
	}

	public function test_missing_override_inherits_and_mobile_inherits_tablet(): void {
		$layer = self::layers_by_id( Fixtures::assoc( 'documents/valid/basic.json' ) )['headline'];
		self::assertSame( 64, LayoutResolver::resolve_style( $layer, 'desktop' )['fontSize'] );
		self::assertSame( 48, LayoutResolver::resolve_style( $layer, 'tablet' )['fontSize'] );
		self::assertSame( 34, LayoutResolver::resolve_style( $layer, 'mobile' )['fontSize'] );
		self::assertSame( 'left', LayoutResolver::resolve_style( $layer, 'tablet' )['textAlign'] );
		self::assertSame( 140, LayoutResolver::resolve_layout( $layer, 'mobile' )['height'] );
		self::assertSame( 24, LayoutResolver::resolve_layout( $layer, 'mobile' )['x'] );
		self::assertSame( 100, LayoutResolver::resolve_layout( $layer, 'tablet' )['x'] );
	}

	public function test_breakpoint_boundaries_use_container_width(): void {
		$breakpoints = Fixtures::assoc( 'documents/valid/basic.json' )['breakpoints'];
		self::assertSame( 'mobile', LayoutResolver::breakpoint_for_width( $breakpoints, 767.9 ) );
		self::assertSame( 'tablet', LayoutResolver::breakpoint_for_width( $breakpoints, 768 ) );
		self::assertSame( 'tablet', LayoutResolver::breakpoint_for_width( $breakpoints, 1023 ) );
		self::assertSame( 'desktop', LayoutResolver::breakpoint_for_width( $breakpoints, 1024 ) );
	}

	public function test_effective_slide_duration(): void {
		$document = Fixtures::assoc( 'documents/valid/basic.json' );
		foreach ( Fixtures::assoc( 'schedule/basic.json' )['slides'] as $index => $expected ) {
			self::assertSame( $expected['effectiveDurationMs'], Schedule::effective_slide_duration_ms( $document['slides'][ $index ] ), $expected['id'] );
		}
	}

	public function test_number_format_matches_typescript_rules(): void {
		self::assertSame( '0', StyleSerializer::format_number( -0.00001 ) );
		self::assertSame( '-0.0001', StyleSerializer::format_number( -0.00005 ) );
		self::assertSame( '12.5', StyleSerializer::format_number( 12.5 ) );
		self::assertSame( '100', StyleSerializer::format_number( 100.0 ) );
		self::assertSame( '0.3333', StyleSerializer::format_number( 1 / 3 ) );
	}

	public function test_document_css_has_button_state_rules_and_round_circle_shapes(): void {
		$css = StyleSerializer::document_css( Fixtures::assoc( 'documents/valid/basic.json' ), 'abc123ef' );
		self::assertStringContainsString( '.sws-s-abc123ef .sws-l-cta .sws-layer__body:hover{background-color:#fde047;color:#1e293b;}', $css );
		self::assertStringContainsString( '.sws-s-abc123ef .sws-l-cta .sws-button:focus-visible{outline:3px solid #4f46e5;outline-offset:3px;}', $css );
		self::assertStringContainsString( 'border-radius:50%', $css );
		self::assertSame( '', StyleSerializer::button_state_css( '.x', array( 'label' => 'A' ) ) );
	}

	public function test_document_css_is_scoped_and_contains_no_document_text(): void {
		$document = Fixtures::assoc( 'documents/valid/basic.json' );
		$css      = StyleSerializer::document_css( $document, 'abc123ef' );
		self::assertStringStartsWith( '.sws-s-abc123ef{max-width:1440px;}', $css );
		self::assertStringContainsString( '@container sws (max-width: 767.98px){', $css );
		self::assertStringContainsString( '@container sws (min-width: 768px) and (max-width: 1023.98px){', $css );
		self::assertStringNotContainsString( 'Willkommen', $css );
		self::assertStringNotContainsString( '<', $css );
	}

	public function test_scope_is_sanitized(): void {
		$css = StyleSerializer::document_css( Fixtures::assoc( 'documents/valid/basic.json' ), 'ab}<x' );
		self::assertStringStartsWith( '.sws-s-ab{', $css );
	}

	public function test_golden_overlay_and_focal_css(): void {
		$document = Fixtures::assoc( 'documents/valid/background.json' );
		$golden   = Fixtures::assoc( 'css/background.json' );
		foreach ( $document['slides'] as $index => $slide ) {
			self::assertSame( $golden['slides'][ $index ]['css'], StyleSerializer::slide_background_css( '.sws-s-test .sws-sl-' . $slide['id'], $slide['background'] ) );
		}
		$photo = self::layers_by_id( $document )['photo'];
		self::assertSame( $golden['images'][0]['css'], StyleSerializer::image_focal_css( '.sws-s-test .sws-l-photo', $photo['content'] ) );
		$plain = array(
			'color'        => null,
			'attachmentId' => null,
			'fit'          => 'cover',
		);
		self::assertSame( '', StyleSerializer::slide_background_css( '.x', $plain ) );
		$centre = array(
			'focalX' => 50,
			'focalY' => 50,
		);
		self::assertSame( '', StyleSerializer::image_focal_css( '.x', $centre ) );
		self::assertStringContainsString( '.sws-s-abc123ef .sws-sl-slide-one::before{', StyleSerializer::document_css( $document, 'abc123ef' ) );
		self::assertStringContainsString( '.sws-s-abc123ef .sws-l-photo .sws-image{object-position:20% 80%;}', StyleSerializer::document_css( $document, 'abc123ef' ) );
	}
}

<?php
/**
 * Contract test of the rich text HTML output (identical to assets/shared/richtext.ts).
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Tests\Unit;

use PHPUnit\Framework\TestCase;
use SW\Slider\Domain\RichText;
use SW\Slider\Tests\Support\Fixtures;

final class RichTextTest extends TestCase {

	public function test_golden_html(): void {
		$golden = Fixtures::assoc( 'rich/render.json' );
		foreach ( $golden['cases'] as $case ) {
			$this->assertSame( $case['html'], RichText::to_html( $case['rich'] ), $case['name'] );
		}
	}

	public function test_malformed_input_never_produces_markup_from_data(): void {
		$broken = array(
			'junk',
			array( 'runs' => 'x' ),
			array(
				'runs' => array(
					5,
					array(
						'text' => 7,
						'bold' => 'yes',
					),
				),
			),
		);
		$html   = RichText::to_html( $broken );
		$this->assertSame( '<span class="sws-p"><br></span><span class="sws-p"><br></span><span class="sws-p"><br></span>', $html );
	}
}

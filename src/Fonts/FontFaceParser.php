<?php
/**
 * Restricted parser for provider font CSS.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Fonts;

/**
 * Parses Google Fonts CSS2 responses with a restricted grammar (PLAN.md 8.2, CODE-STYLE 10.7).
 *
 * Accepted input is a sequence of `/* subset *\/ @font-face { ... }` blocks with exactly the
 * descriptors font-family, font-style, font-weight, font-stretch, font-display, src and
 * unicode-range. `src` must be a single `url(https://...) format('woff2')`. Anything else
 * (imports, other at-rules, unknown descriptors, several sources) rejects the whole response.
 * The foreign CSS is never stored or output; only the extracted values are used.
 */
final class FontFaceParser {

	private const MAX_BYTES = 262144;
	private const MAX_FACES = 400;

	/**
	 * @return list<FontFace>
	 * @throws FontError When the CSS does not match the grammar.
	 */
	public function parse( string $css ): array {
		if ( strlen( $css ) > self::MAX_BYTES ) {
			throw new FontError( 'sws_font_css_too_large' );
		}
		$rest  = trim( $css );
		$faces = array();
		$block = '~\A/\*\s*([a-z0-9-]+|\[\d+\])\s*\*/\s*@font-face\s*\{([^{}]*)\}\s*~';
		while ( '' !== $rest ) {
			if ( 1 !== preg_match( $block, $rest, $match ) ) {
				throw new FontError( 'sws_font_css_unexpected' );
			}
			$faces[] = $this->parse_face( $match[1], $match[2] );
			if ( count( $faces ) > self::MAX_FACES ) {
				throw new FontError( 'sws_font_css_too_large' );
			}
			$rest = substr( $rest, strlen( $match[0] ) );
		}
		if ( array() === $faces ) {
			throw new FontError( 'sws_font_css_empty' );
		}
		return $faces;
	}

	private function parse_face( string $subset, string $body ): FontFace {
		$descriptors = array();
		foreach ( explode( ';', $body ) as $declaration ) {
			$declaration = trim( $declaration );
			if ( '' === $declaration ) {
				continue;
			}
			if ( 1 !== preg_match( '/\A([a-z-]+)\s*:\s*(.+)\z/s', $declaration, $match ) ) {
				throw new FontError( 'sws_font_css_unexpected' );
			}
			$name = $match[1];
			if ( isset( $descriptors[ $name ] ) || ! in_array( $name, array( 'font-family', 'font-style', 'font-weight', 'font-stretch', 'font-display', 'src', 'unicode-range' ), true ) ) {
				throw new FontError( 'sws_font_css_unexpected' );
			}
			$descriptors[ $name ] = trim( $match[2] );
		}
		foreach ( array( 'font-family', 'font-style', 'font-weight', 'src', 'unicode-range' ) as $required ) {
			if ( ! isset( $descriptors[ $required ] ) ) {
				throw new FontError( 'sws_font_css_unexpected' );
			}
		}
		if ( 1 !== preg_match( "/\A'([A-Za-z0-9 ]{1,80})'\z/", $descriptors['font-family'], $family )
			|| ! in_array( $descriptors['font-style'], array( 'normal', 'italic' ), true )
			|| 1 !== preg_match( '/\A[1-9]00\z/', $descriptors['font-weight'] )
			|| 1 !== preg_match( '/\A(?:U\+[0-9A-F?]{1,6}(?:-[0-9A-F]{1,6})?)(?:,\s*U\+[0-9A-F?]{1,6}(?:-[0-9A-F]{1,6})?)*\z/', $descriptors['unicode-range'] )
			|| 1 !== preg_match( "~\Aurl\((https://[A-Za-z0-9./_-]+\.woff2)\) format\('woff2'\)\z~", $descriptors['src'], $src ) ) {
			throw new FontError( 'sws_font_css_unexpected' );
		}
		return new FontFace(
			trim( $subset, '[]' ),
			$family[1],
			$descriptors['font-style'],
			(int) $descriptors['font-weight'],
			(string) preg_replace( '/,\s*/', ', ', $descriptors['unicode-range'] ),
			$src[1]
		);
	}
}

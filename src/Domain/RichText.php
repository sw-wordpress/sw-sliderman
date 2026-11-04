<?php
/**
 * Structured rich text to safe HTML (WordPress-free).
 *
 * Mirrors assets/shared/richtext.ts byte for byte (tests/fixtures/rich/render.json). Everything is
 * escaped and links failing the URL policy become plain text, even for unvalidated input.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Domain;

final class RichText {

	/**
	 * @param array<mixed> $rich Paragraphs, each `{runs: [{text, bold?, italic?, link?}]}`.
	 */
	public static function to_html( array $rich ): string {
		$html = '';
		foreach ( $rich as $paragraph ) {
			$inner = '';
			if ( is_array( $paragraph ) && isset( $paragraph['runs'] ) && is_array( $paragraph['runs'] ) ) {
				foreach ( $paragraph['runs'] as $run ) {
					$inner .= is_array( $run ) ? self::run( $run ) : '';
				}
			}
			$html .= '<span class="sws-p">' . ( '' === $inner ? '<br>' : $inner ) . '</span>';
		}
		return $html;
	}

	/**
	 * @param array<mixed> $run Run.
	 */
	private static function run( array $run ): string {
		$html = str_replace( "\n", '<br>', self::escape( is_string( $run['text'] ?? null ) ? $run['text'] : '' ) );
		if ( true === ( $run['italic'] ?? false ) ) {
			$html = '<em>' . $html . '</em>';
		}
		if ( true === ( $run['bold'] ?? false ) ) {
			$html = '<strong>' . $html . '</strong>';
		}
		$link = $run['link'] ?? null;
		if ( is_array( $link ) && is_string( $link['url'] ?? null ) && 1 === preg_match( DocumentValidator::LINK_PATTERN, $link['url'] ) ) {
			$target = true === ( $link['newTab'] ?? false ) ? ' target="_blank" rel="noopener noreferrer"' : '';
			$html   = '<a href="' . self::escape( $link['url'] ) . '"' . $target . '>' . $html . '</a>';
		}
		return $html;
	}

	private static function escape( string $value ): string {
		return htmlspecialchars( $value, ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML401, 'UTF-8' );
	}
}

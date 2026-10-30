<?php
/**
 * Local @font-face generation.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Fonts;

/**
 * Generates the stylesheet of an installation from its manifest (PLAN.md 8.3/8.4).
 *
 * URLs are relative to the stylesheet (`url('./<hash>.woff2')`), so the CSS keeps working after
 * domain or upload path changes and never points to another origin. Family names are internal
 * (`sws-<installation id>`).
 */
final class LocalFontCss {

	/**
	 * @param string                                                                                                          $family_name Internal family name.
	 * @param \Closure(string):?string|null                                                                                   $file_url Optional validated inline URL resolver.
	 * @param list<array{weight: int, style: string, files: list<array{subset: string, unicodeRange: string, file: string}>}> $variants    Installed variants.
	 */
	public static function build( string $family_name, array $variants, ?\Closure $file_url = null ): string {
		$css = '';
		if ( 1 !== preg_match( '/\Asws-[a-zA-Z0-9_-]{1,64}\z/', $family_name ) ) {
			return '';
		}
		foreach ( $variants as $variant ) {
			foreach ( $variant['files'] as $file ) {
				if ( 1 !== preg_match( '/\A[a-f0-9]{64}\.woff2\z/', $file['file'] ) || 1 !== preg_match( '/\A[a-z0-9-]{1,40}\z/', $file['subset'] ) || 1 !== preg_match( '/\A[U+0-9A-F?, -]+\z/', $file['unicodeRange'] ) ) {
					continue;
				}
				$url = null === $file_url ? './' . $file['file'] : $file_url( $file['file'] );
				if ( ! is_string( $url ) || preg_match( '/[\x00-\x20\x7f\'"()<>]/', $url ) ) {
					continue;
				}
				$css .= "/* {$file['subset']} */\n@font-face{font-family:'{$family_name}';font-style:" . ( 'italic' === $variant['style'] ? 'italic' : 'normal' )
					. ';font-weight:' . (int) $variant['weight'] . ";font-display:swap;src:url('{$url}') format('woff2');unicode-range:{$file['unicodeRange']};}\n";
			}
		}
		return $css;
	}
}

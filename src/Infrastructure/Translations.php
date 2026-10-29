<?php
/**
 * Translation loading.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Infrastructure;

/**
 * Loads the bundled PHP and script translations.
 *
 * German variants without an own catalog (de_DE_formal, de_AT, de_CH ...) fall back to the de_DE
 * files. The fallback must load the file explicitly: with just-in-time loading in recent WordPress
 * versions a `load_textdomain_mofile` filter is never consulted for a missing locale file.
 */
final class Translations {

	public const DOMAIN = 'sw-sliderman';

	public function __construct( private readonly string $languages_dir ) {
	}

	public function register(): void {
		add_action( 'init', array( $this, 'load' ), 1 );
		add_filter( 'load_script_translation_file', array( $this, 'script_file' ), 10, 3 );
	}

	public function load(): void {
		$locale = determine_locale();
		$file   = $this->languages_dir . '/' . self::DOMAIN . '-' . $locale . '.mo';
		if ( ! is_readable( $file ) && str_starts_with( $locale, 'de' ) ) {
			$file = $this->languages_dir . '/' . self::DOMAIN . '-de_DE.mo';
		}
		if ( is_readable( $file ) ) {
			load_textdomain( self::DOMAIN, $file, $locale );
		}
	}

	/**
	 * @param string|false $file   Resolved JSON file.
	 * @param string       $handle Script handle.
	 * @param string       $domain Text domain.
	 * @return string|false
	 */
	public function script_file( $file, $handle, $domain ) {
		if ( self::DOMAIN !== $domain || ( is_string( $file ) && is_readable( $file ) ) ) {
			return $file;
		}
		$locale = determine_locale();
		if ( ! str_starts_with( $locale, 'de' ) ) {
			return $file;
		}
		$fallback = $this->languages_dir . '/' . self::DOMAIN . '-de_DE-' . $handle . '.json';
		return is_readable( $fallback ) ? $fallback : $file;
	}
}

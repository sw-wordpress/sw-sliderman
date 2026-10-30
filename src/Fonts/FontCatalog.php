<?php
/**
 * Local font metadata catalog.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Fonts;

use Closure;

/**
 * Read-only access to the versioned catalog file `fonts/catalog.json` (built by
 * bin/build-font-catalog.php from official Google Fonts metadata). The catalog contains
 * metadata and license mapping only, never font files, and is not stored as an option.
 *
 * @phpstan-type Family array{id: string, family: string, category: string, license: string, licensePath: string, static: bool, subsets: list<string>, variants: list<array{weight: int, style: string}>}
 */
final class FontCatalog {

	/**
	 * Parsed catalog.
	 *
	 * @var array{catalogVersion: string, families: list<Family>}|null
	 */
	private ?array $data = null;

	public function __construct( private readonly string $file, private readonly ?Closure $updated_file = null ) {
	}

	/**
	 * @return array{catalogVersion: string, families: list<Family>}
	 */
	private function data(): array {
		if ( null === $this->data ) {
			$updated    = null === $this->updated_file ? null : ( $this->updated_file )();
			$file       = is_string( $updated ) && is_readable( $updated ) ? $updated : $this->file;
			$raw        = is_readable( $file ) ? (string) file_get_contents( $file ) : ''; // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- local bundled file.
			$decoded    = json_decode( $raw, true );
			$this->data = is_array( $decoded ) && isset( $decoded['families'] ) && is_array( $decoded['families'] )
				? array(
					'catalogVersion' => (string) ( $decoded['catalogVersion'] ?? '' ),
					'families'       => array_values( $decoded['families'] ),
				)
				: array(
					'catalogVersion' => '',
					'families'       => array(),
				);
		}
		return $this->data;
	}

	public function version(): string {
		return $this->data()['catalogVersion'];
	}

	/**
	 * @return list<Family>
	 */
	public function families(): array {
		return $this->data()['families'];
	}

	/**
	 * @return Family|null
	 */
	public function find( string $id ): ?array {
		foreach ( $this->families() as $family ) {
			if ( $family['id'] === $id ) {
				return $family;
			}
		}
		return null;
	}
}

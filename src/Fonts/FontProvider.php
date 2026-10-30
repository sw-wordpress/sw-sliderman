<?php
/**
 * Font provider boundary.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Fonts;

/**
 * Only an explicit installer/catalog action may call a remote provider.
 *
 * @phpstan-import-type Family from FontCatalog
 */
interface FontProvider {
	/**
	 * @param Family                               $family Catalog family.
	 * @param list<array{weight:int,style:string}> $variants Requested variants.
	 * @param list<string>                         $subsets Requested coverage.
	 * @return list<FontFace>
	 */
	public function resolve( array $family, array $variants, array $subsets ): array;
	public function download_font( string $url ): string;
	public function download_license( string $license_path ): string;
	public function metadata( string $license_path ): string;
}

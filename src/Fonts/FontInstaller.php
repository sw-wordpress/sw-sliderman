<?php
/**
 * Local installation of catalog fonts.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Fonts;

use Closure;
use SW\Slider\Domain\CanonicalJson;
use Throwable;

/**
 * Installs selected static variants of a catalog family locally (PLAN.md 8.3).
 *
 * Flow: validate request against the catalog -> lock per family -> resolve files -> download
 * and verify license and every WOFF2 file -> write to a temporary directory -> generate local CSS
 * -> activate with one rename -> register. Only a complete installation is registered; any
 * failure leaves existing installations untouched and removes the temporary directory.
 *
 * The installation directory and ID are derived from the content hash, so installing the same
 * selection twice reuses the existing installation instead of creating a copy. An update with
 * changed files creates a new installation; sliders stay pinned to their installation ID.
 *
 * @phpstan-import-type Installation from FontRepository
 * @phpstan-import-type Family from FontCatalog
 */
final class FontInstaller {

	private const LOCK_TTL_SECONDS = 300;
	private const MAX_FILES        = 60;

	/**
	 * @param Closure(): string $now_gmt Current UTC time `Y-m-d H:i:s`.
	 */
	public function __construct(
		private readonly FontCatalog $catalog,
		private readonly FontProvider $provider,
		private readonly FontRepository $repository,
		private readonly FontStorage $storage,
		private readonly Closure $now_gmt,
		private readonly bool|Closure $offline
	) {
	}

	/**
	 * Installs variants of a family.
	 *
	 * @param string $family_id Catalog family ID.
	 * @param mixed  $variants  Raw list of `{weight, style}` from the request.
	 * @param mixed  $subsets   Raw list of subset names from the request.
	 * @return Installation
	 * @throws FontError When the request is invalid or the installation fails.
	 */
	public function install( string $family_id, mixed $variants, mixed $subsets, ?Closure $checkpoint = null ): array {
		if ( $this->is_offline() ) {
			throw new FontError( 'sws_font_offline' );
		}
		$family = $this->catalog->find( $family_id );
		if ( null === $family ) {
			throw new FontError( 'sws_font_unknown_family' );
		}
		if ( ! $family['static'] ) {
			throw new FontError( 'sws_font_variable_unsupported' );
		}
		$variants = self::validated_variants( $family, $variants );
		$subsets  = self::validated_subsets( $family, $subsets );

		$token = $this->repository->acquire_lock( 'install_' . $family_id, self::LOCK_TTL_SECONDS );
		if ( null === $token ) {
			throw new FontError( 'sws_font_install_running' );
		}
		$temp  = null;
		$start = microtime( true );
		$check = function () use ( $start, $checkpoint, $family_id, $token ): void {
			if ( $this->is_offline() ) {
				throw new FontError( 'sws_font_offline' );
			}
			if ( microtime( true ) - $start > 180 ) {
				throw new FontError( 'sws_font_job_timeout' );
			}
			if ( ! $this->repository->renew_lock( 'install_' . $family_id, $token, self::LOCK_TTL_SECONDS ) ) {
				throw new FontError( 'sws_font_install_running' );
			}
			if ( null !== $checkpoint ) {
				$checkpoint();
			}
		};
		try {
			$check();
			$faces = $this->provider->resolve( $family, $variants, $subsets );
			if ( count( $faces ) > self::MAX_FILES ) {
				throw new FontError( 'sws_font_too_many_files' );
			}
			$check();
			$license = $this->provider->download_license( $family['licensePath'] );
			$temp    = $this->storage->create_temp();

			$manifest    = array();
			$total_bytes = 0;
			foreach ( $faces as $face ) {
				$check();
				$bytes        = $this->provider->download_font( $face->url );
				$total_bytes += strlen( $bytes );
				if ( $total_bytes > \SW\Slider\Domain\Limits::FONT_JOB_BYTES ) {
					throw new FontError( 'sws_font_too_large' );
				}
				$hash = hash( 'sha256', $bytes );
				$this->storage->write( $temp, $hash . '.woff2', $bytes );
				$key                         = $face->weight . '|' . $face->style;
				$manifest[ $key ]          ??= array(
					'weight' => $face->weight,
					'style'  => $face->style,
					'files'  => array(),
				);
				$manifest[ $key ]['files'][] = array(
					'subset'       => $face->subset,
					'unicodeRange' => $face->unicode_range,
					'file'         => $hash . '.woff2',
					'sha256'       => $hash,
					'sizeBytes'    => strlen( $bytes ),
				);
			}
			ksort( $manifest );
			$variants_manifest = array_values( $manifest );

			$check();
			return $this->commit( $family, $variants_manifest, $license, $temp, 'google-fonts', $this->catalog->version() );

		} catch ( Throwable $error ) {
			if ( null !== $temp ) {
				$this->storage->discard( $temp );
			}
			throw $error instanceof FontError ? $error : new FontError( 'sws_font_install_failed', $error->getMessage() );
		} finally {
			if ( null !== $temp ) {
				$this->storage->discard( $temp );
			}
			$this->repository->release_lock( 'install_' . $family_id, $token );
		}
	}

	public function catalog_metadata( string $license_path ): string {
		if ( $this->is_offline() ) {
			throw new FontError( 'sws_font_offline' );
		}
		return $this->provider->metadata( $license_path );
	}
	public function catalog_license( string $license_path ): string {
		if ( $this->is_offline() ) {
			throw new FontError( 'sws_font_offline' );
		}
		return $this->provider->download_license( $license_path );
	}

	private function is_offline(): bool {
		return $this->offline instanceof Closure ? ( $this->offline )() : $this->offline;
	}

	/**
	 * Import one user-supplied static WOFF2. No provider or outbound connection is used.
	 *
	 * @param array<string,mixed> $selection Family, weight, style, subset and license fields.
	 * @return Installation
	 */
	public function import_file( array $selection, string $bytes ): array {
		$family     = $selection['family'] ?? null;
		$weight     = $selection['weight'] ?? null;
		$style      = $selection['style'] ?? null;
		$subset     = $selection['subset'] ?? null;
		$license_id = $selection['licenseId'] ?? null;
		$license    = $selection['licenseText'] ?? null;
		$ranges     = array(
			'latin'     => 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0300-036F,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
			'latin-ext' => 'U+0000-024F,U+0300-036F,U+1E00-1EFF,U+2000-206F,U+20A0-20CF',
			'cyrillic'  => 'U+0000-024F,U+0300-036F,U+0400-052F,U+2000-206F,U+20AC',
			'greek'     => 'U+0000-024F,U+0300-03FF,U+1F00-1FFF,U+2000-206F,U+20AC',
		);
		if ( ! is_string( $family ) || 1 !== preg_match( '/\A[\pL\pN][\pL\pN ._-]{0,79}\z/u', $family ) || ! is_int( $weight ) || $weight < 100 || $weight > 900 || 0 !== $weight % 100
			|| ! in_array( $style, array( 'normal', 'italic' ), true ) || ! is_string( $subset ) || ! isset( $ranges[ $subset ] ) || ! is_string( $license_id ) || 1 !== preg_match( '/\A[A-Za-z0-9][A-Za-z0-9.+_-]{0,39}\z/', $license_id )
			|| ! is_string( $license ) || strlen( $license ) > 131072 || strlen( trim( $license ) ) < 20 || 1 !== preg_match( '//u', $license ) || 1 !== preg_match( '/licen[cs]e|lizenz|copyright/i', $license ) ) {
			throw new FontError( 'sws_font_invalid_request' );
		}
		if ( ! Woff2::is_static( $bytes ) ) {
			throw new FontError( 'sws_font_invalid_file' );
		}
		$family_id = 'local' . substr( hash( 'sha256', $family ), 0, 16 );
		$token     = $this->repository->acquire_lock( 'install_' . $family_id, self::LOCK_TTL_SECONDS );
		if ( null === $token ) {
			throw new FontError( 'sws_font_install_running' );
		}
		$temp = null;
		try {
			$temp = $this->storage->create_temp();
			$hash = hash( 'sha256', $bytes );
			$this->storage->write( $temp, $hash . '.woff2', $bytes );
			$variant = array(
				'weight' => $weight,
				'style'  => $style,
				'files'  => array(
					array(
						'subset'       => $subset,
						'unicodeRange' => $ranges[ $subset ],
						'file'         => $hash . '.woff2',
						'sha256'       => $hash,
						'sizeBytes'    => strlen( $bytes ),
					),
				),
			);
			return $this->commit(
				array(
					'id'          => $family_id,
					'family'      => $family,
					'license'     => $license_id,
					'licensePath' => 'manual',
					'category'    => 'custom',
				),
				array( $variant ),
				$license,
				$temp,
				'manual',
				'manual-v1'
			);
		} finally {
			if ( null !== $temp ) {
				$this->storage->discard( $temp );
			}
			$this->repository->release_lock( 'install_' . $family_id, $token );
		}
	}

	/**
	 * @param array{id:string,family:string,license:string,licensePath:string,category:string}                                                  $family Catalog or manual identity.
	 * @param list<array{weight:int,style:string,files:list<array{subset:string,unicodeRange:string,file:string,sha256:string,sizeBytes:int}>}> $variants Complete files.
	 * @return Installation
	 */
	private function commit( array $family, array $variants, string $license, string $temp, string $provider, string $catalog_version ): array {
		$hash     = hash( 'sha256', $family['id'] . "\n" . $family['license'] . "\n" . CanonicalJson::encode( $variants ) . "\n" . hash( 'sha256', $license ) );
		$id       = $family['id'] . '-' . substr( $hash, 0, 10 );
		$existing = $this->repository->find( $id );
		if ( null !== $existing && FontIntegrity::complete( $this->storage, $existing ) ) {
			return $existing;
		}
		$directory = 'fonts/' . substr( $hash, 0, 24 );
		$this->storage->write( $temp, 'font.css', LocalFontCss::build( 'sws-' . $id, $variants ) );
		$this->storage->write( $temp, 'LICENSE.txt', $license );
		$created      = $this->storage->activate( $temp, $directory );
		$installation = array(
			'id'           => $id,
			'familyId'     => $family['id'],
			'family'       => $family['family'],
			'category'     => $family['category'],
			'directory'    => $directory,
			'stylesheet'   => $directory . '/font.css',
			'variants'     => $variants,
			'license'      => array(
				'id'         => $family['license'],
				'file'       => $directory . '/LICENSE.txt',
				'sourcePath' => $family['licensePath'],
			),
			'source'       => array(
				'provider'       => $provider,
				'catalogVersion' => $catalog_version,
			),
			'installedGmt' => ( $this->now_gmt )(),
		);
		try {
			if ( ! FontIntegrity::complete( $this->storage, $installation ) ) {
				throw new FontError( 'sws_font_storage' );
			}
			if ( null !== $existing ) {
				return $existing;
			}
			$this->repository->save( $installation );
			return $installation;
		} catch ( Throwable $error ) {
			if ( $created && null === $existing ) {
				$this->storage->remove( $directory );
			}
			throw $error;
		}
	}

	/**
	 * Request variants that exist in the catalog, de-duplicated.
	 *
	 * @param Family $family Catalog family.
	 * @param mixed  $raw    Raw request value.
	 * @return list<array{weight: int, style: string}>
	 * @throws FontError For empty, unknown or malformed variants.
	 */
	public static function validated_variants( array $family, mixed $raw ): array {
		if ( ! is_array( $raw ) || array() === $raw || count( $raw ) > 18 ) {
			throw new FontError( 'sws_font_invalid_request' );
		}
		$valid = array();
		foreach ( $raw as $variant ) {
			if ( ! is_array( $variant ) || ! is_int( $variant['weight'] ?? null ) || ! is_string( $variant['style'] ?? null ) ) {
				throw new FontError( 'sws_font_invalid_request' );
			}
			$candidate = array(
				'weight' => $variant['weight'],
				'style'  => $variant['style'],
			);
			if ( ! in_array( $candidate, $family['variants'], true ) ) {
				throw new FontError( 'sws_font_variant_unavailable' );
			}
			$valid[ $candidate['weight'] . $candidate['style'] ] = $candidate;
		}
		return array_values( $valid );
	}

	/**
	 * Request subsets supported by the family.
	 *
	 * @param Family $family Catalog family.
	 * @param mixed  $raw    Raw request value.
	 * @return list<string>
	 * @throws FontError For empty or unsupported subsets.
	 */
	public static function validated_subsets( array $family, mixed $raw ): array {
		if ( ! is_array( $raw ) || array() === $raw ) {
			throw new FontError( 'sws_font_invalid_request' );
		}
		$valid = array();
		foreach ( $raw as $subset ) {
			if ( ! is_string( $subset ) || ! in_array( $subset, $family['subsets'], true ) ) {
				throw new FontError( 'sws_font_subset_unavailable' );
			}
			$valid[ $subset ] = $subset;
		}
		return array_values( $valid );
	}
}

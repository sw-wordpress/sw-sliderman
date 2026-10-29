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
		private readonly GoogleFontsProvider $provider,
		private readonly FontRepository $repository,
		private readonly FontStorage $storage,
		private readonly Closure $now_gmt,
		private readonly bool $offline
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
	public function install( string $family_id, mixed $variants, mixed $subsets ): array {
		if ( $this->offline ) {
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
		$temp = null;
		try {
			$faces = $this->provider->resolve( $family, $variants, $subsets );
			if ( count( $faces ) > self::MAX_FILES ) {
				throw new FontError( 'sws_font_too_many_files' );
			}
			$license = $this->provider->download_license( $family['licensePath'] );
			$temp    = $this->storage->create_temp();

			$manifest    = array();
			$total_bytes = 0;
			foreach ( $faces as $face ) {
				$bytes        = $this->provider->download_font( $face->url );
				$total_bytes += strlen( $bytes );
				if ( $total_bytes > \SW\Slider\Domain\Limits::FONT_JOB_BYTES ) {
					throw new FontError( 'sws_font_too_large' ); }
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

			$content_hash    = hash( 'sha256', $family_id . "\n" . CanonicalJson::encode( $variants_manifest ) . "\n" . hash( 'sha256', $license ) );
			$installation_id = $family_id . '-' . substr( $content_hash, 0, 10 );
			$existing        = $this->repository->find( $installation_id );
			if ( null !== $existing ) {
				return $existing;
			}

			$directory = 'fonts/' . substr( $content_hash, 0, 24 );
			$this->storage->write( $temp, 'font.css', LocalFontCss::build( 'sws-' . $installation_id, $variants_manifest ) );
			$this->storage->write( $temp, 'LICENSE.txt', $license );
			if ( ! $this->storage->activate( $temp, $directory ) ) {
				// Files of an identical, unregistered installation exist (e.g. an earlier crash after
				// the rename). Their names are content hashes, so they can be registered as they are.
				$this->storage->discard( $temp );
			}
			$temp = null;

			$installation = array(
				'id'           => $installation_id,
				'familyId'     => $family_id,
				'family'       => $family['family'],
				'category'     => $family['category'],
				'directory'    => $directory,
				'stylesheet'   => $directory . '/font.css',
				'variants'     => $variants_manifest,
				'license'      => array(
					'id'         => $family['license'],
					'file'       => $directory . '/LICENSE.txt',
					'sourcePath' => $family['licensePath'],
				),
				'source'       => array(
					'provider'       => 'google-fonts',
					'catalogVersion' => $this->catalog->version(),
				),
				'installedGmt' => ( $this->now_gmt )(),
			);
			$this->repository->save( $installation );
			return $installation;
		} catch ( Throwable $error ) {
			if ( null !== $temp ) {
				$this->storage->discard( $temp );
			}
			throw $error instanceof FontError ? $error : new FontError( 'sws_font_install_failed', $error->getMessage() );
		} finally {
			$this->repository->release_lock( 'install_' . $family_id, $token );
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

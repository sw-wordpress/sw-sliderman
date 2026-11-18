<?php
/** Verify first, take over owned resources, then create one unpublished slider.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\ImportExport;

use SW\Slider\Application\SliderService;
use SW\Slider\Domain\CanonicalJson;
use SW\Slider\Domain\DocumentValidator;
use SW\Slider\Domain\Limits;
use SW\Slider\Fonts\FontInstaller;
use SW\Slider\Fonts\FontRepository;
use SW\Slider\Fonts\FontStorage;
use SW\Slider\Infrastructure\UploadPaths;
use stdClass;

/**
 * The caller holds ResourceGuard for inspection/commit. Files and DB have no shared transaction:
 * only resources owned by this attempt are compensated if the final draft creation fails.
 *
 * @phpstan-import-type Manifest from PackageManifest
 */
final class PackageImporter {
	public function __construct(
		private readonly SliderService $sliders,
		private readonly DocumentValidator $validator,
		private readonly FontInstaller $installer,
		private readonly FontRepository $fonts,
		private readonly FontStorage $storage,
		private readonly string $version
	) {
	}

	/** @return array{manifest:Manifest,document:stdClass} */
	public function inspect( PackageArchive $archive ): array {
		$manifest = $archive->verify( $this->version );
		$json     = $archive->read( 'slider.json', Limits::DOCUMENT_BYTES );
		if ( array() !== $this->validator->validate_json( $json ) ) {
			throw new PackageError( 'document' );
		}
		$document = CanonicalJson::decode_tree( $json );
		if ( ! $document instanceof stdClass ) {
			throw new PackageError( 'document' );
		}
		$declared = array_column( $manifest['media'], 'id' );
		$used     = DocumentResources::media_ids( $document );
		sort( $declared );
		sort( $used );
		if ( $declared !== $used ) {
			throw new PackageError( 'resource' );
		}
		$font_ids = array();
		foreach ( $manifest['fonts'] as $raw ) {
			$font = PackageFonts::parse( $raw );
			if ( isset( $font_ids[ $font['id'] ] ) ) {
				throw new PackageError( 'font' );
			}
			$font_ids[ $font['id'] ] = $font;
			if ( ! $manifest['complete'] ) {
				continue;
			}
			$prefix  = 'fonts/' . $font['id'] . '/';
			$license = $archive->read( $prefix . 'LICENSE.txt', 131072 );
			if ( strlen( trim( $license ) ) < 20 || ! preg_match( '//u', $license ) || ! preg_match( '/licen[cs]e|lizenz|copyright/i', $license ) ) {
				throw new PackageError( 'font' );
			}
			foreach ( $font['variants'] as $variant ) {
				foreach ( $variant['files'] as $file ) {
					$bytes = $archive->read( $prefix . $file['file'], $file['sizeBytes'] );
					if ( ! hash_equals( $file['sha256'], hash( 'sha256', $bytes ) ) ) {
						throw new PackageError( 'hash' );
					}
				}
			}
		}
		$used_fonts = array();
		foreach ( $document->fontRefs as $ref ) {
			$font = $font_ids[ $ref->installationId ] ?? null;
			if ( null === $font || ! in_array(
				array(
					'weight' => $ref->weight,
					'style'  => $ref->style,
				),
				array_map(
					static fn ( array $variant ): array => array(
						'weight' => $variant['weight'],
						'style'  => $variant['style'],
					),
					$font['variants']
				),
				true
			) ) {
				throw new PackageError( 'font' );
			}
			$used_fonts[ $ref->installationId ] = true;
		}
		if ( count( $used_fonts ) !== count( $font_ids ) ) {
			throw new PackageError( 'font' );
		}
		return array(
			'manifest' => $manifest,
			'document' => $document,
		);
	}

	/**
	 * Report source identities that already refer to different resources on this site.
	 *
	 * @param Manifest $manifest Verified package metadata.
	 * @return list<string>
	 */
	public function conflicts( array $manifest ): array {
		$conflicts = array();
		foreach ( $manifest['media'] as $item ) {
			if ( null === $item['file'] || ! wp_attachment_is_image( $item['id'] ) || ! current_user_can( 'read_post', $item['id'] ) ) {
				continue;
			}
			$expected = pathinfo( $item['file'], PATHINFO_FILENAME );
			if ( ! $this->image_matches( $item['id'], $expected ) ) {
				$conflicts[] = '' === $item['alt'] ? (string) $item['id'] : $item['alt'];
			}
		}
		foreach ( $manifest['fonts'] as $raw ) {
			$incoming = PackageFonts::parse( $raw );
			$local    = $this->fonts->find( $incoming['id'] );
			if ( null !== $local && ( $incoming['familyId'] !== $local['familyId'] || $incoming['license']['id'] !== $local['license']['id'] || $incoming['variants'] !== $local['variants'] ) ) {
				$conflicts[] = $incoming['family'];
			}
		}
		return $conflicts;
	}

	/**
	 * @param \Closure(int,int):void|null $checkpoint Cancellation, progress and time boundary.
	 * @param array<int|string,mixed>     $media_map Explicit mappings for incomplete packages.
	 * @param array<string,mixed>         $font_map Explicit mappings to complete local installations.
	 */
	public function commit( PackageArchive $archive, string $scratch_file, array $media_map, array $font_map, ?\Closure $checkpoint = null ): int {
		$checked  = $this->inspect( $archive );
		$manifest = $checked['manifest'];
		$document = $checked['document'];
		$title    = sanitize_text_field( $manifest['title'] );
		if ( '' === trim( $title ) || mb_strlen( $title ) > 200 ) {
			throw new PackageError( 'manifest' );
		}
		$media = array();
		$fonts = array();
		// Validate every explicit replacement before creating anything.
		foreach ( $manifest['media'] as $item ) {
			if ( null !== $item['file'] ) {
				continue;
			}
			$target = $media_map[ $item['id'] ] ?? null;
			if ( ! is_int( $target ) || null === $this->usable_image_path( $target ) ) {
				throw new PackageError( 'mapping' );
			}
			$media[ $item['id'] ] = $target;
		}
		if ( ! $manifest['complete'] ) {
			foreach ( $document->fontRefs as $ref ) {
				$target = $font_map[ $ref->installationId ] ?? null;
				$local  = is_string( $target ) ? $this->fonts->find( $target ) : null;
				if ( null === $local || ! \SW\Slider\Fonts\FontIntegrity::complete( $this->storage, $local ) || ! in_array(
					array(
						'weight' => $ref->weight,
						'style'  => $ref->style,
					),
					array_map(
						static fn ( array $variant ): array => array(
							'weight' => $variant['weight'],
							'style'  => $variant['style'],
						),
						$local['variants']
					),
					true
				) ) {
					throw new PackageError( 'mapping' );
				}
				$fonts[ $ref->installationId ] = $local['id'];
			}
		}
		$done  = 0;
		$total = count( $manifest['media'] ) + ( $manifest['complete'] ? count( $manifest['fonts'] ) : 0 ) + 1;
		$check = static function () use ( &$done, $total, $checkpoint ): void {
			if ( null !== $checkpoint ) {
				$checkpoint( $done, $total );
			}
		};
		$check();
		$created_media = array();
		$created_fonts = array();
		try {
			require_once ABSPATH . 'wp-admin/includes/file.php';
			require_once ABSPATH . 'wp-admin/includes/media.php';
			require_once ABSPATH . 'wp-admin/includes/image.php';
			foreach ( $manifest['media'] as $item ) {
				$check();
				++$done;
				if ( null === $item['file'] ) {
					continue;
				}
				$bytes = $archive->read( $item['file'], Limits::FONT_JOB_BYTES );
				$hash  = hash( 'sha256', $bytes );
				$local = $this->identical_image( $hash );
				if ( null === $local ) {
					if ( strlen( $bytes ) !== file_put_contents( $scratch_file, $bytes ) ) { // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- private scratch file.
						throw new PackageError( 'storage' );
					}
					$result = media_handle_sideload(
						array(
							'name'     => basename( $item['file'] ),
							'tmp_name' => $scratch_file,
						),
						0
					);
					if ( is_wp_error( $result ) ) {
						throw new PackageError( 'storage' );
					}
					$local           = $result;
					$created_media[] = $local;
					update_post_meta( $local, '_sws_import_sha256', $hash );
					update_post_meta( $local, '_wp_attachment_image_alt', sanitize_text_field( $item['alt'] ) );
					update_post_meta( $local, '_sws_asset_license', sanitize_textarea_field( $item['license'] ) );
				}
				$media[ $item['id'] ] = $local;
			}
			if ( $manifest['complete'] ) {
				foreach ( $manifest['fonts'] as $raw ) {
					$check();
					++$done;
					$font                 = PackageFonts::parse( $raw );
					$prefix               = 'fonts/' . $font['id'] . '/';
					$local                = $this->installer->import_package( $font, static fn ( string $file, int $max ): string => $archive->read( $prefix . $file, $max ) );
					$fonts[ $font['id'] ] = $local['installation']['id'];
					$created_fonts[]      = $local;
				}
			}
			DocumentResources::map_media( $document, static fn ( int $id ): int => $media[ $id ] );
			foreach ( $document->fontRefs as $ref ) {
				$ref->installationId = $fonts[ $ref->installationId ];
			}
			$check();
			return $this->sliders->import_draft( $title, $document );
		} catch ( \Throwable $error ) {
			foreach ( $created_media as $id ) {
				wp_delete_attachment( $id, true );
			}
			foreach ( $created_fonts as $font ) {
				if ( $font['ownedRegistry'] ) {
					$this->fonts->delete( $font['installation']['id'] );
				}
				if ( $font['ownedDirectory'] ) {
					$this->storage->remove( $font['installation']['directory'] );
				}
			}
			throw $error;
		}
	}

	private function usable_image_path( int $id ): ?string {
		if ( ! wp_attachment_is_image( $id ) || ! current_user_can( 'read_post', $id ) || ! UploadPaths::same_origin( (string) wp_get_attachment_url( $id ), home_url( '/' ) ) ) {
			return null;
		}
		return $this->local_image_path( get_attached_file( $id, true ) );
	}

	private function local_image_path( mixed $file ): ?string {
		if ( ! is_string( $file ) || is_link( $file ) ) {
			return null;
		}
		$real    = realpath( $file );
		$uploads = wp_upload_dir( null, false );
		$base    = realpath( (string) $uploads['basedir'] );
		if ( false === $real || false === $base || ! str_starts_with( $real, $base . '/' ) || ! is_file( $real ) || ! is_readable( $real ) ) {
			return null;
		}
		$size = filesize( $real );
		return false !== $size && $size <= Limits::FONT_JOB_BYTES ? $real : null;
	}

	private function image_matches( int $id, string $hash ): bool {
		$attached = $this->usable_image_path( $id );
		if ( null === $attached ) {
			return false;
		}
		if ( hash_equals( $hash, (string) hash_file( 'sha256', $attached ) ) ) {
			return true;
		}
		// WordPress can retain the uploaded bytes separately from the scaled or converted file.
		$original = $this->local_image_path( wp_get_original_image_path( $id, true ) );
		return null !== $original && $original !== $attached
			&& hash_equals( $hash, (string) hash_file( 'sha256', $original ) ) && false !== wp_getimagesize( $attached );
	}

	private function identical_image( string $hash ): ?int {
		$ids = get_posts(
			array(
				'post_type'      => 'attachment',
				'post_status'    => 'inherit',
				'fields'         => 'ids',
				'posts_per_page' => 100,
				'meta_key'       => '_sws_import_sha256',
				'meta_value'     => $hash,
			)
		); // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key, WordPress.DB.SlowDBQuery.slow_db_query_meta_value -- bounded, explicit import action.
		foreach ( $ids as $id ) {
			if ( $this->image_matches( $id, $hash ) ) {
				return $id;
			}
		}
		return null;
	}
}

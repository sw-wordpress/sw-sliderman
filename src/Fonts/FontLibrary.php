<?php
/**
 * Installed font management.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Fonts;

use Closure;
use JsonException;
use SW\Slider\Domain\CanonicalJson;

/**
 * Lists installations and removes them only after a reference check (PLAN.md 8.4): drafts,
 * published snapshots and kept revisions count as references, so restoring an old state never
 * loses its fonts.
 *
 * @phpstan-import-type Installation from FontRepository
 */
final class FontLibrary {

	/**
	 * @param Closure(): iterable<string> $documents Every stored document JSON (drafts, snapshots, revisions).
	 */
	public function __construct(
		private readonly FontRepository $repository,
		private readonly FontStorage $storage,
		private readonly Closure $documents,
		private readonly ?Closure $exclusive = null
	) {
	}

	/**
	 * @return list<Installation>
	 */
	public function installations(): array {
		return $this->repository->all();
	}

	/**
	 * Whether the files of an installation are present (diagnostic, PLAN.md 8.4).
	 *
	 * @param Installation $installation Installation manifest.
	 */
	public function files_present( array $installation ): bool {
		return FontIntegrity::complete( $this->storage, $installation );
	}

	/**
	 * Installation IDs referenced by any stored document.
	 *
	 * @return array<string, true>
	 */
	public function referenced_ids(): array {
		$ids = array();
		foreach ( ( $this->documents )() as $json ) {
			try {
				$document = CanonicalJson::decode_assoc( $json );
			} catch ( JsonException ) {
				throw new FontError( 'sws_font_reference_unknown' );
			}
			if ( ( $document['schemaVersion'] ?? null ) !== 1 || ! is_array( $document['fontRefs'] ?? null ) ) {
				throw new FontError( 'sws_font_reference_unknown' );
			}
			foreach ( $document['fontRefs'] as $ref ) {
				if ( is_array( $ref ) && is_string( $ref['installationId'] ?? null ) ) {
					$ids[ $ref['installationId'] ] = true;
				}
			}
		}
		return $ids;
	}

	/**
	 * Removes an installation that no stored document references.
	 *
	 * @throws FontError When the installation is unknown or still referenced.
	 */
	public function uninstall( string $installation_id ): void {
		$operation = function () use ( $installation_id ): void {
			$this->uninstall_locked( $installation_id );
		};
		if ( null !== $this->exclusive ) {
			( $this->exclusive )( $operation );
		} else {
			$operation();
		}
	}
	private function uninstall_locked( string $installation_id ): void {
		$installation = $this->repository->find( $installation_id );
		if ( null === $installation ) {
			throw new FontError( 'sws_font_not_found' );
		}
		if ( isset( $this->referenced_ids()[ $installation_id ] ) ) {
			throw new FontError( 'sws_font_in_use' );
		}
		$token = $this->repository->acquire_lock( 'install_' . $installation['familyId'], 300 );
		if ( null === $token ) {
			throw new FontError( 'sws_font_install_running' );
		}
		try {
			$this->repository->delete( $installation_id );
			$this->storage->remove( $installation['directory'] );
		} finally {
			$this->repository->release_lock( 'install_' . $installation['familyId'], $token );
		}
	}
}

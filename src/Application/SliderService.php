<?php
/**
 * Slider use cases.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Application;

use JsonException;
use SW\Slider\Domain\CanonicalJson;
use SW\Slider\Domain\DocumentValidator;
use SW\Slider\Domain\ValidationIssue;

/**
 * Create, save and publish sliders (PLAN.md 4.3, 9.1).
 *
 * Authorization happens at the REST boundary; this service enforces the domain preconditions
 * for every caller: valid document, stable document identity, matching version and existing
 * resources. A failed publish never touches the active snapshot.
 */
final class SliderService {

	public function __construct(
		private readonly SliderRepository $repository,
		private readonly DocumentValidator $validator,
		private readonly ResourceChecker $resources,
		private readonly ArtifactStore $artifacts,
		private readonly ArtifactBuilder $builder,
		private readonly SystemPorts $system,
		private readonly string $template_json,
		private readonly \SW\Slider\Domain\DocumentMigrator $migrator = new \SW\Slider\Domain\DocumentMigrator(),
		private readonly ?ArtifactGuard $guard = null
	) {
	}

	/**
	 * Creates a slider from the default template with fresh document and slide IDs.
	 *
	 * @return int Post ID.
	 * @throws InvalidDocument When the bundled template is broken (installation error).
	 */
	public function create_slider( string $title ): int {
		try {
			$tree = CanonicalJson::decode_tree( $this->template_json );
		} catch ( JsonException ) {
			throw new InvalidDocument( array( new ValidationIssue( '', 'json' ) ) );
		}
		if ( ! CanonicalJson::is_object( $tree ) ) {
			throw new InvalidDocument( array( new ValidationIssue( '', 'type' ) ) );
		}
		$tree->id = $this->system->uuid();
		foreach ( $tree->slides as $slide ) {
			$slide->id = $this->system->uuid();
		}
		$issues = $this->validator->validate( $tree );
		if ( array() !== $issues ) {
			throw new InvalidDocument( $issues );
		}
		return $this->repository->create( $title, CanonicalJson::encode( $tree ) );
	}

	public function get( int $id ): StoredSlider {
		$slider = $this->repository->find( $id );
		if ( null === $slider ) {
			throw new SliderNotFound( 'Slider not found.' );
		}
		return $slider;
	}

	/** Validates persisted draft data before exposing it to the editor. */
	public function get_draft( int $id ): StoredSlider {
		$stored = $this->get( $id );
		$issues = $this->validator->validate_json( $stored->document_json );
		if ( array() !== $issues ) {
			throw new InvalidDocument( $issues );
		}
		return $stored;
	}

	/**
	 * Validates and stores a new draft version. Never publishes.
	 *
	 * @param mixed $document Decoded document tree (`json_decode( $json, false )`).
	 * @return int New version.
	 * @throws InvalidDocument|SliderNotFound|VersionConflict|RepositoryBusy On rejection.
	 */
	public function save_draft( int $id, string $title, mixed $document, int $expected_version ): int {
		$issues = $this->validator->validate( $document );
		if ( array() !== $issues ) {
			throw new InvalidDocument( $issues );
		}
		$stored = $this->get( $id );
		$tree   = $document;
		if ( ! CanonicalJson::is_object( $tree ) || $tree->id !== $this->document_id( $stored->document_json ) ) {
			throw new InvalidDocument( array( new ValidationIssue( '/id', 'immutable' ) ) );
		}
		return $this->repository->save_draft( $id, $title, CanonicalJson::encode( $tree ), $expected_version );
	}

	/**
	 * Publishes draft version `$expected_version`: validates document and resources, builds the
	 * artifact and only then switches the active snapshot.
	 *
	 * @throws InvalidDocument|SliderNotFound|VersionConflict|RepositoryBusy On rejection.
	 */
	public function publish( int $id, int $expected_version ): PublishedSnapshot {
		$stored = $this->get( $id );
		if ( $stored->version !== $expected_version ) {
			throw new VersionConflict( $stored->version );
		}
		// Stored data is input as well (CODE-STYLE 8.1): validate again before publishing.
		$issues = $this->validator->validate_json( $stored->document_json );
		if ( array() !== $issues ) {
			throw new InvalidDocument( $issues );
		}
		$document = CanonicalJson::decode_assoc( $stored->document_json );
		$enabled  = array_filter( $document['slides'], static fn ( array $slide ): bool => true === $slide['enabled'] );
		if ( array() === $enabled ) {
			throw new InvalidDocument( array( new ValidationIssue( '/slides', 'no_enabled_slide' ) ) );
		}
		$missing = $this->resources->missing_resources( $document );
		if ( array() !== $missing ) {
			throw new InvalidDocument( $missing );
		}

		$hash    = CanonicalJson::hash( $stored->document_json );
		$version = $this->builder->renderer_version();
		$css     = $this->builder->build_stylesheet( $document, substr( $hash, 0, 12 ) );
		$fonts   = array_values( array_unique( array_map( static fn ( array $ref ): string => (string) $ref['installationId'], $document['fontRefs'] ) ) );

		// A reused artifact must not be deleted by a cleanup between storing it and activating the snapshot.
		$store_and_activate = function () use ( $id, $expected_version, $hash, $version, $css, $stored, $fonts ): PublishedSnapshot {
			$stylesheet = $this->artifacts->store_stylesheet( substr( $hash, 0, 16 ) . '-r' . $version . '.css', $css );
			if ( null === $stylesheet ) {
				throw new StorageFailure( 'Could not store the complete publication artifact.' );
			}
			$snapshot = new PublishedSnapshot( $expected_version, $hash, $version, $this->system->now_gmt(), $stored->document_json, $stylesheet, $fonts, $stored->title );
			$this->repository->activate_snapshot( $id, $expected_version, $snapshot );
			return $snapshot;
		};
		return null === $this->guard ? $store_and_activate() : $this->guard->run( $store_and_activate );
	}

	public function migrate_draft( int $id, int $expected_version ): int {
		$stored = $this->get( $id );
		if ( $stored->version !== $expected_version ) {
			throw new VersionConflict( $stored->version ); }
		try {
			$source = CanonicalJson::decode_tree( $stored->document_json );
			if ( ! $source instanceof \stdClass ) {
				throw new \InvalidArgumentException( 'Invalid source.' ); }
			$target = $this->migrator->migrate( $source );
		} catch ( \InvalidArgumentException | JsonException ) {
			throw new InvalidDocument( array( new ValidationIssue( '/schemaVersion', 'schema_version' ) ) );
		}
		$issues = $this->validator->validate( $target );
		if ( array() !== $issues ) {
			throw new InvalidDocument( $issues ); }
		$json = CanonicalJson::encode( $target );
		if ( $json === $stored->document_json ) {
			return $stored->version; }
		return $this->save_draft( $id, $stored->title, $target, $expected_version );
	}

	/** Duplicates document-local identities; installed resource references remain pinned. */
	public function duplicate( int $id, string $title ): int {
		$source = $this->get( $id );
		$issues = $this->validator->validate_json( $source->document_json );
		if ( array() !== $issues ) {
			throw new InvalidDocument( $issues ); }
		$tree     = CanonicalJson::decode_tree( $source->document_json );
		$tree->id = $this->system->uuid();
		$fonts    = array();
		foreach ( $tree->fontRefs as $ref ) {
			$old           = $ref->id;
			$ref->id       = $this->system->uuid();
			$fonts[ $old ] = $ref->id;
		}
		foreach ( $tree->slides as $slide ) {
			$slide->id = $this->system->uuid();
			foreach ( $slide->layers as $layer ) {
				$layer->id = $this->system->uuid();
				if ( null !== $layer->style->fontRef ) {
					$layer->style->fontRef = $fonts[ $layer->style->fontRef ]; }
			}
		}
		return $this->repository->create( $title, CanonicalJson::encode( $tree ) );
	}

	/** @return list<SliderRevision> Historical snapshots, never public. */
	public function revisions( int $id ): array {
		$this->get( $id );
		return $this->repository->revisions( $id );
	}

	public function restore_revision( int $id, int $revision_id, int $expected_version ): int {
		$revision = $this->repository->revision( $id, $revision_id );
		if ( null === $revision ) {
			throw new SliderNotFound( 'Revision not found.' ); }
		return $this->save_draft( $id, $revision->title, CanonicalJson::decode_tree( $revision->document_json ), $expected_version );
	}

	public function autosave( int $id, string $title, mixed $document, int $expected_version ): int {
		$issues = $this->validator->validate( $document );
		if ( array() !== $issues ) {
			throw new InvalidDocument( $issues ); }
		$stored = $this->get( $id );
		if ( ! CanonicalJson::is_object( $document ) || $document->id !== $this->document_id( $stored->document_json ) ) {
			throw new InvalidDocument( array( new ValidationIssue( '/id', 'immutable' ) ) );
		}
		return $this->repository->autosave( $id, $title, CanonicalJson::encode( $document ), $expected_version );
	}

	/**
	 * @return array{items: list<StoredSlider>, total: int}
	 */
	public function list_sliders( int $page, int $per_page, string $search, bool $trashed = false ): array {
		return $this->repository->list_sliders( $page, $per_page, $search, $trashed );
	}

	public function trash( int $id ): void {
		$this->get( $id );
		$this->repository->trash( $id );
	}

	public function restore( int $id ): void {
		$this->repository->restore( $id );
	}

	public function delete_permanently( int $id ): void {
		$this->repository->delete_permanently( $id );
	}

	private function document_id( string $document_json ): string {
		try {
			$tree = CanonicalJson::decode_tree( $document_json );
		} catch ( JsonException ) {
			return '';
		}
		return CanonicalJson::is_object( $tree ) && is_string( $tree->id ?? null ) ? $tree->id : '';
	}
}

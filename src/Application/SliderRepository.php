<?php
/**
 * Slider persistence port.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Application;

/**
 * Persistence of slider drafts and published snapshots.
 *
 * Implementations MUST serialize concurrent writes per slider: a draft save or publish only
 * succeeds when `$expected_version` is still the current version at the moment of writing
 * (CODE-STYLE 8.3). A failed check throws VersionConflict and changes nothing.
 */
interface SliderRepository {

	public function find( int $id ): ?StoredSlider;

	/**
	 * Creates a new slider with version 1 and no published state.
	 *
	 * @return int Post ID.
	 */
	public function create( string $title, string $document_json ): int;

	/**
	 * Replaces the draft.
	 *
	 * @return int New version.
	 * @throws VersionConflict When `$expected_version` is outdated.
	 * @throws RepositoryBusy  When the write lock could not be acquired in time.
	 */
	public function save_draft( int $id, string $title, string $document_json, int $expected_version ): int;

	/**
	 * Activates a snapshot built from draft version `$expected_version`.
	 *
	 * @throws VersionConflict When the draft changed after the snapshot was built.
	 * @throws RepositoryBusy  When the write lock could not be acquired in time.
	 */
	public function activate_snapshot( int $id, int $expected_version, PublishedSnapshot $snapshot ): void;

	/**
	 * Lists sliders, newest modification first.
	 *
	 * @return array{items: list<StoredSlider>, total: int}
	 */
	public function list_sliders( int $page, int $per_page, string $search ): array;

	/**
	 * Every stored document (drafts and snapshots) for reference checks.
	 *
	 * @return iterable<string> Canonical document JSON strings.
	 */
	public function all_documents(): iterable;

	/** @return list<SliderRevision> Newest first, restricted to this parent. */
	public function revisions( int $id ): array;
	public function revision( int $id, int $revision_id ): ?SliderRevision;
	/** Saves a user-specific recovery draft without changing the working draft or live snapshot. */
	public function autosave( int $id, string $title, string $document_json, int $expected_version ): int;
	public function trash( int $id ): bool;
}

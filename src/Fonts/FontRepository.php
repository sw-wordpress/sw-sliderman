<?php
/**
 * Installed font registry port.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Fonts;

/**
 * Registry of complete font installations (PLAN.md 8.3 step 6) and installation locks.
 *
 * @phpstan-type Installation array{id: string, familyId: string, family: string, category: string, directory: string, stylesheet: string, variants: list<array{weight: int, style: string, files: list<array{subset: string, unicodeRange: string, file: string, sha256: string, sizeBytes: int}>}>, license: array{id: string, file: string, sourcePath: string}, source: array{provider: string, catalogVersion: string}, installedGmt: string}
 */
interface FontRepository {

	/**
	 * @return list<Installation>
	 */
	public function all(): array;

	/**
	 * @return Installation|null
	 */
	public function find( string $installation_id ): ?array;

	/**
	 * Registers a complete installation (files are already activated).
	 *
	 * @param Installation $installation Installation manifest.
	 */
	public function save( array $installation ): void;

	public function delete( string $installation_id ): void;

	/**
	 * Atomically acquires a lock; stale locks expire after `$ttl_seconds`.
	 *
	 * @return string|null Owner token, or null when another owner holds the lock.
	 */
	public function acquire_lock( string $key, int $ttl_seconds ): ?string;

	public function renew_lock( string $key, string $token, int $ttl_seconds ): bool;

	/** Releases the lock only if `$token` still owns it. */
	public function release_lock( string $key, string $token ): void;
}

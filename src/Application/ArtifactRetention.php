<?php
/**
 * Retention rule for stored artifacts.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Application;

/**
 * Decides which stored artifact files may be deleted (PLAN.md 11): only files that no active
 * snapshot has referenced for a conservative grace period. A page cached or
 * rendered just before a publication can therefore still load its stylesheet.
 */
final class ArtifactRetention {

	public const GRACE_SECONDS     = 604800; // Seven days.
	public const TEMPORARY_SECONDS = 86400;
	public const TEMPORARY_PREFIX  = '.tmp-';

	/**
	 * @param array<string, int> $files             Stylesheet file name => modification time (Unix).
	 * @param list<string>       $referenced        Relative paths (`artifacts/<name>`) of active snapshots.
	 * @param array<string, int> $unreferenced_since File name => Unix time the file was first seen unreferenced.
	 * @param int                $now               Current Unix time.
	 *
	 * @return array{delete: list<string>, since: array<string, int>} File names to delete and the updated
	 *         "unreferenced since" record. The grace period starts when the last reference disappeared,
	 *         not at the file's age: a long-published artifact stays available for cached pages after a
	 *         republication.
	 */
	public static function plan( array $files, array $referenced, array $unreferenced_since, int $now ): array {
		$keep   = array_flip( $referenced );
		$delete = array();
		$since  = array();
		foreach ( $files as $name => $modified ) {
			$name = (string) $name;
			if ( str_starts_with( $name, self::TEMPORARY_PREFIX ) ) {
				if ( $now - $modified >= self::TEMPORARY_SECONDS ) {
					$delete[] = $name;
				}
				continue;
			}
			if ( isset( $keep[ 'artifacts/' . $name ] ) ) {
				continue;
			}
			$first = min( $now, $unreferenced_since[ $name ] ?? $now );
			if ( $now - $first >= self::GRACE_SECONDS ) {
				$delete[] = $name;
			} else {
				$since[ $name ] = $first;
			}
		}
		sort( $delete );
		ksort( $since );
		return array(
			'delete' => $delete,
			'since'  => $since,
		);
	}
}

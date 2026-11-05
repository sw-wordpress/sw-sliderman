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
 * snapshot references and that are older than a conservative grace period. A page cached or
 * rendered just before a publication can therefore still load its stylesheet.
 */
final class ArtifactRetention {

	public const GRACE_SECONDS     = 604800; // Seven days.
	public const TEMPORARY_SECONDS = 86400;
	public const TEMPORARY_PREFIX  = '.tmp-';

	/**
	 * @param array<string, int> $files      Stylesheet file name => modification time (Unix).
	 * @param list<string>       $referenced Relative paths (`artifacts/<name>`) of active snapshots.
	 * @param int                $now        Current Unix time.
	 *
	 * @return list<string> File names to delete.
	 */
	public static function expired( array $files, array $referenced, int $now ): array {
		$keep    = array_flip( $referenced );
		$expired = array();
		foreach ( $files as $name => $modified ) {
			$name = (string) $name;
			if ( str_starts_with( $name, self::TEMPORARY_PREFIX ) ) {
				if ( $now - $modified >= self::TEMPORARY_SECONDS ) {
					$expired[] = $name;
				}
				continue;
			}
			if ( ! isset( $keep[ 'artifacts/' . $name ] ) && $now - $modified >= self::GRACE_SECONDS ) {
				$expired[] = $name;
			}
		}
		sort( $expired );
		return $expired;
	}
}

<?php
/**
 * Scheduled removal of unreferenced stylesheet artifacts.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Infrastructure;

use SW\Slider\Application\ArtifactRetention;

/**
 * Daily WP-Cron task. References come from the active snapshots in the database; a snapshot that
 * cannot be read aborts the run, so a damaged record never leads to a deletion. Deleted files can
 * always be recalculated on output (`Assets`), so the worst case is a slower first request.
 */
final class ArtifactCleanup {

	public const HOOK = 'sws_cleanup_artifacts';

	public function __construct( private readonly \wpdb $db ) {
	}

	public function register(): void {
		add_action(
			self::HOOK,
			function (): void {
				$this->run();
			}
		);
	}

	public static function schedule(): void {
		if ( false === wp_next_scheduled( self::HOOK ) ) {
			wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', self::HOOK );
		}
	}

	public static function unschedule(): void {
		wp_clear_scheduled_hook( self::HOOK );
	}

	/**
	 * @return int Number of deleted files.
	 */
	public function run( ?int $now = null ): int {
		$referenced = $this->referenced();
		$directory  = UploadPaths::base_dir() . '/artifacts';
		if ( null === $referenced || ! is_dir( $directory ) ) {
			return 0;
		}
		$files = array();
		foreach ( (array) scandir( $directory ) as $entry ) {
			$name = (string) $entry;
			$path = $directory . '/' . $name;
			// Skip `.`, `..` and hidden files, except our own temporary files.
			if ( str_starts_with( $name, '.' ) && ! str_starts_with( $name, ArtifactRetention::TEMPORARY_PREFIX ) ) {
				continue;
			}
			if ( is_file( $path ) && ! is_link( $path ) ) {
				$files[ $name ] = (int) filemtime( $path );
			}
		}
		$deleted = 0;
		foreach ( ArtifactRetention::expired( $files, $referenced, $now ?? time() ) as $name ) {
			wp_delete_file( $directory . '/' . $name );
			++$deleted;
		}
		return $deleted;
	}

	/**
	 * @return list<string>|null Referenced `artifacts/...` paths, or null when a snapshot is unreadable.
	 */
	private function referenced(): ?array {
		$rows = $this->db->get_col( $this->db->prepare( 'SELECT meta_value FROM %i WHERE meta_key=%s', $this->db->postmeta, '_sws_published' ) );
		$out  = array();
		foreach ( $rows as $raw ) {
			$snapshot = json_decode( (string) $raw, true );
			if ( ! is_array( $snapshot ) ) {
				return null;
			}
			if ( is_string( $snapshot['stylesheet'] ?? null ) ) {
				$out[] = $snapshot['stylesheet'];
			}
		}
		return $out;
	}
}

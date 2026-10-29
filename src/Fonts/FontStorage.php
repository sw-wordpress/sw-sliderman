<?php
/**
 * Font file storage port.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Fonts;

/**
 * Files of font installations below `uploads/sw-sliderman/fonts/`. Installations are prepared in
 * a temporary directory and activated by one rename; activated directories are immutable.
 */
interface FontStorage {

	/**
	 * @return string Opaque handle of a new, empty temporary directory.
	 * @throws FontError When the directory cannot be created.
	 */
	public function create_temp(): string;

	/**
	 * @throws FontError When the file cannot be written.
	 */
	public function write( string $temp, string $name, string $bytes ): void;

	/**
	 * Moves the temporary directory to `$relative_dir` atomically.
	 *
	 * @return bool False when the target already exists (identical installation).
	 * @throws FontError When the move fails.
	 */
	public function activate( string $temp, string $relative_dir ): bool;

	/** Removes a temporary directory created by this storage. */
	public function discard( string $temp ): void;

	/** Removes an activated installation directory. */
	public function remove( string $relative_dir ): void;

	public function exists( string $relative_dir ): bool;
}

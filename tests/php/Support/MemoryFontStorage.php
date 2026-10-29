<?php
/**
 * Test double.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Tests\Support;

use SW\Slider\Fonts\FontError;
use SW\Slider\Fonts\FontRepository;
use SW\Slider\Fonts\FontStorage;
use SW\Slider\Fonts\HttpClient;

/** File storage in memory. */
final class MemoryFontStorage implements FontStorage {

	/** @var array<string, array<string, string>> */
	public array $temp = array();

	/** @var array<string, array<string, string>> */
	public array $active = array();

	private int $counter = 0;

	public function create_temp(): string {
		$handle                = 'temp-' . ( ++$this->counter );
		$this->temp[ $handle ] = array();
		return $handle;
	}

	public function write( string $temp, string $name, string $bytes ): void {
		$this->temp[ $temp ][ $name ] = $bytes;
	}

	public function activate( string $temp, string $relative_dir ): bool {
		if ( isset( $this->active[ $relative_dir ] ) ) {
			return false;
		}
		$this->active[ $relative_dir ] = $this->temp[ $temp ];
		unset( $this->temp[ $temp ] );
		return true;
	}

	public function discard( string $temp ): void {
		unset( $this->temp[ $temp ] );
	}

	public function remove( string $relative_dir ): void {
		unset( $this->active[ $relative_dir ] );
	}

	public function exists( string $relative_dir ): bool {
		return isset( $this->active[ $relative_dir ] );
	}
	public function verify_file( string $relative_dir, string $name, string $sha256 ): bool {
		$bytes = $this->active[ $relative_dir ][ $name ] ?? null;
		return is_string( $bytes ) && hash_equals( $sha256, hash( 'sha256', $bytes ) );
	}
}

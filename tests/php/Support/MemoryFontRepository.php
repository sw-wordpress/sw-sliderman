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

/** Registry and lock table in memory. */
final class MemoryFontRepository implements FontRepository {

	/** @var array<string, array<string, mixed>> */
	public array $installations = array();

	/** @var array<string, string> */
	public array $locks = array();

	public function all(): array {
		return array_values( $this->installations );
	}

	public function find( string $installation_id ): ?array {
		return $this->installations[ $installation_id ] ?? null;
	}

	public function save( array $installation ): void {
		$this->installations[ $installation['id'] ] = $installation;
	}

	public function delete( string $installation_id ): void {
		unset( $this->installations[ $installation_id ] );
	}

	public function acquire_lock( string $key, int $ttl_seconds ): ?string {
		if ( isset( $this->locks[ $key ] ) ) {
			return null;
		}
		$this->locks[ $key ] = 'token';
		return 'token';
	}

	public function renew_lock( string $key, string $token, int $ttl_seconds ): bool {
		return ( $this->locks[ $key ] ?? null ) === $token;
	}

	public function release_lock( string $key, string $token ): void {
		if ( ( $this->locks[ $key ] ?? null ) === $token ) {
			unset( $this->locks[ $key ] );
		}
	}
}

<?php
/**
 * Explicit schema migration chain.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Domain;

use Closure;
use stdClass;
use InvalidArgumentException;
/** Pure migration dispatcher; a step must advance exactly one version and preserve identity. */
final class DocumentMigrator {
	/** @param array<int, Closure(stdClass): stdClass> $steps Registered source-version steps. */
	public function __construct( private readonly array $steps = array(), private readonly int $target_version = DocumentValidator::SCHEMA_VERSION ) {
	}
	/** @throws InvalidArgumentException For unsupported or invalid migration chains. */
	public function migrate( stdClass $source ): stdClass {
		$tree = CanonicalJson::decode_tree( CanonicalJson::encode( $source ) );
		if ( ! $tree instanceof stdClass || ! is_int( $tree->schemaVersion ?? null ) || $tree->schemaVersion < 1 || $tree->schemaVersion > $this->target_version ) {
			throw new InvalidArgumentException( 'Unsupported schema version.' );
		}
		while ( $tree->schemaVersion < $this->target_version ) {
			$version = $tree->schemaVersion;
			$id      = $tree->id ?? null;
			if ( ! isset( $this->steps[ $version ] ) ) {
				throw new InvalidArgumentException( 'Missing migration step.' );
			}
			$tree = ( $this->steps[ $version ] )( $tree );
			if ( ( $tree->schemaVersion ?? null ) !== $version + 1 || ( $tree->id ?? null ) !== $id ) {
				throw new InvalidArgumentException( 'Invalid migration step.' );
			}
		}
		return $tree;
	}
}

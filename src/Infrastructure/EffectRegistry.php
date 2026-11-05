<?php
/**
 * Registry of GPU effect types (built-in and add-on plugins).
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Infrastructure;

use stdClass;
use SW\Slider\Domain\EffectCatalog;
use SW\Slider\Domain\EffectDescriptor;
use SW\Slider\Domain\EffectSchema;

/**
 * Effect types come from two sources (ADR 0005):
 *
 * - built-in: `schemas/effects/<name>.json` (type without a slash), module in `build/gpu/`;
 * - add-ons: the filter `sws_register_effects` returns a list of descriptors (type `vendor/name`).
 *
 * An add-on descriptor is an array with `type`, `label`, `schema_version` (int), `schema` (array or
 * object in the dialect of {@see EffectSchema}), `module_url` (same-origin `.js`/`.mjs` below
 * `wp-content`), `version` (cache-busting string) and optionally `description`, `category`,
 * `continuous` (default true). Invalid descriptors are skipped and listed in {@see problems()}.
 * The module is trusted plugin code; documents only ever store schema-validated parameters.
 */
final class EffectRegistry implements EffectCatalog {

	/** Name of the filter add-on plugins use (documented in docs/GPU_EFFECTS.md). */
	public const FILTER = 'sws_register_effects';

	/**
	 * @var array<string, array<string, mixed>>|null
	 */
	private ?array $effects = null;

	/**
	 * @var list<string>
	 */
	private array $problems = array();

	public function __construct(
		private readonly string $plugin_dir,
		private readonly string $plugin_url,
		private readonly string $version
	) {
	}

	/** Forgets the loaded descriptors (the next access reads sources and filter again). */
	public function reset(): void {
		$this->effects  = null;
		$this->problems = array();
	}

	public function find( string $type ): ?EffectDescriptor {
		$effect = $this->all()[ $type ] ?? null;
		if ( null === $effect ) {
			return null;
		}
		return new EffectDescriptor( $type, (int) $effect['schema_version'], (bool) $effect['continuous'], $effect['schema'] );
	}

	/**
	 * All valid effect types, keyed by type id.
	 *
	 * @return array<string, array<string, mixed>>
	 */
	public function all(): array {
		if ( null === $this->effects ) {
			$this->load();
		}
		return $this->effects ?? array();
	}

	/**
	 * One descriptor (with `module_url` including the version query), or null.
	 *
	 * @return array<string, mixed>|null
	 */
	public function descriptor( string $type ): ?array {
		return $this->all()[ $type ] ?? null;
	}

	/**
	 * Reasons why descriptors were rejected (for diagnostics).
	 *
	 * @return list<string>
	 */
	public function problems(): array {
		$this->all();
		return $this->problems;
	}

	private function load(): void {
		$this->effects  = array();
		$this->problems = array();
		foreach ( (array) glob( $this->plugin_dir . 'schemas/effects/*.json' ) as $file ) {
			$json = is_string( $file ) && is_readable( $file ) ? file_get_contents( $file ) : false; // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- bundled local file.
			$data = false === $json ? null : json_decode( $json, true );
			if ( ! is_array( $data ) ) {
				$this->problems[] = 'Unreadable built-in effect descriptor ' . basename( (string) $file );
				continue;
			}
			$data['module_url'] = $this->plugin_url . 'build/gpu/' . ltrim( (string) ( $data['module'] ?? '' ), '/' );
			$data['version']    = $this->version;
			$this->add( $data, true );
		}
		$added = apply_filters( 'sws_register_effects', array() ); // Documented hook name, kept in FILTER.
		if ( is_array( $added ) ) {
			foreach ( $added as $descriptor ) {
				if ( is_array( $descriptor ) ) {
					$this->add( $descriptor, false );
				} else {
					$this->problems[] = 'Effect descriptor of an add-on is not an array';
				}
			}
		}
	}

	/**
	 * @param array<mixed> $data    Raw descriptor.
	 * @param bool         $builtin Whether it comes from this plugin.
	 */
	private function add( array $data, bool $builtin ): void {
		$type   = $data['type'] ?? null;
		$reject = function ( string $reason ) use ( $type ): void {
			$this->problems[] = sprintf( 'Effect "%s" rejected: %s', is_string( $type ) ? $type : '?', $reason );
		};
		if ( ! is_string( $type ) || strlen( $type ) > 64 || 1 !== preg_match( '/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\/[a-z][a-z0-9]*(?:-[a-z0-9]+)*)?$/D', $type ) ) {
			$reject( 'invalid type id' );
			return;
		}
		if ( str_contains( $type, '/' ) === $builtin ) {
			$reject( $builtin ? 'built-in types must not contain a slash' : 'add-on types must be written vendor/name' );
			return;
		}
		if ( isset( $this->effects[ $type ] ) ) {
			$reject( 'type already registered' );
			return;
		}
		$label = $data['label'] ?? null;
		if ( ! is_string( $label ) || '' === trim( $label ) || mb_strlen( $label, 'UTF-8' ) > 80 ) {
			$reject( 'invalid label' );
			return;
		}
		$schema_version = $data['schema_version'] ?? $data['schemaVersion'] ?? null;
		if ( ! is_int( $schema_version ) || $schema_version < 1 || $schema_version > 1000 ) {
			$reject( 'invalid schema_version' );
			return;
		}
		$schema = json_decode( (string) wp_json_encode( self::objectify( $data['schema'] ?? null ) ), false );
		if ( ! $schema instanceof stdClass || array() !== EffectSchema::check( $schema ) ) {
			$reject( 'invalid or unbounded parameter schema' );
			return;
		}
		// Built-in modules are built from this plugin's own URL; add-on URLs must prove their origin.
		$module_url = $builtin ? $this->versioned( (string) ( $data['module_url'] ?? '' ), $data['version'] ?? null ) : $this->module_url( $data['module_url'] ?? null, $data['version'] ?? null );
		if ( null === $module_url ) {
			$reject( 'module_url must be a same-origin .js/.mjs file below wp-content and needs a version string' );
			return;
		}
		$this->effects[ $type ] = array(
			'type'           => $type,
			'label'          => $label,
			'description'    => is_string( $data['description'] ?? null ) ? mb_substr( $data['description'], 0, 300, 'UTF-8' ) : '',
			'category'       => is_string( $data['category'] ?? null ) ? mb_substr( $data['category'], 0, 40, 'UTF-8' ) : '',
			'continuous'     => ! isset( $data['continuous'] ) || false !== $data['continuous'],
			'schema_version' => $schema_version,
			'schema'         => $schema,
			'module_url'     => $module_url,
			'builtin'        => $builtin,
		);
	}

	/**
	 * Schemas written as PHP arrays turn an empty `properties` into a JSON list; it must be an object.
	 */
	private static function objectify( mixed $node ): mixed {
		if ( ! is_array( $node ) ) {
			return $node;
		}
		if ( isset( $node['properties'] ) && is_array( $node['properties'] ) ) {
			$node['properties'] = array() === $node['properties'] ? new stdClass() : array_map( array( self::class, 'objectify' ), $node['properties'] );
		}
		foreach ( array( 'items' ) as $key ) {
			if ( isset( $node[ $key ] ) ) {
				$node[ $key ] = self::objectify( $node[ $key ] );
			}
		}
		if ( isset( $node['oneOf'] ) && is_array( $node['oneOf'] ) ) {
			$node['oneOf'] = array_map( array( self::class, 'objectify' ), $node['oneOf'] );
		}
		return $node;
	}

	private function versioned( string $url, mixed $version ): ?string {
		return '' !== $url && is_string( $version ) && 1 === preg_match( '/^[A-Za-z0-9._-]{1,32}$/D', $version ) ? $url . '?ver=' . rawurlencode( $version ) : null;
	}

	private function module_url( mixed $url, mixed $version ): ?string {
		if ( ! is_string( $url ) || strlen( $url ) > 500 || ! is_string( $version ) || 1 !== preg_match( '/^[A-Za-z0-9._-]{1,32}$/D', $version ) ) {
			return null;
		}
		$parts = wp_parse_url( $url );
		$home  = wp_parse_url( home_url() );
		$base  = wp_parse_url( content_url() );
		if ( ! is_array( $parts ) || ! is_array( $home ) || ! is_array( $base ) || isset( $parts['query'] ) || isset( $parts['fragment'] ) || isset( $parts['user'] ) ) {
			return null;
		}
		$path = (string) ( $parts['path'] ?? '' );
		$root = rtrim( (string) ( $base['path'] ?? '' ), '/' ) . '/';
		$same = strtolower( (string) ( $parts['host'] ?? '' ) ) === strtolower( (string) ( $home['host'] ?? '' ) )
			&& ( $parts['port'] ?? null ) === ( $home['port'] ?? null );
		if ( ! $same || ! str_starts_with( $path, $root ) || str_contains( $path, '..' ) || 1 !== preg_match( '/\.m?js$/D', $path ) ) {
			return null;
		}
		return set_url_scheme( $url ) . '?ver=' . rawurlencode( $version );
	}
}

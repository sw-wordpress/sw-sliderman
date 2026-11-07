<?php
/**
 * GPU effect layers (M10 G2): registry, validation, renderer, assets.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

use SW\Slider\Application\InvalidDocument;
use SW\Slider\Application\SliderService;
use SW\Slider\Domain\DocumentValidator;
use SW\Slider\Infrastructure\Capabilities;
use SW\Slider\Infrastructure\EffectRegistry;
use SW\Slider\Rendering\Assets;
use SW\Slider\Rendering\SliderRenderer;

final class EffectLayerTest extends WP_UnitTestCase {

	/** @var callable|null */
	private $filter = null;

	public function set_up(): void {
		parent::set_up();
		Capabilities::grant_defaults();
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );
	}

	public function tear_down(): void {
		if ( null !== $this->filter ) {
			remove_filter( EffectRegistry::FILTER, $this->filter );
		}
		parent::tear_down();
	}

	/**
	 * @return array<string, mixed>
	 */
	private function glow( array $overrides = array() ): array {
		return $overrides + array(
			'type'           => 'acme/glow',
			'label'          => 'Glow',
			'schema_version' => 1,
			'schema'         => array(
				'type'       => 'object',
				'properties' => array(
					'strength' => array(
						'type'    => 'number',
						'minimum' => 0,
						'maximum' => 1,
						'default' => 0.5,
					),
				),
			),
			'module_url'     => content_url( '/plugins/acme-glow/glow.js' ),
			'version'        => '1.2.3',
		);
	}

	/** @param list<array<string, mixed>> $descriptors Descriptors the add-on filter returns. */
	private function add_ons( array $descriptors ): EffectRegistry {
		$this->filter = static fn ( array $list ): array => array_merge( $list, $descriptors );
		add_filter( EffectRegistry::FILTER, $this->filter );
		return new EffectRegistry( SWS_DIR, SWS_URL, SWS_VERSION );
	}

	public function test_an_add_on_effect_is_registered_with_a_versioned_same_origin_module(): void {
		$registry   = $this->add_ons( array( $this->glow() ) );
		$descriptor = $registry->descriptor( 'acme/glow' );
		$this->assertNotNull( $descriptor );
		$this->assertSame( content_url( '/plugins/acme-glow/glow.js' ) . '?ver=1.2.3', $descriptor['module_url'] );
		$this->assertTrue( $descriptor['continuous'], 'continuous unless declared otherwise' );
		$this->assertFalse( $descriptor['builtin'] );
		$this->assertSame( array(), $registry->problems() );
		$found = $registry->find( 'acme/glow' );
		$this->assertSame( 1, $found?->schema_version );
		$this->assertNull( $registry->find( 'acme/missing' ) );
	}

	/**
	 * @return iterable<string, array{0: array<string, mixed>, 1: string}>
	 */
	public static function rejected(): iterable {
		$origin = content_url( '/plugins/acme-glow/glow.js' );
		yield 'add-on type without a vendor' => array( array( 'type' => 'glow' ), 'vendor/name' );
		yield 'invalid type id' => array( array( 'type' => 'Acme/Glow' ), 'invalid type id' );
		yield 'missing label' => array( array( 'label' => ' ' ), 'invalid label' );
		yield 'schema version zero' => array( array( 'schema_version' => 0 ), 'schema_version' );
		yield 'unbounded schema' => array( array( 'schema' => array( 'type' => 'object', 'properties' => array( 'n' => array( 'type' => 'number' ) ) ) ), 'unbounded' );
		yield 'schema that is not an object' => array( array( 'schema' => 'x' ), 'unbounded' );
		yield 'foreign origin' => array( array( 'module_url' => 'https://evil.example/wp-content/plugins/x/glow.js' ), 'same-origin' );
		yield 'outside wp-content' => array( array( 'module_url' => home_url( '/other/glow.js' ) ), 'same-origin' );
		yield 'path traversal' => array( array( 'module_url' => content_url( '/plugins/../../x.js' ) ), 'same-origin' );
		yield 'not a script' => array( array( 'module_url' => content_url( '/plugins/a/glow.php' ) ), 'same-origin' );
		yield 'query string' => array( array( 'module_url' => $origin . '?x=1' ), 'same-origin' );
		yield 'missing version' => array( array( 'version' => '' ), 'version string' );
		yield 'unsafe version' => array( array( 'version' => '1 2' ), 'version string' );
	}

	/**
	 * @dataProvider rejected
	 *
	 * @param array<string, mixed> $override Fields replaced in a valid descriptor.
	 */
	public function test_invalid_add_on_descriptors_are_skipped_and_reported( array $override, string $reason ): void {
		$registry = $this->add_ons( array( $this->glow( $override ) ) );
		$this->assertSame( array( 'particle-field' ), array_keys( $registry->all() ), 'only the shipped effect remains' );
		$this->assertStringContainsString( $reason, implode( ' | ', $registry->problems() ) );
	}

	public function test_duplicates_and_non_array_descriptors_are_reported(): void {
		$registry = $this->add_ons( array( $this->glow(), $this->glow() ) );
		$this->filter = static fn ( array $list ): array => array_merge( $list, array( 'not an array' ) );
		$this->assertSame( array( 'particle-field', 'acme/glow' ), array_keys( $registry->all() ) );
		$this->assertStringContainsString( 'already registered', implode( '|', $registry->problems() ) );
		remove_filter( EffectRegistry::FILTER, $this->filter );
		add_filter( EffectRegistry::FILTER, $this->filter );
		$registry->reset();
		$this->assertStringContainsString( 'not an array', implode( '|', $registry->problems() ) );
	}

	public function test_built_in_effects_come_from_schema_files_and_may_not_contain_a_slash(): void {
		$root = get_temp_dir() . 'sws-fx-' . wp_generate_uuid4() . '/';
		wp_mkdir_p( $root . 'schemas/effects' );
		$descriptor = array(
			'type'           => 'sparkle',
			'label'          => 'Sparkle',
			'schemaVersion'  => 3,
			'continuous'     => false,
			'module'         => 'sparkle.js',
			'schema'         => array(
				'type'       => 'object',
				'properties' => array(),
			),
		);
		file_put_contents( $root . 'schemas/effects/sparkle.json', (string) wp_json_encode( $descriptor ) );
		file_put_contents( $root . 'schemas/effects/bad.json', (string) wp_json_encode( array( 'type' => 'a/b' ) + $descriptor ) );
		file_put_contents( $root . 'schemas/effects/broken.json', '{nope' );
		$registry = new EffectRegistry( $root, 'https://example.org/plugin/', '9.9.9' );
		$this->assertSame( array( 'sparkle' ), array_keys( $registry->all() ) );
		$this->assertSame( 3, $registry->find( 'sparkle' )?->schema_version );
		$this->assertFalse( $registry->find( 'sparkle' )?->continuous );
		$problems = implode( ' | ', $registry->problems() );
		$this->assertStringContainsString( 'must not contain a slash', $problems );
		$this->assertStringContainsString( 'Unreadable built-in', $problems );
	}

	// -------------------------------------------------------------------------------------------
	// Document, service and renderer.
	// -------------------------------------------------------------------------------------------

	private function service( EffectRegistry $registry ): SliderService {
		global $wpdb;
		return new SliderService(
			new \SW\Slider\Infrastructure\WpSliderRepository( $wpdb ),
			new DocumentValidator( $registry ),
			new \SW\Slider\Infrastructure\WpResourceChecker( new \SW\Slider\Fonts\WpFontRepository(), new \SW\Slider\Fonts\UploadsFontStorage() ),
			new \SW\Slider\Infrastructure\UploadsArtifactStore(),
			new \SW\Slider\Rendering\CssArtifactBuilder(),
			new \SW\Slider\Infrastructure\WpSystemPorts(),
			(string) file_get_contents( SWS_DIR . 'schemas/defaults/new-slider.json' ), // phpcs:ignore WordPress.WP.AlternativeFunctions
		);
	}

	private function renderer( EffectRegistry $registry, ?Assets $assets = null ): SliderRenderer {
		global $wpdb;
		$repository = new \SW\Slider\Infrastructure\WpSliderRepository( $wpdb );
		$assets   ??= new Assets( $repository, new \SW\Slider\Fonts\WpFontRepository(), SWS_URL, SWS_DIR, SWS_VERSION, $registry );
		return new SliderRenderer( $repository, $assets, $registry, new DocumentValidator( $registry ) );
	}

	/**
	 * Draft document with one effect layer on slide one.
	 *
	 * @param array<string, mixed> $content Effect content overrides.
	 */
	private function document_with_effect( SliderService $service, int $id, array $content = array(), int $slides = 1 ): object {
		$document = json_decode( $service->get_draft( $id )->document_json );
		$content  = $content + array(
			'effect'          => 'acme/glow',
			'schemaVersion'   => 1,
			'seed'            => 7,
			'quality'         => 'auto',
			'params'          => array( 'strength' => 0.8 ),
			'alt'             => 'Nebel',
			'fallbackImageId' => null,
			'assets'          => new stdClass(),
		);
		// Empty JSON objects, not lists.
		$content['params'] = array() === $content['params'] ? new stdClass() : $content['params'];
		$content['assets'] = array() === $content['assets'] ? new stdClass() : $content['assets'];
		$layer    = json_decode(
			(string) wp_json_encode(
				array(
					'id'        => 'fx',
					'type'      => 'effect',
					'name'      => 'Effekt',
					'locked'    => false,
					'content'   => $content,
					'layout'    => array(
						'x'        => 0,
						'y'        => 0,
						'width'    => 1440,
						'height'   => 600,
						'anchorX'  => 'left',
						'anchorY'  => 'top',
						'rotation' => 0,
						'visible'  => true,
					),
					'style'     => array(
						'fontRef'         => null,
						'fontSize'        => 20,
						'lineHeight'      => 1.2,
						'letterSpacing'   => 0,
						'color'           => '#ffffff',
						'textAlign'       => 'center',
						'backgroundColor' => null,
						'borderRadius'    => 0,
						'paddingX'        => 0,
						'paddingY'        => 0,
						'opacity'         => 1,
					),
					'overrides' => new stdClass(),
					'animation' => array(
						'enter' => array(
							'preset'     => 'none',
							'startMs'    => 0,
							'durationMs' => 0,
							'easing'     => 'ease',
							'distance'   => 0,
						),
						'exit'  => array( 'mode' => 'slide-end' ),
					),
				)
			),
			false
		);
		$document->slides[0]->layers[] = $layer;
		for ( $i = 1; $i < $slides; $i++ ) {
			$copy         = json_decode( (string) wp_json_encode( $document->slides[0] ) );
			$copy->id     = 'slide-extra-' . $i;
			$copy->layers = array();
			$document->slides[] = $copy;
		}
		return $document;
	}

	/**
	 * Creates, saves and publishes a slider with an effect layer.
	 *
	 * @param array<string, mixed> $content Effect content overrides.
	 */
	private function publish( EffectRegistry $registry, array $content = array(), int $slides = 1 ): int {
		$service = $this->service( $registry );
		$id      = $service->create_slider( 'FX' );
		$version = $service->save_draft( $id, 'FX', $this->document_with_effect( $service, $id, $content, $slides ), 1 );
		$service->publish( $id, $version );
		return $id;
	}

	/** @return array<string, mixed> */
	private function config_of( string $html ): array {
		$this->assertSame( 1, preg_match( '~<script type="application/json" class="sws-config">(.*?)</script>~s', $html, $matches ) );
		return json_decode( $matches[1], true );
	}

	public function test_effect_params_are_validated_against_the_registered_schema(): void {
		$registry = $this->add_ons( array( $this->glow() ) );
		$service  = $this->service( $registry );
		$id       = $service->create_slider( 'FX' );
		try {
			$service->save_draft( $id, 'FX', $this->document_with_effect( $service, $id, array( 'params' => array( 'strength' => 5 ) ) ), 1 );
			$this->fail( 'invalid parameters must be rejected' );
		} catch ( InvalidDocument $error ) {
			$this->assertSame( '/slides/0/layers/0/content/params/strength range', $error->issues[0]->path . ' ' . $error->issues[0]->code );
		}
		$version = $service->save_draft( $id, 'FX', $this->document_with_effect( $service, $id ), 1 );
		$this->assertSame( 2, $version );
	}

	public function test_an_unknown_effect_type_stays_storable_and_renders_only_its_fallback(): void {
		$registry = $this->add_ons( array() ); // The add-on was deactivated.
		$id       = $this->publish( $registry );
		$html     = $this->renderer( $registry )->render( $id );
		$this->assertStringContainsString( 'data-sws-fx="acme/glow"', $html );
		$this->assertSame( array(), $this->config_of( $html )['effects'] );
		$this->assertStringNotContainsString( 'sws-toggle', $html, 'no continuous effect, no pause switch' );
	}

	public function test_a_registered_effect_is_configured_for_the_runtime_with_a_pause_switch(): void {
		$registry = $this->add_ons( array( $this->glow() ) );
		$id       = $this->publish( $registry );
		$html     = $this->renderer( $registry )->render( $id );
		$config   = $this->config_of( $html );
		$this->assertCount( 1, $config['effects'] );
		$entry = $config['effects'][0];
		$this->assertSame( 'fx', $entry['layerId'] );
		$this->assertSame( 'acme/glow', $entry['type'] );
		$this->assertSame( array( 'strength' => 0.8 ), $entry['params'] );
		$this->assertSame( 7, $entry['seed'] );
		$this->assertTrue( $entry['continuous'] );
		$this->assertSame( content_url( '/plugins/acme-glow/glow.js' ) . '?ver=1.2.3', $entry['module'] );
		$this->assertStringContainsString( 'class="sws-toggle"', $html, 'pause switch for continuous motion, even without autoplay' );
		$this->assertStringNotContainsString( 'sws-prev', $html, 'one slide: no arrows' );
		$this->assertStringNotContainsString( 'sws-dot', $html );
		$this->assertStringContainsString( 'class="sws-live"', $html );
		$this->assertStringContainsString( '"params":{"strength":0.8}', $html );
	}

	public function test_nested_empty_parameter_objects_stay_objects_in_the_runtime_config(): void {
		$glow     = $this->glow();
		$glow['schema']['properties']['camera'] = array(
			'type'       => 'object',
			'properties' => array(
				'distance' => array(
					'type'    => 'number',
					'minimum' => 1,
					'maximum' => 9,
					'default' => 5,
				),
			),
		);
		$registry = $this->add_ons( array( $glow ) );
		$id       = $this->publish( $registry, array( 'params' => array( 'strength' => 0.8, 'camera' => new stdClass() ) ) );
		$html     = $this->renderer( $registry )->render( $id );
		$this->assertStringContainsString( '"params":{"strength":0.8,"camera":{}}', $html );
	}

	public function test_a_finite_effect_gets_no_pause_switch_and_empty_params_stay_an_object(): void {
		$finite   = $this->glow( array( 'continuous' => false ) );
		$registry = $this->add_ons( array( $finite ) );
		$id       = $this->publish( $registry, array( 'params' => array() ) );
		$html     = $this->renderer( $registry )->render( $id );
		$this->assertStringNotContainsString( 'sws-toggle', $html );
		$this->assertStringContainsString( '"params":{}', $html );
		$this->assertStringContainsString( '"assets":{}', $html );
	}

	public function test_multiple_slides_keep_arrows_dots_and_add_the_switch(): void {
		$registry = $this->add_ons( array( $this->glow() ) );
		$html     = $this->renderer( $registry )->render( $this->publish( $registry, array(), 2 ) );
		$this->assertStringContainsString( 'sws-toggle', $html );
		$this->assertStringContainsString( 'sws-prev', $html );
		$this->assertStringContainsString( 'sws-dot', $html );
	}

	public function test_an_effect_newer_than_the_installed_module_renders_only_its_fallback(): void {
		$registry = $this->add_ons( array( $this->glow( array( 'schema_version' => 2 ) ) ) );
		$id       = $this->publish( $registry, array( 'schemaVersion' => 2 ) );
		$this->assertCount( 1, $this->config_of( $this->renderer( $registry )->render( $id ) )['effects'] );

		// The add-on is downgraded to schema version 1: the page keeps working with the static fallback.
		remove_filter( EffectRegistry::FILTER, $this->filter );
		$older = $this->add_ons( array( $this->glow() ) );
		$html  = $this->renderer( $older )->render( $id );
		$this->assertStringContainsString( 'data-sws-fx="acme/glow"', $html );
		$this->assertSame( array(), $this->config_of( $html )['effects'] );
		$this->assertStringNotContainsString( 'sws-diagnostic', $html );
	}

	public function test_publishing_rejects_effect_images_that_do_not_exist(): void {
		$registry = $this->add_ons( array( $this->glow() ) );
		foreach ( array( 'fallbackImageId' => 999999, 'assets' => array( 'image' => 999999 ) ) as $key => $value ) {
			try {
				$this->publish( $registry, array( $key => $value ) );
				$this->fail( 'Publishing must fail for ' . $key );
			} catch ( InvalidDocument $error ) {
				$this->assertSame( 'missing_resource', $error->issues[0]->code );
				$this->assertStringContainsString( 'fallbackImageId' === $key ? '/content/fallbackImageId' : '/content/assets/image', $error->issues[0]->path );
			}
		}
	}

	public function test_fallback_image_is_rendered_with_alt_text_and_priority_loading(): void {
		$attachment = self::factory()->attachment->create_upload_object( dirname( __DIR__ ) . '/vendor/wp-phpunit/wp-phpunit/data/images/canola.jpg' );
		$registry   = $this->add_ons( array( $this->glow() ) );
		$id         = $this->publish( $registry, array( 'fallbackImageId' => $attachment, 'assets' => array( 'image' => $attachment ) ) );
		$html       = $this->renderer( $registry )->render( $id );
		$this->assertMatchesRegularExpression( '/<img [^>]*class="sws-fx__fallback"[^>]*alt="Nebel"/', $html );
		$this->assertStringContainsString( 'loading="eager"', $html );
		$assets = $this->config_of( $html )['effects'][0]['assets'];
		$this->assertArrayHasKey( 'image', $assets );
		$this->assertMatchesRegularExpression( '#^https?://.+\.jpg$#', $assets['image']['url'] );
		$this->assertGreaterThan( 0, $assets['image']['width'] );
	}

	// -------------------------------------------------------------------------------------------
	// Assets.
	// -------------------------------------------------------------------------------------------

	public function test_the_gpu_bundle_is_a_runtime_dependency_only_on_effect_pages(): void {
		global $wpdb;
		$root = get_temp_dir() . 'sws-gpu-' . wp_generate_uuid4() . '/';
		wp_mkdir_p( $root . 'build/gpu' );
		wp_mkdir_p( $root . 'build/runtime' );
		file_put_contents( $root . 'build/gpu/gpu.js', '/* gpu */' );
		$registry = $this->add_ons( array( $this->glow() ) );
		$assets   = new Assets( new \SW\Slider\Infrastructure\WpSliderRepository( $wpdb ), new \SW\Slider\Fonts\WpFontRepository(), SWS_URL, $root, SWS_VERSION, $registry );
		wp_deregister_script( Assets::RUNTIME );
		wp_deregister_script( Assets::GPU );
		$assets->register_runtime();
		$this->assertSame( SWS_VERSION, wp_scripts()->registered[ Assets::GPU ]->ver, 'plugin version, no timestamps' );

		$plain = $this->service( $registry );
		$id    = $plain->create_slider( 'Plain' );
		$plain->publish( $id, 1 );
		$this->renderer( $registry, $assets )->render( $id );
		$this->assertNotContains( Assets::GPU, wp_scripts()->registered[ Assets::RUNTIME ]->deps );

		$this->renderer( $registry, $assets )->render( $this->publish( $registry ) );
		$this->assertContains( Assets::GPU, wp_scripts()->registered[ Assets::RUNTIME ]->deps );
	}

	public function test_the_gpu_bundle_is_not_required_when_the_effect_type_is_unknown(): void {
		global $wpdb;
		$root = get_temp_dir() . 'sws-gpu-' . wp_generate_uuid4() . '/';
		wp_mkdir_p( $root . 'build/gpu' );
		file_put_contents( $root . 'build/gpu/gpu.js', '/* gpu */' );
		$registry = $this->add_ons( array() );
		$assets   = new Assets( new \SW\Slider\Infrastructure\WpSliderRepository( $wpdb ), new \SW\Slider\Fonts\WpFontRepository(), SWS_URL, $root, SWS_VERSION, $registry );
		wp_deregister_script( Assets::RUNTIME );
		wp_deregister_script( Assets::GPU );
		$assets->register_runtime();
		$this->renderer( $registry, $assets )->render( $this->publish( $registry ) );
		$this->assertNotContains( Assets::GPU, wp_scripts()->registered[ Assets::RUNTIME ]->deps );
	}

	public function test_the_shipped_particle_field_is_registered_with_valid_presets(): void {
		$registry = new EffectRegistry( SWS_DIR, SWS_URL, SWS_VERSION );
		$this->assertSame( array(), $registry->problems() );
		$effect = $registry->descriptor( 'particle-field' );
		$this->assertNotNull( $effect );
		$this->assertTrue( $effect['builtin'] );
		$this->assertTrue( $effect['continuous'] );
		$this->assertSame( SWS_URL . 'build/gpu/particle-field.js?ver=' . SWS_VERSION, $effect['module_url'], 'built-in modules carry the plugin version' );
		$ids = array_column( $effect['presets'], 'id' );
		$this->assertSame( array( 'orbital-mist', 'vortex-ribbons', 'ember-drift', 'radiant-pulse', 'photo-grains', 'magnetic-canvas' ), $ids );
		foreach ( $effect['presets'] as $preset ) {
			$this->assertSame( array(), \SW\Slider\Domain\EffectSchema::validate( $effect['schema'], $preset['params'] ), $preset['id'] );
		}
	}

	public function test_invalid_presets_are_skipped_and_reported(): void {
		$root = get_temp_dir() . 'sws-fx-' . wp_generate_uuid4() . '/';
		wp_mkdir_p( $root . 'schemas/effects' );
		file_put_contents(
			$root . 'schemas/effects/sparkle.json',
			(string) wp_json_encode(
				array(
					'type'          => 'sparkle',
					'label'         => 'Sparkle',
					'schemaVersion' => 1,
					'module'        => 'sparkle.js',
					'schema'        => array(
						'type'       => 'object',
						'properties' => array(
							'n' => array(
								'type'    => 'integer',
								'minimum' => 1,
								'maximum' => 5,
							),
						),
					),
					'presets'       => array(
						array(
							'id'     => 'ok',
							'name'   => 'Fine',
							'params' => array( 'n' => 3 ),
						),
						array(
							'id'     => 'too-big',
							'params' => array( 'n' => 99 ),
						),
						array(
							'id'     => 'Bad Id',
							'params' => array(),
						),
						'not a preset',
					),
				)
			)
		);
		$registry = new EffectRegistry( $root, 'https://example.org/p/', '1.0.0' );
		$this->assertSame( array( 'ok' ), array_column( $registry->descriptor( 'sparkle' )['presets'], 'id' ) );
		$problems = implode( ' | ', $registry->problems() );
		$this->assertStringContainsString( 'preset "too-big" rejected', $problems );
		$this->assertStringContainsString( 'preset "Bad Id" rejected', $problems );
	}

	public function test_the_editor_config_lists_effects_with_schema_presets_and_media_slots(): void {
		$registry = $this->add_ons( array( $this->glow() ) );
		$page     = new \SW\Slider\Admin\AdminPage( new \SW\Slider\Fonts\WpFontRepository(), SWS_URL, SWS_DIR, SWS_VERSION, false, $registry );
		$config   = $page->config();
		$this->assertSame( rest_url( 'wp/v2/' ), $config['coreRestRoot'] );
		$types = array_column( $config['effects'], 'type' );
		$this->assertSame( array( 'particle-field', 'acme/glow' ), $types );
		$particles = $config['effects'][0];
		$this->assertTrue( $particles['builtin'] );
		$this->assertSame( array( array( 'key' => 'image', 'label' => 'Image to rebuild' ) ), $particles['assets'] );
		$this->assertSame( 6, count( $particles['presets'] ) );
		$this->assertSame( array(), $config['effects'][1]['assets'] );
		$json = (string) wp_json_encode( $config['effects'] );
		$this->assertStringContainsString( '"properties":{', $json, 'schemas stay JSON objects' );
		$this->assertStringNotContainsString( '"properties":[', $json );
		$this->assertSame( array(), ( new \SW\Slider\Admin\AdminPage( new \SW\Slider\Fonts\WpFontRepository(), SWS_URL, SWS_DIR, SWS_VERSION, false ) )->config()['effects'], 'no registry, no effects' );
	}

	public function test_invalid_media_slots_are_dropped(): void {
		$registry = $this->add_ons( array( $this->glow( array( 'assets' => array( array( 'key' => 'image', 'label' => 'Picture' ), array( 'key' => '-bad' ), array( 'key' => 'two' ), 'x', array( 'key' => 'a' ), array( 'key' => 'b' ), array( 'key' => 'c' ) ) ) ) ) );
		$slots    = $registry->descriptor( 'acme/glow' )['assets'];
		$this->assertSame( array( 'image', 'two' ), array_column( $slots, 'key' ), 'only the first four entries are read; invalid keys are dropped' );
		$this->assertSame( array( 'Picture', 'two' ), array_column( $slots, 'label' ) );
	}

	public function test_the_editor_receives_previews_for_effect_media(): void {
		do_action( 'rest_api_init' );
		$attachment = self::factory()->attachment->create_upload_object( dirname( __DIR__ ) . '/vendor/wp-phpunit/wp-phpunit/data/images/canola.jpg' );
		$other      = self::factory()->attachment->create_upload_object( dirname( __DIR__ ) . '/vendor/wp-phpunit/wp-phpunit/data/images/33772.jpg' );
		$registry   = $this->add_ons( array( $this->glow() ) );
		$service    = $this->service( $registry );
		$id         = $service->create_slider( 'Media' );
		$content    = array(
			'fallbackImageId' => $attachment,
			'assets'          => array( 'image' => $other ),
		);
		$service->save_draft( $id, 'Media', $this->document_with_effect( $service, $id, $content ), 1 );
		$request  = new WP_REST_Request( 'GET', '/sw-sliderman/v1/sliders/' . $id );
		$response = rest_get_server()->dispatch( $request );
		$media    = $response->get_data()['media'];
		$this->assertEqualsCanonicalizing( array( $attachment, $other ), array_keys( (array) $media ) );
		$this->assertMatchesRegularExpression( '#^https?://.+\.jpg$#', ( (array) $media )[ $other ]['url'] );
	}
}

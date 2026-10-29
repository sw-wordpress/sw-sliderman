<?php
/**
 * Font parsing, download policy and installation (negative cases first).
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Tests\Unit;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use SW\Slider\Fonts\DownloadPolicy;
use SW\Slider\Fonts\FontCatalog;
use SW\Slider\Fonts\FontError;
use SW\Slider\Fonts\FontFaceParser;
use SW\Slider\Fonts\FontInstaller;
use SW\Slider\Fonts\GoogleFontsProvider;
use SW\Slider\Fonts\LocalFontCss;
use SW\Slider\Fonts\Woff2;
use SW\Slider\Tests\Support\FakeHttp;
use SW\Slider\Tests\Support\Fixtures;
use SW\Slider\Tests\Support\MemoryFontRepository;
use SW\Slider\Tests\Support\MemoryFontStorage;

final class FontInstallerTest extends TestCase {

	private const LICENSE_URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/lato/OFL.txt';

	private FakeHttp $http;
	private MemoryFontRepository $repository;
	private MemoryFontStorage $storage;

	/** @var array<string, list<string>> */
	private array $dns = array();

	protected function setUp(): void {
		$this->http       = new FakeHttp();
		$this->repository = new MemoryFontRepository();
		$this->storage    = new MemoryFontStorage();
		$this->dns        = array(
			'fonts.googleapis.com'      => array( '142.250.185.74' ),
			'fonts.gstatic.com'         => array( '142.250.185.67' ),
			'raw.githubusercontent.com' => array( '185.199.108.133' ),
		);
	}

	private function policy(): DownloadPolicy {
		return new DownloadPolicy( fn ( string $host ): array => $this->dns[ $host ] ?? array() );
	}

	private function installer( bool $offline = false ): FontInstaller {
		return new FontInstaller(
			new FontCatalog( dirname( __DIR__, 3 ) . '/fonts/catalog.json' ),
			new GoogleFontsProvider( $this->http, $this->policy(), new FontFaceParser() ),
			$this->repository,
			$this->storage,
			static fn (): string => '2026-10-29 10:00:00',
			$offline
		);
	}

	/** Serves the recorded Lato response plus a WOFF2 per file URL. */
	private function serve_lato(): void {
		$css = Fixtures::read( 'fonts/lato-css2.css' );
		$this->http->routes['https://fonts.googleapis.com/css2?family=Lato:ital,wght@0,400;0,700;1,400&display=swap'] = array(
			'status' => 200,
			'body'   => $css,
		);
		preg_match_all( '~url\((https://[^)]+)\)~', $css, $urls );
		foreach ( $urls[1] as $index => $url ) {
			$this->http->routes[ $url ] = array(
				'status' => 200,
				'body'   => FakeHttp::woff2( (string) $index ),
			);
		}
		$this->http->routes[ self::LICENSE_URL ] = array(
			'status' => 200,
			'body'   => "Copyright 2010 Lato\nSIL OPEN FONT LICENSE Version 1.1\n",
		);
	}

	/**
	 * @return list<array{weight: int, style: string}>
	 */
	private static function lato_variants(): array {
		return array(
			array(
				'weight' => 400,
				'style'  => 'normal',
			),
			array(
				'weight' => 700,
				'style'  => 'normal',
			),
			array(
				'weight' => 400,
				'style'  => 'italic',
			),
		);
	}

	public function test_installs_requested_variants_locally_with_license(): void {
		$this->serve_lato();
		$installation = $this->installer()->install( 'lato', self::lato_variants(), array( 'latin', 'latin-ext' ) );

		self::assertMatchesRegularExpression( '/\Alato-[a-f0-9]{10}\z/', $installation['id'] );
		self::assertCount( 3, $installation['variants'] );
		self::assertSame( 'OFL', $installation['license']['id'] );
		$files = $this->storage->active[ $installation['directory'] ];
		self::assertStringContainsString( 'SIL OPEN FONT LICENSE', $files['LICENSE.txt'] );
		self::assertCount( 6 + 2, $files, 'six WOFF2 files, CSS and license' );
		self::assertStringNotContainsString( 'gstatic', $files['font.css'] );
		self::assertStringNotContainsString( 'googleapis', $files['font.css'] );
		self::assertStringContainsString( "font-family:'sws-" . $installation['id'] . "'", $files['font.css'] );
		self::assertSame( array(), $this->storage->temp, 'temporary directory removed' );
		self::assertSame( array(), $this->repository->locks, 'lock released' );
	}

	public function test_same_selection_reuses_the_installation(): void {
		$this->serve_lato();
		$first  = $this->installer()->install( 'lato', self::lato_variants(), array( 'latin', 'latin-ext' ) );
		$second = $this->installer()->install( 'lato', self::lato_variants(), array( 'latin', 'latin-ext' ) );
		self::assertSame( $first['id'], $second['id'] );
		self::assertCount( 1, $this->repository->installations );
	}

	public function test_html_instead_of_woff2_aborts_without_registration(): void {
		$this->serve_lato();
		foreach ( $this->http->routes as $url => $route ) {
			if ( str_ends_with( $url, '.woff2' ) ) {
				$this->http->routes[ $url ] = array(
					'status' => 200,
					'body'   => '<html>blocked</html>',
				);
				break;
			}
		}
		$this->assert_install_fails( 'sws_font_invalid_file' );
	}

	public function test_network_error_leaves_existing_installation_untouched(): void {
		$this->serve_lato();
		$existing = $this->installer()->install( 'lato', self::lato_variants(), array( 'latin' ) );
		foreach ( array_keys( $this->http->routes ) as $url ) {
			if ( str_ends_with( $url, '.woff2' ) ) {
				$this->http->routes[ $url ] = new FontError( 'sws_font_network' );
			}
		}
		$this->assert_install_fails( 'sws_font_network', array( 'latin', 'latin-ext' ) );
		self::assertSame( $existing, $this->repository->find( $existing['id'] ) );
		self::assertTrue( $this->storage->exists( $existing['directory'] ) );
	}

	public function test_redirect_to_foreign_host_is_rejected(): void {
		$this->serve_lato();
		$this->http->routes[ self::LICENSE_URL ] = array(
			'status'   => 302,
			'body'     => '',
			'location' => 'https://evil.example/OFL.txt',
		);
		$this->assert_install_fails( 'sws_font_url_rejected' );
		self::assertNotContains( 'https://evil.example/OFL.txt', $this->http->requested );
	}

	public function test_provider_host_resolving_to_private_address_is_rejected(): void {
		$this->serve_lato();
		$this->dns['fonts.gstatic.com'] = array( '169.254.169.254' );
		$this->assert_install_fails( 'sws_font_url_rejected' );
	}

	public function test_missing_license_is_rejected(): void {
		$this->serve_lato();
		$this->http->routes[ self::LICENSE_URL ] = array(
			'status' => 404,
			'body'   => '',
		);
		$this->assert_install_fails( 'sws_font_http_status' );
	}

	public function test_variable_family_is_rejected_before_any_request(): void {
		$this->assert_install_fails( 'sws_font_variable_unsupported', array( 'latin' ), 'roboto' );
		self::assertSame( array(), $this->http->requested );
	}

	public function test_shared_file_for_several_weights_is_detected_as_variable(): void {
		$parser = new FontFaceParser();
		$faces  = $parser->parse( Fixtures::read( 'fonts/roboto-variable-css2.css' ) );
		$latin  = array_values( array_filter( $faces, static fn ( $face ): bool => 'latin' === $face->subset ) );
		self::assertSame( $latin[0]->url, $latin[1]->url, 'fixture: Roboto 400/700 share one file' );

		$this->http->routes['https://fonts.googleapis.com/css2?family=Lato:ital,wght@0,400;0,700&display=swap'] = array(
			'status' => 200,
			'body'   => str_replace( 'Roboto', 'Lato', Fixtures::read( 'fonts/roboto-variable-css2.css' ) ),
		);
		$this->assert_install_fails(
			'sws_font_variable_unsupported',
			array( 'latin' ),
			'lato',
			array(
				array(
					'weight' => 400,
					'style'  => 'normal',
				),
				array(
					'weight' => 700,
					'style'  => 'normal',
				),
			)
		);
	}

	public function test_variant_missing_in_response_is_not_replaced(): void {
		$this->serve_lato();
		$url                        = 'https://fonts.googleapis.com/css2?family=Lato:ital,wght@0,400;0,700;1,400&display=swap';
		$this->http->routes[ $url ] = array(
			'status' => 200,
			'body'   => (string) preg_replace( '~/\* latin \*/\s*@font-face\s*\{[^}]*font-weight: 700;[^}]*\}~', '', Fixtures::read( 'fonts/lato-css2.css' ) ),
		);
		$this->assert_install_fails( 'sws_font_variant_unavailable' );
	}

	public function test_parallel_installation_of_the_same_family_is_refused(): void {
		$this->serve_lato();
		$this->repository->locks['install_lato'] = 'other-owner';
		$this->assert_install_fails( 'sws_font_install_running' );
		self::assertSame( 'other-owner', $this->repository->locks['install_lato'] );
	}

	public function test_offline_mode_blocks_installation(): void {
		$this->expectExceptionObject( new FontError( 'sws_font_offline' ) );
		$this->installer( true )->install( 'lato', self::lato_variants(), array( 'latin' ) );
	}

	public function test_unknown_variant_and_subset_are_rejected(): void {
		$this->assert_install_fails(
			'sws_font_variant_unavailable',
			array( 'latin' ),
			'lato',
			array(
				array(
					'weight' => 450,
					'style'  => 'normal',
				),
			)
		);
		$this->assert_install_fails( 'sws_font_subset_unavailable', array( 'arabic' ) );
	}

	/**
	 * @param list<string>                                 $subsets  Subsets.
	 * @param list<array{weight: int, style: string}>|null $variants Variants.
	 */
	private function assert_install_fails( string $code, array $subsets = array( 'latin', 'latin-ext' ), string $family = 'lato', ?array $variants = null ): void {
		$before = $this->repository->installations;
		try {
			$this->installer()->install( $family, $variants ?? self::lato_variants(), $subsets );
			self::fail( 'Installation should fail with ' . $code );
		} catch ( FontError $error ) {
			self::assertSame( $code, $error->error_code );
		}
		self::assertSame( $before, $this->repository->installations, 'no registration' );
		self::assertSame( array(), $this->storage->temp, 'temporary files removed' );
		self::assertArrayNotHasKey( 'install_' . $family, array_diff_key( $this->repository->locks, array( 'install_lato' => 1 ) ) );
	}

	/**
	 * @return iterable<string, array{string, string}>
	 */
	public static function rejected_urls(): iterable {
		yield 'http' => array( 'http://fonts.gstatic.com/s/lato/v25/a.woff2', DownloadPolicy::PURPOSE_FONT );
		yield 'other host' => array( 'https://fonts.gstatic.com.evil.example/s/lato/v25/a.woff2', DownloadPolicy::PURPOSE_FONT );
		yield 'port' => array( 'https://fonts.gstatic.com:8443/s/lato/v25/a.woff2', DownloadPolicy::PURPOSE_FONT );
		yield 'user info' => array( 'https://user@fonts.gstatic.com/s/lato/v25/a.woff2', DownloadPolicy::PURPOSE_FONT );
		yield 'query on font' => array( 'https://fonts.gstatic.com/s/lato/v25/a.woff2?x=1', DownloadPolicy::PURPOSE_FONT );
		yield 'path traversal' => array( 'https://fonts.gstatic.com/s/lato/v25/../../x.woff2', DownloadPolicy::PURPOSE_FONT );
		yield 'css host for font' => array( 'https://fonts.googleapis.com/s/lato/v25/a.woff2', DownloadPolicy::PURPOSE_FONT );
		yield 'license elsewhere' => array( 'https://raw.githubusercontent.com/evil/fonts/main/ofl/x/OFL.txt', DownloadPolicy::PURPOSE_LICENSE );
		yield 'css1 api' => array( 'https://fonts.googleapis.com/css?family=Lato', DownloadPolicy::PURPOSE_CSS );
	}

	#[DataProvider( 'rejected_urls' )]
	public function test_policy_rejects( string $url, string $purpose ): void {
		$this->expectExceptionObject( new FontError( 'sws_font_url_rejected' ) );
		$this->policy()->assert_allowed( $url, $purpose );
	}

	public function test_private_and_metadata_addresses_are_not_public(): void {
		foreach ( array( '127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00:ec2::254', 'fe80::1', '::ffff:127.0.0.1', 'not-an-ip' ) as $address ) {
			self::assertFalse( DownloadPolicy::is_public_ip( $address ), $address );
		}
		self::assertTrue( DownloadPolicy::is_public_ip( '142.250.185.67' ) );
		self::assertTrue( DownloadPolicy::is_public_ip( '2a00:1450:4001:82b::200a' ) );
	}

	/**
	 * @return iterable<string, array{string}>
	 */
	public static function rejected_css(): iterable {
		$face = "/* latin */\n@font-face {\n  font-family: 'Lato';\n  font-style: normal;\n  font-weight: 400;\n  src: url(https://fonts.gstatic.com/s/lato/v25/a.woff2) format('woff2');\n  unicode-range: U+0000-00FF;\n}\n";
		yield 'import' => array( "@import url(https://evil.example/x.css);\n" . $face );
		yield 'unknown descriptor' => array( str_replace( 'font-weight: 400;', 'font-weight: 400; color: red;', $face ) );
		yield 'two sources' => array( str_replace( "format('woff2');", "format('woff2'), url(https://x/y.ttf) format('truetype');", $face ) );
		yield 'ttf' => array( str_replace( "a.woff2) format('woff2')", "a.ttf) format('truetype')", $face ) );
		yield 'missing comment' => array( substr( $face, 13 ) );
		yield 'nested braces' => array( str_replace( '}', '} }', $face ) );
		yield 'empty' => array( '' );
	}

	#[DataProvider( 'rejected_css' )]
	public function test_parser_rejects_unexpected_css( string $css ): void {
		$this->expectException( FontError::class );
		( new FontFaceParser() )->parse( $css );
	}

	public function test_woff2_signature_and_length(): void {
		self::assertTrue( Woff2::is_valid( FakeHttp::woff2( 'a' ) ) );
		self::assertFalse( Woff2::is_valid( '<html>' . str_repeat( 'x', 100 ) ) );
		self::assertFalse( Woff2::is_valid( FakeHttp::woff2( 'a' ) . 'trailing' ) );
		self::assertFalse( Woff2::is_valid( 'wOFF' . substr( FakeHttp::woff2( 'a' ), 4 ) ) );
	}

	public function test_local_css_uses_relative_urls_and_skips_unsafe_values(): void {
		$css = LocalFontCss::build(
			'sws-lato-1',
			array(
				array(
					'weight' => 700,
					'style'  => 'normal',
					'files'  => array(
						array(
							'subset'       => 'latin',
							'unicodeRange' => 'U+0000-00FF, U+20AC',
							'file'         => str_repeat( 'a', 64 ) . '.woff2',
						),
						array(
							'subset'       => 'latin',
							'unicodeRange' => 'U+0000;}body{x:url(evil)',
							'file'         => str_repeat( 'b', 64 ) . '.woff2',
						),
					),
				),
			)
		);
		self::assertStringContainsString( "src:url('./" . str_repeat( 'a', 64 ) . ".woff2') format('woff2')", $css );
		self::assertStringContainsString( 'font-display:swap', $css );
		self::assertStringNotContainsString( 'evil', $css );
	}
}

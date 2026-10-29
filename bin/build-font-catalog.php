<?php
/**
 * Builds fonts/catalog.json from the official google/fonts METADATA.pb files.
 *
 * Usage: php bin/build-font-catalog.php
 * Runs on the build machine only (network access to raw.githubusercontent.com). The plugin never
 * downloads catalog data at runtime; the result is a versioned file in the repository.
 *
 * Only families with an explicit license directory mapping and an existing license file are
 * included. Families with variation axes are listed as `static: false` (not installable in 1.0,
 * PLAN.md 8.2).
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

// Curated M0 selection: directory in google/fonts => license directory.
$sws_families          = array(
	'lato'            => 'ofl',
	'poppins'         => 'ofl',
	'ptsans'          => 'ofl',
	'ptserif'         => 'ofl',
	'firasans'        => 'ofl',
	'titilliumweb'    => 'ofl',
	'ubuntu'          => 'ufl',
	'barlow'          => 'ofl',
	'crimsontext'     => 'ofl',
	'dmserifdisplay'  => 'ofl',
	'archivoblack'    => 'ofl',
	'bebasneue'       => 'ofl',
	'abrilfatface'    => 'ofl',
	'pacifico'        => 'ofl',
	'lobster'         => 'ofl',
	'sourcesans3'     => 'ofl',
	'inter'           => 'ofl',
	'montserrat'      => 'ofl',
	'opensans'        => 'ofl',
	'roboto'          => 'ofl',
	'raleway'         => 'ofl',
	'playfairdisplay' => 'ofl',
	'merriweather'    => 'ofl',
	'oswald'          => 'ofl',
);
$sws_license_files     = array(
	'ofl'    => 'OFL.txt',
	'ufl'    => 'UFL.txt',
	'apache' => 'LICENSE.txt',
);
$sws_supported_subsets = array( 'latin', 'latin-ext', 'cyrillic', 'cyrillic-ext', 'greek', 'greek-ext', 'vietnamese' );

/** Fetches a URL or aborts the build. */
function sws_fetch( string $url ): string {
	$context = stream_context_create(
		array(
			'http' => array(
				'timeout'       => 20,
				'ignore_errors' => true,
			),
		)
	);
	$body    = file_get_contents( $url, false, $context );
	$status  = $http_response_header[0] ?? '';
	if ( false === $body || ! str_contains( $status, ' 200' ) ) {
		fwrite( STDERR, "Failed: $url ($status)\n" );
		exit( 1 );
	}
	return $body;
}

$sws_catalog = array(
	'catalogVersion' => gmdate( 'Y-m-d' ),
	'source'         => 'https://github.com/google/fonts (METADATA.pb, main branch)',
	'families'       => array(),
);
foreach ( $sws_families as $sws_dir => $sws_license_dir ) {
	$sws_meta = sws_fetch( "https://raw.githubusercontent.com/google/fonts/main/$sws_license_dir/$sws_dir/METADATA.pb" );
	preg_match( '/^name: "([^"]+)"/m', $sws_meta, $sws_name );
	preg_match( '/^license: "([^"]+)"/m', $sws_meta, $sws_license );
	preg_match( '/^category: "([^"]+)"/m', $sws_meta, $sws_category );
	preg_match_all( '/^subsets: "([^"]+)"/m', $sws_meta, $sws_subsets );
	preg_match_all( '/fonts \{[^}]*?style: "(normal|italic)"[^}]*?weight: (\d+)/s', $sws_meta, $sws_fonts, PREG_SET_ORDER );
	$sws_variants = array();
	foreach ( $sws_fonts as $sws_font ) {
		$sws_variants[ $sws_font[2] . $sws_font[1] ] = array(
			'weight' => (int) $sws_font[2],
			'style'  => $sws_font[1],
		);
	}
	usort( $sws_variants, static fn ( array $a, array $b ): int => array( $a['weight'], $a['style'] ) <=> array( $b['weight'], $b['style'] ) );
	$sws_license_path = $sws_license_dir . '/' . $sws_dir . '/' . $sws_license_files[ $sws_license_dir ];
	sws_fetch( 'https://raw.githubusercontent.com/google/fonts/main/' . $sws_license_path );

	$sws_catalog['families'][] = array(
		'id'          => $sws_dir,
		'family'      => $sws_name[1],
		'category'    => strtolower( str_replace( '_', '-', $sws_category[1] ?? 'SANS_SERIF' ) ),
		'license'     => $sws_license[1],
		'licensePath' => $sws_license_path,
		'static'      => ! str_contains( $sws_meta, 'axes {' ),
		'subsets'     => array_values( array_intersect( $sws_supported_subsets, $sws_subsets[1] ) ),
		'variants'    => array_values( $sws_variants ),
	);
	fwrite( STDERR, "ok $sws_dir\n" );
}
usort( $sws_catalog['families'], static fn ( array $a, array $b ): int => strcmp( $a['family'], $b['family'] ) );
file_put_contents( dirname( __DIR__ ) . '/fonts/catalog.json', json_encode( $sws_catalog, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n" );
echo "fonts/catalog.json written\n";

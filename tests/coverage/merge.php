<?php
/**
 * Merges Clover reports (unit + WordPress) into coverage/clover.xml with project-relative paths,
 * keeping the highest hit count of overlapping lines (same approach as sw-backupit).
 *
 * Usage: php tests/coverage/merge.php coverage/unit.xml coverage/wordpress.xml
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

$sws_root  = dirname( __DIR__, 2 ) . '/';
$sws_files = array();
foreach ( array_slice( $argv, 1 ) as $sws_report ) {
	$sws_xml = new DOMDocument();
	if ( ! $sws_xml->load( $sws_report, LIBXML_NONET ) ) {
		throw new RuntimeException( 'Invalid Clover report: ' . $sws_report );
	}
	foreach ( $sws_xml->getElementsByTagName( 'file' ) as $sws_file ) {
		$sws_absolute = realpath( $sws_file->getAttribute( 'name' ) );
		if ( false === $sws_absolute || ! str_starts_with( $sws_absolute, $sws_root ) ) {
			throw new RuntimeException( 'Coverage escaped project: ' . $sws_file->getAttribute( 'name' ) );
		}
		$sws_name               = substr( $sws_absolute, strlen( $sws_root ) );
		$sws_files[ $sws_name ] = $sws_files[ $sws_name ] ?? array();
		foreach ( $sws_file->getElementsByTagName( 'line' ) as $sws_line ) {
			$sws_attributes = array();
			foreach ( $sws_line->attributes as $sws_attribute ) {
				$sws_attributes[ $sws_attribute->name ] = $sws_attribute->value;
			}
			$sws_key                            = $sws_attributes['num'] . ':' . ( $sws_attributes['type'] ?? 'stmt' );
			$sws_previous                       = $sws_files[ $sws_name ][ $sws_key ]['count'] ?? 0;
			$sws_attributes['count']            = (string) max( (int) $sws_previous, (int) ( $sws_attributes['count'] ?? 0 ) );
			$sws_files[ $sws_name ][ $sws_key ] = $sws_attributes;
		}
	}
}
if ( array() === $sws_files ) {
	throw new RuntimeException( 'No production files in coverage reports.' );
}

$sws_document               = new DOMDocument( '1.0', 'UTF-8' );
$sws_document->formatOutput = true; // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- DOM API.
$sws_coverage               = $sws_document->appendChild( $sws_document->createElement( 'coverage' ) );
$sws_coverage->setAttribute( 'generated', (string) time() );
$sws_project = $sws_coverage->appendChild( $sws_document->createElement( 'project' ) );
$sws_project->setAttribute( 'timestamp', (string) time() );
$sws_executed = 0;
ksort( $sws_files );
foreach ( $sws_files as $sws_name => $sws_lines ) {
	$sws_file = $sws_project->appendChild( $sws_document->createElement( 'file' ) );
	$sws_file->setAttribute( 'name', $sws_name );
	$sws_statements = 0;
	$sws_covered    = 0;
	foreach ( $sws_lines as $sws_attributes ) {
		$sws_line = $sws_file->appendChild( $sws_document->createElement( 'line' ) );
		foreach ( $sws_attributes as $sws_key => $sws_value ) {
			$sws_line->setAttribute( $sws_key, $sws_value );
		}
		if ( 'stmt' === ( $sws_attributes['type'] ?? '' ) ) {
			++$sws_statements;
			if ( (int) $sws_attributes['count'] > 0 ) {
				++$sws_covered;
				++$sws_executed;
			}
		}
	}
	$sws_metrics = $sws_file->appendChild( $sws_document->createElement( 'metrics' ) );
	$sws_metrics->setAttribute( 'statements', (string) $sws_statements );
	$sws_metrics->setAttribute( 'coveredstatements', (string) $sws_covered );
}
if ( 0 === $sws_executed ) {
	throw new RuntimeException( 'No executed production lines in coverage reports.' );
}
if ( false === $sws_document->save( $sws_root . 'coverage/clover.xml' ) ) {
	throw new RuntimeException( 'Could not write merged coverage.' );
}
printf( "Merged %d files, %d executed statement lines into coverage/clover.xml\n", count( $sws_files ), $sws_executed ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- CLI output.

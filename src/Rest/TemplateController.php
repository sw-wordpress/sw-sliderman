<?php
/** Three bundled, versioned, local starting points.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Rest;

use Closure;
use SW\Slider\ImportExport\PackageError;
use SW\Slider\Infrastructure\Capabilities;
use SW\Slider\ImportExport\PackageArchive;
use SW\Slider\ImportExport\PackageImporter;
use SW\Slider\ImportExport\PrivateWorkspace;
use SW\Slider\Infrastructure\ResourceGuard;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;

final class TemplateController {
	/** @param Closure():PrivateWorkspace $workspace_factory Deferred private filesystem adapter. */
	public function __construct( private readonly PackageImporter $importer, private readonly Closure $workspace_factory, private readonly string $directory ) {
	}

	public function register(): void {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	public function register_routes(): void {
		register_rest_route(
			SliderController::NAMESPACE,
			'/templates',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'list_templates' ),
				'permission_callback' => array( $this, 'can_import' ),
			)
		);
		register_rest_route(
			SliderController::NAMESPACE,
			'/templates/(?P<template>image-slider|text-hero|event)',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'create' ),
				'permission_callback' => array( $this, 'can_import' ),
			)
		);
	}

	public function can_import(): bool {
		return current_user_can( Capabilities::EDIT ) && current_user_can( Capabilities::IMPORT ) && current_user_can( Capabilities::FONTS ) && current_user_can( 'upload_files' );
	}

	public function list_templates(): WP_REST_Response {
		return new WP_REST_Response(
			array(
				array(
					'id'      => 'image-slider',
					'name'    => __( 'Image slider', 'sw-sliderman' ),
					'version' => 1,
				),
				array(
					'id'      => 'text-hero',
					'name'    => __( 'Text and button hero', 'sw-sliderman' ),
					'version' => 1,
				),
				array(
					'id'      => 'event',
					'name'    => __( 'Event announcement', 'sw-sliderman' ),
					'version' => 1,
				),
			)
		);
	}

	public function create( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$work  = null;
		$token = null;
		try {
			$id = $request->get_param( 'template' );
			if ( ! in_array( $id, array( 'image-slider', 'text-hero', 'event' ), true ) ) {
				throw new PackageError( 'manifest' );
			}
			$work    = ( $this->workspace_factory )();
			$token   = $work->create();
			$archive = new PackageArchive( $this->directory . '/' . $id . '.zip' );
			try {
				global $wpdb;
				$new_id = ResourceGuard::run( $wpdb, fn (): int => $this->importer->commit( $archive, $work->path( $token ) . '/resource.bin', array(), array() ) );
			} finally {
				$archive->close();
			}
			$response = new WP_REST_Response( array( 'id' => $new_id ), 201 );
			$response->header( 'Cache-Control', 'private, no-store' );
			return $response;
		} catch ( \Throwable $error ) {
			return Errors::from( $error );
		} finally {
			if ( null !== $token && null !== $work ) {
				$work->remove( $token );
			}
		}
	}
}

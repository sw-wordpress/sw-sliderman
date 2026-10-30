<?php
/**
 * REST error mapping.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Rest;

use SW\Slider\Application\InvalidDocument;
use SW\Slider\Application\RepositoryBusy;
use SW\Slider\Application\StorageFailure;
use SW\Slider\Application\SliderNotFound;
use SW\Slider\Application\VersionConflict;
use SW\Slider\Domain\ValidationIssue;
use SW\Slider\Fonts\FontError;
use Throwable;
use WP_Error;

/**
 * Translates application results into stable REST errors (CODE-STYLE 7).
 *
 * Unexpected failures get a generic message plus a correlation ID; the cause is written to the
 * PHP error log with that ID only (no document content, no request data).
 */
final class Errors {

	public static function from( Throwable $error ): WP_Error {
		if ( $error instanceof VersionConflict ) {
			return new WP_Error(
				'sws_revision_conflict',
				__( 'The slider was changed elsewhere. Reload it or export your changes.', 'sw-sliderman' ),
				array(
					'status'         => 409,
					'currentVersion' => $error->current_version,
				)
			);
		}
		if ( $error instanceof InvalidDocument ) {
			return new WP_Error(
				'sws_invalid_document',
				__( 'The slider contains invalid or missing data.', 'sw-sliderman' ),
				array(
					'status' => 422,
					'issues' => array_map( static fn ( ValidationIssue $issue ): array => $issue->to_array(), $error->issues ),
				)
			);
		}
		if ( $error instanceof SliderNotFound ) {
			return new WP_Error( 'sws_not_found', __( 'The slider does not exist.', 'sw-sliderman' ), array( 'status' => 404 ) );
		}
		if ( $error instanceof StorageFailure ) {
			return new WP_Error( 'sws_storage_failed', __( 'The changes could not be stored. The last published version was not changed.', 'sw-sliderman' ), array( 'status' => 500 ) );
		}

		if ( $error instanceof RepositoryBusy ) {
			return new WP_Error( 'sws_busy', __( 'The slider is being saved by another request. Please try again.', 'sw-sliderman' ), array( 'status' => 409 ) );
		}
		if ( $error instanceof FontError ) {
			return self::font( $error );
		}
		$correlation = wp_generate_password( 10, false );
		// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- bounded technical log with correlation ID only.
		error_log( sprintf( 'sw-sliderman [%s] %s in %s:%d', $correlation, get_class( $error ), $error->getFile(), $error->getLine() ) );
		return new WP_Error(
			'sws_internal',
			__( 'An unexpected error occurred.', 'sw-sliderman' ),
			array(
				'status'        => 500,
				'correlationId' => $correlation,
			)
		);
	}

	private static function font( FontError $error ): WP_Error {
		$map = array(
			'sws_font_invalid_file'         => array( 422, __( 'The file is not a supported static WOFF2 font.', 'sw-sliderman' ) ),
			'sws_font_registry'             => array( 500, __( 'The font installation could not be stored. Existing installations were not changed.', 'sw-sliderman' ) ),
			'sws_font_storage'              => array( 500, __( 'The local font files could not be written or verified.', 'sw-sliderman' ) ),
			'sws_font_reference_unknown'    => array( 409, __( 'Font use could not be checked because stored slider data is damaged or unsupported.', 'sw-sliderman' ) ),
			'sws_font_catalog_invalid'      => array( 502, __( 'The catalog response could not be verified. The previous catalog remains active.', 'sw-sliderman' ) ),
			'sws_font_job_forbidden'        => array( 403, __( 'Font management permission is no longer available.', 'sw-sliderman' ) ),
			'sws_font_job_not_found'        => array( 404, __( 'The font job does not exist.', 'sw-sliderman' ) ),
			'sws_font_job_limit'            => array( 429, __( 'Too many font jobs are active. Wait for a job to finish.', 'sw-sliderman' ) ),
			'sws_font_job_timeout'          => array( 504, __( 'The font job exceeded its time limit. Existing installations remain available.', 'sw-sliderman' ) ),
			'sws_font_job_schedule'         => array( 500, __( 'The font job could not be scheduled.', 'sw-sliderman' ) ),

			'sws_font_invalid_request'      => array( 400, __( 'The font selection is invalid.', 'sw-sliderman' ) ),
			'sws_font_unknown_family'       => array( 404, __( 'The font family is not in the local catalog.', 'sw-sliderman' ) ),
			'sws_font_not_found'            => array( 404, __( 'The font installation does not exist.', 'sw-sliderman' ) ),
			'sws_font_variant_unavailable'  => array( 422, __( 'A selected style or weight is not available for this family.', 'sw-sliderman' ) ),
			'sws_font_subset_unavailable'   => array( 422, __( 'A selected character set is not available for this family.', 'sw-sliderman' ) ),
			'sws_font_variable_unsupported' => array( 422, __( 'This family is only available as a variable font, which is not supported yet.', 'sw-sliderman' ) ),
			'sws_font_offline'              => array( 409, __( 'Font downloads are disabled (offline mode).', 'sw-sliderman' ) ),
			'sws_font_install_running'      => array( 409, __( 'This family is already being installed.', 'sw-sliderman' ) ),
			'sws_font_in_use'               => array( 409, __( 'The font is still used by a slider, a revision or a published version.', 'sw-sliderman' ) ),
			'sws_font_license_missing'      => array( 502, __( 'The license of this family could not be verified.', 'sw-sliderman' ) ),
		);
		[ $status, $message ] = $map[ $error->error_code ] ?? array( 502, __( 'The font could not be downloaded or verified. Existing installations were not changed.', 'sw-sliderman' ) );
		return new WP_Error( $error->error_code, $message, array( 'status' => $status ) );
	}
}

<?php
/**
 * Server-side slider markup.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Rendering;

use JsonException;
use SW\Slider\Application\SliderRepository;
use SW\Slider\Application\StoredSlider;
use SW\Slider\Application\PublishedSnapshot;
use SW\Slider\Domain\CanonicalJson;
use SW\Slider\Domain\DocumentValidator;
use SW\Slider\Domain\Schedule;
use SW\Slider\Infrastructure\Capabilities;

/**
 * Renders the published snapshot of a slider (PLAN.md 11).
 *
 * The markup is semantic and readable without JavaScript: the first enabled slide is visible,
 * every other slide is `hidden` and `inert`. Layout comes from the published stylesheet (container
 * queries), so nothing jumps when the runtime starts. Drafts are never rendered here.
 *
 * Every document value is escaped for its output context; text layers are plain text with line
 * breaks (rich text follows in M3.09 with its own allowlist).
 */
final class SliderRenderer {

	/**
	 * Per-request counter for unique instance IDs (several instances of one slider).
	 *
	 * @var int
	 */
	private int $instances = 0;

	public function __construct(
		private readonly SliderRepository $repository,
		private readonly Assets $assets
	) {
	}

	/**
	 * Markup of slider `$slider_id`, or a diagnostic for editors / nothing for visitors.
	 */
	public function render( int $slider_id ): string {
		$slider    = $slider_id > 0 ? $this->repository->find( $slider_id ) : null;
		$published = $slider?->published;
		if ( null === $slider || null === $published ) {
			return $this->diagnostic( null === $slider ? __( 'Slider not found.', 'sw-sliderman' ) : __( 'This slider has not been published yet.', 'sw-sliderman' ) );
		}
		return $this->render_snapshot( $slider, $published );
	}

	/** A private request may render a validated draft, without writing a public CSS artifact. */
	public function render_preview( StoredSlider $slider ): string {
		if ( array() !== ( new DocumentValidator() )->validate_json( $slider->document_json ) ) {
			return $this->diagnostic( __( 'The draft contains invalid data.', 'sw-sliderman' ) );
		}
		$document = CanonicalJson::decode_assoc( $slider->document_json );
		$fonts    = array_values( array_unique( array_column( $document['fontRefs'], 'installationId' ) ) );
		$snapshot = new PublishedSnapshot( $slider->version, CanonicalJson::hash( $slider->document_json ), 1, '', $slider->document_json, null, $fonts, $slider->title );
		return $this->render_snapshot( $slider, $snapshot );
	}

	private function render_snapshot( StoredSlider $slider, PublishedSnapshot $published ): string {
		if ( array() !== ( new DocumentValidator() )->validate_json( $published->document_json ) ) {
			return $this->diagnostic( __( 'The published slider data is damaged.', 'sw-sliderman' ) );
		}
		try {
			$document = CanonicalJson::decode_assoc( $published->document_json );
		} catch ( JsonException ) {
			return $this->diagnostic( __( 'The published slider data is damaged.', 'sw-sliderman' ) );
		}
		$slides = array_values( array_filter( $document['slides'], static fn ( array $slide ): bool => true === $slide['enabled'] ) );
		if ( array() === $slides ) {
			return $this->diagnostic( __( 'This slider has no enabled slides.', 'sw-sliderman' ) );
		}

		$scope    = substr( $published->document_hash, 0, 12 );
		$instance = 'sws-' . $slider->id . '-' . ( ++$this->instances );
		$styles   = $this->assets->use_slider( $published, $document, $scope );
		$label    = '' !== trim( (string) $document['settings']['label'] ) ? (string) $document['settings']['label'] : ( $published->title ?? $slider->title );
		$count    = count( $slides );

		$html  = $styles;
		$html .= '<section class="sws-slider sws-s-' . esc_attr( $scope ) . '" id="' . esc_attr( $instance ) . '" aria-roledescription="' . esc_attr__( 'carousel', 'sw-sliderman' ) . '" aria-label="' . esc_attr( $label ) . '" data-sws-slider>';
		$html .= '<div class="sws-viewport" id="' . esc_attr( $instance . '-viewport' ) . '">';
		foreach ( $slides as $index => $slide ) {
			$html .= $this->slide( $slide, $index, $count, $instance );
		}
		$html .= '</div>';
		if ( $count > 1 ) {
			$html .= $this->controls( $document['settings'], $slides, $instance );
		}
		$html .= '<script type="application/json" class="sws-config">' . $this->config_json( $document, $slides ) . '</script>';
		$html .= '</section>';
		return $html;
	}

	private function diagnostic( string $message ): string {
		if ( ! current_user_can( Capabilities::EDIT ) ) {
			return '';
		}
		return '<div class="sws-diagnostic" role="note"><strong>' . esc_html__( 'SW Sliderman', 'sw-sliderman' ) . ':</strong> ' . esc_html( $message ) . '</div>';
	}

	/**
	 * @param array<string, mixed> $slide Validated slide.
	 */
	private function slide( array $slide, int $index, int $count, string $instance ): string {
		$active = 0 === $index;
		$label  = sprintf(
			/* translators: 1: slide position, 2: number of slides */
			__( '%1$d of %2$d', 'sw-sliderman' ),
			$index + 1,
			$count
		);
		$classes = 'sws-slide sws-sl-' . $slide['id'] . ( $active ? ' sws-is-active' : '' );
		$html    = '<div class="' . esc_attr( $classes ) . '" id="' . esc_attr( $instance . '-s' . $index ) . '" role="group" aria-roledescription="' . esc_attr__( 'slide', 'sw-sliderman' ) . '" aria-label="' . esc_attr( $label ) . '"' . ( $active ? '' : ' hidden inert' ) . '>';

		$background = $slide['background']['attachmentId'] ?? null;
		if ( is_int( $background ) ) {
			$html .= (string) wp_get_attachment_image(
				$background,
				'full',
				false,
				array(
					'class'    => 'sws-slide__bg sws-fit-' . ( 'contain' === $slide['background']['fit'] ? 'contain' : 'cover' ),
					'alt'      => '',
					'loading'  => $active ? 'eager' : 'lazy',
					'decoding' => 'async',
					'sizes'    => '100vw',
				)
			);
		}

		$html .= '<div class="sws-stage">';
		foreach ( $slide['layers'] as $layer ) {
			$html .= $this->layer( $layer, $active );
		}
		$html .= '</div></div>';
		return $html;
	}

	/**
	 * @param array<string, mixed> $layer Validated layer.
	 */
	private function layer( array $layer, bool $eager ): string {
		if ( 1 !== preg_match( DocumentValidator::ID_PATTERN, (string) $layer['id'] ) ) {
			return '';
		}
		$body = match ( $layer['type'] ) {
			'text'   => $this->text( $layer['content'] ),
			'image'  => $this->image( $layer['content'], $layer['layout'], $eager ),
			'button' => $this->button( $layer['content'] ),
			default  => '',
		};
		if ( '' === $body ) {
			return '';
		}
		return '<div class="sws-layer sws-layer--' . esc_attr( (string) $layer['type'] ) . ' sws-l-' . esc_attr( (string) $layer['id'] ) . '" data-sws-layer="' . esc_attr( (string) $layer['id'] ) . '"><div class="sws-layer__anim"><div class="sws-layer__body">' . $body . '</div></div></div>';
	}

	/**
	 * @param array<string, mixed> $content Text content.
	 */
	private function text( array $content ): string {
		$tag = in_array( $content['tag'], array( 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div' ), true ) ? $content['tag'] : 'p';
		return '<' . $tag . ' class="sws-text">' . nl2br( esc_html( (string) $content['text'] ), false ) . '</' . $tag . '>';
	}

	/**
	 * @param array<string, mixed> $content Image content.
	 * @param array<string, mixed> $layout  Base layout (for the `sizes` hint).
	 */
	private function image( array $content, array $layout, bool $eager ): string {
		if ( ! is_int( $content['attachmentId'] ) ) {
			return '';
		}
		$width = (int) ceil( (float) $layout['width'] );
		return (string) wp_get_attachment_image(
			$content['attachmentId'],
			'full',
			false,
			array(
				'class'    => 'sws-image sws-fit-' . ( 'contain' === $content['fit'] ? 'contain' : 'cover' ),
				'alt'      => true === $content['decorative'] ? '' : (string) $content['alt'],
				'loading'  => $eager ? 'eager' : 'lazy',
				'decoding' => 'async',
				'sizes'    => '(max-width: 767px) 100vw, ' . $width . 'px',
			)
		);
	}

	/**
	 * @param array<string, mixed> $content Button content.
	 */
	private function button( array $content ): string {
		$url = (string) $content['url'];
		if ( 1 !== preg_match( DocumentValidator::LINK_PATTERN, $url ) ) {
			return '';
		}
		$target = true === $content['newTab'] ? ' target="_blank" rel="noopener noreferrer"' : '';
		return '<a class="sws-button" href="' . esc_url( $url, array( 'http', 'https', 'mailto', 'tel' ) ) . '"' . $target . '>' . esc_html( (string) $content['label'] ) . '</a>';
	}

	/**
	 * @param array<string, mixed>       $settings Slider settings.
	 * @param list<array<string, mixed>> $slides   Enabled slides.
	 */
	private function controls( array $settings, array $slides, string $instance ): string {
		$viewport = esc_attr( $instance . '-viewport' );
		$html     = '<div class="sws-controls">';
		if ( true === $settings['autoplay'] ) {
			$html .= '<button type="button" class="sws-toggle" aria-controls="' . $viewport . '" data-label-pause="' . esc_attr__( 'Pause slider', 'sw-sliderman' ) . '" data-label-play="' . esc_attr__( 'Play slider', 'sw-sliderman' ) . '" aria-label="' . esc_attr__( 'Pause slider', 'sw-sliderman' ) . '"><span class="sws-icon sws-icon--pause" aria-hidden="true"></span></button>';
		}
		if ( true === $settings['showArrows'] ) {
			$html .= '<button type="button" class="sws-prev" aria-controls="' . $viewport . '" aria-label="' . esc_attr__( 'Previous slide', 'sw-sliderman' ) . '"><span class="sws-icon sws-icon--prev" aria-hidden="true"></span></button>';
		}
		if ( true === $settings['showDots'] ) {
			$html .= '<div class="sws-dots">';
			foreach ( $slides as $index => $slide ) {
				$label = sprintf(
					/* translators: %d: slide position */
					__( 'Show slide %d', 'sw-sliderman' ),
					$index + 1
				);
				$html .= '<button type="button" class="sws-dot" aria-controls="' . $viewport . '" aria-label="' . esc_attr( $label ) . '"' . ( 0 === $index ? ' aria-current="true"' : '' ) . '></button>';
			}
			$html .= '</div>';
		}
		if ( true === $settings['showArrows'] ) {
			$html .= '<button type="button" class="sws-next" aria-controls="' . $viewport . '" aria-label="' . esc_attr__( 'Next slide', 'sw-sliderman' ) . '"><span class="sws-icon sws-icon--next" aria-hidden="true"></span></button>';
		}
		$html .= '<p class="sws-live" aria-live="polite" aria-atomic="true"></p>';
		return $html . '</div>';
	}

	/**
	 * Minimal public runtime configuration: playback settings, breakpoints and per-slide timing.
	 * Contains no administrative data and no layer content.
	 *
	 * @param array<string, mixed>       $document Published document.
	 * @param list<array<string, mixed>> $slides   Enabled slides.
	 */
	private function config_json( array $document, array $slides ): string {
		$config = array(
			'autoplay'    => true === $document['settings']['autoplay'],
			'loop'        => true === $document['settings']['loop'],
			'breakpoints' => $document['breakpoints'],
			'slides'      => array_map(
				static fn ( array $slide ): array => array(
					'id'         => $slide['id'],
					'durationMs' => Schedule::effective_slide_duration_ms( $slide ),
					'transition' => $slide['transition'],
					'layers'     => array_map(
						static fn ( array $layer ): array => array(
							'id'        => $layer['id'],
							'animation' => $layer['animation'],
						),
						$slide['layers']
					),
				),
				$slides
			),
		);
		$json   = wp_json_encode( $config, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES );
		return false === $json ? '{}' : $json;
	}
}

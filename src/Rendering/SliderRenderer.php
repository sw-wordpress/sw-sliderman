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
use SW\Slider\Domain\RichText;
use SW\Slider\Domain\Schedule;
use SW\Slider\Infrastructure\Capabilities;
use SW\Slider\Infrastructure\EffectRegistry;

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

	/**
	 * @param EffectRegistry|null    $effects   Registered GPU effect types; without it effect layers render only their static fallback.
	 * @param DocumentValidator|null $validator Validator with the effect catalog (default: without schemas).
	 */
	public function __construct(
		private readonly SliderRepository $repository,
		private readonly Assets $assets,
		private readonly ?EffectRegistry $effects = null,
		private readonly ?DocumentValidator $validator = null
	) {
	}

	private function validator(): DocumentValidator {
		return $this->validator ?? new DocumentValidator( $this->effects );
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
		if ( array() !== $this->validator()->validate_json( $slider->document_json ) ) {
			return $this->diagnostic( __( 'The draft contains invalid data.', 'sw-sliderman' ) );
		}
		$document = CanonicalJson::decode_assoc( $slider->document_json );
		$fonts    = array_values( array_unique( array_column( $document['fontRefs'], 'installationId' ) ) );
		$snapshot = new PublishedSnapshot( $slider->version, CanonicalJson::hash( $slider->document_json ), 1, '', $slider->document_json, null, $fonts, $slider->title );
		return $this->render_snapshot( $slider, $snapshot );
	}

	private function render_snapshot( StoredSlider $slider, PublishedSnapshot $published ): string {
		if ( array() !== $this->validator()->validate_json( $published->document_json ) ) {
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
		$effects    = $this->effect_entries( $slides, $published->document_json );
		$continuous = array() !== array_filter( $effects, static fn ( array $entry ): bool => true === $entry['continuous'] );
		// Continuous GPU motion always gets the pause switch (WCAG 2.2.2), also without autoplay or with one slide.
		if ( $count > 1 || $continuous ) {
			$html .= $this->controls( $document['settings'], $slides, $instance, $count > 1, true === $document['settings']['autoplay'] || $continuous );
		}
		$html .= '<script type="application/json" class="sws-config">' . $this->config_json( $document, $slides, $effects ) . '</script>';
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
				) + ( $active ? array( 'fetchpriority' => 'high' ) : array() )
			);
		}

		$html .= '<div class="sws-stage">';
		// High priority only where the first slide has no background image that is the likely LCP.
		$priority = $active && ! is_int( $background );
		foreach ( $slide['layers'] as $layer ) {
			$is_image = 'image' === $layer['type'];
			$html    .= $this->layer( $layer, $active, $priority && $is_image );
			$priority = $priority && ! $is_image;
		}
		$html .= '</div></div>';
		return $html;
	}

	/**
	 * @param array<string, mixed> $layer Validated layer.
	 */
	private function layer( array $layer, bool $eager, bool $priority = false ): string {
		if ( 1 !== preg_match( DocumentValidator::ID_PATTERN, (string) $layer['id'] ) ) {
			return '';
		}
		$body = match ( $layer['type'] ) {
			'text'   => $this->text( $layer['content'] ),
			'image'  => $this->image( $layer['content'], $layer['layout'], $eager, $priority ),
			'effect' => $this->effect( $layer['content'], $layer['layout'], $eager ),
			'button' => $this->button( $layer['content'] ),
			'shape'  => '<span class="sws-shape sws-shape--' . ( 'circle' === ( $layer['content']['kind'] ?? '' ) ? 'circle' : 'rectangle' ) . '" aria-hidden="true"></span>',
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
		if ( isset( $content['rich'] ) && is_array( $content['rich'] ) && array() !== $content['rich'] ) {
			return '<' . $tag . ' class="sws-text sws-text--rich">' . RichText::to_html( $content['rich'] ) . '</' . $tag . '>';
		}
		return '<' . $tag . ' class="sws-text">' . nl2br( esc_html( (string) $content['text'] ), false ) . '</' . $tag . '>';
	}

	/**
	 * @param array<string, mixed> $content Image content.
	 * @param array<string, mixed> $layout  Base layout (for the `sizes` hint).
	 */
	private function image( array $content, array $layout, bool $eager, bool $priority = false ): string {
		if ( ! is_int( $content['attachmentId'] ) ) {
			return '';
		}
		$width = (int) ceil( (float) $layout['width'] );
		$image = (string) wp_get_attachment_image(
			$content['attachmentId'],
			'full',
			false,
			array(
				'class'    => 'sws-image sws-fit-' . ( 'contain' === $content['fit'] ? 'contain' : 'cover' ),
				'alt'      => true === $content['decorative'] ? '' : (string) $content['alt'],
				'loading'  => $eager ? 'eager' : 'lazy',
				'decoding' => 'async',
				'sizes'    => '(max-width: 767px) 100vw, ' . $width . 'px',
			) + ( $priority ? array( 'fetchpriority' => 'high' ) : array() )
		);
		$url   = (string) ( $content['linkUrl'] ?? '' );
		if ( '' === $image || '' === $url || 1 !== preg_match( DocumentValidator::LINK_PATTERN, $url ) ) {
			return $image;
		}
		$target = true === ( $content['linkNewTab'] ?? false ) ? ' target="_blank" rel="noopener noreferrer"' : '';
		return '<a class="sws-image-link" href="' . esc_url( $url, array( 'http', 'https', 'mailto', 'tel' ) ) . '"' . $target . '>' . $image . '</a>';
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
	 * @param string                     $instance Instance ID.
	 * @param bool                       $multiple Whether arrows and dots are needed (more than one slide).
	 * @param bool                       $toggle   Whether the pause/play switch is shown.
	 */
	private function controls( array $settings, array $slides, string $instance, bool $multiple, bool $toggle ): string {
		$viewport = esc_attr( $instance . '-viewport' );
		$html     = '<div class="sws-controls">';
		if ( $toggle ) {
			$html .= '<button type="button" class="sws-toggle" aria-controls="' . $viewport . '" data-label-pause="' . esc_attr__( 'Pause slider', 'sw-sliderman' ) . '" data-label-play="' . esc_attr__( 'Play slider', 'sw-sliderman' ) . '" aria-label="' . esc_attr__( 'Pause slider', 'sw-sliderman' ) . '"><span class="sws-icon sws-icon--pause" aria-hidden="true"></span></button>';
		}
		if ( $multiple && true === $settings['showArrows'] ) {
			$html .= '<button type="button" class="sws-prev" aria-controls="' . $viewport . '" aria-label="' . esc_attr__( 'Previous slide', 'sw-sliderman' ) . '"><span class="sws-icon sws-icon--prev" aria-hidden="true"></span></button>';
		}
		if ( $multiple && true === $settings['showDots'] ) {
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
		if ( $multiple && true === $settings['showArrows'] ) {
			$html .= '<button type="button" class="sws-next" aria-controls="' . $viewport . '" aria-label="' . esc_attr__( 'Next slide', 'sw-sliderman' ) . '"><span class="sws-icon sws-icon--next" aria-hidden="true"></span></button>';
		}
		$html .= '<p class="sws-live" aria-live="polite" aria-atomic="true"></p>';
		return $html . '</div>';
	}

	/**
	 * Static markup of a GPU effect layer: only the fallback image. The runtime adds the canvas
	 * (`aria-hidden`, no focus, no pointer events) when GPU and motion are available.
	 *
	 * @param array<string, mixed> $content Effect content.
	 * @param array<string, mixed> $layout  Base layout (for the `sizes` hint).
	 */
	private function effect( array $content, array $layout, bool $eager ): string {
		$image = '';
		if ( is_int( $content['fallbackImageId'] ?? null ) ) {
			$image = (string) wp_get_attachment_image(
				$content['fallbackImageId'],
				'full',
				false,
				array(
					'class'    => 'sws-fx__fallback',
					'alt'      => (string) ( $content['alt'] ?? '' ),
					'loading'  => $eager ? 'eager' : 'lazy',
					'decoding' => 'async',
					'sizes'    => '(max-width: 767px) 100vw, ' . (int) ceil( (float) $layout['width'] ) . 'px',
				)
			);
		}
		return '<div class="sws-fx" data-sws-fx="' . esc_attr( (string) $content['effect'] ) . '">' . $image . '</div>';
	}

	/**
	 * Effect layers of the enabled slides that the runtime can start: the type is registered and its
	 * schema version is not newer than the installed module. Everything else stays a static fallback.
	 *
	 * @param list<array<string, mixed>> $slides        Enabled slides.
	 * @param string                     $document_json Validated document JSON (parameters keep `{}` and `[]` apart).
	 *
	 * @return list<array<string, mixed>> Runtime entries.
	 */
	private function effect_entries( array $slides, string $document_json ): array {
		if ( null === $this->effects ) {
			return array();
		}
		$params_of = $this->effect_params( $document_json );
		$entries = array();
		foreach ( $slides as $slide ) {
			foreach ( $slide['layers'] as $layer ) {
				if ( 'effect' !== $layer['type'] || 1 !== preg_match( DocumentValidator::ID_PATTERN, (string) $layer['id'] ) ) {
					continue;
				}
				$content    = $layer['content'];
				$descriptor = $this->effects->descriptor( (string) $content['effect'] );
				if ( null === $descriptor || (int) $content['schemaVersion'] > (int) $descriptor['schema_version'] ) {
					continue;
				}
				$assets = array();
				foreach ( (array) ( $content['assets'] ?? array() ) as $key => $attachment ) {
					$source = wp_get_attachment_image_src( (int) $attachment, 'large' );
					if ( is_array( $source ) ) {
						$assets[ (string) $key ] = array(
							'url'    => $source[0],
							'width'  => $source[1],
							'height' => $source[2],
						);
					}
				}
				$entries[] = array(
					'layerId'       => $layer['id'],
					'type'          => $content['effect'],
					'schemaVersion' => $content['schemaVersion'],
					'seed'          => $content['seed'],
					'quality'       => $content['quality'],
					'continuous'    => true === $descriptor['continuous'],
					'module'        => $descriptor['module_url'],
					'params'        => $params_of[ $layer['id'] ] ?? new \stdClass(),
					'assets'        => array() === $assets ? new \stdClass() : $assets,
				);
			}
		}
		return $entries;
	}

	/**
	 * Effect parameters by layer id, decoded as objects so nested empty objects stay `{}`.
	 *
	 * @param string $document_json Validated document JSON.
	 *
	 * @return array<string, object> Parameter objects.
	 */
	private function effect_params( string $document_json ): array {
		$document = json_decode( $document_json, false, 64 );
		$found    = array();
		foreach ( is_object( $document ) && is_array( $document->slides ?? null ) ? $document->slides : array() as $slide ) {
			foreach ( is_object( $slide ) && is_array( $slide->layers ?? null ) ? $slide->layers : array() as $layer ) {
				$content = is_object( $layer ) ? ( $layer->content ?? null ) : null;
				if ( is_object( $layer ) && 'effect' === ( $layer->type ?? null ) && is_string( $layer->id ?? null ) && is_object( $content ) && is_object( $content->params ?? null ) ) {
					$found[ $layer->id ] = $content->params;
				}
			}
		}
		return $found;
	}

	/**
	 * Minimal public runtime configuration: playback settings, breakpoints and per-slide timing.
	 * Contains no administrative data and no layer content.
	 *
	 * @param array<string, mixed>       $document Published document.
	 * @param list<array<string, mixed>> $slides   Enabled slides.
	 * @param list<array<string, mixed>> $effects  Runtime entries of the GPU effect layers.
	 */
	private function config_json( array $document, array $slides, array $effects = array() ): string {
		$config = array(
			'autoplay'    => true === $document['settings']['autoplay'],
			'loop'        => true === $document['settings']['loop'],
			'breakpoints' => $document['breakpoints'],
			'effects'     => $effects,
			'slides'      => array_map(
				static fn ( array $slide ): array => array(
					'id'         => $slide['id'],
					'durationMs' => Schedule::effective_slide_duration_ms( $slide ),
					'transition' => $slide['transition'],
					'effects'    => $slide['effects'] ?? new \stdClass(),
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

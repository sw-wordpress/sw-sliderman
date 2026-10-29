import type { SliderDocument } from '@shared/types';
import type { ValidationIssue } from '@shared/validate';
import { __, sprintf } from '@editor/i18n';

/** Human-readable description of a validation issue, naming the slide/layer (CODE-STYLE 7). */
export function describeIssue(issue: ValidationIssue, document: SliderDocument | null): string {
  const match = /^\/slides\/(\d+)(?:\/layers\/(\d+))?/.exec(issue.path);
  const slide = match ? document?.slides[Number(match[1])] : undefined;
  const layer = match?.[2] !== undefined ? slide?.layers[Number(match[2])] : undefined;
  const where = layer
    ? sprintf(__('Layer “%1$s” on “%2$s”'), layer.name, slide?.name ?? '')
    : slide
      ? sprintf(__('Slide “%s”'), slide.name)
      : __('Slider settings');
  const field = issue.path.split('/').pop() ?? '';
  const messages: Record<string, string> = {
    range: __('value out of range'),
    length: __('text too long or empty'),
    url: __('link is not allowed (use https://, mailto:, tel:, / or #)'),
    pattern: __('invalid format'),
    missing_resource: __('image or font is missing'),
    reference: __('font is not available'),
    animation_order: __('exit starts before the entrance ends'),
    breakpoint_order: __('screen sizes must increase'),
    no_enabled_slide: __('no slide is enabled'),
  };
  return `${where}: ${field} – ${messages[issue.code] ?? issue.code}`;
}

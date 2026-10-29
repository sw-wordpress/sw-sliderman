import { __ } from '@editor/i18n';
import type { WpMediaAttachment } from '@editor/types/wp';

/** Opens the WordPress media library for one image (wp_enqueue_media() on the admin page). */
export function pickImage(): Promise<WpMediaAttachment | null> {
  const media = window.wp?.media;
  if (!media) return Promise.resolve(null);
  return new Promise((resolve) => {
    const frame = media({
      title: __('Choose image'),
      button: { text: __('Use this image') },
      library: { type: 'image' },
      multiple: false,
    });
    let selected = false;
    frame.on('select', () => {
      selected = true;
      resolve(frame.state().get('selection').first().toJSON());
    });
    // `close` also fires after `select`; only an unselected close resolves with null.
    frame.on('close', () => {
      if (!selected) window.setTimeout(() => resolve(null), 0);
    });
    frame.open();
  });
}

/** Preview URL of a selected attachment (large size if available). */
export function previewOf(attachment: WpMediaAttachment): { url: string; width: number; height: number } {
  const large = attachment.sizes?.large ?? attachment.sizes?.full;
  return {
    url: large?.url ?? attachment.url,
    width: large?.width ?? attachment.width ?? 0,
    height: large?.height ?? attachment.height ?? 0,
  };
}

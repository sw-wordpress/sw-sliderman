/** The parts of the WordPress globals used by the editor (provided by wp-i18n and wp_enqueue_media). */
export interface WpI18n {
  __(text: string, domain?: string): string;
  _x(text: string, context: string, domain?: string): string;
  _n(single: string, plural: string, count: number, domain?: string): string;
  sprintf(format: string, ...args: Array<string | number>): string;
}

export interface WpMediaAttachment {
  id: number;
  url: string;
  alt?: string;
  width?: number;
  height?: number;
  type?: string;
  sizes?: Record<string, { url: string; width: number; height: number }>;
}

export interface WpMediaFrame {
  on(event: 'select' | 'close', handler: () => void): void;
  open(): void;
  state(): { get(name: 'selection'): { first(): { toJSON(): WpMediaAttachment } } };
}

export interface WpGlobal {
  i18n?: WpI18n;
  media?: (options: {
    title: string;
    button: { text: string };
    library: { type: string };
    multiple: boolean;
  }) => WpMediaFrame;
}

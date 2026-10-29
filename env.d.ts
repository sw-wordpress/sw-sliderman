/// <reference types="vite/client" />

import type { EditorConfig } from './assets/editor/types/config';
import type { WpGlobal } from './assets/editor/types/wp';

declare global {
  interface Window {
    swsEditorConfig?: EditorConfig;
    wp?: WpGlobal;
  }
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { Dialog, Notify, Quasar } from 'quasar';
import iconSet from 'quasar/icon-set/material-icons-round';
import langDe from 'quasar/lang/de-DE';
import langEn from 'quasar/lang/en-US';
import 'quasar/dist/quasar.prod.css';
import '@quasar/extras/material-icons-round/material-icons-round.css';
import './styles/fonts.css';
import './styles/app.css';

import App from './App.vue';
import { getConfig } from './config';
import { createAppRouter } from './router';

const MOUNT_ID = 'sw-sliderman-app';

function showFatal(el: HTMLElement, message: string): void {
  el.classList.add('sws-root');
  const p = document.createElement('p');
  p.setAttribute('role', 'alert');
  p.textContent = message; // textContent: never inject markup
  el.replaceChildren(p);
}

function bootstrap(): void {
  const el = document.getElementById(MOUNT_ID);
  if (!el) {
    console.error(`SW Sliderman: mount node #${MOUNT_ID} not found`);
    return;
  }
  let config;
  try {
    config = getConfig();
  } catch (error) {
    console.error(error);
    showFatal(el, 'SW Sliderman: configuration missing (window.swsEditorConfig).');
    return;
  }

  el.classList.add('sws-root', 'sws-fullbleed');
  document.body.classList.add('sws-admin-page');

  const app = createApp(App);
  app.use(createPinia());
  app.use(createAppRouter());
  app.use(Quasar, {
    plugins: { Notify, Dialog },
    iconSet,
    lang: config.locale.toLowerCase().startsWith('de') ? langDe : langEn,
    // Quasar portals (dialogs, menus, tooltips, notifications) are appended to <body>; give them
    // the root class so the scoped Quasar CSS and our tokens apply there as well.
    config: { globalNodes: { class: 'sws-root' } },
  });
  app.mount(el);
}

bootstrap();

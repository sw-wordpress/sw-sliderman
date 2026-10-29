import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';
import { __ } from '@editor/i18n';

export interface NavItem {
  readonly name: string;
  readonly to: string;
  readonly icon: string;
  readonly label: () => string;
  readonly cap?: 'sws_edit_sliders' | 'sws_manage_fonts';
}

export const NAV_ITEMS: readonly NavItem[] = [
  { name: 'sliders', to: '/', icon: 'r_view_carousel', label: () => __('Sliders') },
  { name: 'fonts', to: '/fonts', icon: 'r_text_fields', label: () => __('Fonts') },
];

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'sliders', component: () => import('@editor/features/sliders/SliderListView.vue') },
  {
    path: '/sliders/:id(\\d+)',
    name: 'editor',
    component: () => import('@editor/features/editor/EditorView.vue'),
    props: (route) => ({ id: Number(route.params.id) }),
  },
  { path: '/fonts', name: 'fonts', component: () => import('@editor/features/fonts/FontsView.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

export function createAppRouter() {
  return createRouter({ history: createWebHashHistory(), routes });
}

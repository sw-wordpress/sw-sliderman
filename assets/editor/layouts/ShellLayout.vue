<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { can, getConfig } from '@editor/config';
import { __ } from '@editor/i18n';
import { NAV_ITEMS } from '@editor/router';
import { useAppStore } from '@editor/stores/app';

const route = useRoute();
const app = useAppStore();
const config = getConfig();
const main = ref<HTMLElement | null>(null);
const allowed = computed(() => can('sws_edit_sliders'));
const navItems = computed(() => NAV_ITEMS.filter((item) => !item.cap || can(item.cap)));

// The editor needs the full width: collapse the rail there, restore it elsewhere.
watch(
  () => route.name,
  (name) => {
    app.railCollapsed = name === 'editor';
  },
  { immediate: true },
);

function focusMain(): void {
  main.value?.focus();
}

const transitionKey = computed(() => String(route.name ?? ''));
</script>

<template>
  <div
    class="sws-shell"
    :class="{
      'sws-shell--collapsed': app.railCollapsed,
      'sws-shell--editor': route.name === 'editor',
    }"
  >
    <a href="#sws-main" class="sws-skip" @click.prevent="focusMain">{{ __('Skip to content') }}</a>

    <aside class="sws-rail">
      <div class="sws-rail__brand">
        <span class="sws-rail__logo" aria-hidden="true"
          ><q-icon name="r_view_carousel" size="22px"
        /></span>
        <span class="sws-rail__name">
          <strong>SW Sliderman</strong>
          <small v-if="config.version" class="sws-num">v{{ config.version }}</small>
        </span>
      </div>

      <nav v-if="allowed" class="sws-rail__nav" :aria-label="__('Main navigation')">
        <ul>
          <li v-for="item in navItems" :key="item.name">
            <router-link
              :to="item.to"
              class="sws-nav-link"
              :active-class="item.to === '/' ? '' : 'sws-nav-link--active'"
              exact-active-class="sws-nav-link--active"
            >
              <q-icon :name="item.icon" size="22px" aria-hidden="true" />
              <span class="sws-nav-link__label">{{ item.label() }}</span>
              <q-tooltip
                v-if="app.railCollapsed"
                anchor="center right"
                self="center left"
                :offset="[8, 0]"
                >{{ item.label() }}</q-tooltip
              >
            </router-link>
          </li>
        </ul>
      </nav>

      <div class="sws-rail__tools">
        <q-btn
          flat
          round
          dense
          :icon="app.isDark ? 'r_light_mode' : 'r_dark_mode'"
          :aria-label="app.isDark ? __('Switch to light mode') : __('Switch to dark mode')"
          :aria-pressed="app.isDark"
          @click="app.toggleTheme()"
        >
          <q-tooltip>{{
            app.isDark ? __('Switch to light mode') : __('Switch to dark mode')
          }}</q-tooltip>
        </q-btn>
        <q-btn
          class="sws-rail__collapse"
          flat
          round
          dense
          :icon="
            app.railCollapsed ? 'r_keyboard_double_arrow_right' : 'r_keyboard_double_arrow_left'
          "
          :aria-label="app.railCollapsed ? __('Expand navigation') : __('Collapse navigation')"
          :aria-expanded="!app.railCollapsed"
          @click="app.railCollapsed = !app.railCollapsed"
        />
      </div>
    </aside>

    <main id="sws-main" ref="main" class="sws-main" tabindex="-1">
      <p v-if="!allowed" class="sws-noaccess" role="alert">
        {{ __('You do not have permission to edit sliders.') }}
      </p>
      <router-view v-else v-slot="{ Component }">
        <transition name="sws-fade" mode="out-in">
          <component :is="Component" :key="transitionKey" />
        </transition>
      </router-view>
    </main>

    <div class="sws-sr-only" role="status" aria-live="polite" aria-atomic="true">
      {{ app.announcement }}
    </div>
  </div>
</template>

<style scoped>
.sws-shell {
  --rail-w: 244px;
  --bar-h: var(--wp-admin--admin-bar--height, 32px);
  display: grid;
  grid-template-columns: var(--rail-w) minmax(0, 1fr);
  min-height: calc(100vh - var(--bar-h));
  background: var(--sws-bg);
  position: relative;
}
.sws-shell--collapsed {
  --rail-w: 76px;
}
.sws-skip {
  position: absolute;
  left: 12px;
  top: -60px;
  z-index: 100;
  padding: 8px 14px;
  border-radius: 8px;
  background: var(--sws-primary);
  color: #fff !important;
  font-weight: 600;
}
.sws-skip:focus {
  top: 10px;
}
.sws-rail {
  position: sticky;
  top: var(--bar-h);
  align-self: start;
  height: calc(100vh - var(--bar-h));
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px 14px;
  background: var(--sws-rail-bg);
  border-right: 1px solid var(--sws-border);
  transition: width 0.2s ease;
}
.sws-rail__brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 8px 16px;
  min-width: 0;
}
.sws-rail__logo {
  display: grid;
  place-items: center;
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  color: #fff;
  background: var(--sws-gradient);
  box-shadow: 0 6px 16px rgba(79, 70, 229, 0.35);
}
.sws-rail__name {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
  min-width: 0;
}
.sws-rail__name strong {
  font-size: 16px;
  letter-spacing: -0.01em;
}
.sws-rail__name small {
  color: var(--sws-muted);
  font-size: 12px;
}
.sws-rail__nav {
  flex: 1;
  overflow-y: auto;
}
.sws-rail__nav ul {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sws-nav-link {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  color: var(--sws-muted) !important;
  font-weight: 600;
  text-decoration: none !important;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}
.sws-nav-link:hover {
  background: var(--sws-surface-3);
  color: var(--sws-text) !important;
}
.sws-nav-link--active {
  background: var(--sws-primary-bg);
  color: var(--sws-primary-text) !important;
}
.sws-nav-link--active::before {
  content: '';
  position: absolute;
  left: -14px;
  top: 10px;
  bottom: 10px;
  width: 4px;
  border-radius: 0 4px 4px 0;
  background: var(--sws-gradient);
}
.sws-nav-link__badge {
  margin-left: auto;
  min-width: 22px;
  padding: 0 7px;
  border-radius: 999px;
  text-align: center;
  font-size: 12px;
  line-height: 22px;
  color: #fff;
  background: var(--sws-gradient);
}
.sws-rail__tools {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 4px 0;
  border-top: 1px solid var(--sws-border);
  color: var(--sws-muted);
}
.sws-shell--collapsed .sws-rail__name,
.sws-shell--collapsed .sws-nav-link__label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}
.sws-shell--collapsed .sws-nav-link {
  justify-content: center;
}
.sws-shell--collapsed .sws-nav-link__badge {
  position: absolute;
  top: 2px;
  right: 2px;
  margin: 0;
  min-width: 18px;
  line-height: 18px;
  font-size: 11px;
  padding: 0 5px;
}
.sws-shell--collapsed .sws-rail__tools {
  flex-direction: column;
  gap: 4px;
}
.sws-shell--collapsed .sws-rail__brand {
  justify-content: center;
  padding-inline: 0;
}
.sws-main {
  min-width: 0;
  padding: 28px clamp(16px, 3vw, 40px) 48px;
  outline: none;
}
.sws-main > * {
  max-width: 1320px;
  margin-inline: auto;
}
.sws-main > .sws-editor {
  max-width: none;
}
.sws-shell--collapsed .sws-main {
  padding: 16px clamp(12px, 1.5vw, 24px) 32px;
}

@media (max-width: 860px) {
  .sws-shell,
  .sws-shell--collapsed {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto 1fr;
  }
  .sws-rail {
    position: sticky;
    z-index: 20;
    height: auto;
    flex-direction: row;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    border-right: 0;
    border-bottom: 1px solid var(--sws-border);
  }
  .sws-rail__brand {
    padding: 0;
  }
  .sws-rail__name {
    display: none;
  }
  .sws-rail__nav {
    flex: 1;
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: thin;
  }
  .sws-rail__nav ul {
    flex-direction: row;
  }
  .sws-nav-link {
    flex-direction: column;
    gap: 2px;
    padding: 6px 10px;
    font-size: 11px;
  }
  .sws-shell--collapsed .sws-nav-link__label {
    position: static;
    width: auto;
    height: auto;
    clip: auto;
  }
  .sws-nav-link--active::before {
    left: 10px;
    right: 10px;
    top: auto;
    bottom: 0;
    width: auto;
    height: 3px;
    border-radius: 3px 3px 0 0;
  }
  .sws-nav-link__badge {
    position: absolute;
    top: 0;
    right: 2px;
    margin: 0;
    min-width: 18px;
    line-height: 18px;
    font-size: 11px;
    padding: 0 5px;
  }
  .sws-rail__tools {
    border-top: 0;
    padding: 0;
    flex-direction: row;
  }
  .sws-rail__collapse {
    display: none;
  }
  .sws-main {
    padding-top: 20px;
  }
}
</style>

<style scoped>
.sws-shell--editor .sws-main {
  padding: 0;
  min-height: 0;
  overflow: hidden;
}
@media (min-width: 901px) {
  .sws-shell--editor {
    height: calc(100dvh - var(--bar-h));
    min-height: 0;
    overflow: hidden;
  }
}
@media (min-width: 861px) {
  .sws-shell--editor.sws-shell--collapsed {
    --rail-w: 56px;
  }
  .sws-shell--editor.sws-shell--collapsed .sws-rail {
    padding: 12px 6px;
  }
  .sws-shell--editor.sws-shell--collapsed .sws-rail__logo {
    width: 32px;
    height: 32px;
    border-radius: 4px;
    box-shadow: none;
  }
  .sws-shell--editor.sws-shell--collapsed .sws-nav-link {
    padding: 8px;
    border-radius: 4px;
  }
}
</style>

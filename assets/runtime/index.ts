import './runtime.css';
import { parseConfig } from './config';
import { SliderInstance } from './SliderInstance';

/**
 * Frontend entry: enhances every server-rendered slider once. Sliders without a readable
 * configuration stay static (first slide), which is the documented no-JS state.
 */
const instances = new WeakMap<HTMLElement, SliderInstance>();

function enhance(root: HTMLElement): void {
  if (instances.has(root)) return;
  const text = root.querySelector('script.sws-config')?.textContent ?? '';
  const config = parseConfig(text);
  if (!config || config.slides.length === 0) return;
  instances.set(root, new SliderInstance(root, config));
}

function boot(): void {
  document.querySelectorAll<HTMLElement>('[data-sws-slider]').forEach(enhance);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}

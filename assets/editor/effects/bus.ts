import type { EffectEvent } from '@gpu/core/types';

/** Lets the properties panel trigger events (impulse) on the live preview of a layer. */
const target = new EventTarget();

export function emitEffectEvent(layerId: string, event: EffectEvent): void {
  target.dispatchEvent(new CustomEvent('effect', { detail: { layerId, event } }));
}

export function onEffectEvent(handler: (layerId: string, event: EffectEvent) => void): () => void {
  const listener = (raw: Event): void => {
    const detail = (raw as CustomEvent<{ layerId: string; event: EffectEvent }>).detail;
    handler(detail.layerId, detail.event);
  };
  target.addEventListener('effect', listener);
  return () => target.removeEventListener('effect', listener);
}

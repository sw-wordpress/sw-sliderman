import { onBeforeUnmount, ref, watch, type Ref } from 'vue';

/** Peers that stay silent this long (closed tab, crash) are forgotten. */
const PEER_TTL_MS = 12000;
const HEARTBEAT_MS = 4000;

interface Message {
  type: 'hello' | 'present' | 'bye';
  sliderId: number;
  tab: string;
}
type ChannelFactory = (name: string) => BroadcastChannel | null;

const defaultFactory: ChannelFactory = (name) =>
  typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(name);

/**
 * Detects the same slider open in another tab of this browser (PLAN.md 4.3). The server's version
 * check stays authoritative; this only warns early. Without BroadcastChannel nothing is reported.
 */
export function useTabGuard(
  sliderId: Ref<number | null>,
  siteId: number,
  factory: ChannelFactory = defaultFactory,
): { otherTabs: Ref<number> } {
  const otherTabs = ref(0);
  const tab = Math.random().toString(36).slice(2);
  const peers = new Map<string, number>();
  const channel = factory(`sw-sliderman-editor-${siteId}`);

  function post(type: Message['type'], id: number): void {
    channel?.postMessage({ type, sliderId: id, tab } satisfies Message);
  }
  if (channel) {
    channel.onmessage = (event: MessageEvent<Message>) => {
      const message = event.data;
      if (!message || message.tab === tab || message.sliderId !== sliderId.value) return;
      if (message.type === 'bye') peers.delete(message.tab);
      else peers.set(message.tab, Date.now());
      if (message.type === 'hello' && sliderId.value !== null) post('present', sliderId.value);
      otherTabs.value = peers.size;
    };
  }
  watch(
    sliderId,
    (id, previous) => {
      peers.clear();
      otherTabs.value = 0;
      if (previous !== undefined && previous !== null) post('bye', previous);
      if (id !== null) post('hello', id);
    },
    { immediate: true },
  );
  // Closing a browser tab never unmounts the component, so leave via pagehide; the heartbeat
  // covers tabs that vanish without it.
  function leave(): void {
    if (sliderId.value !== null) post('bye', sliderId.value);
  }
  function beat(): void {
    const cutoff = Date.now() - PEER_TTL_MS;
    peers.forEach((seen, peer) => {
      if (seen < cutoff) peers.delete(peer);
    });
    otherTabs.value = peers.size;
    if (sliderId.value !== null) post('present', sliderId.value);
  }
  const timer = channel ? window.setInterval(beat, HEARTBEAT_MS) : null;
  window.addEventListener('pagehide', leave);
  onBeforeUnmount(() => {
    leave();
    if (timer !== null) window.clearInterval(timer);
    window.removeEventListener('pagehide', leave);
    channel?.close();
  });
  return { otherTabs };
}

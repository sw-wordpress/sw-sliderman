/** Deferred, single-flight metadata checks. Installation uses WordPress core. */
interface UpdateConfig {
  url: string;
  nonce: string;
  due: boolean;
  ready: boolean;
  checking: string;
  completed: string;
  failed: string;
}

declare global {
  interface Window {
    swsVerifiedUpdates?: UpdateConfig;
  }
}

export function startUpdateChecks(): void {
  const candidate = window.swsVerifiedUpdates;
  if (!candidate) return;
  const config: UpdateConfig = candidate;
  if (!config.ready) return;
  let pending: Promise<void> | null = null;
  const button = document.getElementById('sws-verified-updates-check') as HTMLButtonElement | null;
  const result = document.getElementById('sws-verified-updates-result');
  const reload = document.getElementById('sws-verified-updates-reload');
  const status = document.getElementById('sws-verified-updates-status');
  function check(manual: boolean): Promise<void> {
    if (pending) return pending;
    if (manual && reload) reload.hidden = true;
    if (manual && result) {
      result.hidden = false;
      result.textContent = config.checking;
    }
    if (button) button.disabled = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 90000);
    pending = fetch(config.url, {
      signal: controller.signal,
      method: 'POST',
      credentials: 'same-origin',
      body: new URLSearchParams({
        action: 'sws_check_github_updates',
        nonce: config.nonce,
        manual: manual ? '1' : '0',
      }),
    })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok || body?.success !== true)
          throw new Error(body?.data?.message || config.failed);
        return body;
      })
      .then((response) => {
        if (manual && result) result.textContent = response.data?.message || config.completed;
        if (manual && reload) reload.hidden = false;
        if (manual && status) status.hidden = true;
      })
      .catch((error: unknown) => {
        if (manual && result)
          result.textContent =
            error instanceof Error && error.message ? error.message : config.failed;
      })
      .finally(() => {
        window.clearTimeout(timer);
        pending = null;
        if (button) button.disabled = false;
      });
    return pending;
  }
  button?.addEventListener('click', () => {
    void check(true);
  });
  if (config.due) {
    const defer = () => {
      if (typeof window.requestIdleCallback === 'function')
        window.requestIdleCallback(
          () => {
            void check(false);
          },
          { timeout: 5000 },
        );
      else
        window.setTimeout(() => {
          void check(false);
        }, 1500);
    };
    if (document.readyState === 'complete') defer();
    else window.addEventListener('load', defer, { once: true });
  }
}

startUpdateChecks();

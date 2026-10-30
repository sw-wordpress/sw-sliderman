/** A font or stylesheet failure must never block the editor indefinitely. */
export function boundedFontWait(
  work: Promise<boolean>,
  signal?: AbortSignal,
  timeoutMs = 1200,
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      resolve(ok);
    };
    const abort = (): void => finish(false);
    const timer = window.setTimeout(abort, timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) finish(false);
    void work.then(finish, () => finish(false));
  });
}

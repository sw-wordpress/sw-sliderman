/**
 * Prepare lazy images before revealing a slide. Broken/stalled images never block navigation;
 * the promise resolves `false` when an image failed or the wait timed out (state `error`).
 */
export function prepareImages(
  container: HTMLElement,
  signal: AbortSignal,
): Promise<boolean> | null {
  const images = Array.from(container.querySelectorAll<HTMLImageElement>('img'));
  if (images.length === 0 || signal.aborted) return null;
  return new Promise<boolean>((resolve) => {
    const cleanups: Array<() => void> = [];
    let settled = false;
    let ok = true;
    const finish = (result = true): void => {
      if (settled) return;
      settled = true;
      cleanups.forEach((cleanup) => cleanup());
      resolve(result && ok);
    };
    const timeout = window.setTimeout(() => finish(false), 1200);
    cleanups.push(() => window.clearTimeout(timeout));
    const aborted = (): void => finish();
    signal.addEventListener('abort', aborted, { once: true });
    cleanups.push(() => signal.removeEventListener('abort', aborted));
    const ready = images.map((image) => {
      image.loading = 'eager';
      return new Promise<void>((done) => {
        const failed = (): void => {
          ok = false;
          done();
        };
        const decode = (): void => {
          if (typeof image.decode === 'function')
            void image.decode().then(done, () => {
              ok = false;
              done();
            });
          else done();
        };
        if (image.complete) decode();
        else {
          image.addEventListener('load', decode, { once: true });
          image.addEventListener('error', failed, { once: true });
          cleanups.push(() => {
            image.removeEventListener('load', decode);
            image.removeEventListener('error', failed);
          });
        }
      });
    });
    void Promise.all(ready).then(() => finish());
  });
}

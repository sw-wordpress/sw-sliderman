/** Prepare lazy images before revealing a slide. Broken/stalled images never block navigation. */
export function prepareImages(container: HTMLElement, signal: AbortSignal): Promise<void> | null {
  const images = Array.from(container.querySelectorAll<HTMLImageElement>('img'));
  if (images.length === 0 || signal.aborted) return null;
  return new Promise((resolve) => {
    const cleanups: Array<() => void> = [];
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      cleanups.forEach((cleanup) => cleanup());
      resolve();
    };
    const timeout = window.setTimeout(finish, 1200);
    cleanups.push(() => window.clearTimeout(timeout));
    signal.addEventListener('abort', finish, { once: true });
    cleanups.push(() => signal.removeEventListener('abort', finish));
    const ready = images.map((image) => {
      image.loading = 'eager';
      return new Promise<void>((done) => {
        const failed = (): void => done();
        const decode = (): void => {
          if (typeof image.decode === 'function') void image.decode().then(done, done);
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
    void Promise.all(ready).then(finish);
  });
}

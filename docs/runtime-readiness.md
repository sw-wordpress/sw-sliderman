# Image readiness and animation lifecycle

The runtime keeps the visible slide while the requested slide's images load and decode. Lazy images on the requested slide are promoted to eager loading. Image readiness is bounded to 1,200 ms; load errors and decoding errors also release the wait. The first slide waits concurrently for images and local fonts, with a bounded font wait. A timeout permits readable content rather than blocking navigation indefinitely. Images arriving after the deadline do not restart the timeline.

Navigation increments a generation and aborts the previous resource wait. Stale resource and animation callbacks cannot activate a superseded slide. Entrance and exit animations are installed with a paused clock before revealing the incoming slide, then released after the slide transition. The full scheduled slide duration begins at that point. Image preparation is also used by the editor's explicit animation preview; switching slides or devices cancels a pending preview.

Autoplay remains opt-in. User pause, hover, keyboard focus, document visibility, offscreen state and reduced motion retain their existing priority. Hiding the document during a transition settles on one readable slide and cancels its animations; becoming visible can schedule autoplay again. Reduced motion always leaves readable static content.

Image sizing buttons use the selected image's media dimensions (falling back to its current layer box), preserve aspect ratio, center the layer and reuse the existing anchor/breakpoint conversion. Each click is one undo step. They create ordinary document values, so no schema or PHP resolver change is required. Values outside the existing document size limits are rejected.

## Regression checks

Run `npm test` for deterministic lifecycle and sizing tests. After `npm run build`, run `node tests/e2e/runtime-regressions.mjs` for Chromium's native image decoding and Web Animations. The browser check serves an intercepted HTML fixture with a delayed image; it needs an installed Playwright Chromium but makes no WordPress writes. It verifies readiness, no visible entrance frame before animation, transition/entrance clock ordering, autoplay, hover pause and looping.

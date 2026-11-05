# ADR 0005 – GPU effect platform (M10)

Status: decided 05.11.2026 (Stefan). Implementation notes and API: [GPU_EFFECTS.md](../GPU_EFFECTS.md).

- **Document model:** a new layer type `effect` (`content`: `effect` type id, `schemaVersion`, `seed`, `params`, `assets`, `quality`, `fallbackImageId`). It inherits layout (also 100 % × 100 %), z-order, enter/exit animation, undo/redo, duplication and publishing. Additive: no migration; older plugin versions reject the type.
- **One ZIP, extensible:** the core platform and first modules live in `assets/gpu/` (module boundaries enforced by ESLint, no npm workspaces). Other plugins add effects through a PHP registry (`sws_register_effects` filter: type id `vendor/name`, label, `continuous` flag, parameter schema, same-origin ES module URL). Add-on code is trusted plugin code; documents only ever store schema-validated parameters, never code or shaders.
- **Parameters** are validated by a small, closed schema dialect (JSON Schema subset, no unknown keys) implemented twice (TS `assets/gpu/core/schema.ts`, PHP `src/Domain/EffectSchema.php`) against shared fixtures. The same schema generates the editor panel.
- **Backends:** WebGL2 first (transform feedback, instanced draw, no per-frame readbacks); WebGPU compute as a second backend behind the same interface later. Backend selection by capability, with fallback to the static image.
- **Delivery:** the runtime never imports `assets/gpu`. A separate lazily loaded bundle is enqueued only when an enabled slide has an effect layer; modules are code-split per type and loaded with the plugin version.
- **Performance rules:** GPU-resident simulation, one shared `requestAnimationFrame` scheduler, fixed 1/60 s simulation step, only the visible active slide runs, adaptive quality with hysteresis, no allocations in the frame loop. The core runs behind a host contract that carries only plain data (no DOM in `update`), which keeps a later worker/`OffscreenCanvas` host possible.
- **Accessibility:** decorative canvas (`aria-hidden`, no focus, `pointer-events: none`), static fallback for no JS / reduced motion / no GPU. Continuous effects always get the slider's pause switch, also without autoplay.
- **Sources:** all effect algorithms, names and shaders are our own; `docs/GPU_EFFECT_FRAMEWORK_SPEC.md` is an implementation brief kept out of the repository.

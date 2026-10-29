# ADR 0003 – M0 decisions: drag/resize, render wrappers, animation (TODO M0.15)

- **Drag/resize:** own Pointer Events implementation (`StageCanvas.vue`, ~150 lines) instead of a library: pointer capture, conversion via zoom scale into stage pixels, one history entry per gesture, Escape/pointercancel restore, edge/centre snapping, optional grid. No dependency, full control over undo semantics. Revisit in M3 if rotation handles/multi-resize grow complex.
- **Render wrappers:** `.sws-layer` (position/size, % of stage) → `.sws-layer__anim` (animation transform/opacity) → `.sws-layer__body` (user rotation, typography). The same markup and the same declarations (`shared/css.ts` = `StyleSerializer.php`) are used by canvas and frontend.
- **Layout without JS:** container queries + `cqw` units; the runtime only adds playback.
- **Animation:** CSS + Web Animations API only (`shared/animation.ts`, shared by preview and runtime), presets with fixed keyframes; no extra engine. Runtime 3.7 KiB gzip.
- **Baseline (M0.16, accepted):** PHP 8.2+, WordPress 6.6+ (CI tests 6.6 and latest), name/slug `sw-sliderman`, namespace `SW\Slider` – explicitly confirmed by Stefan on 2026-10-29.

## M0 acceptance (2026-10-29)

Stefan confirmed all M0 checks after practical testing and accepted the prototype as meeting expectations for the start of the project. M0.17 outcome: **continue** with the existing architecture. This is acceptance of the feasibility baseline, not production readiness or acceptance of later milestones.

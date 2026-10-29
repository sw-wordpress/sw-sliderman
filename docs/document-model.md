# Document model (schema v1)

Machine-readable description: `schemas/slider-document.v1.schema.json`. Authoritative are the two validators (`assets/shared/validate.ts`, `src/Domain/DocumentValidator.php`), kept identical by the fixtures. Limits: `assets/shared/limits.ts` = `src/Domain/Limits.php`.

## Responsive layout

- Breakpoints are chosen by the **slider container width**: `mobile` (minWidth 0) < `tablet` < `desktop`.
- `layer.layout` / `layer.style` are the desktop (base) values. `overrides.tablet` and `overrides.mobile` hold only changed properties; resolution order desktop → tablet → mobile, missing = inherited. Overridable style keys: fontSize, lineHeight, letterSpacing, textAlign, paddingX, paddingY. All layout keys (incl. `visible`) are overridable.
- Coordinates are logical stage pixels of the breakpoint's stage. `anchorX`: `left` = distance from the left edge, `center` = offset of the layer centre from the stage centre, `right` = distance of the right edges; `anchorY` analogously.
- Output: positions in % of the stage, lengths in `cqw` of the `sws` container, breakpoints as container queries. Layout therefore works without JavaScript and identically in the editor canvas.

## Animation

Per layer an entrance phase and either `slide-end` (visible until the slide ends) or a timed exit that starts at or after the entrance end. The effective slide duration is the maximum of the configured duration and all mandatory animation ends (`Schedule` in TS and PHP). Layout, user rotation (`.sws-layer__body`) and animation (`.sws-layer__anim`) use separate elements.

## Storage

- Draft: canonical JSON in `post_content` of `sw_slider` (revisions included), ASCII-only with `<>&'"` and backslashes escaped so WordPress save filters (KSES, emoji encoding, `wp_kses_no_null`) cannot alter it.
- `_sws_version`: draft version (compare-and-swap under a DB lock, ADR 0001).
- `_sws_published`: snapshot (version, document hash, renderer version, document copy, stylesheet path, font installations). Stylesheets: `uploads/sw-sliderman/artifacts/<hash>-r<renderer>.css`, written atomically; missing files are recalculated on output.
- Fonts: `sw_slider_font` posts with the installation manifest; files in `uploads/sw-sliderman/fonts/<content hash>/`.

## M1 versioning and recovery

Schema v1 is the first supported production format. Generated document/slide/layer IDs are UUID v4; the v1 validator continues to accept the documented bounded identifier syntax for existing M0 documents and fixtures. Font-reference IDs are document-local and are remapped on whole-slider duplication; installation IDs and attachment IDs remain pinned external resources. There are no additional layer-to-layer reference fields in v1.

`DocumentMigrator` and `shared/migrate.ts` implement explicit, sequential one-version migration dispatch on a private copy. Every step must preserve document identity and advance exactly one version; missing steps and newer/unknown formats are rejected. No undocumented v0 converter is enabled. Synthetic shared fixtures test a multi-step chain without introducing a production v2/v3 format. The explicit migrate endpoint validates the target and uses the normal versioned repository save; replacing a draft first preserves its exact source revision. Current v1 is a no-op.

The 512-KiB document limit applies to **canonical ASCII storage**, including Unicode, quote and backslash escapes. PHP and TS check this before saving so a document accepted by the editor cannot exceed the publication validator's storage bound. Raw REST requests also have a bounded envelope.

Autosave records are user-specific WordPress revisions and never change the main draft version or live snapshot. The editor's existing periodic save remains a normal versioned draft save; the new separate autosave endpoint is an explicit recovery API, not a claim that the periodic save now uses WordPress autosaves. The revision dialog can restore a recovery or historical revision after saving the current work. Foreign-parent revisions are rejected. A restored revision creates a new draft version, and publication remains an explicit action.

Saved draft previews use authenticated `admin-post.php?action=sws_preview&id=…&_wpnonce=…`, with current per-object edit permission and a user/object-bound nonce. Responses are private/no-store, noindex and same-origin framed, and render through the same renderer and assets as live output. No draft JSON or CSS file is written publicly; styles are generated inline for the authorized request. The ordinary shortcode continues to read only published snapshots.

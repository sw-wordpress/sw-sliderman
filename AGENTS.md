# AGENTS.md – long-term rules for sw-sliderman

Read `PLAN.md` (product spec), `CODE-STYLE.md` (binding rules) and `TODO.md` (state) before changing code.

## Architecture rules
- One PHP style for everything: WordPress coding standards, PSR-4 PascalCase class files (CODE-STYLE 2.1), snake_case methods, `declare(strict_types=1)`.
- `src/Domain` is WordPress-free (validator, layout resolver, schedule, canonical JSON). `src/Application` holds use cases and ports, `src/Infrastructure`, `src/Fonts` (adapters), `src/Rest`, `src/Admin`, `src/Rendering` are the WordPress edges. `src/Plugin.php` is the only composition root.
- `assets/shared` is pure TypeScript (no DOM, Vue, network). `assets/runtime` never imports editor libraries (ESLint + `bin/check-bundles.mjs`). `assets/editor` uses the shared resolver/CSS/schedule; no second layout logic.
- Every document rule exists twice (TS + PHP) and is tested against `tests/fixtures` by Vitest and PHPUnit. Change the fixture first, then both implementations.
- Writes go through `SliderService`; drafts are serialized per slider (`GET_LOCK`, ADR 0001) and need `expectedVersion`. Publishing never touches the live snapshot before the new artifact is complete.
- Fonts: browsers load only local files; only `FontInstaller` talks to the provider, every URL passes `DownloadPolicy` (ADR 0002). Never add a remote font fallback.

## Workflow
1. Adjust fixtures/contract → implement → `composer check`, `npm run lint && npm run typecheck && npm test && npm run build`, `bin/i18n.sh check`, WordPress tests (`bin/test-db.sh start && composer test:wp`) → docs → `TODO.md` (tick only proven items) → small coherent commit.
2. Never run destructive operations on the real WordPress database; tests use the private MariaDB from `bin/test-db.sh`.
3. `tests/e2e/editor.mjs` runs the full flow against the local dev site (activates the plugin, creates and removes `E2E Hero*` sliders, installs Lato).
4. M0 practical checks (TODO M0.10–M0.14) are Stefan's; never mark them done.

## Translations
Every user-facing string change updates German too: PHP catalog `languages/src/php-de_DE.json`, editor catalog `languages/src/editor-de_DE.json`, then `bin/i18n.sh update` (needs WP-CLI) and `bin/i18n.sh check`. German texts are worded neutrally (no du/Sie) because `de_DE_formal` falls back to `de_DE`.

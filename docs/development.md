# Development

| Area | Tooling | Command |
| --- | --- | --- |
| PHP style | PHPCS + WordPressCS 3 + PHPCompatibilityWP (`phpcs.xml.dist`) | `composer cs` / `composer cs:fix` |
| PHP types | PHPStan level 8 + phpstan-wordpress | `composer stan` |
| PHP unit/contract | PHPUnit 11, no WordPress (`tests/php`) | `composer test` |
| WordPress integration | wp-phpunit, PHPUnit 9.6 (`tests/wp`), private MariaDB | `bin/test-db.sh start`, `composer test:wp` |
| TS/Vue | ESLint 9, Prettier, vue-tsc (strict, `exactOptionalPropertyTypes`) | `npm run lint`, `npm run typecheck` |
| TS unit/contract | Vitest + jsdom (`tests/unit`) | `npm test` |
| Build | Vite 6: editor (ES module), runtime (IIFE) | `npm run build` |
| Bundle guard | runtime budget, import boundary, no remote fonts, scoped admin CSS | `node bin/check-bundles.mjs` (part of the build) |
| E2E | Playwright against the local site | `node tests/e2e/editor.mjs` |
| Runtime regressions | Playwright with intercepted fixtures, no WordPress writes (after build) | `node tests/e2e/runtime-regressions.mjs` |

Node 18.18 is enough locally (versions pinned like sw-backupit); CI uses Node 22.

## Contract fixtures

`tests/fixtures/documents/valid/*.json`, `documents/invalid.json` (patch cases with exact expected issues), `css/basic.json` (golden layout/CSS, regenerate with `php bin/contract-fixtures.php` and review the diff), `schedule/basic.json`, `fonts/*.css` (recorded CSS2 API responses; no font files are checked in).

## Admin CSS isolation

As in sw-backupit: the app mounts in `#sw-sliderman-app` with `.sws-root`; Quasar CSS is rewritten to `.sws-root …` by `tools/postcssScope.ts`; portals get the root class. The editor canvas renders the frontend markup (`.sws-slider`) with the same runtime stylesheet.

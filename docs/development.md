# Development

Status: M0 accepted; M1 foundation and persistence implemented; evidence and remaining milestones in [TODO.md](../TODO.md). The editor uses Vue 3 + Quasar (no Quasar CLI) in the design of sw-backupit; the frontend runtime has no dependencies.

| Area | Tooling | Command |
| --- | --- | --- |
| PHP style | PHPCS + WordPressCS 3 + PHPCompatibilityWP (`phpcs.xml.dist`) | `composer cs` / `composer cs:fix` |
| PHP types | PHPStan level 8 + phpstan-wordpress | `composer stan` |
| PHP unit/contract | PHPUnit 11, no WordPress (`tests/php`) | `composer test` |
| WordPress integration | wp-phpunit, PHPUnit 9.6 (`tests/wp`), private MariaDB | `bin/test-db.sh start`, `composer test:wp` |
| TS/Vue | ESLint 9, Prettier, vue-tsc (strict, `exactOptionalPropertyTypes`) | `npm run lint`, `npm run typecheck` |
| TS unit/contract | Vitest + jsdom (`tests/unit`) | `npm test` |
| Build | Vite 6: editor (ES module), runtime (IIFE) | `npm run build` |
| Block files | `assets/block` copied to `build/block` (shipped; `assets/` is not) | `node bin/build-block.mjs` (part of the build) |
| Bundle guard | runtime budget, import boundary, no remote fonts, scoped admin CSS | `node bin/check-bundles.mjs` (part of the build) |
| E2E | Playwright against the local site | `node tests/e2e/editor.mjs` |
| Preview/Website-Vergleich (M3.24) | Playwright, Referenzdokument auf drei Breiten (1180/820/375 px); Toleranz 1 px + 0,1 % der Containerbreite, Schrift 0,6 px; legt `E2E Parity*`-Slider an und entfernt sie | `node tests/e2e/parity.mjs` |
| Hero effects | Native Chromium at desktop/tablet/mobile widths; no WordPress writes (after build) | `node tests/e2e/hero-effects.mjs` |
| Accessibility regressions | Playwright, intercepted fixture, no WordPress writes (after build) | `node tests/e2e/accessibility.mjs` |
| Block in the block editor | Playwright against the dev site (creates and removes `E2E Block*` sliders/pages) | `node tests/e2e/block.mjs` |
| Runtime regressions | Playwright with intercepted fixtures, no WordPress writes (after build) | `node tests/e2e/runtime-regressions.mjs` |

Node 18.18 is enough locally (versions pinned like sw-backupit); CI uses Node 22.

## Contract fixtures

`tests/fixtures/documents/valid/*.json`, `documents/invalid.json` (patch cases with exact expected issues), `css/basic.json` (golden layout/CSS, regenerate with `php bin/contract-fixtures.php` and review the diff), `schedule/basic.json`, `fonts/*.css` (recorded CSS2 API responses); static Lato WOFF2 fixtures include their OFL license.

## Admin CSS isolation

As in sw-backupit: the app mounts in `#sw-sliderman-app` with `.sws-root`; Quasar CSS is rewritten to `.sws-root …` by `tools/postcssScope.ts`; portals get the root class. The editor canvas renders the frontend markup (`.sws-slider`) with the same runtime stylesheet.


## M1 persistence verification

`tests/wp/tests/SliderRestTest.php` covers separate recovery autosaves, revision restoration, duplicate identity remapping, private preview authorization, rejected unknown schemas, missing media/font files, failed publication storage, and rollback after metadata failures. `tests/wp/workers/save.php` starts two independent WordPress/database processes against the private test database; exactly one can save the same expected version. The test harness ends its own repeatable-read snapshot before observing those external writes.

The repository owns InnoDB transaction boundaries and requires named-lock support. Do not call it from a caller-owned transaction. The plugin uses no external database executable at runtime; `bin/test-db.sh` is development tooling only. When a temporary test database exits with its command session, start it and run the suite in the same shell invocation. Use a separate `SWS_TEST_DB_DIR` and `SWS_TEST_DB_PORT` when another private instance is already using the defaults.

The local M1 browser check opened an existing slider, loaded the revisions dialog and opened its saved-draft preview; it made no slider changes. The preview returned private/no-store and noindex headers, ran the native runtime and denied an anonymous request using the same URL. Duplication/restoration effects are exercised against the isolated integration database, not the development site's sliders.

M2 local-font browser/acceptance checks: [font-testing.md](font-testing.md).

## Coverage

`npm run coverage` misst alle produktiven TS-/Vue-/JS-Dateien (auch das buildfreie Block-Skript `assets/block/editor.js`) und erzwingt mehr als 80 % Zeilenabdeckung. PHP: `composer coverage`, danach WordPress-PHPUnit mit `--coverage-clover coverage/wordpress.xml` (vom Projektroot); `php tests/coverage/merge.php coverage/unit.xml coverage/wordpress.xml` vereinigt beide Berichte und erzwingt ebenfalls > 80 %. PHP benötigt PCOV oder Xdebug, CI verwendet Xdebug. Kein produktiver Bereich ist ausgenommen. SonarQube erhält PHP-Clover und JS-LCOV aus CI-Artefakten.

## CI

`.github/workflows/tests.yml`: PHP checks with coverage, WordPress tests on MariaDB (matrix WordPress 6.6/latest), frontend checks and SonarQube Cloud (secret `SONAR_TOKEN`, variable `SONAR_ORGANIZATION`). `.github/workflows/main.yml`: release ZIP on version tags.

## Dependency security

- `tests.yml` gates PRs and pushes: `composer audit --locked --no-dev` (skipped while no runtime packages are shipped) and `npm audit --omit=dev --audit-level=high`; each runs once, not per matrix cell.
- `security-audit.yml` audits daily and keeps one open `security-audit` issue. `dependabot.yml` groups updates (npm, Composer, GitHub Actions); `tests/wp` is not covered.
- SonarQube is skipped for Dependabot PRs (no secrets). Enable Dependabot alerts and security updates in the repository settings.
- PHPStan level 8 (`composer stan`) covers all shipped PHP with no baseline or ignores; constants live in `tests/php/phpstan-constants.php`, `SWS_MIN_PHP`/`PHP_VERSION` are `dynamicConstantNames`. `bin/*.php` is dev tooling and not analysed.
- Node 22 is used in CI; dev-tooling `npm audit` findings are tracked separately.

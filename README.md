# SW Sliderman

Responsive layer slider for WordPress with a visual editor (Vue 3 + Quasar, design of sw-backupit), container-based desktop/tablet/mobile layouts, a dependency-free frontend runtime and **locally hosted Google Fonts**.

Status: M0 accepted; M1 foundation and persistence implemented (see `TODO.md` for evidence and remaining product milestones). Product rules: `PLAN.md`, coding rules: `CODE-STYLE.md`, agent rules: `AGENTS.md`.

## Use

1. *Sliderman → Schriften*: install a static Google Font family (the server downloads it once; visitors and the editor never contact Google).
2. *Sliderman → Neuer Slider*: add slides and text/image/button layers, adjust tablet/mobile with per-property overrides, save, publish.
3. Embed with `[sw_slider id="123"]` (several instances per page are fine). Only the published snapshot is shown; drafts never.

## Development

```bash
composer install && npm ci
npm run build            # build/editor + build/runtime (+ bundle checks)
composer check           # phpcs (WPCS), phpstan level 8, phpunit unit/contract tests
npm run lint && npm run typecheck && npm test
bin/test-db.sh start && (cd tests/wp && composer install) && composer test:wp
bin/i18n.sh check
node tests/e2e/editor.mjs   # full flow against the local dev site
bin/build-zip.sh            # release ZIP (tracked files only)
```

Docs: `docs/development.md`, `docs/document-model.md`, `docs/rest-api.md`, `docs/translations.md`, ADRs in `docs/adr/`.

CI (`.github/workflows`): `tests.yml` (PHP checks with coverage + WordPress tests on MariaDB, WordPress 6.6/latest matrix, frontend checks, SonarQube Cloud), `main.yml` (release ZIP on version tags). SonarQube needs the secret `SONAR_TOKEN` and the variable `SONAR_ORGANIZATION`.

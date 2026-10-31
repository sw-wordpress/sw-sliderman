# SW Sliderman

[![Release](https://img.shields.io/github/v/release/sw-wordpress/sw-sliderman?sort=semver)](https://github.com/sw-wordpress/sw-sliderman/releases)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=sw-wordpress_sw-sliderman&metric=coverage)](https://sonarcloud.io/summary/overall?id=sw-wordpress_sw-sliderman)
[![SonarQube Issues](https://sonarcloud.io/api/project_badges/measure?project=sw-wordpress_sw-sliderman&metric=vulnerabilities)](https://sonarcloud.io/project/issues?id=sw-wordpress_sw-sliderman&impactSoftwareQualities=SECURITY&resolved=false)

Responsive layer [slider](https://en.wikipedia.org/wiki/Slider_(computing)) for WordPress with a visual editor
and locally hosted [Google Fonts](https://en.wikipedia.org/wiki/Google_Fonts).
Preview in early development, not ready for production sites.

## Features

- **Visual editor** — Place text, image and button layers on slides directly on the canvas.
- **Desktop, tablet and mobile layouts** — Adjust single properties per screen size; everything else is inherited.
- **Drafts and revisions** — Visitors only see the published version; earlier revisions can be restored.
- **Local Google Fonts** — Fonts are downloaded once to your server; visitors never contact Google.
- **Lightweight frontend** — Sliders are shown without jQuery or other script libraries.

## Languages

English, German.

## Usage

1. Optional: open **Sliderman → Fonts** and click **Install** next to a font family.
2. Open **Sliderman → Sliders**, click **New slider**, enter a name and click **Create and edit**.
3. Use **Add slide** and **Add layer** (Text, Image, Button), switch between **Desktop**, **Tablet** and **Mobile**
   to fine-tune the layout, then click **Save** and **Publish**.
4. Click **Copy embed code** in the slider list and paste the shortcode into a page, e.g. `[sw_slider id="123"]`.
   Several sliders per page are fine; drafts are never shown.

## Configuration

### Requirements

PHP 8.2+ with JSON, WordPress 6.6+, MySQL or MariaDB with InnoDB tables, single-site installation (multisite not tested yet).

### Settings

The only setting is **Offline mode** under **Sliderman → Fonts → Font downloads**; it blocks new font downloads,
installed fonts keep working. Access is controlled by the capabilities `sws_edit_sliders`, `sws_publish_sliders`
and `sws_manage_fonts`, granted to administrators on activation.

The plugin has no `wp-config.php` constants of its own.

### Background tasks

Font installations and catalog updates run via WP-Cron. While **Sliderman → Fonts** is open, the page processes
queued jobs itself, so downloads also work with `DISABLE_WP_CRON`.

### Integrations

- **Google Fonts** — Only when an administrator installs a font or updates the catalog, the server downloads it
  from `fonts.googleapis.com`/`fonts.gstatic.com` and its license from the [google/fonts](https://github.com/google/fonts)
  repository. Visitors and the editor only load font files from your own site.

### Deactivation and removal

Deactivating keeps all sliders, revisions, fonts and settings. Deleting the plugin only removes its capabilities
and version marker; sliders, revisions and installed fonts (`wp-content/uploads/sw-sliderman/`) stay and must be
removed manually if no longer needed.

## Troubleshooting

| Problem | Solution |
|---|---|
| Notice "The SW Sliderman editor has not been built". | Install the release ZIP instead of the repository source. |
| Font installation stays queued. | Keep **Sliderman → Fonts** open or click **Continue processing**; check that **Offline mode** is off. |
| "Upload origin differs: local font loading is disabled." | A CDN or offload plugin serves uploads from another domain; serve `uploads/sw-sliderman/` from your site. |

## Built with AI

This plugin was implemented with AI assistance. Why it exists and how AI is used:
[sw-wordpress manifest](https://github.com/sw-wordpress/.github/blob/main/profile/README.md).

AI agents must follow the project rules before changing code:

- Rules and mandatory coverage: [AGENTS.md](AGENTS.md), [CODE-STYLE.md](CODE-STYLE.md)
- Architecture and milestones: [PLAN.md](PLAN.md), current status: [TODO.md](TODO.md)
- Decisions and technical details: [docs/](docs/) (ADRs in [docs/adr/](docs/adr/))
- README structure: [README-STANDARD.md](https://github.com/sw-wordpress/sw-securelogin/blob/master/docs/README-STANDARD.md)

## Development

Requirements: PHP 8.2+, Composer, Node.js 18.18+ with npm; MariaDB for the WordPress test suite.

```sh
composer install && npm ci
npm run build            # build/editor + build/runtime (+ bundle checks)
composer check           # phpcs (WPCS), phpstan level 8, phpunit unit/contract tests
npm run lint && npm run typecheck && npm test
bin/test-db.sh start && (cd tests/wp && composer install) && composer test:wp
bin/i18n.sh check
node tests/e2e/editor.mjs   # full flow against the local dev site
bin/build-zip.sh            # release ZIP (tracked files only)
```

Every change needs tests; line coverage must stay above 80 % for PHP and JavaScript/TypeScript
(`npm run coverage`, `composer coverage`). GitHub Actions run all checks; SonarQube Cloud needs the secret
`SONAR_TOKEN` and the variable `SONAR_ORGANIZATION`. Status, CI and coverage details:
[docs/development.md](docs/development.md); also [document model](docs/document-model.md),
[REST API](docs/rest-api.md), [translations](docs/translations.md), [font testing](docs/font-testing.md).

## License

[GPL-2.0-or-later](https://www.gnu.org/licenses/gpl-2.0.html) — see [LICENSE](LICENSE). Provided by Stefan Warnat.

Bundled third-party components (in `build/editor/`; license notices in the bundle headers and upstream repositories):

- [Vue](https://github.com/vuejs/core) — MIT
- [Vue Router](https://github.com/vuejs/router) — MIT
- [Pinia](https://github.com/vuejs/pinia) — MIT
- [Quasar](https://github.com/quasarframework/quasar) — MIT
- [Quasar Extras](https://github.com/quasarframework/quasar/tree/dev/extras) — MIT; contained Material Icons Round font — Apache-2.0
- [Inter](https://github.com/rsms/inter) font via Fontsource — OFL-1.1
- [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) font via Fontsource — OFL-1.1

`fonts/catalog.json` contains font metadata from [google/fonts](https://github.com/google/fonts). Google Fonts are
not bundled; each installed font keeps its license as `LICENSE.txt` in `wp-content/uploads/sw-sliderman/fonts/`.

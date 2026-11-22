# Documentation maintenance (not published)

## Page plan — recorded before implementation

Audience: WordPress administrators and editors building image sliders and text/button hero sections without editing code. The README is the primary existing user guide and is English; the new guide therefore uses English and the English UI labels (German UI translations also exist).

Evidence reviewed: root README, AGENTS, PLAN, CODE-STYLE and TODO; `schemas/defaults/new-slider.json`; editor slider list, properties, notices, recovery, fonts and package UI; shared limits; rendering/block and runtime contracts; `docs/packages.md`, `docs/effects.md`, `docs/GPU_EFFECTS.md`; editor/accessibility and package tests; release packaging. Roadmap items alone are not evidence of available features.

| Page | Why users need it |
| --- | --- |
| `index.md` | Factual function overview and entry points, with the existing early-development warning. |
| `getting-started.md` | Requirements, installable ZIP versus source checkout, and the first published shortcode/block. |
| `editor.md` | Actual layer types, canvas operations, saved drafts, revisions and safe conflict handling. |
| `responsive-layout.md` | Container breakpoints, stage scaling, property inheritance and readable mobile layouts. |
| `playback-and-effects.md` | Playback defaults, animation timing, optional slide/GPU effects, accessible static fallbacks. |
| `fonts.md` | Local installation/import, offline behavior, licensing and external-server connections. |
| `templates-and-packages.md` | The distinct template, complete/incomplete export and checked import workflows. |
| `troubleshooting.md` | Actionable recovery for missing builds/resources, rejected saves, jobs and missing published output; updates/removal. |
| `Changelog.md` | Required visible change history; only evidenced entries, newest first. |

No separate API/architecture pages: link existing technical documents instead. `README.md` is excluded from the public site. No historical version entries are invented: GitHub release listing returned no release notes; the existing `0.7.0` tag alone does not document changes. Screenshot blocker: the parent task inspected the real demo's Installed Plugins list and SW Sliderman was absent. No plugin was installed/activated or demo settings changed for optional screenshots; this guide therefore ships without product screenshots or fabricated substitutes.

## Build locally without changing project dependencies

Run from the repository root with Node.js 22 and npm. VitePress 1.6.4 is the stable version verified for this task. Do not add a docs package.json/lockfile or install it in the checkout.

```sh
DOCS_BUILD="$(mktemp -d)"
cp -R pages "$DOCS_BUILD/pages"
npm install --prefix "$DOCS_BUILD" --no-save --package-lock=false --ignore-scripts --no-audit --no-fund vitepress@1.6.4
"$DOCS_BUILD/node_modules/.bin/vitepress" build "$DOCS_BUILD/pages"
# Optional local inspection, including the /sw-sliderman/ prefix:
"$DOCS_BUILD/node_modules/.bin/vitepress" preview "$DOCS_BUILD/pages"
```

The temporary directory contains dependencies, cache and output. Remove it when finished. Only VitePress itself is pinned; without a lockfile its transitive dependencies are resolved at build time. Dead-link checks stay enabled. The project site's base is `/sw-sliderman/`; no custom domain was established.

## Deployment

`.github/workflows/pages.yml` builds documentation-only pull requests, pushes to the actual default branch `master`, and manual runs. Pull requests never deploy. Only `master` pushes/manual runs upload the Pages artifact and enter the serialized deployment job. Build has `contents: read`; only deployment gets `pages: write` and `id-token: write`. No PAT or gh-pages branch is used.

One-time repository-owner action: **Settings → Pages → Source → GitHub Actions**; check the `github-pages` environment allows `master`. The Pages API returned 404 during discovery, so existing configuration/publication could not be confirmed. No repository settings were changed. After merging, check the workflow deployment and visit the served site before calling publication successful.

## Updating and checking

- Verify each changed instruction against current UI/code; update `pages/Changelog.md` in the same change, using only populated Feature/Bugs/Other topics categories.
- Add or rename pages in both navigation/sidebar as appropriate. Keep the exact author footer unchanged. Use relative Markdown links for guide pages and GitHub URLs for technical source documents.
- Run the isolated production build and inspect generated guide pages for links, `/sw-sliderman/` asset paths, local search and footer (including Changelog). Check responsive rendering manually when changing presentation. The default VitePress footer is hidden on sidebar pages; the custom theme uses a single `layout-bottom` footer instead. Do not add a duplicate `themeConfig.footer`. VitePress 1.6.4 deliberately leaves the generated 404 app container empty for client rendering: its common layout/footer needs a browser check, unlike the prerendered guide pages.
- Keep genuine screenshots under `pages/public/screenshots/`, with synthetic data and descriptive alt text; never include credentials or private details.
- `bin/build-zip.sh` explicitly excludes `/pages`; dependencies/output remain outside the checkout. Ignore rules also protect accidental local docs builds.
- The existing PHP/JS application checks remain unchanged. Documentation-only changes do not establish new application coverage or practical product acceptance.

## Recommended user acceptance (Stefan)

1. **Empfohlen:** Anleitung „Getting started“ auf einer Testinstallation nachvollziehen: neuer Slider, Text, Save/Publish, Shortcode oder Block. Erwartung: Besucher sehen nur den veröffentlichten Stand.
2. **Empfohlen:** Mobil-Override und Vorlagen-/Paket-Anleitung prüfen. Erwartung: Desktop bleibt unverändert; Import erzeugt einen neuen unveröffentlichten Slider.
3. **Optional:** Schriftinstallation und Effekt-Fallback bei reduzierter Bewegung prüfen. Erwartung: lokale Schriftdateien und lesbarer statischer Inhalt.

These are recommended practical checks, not reported automated test results.

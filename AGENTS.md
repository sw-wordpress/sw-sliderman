# AGENTS.md – long-term rules for sw-sliderman

Read `PLAN.md` (product spec), `CODE-STYLE.md` (binding rules) and `TODO.md` (state) before changing code.

## Architecture rules
- One PHP style for everything: WordPress coding standards, PSR-4 PascalCase class files (CODE-STYLE 2.1), snake_case methods, `declare(strict_types=1)`.
- `src/Domain` is WordPress-free (validator, layout resolver, schedule, canonical JSON). `src/Application` holds use cases and ports, `src/Infrastructure`, `src/Fonts` (adapters), `src/Rest`, `src/Admin`, `src/Rendering`, `src/Integration` (theme adapters, e.g. The7) are the WordPress edges. `src/Plugin.php` is the only composition root.
- `assets/shared` is pure TypeScript (no DOM, Vue, network). `assets/runtime` never imports editor libraries (ESLint + `bin/check-bundles.mjs`). `assets/editor` uses the shared resolver/CSS/schedule; no second layout logic.
- Every document rule exists twice (TS + PHP) and is tested against `tests/fixtures` by Vitest and PHPUnit. Change the fixture first, then both implementations.
- Writes go through `SliderService`; drafts are serialized per slider (`GET_LOCK`, ADR 0001) and need `expectedVersion`. Publishing never touches the live snapshot before the new artifact is complete.
- Fonts: browsers load only local files; only `FontInstaller` talks to the provider, every URL passes `DownloadPolicy` (ADR 0002). Never add a remote font fallback.

## Workflow
1. Adjust fixtures/contract → implement → `composer check`, `npm run lint && npm run typecheck && npm test && npm run build`, `bin/i18n.sh check`, WordPress tests (`bin/test-db.sh start && composer test:wp`) → docs → `TODO.md` (tick only proven items) → small coherent commit.
2. Never run destructive operations on the real WordPress database; tests use the private MariaDB from `bin/test-db.sh`.
3. `tests/e2e/editor.mjs` runs the full flow against the local dev site (activates the plugin, creates and removes `E2E Hero*` sliders, installs Lato).
4. M0 practical checks (TODO M0.10–M0.14) are Stefan's; never mark them done.
5. After each implementation, include a concise German checklist of what Stefan can/should test as a user. Give concrete steps and the expected result for each relevant feature; distinguish recommended acceptance checks from optional checks. Report automated checks separately and never treat them as Stefan's practical acceptance.

## Translations
Every user-facing string change updates German too: PHP catalog `languages/src/php-de_DE.json`, editor catalog `languages/src/editor-de_DE.json`, then `bin/i18n.sh update` (needs WP-CLI) and `bin/i18n.sh check`. German texts are worded neutrally (no du/Sie) because `de_DE_formal` falls back to `de_DE`.

## Dokumentation

- Verfasse Dokumentation möglichst knapp und ohne Wiederholungen, um Tokens zu sparen. Beschränke sie auf nötige Entscheidungen, Sicherheitsdetails und Testhinweise; verlinke vorhandene Dokumentation statt Inhalte zu duplizieren.

## Tests und Coverage

- Jede funktionale Codeänderung (neue Funktionen, Fehlerbehebungen und Refactorings) muss durch passende automatisierte Tests abgedeckt sein; Tests im selben Arbeitsschritt ergänzen oder anpassen.
- Pflicht ist eine Zeilenabdeckung von **> 80 %** des produktiven Codes je Plugin; genau 80 % reichen nicht. PHP und JavaScript/TypeScript, soweit vorhanden, jeweils prüfen. Bestehende strengere Coverage-Grenzen bleiben verbindlich.
- Vor Abschluss relevante Tests und Coverage-Prüfungen ausführen und Ergebnisse nennen. Fehlende Coverage-Infrastruktur ergänzen; fehlende Messwerte gelten nicht als erfüllte Vorgabe. Keine produktiven Dateien ausschließen oder Grenzen senken, um die Vorgabe zu umgehen.

Vorhanden: PHPUnit-/WordPress-Coverage und SonarQube; siehe `composer.json`, `tests/coverage/merge.php` und `sonar-project.properties`. Vitest ist ebenfalls eingerichtet.

## Statische Ressourcen und Cache-Busting
- Eingebundene CSS- und JavaScript-Dateien immer mit der aktuellen Plugin-Version als Versionsparameter versehen, um veraltete Browser-Caches nach Updates zu vermeiden.
- In WordPress bevorzugt wp_enqueue_script() und wp_enqueue_style() mit der zentral definierten Plugin-Version verwenden.
- Keine fest codierten Versionsnummern, Zeitstempel oder zufälligen Cache-Busting-Parameter nutzen.
- Auch dynamisch eingebundene Assets und weitere statische Ressourcen berücksichtigen.

## Unsicherheit und Entscheidungen
- Bei unklaren Anforderungen, Architektur- oder Sicherheitsentscheidungen **nachfragen statt Annahmen treffen**.
- Zuvor Code, Tests und Dokumentation prüfen. Bei mehreren sinnvollen Lösungen Alternativen mit Empfehlung nennen.
- Kleine, risikoarme Details eigenständig entscheiden. Keine spekulativen Fixes oder unbeabsichtigten Verhaltensänderungen.

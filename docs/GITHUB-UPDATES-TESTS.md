# Verifikation der GitHub-Updates

Stand: 12.11.2026. Referenz lokal aus ChurchTools Suite Commit `49dc66f` gelesen; GitHub-API bestätigt Zielrepository `sw-wordpress/sw-sliderman`, ID `1438174384`.

| Automatischer Nachweis | Ergebnis |
| --- | --- |
| `composer check` | PHPCS ohne Fehler (Warnungen gemäß bestehender Konfiguration), PHPStan Level 8, 232 Unit-/Vertragstests bestanden |
| WordPress, private MariaDB | 206 Tests bestanden; darunter Release-Werkzeuge und echte native Einzel-/AJAX-/Sammelupdates ausschließlich unter `tests/wp/vendor` |
| Multisite, anschließend auf derselben privaten DB | 64 Updater-Tests bestanden; Netzwerkrechte, unmarkiertes Admin-AJAX, Pluginübersicht, Lock und Deaktivierung |
| PHP-Coverage, Unit + WordPress + Multisite | 88,76 % Zeilen; alle produktiven PHP-Dateien einschließlich `includes` einbezogen, keine neue Ausnahme/Baseline |
| `npm run lint`, `typecheck`, `coverage`, `build` | 537 Tests bestanden, 91,14 % Zeilen; neue Prüflogik 100 % Zeilen; drei bestehende Vue-Lintwarnungen |
| Übersetzungen | `bin/i18n.sh update` und `check` erfolgreich; 112 PHP-/519 Editor-Einträge übersetzt; bestehende PO-Datumswarnung |
| Chromium `tests/e2e/verified-updates.mjs` | Pluginzeile, manueller/verspäteter Hintergrundauftrag, Single-Flight, Status, Neuladelink und unveränderte native Navigation; simuliertes HTTP |
| Installierbares ZIP `sw-sliderman-0.1.0.zip` | Produktionsautoloader, gebauter Editor/Runtime/Updater, Katalog und Übersetzungen vollständig; keine Entwicklungsabhängigkeiten |
| `tests/verify-built-release.php` am echten ZIP | Wegwerfsignatur und Paket vom Laufzeitprüfer akzeptiert; Abbruch ohne Signier-Secret/Sodium/ZIP-Unterstützung; Paket-Smokecheck bestanden |
| `make release VERSION=X.Y.Z[.W]` | Versionsabgleich, Commit/Tag und atomarer Push in temporären Repositories; Dirty-Tree, Downgrade, bestehende Tags, fehlendes Remote und abgewiesener Branch-Push geprüft; 28 Release-Werkzeugtests bestanden |
| Drei dokumentierte Schlüsselblöcke | Isoliert in `/tmp`, Wegwerfschlüssel, Bash/Zsh und simuliertes `gh`: 0700/0600, Überschreibschutz, Schlüsselerhalt, widersprüchliche IDs abgelehnt, private Übergabe per stdin |

`VerifiedUpdatesTest` prüft gültige/ungültige Signaturen, bytegenaue erneute Prüfung, Repository-/Release-/Asset-/Slug-/Versionsbindungen, doppelte JSON-Schlüssel/Assets, Cachealter/Rollback, Nonces, Fähigkeiten, Frontend/Cron/REST/CLI, Fehlerdrosselung trotz Transient-Löschung, Lease-Übernahme und verspätete Ergebnisse. ZIP-Fälle umfassen manipulierte Bytes, Traversal, fremde Wurzeln, Case-Kollisionen, Datei-/Ordnerkonflikte, Symlinks, Kompressionslimits und Header. Transportfälle prüfen fremde Hosts/Repositorys, HTTP/Ports/Userinfo/Fragmente, Redirect- und Antwortlimits.

Koexistenz wird mit zwei unabhängig benannten Provider-Kopien geprüft; die zweite wird als eigenes Plugin in der privaten WordPress-Installation aktiviert. Schlüsselringe, Hooks, eigene/fremde Angebote, automatische Auswahl und persistente Zustände bleiben getrennt. Dies ersetzt keine praktische Kompatibilitätsabnahme beliebiger kompletter Drittplugins.

Keine produktive Updateversorgung eingerichtet: Der Betreiber hat inzwischen den öffentlichen Schlüssel `sw-sliderman-2026-11` hinterlegt. Geschützte Signierumgebung und erster signierter Release sind noch nicht bestätigt; der Implementierungsagent hat keine Produktionsschlüssel erzeugt, GitHub-Secrets geändert oder Releases veröffentlicht. Der lokale Build enthält keinen Wegwerf-Vertrauensanker. Live-GitHub/CDN und Dateisystemanmeldung auf einem Fremdhost wurden nicht installiert/getestet. Lokal PHP 8.3 und Chromium; PHP-8.2-/WordPress-Versionsmatrix und gehostetes SonarQube laufen erst im PR-Workflow. Keine Testsuite läuft im Release-Workflow; dessen Smoke-/Signaturprüfungen validieren ausschließlich Artefakte.

Stefans praktische Abnahme bleibt separat: empfohlen unter **Plugins → Installierte Plugins** den Sperrstatus und die deaktivierte Prüfschaltfläche in der Sliderman-Zeile prüfen. Nach eigener Schlüsselkonfiguration in einer Testinstallation prüfen → Ergebnis und Neuladelink erscheinen in derselben Zeile; Liste neu laden → manuelles WordPress-Update möglich; schneller zweiter Prüfklick → Drosselung. Optional Netzwerkadministrator und Site-Administrator vergleichen. Kein Updatebedienelement im Slider-Editor. Betreiberkonfiguration und Vertrauensstart: [Betriebshandbuch](GITHUB-UPDATES-BETRIEB.md).

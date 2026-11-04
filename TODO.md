# TODO.md – Umsetzung nach Milestones

Stand: 30.10.2026 · Konzeptversion: 1.0 · Referenz: [PLAN.md](PLAN.md)

## Arbeitsregeln

- Alle Punkte sind initial offen. Erst nach nachweisbarer Umsetzung abhaken.
- Reihenfolge: M0 → M1 → M2 → M3 → M4 → M5 → M6. M7–M9 sind spätere separat priorisierte Ausbauten.
- M0 wird von Stefan praktisch geprüft. Dieses Dokument beauftragt keine Ausführung der Machbarkeitsprüfung durch den Konzeptautor.
- Jeder Milestone liefert einen ausführbaren, reviewbaren Stand und dokumentierte Restgrenzen. Keine Schätzung in Kalendertagen ohne geklärte Implementierungsbedingungen.
- Bei Änderungen von Datenmodell, Layout, Fonts oder Timeline zuerst PLAN.md und Schema anpassen, dann umsetzen.
- Keine Checkbox allein aufgrund vorhandenen Codes schließen: relevante technische Nachweise und bei Abnahmepunkten das Ergebnis von Stefan dokumentieren.
- Fokus auf aussagekräftige Tests für Datenverträge und Fehlerfälle; keine Tests nur zur Nachbildung trivialisierter Implementierungsdetails.

## Übersicht

| Milestone | Ergebnis | Abhängigkeit | Freigabe |
| --- | --- | --- | --- |
| M0 | Durchgängiger Machbarkeitsprototyp | Keine | Von Stefan abgenommen; Fortführung bestätigt |
| M1 | Plugin-Fundament und stabile Datenverträge | M0-Ergebnis | Technisch geprüft; Nachweise unten |
| M2 | Lokale Google-Fonts-Verwaltung | M1 | Technisch und Schriftvorschau praktisch |
| M3 | Produktiver visueller Editor und responsive Layouts | M1, M2 | Stefan prüft Gestaltung |
| M4 | Animation und vollständige Frontend-Wiedergabe | M3 | Stefan prüft Verhalten |
| M5 | Vorlagen und portabler Austausch | M2–M4 | Import-/Export-Abnahme |
| M6 | Version 1.0 und dokumentierte Kompatibilität | M1–M5 | Releasefreigabe von Stefan |
| M7 | Erweiterte Zeitleiste, Gruppen und Aktionen | M6 | Eigene Ausbaufreigabe |
| M8 | Dynamische Inhalte, Video, variable Fonts | M6; M7 soweit benötigt | Eigene Ausbaufreigabe |
| M9 | Effekte und Erweiterungssystem | M6–M8 je Funktion | Eigene Ausbaufreigabe |

## M0 – Machbarkeitsprototyp und praktische Entscheidung

**Ziel:** Die schwierigsten Komponenten in einem echten WordPress-Ablauf prüfen. Der Prototyp darf gezielt klein sein; sein Code wird nur nach Review in die Produktbasis übernommen.

### Prototypumfang

- [x] M0.01 Minimalen Plugin-Rahmen mit Adminseite, Vue-Editor und eigenständiger Frontend-Laufzeit bereitstellen.
- [x] M0.02 Zwei Slides mit Bild, Text und Button erstellen, speichern und erneut öffnen.
- [x] M0.03 Text/Bild auswählen, verschieben, skalieren und Ebenenreihenfolge ändern.
- [x] M0.04 Containerbasiertes Desktop-/Mobil-Layout mit sichtbar vererbten Overrides umsetzen.
- [x] M0.05 Ein Fade und eine Bewegungsanimation mit Startzeit/Dauer in Vorschau und Frontend abspielen.
- [x] M0.06 Zwei statische Google-Font-Varianten inklusive Lizenz lokal installieren; Schrift lokal im Editor und Frontend laden.
- [x] M0.07 Beschaffungsroute für WOFF2 inklusive Metadaten-/Lizenzzuordnung nachweisen; ungeeignete Familien ausdrücklich ablehnen.
- [x] M0.08 Ausgabe per Shortcode und zwei unabhängige Instanzen auf einer Seite nachweisen.
- [x] M0.09 Statischen ersten Slide ohne JavaScript und lesbaren Zustand bei reduzierter Bewegung zeigen.

### Prüfung durch Stefan

- [x] M0.10 Einen Slider mit eigenen Inhalten auf Desktop erstellen; Editorverhalten und Vorschautreue bewerten.
- [x] M0.11 Mobile Overrides setzen, auf echter mobiler Darstellung prüfen und Desktop unverändert bestätigen.
- [x] M0.12 Google-Font-Darstellung mit ÄÖÜäöüß und € prüfen; Browsernetzwerk auf ausschließlich lokale Fontdateien kontrollieren.
- [x] M0.13 Nach Fontinstallation Netzwerkzugriff nach außen unterbinden; gespeicherten Slider bearbeiten und ausliefern.
- [x] M0.14 Bedienungsprobleme, Unterschiede zwischen Vorschau und Ausgabe und offene technische Risiken festhalten.

### Entscheidungen und Ausgang

- [x] M0.15 Entscheidung zu Drag-/Resize-Bibliothek, Render-Wrappers, Animation und Font-Provider dokumentieren.
- [x] M0.16 Baseline für WordPress/PHP und Namensgebung festlegen.
- [x] M0.17 Ergebnis festhalten: weiterführen / mit benannten Änderungen weiterführen / Architektur überarbeiten.

### Praktische Abnahme und Entscheidung durch Stefan (29.10.2026)

Stefan hat alle M0-Punkte getestet und ausdrücklich bestätigt: „Es funktioniert soweit, wie ich es zu Beginn eines Projektes erwarten würde.“ Die praktische Machbarkeit ist damit abgenommen; Ergebnis M0.17: **weiterführen**. Dies bestätigt die Projektbasis, nicht die Produktreife oder die Abnahme späterer Milestones.

M0.16 ist bestätigt: **PHP 8.2+, WordPress 6.6+**, CI gegen WordPress 6.6 und die neueste Version, Plugin-Slug **`sw-sliderman`**, PHP-Namespace **`SW\Slider`**. Die Entscheidung ist in ADR 0003 festgehalten.

### Technischer Stand M0 (29.10.2026, Implementierungsagent)

Nachweise: `composer check` (PHPCS/WPCS, PHPStan Level 8, 84 PHPUnit-Unit-/Vertragstests), 12 WordPress-Integrationstests (`tests/wp`), 73 Vitest-Tests, `bin/check-bundles.mjs`, `bin/i18n.sh check`, E2E `tests/e2e/editor.mjs` auf der lokalen Dev-Site (27 Prüfungen).

- M0.01: Adminseite „Sliderman“, Vue/Quasar-Editor im sw-backupit-Design, eigenständige Runtime (3,7 KiB gzip) – E2E.
- M0.02 (praktisch durch Stefan bestätigt): Speichern/Öffnen mit Text und Button per E2E, zwei Slides mit Text per WP-Test; Bildebene über die Mediathek ist implementiert und durch Stefans praktische Abnahme bestätigt; hierfür bestand kein automatisierter Nachweis.
- M0.03 (praktisch durch Stefan bestätigt): Auswahl, Verschieben (ein Undo-Schritt, Esc bricht ab) per E2E; Skalieren und Ebenenreihenfolge durch Stefan praktisch geprüft und bestätigt.
- M0.04: Containerbasierte Overrides mit Vererbungsanzeige/Reset; Editor und Frontend (390 px) per E2E, Resolver per gemeinsamen Fixtures.
- M0.05 (praktisch durch Stefan bestätigt): Fade und Bewegungsvorgaben mit Start/Dauer in Vorschau und Runtime implementiert (gemeinsame Keyframes); Abspielen durch Stefan visuell geprüft und bestätigt; zusätzliche Runtime-Regressionstests sind im Stabilitätsprotokoll dokumentiert.
- M0.06/M0.07: Lato 400/700 inkl. OFL lokal installiert; Editor und Frontend laden die Schrift bei blockiertem Google; variable Familien werden abgelehnt (ADR 0002).
- M0.08: Shortcode, zwei unabhängige Instanzen mit eindeutigen IDs – WP-Test und E2E.
- M0.09: Erster Slide ohne JavaScript lesbar, Steuerelemente ausgeblendet; Reduced Motion ohne Animationen/Autoplay – E2E.
- M0.15: ADR 0001–0003. M0.16 wurde von Stefan bestätigt; ADR 0003 dokumentiert die verbindliche Baseline.
- Hinweis Dev-Site: Das Theme dt-the7 lädt selbst Google Fonts (`dt-web-fonts-css`); das Plugin erzeugt keine solche Anfrage (PLAN.md 8.1).
- Im M0 bereits vorbereitete Grundlagen (damaliger Stand, aktueller Abschluss siehe M1): Schema v1/Validierung/Limits (M1.05–M1.08), Versionsprüfung mit HTTP 409 unter DB-Lock (M1.13, ADR 0001), getrennter veröffentlichter Snapshot mit atomarem Artefakt (M1.14/M1.15 teilweise), CI (M1.03), Font-Negativtests (M2.08–M2.13 teilweise), lokale Wiederherstellung/Autosave (M3.22 teilweise).
- Zum M0-Abschluss offene Grenzen (geschützte Vorschau und Konkurrenznachweis inzwischen in M1 ergänzt): kein Rich Text (M3.09), keine Gruppen/Formen, keine geschützte Frontend-Vorschau von Entwürfen (M1.16), kein Gutenberg-Block (M4.11), kein Jobsystem (Fontinstallation läuft synchron im Request), keine Zwei-Prozess-Konkurrenzprüfung (M1.20).

**Abnahmekriterium:** Stefan kann den vollständigen Ablauf selbst durchführen; die lokale Fontbereitstellung ist nachweisbar. Keine Behauptung über vollständige Produktreife.

## M1 – Fundament, Persistenz und Veröffentlichung

**Ziel:** Verbindliche Datenverträge und sichere Speicherung; neue Funktionen bauen auf diesem Stand auf.

### Repository und Architektur

- [x] M1.01 Projektstruktur gemäß PLAN.md einrichten; Editor, Runtime, Block und geteilte Module trennen.
- [x] M1.02 Composer-/npm-Konfiguration, Lockfiles, Entwicklungsumgebung und produktiven Build erstellen.
- [x] M1.03 WordPress-Coding-Standards, PHP-Analyse, TypeScript-Prüfung und CI einrichten.
- [x] M1.04 Eigenen Namespace, Slug, Textdomain und Capability-Konzept festlegen.
- [x] M1.05 Verbindliche Limits definieren: Dokumentgröße, Slides, Ebenen, Jobgröße, Archive und Fontdateien.

### Datenmodell

- [x] M1.06 JSON Schema v1 mit Typen, Defaults, Einheiten und erlaubten Wertbereichen erstellen.
- [x] M1.07 UUIDs, Ressourcenreferenzen, Breakpoints, Overrides und Animationsphasen vollständig spezifizieren.
- [x] M1.08 TypeScript-Typen und serverseitige Validierung über gemeinsame gültige/ungültige Fixtures abstimmen.
- [x] M1.09 Schrittweise Migration und Ablehnung unbekannter neuer Schemaversionen implementieren.
- [x] M1.10 Duplizieren mit neuer Identität und konsistentem Remapping implementieren.

### WordPress und API

- [x] M1.11 Internen Slider-CPT, kanonisches JSON in post_content, Revisionen und Papierkorb einrichten.
- [x] M1.12 REST-Routen mit objektbezogenen Rechten, Nonce-Prüfung und sauberer Fehlerstruktur implementieren.
- [x] M1.13 Konkurrierende Schreibzugriffe serialisieren; expectedVersion prüfen und HTTP 409 liefern.
- [x] M1.14 Entwurf, Autosave, Revision und veröffentlichten Stand trennen.
- [x] M1.15 Veröffentlichung mit vollständiger Ressourcenprüfung und atomarem Artefaktwechsel umsetzen.
- [x] M1.16 Geschützte Entwurfsvorschau ohne öffentliche Rohdateien bereitstellen.
- [x] M1.17 Wiederherstellung einer Revision zunächst als Entwurf implementieren; Live-Ausgabe bleibt bis erneuter Veröffentlichung stabil.
- [x] M1.18 Jobsystem und Locking für Fontinstallation/Import bestimmen; keine zwingenden externen Serverprogramme voraussetzen.

### Nachweise

- [x] M1.19 Unberechtigtes Lesen/Ändern/Veröffentlichen von Entwürfen sowie Rechtewechsel prüfen.
- [x] M1.20 Zwei konkurrierende Speicheraktionen und fehlgeschlagene Veröffentlichung prüfen.
- [x] M1.21 Schema-Migration mit Ausgangssicherung und Revision-Wiederherstellung prüfen.

**Abnahmekriterium:** Daten können validiert, versioniert und veröffentlicht werden; Fehler oder Konflikte verändern den letzten funktionierenden veröffentlichten Stand nicht.

### Technischer Abschluss M1 (30.10.2026)

- M1.01–M1.04: Module, Composer/npm-Lockfiles, produktive Vite-Bundles, WordPress-Coding-Standards, PHPStan und CI-Matrix für WordPress 6.6/aktuell sind eingerichtet. Der separate Block-Einstieg ist reserviert; der funktionale Gutenberg-Block folgt ausdrücklich in M4.11. Slug/Textdomain, Namespace und drei eigene Verwaltungs-Capabilities bleiben wie in M0 bestätigt.
- M1.05–M1.08: JSON Schema v1, Standarddokument, dokumentierte Einheiten/Referenzen und gemeinsame gültige/ungültige PHP-/TS-Fixtures. Größenlimits gelten auch für die kanonische ASCII-Speicherung; Unicode-, Quote- und Backslash-Fälle sind getestet. Weitere Grenzen für Jobs, Archive und Fontdateien sind in ADR 0004 festgelegt; Archivimport bleibt M5.
- M1.09/M1.21: Expliziter Migrationsdispatcher mit sequenziellen Einzelschritten, unveränderlicher Dokumentidentität und eigener Quellkopie; synthetische gemeinsame Fixtures prüfen die Kette. Produktiv ist ausschließlich v1 freigegeben, daher existiert noch kein historischer Konverter. Der Migrationsendpunkt behandelt v1 ohne Änderung und lehnt unbekannte Versionen ohne Quellenverlust ab. Vor einem tatsächlichen Ersatz bewahrt der normale Speicherpfad eine Ausgangsrevision auf; Revisionswiederherstellung ist separat integriert geprüft.
- M1.10: Duplizieren in API und Sliderliste; Dokument-, Slide-, Layer- und lokale Font-Referenz-IDs werden remappt, installierte Ressourcen bleiben gepinnt, die Kopie ist unveröffentlicht.
- M1.11–M1.14: Interner CPT, kanonischer Entwurf, Revisionen, Papierkorb und separate benutzerspezifische Autosave-API. Generische WordPress-Schreibwege können Versionierung/Validierung nicht umgehen. Der Editor sichert weiterhin periodisch den versionierten Entwurf; die separate WordPress-Autosave-API ersetzt diese Funktion nicht stillschweigend.
- M1.12/M1.19: Aktuelle globale und objektbezogene Rechte, Cookie-Nonce-Prüfung und private Antworten; Tests für anonyme Zugriffe, fehlende Rechte, objektbezogenen Rechteentzug, fremde Revisionen und objektgebundene Vorschau-Nonces. Unbekannte gespeicherte Schemaversionen liefern einen Validierungsfehler statt einer ungeprüften Editorantwort.
- M1.13/M1.20: Zwei unabhängige PHP-/DB-Prozesse konkurrieren mit derselben Ausgangsversion; genau ein Save gelingt, der andere erhält 409. Ein einzelnes SQL-Statement liest Dokument und Version konsistent. InnoDB-Transaktionen sichern Dokument, Version und Revisionen atomar ab; fehlgeschlagene Versionsschreibzugriffe werden zurückgerollt (ADR 0001).
- M1.15: Dateiprüfung für Bilder, Fontdatei-Hashes und regeneriertes lokales Font-CSS; vollständiges, atomar geschriebenes CSS-Artefakt vor Snapshot-Aktivierung. Tests für fehlende Dateien, fehlerhafte Artefaktspeicherung und fehlgeschlagene Snapshot-Metadaten. Neue Snapshots bewahren auch den veröffentlichten Titel für den zugänglichen Namen auf.
- M1.16/M1.17: Private, noncegebundene HTML-Vorschau des gespeicherten Entwurfs ohne öffentliche Entwurfsdateien; im lokalen Chromium mit no-store/noindex und abgewiesenem anonymem Zugriff geprüft. Revisionsdialog lädt erfolgreich; Wiederherstellung speichert einen neuen Entwurf und lässt die Live-Version unangetastet.
- M1.18: WP-Cron-/Runner-, Zustands-, Größen- und Locking-Entscheidung in ADR 0004. Die asynchrone Queue-Implementierung für Fonts/Import folgt in M2/M5; der bestehende synchrone Installer bleibt bis dahin bestehen.

Nachweise: `composer check` (88 PHP-Unit-/Vertragstests, PHPCS/WPCS, PHPStan Level 8), 95 Vitest-Tests, 28 WordPress-Integrationstests auf einer privaten Testdatenbank, `npm run lint`, `npm run build`, `bin/i18n.sh check` und lokale Browserprüfung von Revisionsdialog und geschützter Vorschau. Die vorhandene CI-Konfiguration wurde geprüft; ein entfernter CI-Lauf wurde in dieser Sitzung nicht gestartet.

Die praktische M0-Abnahme bleibt dokumentiert. M2–M6 und die Releasefreigabe sind damit nicht vorweggenommen.

## M2 – Google Fonts vollständig lokal

**Ziel:** Schriftverwaltung als Kernfunktion; Editor und Frontend benötigen nach Installation keine externen Fontdienste.

### Katalog und Installationsablauf

- [x] M2.01 Provider-Interface und in M0 bestätigten Adapter produktiv umsetzen.
- [x] M2.02 Versionierten lokalen Familien-/Variantenkatalog mit Lizenzzuordnung ausliefern.
- [x] M2.03 Suche, Filter nach installierten Familien, Variantenwahl und Installationsstatus bauen.
- [x] M2.04 Nicht installierte Fonts in Systemschrift darstellen; keine Browser-Vorschauen von Google einbinden.
- [x] M2.05 Katalogupdate und Installation ausschließlich als explizite Verwaltungsaktionen anbieten.
- [x] M2.06 Offline-Modus und validierten manuellen WOFF2-Import mit Lizenzangaben ergänzen.
- [x] M2.07 Statische Gewichte/Stile und passende Subsets einschließlich Latin/Latin Extended unterstützen.

### Sicherer Download und Dateien

- [x] M2.08 Providererzeugte HTTPS-URLs, Host-/Pfad-Allowlist und Redirect-Prüfung implementieren.
- [x] M2.09 Private/Loopback/Link-local/Metadatenziele, unsichere Protokolle und frei eingegebene Remote-URLs ablehnen.
- [x] M2.10 HTTP-Zeit-/Größenlimits, WOFF2-Signaturprüfung, Hashes und gleichzeitige Installationen absichern.
- [x] M2.11 Externes CSS nur eingeschränkt parsen; lokale @font-face-Regeln selbst erzeugen.
- [x] M2.12 Unicode-Ranges und Varianten korrekt erhalten; keine zufällige Fontvariante installieren.
- [x] M2.13 Temporär schreiben, atomar aktivieren und Teilinstallationen sauber bereinigen.
- [x] M2.14 Registry mit Dateireferenzen, Quellstand und Lizenztext implementieren.
- [x] M2.15 Origin-Prüfung für lokale Font-URLs und Diagnose bei Offload-/CDN-Umschreibung ergänzen.

### Verwendung und Lebenszyklus

- [x] M2.16 Typografieauswahl nur mit tatsächlich verfügbaren Varianten verbinden; fehlende Gewichte anzeigen.
- [x] M2.17 Lokales Fontladen vor Editor-Textmessung koordinieren; Timeout und Fallback umsetzen.
- [x] M2.18 font-display, deduplizierte Styles und sparsame Preloads implementieren.
- [x] M2.19 Gepinnte Installationsversionen, ausdrückliches Update und Referenzprüfung vor Löschen umsetzen.
- [ ] M2.20 Revisionen und Vorlagen bei Font-Referenzzählung berücksichtigen.
- [x] M2.21 Relative Pfade bei Domain-/Uploadbasiswechsel korrekt auflösen.
- [x] M2.22 Fehlende Datei diagnostizieren; keine externe Ersatzquelle automatisch aktivieren.

### Verifikation

- [ ] M2.23 ÄÖÜäöüß, €, kursive Schrift, mehrere Gewichte und gemischte Zeichensätze prüfen.
- [x] M2.24 Netzwerkfehler, fehlerhaftes CSS, HTML statt WOFF2, zu große Dateien und parallele Jobs prüfen.
- [x] M2.25 SSRF-/Redirect-Fälle und fehlende Lizenzzuordnung negativ testen.
- [x] M2.26 Browser-Requests für Editor und Frontend aufzeichnen: keine fremden Font-Origins, Imports oder Preconnects.
- [ ] M2.27 Mit gesperrtem Servernetz bestehende Slider bearbeiten und ausgeben; Neuinstallation kontrolliert fehlschlagen lassen.

**Stand 31.10.2026:** Implementierung und automatisierte Prüfung siehe [Fonttests](docs/font-testing.md). Offen bleiben M2.23 (visuelle Abnahme), M2.27 (vollständig gesperrtes Servernetz) und der Vorlagenteil von M2.20 bis M5; Revisionen/Autosaves sind berücksichtigt und getestet. Browserprüfung M2.26 verwendet isolierte Antworten ohne Änderungen an der Entwicklungsdatenbank.

**Abnahmekriterium:** Google-Font-Auswahl, Installation, lokale Vorschau und Ausgabe funktionieren nachweisbar. Keine externe Fontverbindung wird durch Besucher oder Editorbrowser ausgelöst.

## M3 – Visueller Editor und responsive Gestaltung

**Ziel:** Ein praxistauglicher Editor für die vollständigen Ebenentypen aus Version 1.0.

### Verwaltung und Arbeitsfläche

- [x] M3.01 Slider-Liste mit Suche, Status, Duplizieren, Papierkorb (Ansicht, Wiederherstellen, endgültig löschen) und Einbindecode erstellen.
- [x] M3.02 Slide-Liste mit Reihenfolge, Hinzufügen, Löschen und Duplizieren umsetzen.
- [x] M3.03 Ebenenbaum mit Namen, Reihenfolge, Sperre und Sichtbarkeit bereitstellen.
- [x] M3.04 Auswahl, Mehrfachauswahl, Drag, Resize, Rotation und numerische Eingabe implementieren.
- [x] M3.05 Raster, Einrasten, Ausrichten und Verteilen ergänzen.
- [x] M3.06 Zoom und Arbeitsflächenverschiebung korrekt von Dokumentkoordinaten trennen.
- [x] M3.07 Undo/Redo als nachvollziehbare Aktionen, Kopieren/Einfügen und Tastaturkürzel implementieren.
- [x] M3.08 Eingabefokus, Textbearbeitung und Tastaturaktionen konfliktfrei behandeln.

### Inhalte und Stile

- [x] M3.09 Textlayer mit begrenztem Rich Text und explizitem semantischem Tag erstellen.
- [x] M3.10 Bildlayer über Mediathek mit Alt-Text/dekorativ, Ausschnitt und Link erstellen.
- [x] M3.11 Buttonlayer mit erlaubten URLs, Linkziel und Fokus-/Hover-Stil erstellen.
- [x] M3.12 Rechteck/Kreis mit Rahmen, Farbe und Radius erstellen.
- [x] M3.13 Hintergründe, Überlagerungen, Schatten, Innenabstände und Deckkraft ergänzen.
- [x] M3.14 Lokale Fontverwaltung in Typografiepanel integrieren.

### Responsive Regeln

- [x] M3.15 Gemeinsamen containerbasierten Layoutresolver implementieren.
- [x] M3.16 Bühnenauflösung und proportionale Skalierung mit Ankern konsistent umsetzen.
- [x] M3.17 Desktop/Tablet/Mobil-Overrides feldweise vererben und sichtbar kennzeichnen.
- [x] M3.18 Reset einzelner Overrides und Sichtbarkeit je Bereich anbieten.
- [x] M3.19 Frei einstellbare Vorschaubreite mit aktivem Bereich und gerenderter Schriftgröße anzeigen.
- [x] M3.20 Überläufe, zu kleine mobile Schrift und ungültige Breakpoints diagnostizieren.
- [x] M3.21 Containergrößenänderung ohne Sprünge oder Endlosschleifen verarbeiten.

### Speicherung und Abnahme

- [x] M3.22 Speichernstatus, Autosave, Wiederherstellung und Konfliktoberfläche fertigstellen.
- [x] M3.23 Vor unbeabsichtigtem Verlassen warnen; mehrere Tabs berücksichtigen.
- [x] M3.24 Referenzlayouts auf drei Breiten in Vorschau und Website vergleichen. (`node tests/e2e/parity.mjs`: Slide 1 des Referenzdokuments, Abweichung 0,00 px bei Toleranz 1 px + 0,1 %.)
- [x] M3.25 Stefan erstellt einen Bildslider und einen mobilen Text-/Button-Hero ohne direkte JSON-Bearbeitung.
- [x] M3.26 Undo/Redo nach gemischten Layout-/Typografie-/Geräteänderungen prüfen. (Automatisiert getestet; praktische Prüfung durch Stefan offen.)

**Abnahmekriterium:** Ein Slider lässt sich vollständig grafisch erstellen, mobil anpassen, speichern und identisch wieder öffnen. Vorschau und Ausgabe stimmen innerhalb dokumentierter Browsertoleranzen überein.

## M4 – Animation, Runtime und WordPress-Einbindung

**Ziel:** Zuverlässiges Abspielen und vollständige 1.0-Einbindung.

### Animation und Navigation

- [ ] M4.01 Gemeinsame Zeitplanberechnung und begrenzte Presets für Eintritt/Austritt implementieren.
- [ ] M4.02 Startzeit, Dauer, Easing, Sichtbarphase und Slide-Dauer validieren.
- [ ] M4.03 Layouttransformationen von Animationstransformationen trennen.
- [ ] M4.04 Cut-, Fade- und Slide-Übergang ergänzen.
- [ ] M4.05 Zustandsautomat für Laden, Bereit, Übergang, Abspielen, Pause und Fehler implementieren.
- [ ] M4.06 Schnelle Navigation, unterbrochene Übergänge und Ressourcen-Timeouts behandeln.
- [ ] M4.07 Pfeile, Punkte, Touch-Wischen und Schleifensteuerung ergänzen.
- [ ] M4.08 Autoplay standardmäßig deaktivieren; Pause/Start, Hover-/Fokus-/Tab-/Sichtbarkeitspause umsetzen.
- [ ] M4.09 Manuelle Pause gegenüber automatischer Fortsetzung priorisieren.
### Ausgabe und Integration

- [ ] M4.10 Semantischen PHP-Renderer mit statischem Fallback und lokaler Konfiguration erstellen.
- [ ] M4.11 Shortcode, dynamischen Gutenberg-Block und PHP-Funktion auf denselben Renderer führen.
- [ ] M4.12 Blockauswahl und sichere Vorschau integrieren; WordPress-eigene React-Laufzeit verwenden.
- [ ] M4.13 Assets nur bei Einbindung ausgeben; auch späte PHP-Template-Einbindungen unterstützen.
- [ ] M4.14 Instanzkennungen, mehrere Slider und wiederholte Einbindung desselben Sliders prüfen.
- [ ] M4.15 Veröffentlichte Artefakte cachen, bei Rendererwechsel erneuern und alte Referenzen sicher bereinigen.
- [ ] M4.16 Responsive Bilder, reservierte Höhe und Lazy Loading späterer Slides ergänzen.
- [x] M4.24 The7-Theme: Modus „SW SliderMan“ in den Seitenoptionen „Page Header → Slideshow“; Ausgabe über `presscore_do_header_slideshow` und den gemeinsamen Renderer (`src/Integration/The7.php`). Nachweis: `tests/wp/tests/The7IntegrationTest.php`, Browserprüfung der Metabox auf der Dev-Site. Praktische Frontend-Abnahme durch Stefan offen.

### Zugänglichkeit

- [ ] M4.17 Alle Steuerelemente per Tastatur und mit sichtbarem Fokus bedienen.
- [ ] M4.18 Inaktive Inhalte aus Fokusreihenfolge und Accessibility Tree entfernen.
- [ ] M4.19 Fokus bei manueller Navigation erhalten; aktive Fokusinhalte nicht automatisch wechseln.
- [ ] M4.20 Reduced Motion als statischen lesbaren Endzustand ohne Autoplay umsetzen.
- [ ] M4.21 Automatische und manuelle Slidewechsel sinnvoll für Screenreader behandeln.
- [ ] M4.22 Ohne JavaScript, mit langsamen Fonts, fehlenden Bildern und mit einem einzigen Slide prüfen.
- [ ] M4.23 Stefan prüft Timing, mobile Wischgesten, Pause und tatsächliche Gestaltung.

**Abnahmekriterium:** Editor und Frontend spielen dieselbe Animation ab. Wiederholte Navigation erzeugt keine überlappenden Zustände; Inhalt und Navigation bleiben zugänglich.

## M5 – Vorlagen, Import und Export

**Ziel:** Slider inklusive Medien und lokal installierter Fonts portabel übertragen.

- [ ] M5.01 Versioniertes Archivmanifest mit Schema-, Plugin- und Dateiangaben definieren.
- [ ] M5.02 ZIP-Export mit Dokument, Medien, erforderlichen Fontdateien und Lizenzinformationen implementieren.
- [ ] M5.03 Optionalen Export ohne Dateien eindeutig als unvollständig kennzeichnen.
- [ ] M5.04 Import in geschütztem Staging mit Größen-/Dateianzahl-/Entpacklimits prüfen.
- [ ] M5.05 ZIP Slip, Symlinks, ZIP Bombs, ausführbare Dateien, ungültige MIME-Typen und Hashabweichungen abweisen.
- [ ] M5.06 IDs remappen, identische Assets anhand geprüfter Hashes deduplizieren und Konflikte anzeigen.
- [ ] M5.07 Fehlende Dateien zuordnen lassen; kein automatisches Nachladen aus dem Netz.
- [ ] M5.08 Import atomar als neuen Entwurf übernehmen; bei Abbruch nur eigene temporäre Ressourcen entfernen.
- [ ] M5.09 Drei eigene lokale Vorlagen mit korrekt lizenzierten Assets erstellen.
- [ ] M5.10 Vorlage instanziieren, verändern und exportieren; Original bleibt unverändert.
- [ ] M5.11 Roundtrip zwischen zwei getrennten WordPress-Installationen mit anderer Domain/Uploadbasis prüfen.
- [ ] M5.12 Nach Import externe Verbindungen sperren; Medien und Fonts müssen vollständig funktionieren.
- [ ] M5.13 Nicht unterstützte neuere Formate und beschädigte Pakete mit verständlicher Diagnose ablehnen.

**Abnahmekriterium:** Ein vollständig exportierter Slider lässt sich auf einer zweiten Installation ohne Google- oder sonstige Ressourcendownloads verwenden.

## M6 – Stabilisierung und Release 1.0

**Ziel:** Alle 1.0-Pflichtfunktionen belastbar ausliefern.

### Sicherheit und Betrieb

- [ ] M6.01 Rechte-, XSS-, Linkprotokoll-, CSS-Wert-, SSRF- und Archivprüfungen abschließend reviewen.
- [ ] M6.02 Sicherstellen, dass Rohentwürfe, Staging-Dateien und interne Logs nicht öffentlich erreichbar sind.
- [ ] M6.03 Deaktivierung ohne Datenverlust und Deinstallation mit ausdrücklich gewählter Datenlöschung umsetzen.
- [ ] M6.04 Backup/Wiederherstellung von Datenbank und Uploaddateien dokumentieren und prüfen.
- [ ] M6.05 Site-Trennung bei Multisite testen; nicht unterstützte Netzwerkkonfigurationen dokumentieren.
- [ ] M6.06 Fehlende Schreibrechte, voller Speicher, abgebrochene Jobs und Font-Dateiverlust prüfen.

### Kompatibilität und Leistung

- [ ] M6.07 Mindestversion und aktuelle stabile WordPress-/PHP-Versionen in CI prüfen.
- [ ] M6.08 Browsermatrix einschließlich realem iOS Safari/Android Chrome praktisch prüfen.
- [ ] M6.09 Klassisches Theme, Block-Theme, mehrere Slider und Seiten ohne Slider prüfen.
- [ ] M6.10 Referenzfall messen: drei Slides, je acht Ebenen, zwei Fonts und drei Varianten.
- [ ] M6.11 Runtime-Budget 60 KiB gzip JS und 25 KiB gzip CSS prüfen oder begründete Zieländerung dokumentieren.
- [ ] M6.12 LCP-/CLS-Verhalten, CPU-Last, Listener-Cleanup und Ressourcenpriorität dokumentieren.
- [ ] M6.13 Gesamten Browser-/Server-Offlinetest nach installierten Fonts wiederholen, sofern Integration seit M2 verändert wurde.

### Bedienung und Dokumentation

- [ ] M6.14 Deutsche/englische Übersetzung, RTL und lange Texte prüfen.
- [ ] M6.15 Tastatur- und Screenreader-Abnahme mit praktischen Aufgaben durchführen.
- [ ] M6.16 Kurzanleitung für Erstellen, mobile Overrides, lokale Fonts, Veröffentlichung und Import schreiben.
- [ ] M6.17 Systemanforderungen, bekannte Grenzen, Font-Lizenzen und Drittanbieter-Lizenzen dokumentieren.
- [ ] M6.18 Gesamtablauf aus automatisierten E2E-Tests und Stefans praktischer Abnahme abschließen.

### Paket und Freigabe

- [ ] M6.19 Reproduzierbares Plugin-ZIP mit gebautem Editor/Runtime und ohne Entwicklungsdateien erzeugen.
- [ ] M6.20 ZIP auf frischer WordPress-Installation installieren und Upgrade von vorherigem Teststand prüfen.
- [ ] M6.21 Version, Changelog, Datenmigrationen und Wiederherstellungsweg prüfen.
- [ ] M6.22 Offene Fehler nach Schwere bewerten; keine offenen kritischen Datenverlust-/Sicherheits-/Veröffentlichungsfehler akzeptieren.
- [ ] M6.23 Releasefreigabe durch Stefan dokumentieren.

**Abnahmekriterium:** M1–M5 erfüllt, technische Checks bestanden, praktische Abnahme dokumentiert und reproduzierbares Installationspaket vorhanden. Erst dann Version 1.0 veröffentlichen.

## M7 – Visuelle Zeitleiste, Gruppen und Aktionen

**Status:** Geplanter Ausbau nach Version 1.0; kein 1.0-Blocker.

- [ ] M7.01 Umfang und Datenmigration für Keyframes vor Umsetzung festlegen.
- [ ] M7.02 Tracks, Zeitraster, Zoom, Abspielkopf und deterministisches Scrubbing implementieren.
- [ ] M7.03 Clips verschieben, Dauer ändern und Presets kopieren; Undo/Redo integrieren.
- [ ] M7.04 Keyframes für erlaubte Eigenschaften und Easing-Editor ergänzen.
- [ ] M7.05 Gruppen mit lokalen Koordinaten, Verschachtelungslimit und konsistenten Transformationen implementieren.
- [ ] M7.06 Gruppenanimation und globale Slider-Ebenen mit eindeutigem Lifecycle ergänzen.
- [ ] M7.07 Typisierte Klickaktionen für Wechsel, Play/Pause und validierte Links bereitstellen.
- [ ] M7.08 Schleifenanimationen und Konflikte zwischen Aktionen/Timeline spezifizieren und prüfen.
- [ ] M7.09 Migration einfacher 1.0-Animationen ohne sichtbare Veränderung nachweisen.
- [ ] M7.10 Stefan erstellt eine mehrstufige animierte Szene und nimmt Bedienbarkeit ab.

**Abnahmekriterium:** Vorschau, Scrubbing und Frontend stimmen für gleiche Zeitpunkte überein; bestehende Slider behalten ihr Verhalten.

## M8 – Dynamische Inhalte, Videos und variable Fonts

**Status:** Module einzeln priorisieren; kein pauschaler Komplettumfang ohne Detailentscheidung.

### Dynamische WordPress-Inhalte

- [ ] M8.01 Datenanbieter-Vertrag, begrenzte Query und leere Zustände definieren.
- [ ] M8.02 Öffentliche Beiträge auf Slidevorlagen binden: Titel, Auszug, Bild, Datum, Permalink.
- [ ] M8.03 Private/passwortgeschützte Inhalte ausschließen und Rechteänderungen berücksichtigen.
- [ ] M8.04 Inhaltscache unabhängig vom veröffentlichten Layout invalidieren.
- [ ] M8.05 Fehlende Felder, gelöschte Beiträge, Reihenfolge und maximale Slidezahl behandeln.
- [ ] M8.06 Lokale Fontabdeckung bei wechselnden Texten prüfen; kein textgebundenes Subsetting verwenden.

### Video und Schriften

- [ ] M8.07 Lokale HTML5-Videos mit Poster und bedienbaren Steuerelementen unterstützen.
- [ ] M8.08 Verweigertes Autoplay, stummes Abspielen, Slidewechsel und Reduced Motion behandeln.
- [ ] M8.09 Variable WOFF2-Fonts mit unterstützten Achsen, Grenzen und lokaler Installation ergänzen.
- [ ] M8.10 Fontvariationen im Dokument, Editor, Ausgabe und Export vollständig abbilden.
- [ ] M8.11 Statische Fallbacks oder klare Nichtunterstützung je Familie definieren.
- [ ] M8.12 Vorhandene Slider migrieren und neue Module separat praktisch abnehmen.

**Abnahmekriterium:** Dynamische Inhalte sind öffentlichkeitsgerecht gecacht, Videos funktionieren auch ohne Autoplay und variable Fonts bleiben vollständig lokal.

## M9 – Effekte und Erweiterungspunkte

**Status:** Produktbacklog mit Einzelfreigabe je Effekt.

- [ ] M9.01 Häufig tatsächlich benötigte Effekte aus Stefans Einsatzfällen auswählen.
- [ ] M9.02 Scroll-/Parallax-/Pointer-Verhalten inklusive Konflikten mit Timeline und mobilen Geräten spezifizieren.
- [ ] M9.03 Effekte als optionale Module laden und Reduced-Motion-Fallback je Effekt definieren.
- [ ] M9.04 Zusätzliche Übergänge oder Textanimationen mit Fontmessung und DOM-Grenzen prüfen.
- [ ] M9.05 Bei Bedarf expliziten Flow-/Stack-Layouttyp ergänzen; Bühnenmodell unverändert halten.
- [ ] M9.06 PHP-Hooks, Filter und typisierte Registries für Ebenentypen/Provider dokumentieren.
- [ ] M9.07 Kompatibilitätsversionen und Deaktivierungsverhalten für Erweiterungen definieren.
- [ ] M9.08 Je Effekt Browser-, Leistungs-, Zugänglichkeits- und Import/Export-Nachweise erbringen.

**Abnahmekriterium:** Jeder Effekt hat messbaren Nutzen und bleibt optional; Slider ohne Effekt tragen keine zugehörige Laufzeitlast.

## Definition of Done pro Funktion

- [ ] Dokumentmodell, Servervalidierung und Editor verwenden denselben Vertrag.
- [ ] Vorschau, Frontend und responsive Vererbung liefern konsistente Ergebnisse.
- [ ] Undo/Redo, Speichern, Revision, Duplizieren und Import/Export berücksichtigen die Funktion.
- [ ] Berechtigungen, fehlerhafte Daten und Ressourcenfehler werden behandelt.
- [ ] Relevante automatisierte Checks und nötige praktische Prüfung sind dokumentiert.
- [ ] Übersetzbare Texte und zugängliche Bedienung sind vorhanden.
- [ ] PLAN.md/TODO.md und gegebenenfalls Schema/Migrationshinweise sind aktualisiert.

## Protokollvorlage für die praktische Abnahme

```text
Milestone / Commit / Pluginversion:
Datum und Prüfer:
WordPress / PHP / Theme:
Browser / Gerät / Containerbreite:
Verwendeter Slider und Fonts:
Durchgeführter Ablauf:
Erwartetes Ergebnis:
Tatsächliches Ergebnis:
Fehler / Einschränkungen / Belege:
Entscheidung: bestanden / mit Auflagen / nicht bestanden
Nächste notwendige Änderung:
```


## Stabilitätsprüfung PROBLEMS.md – 29.10.2026

- Bildbereitschaft mit Decodierung, Fehlerbehandlung und 1.200-ms-Grenze für Laufzeit und Editor-Vorschau ergänzt; veraltete Ladevorgänge werden bei Navigation abgebrochen.
- Eingangszustände vor dem Slidewechsel vorbereitet; Animationsuhr und Autoplay starten erst nach dem Übergang. Abbruch beim Tabwechsel hinterlässt genau einen lesbaren Slide.
- Bildanpassung auf volle Bühnenbreite/-höhe mit Seitenverhältnis, Zentrierung, responsive Überschreibungen und Undo ergänzt.
- Nachweise: Vitest-Lifecycle-/Store-Tests, nativer Chromium-Ressourcen-/Animationscheck, PHP-Prüfungen und 12 WordPress-Integrationstests auf einer separaten Testdatenbank. Details und Grenzen in `PROBLEMS.md` und `docs/runtime-readiness.md`.
- Stefans praktische M0-Abnahme ist inzwischen bestätigt (siehe Abnahmeprotokoll oben); die spätere grafische Timeline bleibt offen.

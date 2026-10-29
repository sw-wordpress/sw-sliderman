# SW Sliderman – CODE-STYLE.md

Stand: 29.10.2026 · Version: 1.0 · Status: Verbindliche Entwicklungsrichtlinie

Geltungsbereich: gesamtes Slider-Plugin einschließlich PHP, Vue-Editor, TypeScript-Laufzeit, Gutenberg-Block, Tests, Build und Releasepaket. Zielgruppe: Entwickler und Coding-Agenten.

Diese Datei ergänzt [PLAN.md](PLAN.md) und [TODO.md](TODO.md). Sie übernimmt die allgemeinen Qualitäts- und Sicherheitsprinzipien der bereitgestellten sw-backupit-Vorlage und ersetzt deren Backup-/Restore-Regeln durch konkrete Anforderungen an Slider, Editor, Veröffentlichung und lokale Schriften. Sie ist eine eigenständige Datei; die Backup-Richtlinie wird nicht geändert.

## 1. Verbindlichkeit und Arbeitsweise

**Ziel ist Code, dessen Verhalten ein anderer Entwickler zuverlässig erklären, ändern und überprüfen kann.** Kurzer Code ist kein Selbstzweck. Ein Sicherheitscheck, eine Zustandsbedingung oder eine verständliche Fehlerbehandlung darf nicht für eine elegante Abstraktion verschwinden.

Die Wörter **MUSS**, **DARF NICHT** und **SOLL** kennzeichnen Pflicht, Verbot und begründet abweichbare Empfehlung. Explizite Aufgaben und geltende AGENTS.md-Anweisungen sind zu beachten. Bei einem inhaltlichen Konflikt zwischen Produktanforderungen, Datenvertrag und dieser Datei MUSS der Konflikt benannt und dokumentiert aufgelöst werden; keine stillschweigende Änderung von Sicherheits- oder Veröffentlichungsregeln.

- PLAN.md legt Verhalten und Architektur fest. CODE-STYLE.md legt Implementierungsqualität und Konventionen fest. TODO.md dokumentiert den tatsächlichen Umsetzungsstand.
- Bestehende öffentliche Verträge sind bei Änderungen zu erhalten oder ausdrücklich zu migrieren.
- Eine Ausnahme MUSS eng begrenzt, begründet und überprüfbar sein. Suppressions benötigen den konkreten Regelcode und den Grund.
- Diese Datei führt keine zusätzliche pauschale Genehmigungspflicht für normale Implementierungsschritte ein. Veröffentlichungen und destruktive Aktionen richten sich nach dem konkreten Auftrag.
- Der Agent MUSS vor größeren Änderungen betroffene Verträge, Aufrufer und Tests lesen. Er DARF nicht gleichzeitig eine neue Architektur erfinden und sie als bestehende Projektkonvention ausgeben.
- Nicht durchgeführte Prüfungen und verbleibende Einschränkungen MÜSSEN im Abschluss genannt werden. Geplanter Code, ein erfolgreicher Build oder ein Screenshot allein beweisen keine vollständige Funktion.

## 2. Stilentscheidung und automatische Durchsetzung

### 2.1 Eine PHP-Konvention für dieses Plugin

Anders als das Backup-Projekt besitzt der Slider keinen separat ausgelieferten Restore-Core. Deshalb verwendet **sämtlicher eigener PHP-Code den WordPress-PHP-Stil**, auch in Domain und Application. Es gibt keinen zweiten PSR-12-Formatierungsbereich.

**Bewusste Ausnahme:** Klassen, Interfaces, Enums, Namespace-Segmente und PSR-4-Dateien verwenden PascalCase, etwa `SliderDocument.php` und `SW\Slider\Domain\SliderDocument`. Der Dateipfad MUSS exakt zur PSR-4-Zuordnung passen. Eigene Methoden, Eigenschaften, Parameter und lokale PHP-Variablen verwenden trotzdem durchgehend `snake_case`. Von fremden Interfaces geerbte Namen bleiben unverändert, beispielsweise PSR-3-Methoden.

Dies ist eine dokumentierte Abweichung von den nativen WordPress-Klassen-/Dateinamenskonventionen. Sie ist keine Abweichung von Sicherheits-, Übersetzungs- oder Interoperabilitätsanforderungen. Es darf keine Behauptung einer ausnahmslosen WPCS-Konformität geben.

| Bereich | Konvention | Automatische Prüfung |
| --- | --- | --- |
| Eigener PHP-Code | WordPress-Stil, PSR-4-Namensausnahme, explizite Typen | PHPCS/WordPressCS, PHPStan, PHPCompatibilityWP |
| Editor, Runtime, gemeinsame TS-Module | TypeScript strict, zwei Leerzeichen, Semikolons, einfache Quotes | ESLint, Prettier, TypeScript |
| Vue-Komponenten | Composition API, `<script setup lang="ts">` | ESLint/Vue, vue-tsc |
| Gutenberg-Adapter | WordPress-Pakete, WordPress-JS-Konventionen | Eigenes ESLint-Override, passender Formatter |
| CSS/SCSS | Zwei Leerzeichen, Namespacing, gemeinsame Tokens | Stylelint, Prettier soweit kompatibel |
| Tests | Stil des jeweiligen Bereichs | Dieselben Parser/Lints, Testwerkzeuge |
| Generierter/Fremdcode | Nicht manuell umformatieren | Build-/Dependency-Prüfung statt eigener Stilregeln |

Formatter dürfen sich nicht gegenseitig widersprechen. Falls der Gutenberg-Bereich tabbasierte WordPress-JS-Formatierung nutzt, MUSS ein pfadbezogenes Override dies von den Vue-/Runtime-Dateien trennen. Keine abwechselnden Formatänderungen durch konkurrierende Tools.

### 2.2 Repository-Grundregeln

- UTF-8 ohne BOM, LF, abschließender Zeilenumbruch, keine nachgestellten Leerzeichen.
- `.editorconfig`, PHPCS-, ESLint-, TypeScript- und Formatter-Konfiguration MÜSSEN eingecheckt sein.
- PHP: Tabs zur Einrückung, Spaces zur Ausrichtung. TS/Vue/CSS außerhalb des Gutenberg-Overrides: zwei Spaces.
- Richtwert für Lesbarkeit: etwa 100–120 Zeichen pro Zeile; URLs, Typen und verständliche Tabellen dürfen länger sein.
- Keine Dateigrößen- oder Methodenlängen-Grenze als Selbstzweck. Große Dateien mit mehreren Verantwortlichkeiten MÜSSEN aufgeteilt werden; sinnvolle zusammengehörige Logik darf nicht für einen Zahlenwert zerlegt werden.
- `vendor/`, `node_modules/`, generierte Bundles und Third-Party-Quellen nicht manuell ändern. Patches nur über einen reproduzierbaren, dokumentierten Mechanismus.
- Keine vollständigen produktiven Slider-Dokumente, Secrets oder fremden Fontdateien ohne passende Lizenz als Testdaten einchecken.

## 3. Modulgrenzen und Architektur

### 3.1 Verantwortlichkeiten

| Pfad | Verantwortung | Verbotene Kopplung |
| --- | --- | --- |
| `src/Domain/` | Dokumentregeln, Werte, Zustände, fachliche Fehler | WordPress, HTTP, SQL, Dateisystem, aktuelle Uhrzeit |
| `src/Application/` | Anwendungsfälle und benötigte Ports | Konkrete Controller, `$wpdb`, globale Service-Locator |
| `src/Infrastructure/` | Persistenz, Dateien, Queue, technische Adapter | Produktentscheidungen versteckt in Hilfsmethoden |
| `src/Rest/`, `src/Admin/` | WordPress-Grenzen, Rechte, Eingaben, Response-Mapping | Vollständige Geschäftsprozesse im Controller |
| `src/Rendering/` | Sichere serverseitige Ausgabe, Artefaktaufbau | Entwurfsrechte umgehen, öffentliche Rohdokumente |
| `src/Fonts/`, `src/ImportExport/` | Fachmodule mit klaren Provider-/Repository-Grenzen | Beliebige Remote-URLs oder direkte Roh-Extraktion |
| `assets/shared/` | Typen, Layoutresolver, Zeitplan, reine Funktionen | Vue, Pinia, DOM, Netzwerk, WordPress-Globals |
| `assets/editor/` | Bearbeitung, UI-Zustand, Historie, Admin-API | Eigene abweichende Layout-/Animationsregeln |
| `assets/runtime/` | DOM, Wiedergabe, Lifecycle, Navigation | Vue, Pinia, Editorbibliotheken, Admin-API |
| `assets/block/` | Gutenberg-Auswahl und Einbindung | Zweiter eigenständiger Slider-Renderer |

`Fonts` und `ImportExport` sind fachliche Module, keine Ausnahme vom Schichtenprinzip: reine Regeln und Infrastrukturadapter MÜSSEN darin klar erkennbar getrennt bleiben. Bei wachsendem Umfang sind Unterbereiche wie `Domain/`, `Application/`, `Infrastructure/` zulässig. Keine tief verschachtelte Verzeichnisstruktur nur auf Vorrat.

Abhängigkeitsrichtung: Domain kennt keine äußere Schicht. Application kennt Domain und eigene Ports. Adapter implementieren diese Ports. Der Composition Root verbindet konkrete Implementierungen. Die Registrierung eines Hooks darf nicht beim Import einer beliebigen Klassendatei passieren.

### 3.2 Abstraktionen mit Zweck

- Konstruktor-Injektion für erforderliche Abhängigkeiten; keine `get_instance()`-Ketten und kein Containerzugriff innerhalb fachlicher Services.
- Ein Interface ist sinnvoll an einer tatsächlichen Grenze: Persistenz, Fontprovider, Filesystem, Queue, Uhr oder UUID-Erzeugung. Nicht jede Klasse braucht ein gleichnamiges Interface.
- Keine generischen `BaseService`, `AbstractManager` oder `Repository<T>` ohne konkreten Nutzen.
- Vererbung nur für ein echtes austauschbares Verhalten; Komposition bevorzugen. Traits nicht als versteckte Sammlung fachlicher Abhängigkeiten verwenden.
- Konstruktoren initialisieren und prüfen Invarianten. Sie registrieren keine Hooks, laden keine Dateien und starten keine Netzwerkverbindung.
- Klassen mit alleiniger interner Implementierungsrolle SOLLEN `final` sein. Dokumentierte Erweiterungspunkte bleiben bewusst offen.
- Keine WordPress-Typen wie `WP_Error`, `WP_Post`, `WP_REST_Request` oder `wpdb` in Domain-/Application-Verträgen.
- Ein fachlicher Speichervorgang heißt beispielsweise `save_draft()` oder `publish_slider()`, nicht `process_data()`.

### 3.3 Verantwortlichkeit pro Funktion

Eine Methode MUSS ein benennbares Ergebnis haben. Ein Controller liest und validiert den Request, prüft Rechte, ruft den Anwendungsfall auf und übersetzt das Ergebnis. Er erzeugt nicht gleichzeitig Fontdateien, SQL, CSS und ZIP-Archive.

Frühe Rückgaben sind für ungültige Bedingungen sinnvoll. Stark verschachtelte Bedingungen SOLLEN in klar benannte Prädikate oder Anwendungsfälle aufgelöst werden. Keine doppelte Negation und keine Boolean-Parameter, deren Aufruf unverständlich ist: `publish( $id, true, false )` ist durch einen benannten Befehl oder ein Optionsobjekt zu ersetzen.

## 4. PHP: Sprache, Typen und Benennung

### 4.1 Laufzeit und Typisierung

- PHP-Baseline gemäß PLAN.md, zunächst 8.2+. Mindestversionen sind vor Release gegen tatsächlich unterstützte Versionen zu prüfen.
- Eigene PHP-Dateien verwenden `declare(strict_types=1);`. Die genaue Formatierung dieses Declare-Statements wird als eng begrenzte Projektkonvention im Linter hinterlegt, falls erforderlich.
- Strikte Typen ersetzen keine Eingabevalidierung. Insbesondere kann ein aus WordPress aufgerufener Callback weiterhin anders typisierte Rohwerte erhalten.
- Eigene APIs MÜSSEN Parameter- und Rückgabetypen besitzen. `mixed` ist an unkontrollierten Grenzen zulässig; nach Validierung wird es in einen eindeutigen Typ überführt.
- Externe Callback-Signaturen MÜSSEN zum tatsächlichen WordPress-/Library-Vertrag passen. Keine zu enge Signatur, die bei einem üblichen Filterwert einen TypeError erzeugt.
- Listen und strukturierte Arrays über PHPDoc präzisieren: `list<Slide>`, `array<string, FontVariant>` oder klar definierte Array Shapes. Keine unkommentierten Arrays durch fünf Schichten reichen.
- Identitäten, Revisionen, Dateihashes und Animationseinheiten nicht als austauschbare Strings/Zahlen behandeln. Wertobjekte nutzen, wenn sie eine echte Verwechslung verhindern.
- `readonly` für tatsächlich unveränderliche Daten; beachten, dass eine readonly-Eigenschaft ein referenziertes Objekt nicht tief unveränderlich macht.
- Keine dynamischen Properties, implizit nullable Parameter oder `#[AllowDynamicProperties]` als Reparatur eigener Modellfehler.
- Alle Geld-/Zeit-/Größeneinheiten sind explizit zu benennen; Animationen etwa `duration_ms`, Dateigrößen `size_bytes`.

### 4.2 Namen und Format

- Klassen/Interfaces/Enums: PascalCase; Interfaces erhalten bei Bedarf das Suffix `Interface`, ohne wechselnde `I`-Präfixe.
- PHP-Methoden/Eigenschaften/Variablen: `snake_case`; Konstanten: `UPPER_SNAKE_CASE`.
- Keine unklaren Abkürzungen wie `$d`, `$cfg`, `$tmp2`, `$obj`. Etablierte Begriffe wie ID, URL und UUID sind erlaubt.
- Ein primärer Typ pro Datei, Dateiname exakt wie Typ. Keine zusätzliche freie Funktion in einer Klassendatei.
- Imports explizit; keine unnötig vollqualifizierten langen Namen im Methodenkörper und keine Namespace-Wildcards.
- WordPress-Spacing: `get_option( 'sws_settings' )`, `if ( $is_valid ) { ... }`, lange Array-Syntax `array( ... )`.
- Strings ohne Interpolation mit einfachen Quotes; mehrzeilige Arrays mit abschließendem Komma.
- Explizite Sichtbarkeit für Methoden, Properties und Klassenkonstanten.
- Vergleich bevorzugt `===`/`!==`. Bei Vergleich mit Literalen wird WordPress-konform die Konstante links gesetzt: `if ( 0 === $slider_id )`.
- `empty()` DARF nicht als pauschale Validierung verwendet werden, wenn `0`, `'0'`, `false`, leer und fehlend verschiedene Bedeutungen haben.
- `isset()` und `array_key_exists()` entsprechend ihrer unterschiedlichen Null-Semantik verwenden.
- Kein verschachtelter ternärer Operator, keine schwer lesbare Mutation innerhalb einer Bedingung.
- Reine PHP-Dateien ohne schließendes `?>`. In Templates nur vollständige PHP-Öffnungstags.

### 4.3 Präfixe und öffentliche Verträge

Bis zur endgültigen Namensfreigabe gelten folgende Projektwerte:

| Gegenstand | Vorgabe |
| --- | --- |
| PHP-Namespace | `SW\Slider` |
| Textdomain/Plugin-Slug | `sw-sliderman` |
| Actions, Filters, Optionen, Cron | `sws_...` |
| Interne Metaschlüssel | `_sws_...` |
| Konstanten im globalen Raum | `SWS_...` |
| REST-Namespace | `sw-sliderman/v1` |
| CSS-Klassen, Custom Properties | `sws-...`, `--sws-...` |
| Blockname | `sw-sliderman/slider` |

Der in PLAN.md genannte CPT `sw_slider` bleibt unverändert. Das Präfixschema verlangt keine kosmetische Umbenennung bestehender Datenverträge. Globale freie Funktionen sind möglichst zu vermeiden; ein notwendiger Template-Helper heißt etwa `sws_render_slider()`.

Öffentliche Methodennamen, Hooknamen, Parameter und JSON-Felder sind Verträge. Umbenennungen können auch wegen PHP Named Arguments brechend sein. Bei extern implementierten Interfaces gelten deren Namen und Signaturen.

## 5. WordPress-Integration und Lebenszyklus

- Der Plugin-Bootstrap bleibt klein: Header, Voraussetzungen, Autoloader, Composition Root und Lifecycle-Registrierung.
- Ausführbare Einstiegspunkte und direkt ladbare Templates schützen den direkten Zugriff mit dem passenden WordPress-Kontextcheck. Ein ABSPATH-Guard ist kein Ersatz für Rechteprüfungen. Reine Domain-Klassendateien benötigen keinen WordPress-Bootstrap, um getestet zu werden.
- Kein rekursives `require`-Scanning. Composer/PSR-4 verwenden; fehlenden Autoloader als Installationsfehler verständlich behandeln.
- Hooks erst zum passenden Zeitpunkt registrieren: beispielsweise CPT auf `init`, REST auf `rest_api_init`, Admin-Assets ausschließlich auf eigenen Adminseiten.
- Registrierung zentral und ausdrücklich; Priorität und Argumentzahl bewusst wählen. Abmeldbare Methoden gegenüber anonymen langlebigen Callbacks bevorzugen.
- Filter MÜSSEN einen Wert mit dem dokumentierten Typ zurückgeben. Ein Filter verändert nicht nebenbei Datenbank oder Dateisystem, sofern das nicht sein ausdrücklich dokumentierter Vertrag ist.
- Fremde Filterwerte bleiben unkontrollierte Eingaben; eine Erweiterung darf keine ungültigen Werte am Schema vorbei einschleusen.
- Keine globale Änderung fremder Queries, Upload-MIMEs, Script-Ladezeiten, Übersetzungen oder Editorstyles als Nebenwirkung.
- Assets über WordPress-APIs registrieren/einreihen; nicht per hart kodiertem Script-Tag aus einem Controller ausgeben.
- Block-Metadaten über `block.json`; nur APIs verwenden, die zur unterstützten WordPress-Version passen.
- Gutenberg nutzt die WordPress-Pakete und die vorhandene React-Laufzeit. Kein eigenes zweites React oder pauschal das gesamte Adminframework ins Frontend bündeln.
- `is_admin()` ist weder Authentifizierung noch Berechtigung und sagt nicht, ob ein Besucher eine vertrauenswürdige Aktion ausführt.
- Plugin-Deaktivierung stoppt eigene zeitgesteuerte Aufgaben, löscht aber keine Slider, Fonts oder Revisionen.
- Uninstall prüft seinen vorgesehenen Einstiegskontext und löscht nur nach gewählter Policy eigene Daten; Site-/Netzwerkgrenzen erhalten.
- Versionsvergleich bei Updates darf billig sein. Keine Schemaoperation, Katalogsynchronisierung oder Fontinstallation bei jedem Request. Ausschließlich Activation Hooks genügen für spätere Pluginupdates nicht; ein versionierter, kontrollierter Upgradeweg ist erforderlich.

## 6. Eingabegrenzen, Berechtigungen und Ausgabe

### 6.1 Eingaben

**Validieren, gezielt normalisieren, am Ausgabepunkt kontextgerecht escapen.** Jede dieser Maßnahmen hat einen eigenen Zweck.

- Nur erwartete Requestfelder auslesen. Keine vollständigen Superglobal-Arrays durch einen generischen Sanitizer laufen lassen.
- Bei klassischen slashed WordPress-Superglobals einmal passend `wp_unslash()` verwenden. Bereits geparste REST-JSON-Daten **nicht pauschal erneut unslashen**.
- JSON-Fehler, Typfehler und Bereichsfehler getrennt behandeln. Ein TypeScript-Cast macht Netzwerkdaten nicht gültig.
- Identitäten nicht mit `absint()` oder `parseInt()` in scheinbar gültige Werte umformen, wenn ein negativer Wert oder `123abc` ausdrücklich ungültig ist.
- Rich Text mit eigener enger Tag-/Attribut-Allowlist behandeln. `wp_kses_post()` ist kein automatisch passender Vertrag für einen begrenzten Slider-Texteditor.
- URLs getrennt nach Zweck validieren: Navigation darf andere Ziele erlauben als serverseitige Downloads. Eine syntaktisch gültige URL ist kein SSRF-Schutz.
- CSS-Properties und Werte über typisierte Schemas freigeben; HTML-Escaping validiert kein CSS. Keine freien `url()`, `@import`, Selektoren oder Stylefragmente aus Dokumenten.

### 6.2 Berechtigungen

- Jede privilegierte Operation prüft die konkrete Capability und bei objektbezogenen Aktionen das konkrete Objekt.
- Keine Rollenvergleiche wie „ist Administrator“, keine alleinige Prüfung „eingeloggt“ und kein Vertrauen in ausgeblendete UI-Schalter.
- Für Cookie-authentifizierte REST-Aufrufe den vorgesehenen REST-Nonce-Mechanismus verwenden. Klassische Adminaktionen benötigen den passenden CSRF-Schutz.
- Nonces sind keine Autorisierung, kein Ersatz für Idempotenz und keine garantiert einmal verwendbaren Tokens.
- Rechte für Lesen eines Entwurfs, Bearbeiten, Veröffentlichen, Importieren und Fontverwaltung unterscheiden.
- Eine Leseanfrage darf keinen Import, keine Fontinstallation oder andere privilegierte Mutation auslösen.
- Eine Wiederholung nach abgelaufenem Nonce darf einen Schreibauftrag nicht unbemerkt doppelt ausführen.

### 6.3 Ausgabe nach Kontext

| Kontext | Verbindliches Verfahren |
| --- | --- |
| Normaler HTML-Text | `esc_html()` bzw. übersetzte Variante |
| HTML-Attribut | Vollständigen Attributwert mit `esc_attr()` escapen |
| `href` / `src` | Zweckgebundene URL-Policy, am HTML-Ausgang `esc_url()` |
| Textarea | `esc_textarea()` |
| Erlaubtes Rich Text | `wp_kses()` mit projektspezifischer Allowlist |
| REST-JSON | Daten an WordPress-Response übergeben; keine HTML-Escapes in Datenwerte einbauen |
| JSON in einem Script-Datenblock | `wp_json_encode()` mit kontextsicheren HEX-Flags; Fehler behandeln |
| CSS | Nur aus validierten Typen/Werten durch einen eigenen Serializer erzeugen |

Keine Inline-Eventhandler, kein `eval`, keine ungeprüfte `innerHTML`-/`v-html`-Ausgabe. Ein notwendiger Rich-Text-Ausgabepunkt wird zentral gekapselt und nutzt denselben Allowlist-Vertrag wie der Server. Der Name `safe_html` allein ist kein Sicherheitsnachweis.

HTML-Escaping wird nicht dauerhaft in das Dokument gespeichert. Andernfalls entstehen doppelte Entities und inkonsistente Wiederbearbeitung. Bereits gerendertes, intern abgesichertes HTML besitzt dagegen einen klar dokumentierten Rückgabevertrag; eine gezielte PHPCS-Ausnahme an dessen Ausgabe muss auf diesen Vertrag verweisen.

## 7. REST- und Fehlerverträge

- Jede Route erhält eine ausdrückliche `permission_callback`, eine Methodenauswahl und begrenzte Parameter.
- GET hat keine fachlichen Schreibnebenwirkungen. Listen sind paginiert und begrenzt. Requestgrößen und Ressourcenverbrauch begrenzen.
- `WP_REST_Response` und `WP_Error` an der WordPress-Grenze verwenden; keine selbst mit `echo` ausgegebenen JSON-Fragmente oder `exit` im Anwendungsfall.
- Feldnamen in REST/Slider-JSON verwenden `camelCase`, passend zum Dokumentvertrag. PHP mappt dies ausdrücklich auf seine internen Namen.
- Fehlercodes sind stabile maschinenlesbare Werte, etwa `sws_revision_conflict`. Nutzermeldungen sind übersetzbar und dürfen sich ändern.
- Übliche Statuscodes: 400 für unlesbaren Request, 401 für fehlende Authentifizierung soweit passend, 403 für fehlende Rechte, 404 für fehlendes/nicht sichtbares Objekt, 409 für Versionskonflikt, 413 für zu große Anfrage, 422 für lesbares, aber fachlich ungültiges Dokument. Die exakte Zuordnung wird in API-Tests fixiert.
- Feldfehler enthalten einen eindeutigen Dokumentpfad und einen sicheren Fehlergrund; keine vollständigen vertraulichen Dokumente als Fehlerkontext zurückgeben.
- Unerwartete technische Fehler erhalten eine sichere allgemeine Meldung plus Korrelationskennung. Interne Ursache nur im begrenzten technischen Log.
- Ein Anwendungsfall prüft seine fachlichen Voraussetzungen auch bei Aufruf außerhalb von REST, etwa über CLI oder einen Job. Benutzerautorisierung bleibt an einem ausdrücklich definierten Zugangspunkt; keine widersprüchlichen Kopien in mehreren Schichten.

Erwartete Ergebnisse wie „kein Suchtreffer“ sind keine Exceptions. Fachliche Ablehnungen können typisierte Resultate oder konkrete Exceptions sein; pro Anwendungsfall einen klaren Vertrag wählen. Technische Ausfälle werden nicht in `false`, leere Listen oder scheinbaren Erfolg umgewandelt.

`catch ( Throwable $error )` ist an einem definierten äußersten Schutzpunkt zulässig, etwa einem Queue-Worker. Im Inneren konkrete Fehlertypen fangen. Ursache erhalten, Ressourcen freigeben und genau einmal sinnvoll protokollieren. Keine leeren Catch-Blöcke, pauschale `@`-Unterdrückung oder `console.error` als alleinige Fehlerbehandlung.

## 8. Persistenz, JSON und konkurrierende Änderungen

### 8.1 Kanonische Daten

- Ein Slider besitzt genau ein maßgebliches Entwurfsdokument. Keine konkurrierenden Kopien desselben Zustands in `post_content`, Metafeldern und Optionen.
- Datenbank, Browserstorage, Importpakete und ältere Revisionen gelten als prüfpflichtige Eingaben.
- `schemaVersion` und serverseitige Validierung sind Pflicht. Unbekannte neuere Versionen nicht still reduzieren.
- UUID und WordPress-Post-ID sind unterschiedliche Identitäten. Doppelte Layer-IDs und gebrochene interne Referenzen ablehnen.
- Nichtendliche Zahlen, ungültige UTF-8-Daten, übergroße Werte und übermäßige Verschachtelung ablehnen.
- JSON-Kanonisierung und Hashbildung sind ein definierter Serververtrag. Nicht davon ausgehen, dass PHP und JavaScript beliebige Fließkommazahlen und Objektfelder bytegleich serialisieren.
- Medien und Fonts über stabile IDs/relative Pfade referenzieren; keine Installationsdomain tief im Dokument festschreiben.

### 8.2 WordPress-Fallen ausdrücklich behandeln

- `wp_insert_post()`/`wp_update_post()` und Metadaten-APIs haben historische Slashing-Verträge. Ein dedizierter Persistenzadapter übernimmt diese Behandlung genau einmal.
- JSON mit Backslashes, Quotes und HTML-ähnlichem Text MUSS nach Speichern/Laden semantisch unverändert sein. Nicht das vollständige JSON durch `sanitize_text_field()`, KSES oder `the_content` schicken.
- Da Core-Save-Filter `post_content` verändern können, MUSS die gewählte JSON-Kodierung dagegen nachweislich robust sein. Ein möglicher Adapter kodiert `<`, `>`, `&` und Quotes mit JSON-HEX-Flags und beachtet den Slashing-Vertrag. Der Roundtrip ist mit allen unterstützten Rollen und WordPress-Filtern zu testen.
- Keine globale Abschaltung von KSES oder fremden Contentfiltern, um das Speicherformat zu reparieren. Ein unvermeidbarer lokaler Hook-Eingriff benötigt genaue Eingrenzung, `finally`-Cleanup und Integrationsnachweis.
- `false` von `update_post_meta()` kann auch „Wert unverändert“ bedeuten. Rückgabewerte gemäß tatsächlichem API-Vertrag interpretieren.
- Große Kataloge, Artefakte und Dokumente nicht als autoloaded Optionen speichern. Transients dürfen vor Ablauf verschwinden und sind kein dauerhafter Speicher.
- WP-Cron ist kein pünktlicher Scheduler. UI und Jobsystem dürfen keine sekundengenaue Ausführung voraussetzen.

### 8.3 Schreibschutz und Veröffentlichung

- Jeder Schreibauftrag enthält `expectedVersion`. Lesen, vergleichen und später ungeschützt schreiben ist **keine** sichere Versionsprüfung.
- Ein Repository MUSS konkurrierende Änderungen mit einem nachgewiesenen atomaren Compare-and-Swap oder geeigneter Serialisierung verhindern. Eine transientbasierte „Lockdatei“ ohne atomaren Erwerb reicht nicht.
- Verwendete Sperren benötigen Eigentümerkennung, Ablauf-/Recovery-Regeln und Schutz davor, dass ein alter Worker nach Ablauf seiner Sperre einen neuen Stand überschreibt.
- Entwurf, Revision und Live-Snapshot bleiben getrennt. Autosave veröffentlicht niemals.
- Artefakte zunächst vollständig erzeugen und prüfen, dann die aktive Referenz wechseln. Keine Live-Datei schrittweise überschreiben.
- Datenbank und Filesystem haben keine gemeinsame automatische Transaktion. Teilzustände und Aufräumen ausdrücklich entwerfen; kein vollständiges Rollback behaupten, das nicht implementiert ist.
- Ein Fehler nach erfolgreichem Commit DARF nicht als sicher fehlgeschlagene Veröffentlichung präsentiert werden. Bei unklarem Ausgang Status nachlesen, bevor ein nicht idempotenter Auftrag wiederholt wird.
- Hooks mit extern sichtbaren Folgen erst nach dauerhaftem fachlichem Commit auslösen. Ein fehlgeschlagener nachgelagerter Hook rollt den bereits veröffentlichten Stand nicht automatisch zurück.
- Bereinigung löscht nur referenzfreie Artefakte/Fonts mit Sicherheitsfrist. Entwürfe, erhaltene Revisionen und Vorlagen zählen als Referenzen.

## 9. SQL, Dateien, Archive und Jobs

### 9.1 Datenbank

- WordPress-APIs bevorzugen; SQL nur, wenn die benötigte Semantik es verlangt.
- Werte mit `$wpdb->prepare()` binden. Identifier nur aus eigener Allowlist; `%i` nur bei passender WordPress-Mindestversion und korrektem Einsatzzweck.
- Tabellenpräfixe aus WordPress ableiten, nicht `wp_` fest einbauen. Site- und Netzwerkdaten unterscheiden.
- SQL-Migrationen versionieren, wiederholbar und unter konkurrierendem Start geschützt ausführen. Kein `dbDelta()` auf jedem normalen Seitenaufruf.
- Direkte SQL-Schreibvorgänge MÜSSEN Revisionen, WordPress-Objektcache und Hookverhalten ausdrücklich berücksichtigen. Ein CAS-Fix darf keine inkonsistenten Cachewerte erzeugen.

### 9.2 Dateisystem und Archive

- URL und lokaler Pfad sind verschiedene Typen/Konzepte. Nie aus einer Besucher-URL ungeprüft einen lokalen Pfad ableiten.
- Schreiboperationen auf definierte Wurzeln begrenzen. `realpath()` allein schützt nicht bei neuen Pfaden, Symlinks oder Rennen.
- Temporäre Namen serverseitig erzeugen, nicht aus Originaldateinamen übernehmen. Dateinamen sind keine Rechteprüfung.
- Atomare Umbenennung nur innerhalb eines geeigneten Dateisystems annehmen; Speicheradapter und Fehlerverhalten nachweisen. DB-Commit und Rename bilden keine gemeinsame Atomizität.
- WordPress-Uploadfunktionen für normale Medien verwenden. Font-/Paketimporte erhalten eine eigene begrenzte Pipeline; keine globale Freischaltung unkontrollierter Dateitypen.
- ZIP-Einträge vor und während kontrollierter Extraktion prüfen: Traversal, absolute Pfade, Backslashes, Nullbytes, doppelte normalisierte Namen, Case-Kollisionen, Symlinks und Sonderdateien.
- Komprimierte Größe, entpackte Gesamtgröße, Einzeldateigröße und Eintragsanzahl separat begrenzen. Angaben im Manifest nicht blind vertrauen.
- Kein ungeprüftes `extractTo()` und kein `unserialize()` von Importdaten. Das Austauschformat ist JSON plus zugelassene Binärressourcen.
- Hashprüfung erkennt veränderte Bytes, macht einen fremden Import aber nicht vertrauenswürdig. Alle Inhalte weiterhin validieren.
- Nicht öffentliche Stagingdaten außerhalb erreichbarer Webpfade halten oder mit nachgewiesenem Zugriffsschutz sichern. `index.php` oder `.htaccess` allein schützt nicht in jeder Serverkonfiguration.
- Ressourcen mit `try/finally` schließen, temporäre Dateien bei Abbruch bereinigen. Keine vom Import nicht selbst angelegten Dateien pauschal löschen.

### 9.3 Hintergrundjobs

- Arbeit in begrenzten, wiederaufnehmbaren Schritten mit persistiertem Zustand ausführen. Kein Request lädt beliebig große Archive vollständig in den RAM.
- Zustandswechsel explizit modellieren: beispielsweise queued → running → completed/failed/cancelled.
- Jobs benötigen Idempotenz-/Besitzerschutz, Fortschrittsdaten und definierte Abbruchpunkte.
- Nur vorübergehende Fehler wiederholen, mit Backoff, Jitter und begrenztem Budget. Validierungsfehler und fehlende Rechte nicht endlos wiederholen.
- Nutzerabbruch ist ein eigener Zustand. Ein Browser-Abort beweist nicht, dass der Server die Mutation abgebrochen hat.
- Keine Erfolgsanzeige vor dauerhaftem Abschluss. Fortschritt nicht künstlich simulieren; unbekannter Gesamtumfang bleibt unbekannt.

## 10. Lokale Google Fonts als technische Invariante

Diese Regeln sind produktbezogene Pflichten und gelten unabhängig von kosmetischem Stil:

1. Editorbrowser und Frontend laden Schriften ausschließlich lokal. Keine externen Font-CSS-Dateien, Vorschau-Requests, Preconnects, DNS-Prefetches oder Remote-Fallbacks aus diesem Plugin.
2. Serververbindungen zum Provider entstehen ausschließlich durch definierte Verwaltungsaktionen. Aktivierung und Besucheranfragen installieren keine Fonts.
3. Downloadziele entstehen aus dem geprüften Provideradapter; keine beliebigen Remote-URLs aus Requests oder Importmanifesten.
4. HTTPS, Zertifikatsprüfung, Hosts/Pfade, Ports und Redirectziele werden geprüft. WordPress Safe HTTP API verwenden, aber nicht als vollständigen Ersatz der Providerpolicy betrachten.
5. Private, Loopback-, Link-local- und Metadatenziele blockieren. Bei Redirects die Policy erneut anwenden; kein beliebiges externes CSS weiterverfolgen.
6. Antwortgrößen, Downloadzeit, Zahl der Dateien und Installationsparallelität begrenzen. Größenlimits auch bei Streaming durchsetzen.
7. Fremdes CSS wird nicht gespeichert und unverändert ausgegeben. Nur benötigte zulässige Deskriptoren parsen und lokales CSS neu erzeugen.
8. Dateiendung und HTTP Content-Type genügen nicht als Fontprüfung. WOFF2-Format, Größe, Variante, Hash und Lizenzzuordnung prüfen; keine eigene vollständige Font-Engine entwickeln.
9. Installation zuerst vollständig vorbereiten, dann aktivieren. Fehler lassen eine vorhandene funktionierende Version unangetastet.
10. Fontfamilien intern kollisionsarm benennen; Variante, Unicode-Range und Subset korrekt erhalten.
11. Fehlende Gewichte nicht unbemerkt synthetisieren. Nicht unterstützte variable Familien in 1.0 ausdrücklich kennzeichnen.
12. Keine dokumenttextabhängigen `text=`-Requests: dynamische Inhalte und spätere Bearbeitung benötigen weitere Zeichen; Nutzertexte gehören nicht in Fontprovider-URLs.
13. Lizenzen, Quelle und Version pro Installation erhalten und bei Export mitführen.
14. Update erzeugt eine neue Installation; veröffentlichte Slider bleiben auf ihrem geprüften Stand.
15. Lokale Pfade nicht von Offload-/CDN-Filtern unbemerkt extern ausliefern lassen. Nicht unterstützte Konfiguration diagnostizieren.
16. Bei Verlust einer Schriftdatei Systemschrift anzeigen und Diagnose bereitstellen, niemals Google als automatischen Ersatz verwenden.

Offline- und Netzwerktests MÜSSEN echte ausgehende Browser-/Serveranfragen kontrollieren. Eine Textsuche nach `fonts.googleapis.com` reicht als Nachweis nicht aus.

## 11. TypeScript: Verträge vor Bequemlichkeit

- `strict: true`, `noUncheckedIndexedAccess` und `exactOptionalPropertyTypes` für eigene neue TS-Module. Etwaige Library-Konflikte an Adaptergrenzen lösen, nicht projektweit abschalten.
- Keine ungeprüften `any`, doppelten Casts `as unknown as T`, Non-null Assertions oder pauschalen `@ts-ignore`.
- Rohdaten als `unknown` behandeln und zur Laufzeit validieren. `response.json() as SliderDocument` ist kein Parser.
- `type` für Unions/Datenformen, `interface` für bewusst implementierbare Objektverträge; nicht allein aus Geschmacksgründen bestehende Typen umschreiben.
- Discriminated Unions für Ebenentypen, Zustände und Ergebnisse. Exhaustive Switches für fachliche Varianten; unbekannte neue Werte nicht still ignorieren.
- `camelCase` für Funktionen/Variablen/JSON-Felder, PascalCase für Typen/Komponenten. Zeit- und Größenfelder tragen Einheiten wie `durationMs`.
- `readonly`/Readonly-Datenstrukturen an Übergaben verwenden, wo Mutation nicht erlaubt ist; wissen, dass TypeScript dies zur Laufzeit nicht erzwingt.
- Gleichheit mit `===`; `null`, `undefined`, `false` und `0` nach Vertrag unterscheiden. `||` DARF nicht gültige Null-/Leerwerte unabsichtlich überschreiben.
- Zentrale API-Clients mit Timeout-/Abbruchbehandlung, Response-Parsern und typisierten Fehlern; keine verstreuten fetch-Aufrufe in Komponenten.
- Keine unkontrollierten Floating Promises. Hintergrundaufrufe ausdrücklich starten und Fehler behandeln; erwartete Abbrüche separat erkennen.
- Nicht idempotente Mutationen nicht automatisch wiederholen. Bei Timeout zuerst Zustand beziehungsweise Idempotenzkennung prüfen.
- `Promise.all()` nur für unabhängige Arbeiten, deren gemeinsames Fehlerverhalten passt. Teilfehler dürfen nicht unbemerkt Ressourcen verwaisen lassen.

Beispiel für einen eindeutigen Vertrag; beide Varianten sind fachlich zu behandeln:

```ts
export type SaveDraftResult =
  | { status: 'saved'; version: number }
  | { status: 'conflict'; currentVersion: number };
```

Ein Netzwerkfehler ist nicht automatisch dieselbe Variante wie ein Versionskonflikt und muss vom Client entsprechend gesondert behandelt werden.

## 12. Vue-Editor: Zustand und Nebenwirkungen

### 12.1 Komponenten und Stores

- Vue 3 Composition API mit `<script setup lang="ts">`. Props und Emits explizit typisieren.
- Komponenten nach Funktion gliedern: Arbeitsfläche, Ebenenbaum, Eigenschaften, Typografie, Veröffentlichung. Keine allwissende Editor-Komponente.
- Kleine rein visuelle Zustände lokal halten. Pinia für tatsächlich geteilten Editor-/Dokumentzustand, nicht für jedes Tooltip.
- Dokumentzustand, Auswahl/Zoom, geladene Serverversion und Netzwerkstatus getrennt modellieren.
- Props nicht direkt mutieren. Komponenten senden Absichten, etwa `updatePosition`, statt über verschachtelte Referenzen heimlich das Dokument zu ändern.
- `computed` für abgeleitete Werte; keine Requests, Dateizugriffe oder Dokumentmutationen in Computed-Gettern.
- Watcher nur für echte Seiteneffekte. Keine Kette gegenseitiger Watcher als Ersatz für ein Zustandsmodell.
- Listen mit stabilen IDs keyen, nicht mit Index bei umsortierbaren Ebenen/Slides.
- Bedienzustände für Laden, leer, Fehler, Konflikt, Speichern und fehlende Rechte ausdrücklich darstellen.
- `v-html` nur an einem zentral geprüften Rich-Text-Ausgabepunkt; keine beliebigen Importdaten direkt rendern.

### 12.2 Undo/Redo und Autosave

- Jede fachliche Bearbeitung läuft über eine dokumentierte Änderungsaktion. Direkte Mutation aus beliebigen Komponenten ist verboten.
- Ein Drag von Pointer-down bis Pointer-up erzeugt genau einen Historieneintrag. Abbruch stellt den Ausgangszustand wieder her.
- Auswahl, Zoom und Netzwerkfortschritt gehören nicht in die Dokumenthistorie.
- Eine neue Änderung nach Undo löscht den Redo-Zweig. Historie ist begrenzt und speichert keine unnötigen Binärdateien.
- Ein Autosave merkt sich die gesendete Dokumentversion. Kommt seine Antwort nach einer neueren Bearbeitung, darf diese Antwort den aktuellen Zustand nicht auf „alles gespeichert“ setzen.
- Speicheraufträge geordnet ausführen oder ausdrücklich versioniert koordinieren; keine rennenden Saves mit zufälliger Antwortreihenfolge.
- Servernormalisierung darf neuere lokale Änderungen nicht überschreiben. Konflikte erhalten die lokalen Daten und eine verständliche Wiederherstellungsoption.
- Lokale Wiederherstellung ist pro Site, Nutzer und Slider getrennt, begrenzt und nach erfolgreicher Sicherung bereinigt. Keine Nonces, Zugangsdaten oder vollständigen Medien in Local Storage speichern.

### 12.3 Cleanup und asynchrone Rennen

- Watcher, Timer, Observer, Eventlistener, Pointer-Capture und laufende Requests beim Wechsel/Unmount sauber auflösen.
- Bei wechselnder Auswahl/Familie darf eine verspätete alte Antwort nicht die neue Auswahl überschreiben. AbortController, Requestkennung oder Generation prüfen.
- Cleanup in `finally`, Watcher-Cleanup oder `onUnmounted` entsprechend der installierten Vue-Version; keine erst in neueren Versionen verfügbare API ungeprüft nutzen.
- Pointer-Events nutzen und `pointercancel` behandeln. Vertikales Scrollen auf Touchgeräten nicht pauschal verhindern.
- Beim Skalieren der Arbeitsfläche alle Eingaben in logische Dokumentkoordinaten zurückrechnen. Gerätepixel und CSS-Pixel nicht vermischen.
- Schriftmessungen nach lokalem Fontladen invalidieren. Fallback-Schrift darf nicht dauerhaft falsche Bounding Boxes im Dokument hinterlassen.

## 13. Runtime, Layout und Animation

- Die Runtime importiert keine Editor-/Vue-/Pinia-Pakete. Eine Importgrenzenprüfung oder ein Bundlereport MUSS dies absichern.
- `resolveLayout(document, containerWidth)` und Zeitplanfunktionen bleiben rein, deterministisch und unabhängig vom DOM.
- Keine zweite Vererbungslogik im Editor. Fehlendes Override ist Vererbung, nicht automatisch `0`, `null` oder leer.
- Containerbreite ist maßgeblich; globale `window.innerWidth`-Entscheidungen dürfen das Dokumentmodell nicht unterlaufen.
- Zeitbezug und Einheiten sind eindeutig. Millisekunden für Animationen, monotone Uhr für Laufzeitintervalle; keine unkontrollierte Mischung mit Unix-Zeit.
- Wiedergabe besitzt explizite Zustände und eine aktiv kontrollierte Transition. Timer-/Animationscallbacks tragen eine Generation, damit alte Callbacks nach Navigation ignoriert werden.
- Layouttranslation, Nutzerskalierung/-rotation und Animation konkurrieren nicht um dieselbe CSS-Transform-Eigenschaft. Wrapper-/Kompositionsvertrag zentral definieren.
- User-Pause hat Vorrang vor automatischem Resume. Sichtbarwerden allein darf einen manuell gestoppten Slider nicht neu starten.
- Reduced Motion wird vor Animationsstart ausgewertet und bei Änderung berücksichtigt. Inhalt muss ohne Animationsereignis sichtbar sein.
- Erstzustand und Platzreservierung serverseitig ausgeben. Kein unsichtbarer Hero bis zur fertigen JS-Hydrierung.
- Pro Instanz eigenständige IDs, Events, Observer und Controller. Wiederholte Einbindung eines Sliders darf keine ID-Kollision erzeugen.
- Eine Instanz hat einen nachvollziehbaren `destroy()`-Pfad; Listener, Animationen, Requests, Observer und Blob-URLs freigeben.
- Performancekritisch: DOM lesen und schreiben bündeln, ResizeObserver-Schleifen vermeiden, pro Frame keine umfassende Dokumentserialisierung.
- Echte `transform`-/`opacity`-Animation bevorzugen. Keine pauschale GPU-Promotion oder unbeschränktes `will-change` auf sämtlichen Ebenen.
- Lazy Loading für spätere Slides, nicht blind für das sichtbare Startbild. Ressourcenpriorität ist pro Seite zu beurteilen.

## 14. CSS, Barrierefreiheit und Übersetzungen

### 14.1 Styles

- Frontend-CSS beginnt unter `.sws-slider`; Admin-CSS unter dem eigenen Editor-Root. Keine globalen Regeln für `button`, `img`, `h2`, `body` oder `.active`.
- Vue scoped Styles allein schützen globale Portals/Overlays nicht. Deren Zielcontainer und Klassen ausdrücklich festlegen.
- Gemeinsame Design-Tokens für Abstände, Farben, Ebenen und Fokus. Keine verstreuten `z-index: 999999`-Reparaturen.
- Validierte dynamische Werte über eigene Custom Properties oder erzeugte Styles ausgeben. Keine unkontrollierten Styleblöcke aus Dokumenttext.
- Eigenschaften möglichst logisch formulieren, beispielsweise `margin-inline-start`, wenn dies zum Layoutvertrag passt.
- Keine pauschalen `!important`-Regeln oder globalen Theme-Resets. Ein unvermeidbarer lokaler Konfliktfix braucht Begründung und Regressionstest.
- Admin- und Frontend-Styles separat bündeln. Die Website lädt keine Editor-Icons oder Framework-Styles für die Bearbeitung.

### 14.2 Zugänglichkeit

- Native Buttons und Links benutzen, keine klickbaren Divs als Standard.
- Jedes Eingabefeld hat eine programmatisch zugeordnete Bezeichnung. Icon-Buttons brauchen einen verständlichen Namen.
- Drag-and-drop-Funktionen benötigen eine Tastatur-/Eigenschaftenalternative. Visuelle Auswahl darf nicht allein durch Farbe vermittelt werden.
- Dialoge behandeln Initialfokus, Fokusbegrenzung, Escape soweit sinnvoll und Rückkehr zum auslösenden Element.
- Slider-interne Pfeiltasten dürfen keine Texteingaben oder normale Seitennavigation außerhalb des Sliders übernehmen.
- Inaktive Slides aus Fokusreihenfolge und Accessibility Tree entfernen; `aria-hidden` allein deaktiviert keine Links.
- Statusmeldungen zurückhaltend ankündigen. Nicht bei jedem Animationsframe oder Polling-Tick einen Screenreader aktualisieren.
- Fokusdarstellung, Kontrast, Textvergrößerung und reduzierte Bewegung praktisch prüfen. ARIA korrigiert keine unpassende Grundsemantik.

### 14.3 Internationalisierung

- Codebezeichner, technische Kommentare und API-Dokumentation auf Englisch; dieses Richtliniendokument bleibt deutsch.
- Benutzerseitige PHP-Strings mit WordPress-i18n und fester Textdomain `sw-sliderman`; keine dynamisch gebauten Übersetzungsschlüssel.
- Ganze Sätze übersetzen, nicht Fragmente zusammenkleben. Pluralformen korrekt modellieren, Platzhalter bei Bedarf nummerieren und Übersetzerkommentare ergänzen.
- JavaScript verwendet `@wordpress/i18n` mit eingerichtetem Übersetzungsbuild und Script-Translations. Notwendige Pakete werden WordPress-konform bereitgestellt.
- Übersetzen und Escapen sind verschiedene Schritte. Übersetzte Strings enthalten keine ungeprüften HTML-/URL-Fragmente.
- Datum/Zahlen nach WordPress-/Benutzer-Locale formatieren; gespeicherte Zeitpunkte eindeutig in UTC. Animationszeiten sind Dauern, keine lokalisierbaren Zeitstempel.

## 15. Abhängigkeiten, Build und Distribution

- Laufzeitabhängigkeiten begründen: benötigte Funktion, Größe, Lizenz, Wartbarkeit, unterstützte Browser/PHP-Versionen und Kollisionsrisiko.
- Keine neue Library für eine triviale Hilfsfunktion. Umgekehrt keine selbst entwickelte ZIP-, Sanitizing- oder Kryptobibliothek aus vermeintlicher Unabhängigkeit.
- Composer- und npm-Lockfiles einchecken. Reproduzierbarer Build über festgelegte Skripte, nicht die lokale globale Werkzeugversion voraussetzen.
- Produktionshosting benötigt weder Composer noch Node, Python oder einen externen Font-Konverter.
- Gebündelte PHP-Abhängigkeiten auf Konflikte mit anderen Plugins prüfen. Falls Präfixierung etwa mit Mozart eingesetzt wird: Autoloading, Reflection, Callables, Ressourcenpfade und Lizenzdateien im gebauten Paket testen. Keine Composer-Metadaten oder Fremdquellen manuell nachbearbeiten.
- Gutenberg-Abhängigkeiten korrekt externalisieren. Eine Vue-Editorabhängigkeit darf nicht durch einen gemeinsamen Barrel-Export in die Runtime geraten.
- Buildmanifest ist maßgeblich für gehashte Assets und WordPress-Abhängigkeiten. Keine geratenen Bundle-Dateinamen.
- Keine CDN-Imports, Online-Icons oder Remote-Fonts für Standardfunktionen. Keine nachgeladenen ausführbaren Fremdmodule.
- Paket enthält Laufzeitcode, gebaute Assets, Übersetzungen und erforderliche Lizenztexte; keine Testzugangsdaten, privaten Sourcemaps, Entwicklungsserver-URLs oder `node_modules`.
- Pluginheader, Paketversion, Changelog und dokumentierte Schema-/Migrationsversionen konsistent halten. Nicht alle Versionsnummern müssen identisch sein; ihre Bedeutung muss eindeutig sein.

## 16. Tests und Qualitätssicherung

### 16.1 Werkzeuge

- PHP_CodeSniffer mit `wp-coding-standards/wpcs` und dokumentierten PSR-4-/Strict-Types-Ausnahmen.
- PHPStan mit passender WordPress-Typunterstützung; Ziel für neue eigene PHP-Quellen mindestens Level 8. Abweichende Startlage ausdrücklich dokumentieren, keine neue Baseline zur Tarnung neuer Fehler.
- PHPCompatibilityWP auf den tatsächlichen unterstützten PHP-Bereich konfigurieren; keine ungetestete offene Versionsspanne als Kompatibilitätsbeweis ausgeben.
- PHPUnit für reine Regeln und WordPress-Integrationstests für die tatsächlichen API-Eigenheiten.
- ESLint, Prettier, TypeScript und `vue-tsc`; Unitwerkzeug etwa Vitest, Browser-E2E etwa Playwright nach Projektentscheidung.
- Abhängigkeitsprüfungen mit Composer/npm. Befunde nach tatsächlicher Betroffenheit bewerten und beheben oder mit nachvollziehbarer Begründung behandeln.

Konkrete Sniff-Namen und Konfigurationen MÜSSEN mit den installierten Werkzeugversionen geprüft werden. Diese Datei liefert Regeln, keinen Nachweis, dass eine noch nicht angelegte CI bereits funktioniert.

### 16.2 Welche Tests erforderlich sind

Tests prüfen beobachtbares Verhalten und wichtige Fehlerfälle. Keine pauschale Pflicht zu einem neuen Test für jede triviale oder rein visuelle Änderung. Für Datenverlust, Rechte, Import, Fontdownload und veröffentlichte Zustände sind relevante Regressionstests Pflicht.

| Bereich | Mindestnachweise |
| --- | --- |
| Dokument/Schema | Gültig/ungültig, doppelte IDs, fehlende Ressourcen, neuere Schema-Version |
| Layout | Breakpointgrenzen, Vererbung, Reset, Containerresize, gezoomte Koordinaten |
| Historie/Autosave | Ein Drag/ein Undo, Redo-Verzweigung, verspätete Save-Antwort, Konflikt |
| WordPress-Speicherung | Quotes, Backslashes, Unicode, HTML-ähnliche Texte, verschiedene Rollen |
| Veröffentlichung | Fehlende Ressource, Crash/Teilzustand, zwei konkurrierende Publish-Aufträge |
| Fonts | Offline, Redirect-Angriff, falsche Binärdaten, fehlende Lizenz, parallele Installation |
| Archivimport | Traversal, Duplikate, Größenlimits, Abbruch, Remapping und portabler Roundtrip |
| Runtime | Schnelles Navigieren, alte Callbacks, doppelte Einbindung, Cleanup, Reduced Motion |
| Sicherheit | Objektfremder Zugriff, CSRF-Kontext, XSS in allen Ausgabepfaden, private Vorschau |

Reine Tests nutzen kontrollierbare Uhr, IDs und Providerfixtures. Keine echten Netzwerkdienste als Voraussetzung einer Unit-Testsuite. Reale Providerchecks separat und ausdrücklich ausführen.

Visuelle Vergleiche verwenden festgelegte lokale Fonts und warten auf deren Laden. Animationen zu festen Zeitpunkten anhalten. Keine willkürlichen langen Sleeps als Ersatz für erkennbare Zustandsbedingungen.

Browser-E2E deckt mindestens einen vollständigen Ablauf ab: Slider erstellen → lokale Schrift verwenden → mobil anpassen → speichern → veröffentlichen → über Block/Shortcode anzeigen → exportieren/importieren. Stefans praktische Machbarkeits- und Gestaltungsabnahme bleibt zusätzlich erforderlich.

### 16.3 Lint-Ausnahmen

- Keine projektweite Abschaltung von Security-, Nonce-, Escaping- oder Prepared-SQL-Prüfungen.
- Eine bekannte sichere Renderer-Ausgabe oder ein begründeter eigener Serializer erhält eine punktuelle Ausnahme mit Regelcode und Verweis auf den geprüften Vertrag.
- Keine `eslint-disable`-Dateiköpfe oder breiten PHPStan-Ignores zur Beschleunigung eines Features.
- Suppressions bei geänderter Implementierung erneut bewerten. Veraltete Ausnahmen entfernen.

## 17. Logging und Diagnose

- Strukturierte Events mit Ereigniscode, Schwere, Site-ID, Slider-/Job-ID, sicherem Fehlerkontext und Korrelationskennung.
- PSR-3-kompatibler Logger über Injektion; Domain selbst braucht nicht automatisch einen Logger.
- Keine Cookies, Nonces, Tokens, vollständigen Slidertexte, Archivrohdateien oder ungefilterten Remoteantworten loggen.
- Normale Validierungsfehler nicht als Servercrash protokollieren. Wiederholte Folgefehler zusammenfassen.
- Dateipfade und URLs nur soweit nötig und gegebenenfalls redigiert; Querystrings können sensible Daten enthalten.
- Keine dauernde Frame-/Pointer-/Polling-Protokollierung im Produktivbetrieb. Aufbewahrung, maximale Größe und Logzugriff definieren.
- Diagnose darf klar sagen, dass ein Font fehlt oder eine Veröffentlichung scheiterte, ohne Besucher mit Stacktraces zu konfrontieren.

## 18. Dokumentation, Änderungen und Reviews

- Öffentliche Klassen, Methoden, Hooks und Ports beschreiben Zweck, Parameter, Ergebnis, Seiteneffekte und relevante Fehler. PHPDoc ergänzt native Typen statt sie nur wortreich zu wiederholen.
- Kurze Zusammenfassungen beschreiben das Verhalten; zusätzliche Kommentare erklären nicht offensichtliche Entscheidungen und Randbedingungen.
- `@since` mit tatsächlicher Einführungsversion; nicht automatisch das aktuelle Release auf bestehende APIs schreiben.
- Neue sicherheits-/datenrelevante Entscheidungen als kurze ADR dokumentieren: Problem, gewählte Lösung, Alternativen und Konsequenzen.
- TODO-Kommentare brauchen eine konkrete Folgeaufgabe oder Milestone-ID. Sicherheitsprüfungen dürfen nicht als späteres TODO hinter einem fertigen Feature fehlen.
- Refactorings fachlich zusammenhängend halten. Keine großflächige Umformatierung fremder Bereiche im selben Fehlerfix.
- Keine spekulativen Fallbacks, die Defekte verstecken. Insbesondere kein automatischer Remote-Font, kein stilles Überschreiben bei Versionskonflikt und kein „Erfolg“ mit unvollständigem Import.
- Keine vorgezogene Umsetzung von M7–M9, solange ein 1.0-Feature lediglich eine klare Erweiterungsgrenze benötigt.

## 19. Verbindliche Abschlussprüfung pro Änderung

### Vor der Umsetzung

- [ ] Betroffene Produktregel, Datenvertrag und Modulgrenze gelesen.
- [ ] Bestehende Implementierung und Aufrufer verstanden; keine unnötige Parallelstruktur geplant.
- [ ] Erfolgsfall, Fehlerfall und gegebenenfalls konkurrierender Zugriff konkret benannt.

### Vor dem Abschluss

- [ ] Eingaben, Rechte und Ausgabekontexte geprüft.
- [ ] Änderungen an Dokumenten berücksichtigen Undo/Redo, Revisionen, Vorschau, Ausgabe und Import/Export.
- [ ] Asynchrone Vorgänge berücksichtigen Abbruch, verspätete Antworten und wiederholte Ausführung.
- [ ] Kein Editorcode in der Runtime und keine externen Fontanfragen eingeführt.
- [ ] Relevante Format-/Typ-/Analyseprüfungen und aussagekräftige Tests ausgeführt.
- [ ] Bei Änderungen an Assets/Abhängigkeiten das gebaute Pluginpaket geprüft.
- [ ] Migrationen, öffentliche Verträge und zugehörige Dokumentation aktualisiert.
- [ ] Nicht ausführbare Prüfungen und verbleibende Einschränkungen ausdrücklich genannt.
- [ ] Keine Behauptung praktischer Abnahme ohne tatsächliche Prüfung durch Stefan.

Eine Änderung ist erst abgeschlossen, wenn ihr Verhalten überprüfbar ist. Ein Lint-Erfolg beweist Stil; ein Typcheck beweist bestimmte Typannahmen; ein E2E-Test beweist seinen konkreten Ablauf. Keine dieser Prüfungen ersetzt automatisch die anderen.

## 20. Typische Fehlmuster und verbindliche Alternative

| Fehlmuster | Stattdessen |
| --- | --- |
| „Es ist im Admin, also sicher.“ | Capability, Objektzugriff und CSRF-Kontext prüfen. |
| „Der Client hat das JSON validiert.“ | Server validiert unabhängig nach demselben Schema. |
| „absint macht jede ID sicher.“ | Erwarteten Typ, Format und Bereich prüfen. |
| „REST-Daten immer unslashen.“ | Slashing je Eingang/API-Vertrag genau einmal behandeln. |
| „HTML-Escaping schützt auch CSS.“ | CSS-Werte typisieren und selbst serialisieren. |
| „Das letzte Save gewinnt.“ | erwartete Version atomar prüfen, Konflikt erhalten. |
| „Der Request ist abgebrochen, also wurde nichts gespeichert.“ | Ergebnis bei unklarem Ausgang abfragen. |
| „Die Live-Datei kurz überschreiben.“ | Neues Artefakt fertigstellen, aktive Referenz wechseln. |
| „Ein Hash bedeutet vertrauenswürdig.“ | Herkunft/Rechte und Dateiinhalte zusätzlich prüfen. |
| „Font fehlt: direkt Google nutzen.“ | Lokaler/System-Fallback und Diagnose. |
| „Ein Watcher speichert jede Mausbewegung.“ | Bearbeitungsaktion bündeln, Historie und Autosave koordinieren. |
| „setTimeout läuft irgendwann schon richtig.“ | Lebenszyklus, Generation und explizite Abspieluhr verwenden. |
| „aria-hidden entfernt alle Tastaturziele.“ | Fokusfähigkeit und Sichtbarkeit gemeinsam kontrollieren. |
| „Mehr Interfaces ergeben bessere Architektur.“ | Schnittstellen an echten Grenzen, direkte einfache Logik im Inneren. |

## 21. Referenzen und Reichweite

Die offiziellen Dokumente wurden zur Erstellung am 29.10.2026 geprüft. Sie belegen ihre jeweiligen APIs und Standards. Die Architektur-, Grenz- und Invariantenregeln dieses Dokuments sind zusätzliche Projektentscheidungen. Dies ist keine Zertifizierung durch WordPress und keine Zusage einer späteren Verzeichnisfreigabe.

- [WordPress PHP Coding Standards](https://developer.wordpress.org/coding-standards/wordpress-coding-standards/php/)
- [WordPress PHP Documentation Standards](https://developer.wordpress.org/coding-standards/inline-documentation-standards/php/)
- [WordPress: Escaping Data](https://developer.wordpress.org/apis/security/escaping/)
- [WordPress: Häufige Plugin-Review-Probleme](https://developer.wordpress.org/plugins/wordpress-org/common-issues/)
- [WordPress REST: Eigene Endpunkte](https://developer.wordpress.org/rest-api/extending-the-rest-api/adding-custom-endpoints/)
- [WordPress: wp_insert_post](https://developer.wordpress.org/reference/functions/wp_insert_post/)
- [WordPress: wp_slash](https://developer.wordpress.org/reference/functions/wp_slash/)
- [WordPress: update_post_meta und Slashing](https://developer.wordpress.org/reference/functions/update_post_meta/)
- [WordPress: block.json](https://developer.wordpress.org/block-editor/reference-guides/block-api/block-metadata/)
- [WordPressCS](https://github.com/WordPress/WordPress-Coding-Standards)
- [Vue: Watchers und Cleanup](https://vuejs.org/guide/essentials/watchers.html)
- [TypeScript: strict](https://www.typescriptlang.org/tsconfig/strict.html)

**Anweisung an Coding-Agenten:** Wende diese Regeln auf die konkrete Änderung an. Erzeuge einfache, explizite und überprüfbare Lösungen innerhalb des aktuellen Milestones. Schließe keinen Task aufgrund einer vermuteten Funktion und verschweige keine nicht ausgeführte Prüfung.

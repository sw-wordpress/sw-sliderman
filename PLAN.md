# PLAN.md – WordPress Layer Slider

Stand: 29.10.2026 · Konzeptversion: 1.0 · Status: Implementierungsgrundlage

## 1. Ziel und Verbindlichkeit

Entwickelt wird ein eigenständiges WordPress-Plugin für responsive Slider, animierte Hero-Bereiche und später frei gestaltbare Szenen. Ein visueller Editor ermöglicht die Gestaltung ohne Programmierkenntnisse. Funktionale Orientierung ist die Produktkategorie von Slider Revolution; eine vollständige Funktionsgleichheit ist kein Abnahmekriterium. Oberfläche, Code, Vorlagen und Assets werden eigenständig entwickelt.

Arbeitstitel: **SW Sliderman**, vorgeschlagener Slug `sw-sliderman`, PHP-Namespace `SW\\Slider`, Textdomain `sw-sliderman`. Diese Namen sind vor dem ersten Release auf Verfügbarkeit zu prüfen und bis dahin Platzhalter.

Dieses Dokument beschreibt Produkt, Architektur und verbindliches Verhalten. [TODO.md](TODO.md) zerlegt die Umsetzung in überprüfbare Milestones. Dort bedeutet eine offene Checkbox immer eine noch nicht nachgewiesene Umsetzung. Erweiterungen sind ausdrücklich späteren Milestones zugeordnet. CODE-STYLE.md definiert Coding Richtlinien, welche einzuhalten sind.

**Rollen:** Der Implementierungsagent entwickelt und prüft technisch. Stefan führt die praktische Machbarkeitsprüfung durch und nimmt Bedienung, Gestaltung und Ergebnis ab. Dieses Konzept führt die Machbarkeitsprüfung nicht aus und setzt ihr Ergebnis nicht voraus. Nach M0 werden notwendige Architekturkorrekturen dokumentiert.

## 2. Produktumfang und Ausbaustufen

| Stufe | Enthalten | Grenze |
| --- | --- | --- |
| M0: Machbarkeit | Zwei Slides, Text/Bild/Button, Drag-and-drop, mobile Überschreibung, einfache Animation, lokal importierter Google Font, WordPress-Ausgabe | Prototyp, keine Produktreife |
| M1–M6: Version 1.0 | Solides Datenmodell, komfortabler Editor, responsive Layouts, lokale Font-Verwaltung, Animationen, Block/Shortcode, Revisionen, Vorlagen und Import/Export | Keine beliebigen Skripte oder komplexen Effektketten |
| M7: Animation Pro | Visuelle Zeitleiste, Keyframes, Gruppen, globale Ebenen, typisierte Aktionen | Eigener freizugebender Ausbau |
| M8: Inhalte und Medien | Dynamische WordPress-Inhalte, lokale Videos und variable Fonts | Kein vollständiger Page Builder |
| M9: Effekte und Erweiterbarkeit | Scroll-/Parallax-Effekte, zusätzliche Übergänge, dokumentierte Erweiterungspunkte | Einzelne Effekte nur mit Leistungs- und Bediennachweis |

Eine veröffentlichte Version 1.0 umfasst alle Pflichtpunkte M1–M6. Umfangreiche Spezialeffekte dürfen diese Version nicht verzögern. Bestehende Slider-Revolution-Projekte werden zunächst nicht importiert. Eine spätere Migration wäre ein eigenes Projekt mit Format- und Lizenzprüfung.

## 3. Grundsätze

- **Dokumentmodell vor Oberfläche:** Ein versioniertes, validierbares JSON-Dokument beschreibt den Slider vollständig.
- **Gemeinsame Layoutregeln:** Editorvorschau und Frontend benutzen denselben Resolver und dieselben Animationseinstellungen.
- **Lokale Ressourcen:** Plugin-Skripte, Styles, Vorlagen und Schriften werden mitgeliefert oder lokal installiert. Keine CDN-Abhängigkeit für die Laufzeit.
- **Zuverlässige Veröffentlichung:** Entwurf und veröffentlichter Stand bleiben getrennt; fehlerhafte Speicherung oder Kompilierung verändert keine Live-Ausgabe.
- **Responsive Bearbeitung:** Überschreibungen und Vererbung sind sichtbar, zurücksetzbar und vorhersehbar.
- **Zugängliche Ausgabe:** Statischer Inhalt ist ohne JavaScript lesbar; Bewegung kann reduziert oder pausiert werden.
- **Gezielte Erweiterung:** Jede neue Eigenschaft benötigt Datenvertrag, Validierung, Editor, Ausgabe, Export und Migrationsverhalten.

## 4. Bedienabläufe

### 4.1 Slider-Verwaltung

WordPress-Menü mit Slider-Liste, Suche, Status, Einbindecode, Änderungsdatum, Duplizieren, Export und Papierkorb. Ein neuer Slider beginnt leer oder aus einer lokalen Vorlage. Die Verwaltung unterscheidet unveröffentlicht, veröffentlicht mit unveränderten Daten und veröffentlicht mit neueren Entwurfsänderungen.

### 4.2 Visueller Editor

- Oben: Name, Speichernstatus, Undo/Redo, Vorschau, Veröffentlichen und Gerätevorschau.
- Links: Slide-Liste und Ebenenbaum, Hinzufügen, Umbenennen, Reihenfolge, Sperren und Ausblenden.
- Mitte: gezoomte Arbeitsfläche mit tatsächlichem Vorschaubreitenwert; Zoom ändert keine Dokumentkoordinaten.
- Rechts: Eigenschaften der Auswahl, Layout, Typografie, Medien, Animation und responsive Überschreibungen.
- Später unten: Zeitleiste auf Basis derselben Animationsdaten.

Erforderlich sind Auswahl, Mehrfachauswahl, Verschieben, Skalieren, Kopieren/Einfügen, Duplizieren, Löschen, Raster, Einrasten und Ausrichtungshilfen. Pfeiltasten verschieben, Shift vergrößert den Schritt. Tastaturkürzel greifen nicht beim Schreiben in Eingabefeldern. Eigenschaften sind auch numerisch bearbeitbar.

Eine Drag-Aktion ergibt einen Undo-Schritt. Auswahl und Zoom gehören zum UI-Zustand, nicht zum Slider-Dokument. Rückgängig/Wiederholen berücksichtigt responsive Änderungen. Beim Verlassen mit ungespeicherten Änderungen wird gewarnt.

### 4.3 Speichern und Zusammenarbeit

Explizites Speichern erzeugt einen serverseitigen Entwurfsstand; Autosave speichert nach kurzer Inaktivität, ohne zu veröffentlichen. Lokale Wiederherstellung ist ergänzend und wird nach erfolgreichem Speichern bereinigt. Bei mehreren Tabs wird ein lokaler Wiederherstellungsstand nicht still überschrieben.

Jeder Schreibzugriff enthält die zuletzt gelesene Versionsnummer. Bei Konflikt liefert die API HTTP 409; der Editor bietet Neuladen oder Export der eigenen Änderungen. Kein automatisches Zusammenführen und kein stilles Überschreiben. Eine WordPress-Bearbeitungssperre unterstützt diesen Ablauf, ersetzt aber die Versionsprüfung nicht.

Veröffentlichen validiert das gesamte Dokument und dessen Ressourcen, baut einen neuen Ausgabe-Stand und schaltet diesen erst nach Erfolg aktiv. Eine Vorschau darf Entwurfsdaten ausschließlich nach Berechtigungsprüfung ausliefern und erhält `no-store`.

## 5. Inhalte und Darstellung

### 5.1 Slider und Slides

Slider besitzen Namen, Slug, Layoutmodus, Breakpoints, Navigation, Wiedergabeverhalten und zugängliche Bezeichnung. Version 1.0 unterstützt Boxed und volle Containerbreite. Ein einzelner Slide funktioniert als statischer oder animierter Hero. Vollbildmodus ist optional nach M6 und muss mobile Browserleisten berücksichtigen.

Slides besitzen stabile IDs, Namen, Hintergrundfarbe/-bild, Bildausschnitt, optionale Überlagerung, Mindestlaufzeit und Übergang. Reihenfolge, Duplizieren und individuelle Laufzeit sind möglich. Ein slideweiter Link ist in 1.0 nicht vorgesehen, um verschachtelte Links mit Buttons zu vermeiden.

### 5.2 Ebenentypen

| Typ | Version 1.0 | Später |
| --- | --- | --- |
| Text | Begrenztes Rich Text: Absätze, Umbrüche, Fett, Kursiv, zugelassene Links; Überschriftentag explizit wählbar | Dynamische Bindung, zusätzliche Textanimationen |
| Bild | Mediathek, Alt-Text/dekorativ, Ausschnitt, Größe und Link | Weitere Masken |
| Button | Beschriftung, Link, Ziel, Fokus-/Hover-Zustand | Typisierte Aktionen |
| Form | Rechteck, Kreis, Farbe, Rahmen, Radius | Weiterer Formenkatalog |
| Gruppe | Im Modell reserviert; in 1.0 keine Verschachtelung | M7 mit Hierarchie und Gruppenanimation |
| Video | Noch kein Layer in 1.0 | M8 mit lokalem HTML5-Video und Poster |

Elemente bieten Position, Breite, Höhe, Rotation, Deckkraft, z-Reihenfolge, Innenabstand, Rahmen und Schatten. Größen und CSS-Werte werden über ein begrenztes typisiertes Schema zugelassen. Keine direkte HTML-, JavaScript-, PHP- oder beliebige CSS-Eingabe in Version 1.0. Keine ungeprüften SVG-Uploads; anfänglich nur bestehende WordPress-Bildformate gemäß Uploadkonfiguration.

### 5.3 Navigation und Wiedergabe

Pfeile, Punkte, konfigurierbare Beschriftungen, optional Fortschrittsanzeige, Schleife, manueller Start und Touch-Wischen. Autoplay ist standardmäßig aus. Wenn aktiviert: sichtbarer Pause-/Start-Schalter, Pause bei Hover, Fokus innerhalb des Sliders, verborgenem Tab und außerhalb des sichtbaren Bereichs. Ein vom Nutzer pausierter Slider startet nicht automatisch wieder.

Wischen unterscheidet vertikales Scrollen von horizontaler Navigation. Schnelle Navigation bricht alte Übergänge kontrolliert ab; ein dokumentierter Zustandsautomat verhindert überlappende Abläufe. Mehrere Slider auf einer Seite funktionieren unabhängig, auch bei mehrfacher Einbindung desselben Sliders.

## 6. Responsive Layoutmodell

Version 1.0 verwendet die **Breite des Slider-Containers**, nicht pauschal die Viewportbreite. Standardbereiche: Mobile unter 768 px, Tablet 768–1023 px, Desktop ab 1024 px. Werte sind pro Slider konfigurierbar, strikt aufsteigend und im Export enthalten. Die tatsächliche Breite und der aktive Bereich sind im Editor sichtbar.

Basiswerte gelten zunächst überall. Overrides werden eigenschaftsweise in Reihenfolge Desktop → Tablet → Mobile aufgelöst. Fehlend bedeutet erben; ein expliziter Wert ersetzt. `null` ist nur erlaubt, wenn die jeweilige Eigenschaft dies ausdrücklich definiert. „Zurücksetzen“ entfernt das Override. Verstecken einer Ebene pro Bereich verändert nicht deren Existenz im Dokument.

Jeder Bereich besitzt eine Entwurfsbreite und -höhe. Ebenen werden in logischen Pixeln auf dieser Bühne positioniert, mit Anker links/Mitte/rechts und oben/Mitte/unten. In 1.0 wird die aufgelöste Bühne proportional auf die Containerbreite skaliert; ihre Höhe ergibt sich aus dem Seitenverhältnis und reserviert vor dem Laden Platz. Mindest-/Maximalhöhe, freie Prozentkoordinaten oder automatisches Reflow werden nicht gleichzeitig als alternative Regeln eingeführt.

Damit mobile Texte nicht nur verkleinert werden, können Position, Breite, Schriftgröße und Bühnenhöhe im mobilen Bereich überschrieben werden. Der Editor muss mögliche Überläufe und kleine gerenderte Schriftgrößen anzeigen. Dieses feste Bühnenmodell ist eine bewusste 1.0-Entscheidung und kein Ersatz für Fließtextlayouts.

Der Layoutresolver erhält Dokument und Containerbreite und erzeugt identische effektive Werte für Vorschau und Laufzeit. ResizeObserver verarbeitet Containeränderungen gedrosselt. Verschieben und Skalieren im gezoomten Editor werden zurück in logische Koordinaten gerechnet. Rotation wird um einen expliziten Transformationsursprung angewandt.

M7 ergänzt Gruppen in lokalen Koordinaten. M8/M9 dürfen einen expliziten Flow-/Stack-Layouttyp ergänzen; bestehende Bühnenlayouts behalten ihr Verhalten.

## 7. Animationen und Zeitleiste

### 7.1 Version 1.0

Pro Ebene: Einblendung, sichtbare Phase und Ausblendung. Presets: Fade, Bewegung auf X/Y, Scale und kleine Rotation; Kombinationen über begrenzte Parameter. Werte: Start in Millisekunden, Dauer, Easing, Ausblendbeginn und Ausblenddauer. Keine beliebigen Codeausdrücke. Übergänge zunächst Cut, Fade und gerichtetes Slide.

Die Animationsuhr beginnt nach Aktivierung des Slides. Bild-/Font-Laden darf nicht unbegrenzt blockieren; nach definierter Wartefrist läuft ein lesbarer Fallback. Editor und Frontend benutzen denselben Zeitplan. Slide-Dauer ist mindestens das Ende aller verpflichtenden Animationen; der Editor korrigiert zu kurze Werte sichtbar. „Bis zum Slide-Ende sichtbar“ ist ein eigener Modus, kein magischer Zeitwert.

Layout, Benutzerrotation und Animation dürfen nicht dieselbe CSS-Transformation überschreiben. Dafür werden getrennte Wrapper oder ein eindeutig komponierter Transformationspfad eingesetzt. Für 1.0 sind CSS und Web Animations API vorgesehen; eine zusätzliche Engine benötigt eine begründete Entscheidung nach M0.

### 7.2 M7 und spätere Erweiterungen

Visuelle Tracks je Ebene, Abspielkopf, Scrubbing, Zoom, Verschieben/Skalieren von Clips, Keyframes für freigegebene Eigenschaften und kopierbare Presets. Scrubbing ist deterministisch: Zeitpunkt t liefert denselben Zustand ohne reale Wartezeit. Spätere Gruppentracks, wiederholte Animationen, globale Ebenen und Klickaktionen verwenden dieselbe Uhr.

Typisierte Aktionen können später zu Slide wechseln, pausieren, abspielen oder eine validierte URL öffnen. Scroll-/Pointer-Effekte sind ein separater Ausbau mit vereinbarter Komposition gegenüber zeitbasierten Animationen. Die Escape-Hatch „eigenes JavaScript“ ist nicht vorgesehen.

## 8. Google Fonts und lokale Schriftverwaltung – Pflichtumfang

### 8.1 Verbindlicher Vertrag

Google Fonts können im Backend gefunden, ausgewählt und **serverseitig lokal installiert** werden. Websitebesucher laden ausschließlich lokale Schriftdateien; auch der Editor zeigt Vorschauen ausschließlich aus installierten Dateien oder Systemschriften. Kein Browser-Request an Google, keine externen `@import`, Preconnects oder DNS-Prefetches aus diesem Plugin. Ein Downloadfehler aktiviert niemals einen externen Ersatz.

„Lokal“ bedeutet im Standardbetrieb dieselbe Website-Origin über den WordPress-Uploadbereich. Eine Offload-/CDN-Konfiguration darf Font-URLs nicht ungefragt auf fremde Origins umschreiben. Unterstützte Konfigurationen benötigen eine geprüfte lokale URL; andernfalls wird eine verständliche Diagnose ausgegeben. Fremde Themes oder Plugins werden dadurch nicht automatisch von externen Fonts befreit.

Die externe Verbindung des Servers ist eine explizite Verwaltungsaktion: Katalog aktualisieren, Schrift installieren oder Update prüfen. Keine Downloads bei Seitenaufrufen und keine automatischen Verbindungen nach Aktivierung. Ein Offline-Modus sperrt ausgehende Font-Verbindungen; bestehende Fonts bleiben nutzbar. Lokal hochgeladene WOFF2-Dateien mit Lizenzangaben sind der alternative Importweg.

### 8.2 Katalog und Beschaffung

Ein versionierter lokaler Metadatenkatalog enthält Familien, Varianten, Zeichensätze, Herkunft und Lizenzzuordnung, aber keine vollständige Sammlung von Fontdateien. Nur installierte Schriften bekommen echte Schriftvorschauen; für weitere Familien werden Name und Metadaten gezeigt.

Ein Provider-Interface trennt Katalog, Variantenauflösung und Download. Die endgültige Beschaffungsroute wird in M0 als Architekturentscheidung festgehalten. Vorgesehen ist ein reproduzierbarer Build-Katalog aus offiziellen Google-Fonts-Metadaten mit Lizenzdateien und ein serverseitiger WOFF2-Resolver auf Basis der Google Fonts CSS2 API. Die CSS2-Antwort allein genügt nicht als Lizenznachweis. Nur eindeutig zugeordnete Familien werden angeboten.

Der Installer parst die benötigten `@font-face`-Deskriptoren über eine eingeschränkte Grammatik und übernimmt niemals fremdes CSS vollständig. Er lädt die passenden WOFF2-Dateien, erhält `unicode-range`, Gewicht und Stil und generiert neues lokales CSS. WOFF2-Unterstützung und stabile Auflösung werden im M0-Prototyp nachgewiesen; bei unzuverlässiger Route muss vor Produktfreigabe ein versionierter Anbieteradapter eingesetzt werden. Laufzeitkonvertierung von TTF nach WOFF2 auf dem WordPress-Server ist keine Voraussetzung.

Version 1.0 unterstützt statische Gewichte/Stile. Familien, die ausschließlich als variable WOFF2 auflösbar sind, werden zunächst als nicht unterstützt angezeigt. Variable Achsen und deren Editor folgen in M8. Dies darf nicht als Unterstützung sämtlicher Google-Fonts-Familien beworben werden.

### 8.3 Installation und Speicherung

1. Berechtigter Nutzer wählt Familie, verfügbare Gewichte, Stile und Subsets.
2. Server löst nur vom Provider erzeugte HTTPS-URLs auf; keine frei eingebbaren Remote-URLs.
3. Safe HTTP API mit Timeouts, Antwort-/Dateigrößenlimits und vollständiger Prüfung jedes Redirect-Ziels. Nur bekannte Hosts und Pfade; private, Loopback-, Link-local- und Metadatenziele werden abgelehnt.
4. Binärformat und Größe prüfen, kryptografischen Hash berechnen, temporär schreiben und atomar aktivieren. Schutz vor parallelen identischen Installationen.
5. Dateien unter `uploads/sw-sliderman/fonts/<content-hash>/` ablegen; Pfade serverseitig erzeugen. CSS enthält nur lokale URLs und einen internen, kollisionsarmen Familiennamen.
6. Registry schreibt Familienkennung, Variante, Subset, Hash, Quelldatenstand, Herkunft, Lizenztext/-kennung, Installationszeit und lokale Pfade. Nur vollständige Installationen werden als verfügbar markiert.
7. Schrift im Editor lokal laden; erst dann ist sie zuverlässig messbar. Abbruch oder Netzwerkfehler lässt eine vorhandene funktionierende Installation unangetastet.

Für Deutschland mindestens Latin und bei Bedarf Latin Extended; Testtext enthält ÄÖÜäöüß, €, Satzzeichen und kombinierte Zeichen. Weitere Schriften werden anhand ihrer tatsächlichen Abdeckung angeboten. Dynamischer Text darf nicht von einem auf einen bisherigen Beispielsatz reduzierten Font abhängen; `text=`-Subsetting mit Benutzerinhalten wird nicht eingesetzt.

### 8.4 Ausgabe, Lebenszyklus und Migration

- Standard `font-display: swap` und konfigurierbarer System-Fallback. Nur tatsächlich referenzierte Varianten ausgeben; Preload sparsam für sichtbare Startinhalte.
- Keine synthetische Fettschrift als stiller Ersatz für nicht installierte Gewichte. Fehlende Variante im Editor markieren; Veröffentlichung mit neuer fehlender Ressource ablehnen.
- Installierte Dateien werden dauerhaft referenziert, nicht wie ein beliebig löschbarer HTTP-Cache behandelt.
- Updates erfolgen ausdrücklich als neue Version; alte Slider behalten gepinnte Dateien bis zur bewussten Umstellung.
- Löschen erst nach Referenzprüfung über veröffentlichte Stände, Entwürfe, Vorlagen und erhaltene Revisionen; Wiederherstellung alter Stände darf keine Fonts verlieren.
- Export kann benötigte Fontdateien einschließlich Lizenzinformationen bündeln. Import remappt IDs, prüft Hashes und installiert lokal. Standardmäßig keine Nachinstallation aus dem Netz beim Import.
- Bei Domain-/Pfadwechsel werden URLs aus Upload-Basis und relativen Pfaden neu erzeugt, nicht aus gespeicherten absoluten Adressen übernommen.
- Nach Verlust einer Datei bleibt Text mit Systemschrift sichtbar; Diagnose und gezielte Wiederherstellung, kein externer Fallback.

Google erlaubt die Selbstbereitstellung der angebotenen Fonts unter deren jeweiligen Lizenzbedingungen. Der konkrete Lizenztext wird pro Familie aufbewahrt; eine allgemeine Lizenzannahme ersetzt dies nicht. Lokale Fonts allein sind keine Aussage über die gesamte Datenschutzkonformität einer Website.

## 9. Datenmodell und Persistenz

### 9.1 WordPress-Speicherung

Nicht öffentlich abfragbarer Custom Post Type `sw_slider` mit eigener Capability-Zuordnung, Titel, Status, Autor und Revisionen. Dokument-JSON wird kanonisch in `post_content` gespeichert, nicht zusätzlich in konkurrierenden Metafeldern. Dadurch enthalten Revisionen den tatsächlichen Dokumentstand. Eigene REST-Endpunkte kontrollieren Speicherung und Veröffentlichung; generische Schreibwege dürfen die Validierung nicht umgehen.

Entwurfsinhalt und veröffentlichter Snapshot sind getrennt. Eine Metareferenz zeigt auf das aktive veröffentlichte Artefakt. Dateiartefakte sind nach Inhalts-Hash unveränderlich; erst nach vollständiger Erstellung wird die Referenz gewechselt. Ein Snapshot enthält Dokumenthash, Schema-/Renderer-Version und Ressourcenmanifest. Rücknahme und Wiederveröffentlichung sind definierte Aktionen. Alte Artefakte werden mit konservativer Frist und Referenzprüfung bereinigt.

Fonts erhalten einen nicht öffentlichen Registrierungsdatensatz pro Installation, etwa über einen zweiten internen CPT und strukturierte Metadaten. Große Katalogdaten liegen als versionierte Dateien vor und nicht als autoloaded Option. Die genaue Implementierung bleibt austauschbar hinter einem Repository-Interface.

### 9.2 Dokumentvertrag

| Objekt | Wesentliche Felder |
| --- | --- |
| SliderDocument | `schemaVersion`, stabile UUID, `settings`, `breakpoints`, `slides`, `fontRefs` |
| Slide | UUID, Name, `enabled`, Hintergrund, Dauer, Übergang, `layers` |
| Layer | UUID, Typ, Inhalt, Layoutbasis, `overrides`, Stil, Animationsphasen |
| AssetRef | Dokumentlokale ID, Art, WordPress-Attachment-ID oder Font-Installation, relative Portabilitätsdaten |
| PublishedArtifact | Dokumenthash, Renderer-Version, Ressourcenmanifest, Erstellungsdatum |

UUIDs sind nicht mit WordPress-Post-IDs gleichzusetzen. Beim Duplizieren werden neue Dokument-, Slide- und Layer-IDs erzeugt; interne Referenzen werden remappt. Mehrfache Frontend-Einbindung bekommt zusätzlich eine Instanzkennung.

Beispielhafte Struktur, noch kein vollständiges JSON Schema:

```json
{
  "schemaVersion": 1,
  "id": "slider-demo",
  "settings": { "autoplay": false, "loop": true },
  "breakpoints": {
    "desktop": { "minWidth": 1024, "stageWidth": 1440, "stageHeight": 600 },
    "tablet": { "minWidth": 768, "stageWidth": 1024, "stageHeight": 560 },
    "mobile": { "minWidth": 0, "stageWidth": 390, "stageHeight": 520 }
  },
  "fontRefs": [{ "id": "font-heading", "installationId": "local-font-1", "weight": 700, "style": "normal" }],
  "slides": [{
    "id": "slide-one",
    "name": "Start",
    "enabled": true,
    "durationMs": 6000,
    "layers": [{
      "id": "headline",
      "type": "text",
      "content": { "text": "Willkommen", "tag": "h2" },
      "layout": { "x": 100, "y": 120, "width": 700, "height": 140, "anchorX": "left", "anchorY": "top" },
      "style": { "fontRef": "font-heading", "fontSize": 64 },
      "overrides": { "mobile": { "layout": { "x": 24, "y": 64, "width": 342 }, "style": { "fontSize": 34 } } },
      "animation": { "enter": { "preset": "fade", "startMs": 0, "durationMs": 500 }, "exitMode": "slide-end" }
    }]
  }]
}
```

Ein JSON Schema und passende TypeScript-Typen werden in M1 verbindlich. Der Server validiert unabhängig vom Browser, mit identischen Grenzen und gemeinsamer Konformitäts-Fixture-Sammlung. Unbekannte neuere Schemaversionen werden nicht verändert oder still herunterkonvertiert. Migrationen laufen schrittweise und erhalten einen wiederherstellbaren Ausgangsstand.

## 10. Technische Architektur

### 10.1 Stack und Module

Planungsbaseline: PHP 8.2+, WordPress 6.6+, Vue 3, TypeScript, Vite, Pinia; diese Mindestversionen sind Projektentscheidungen und vor Release anhand der dann unterstützten Sicherheitsstände zu aktualisieren. CI prüft festgelegte Mindestversion und aktuelle stabile WordPress-Version. Lockfiles werden eingecheckt; Abhängigkeiten erst bei Implementierung auf konkrete geprüfte Versionen festlegen.

Der Admin-Editor ist eine Vue-Anwendung. Das Frontend erhält eine eigenständige TypeScript-Laufzeit ohne Vue, Pinia oder Editorbibliotheken. Der Gutenberg-Block nutzt WordPress-Pakete und die von WordPress bereitgestellte React-Laufzeit, zeigt die Slider-Auswahl und verwendet denselben serverseitigen Renderer. Keine zweite React-Kopie bündeln.

Empfohlene Struktur:

```text
sw-sliderman/
  sw-sliderman.php
  src/{Domain,Application,Infrastructure,Rest,Admin,Rendering,Fonts,ImportExport}/
  assets/{editor,runtime,shared,block}/
  schemas/
  templates/
  languages/
  tests/{php,unit,e2e,fixtures}/
  build/
  uninstall.php
```

Geteilte TypeScript-Module enthalten Dokumenttypen, Layoutauflösung und Zeitplanberechnung. PHP übernimmt Persistenz, Berechtigungen, Ressourcen und sichere HTML-Ausgabe. Vertragstests vergleichen serverseitige Validierung mit Browser-Fixtures; PHP und TypeScript dürfen keine widersprüchlichen Defaultwerte entwickeln.

### 10.2 REST-Schnittstellen

Eigener Namespace `sw-sliderman/v1`. Routen für Liste/Anlegen, Lesen/Speichern, Revisionen, Vorschau, Veröffentlichen, Duplizieren, Import/Export sowie Font-Katalog, Installation, Status und Löschung. Alle verändernden Operationen prüfen Nonce bei Cookie-Authentifizierung und passende Capability. Objektbezogene Rechte und Leserechte für Entwürfe sind separat zu prüfen; ein Nonce ist keine Berechtigung.

Speichern erhält `expectedVersion`; Version und Dokument werden in einer serialisierten Schreiboperation aktualisiert. Veröffentlichen enthält die gewünschte Entwurfsversion. Import- und Font-Jobs liefern Fortschritt und wiederaufnehmbare Statusinformationen; lang laufende Schritte erfolgen in kleinen serverseitigen Jobs. Queue-Mechanismus wird in M1 festgelegt und darf keine zwingende Shell-, Python- oder Node-Installation auf dem Zielhosting benötigen.

Öffentliche Besucher benötigen keinen schreibbaren REST-Endpunkt. Veröffentlichte Inhalte werden serverseitig gerendert. Vorschauen sind kurzlebig und zugriffsgeschützt; keine ungeschützten Vorschau-URLs im Uploadverzeichnis.

## 11. Frontend, Ausgabe und Performance

Shortcode `[sw_slider id="123"]`, dynamischer Gutenberg-Block und PHP-Renderfunktion verwenden einen Renderer. Keine öffentliche Ausgabe von Entwürfen. Bei ungültiger ID oder fehlender Veröffentlichung erscheint für Besucher kein interner Fehler; berechtigte Nutzer erhalten einen Diagnosehinweis.

Die PHP-Ausgabe enthält semantischen Inhalt und notwendige Layout-Styles bereits vor JavaScript. Ohne JavaScript ist ein definierter erster aktiver Slide lesbar; weitere Slides können über eine zugängliche statische Ersatzdarstellung erreicht werden. Bei nur einem Slide entfallen unnötige Navigation und Timer.

Initialisierung liest ein minimales, sicher JSON-kodiertes Konfigurationsobjekt. Keine inline Eventhandler oder `eval`. Dokumentinhalte werden kontextgerecht escaped; öffentliche Konfiguration enthält keine Verwaltungsdaten. Script-/Style-Ausgabe erfolgt nur bei tatsächlicher Einbindung. Der Serverrenderer meldet benötigte Ressourcen; früh erkennbare Block-/Shortcode-Einbindungen können im Head vorbereitet werden, späte Template-Einbindungen erhalten einen funktionierenden Fallback. Nicht allein auf eine Suche in `post_content` vertrauen.

Artefakte werden pro Dokumenthash, Renderer-Version und Site erzeugt, nicht pro Besucher. Ressourcen-URLs werden zur Ausgabe aus lokalen Referenzen aufgelöst. Bei unverändertem Dokument wird nichts neu kompiliert. Pluginupdates invalidieren nur betroffene Renderer-Artefakte; Fallback ist eine sichere serverseitige Neuberechnung, keine leere Ausgabe.

Startbilder erhalten passende Größe, `srcset`, `sizes`, Breite/Höhe und nur bei tatsächlicher Eignung hohe Ladepriorität. Spätere Bilder laden verzögert. Kein verstecktes Lazy Loading des LCP-Bildes. Medien-/Font-Laden reserviert Platz; die erste Darstellung wartet nicht unbegrenzt auf Ressourcen. Animiert werden bevorzugt `transform` und `opacity`; Animationen stoppen bei unsichtbarem Dokument. Sliderweite Listener werden beim Entfernen sauber abgebaut.

Zielbudget für den Standardfall: Frontend-JavaScript höchstens 60 KiB gzip, CSS höchstens 25 KiB gzip, ohne Bilder/Fonts und ohne optionale spätere Effektmodule. Dieses Budget ist ein zu messendes Ziel, keine bereits nachgewiesene Eigenschaft. Referenzfall: drei Slides, je acht Ebenen, zwei Schriften mit insgesamt drei Varianten. M6 dokumentiert Messumgebung, Datenmenge, CPU-Drosselung, LCP/CLS und Beobachtungen beim Draggen und Abspielen.

## 12. Barrierefreiheit und Internationalisierung

Ziel ist eine am WCAG-2.2-AA-Niveau orientierte Ausgabe und Bedienung; eine Konformitätsbehauptung erfordert eigenständige Prüfung. Pause-Funktion, sichtbarer Fokus, verständliche Buttonnamen, Tastaturbedienung und ausreichende Touch-Ziele gehören zum Pflichtumfang.

Inaktive Slides sind für Fokus und assistive Technik verborgen; `aria-hidden` allein genügt für fokussierbare Inhalte nicht. Manuelle Wechsel werden sparsam angekündigt; Autoplay darf keine dauernden Live-Region-Ansagen auslösen. Bei Slide-Wechsel bleibt Fokus auf dem auslösenden Steuerelement. Ein Slide mit aktivem Fokus wird nicht automatisch gewechselt.

Bei `prefers-reduced-motion: reduce`: Autoplay aus, keine bewegten Übergänge oder Ebenenanimationen, sofort lesbarer Endzustand. Inhalt wird nicht von Animationsereignissen abhängig gemacht. Kontraste und sinnvolle Überschriften werden im Editor unterstützt, bleiben aber redaktionelle Aufgaben.

PHP und JavaScript verwenden WordPress-Übersetzungsmechanismen. Deutsch und Englisch sind vorgesehen; sichtbare Strings nicht hart kodieren. RTL, lange Übersetzungen und nicht lateinische Schriften werden in der Abnahme berücksichtigt.

## 13. Sicherheit und Betrieb

- Eigene Capabilities für Bearbeiten, Veröffentlichen, Importieren und Verwalten von Fonts. Nicht nur Administratorrollen vergleichen.
- Serverseitige Allowlist für Dokumentfelder, Rich Text, CSS-Werte, Linkprotokolle und Aktionen. `javascript:`-Links und ausführbare Inhalte sind verboten.
- Limits für Slides, Ebenen, Dokumentgröße, Verschachtelung, Jobs und Dateigrößen; Ausgangswerte in M1 definieren und Fehlermeldungen testen.
- Fontdownloads: SSRF-Schutz einschließlich Redirects, binärer Formatprüfung, Antwortgrößenbegrenzung und Locking.
- Import: Pfadnormalisierung, Schutz gegen ZIP Slip, Symlinks und ZIP Bombs, keine ausführbaren Dateien, keine absoluten Pfade. Dateien zunächst in nicht öffentlich ausgeliefertem Staging prüfen.
- Nicht verifizierte Rohimporte, private Entwürfe und Fehlerlogs dürfen nicht im öffentlichen Uploadbereich verfügbar sein. Öffentlich sind nur freigegebene Assets und veröffentlichte Artefakte.
- Keine zusätzlichen Schrift-MIME-Typen für sämtliche Mediathek-Uploads global freischalten; eigener abgesicherter Fontimport.
- Kein Telemetrieversand oder Lizenzserver für Kernfunktionen. Eigene Daten bleiben nach Deaktivierung erhalten; vollständiges Löschen nur per expliziter Option bei Deinstallation.
- Multisite: Fonts, Rechte und Pfade pro Site; netzwerkweite Freigaben sind kein Pflichtumfang. Wiederherstellung und Backup umfassen Datenbank und Uploaddateien.

## 14. Vorlagen, Import und Export

Vorlagen sind lokale, versionierte Slider-Dokumente mit Ressourcenmanifest und Lizenzangaben. Version 1.0 liefert mindestens drei eigene Beispiele: einfacher Bildslider, Text-/Button-Hero und Veranstaltungshinweis. Es gibt keinen notwendigen Online-Marktplatz.

Exportformat: ZIP mit `manifest.json`, `slider.json`, Medien, Fonts und Lizenzdateien. Das Manifest enthält Formatversion, minimale Schema-/Pluginversion, Liste der Dateien, Größen und Hashes. Optionaler Export ohne Binärdateien kennzeichnet fehlende Ressourcen ausdrücklich und ist nicht als vollständig portabel zu bezeichnen.

Import prüft vollständig, zeigt Zusammenfassung und Konflikte, remappt IDs und erstellt einen neuen unveröffentlichten Slider. Keine Überschreibung bestehender Slider ohne eigene spätere Funktion. Keine automatischen externen Downloads. Unvollständige Pakete benötigen Ressourcenzuordnung oder bleiben unveröffentlicht. Commit erfolgt erst nach erfolgreicher Prüfung und Dateiübernahme; Abbruch entfernt ausschließlich eigens angelegte temporäre Ressourcen.

## 15. Dynamische Inhalte und weitere Medien ab M8

Erster Datenanbieter: öffentlich lesbare WordPress-Beiträge mit Titel, Auszug, Beitragsbild, Datum und Permalink. Query-Einstellungen sind typisiert und beschränkt; keine freie SQL-, PHP-, Shortcode- oder Templateausführung. Ein Quellbeitrag kann einen Slide erzeugen. Quellenanzahl begrenzen und Ergebnisse cachen.

Dynamische Daten werden über einen separaten auflösbaren Inhaltssnapshot gerendert. Veröffentlichung des Layouts bleibt stabil; Inhaltsänderungen invalidieren nur den Inhaltscache. Keine privaten oder passwortgeschützten Beiträge ausliefern. Leere Felder, gelöschte Beiträge, Pagination, Zeitzone, manuelle Reihenfolge und Fontabdeckung benötigen definierte Fallbacks.

Lokale Videos unterstützen Poster, stummes Autoplay nur soweit vom Browser erlaubt, manuellen Start und Pause bei versteckten Slides. Die Ausgabe funktioniert auch bei verweigertem Autoplay. Audio startet nicht ungefragt. YouTube/Vimeo und andere Remote-Einbettungen sind kein Standardumfang und benötigen bei späterer Ergänzung ein eigenes bewusstes Lade-/Einwilligungskonzept.

## 16. Qualität, Abnahme und Release

M0 ist ein bewusster Prüfpunkt durch Stefan: Desktop/Mobil, echte Inhalte, eigene Fonts, zwei unabhängige Instanzen und reale WordPress-Einbindung. Erst nach dokumentiertem Ergebnis wird die Produktarchitektur festgeschrieben. Technische Arbeiten, die unabhängig vom Ergebnis sind, können vorbereitet werden.

Automatisiert prüfen: Dokumentvalidierung, Migrationen, Layoutvererbung, Zeitplan, Versionskonflikte, Berechtigungen, Veröffentlichung, Font-Installer und Archivimport. E2E prüft den vollständigen Ablauf vom neuen Slider bis zur Frontend-Ausgabe. Visuelle Referenzen werden mit festgelegten lokalen Schriften und nach abgeschlossenem Fontladen erzeugt.

Eine eigene isolierte Testseite zeichnet alle Browser-Requests auf: Editor und Frontend dürfen keine Fontanfragen an fremde Origins erzeugen. Zusätzlich wird nach Installation das ausgehende Servernetz gesperrt; Bearbeiten und Ausliefern vorhandener Slider müssen weiter funktionieren. Offline-Neuinstallation schlägt kontrolliert fehl. Dieser Test ist verbindlich, nicht nur eine Quelltextsuche nach Google-URLs.

Browsermatrix: aktuelle stabile Chrome, Firefox, Edge und Safari sowie iOS Safari und Android Chrome zum Releasezeitpunkt. WordPress-Matrix: festgelegte Mindestversion plus aktuelle stabile Version; PHP entsprechend. Ein klassisches Theme und ein Block-Theme sowie Seiten mit mehreren Slidern und Seiten ohne Slider werden geprüft. Erweiterte Browser-/Theme-Kompatibilität wird mit nachgewiesenen Grenzen dokumentiert.

Releases enthalten gebaute Assets, Übersetzungsdateien, notwendige PHP-Abhängigkeiten und Lizenzhinweise, aber keine Entwicklungswerkzeuge oder `node_modules`. CI prüft reproduzierbaren Build, PHP-Syntax/Standards, TypeScript, relevante Tests, Paketinhalt und dokumentierte Budgets. Veröffentlichung erfolgt erst nach praktischer Freigabe; die Konzeptbeauftragung ist keine Releasefreigabe.

## 17. Risiken und Entscheidungen

| Risiko | Umgang |
| --- | --- |
| Editor zeigt anderes Layout als Website | Gemeinsamer Resolver, identische Fonts und Renderer-CSS, Vergleichs-Fixtures |
| Umfang wächst Richtung Page Builder | 1.0-Grenzen halten, M7–M9 separat priorisieren |
| Schriftbeschaffung ist nicht reproduzierbar | Provider-Adapter und M0-Nachweis, gepinnte lokale Installation, Offline-Import |
| Veröffentlichung zerstört funktionierenden Slider | Immutable Artefakte und atomarer Wechsel, vorherigen Stand behalten |
| Layout ist auf Mobile schlecht lesbar | Gerätespezifische Bühne und Overrides, echte mobile Abnahme |
| KI erzeugt viele Funktionen ohne konsistentes Verhalten | Kleine Milestones, feste Datenverträge, vertikale Abnahmeszenarien |
| Effekte belasten Mobilgeräte | Optionale Module, Referenzmessung, reduzierte Bewegung, Performancebudget |

Vor M1 zu entscheiden: endgültiger Name, Font-Provider-Nachweis, Mindestversionen, Jobsystem, Bibliotheken für Drag/Resize und eventueller Animationseinsatz. Vorgaben dieses Plans gelten bis zu einer ausdrücklich dokumentierten Änderung. Offene Entscheidungen sind keine Einladung, still zusätzliche Produktfunktionen einzubauen.

## 18. Primärquellen und Einordnung

Technische Referenzen, geprüft am 29.10.2026; diese Quellen belegen einzelne Grundlagen, nicht die Umsetzung dieses Plans:

- [Google Fonts – Self Hosting](https://github.com/google/fonts#self-host-fonts-available-from-google-fonts): Selbstbereitstellung unter den jeweiligen Lizenzbedingungen.
- [Google Fonts CSS2 API](https://developers.google.com/fonts/docs/css2): Anforderung von Varianten und Achsen sowie Font-Display. Die lokale Installations- und Sicherheitsarchitektur dieses Plans ist unsere eigene Produktentscheidung.
- [WordPress REST API – Custom Endpoints](https://developer.wordpress.org/rest-api/extending-the-rest-api/adding-custom-endpoints/): Registrierung und Berechtigungsprüfung.
- [WordPress REST Revisions Controller](https://developer.wordpress.org/reference/classes/wp_rest_revisions_controller/): Revisionsschnittstellen für unterstützte Post Types. Die Trennung veröffentlichter Artefakte von Entwürfen muss das Plugin selbst implementieren.

# GPU-Effekte (M10)

Stand: Phase G0–G5 (Kern, Dokument/PHP, Browser-Plattform, Partikelmodul mit Bildrekonstruktion und Magnetfeld; der Editor folgt mit G6). Entscheidungen: [ADR 0005](adr/0005-gpu-effects.md). Fortschritt: [TODO.md](../TODO.md) (M10).

## Überblick

Ebenentyp `effect`: eine GPU-gerenderte Ebene mit eigenem Layout (auch 100 % × 100 %), Animation und statischem Fallbackbild. Effekte sind Module einer Registry; neue Module (auch aus anderen Plugins) benötigen keine Änderung am Kern.

```text
assets/gpu/core/      reines TS, kein DOM/GL (ESLint erzwingt das): Typen, Registry, Schema, RNG, Zeitschritt, Qualität, Transition
assets/gpu/device/    Capability-Prüfung, Backend-Interface, WebGL2 (G3)
assets/gpu/stage/     Canvas-Host, Scheduler, Observer, Kontextverlust (G3)
assets/gpu/modules/   particle-field (G4/G5), gradient-warp (G8)
```

## Kern (`@gpu/core`)

- **Schema-Dialekt** (`schema.ts`, `src/Domain/EffectSchema.php`): `type` (object, array, string, number, integer, boolean), `properties`, `required`, `items`, `minItems`/`maxItems`, `enum`, `const`, `minimum`/`maximum`, `minLength`/`maxLength`, `format` (`color`, `id`), `oneOf` + `discriminator`, Annotationen (`default`, `title`, `description`, `x-*`). Objekte sind immer geschlossen; unbekannte Schlüsselwörter im Schema sind ein Schemafehler. Berichtet werden `{path, code}` (`type`, `required`, `unknown_key`, `range`, `length`, `count`, `enum`, `pattern`) wie beim Dokumentvalidator. Gemeinsame Fixtures: `tests/fixtures/effects/schema.json`.
- **Registry** (`registry.ts`): Module oder Lader (`import()`) je Typ; Parameter werden vor `create` gegen das Modulschema geprüft, Ladefehler werden nicht zwischengespeichert.
- **Determinismus** (`rng.ts`): `hash32`/`unit`/`mulberry32`; die Hashfunktion ist für die GPU (GLSL) identisch implementierbar, Goldwerte im Test.
- **Zeit** (`timestep.ts`): fester Schritt 1/60 s, Akkumulator, Obergrenzen für Frame-Delta und Nachholschritte.
- **Qualität** (`quality.ts`): Stufen `low`…`ultra`, `auto` mit geglätteter Framezeit und Hysterese.
- **Übergänge** (`transition.ts`): Parameter blenden (Zahlen, Vektoren, Farben), diskrete Werte schalten bei 50 %.

## Dokument: Ebenentyp `effect`

```json
{ "type": "effect",
  "content": { "effect": "particle-field", "schemaVersion": 1, "seed": 7319, "quality": "auto",
               "params": { }, "preset": "orbital-mist", "alt": "", "fallbackImageId": 12,
               "assets": { "image": 12 } } }
```

Die Ebene erbt Layout (auch 100 % × 100 %), Z-Reihenfolge, Ein-/Austrittsanimation, Undo/Redo und Veröffentlichung. Validierung in `DocumentValidator.php` und `shared/validate.ts` (gemeinsame Fixtures `documents/valid/effect.json`, `effect-catalog.json`, Fälle in `invalid.json`):

- Hülle geschlossen; `params` höchstens 16 KiB und Verschachtelungstiefe 8; höchstens 4 Assets; höchstens 3 Effekt-Ebenen je Slide.
- `params` werden nur gegen das Schema geprüft, wenn der Typ registriert ist **und** `schemaVersion` der installierten Version entspricht. Unbekannte Typen (Add-on deaktiviert) und andere Versionen bleiben speicherbar (beschränkt) und zeigen nur das statische Fallback; das Modul migriert ältere Parameter zur Laufzeit.

## Ausgabe

`SliderRenderer` schreibt je Effekt-Ebene nur `<div class="sws-fx" data-sws-fx="typ">` mit dem Fallbackbild (`alt` aus dem Dokument). Die Runtime ergänzt später ein `aria-hidden`-Canvas. `sws-config` enthält `effects[]` (nur für registrierte Typen mit passender Version): `layerId`, `type`, `schemaVersion`, `seed`, `quality`, `continuous`, `module` (URL mit `?ver=`), `params`, `assets` (URL, Breite, Höhe der Größe `large`).

**Pause-Schalter:** Enthält ein aktivierter Slide einen Effekt mit `continuous: true`, erscheint der Pause-/Start-Schalter immer, auch ohne Autoplay und bei nur einem Slide (Pfeile/Punkte nur bei mehreren Slides).

**Bundle:** Die Plattform wird als `build/gpu/gpu.js` geliefert und ist nur auf Seiten mit registrierten Effekten eine Abhängigkeit des Runtime-Scripts; Version = Plugin-Version.

## Erweiterung durch andere Plugins

Ein Add-on registriert Effekte über den Filter `sws_register_effects` (Typ `vendor/name`):

```php
add_filter( 'sws_register_effects', static function ( array $effects ): array {
	$effects[] = array(
		'type'           => 'acme/glow',
		'label'          => 'Glow',
		'schema_version' => 1,
		'schema'         => array( 'type' => 'object', 'properties' => array(
			'strength' => array( 'type' => 'number', 'minimum' => 0, 'maximum' => 1, 'default' => 0.5 ),
		) ),
		'module_url'     => plugins_url( 'build/glow.js', __FILE__ ),
		'version'        => '1.0.0',
		'continuous'     => true, // Standard; false für endliche Effekte (kein Pause-Schalter)
	);
	return $effects;
} );
```

Regeln (`EffectRegistry`): gültige Typ-ID mit Vendor-Präfix (Kernmodule haben keinen Schrägstrich); Schema im geschlossenen, begrenzten Dialekt (`EffectSchema::check`); `module_url` auf derselben Herkunft unterhalb von `wp-content`, Endung `.js`/`.mjs`, ohne Query (die Version hängt das Plugin an); Duplikate und ungültige Einträge werden übersprungen und in `EffectRegistry::problems()` aufgeführt. Das Modul ist vertrauenswürdiger Plugin-Code; Dokumente speichern nur validierte Parameter, nie Code oder Shader. Das JS-Modul ist eine ES-Datei, deren Default-Export `(api) => EffectModule` ist (siehe „Modul-Vertrag“ unten).

## Tests und Nachweise (G1)

`tests/unit/gpu-core.test.ts` und `gpu-schema.test.ts` (Vitest), `tests/php/Unit/EffectSchemaTest.php` (PHPUnit), gemeinsame Fixtures `tests/fixtures/effects/schema.json` (31 Wertfälle, 19 Schemafehler). Coverage von `assets/gpu/core`: 97,7 % Zeilen. ESLint verbietet im Kern DOM, Uhren, `Math.random` und Importe aus Geräte-/Stage-/Modulschichten.

Schemaregeln, die Missbrauch begrenzen: Zahlen brauchen `minimum`/`maximum`, Strings `maxLength`, Arrays `maxItems`; Objekte sind geschlossen; `default`-Werte müssen selbst gültig sein.

## Nachweise (G2)

`tests/wp/tests/EffectLayerTest.php` (Registry inkl. abgelehnter Add-on-Deskriptoren, Validierung über den Service, Renderer, Pause-Schalter, Fallbackbild, Asset-Abhängigkeit), gemeinsame Dokument-Fixtures für PHP und TS, JSON Schema `schemas/slider-document.v1.schema.json` um die Ebene ergänzt. Der Editor kennt den Typ (Platzhalter, deutsche Texte); Anlegen und Bearbeiten folgen mit G6.

## Browser-Plattform (G3)

```text
Seite: gpu.js (klassisches Script, 8 KiB gzip) → window.swsGpu       Runtime: window.swsGpu?.mount(slider, effects[])
                                                                       SliderInstance → activate/deactivate(slide), setUserPaused, setReducedMotion
EffectController (je Slider)  ── EffectStage (je Effekt-Ebene) ── GpuDevice (WebGL2, ein Canvas) ── Effektmodul-Instanz
                                  gemeinsamer Scheduler (ein requestAnimationFrame für alle)
```

- **Lebenszyklus:** Eine Stage nutzt die GPU nur für den sichtbaren Slide. Beim Verlassen pausiert sie sofort, nach 10 s Leerlauf gibt sie Gerät und Kontext zurück; Wiederkehr erzeugt neu (das Modul bleibt geladen).
- **Pausegründe** (mehrere gleichzeitig): Pause-Schalter des Sliders, verborgener Tab, außerhalb des Viewports, Slide nicht sichtbar. Hover/Fokus pausieren Effekte nicht (sie sind interaktiv), nur Autoplay. Reduced Motion erzeugt nie ein Canvas.
- **Rückfall statt Fehler:** kein WebGL2, Modul lädt nicht/ist ungültig, ungültige Parameter, wiederholt fehlschlagende Wiederherstellung → statisches Fallbackbild (`data-sws-fx-state="fallback"`), Warnung in der Konsole, Slider läuft weiter. Ein fehlschlagender Effekt stoppt andere nicht.
- **Kontextverlust:** Canvas verbirgt sich (Fallback sichtbar), Wiederherstellung baut die Instanz aus derselben Konfiguration neu auf (höchstens zweimal in Folge).
- **Qualität:** `auto` senkt bei dauerhaft langsamen Frames stufenweise (DPR, Zahl, Trails/Glow, 30-Hz-Simulation) mit Hysterese; feste Stufen bleiben fest. Die DPR ist je Stufe begrenzt.
- **Zeiger:** Passive Listener am Slider, das Canvas hat `pointer-events: none`; Links und Buttons bleiben bedienbar, die Seite scrollt normal.
- **Ressourcen:** `GpuDevice.scope()` verfolgt Programme, Buffer, Texturen, Framebuffer; `dispose()` löscht alles und gibt den Kontext sofort zurück (`WEBGL_lose_context`).

### Modul-Vertrag

Eine Moduldatei exportiert `export default (api) => EffectModule`. `api.core` liefert Hash/RNG, Überblendung, Defaults und Validierung, sodass Module (auch aus Add-ons) keine Importe und keine Kopie des Kerns brauchen. `create(context, params)` bekommt `context.device` (`gl`, `scope()`), `quality`, `seed`, `assets.url(key)`; die Instanz implementiert `update(input, steps)` (nur Plain-Data, kein DOM), `render`, `resize`, `setQuality`, `setParams`, `handleEvent`, `captureState`, `transitionTo`, `dispose`. Eingebaute Module liegen in `assets/gpu/modules/<name>/`, werden einzeln als `build/gpu/<name>.js` gebaut (Budget je 25 KiB gzip) und von der Plattform erst bei Bedarf geladen.

## Nachweise (G3)

- `tests/unit/gpu-device.test.ts`, `gpu-stage.test.ts`, `gpu-controller.test.ts`, `gpu-entry.test.ts`, Runtime-Anbindung in `runtime.test.ts`; Coverage `gpu/device` 100 %, `gpu/stage` 98 %.
- `tests/e2e/gpu-platform.mjs` (echtes Chromium mit WebGL2/SwiftShader, 9 Prüfungen): echter Shader zeichnet; nur sichtbarer Slide läuft; Slide-Wechsel, Pause-Schalter ohne Autoplay, Start erst beim Einscrollen; Reduced Motion ohne GPU; Kontextverlust und Wiederherstellung; zwei unabhängige Mounts, Resize, Dispose ohne Canvas/Kontext/Frame-Schleife; Rückfälle ohne WebGL2, mit defektem Modul und ohne Bundle; 60 Bilder/s bei einem trivialen Effekt mit Software-Rendering. Aussagen zu realen GPUs und Mobilgeräten gibt es noch nicht (Benchmark-Protokoll in G7).

## Modul `particle-field` (G4)

Quelle für PHP, Editor und Modul ist `schemas/effects/particle-field.json` (Beschreibung, Schema, Presets); `EffectRegistry` prüft die Presets gegen das Schema und meldet ungültige.

**Simulation (GPU):** Position/Alter und Geschwindigkeit/Lebensdauer liegen in Ping-Pong-Buffern; ein Vertex-Shader aktualisiert sie per Transform Feedback (kein Readback, keine CPU-Arbeit pro Partikel). Gezeichnet wird instanziert aus denselben Buffern; additives oder normales Blending mit vormultipliziertem Alpha. Zufall kommt aus dem PCG-Hash von `(seed, index, stream, step)`, daher reproduzierbar und auf CPU und GPU identisch.

| Bereich | Umfang |
| --- | --- |
| Spawn | Punkt, Scheibe, Ring, Kugeloberfläche, Kugelvolumen, Quader, Linie; Startgeschwindigkeit keine/radial/tangential/zufällig |
| Lebenszyklus | dauerhaft oder Emitter (Wiedergeburt nach Lebensdauer) |
| Operatoren | `drag`, `spring-home`, `vortex`, `flow-field` (Curl-Noise), `gravity-wells` (bis 3, auch negative Masse), `speed-limit`, `bounds` (wrap/bounce/respawn); jeder Typ höchstens einmal, der letzte gewinnt |
| Erscheinungsbild | Weicher Kreis, Glow, Pixel; Größe min/max; Farbe fest/Geschwindigkeit/Lebensdauer/Palette/Bild; Tiefenausblendung |
| Kamera | perspektivisch/orthografisch, Orbit, Neigung |
| Interaktion | Zeiger: abstoßen, anziehen, wirbeln, Magnet (Ebene durch den Ursprung zur Kamera) |
| Ereignisse | `burst`/`strike` (abklingender radialer Impuls), `reset`; `transitionTo` blendet Parameter, Strukturänderungen (Zahl, Spawn, Lebenszyklus) bauen die Partikel neu auf, ohne Ressourcen zu verlieren |
| Qualität | Zahl der simulierten/gezeichneten Partikel je Stufe (25/50/100 %), DPR-Grenze, 30-Hz-Simulation auf `low` |

Presets: Orbitnebel, Wirbelbänder, Glutfunken, Strahlenimpuls (weitere folgen mit G5/G8). Der Build erzeugt je Modul `build/gpu/<name>.js` (`vite.gpu-modules.config.ts`, Budget 25 KiB gzip; `particle-field` 11 KiB).

**Leistungsregeln im Code:** Uniform-Werte (Operatoren, Farben, Palette) werden nur bei Parameteränderung berechnet, nicht pro Frame; Uniform-Orte sind gecacht; keine Allokation im Frame-Loop außer den Aufrufen der WebGL-API selbst.

## Nachweise (G4)

- `tests/unit/gpu-particles.test.ts` (31 Tests: Beschreibung/Presets, Spawn-Referenz, Uniforms, CPU-Integrator, Kamera, Instanzlogik gegen ein GL-Double). Coverage des Moduls 99 %.
- `tests/e2e/gpu-particles.mjs` (echtes WebGL2, 8 Prüfungen):
  - **GPU gegen CPU-Referenz** (Feder, Wirbel, Gravitation, Tempolimit, Drag, 90 Schritte): Abweichung Position 4·10⁻⁶, Geschwindigkeit 2·10⁻⁴.
  - **GLSL-Spawnformen gegen TypeScript** (alle 7, mehrere Generationen): Abweichung höchstens 3·10⁻⁴ (float32).
  - Gleicher Seed → identische Bewegung (auch mit GPU-Rauschen), anderer Seed → andere.
  - Extremwerte (Nullachse, fast singuläre Wells, Impuls 50, Wirbel ±20) bleiben endlich und innerhalb der Grenzen.
  - Alle Presets laufen, zeichnen sichtbar und bleiben endlich; Kamera zentriert; Qualitätsstufen skalieren die Zahl; der Zeiger stößt Partikel ab.
  - Übergänge, Neuaufbau ohne Leck, `dispose` gibt alle GPU-Objekte frei.
- **Durchsatz:** In dieser Umgebung gibt es nur Software-Rendering (CPU): 20.000 Partikel 0,39 s/Frame, 100.000 Partikel 2,0 s/Frame. Das sagt **nichts** über reale GPUs aus; die Messung auf echter Hardware und das Protokoll folgen in G7.

## Bildrekonstruktion und Magnetfeld (G5)

**Bild (`image.enabled`):** Das Bild der Ebene (Medium `image` unter „Medien“, gleiche Herkunft, höchstens 512 px Kantenlänge beim Abtasten) wird per `buildTargets` (rein, geseedet) in Zielpositionen und Farben übersetzt:

- Verteilung gleichmäßig oder nach Helligkeit (`luminance`, `inverse-luminance`); transparente Pixel erhalten nie Partikel.
- Farbe bilinear mit Alpha-Gewichtung (transparente Nachbarn dunkeln Kanten nicht ab); `colorBoost` mit Obergrenze 1; optional Tiefe (`depth`) aus der Helligkeit.
- `fit` (`contain`/`cover`) und `scale` beziehen sich auf den sichtbaren Bereich der Kamera und das Seitenverhältnis der Ebene bei der Erzeugung.
- `assemble: rest` startet fertig zusammengesetzt, `scatter` startet an der Spawnform und fügt sich per `spring-home` zusammen. `colorMode: image` färbt jeden Punkt mit seiner Pixelfarbe.
- Fehlt das Bild (kein Medium gewählt), läuft der Effekt ohne Motiv; ist es nicht lesbar (404, anderer Ursprung ohne CORS, kein Bild), schlägt die Erzeugung fehl und die Ebene zeigt das statische Fallbackbild.

**Magnet (`interaction.mode: magnet`):** Der Zeiger ist ein weich begrenzter Dipol, `B = (3(m·r̂)r̂ − m)/r³`. Die Achse `m` folgt der Zeigerbewegung (ruhender Zeiger behält die letzte Achse), schnelle Bewegung zieht stärker (`speedBoost`), `polarity` kehrt die Richtung um. Teilchen werden entlang gekrümmter Feldlinien aus dem Motiv gezogen und kehren per Feder zurück; die Wirkung bleibt innerhalb des Radius.

Presets `photo-grains` („Bildstaub“, scatter + Wirbel) und `magnetic-canvas` („Magnetfläche“, rest + Magnet).

### Nachweise (G5)

- `tests/unit/gpu-image.test.ts` (Sampling: Farben, leere Bereiche, Seed-Reproduzierbarkeit, contain/cover/scale, Helligkeitsgewichtung, Tiefe, vollständig transparentes Bild, Laden/Skalieren/Fehler) und neue Fälle in `gpu-particles.test.ts` (Zielpositionen, Magnetparameter).
- `tests/e2e/gpu-particles.mjs` mit echtem WebGL2: das Testbild (links rot, rechts blau, transparenter Streifen) ist erkennbar, der Streifen bleibt leer; verstreute Teilchen setzen sich zu dem Bild zusammen; der Magnet verschiebt Teilchen nahe dem Zeiger (> 40 % bewegt, Verschiebung > 0,15), entfernte Teilchen bleiben unverändert (0 von > 500), nach dem Verlassen kehren **alle** auf 0,03 genau zurück; nicht lesbares Bild lehnt die Erzeugung ab.

# GPU-Effekte (M10)

Stand: Phase G0–G2 (Kern und Dokument/PHP fertig; Browser-Plattform folgt mit G3). Entscheidungen: [ADR 0005](adr/0005-gpu-effects.md). Fortschritt: [TODO.md](../TODO.md) (M10).

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

**Bundle:** Der Kern wird als `build/gpu/gpu.js` geliefert (ab G3) und ist nur auf Seiten mit registrierten Effekten eine Abhängigkeit des Runtime-Scripts; Version = Plugin-Version.

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

Regeln (`EffectRegistry`): gültige Typ-ID mit Vendor-Präfix (Kernmodule haben keinen Schrägstrich); Schema im geschlossenen, begrenzten Dialekt (`EffectSchema::check`); `module_url` auf derselben Herkunft unterhalb von `wp-content`, Endung `.js`/`.mjs`, ohne Query (die Version hängt das Plugin an); Duplikate und ungültige Einträge werden übersprungen und in `EffectRegistry::problems()` aufgeführt. Das Modul ist vertrauenswürdiger Plugin-Code; Dokumente speichern nur validierte Parameter, nie Code oder Shader. Das JS-Modul exportiert ein `EffectModule` (siehe `@gpu/core`), das Laden folgt mit G3.

## Tests und Nachweise (G1)

`tests/unit/gpu-core.test.ts` und `gpu-schema.test.ts` (Vitest), `tests/php/Unit/EffectSchemaTest.php` (PHPUnit), gemeinsame Fixtures `tests/fixtures/effects/schema.json` (31 Wertfälle, 19 Schemafehler). Coverage von `assets/gpu/core`: 97,7 % Zeilen. ESLint verbietet im Kern DOM, Uhren, `Math.random` und Importe aus Geräte-/Stage-/Modulschichten.

Schemaregeln, die Missbrauch begrenzen: Zahlen brauchen `minimum`/`maximum`, Strings `maxLength`, Arrays `maxItems`; Objekte sind geschlossen; `default`-Werte müssen selbst gültig sein.

## Nachweise (G2)

`tests/wp/tests/EffectLayerTest.php` (Registry inkl. abgelehnter Add-on-Deskriptoren, Validierung über den Service, Renderer, Pause-Schalter, Fallbackbild, Asset-Abhängigkeit), gemeinsame Dokument-Fixtures für PHP und TS, JSON Schema `schemas/slider-document.v1.schema.json` um die Ebene ergänzt. Der Editor kennt den Typ (Platzhalter, deutsche Texte); Anlegen und Bearbeiten folgen mit G6.

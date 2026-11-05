# GPU-Effekte (M10)

Stand: Phase G0–G1 (Kern fertig). Entscheidungen: [ADR 0005](adr/0005-gpu-effects.md). Fortschritt: [TODO.md](../TODO.md) (M10).

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

## Erweiterung durch andere Plugins

Folgt mit G2 (PHP-Registry) und G3 (Laden des Moduls).

## Tests und Nachweise (G1)

`tests/unit/gpu-core.test.ts` und `gpu-schema.test.ts` (Vitest), `tests/php/Unit/EffectSchemaTest.php` (PHPUnit), gemeinsame Fixtures `tests/fixtures/effects/schema.json` (31 Wertfälle, 19 Schemafehler). Coverage von `assets/gpu/core`: 97,7 % Zeilen. ESLint verbietet im Kern DOM, Uhren, `Math.random` und Importe aus Geräte-/Stage-/Modulschichten.

Schemaregeln, die Missbrauch begrenzen: Zahlen brauchen `minimum`/`maximum`, Strings `maxLength`, Arrays `maxItems`; Objekte sind geschlossen; `default`-Werte müssen selbst gültig sein.

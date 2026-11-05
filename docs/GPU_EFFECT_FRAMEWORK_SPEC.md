# GPU-Effektframework – Spezifikation für einen AI Coding Harness

Version: 1.0 | Status: Implementierungsauftrag | Sprache der Benutzeroberfläche: Deutsch

## 1. Auftrag und Leitlinien

Implementiere eine unabhängig entwickelte, erweiterbare GPU-Effektplattform für interaktive Websites und visuelle Editoren. Das erste Modul ist eine 2D/3D-Partikelsimulation mit mehreren Bewegungsmodellen, Formen, Bildrekonstruktionen und resonanzartigen Formationen. Weitere GPU-Effektmodule (z. B. Verzerrungen, Licht, Fluid, Transitionen) müssen ohne Änderung des Runtime-Kerns ergänzt werden können.

**Unabhängigkeit:** Nutze eigene Modulnamen, IDs, Presets, Beispiele, Texte und Assets. Übernimm keinen fremden Quellcode, keine Shader, Originalgrafiken, Icons, Marken oder charakteristischen Produkt-/Presetnamen. Implementiere allgemein bekannte mathematische Verfahren eigenständig. Keine Referenz auf ein Vorbild im produktiven Code oder UI. Diese Vorgabe ersetzt keine urheber-/markenrechtliche Prüfung.

**Arbeitshaltung des Agenten:** Erst Bestand aufnehmen und Integrationspunkte prüfen; Architektur- und Implementierungsplan erstellen; anschließend in kleinen, getesteten Schritten implementieren. Bestehende Projektkonventionen beachten. Unklare physikalische Details als eigene Designentscheidungen dokumentieren, nicht als gesichertes Referenzverhalten ausgeben.

## 2. Funktionsumfang: erstes Effektmodul `particle-field`

Das Modul simuliert und rendert eine konfigurierbare Menge lebendiger Partikel in einem 3D-Raum, optional planar in 2D. Es trennt Emission, Kräfte, Bindungen, Formziele, Aussehen, Kamera und Interaktion. Kombinationen müssen möglich sein, etwa kugelförmige Emission + Wirbelkraft + Mausabstoßung + Tiefenausblendung.

### 2.1 Unabhängig benannte Effektfamilien und Look-Presets

 Sie müssen als JSON-Konfigurationen realisiert werden, nicht durch duplizierte Implementierungen.

| ID | Anzeigename | Sichtbares Verhalten | Technik | Abnahmeidee |
|---|---|---|---|---|
| `orbital-mist` | Orbitnebel | Weicher, rotierender Partikelschwarm mit sphärischer Silhouette | Kugelverteilung, tangentiale Geschwindigkeit, schwache Zentralbindung | Geschlossene 3D-Form bleibt erhalten |
| `radiant-pulse` | Strahlenimpuls | Plötzlicher radialer Ausstoß, danach Abbremsen und Sammeln | Impuls, Drag, Rückstellkraft | Reproduzierbares Pulsereignis |
| `ink-drift` | Tintenschleier | Langgezogene, sanft verwirbelte Fäden und Wolken | Curl-Noise/Flow-Field, Trail | Kontinuierliche Bewegung ohne abruptes Springen |
| `vortex-ribbons` | Wirbelbänder | Spiralförmige Strömungen um eine zentrale Achse | Zentripetal- und Tangentialkräfte | Stabile Bänder ohne unkontrollierte Explosion |
| `dual-stream` | Doppelstrom | Zwei entgegengesetzte Materialströme, die sich kreuzen | Zwei Emitter, gerichtetes Flow-Field | Zwei getrennte Emissionsbereiche |
| `solar-halo` | Lichthof | Helle, dichte Sphäre mit glühender Randzone | Kugel-Zielform, Glow, additive Mischung | Kern und Halo erkennbar |
| `chaotic-swarm` | Schwarmfeld | Zufällige, dennoch kohärente 3D-Bewegungen | Seeded Noise + Steering | Gleicher Seed reproduziert Bewegung |
| `linked-cloud` | Verbundwolke | Benachbarte Teilchen bewegen sich mit elastischer Kopplung | Abstandsbänder/Constraints | Verformbar, aber nicht sofort zerfallend |
| `crystal-bubbles` | Kristallblasen | Transparente, schwebende Kugelpartikel mit Tiefenwirkung | Instancing, Fresnel-/Soft-Disc-Material | Größenunterschiede und Tiefenstaffelung |
| `filament-spirit` | Fadenwesen | Filigrane, faserartige Bündel, die in Wellen treiben | Curl-Noise und Trail-Streifen | Lesbare, zusammenhängende Fäden |
| `photo-grains` | Bildstaub | Bild wird aus Tausenden farbigen Punkten aufgebaut | Pixel-/Luminanz-Sampling, Home-Position | Aus Ruheposition ist Motiv erkennbar |
| `magnetic-canvas` | Magnetfläche | Zeiger zieht Bildpartikel in bogenartigen Feldlinien aus dem Motiv; sie kehren zurück | Dipolfeld-Approximation, Dämpfung, Springs | Störung lokal, Rückkehr stabil |
| `iron-sweep` | Eisenstrom | Feine Körner folgen einem unsichtbaren Magnetfeld mit Bewegungsnachlauf | Feldlinien + geschwindigkeitsabhängiges Trail | Feldrichtung visuell nachvollziehbar |
| `harmonic-sheet` | Schwingfläche | Körner sammeln sich auf Knotenlinien eines 2D-Wellenfeldes | Stehende Wellen / Potentialgradient | Regelmäßige modale Linien entstehen |
| `harmonic-orb` | Schwingkugel | Partikel folgen einem räumlichen, periodischen Knotenfeld | 3D-Skalarfeld, Zielformgradient | Eindeutige räumliche Resonanzstruktur |
| `folded-harmonics` | Faltmuster | Symmetrische Muster falten/morphen kontinuierlich | Parametrisches Feld und Interpolation | Wechsel ohne Neuinitialisierung |
| `radial-mandala` | Strahlenornament | Symmetrische rotierende Ring- und Speichenmuster | Polarkoordinaten, Mode-Frequenz | Modenzahl verändert erkennbare Symmetrie |
| `binary-orbit` | Doppelumlauf | Zwei wechselwirkende Zentren mit umkreisenden Partikeln | Zwei Anziehungszentren + Drehimpuls | Keine instabilen Beschleunigungsspitzen |
| `ember-drift` | Glutfunken | Warme Partikel steigen mit Turbulenz auf und verlöschen | Emitter, Auftrieb, Alpha über Lebenszeit | Kontinuierliches Nachspawnen |
| `surface-dust` | Flächenstaub | Feines Partikelfeld wirkt wie bedrucktes Papier, dezent bewegt | Planarer Spawn, schwaches Noise | Flache Form ohne ungewollte 3D-Rotation |

Alle Presets besitzen individuelle Ausgangswerte, eine Kurzbeschreibung, ein Vorschau-Motiv und relevante UI-Parameter. Die konkrete visuelle Ausarbeitung erfolgt mit eigenen Beispieldaten. Eine Anzahl fremder Presets darf nicht als Abnahmekriterium verwendet werden.

### 2.2 Partikel und Darstellung

Jedes Partikel benötigt mindestens: `position.xyz`, `previousPosition.xyz`, `velocity.xyz`, `homePosition.xyz`, `color.rgba`, `size`, `age`, `lifetime`, `seed`, `flags`; optional `groupId` und `targetUV`.

Rendering-Stile: Pixelpunkt, weicher Kreis, runder Lichtkern, Glow-Sprite, Faser-/Streak-Segment, einfache instanzierte 3D-Kugel. Farbmodi: feste Farbe, Gradient nach Geschwindigkeit, Gradient nach Lebensdauer, Bildfarben, Zufallspalette, Mischung aus zwei Quellen. Blending: normal, additiv und screenähnlich, mit transparenter korrekter Premultiplication. Größenvariation mit min/max und Seed. Optional Bokeh und Nachleuchten; Tiefenattenuation und Tiefen-Fade. Shader unabhängig von Parameterlogik.

### 2.3 Spawn- und Zielformen

Spawnformen: Punkt, Rechteck/Fläche, Scheibe, Ring, Sphäre/Oberfläche, Kugelvolumen, Linie, Kegel, benutzerdefinierter Mesh-Sampler, Bildmaske. Parameter: Position XYZ, Rotation, Radius/Dimensionen, Dichte, Verteilung (uniform/gewichtete), Noise, Spiegelung, Emissionsrichtung, Burst/Rate. Trenne `spawnShape` strikt von `targetShape`: Ein Partikel kann etwa aus einem Ring starten und zu einem Bildpixel zurückkehren.

### 2.4 Physik / Verhaltensoperatoren

Kombinierbare Operatoren, jeweils mit `enabled`, `weight`, `priority`, schema-validierten Parametern:

1. `gravity-wells`: bis mindestens drei frei positionierbare Zentren, Masse positiv/negativ, animierbare XYZ-Position; weiche Distanzabnahme mit Epsilon gegen Singularitäten.
2. `flow-field`: deterministisches, zeitabhängiges 2D/3D-Curl-Noise-Feld; Frequenz, Amplitude, Geschwindigkeit und Richtung.
3. `vortex`: Rotation um beliebige Achse, radialer Pull, Wirbelstärke.
4. `spring-home`: Rückkehr zu Start- oder Bild-Zielposition mit `stiffness`, `damping`, `maxForce`.
5. `distance-bonds`: elastische Nachbarschaftsbindungen, Ruheabstand, Steifigkeit und Dämpfung; effiziente Nachbarschaftssuche.
6. `magnetic-dipole`: Zeigerposition als Dipol/Feldquelle, Radius, Feldstärke, Polarität, Push und Trail; numerisch begrenzen.
7. `resonance-field`: Ebene oder Volumen, modale Frequenzen, Morphing, Zoom, Wellenlänge, Amplitude, Dämpfung, Anregung.
8. `radial-impulse`: zeitlich begrenztes Explosions-/Implosionsereignis mit konfigurierbarer Kurve.
9. `drag-and-bounds`: Widerstand, Geschwindigkeitslimit und Randmodus (wrap/bounce/respawn/none).

Keiner der Operatoren darf den Integrationsloop selbst besitzen. Die Runtime akkumuliert Kräfte bzw. Zielkorrekturen, integriert deterministisch und rendert danach. Für Constraints ist eine dokumentierte Korrekturphase zulässig.

### 2.5 Resonanz-/Musterengine

Eigenständig implementierte stehende Wellen, keine übernommenen Shader. Für eine 2D-Demonstration etwa `f(x,y,t) = sin(nπx)sin(mπy) + a·sin(mπx)sin(nπy)`, erweitert um veränderliche Phasen, Dämpfung und Modenüberblendung. Partikel können über den Gradienten des Potentials zu |f|≈0-Knotenlinien wandern. Für ein Volumen ein eigenständiges, stetiges 3D-Skalarfeld mit drei Moden `(n,m,l)` definieren; numerische Gradienten nur wenn notwendig. Parameter: Topologie `plane|sphere|volume`, Moden, Wellenlänge, Morph, Zoom, Amplitude, Dämpfung, Anregungsrate, Deckkraft. Interaktionen: kontinuierliche Maus-Anregung, lokaler Schlagimpuls, Scroll-Modulation, optional zusätzliche Gravitation. `strike()` triggert ein gedämpftes Ereignis.

### 2.6 Bildrekonstruktion

Eingabe ist ein vom Anwender bereitgestelltes Foto oder eine eigene Beispielgrafik. Das Bild wird mit `cover`/`contain` in einen normalisierten Zielbereich eingepasst. Zielpositionen werden per gleichmäßiger oder luminanzgewichteter Auswahl erzeugt. RGBA wird bilinear abgetastet, Alpha respektiert, Farbwerte korrekt gemischt. Bildauflösung, Partikelzahl und Punktgrößen getrennt konfigurieren. Im Ruhezustand bleibt das Motiv erkennbar. Bei Zeigerbewegung werden Partikel lokal entlang einer magnetfeldähnlichen Bewegung gestört und kehren gedämpft zu ihrer persistenten `homePosition` zurück. Bei Bildwechsel Zielpositionen überblenden, nicht das System zwingend neu anlegen. CORS, ungültige Bilddaten und große Bilder sauber behandeln.

### 2.7 Kamera, Bühne und Interaktion

Kamera: orthografisch und perspektivisch, Position/Look-at, FOV/Zoom, Near/Far, Orbit, langsames Driften, Turntable, Kippen; automatische Zentrierung optional. Bühnenbereiche können relativ zu DOM-Layern positioniert werden, mit Clipping und `devicePixelRatio`-Anpassung. CSS-Pixel-Koordinaten korrekt in Ray-/World-Koordinaten transformieren. Eingaben: Pointer-Move, Pointer-Down, Drag, Touch, Scroll, Klick und programmatische Events. Mausverhalten: anziehen, abstoßen, Push/Pull, lokal verwirbeln, Orbit-Kamera; Radius, Intensität, Falloff, Sensitivität, Weichheit, Rückkehrgeschwindigkeit. Interaktion nur innerhalb des gewählten Bereiches oder global als Option; keine standardmäßige Blockade von Scroll oder Klick auf andere DOM-Elemente. `prefers-reduced-motion`, Tastatur- und Touch-Ersatz sinnvoll unterstützen.

### 2.8 Zustände und Übergänge

Persistente Simulationsidentität: Beim Wechsel eines Presets/Zustands bleiben Partikel-IDs und nach Möglichkeit Position/Geschwindigkeit erhalten. Für weiche Übergänge werden **Parameter, Zielfelder und Materialien** über eine Transition gemischt. Starke diskrete Änderungen (z. B. neue Partikelanzahl) über deterministische Ein-/Ausblendung und graduelle Reallokation. `saveState`, `transitionTo`, `pause`, `resume`, `reset`, `strike`, `emitBurst` müssen über API und Editor ausführbar sein. Transition über Zeit, Easing, Klick, Scroll-Fortschritt oder eigene Anwendungsaktion.

## 3. Gesamtarchitektur für zukünftige GPU-Effekte

### 3.1 Module

```text
packages/
  effect-core/           # Types, Registry, Lifecycle, Schemas, Timeline, Events
  effect-gpu/            # Backend-Abstraktion, Ressourcen, Shader-Tools, Render Graph
  effect-input/          # Pointer/Touch/Scroll/Resize Koordinatensystem
  effect-assets/         # Texturen, Bilder, Caching, Asset-Validation
  effect-presets/        # Versionsschemata, Migration, Import/Export
  effect-particle-field/ # erstes Effektmodul + GPU-Simulation + Presets
  effect-editor/         # dynamische Regler, Preset-Galerie, Live Preview
  effect-web/            # DOM-/Canvas-Integration und Public API
  effect-testkit/        # deterministische Tests, Visual Regression, Benchmarks
examples/
  standalone/
  layered-page/
  stress-test/
```

Keine WordPress-, Editor- oder Frameworkabhängigkeit im Core. Adapter können später Vue, React oder WordPress bedienen. Effektmodule dürfen andere Module nicht direkt importieren. Der Kern hält lediglich standardisierte Interfaces und verwaltet Instanzen.

### 3.2 Backendstrategie

WebGPU mit Compute Shadern ist der bevorzugte Simulationspfad für hohe Partikelzahlen. WebGL2 als Fallback mit Ping-Pong-Float-Texturen / Render-to-Texture bei unterstützten Extensions; benötigte Capabilities zur Laufzeit prüfen. Für schwächere Geräte optional CPU-Simulation (Web Worker soweit praktikabel) oder statisches Ersatzbild. Die Backend-Auswahl erfolgt zur Laufzeit nach Capabilities statt nach User-Agent. Ein fehlgeschlagener Backend-Start muss auf die nächste Stufe zurückfallen. WebGL1 nicht als verpflichtendes Ziel.

Rendering-API und Simulation-API getrennt halten: ein statischer Lichteffekt braucht keine Partikel-Compute-Pipeline. RenderGraph mit Render-Passes, FBO-/Texture-Pools und standardisierter Alpha-Komposition. Ressourcen nach `dispose()` restlos freigeben.

### 3.3 TypeScript-Kontrakte (Richtungsentwurf)

```ts
export type EffectConfig = {
  type: string;
  schemaVersion: number;
  seed?: number;
  enabled?: boolean;
  params: Record<string, unknown>;
};

export interface EffectModule<TParams = unknown> {
  readonly type: string;
  readonly version: string;
  readonly parameterSchema: unknown; // z.B. JSON Schema/Zod-kompatible Beschreibung
  create(ctx: EffectContext, params: TParams): Promise<EffectInstance<TParams>>;
}

export interface EffectInstance<TParams> {
  update(deltaSeconds: number, input: FrameInput): void;
  render(frame: RenderFrame): void;
  setParams(patch: Partial<TParams>): void;
  handleEvent(event: EffectEvent): void;
  captureState(): EffectState;
  transitionTo(state: EffectState, options: TransitionOptions): void;
  resize(width: number, height: number, pixelRatio: number): void;
  dispose(): void;
}

export interface EffectRegistry {
  register(module: EffectModule): void;
  create(config: EffectConfig, context: EffectContext): Promise<EffectInstance<unknown>>;
}
```

Die konkreten `EffectContext`-, `FrameInput`- und `RenderFrame`-Typen definieren ausschließlich dokumentierte, backendunabhängige Ressourcen- und Ereigniszugriffe. `update` darf nicht direkt auf DOM-Elemente zugreifen. Strikte Typisierung, keine versteckten globalen Singletons. Hinter `EffectContext` steckt eine Ressourcenverwaltung mit Ownership und Cleanup.

### 3.4 Presetbeispiel

```json
{
  "id": "orbital-mist-blue",
  "name": "Blauer Orbitnebel",
  "effect": "particle-field",
  "schemaVersion": 1,
  "seed": 7319,
  "params": {
    "count": 20000,
    "spawn": { "shape": "sphere-volume", "radius": 1.2 },
    "appearance": {
      "style": "soft-disc",
      "size": 2.4,
      "color": "#78B9FF",
      "blend": "additive",
      "depthFade": 0.35
    },
    "operators": [
      { "type": "spring-home", "weight": 0.25, "params": { "stiffness": 0.4, "damping": 0.3 } },
      { "type": "vortex", "weight": 0.8, "params": { "axis": [0, 1, 0], "strength": 0.65 } }
    ],
    "camera": { "projection": "perspective", "position": [0, 0, 5.5] },
    "interaction": { "mode": "repel", "radius": 0.5, "strength": 0.35 }
  }
}
```

Zahlenwerte sind **eigene Initialvorschläge**, keine aus einem Fremdprodukt übernommenen Parameter. Alle Felder werden gegen ein versioniertes Schema geprüft. Presets überschreiben nur deklarierte Werte; Unbekanntes erzeugt einen klaren Validierungsfehler.

## 4. Simulation und Stabilität

Zeitbasis in Sekunden, feste Simulationsschritte von vorzugsweise 1/60 s mit Akkumulator und Obergrenze für Nachholschritte. Rendering darf mit variabler FPS laufen. Kräfte/Drag müssen delta-time-korrekt implementiert werden, auch auf 120/144-Hz-Geräten. Bei Tab-Inaktivität Zeitdifferenzen kappen und sinnvoll pausieren. Pseudorandomness mit Seed. Positions-/Geschwindigkeitswerte auf NaN/Infinity prüfen; problematische Partikel gezielt zurücksetzen. Grenzwerte für Kraft, Geschwindigkeit, Partikelzahl und GPU-Memory. Datenlayout GPU-freundlich (SoA oder strukturierte Buffer je nach Backend). Vermeide CPU↔GPU-Readbacks pro Frame.

## 5. Editor und Bedienung

Eine unabhängige Oberfläche zur Effektwahl mit Suchfunktion, Kategorien, Vorschaubild/-animation, einmaligem Anwenden und Live Preview. Das Konfigurationspanel wird **aus dem Paramet schema generiert** (min/max, Einheit, Tooltip, Gruppierung, Abhängigkeiten, nur-lesbar). Gruppen: Partikel, Erscheinungsbild, Emission/Form, Bewegungsoperatoren, Resonanz, Bild, Kamera, Interaktion, Bühne/Performance. Editorfunktionen: Undo/Redo, Duplicate, Reset, Presets speichern/importieren/exportieren, Seed ändern, Zustand aufnehmen, Übergänge definieren. Konfigurationen sind vom Canvas unabhängig serialisierbar. Fehlerhafte Presets dürfen den Editor nicht abstürzen lassen.

## 6. Integration und API

```ts
const stage = await createEffectStage({
  element: document.getElementById('hero-effect')!,
  backend: 'auto',
  pixelRatio: 'adaptive',
});
const field = await stage.addEffect({
  type: 'particle-field',
  schemaVersion: 1,
  params: { /* validierte Konfiguration */ },
});
field.handleEvent({ type: 'burst', intensity: 0.8 });
stage.pause();
stage.resume();
stage.dispose();
```

`createEffectStage`, `addEffect`, `pause`, `resume`, `dispose` sind zu implementierende Public API, nicht bloß Pseudocode in Dokumentation. Mehrere Stages pro Seite und mehrere übereinandergelegte Effekte pro Stage unterstützen. Jeder Stage eigener Lifecycle; keine Listener-/Canvas-/GPU-Ressourcenlecks. ResizeObserver und IntersectionObserver verwenden, wo passend. Priorität: Canvas als dekorativer Layer ohne DOM-Blockade. Z-Index, Transparenz, Pointer-Events und Responsive-Verhalten kontrollierbar.

## 7. Performance und Progressive Enhancement

Qualitätsstufen `low`, `medium`, `high`, `ultra`, `auto`, jeweils in Preset-Overrides konfigurierbar. Adaptive Qualitätssteuerung anhand geglätteter Framezeit mit Hysterese: insbesondere Renderauflösung, Partikelzahl, Schatten/Glow/Trail und Simulationrate reduzieren. Bei Qualitätsänderung keine unkontrollierte komplette Neuinitialisierung. Targets als **Projektziele, nicht Zusagen**: auf definiertem Desktop-Testgerät 60 FPS bei 20.000 Standardpartikeln; auf definiertem Mobil-Testgerät 30 FPS bei 5.000 Standardpartikeln. Benötigtes Gerät und Browser im Benchmarkprotokoll festhalten. Ein GPU-Kontextverlust muss erkannt und Wiederherstellung versucht werden. `prefers-reduced-motion` reduziert Animation standardmäßig bis hin zu einer statischen Darstellung. Alle Eingabe-Assets lokal oder unter explizit erlaubten Origins beziehen.

## 8. Sicherheit, Robustheit und Barrierefreiheit

Keine Auswertung von Shader- oder JavaScript-Code aus untrusted Presets. Externe Shaderprogramme nur aus vertrauenswürdigen, statisch gebauten Modulen. JSON-Schema validieren, Größen/Counts/Datenformate begrenzen und mögliche GPU-DoS durch Extremparameter vermeiden. Bild-URLs/Uploads gemäß Hosting- und CORS-Regeln handhaben. UI mit Labels, Tastaturbedienung, klaren Fokuszuständen; dekorative Canvasflächen `aria-hidden` und ohne Tab-Fokus. Für entscheidungsrelevante Inhalte außerhalb der GPU-Darstellung zugängliche DOM-Alternative anbieten.

## 9. Testpflicht

Unit Tests: Schema-Validierung und Migration, seeded RNG, Operatoren, Zeitschritt, Transition, Bounds, Farb-/Bildsampling, Parameter-Patching, Fehlerbehandlung. Integrationstests: mehrere Stages, Modulregistrierung, Backend-Auswahl/Fallback, Start/Pause/Resize/Dispose, Kontextverlust, Preset-Import. Browser-Tests mit Playwright in einem reproduzierbaren Docker-Setup, mindestens Chromium; Testfälle für Interaktion und `prefers-reduced-motion`. Visual Regression mit festem Seed, festem Canvas, festen Timestamps; toleranzbasierter Pixelvergleich statt fragiler exakter GPU-Pixelgleichheit. GPU-Ressourcenlecks und FPS-/Speichernutzung separat messen. Bestehende Repository-Testregeln gelten zusätzlich; falls hier eine Codeabdeckung >80 % vorgeschrieben ist, muss sie für testbaren TypeScript-Code erreicht werden. Shader werden über visuelle und Integrations-Tests abgesichert.

## 10. Implementierungsphasen und Akzeptanz

### Phase A – Plattformgrundlage
- Monorepo/Package-Struktur, Runtime, Registry, Stage, Lifecycle, Paramet schema, Preset-System, Error Handling.
- Minimaler RenderGraph und WebGPU/WebGL2-Fähigkeitsprüfung; funktionierender erster GPU-Renderpfad und verlässlicher Fallback.
- **Abnahme:** zwei unabhängig instanziierte Effekte, korrektes Resize/Dispose und kein verbleibender Listener.

### Phase B – Partikelbasis
- GPU-Particle-Storage, Spawnformen, integrator, visuelle Stile, Farbmodus, Tiefenwirkung, Kamera.
- Operatoren: Gravity Wells, Vortex, Flow Field, Drag, Burst, Spring Home.
- **Abnahme:** flüssige, seed-reproduzierbare Kugel, Strömung und Impulswirkung.

### Phase C – Besondere Formationen
- Constraints/Neighbor-Bonds, Bildsampling/-rekonstruktion, Dipolfeld-Interaction, Resonanzfläche und -volumen.
- **Abnahme:** Bild aus Punkten erkennbar; Maus stört lokal und die Punkte kehren zurück; Resonanz erzeugt stabile Knotenstrukturen.

### Phase D – Editor und Presets
- Schema-basierte Controls, Preset Browser, Vorschau, Undo/Redo, Import/Export, State Transitions.
- Mindestens 20 **eigenständig benannte** und visuell unterscheidbare Presets aus Abschnitt 2.1.
- **Abnahme:** Presetwechsel ohne Codeänderung; Zustandswechsel ohne ungewollten Partikel-Reset.

### Phase E – Stabilisierung und Erweiterungstest
- Adaptive Qualität, Context Recovery, responsive/touch/reduced motion, Browser- und Visual-Regression-Tests.
- Zweites winziges Demo-Effektmodul (z. B. `gradient-warp`) implementieren, um die generische Architektur nachzuweisen – **ohne Änderungen am Kerninterface**.
- **Abnahme:** zusätzliche GPU-Effekte lassen sich als unabhängige Module registrieren, editorseitig konfigurieren und zusammen darstellen.

## 11. Verbindliche Definition of Done

1. Jede Phase startet in Browser-Demo und automatisierten Tests ohne Konsolenfehler.
2. Die Codebasis verwendet keine übernommenen Bezeichnungen, Marken, Demoassets oder proprietäre Implementierungen.
3. Parameter, Presets und Zustände besitzen ein versioniertes, validiertes Serialisierungsformat.
4. Shader, Simulation, UI und Runtime bleiben sauber getrennt.
5. GPU-Backendfehler führen zu einem definierten Fallback und nicht zu einem Seitenabsturz.
6. Mehrfachinstanzen, Resize, Pause/Resume, Context Loss und Dispose sind getestet.
7. Es existieren eigene Demo-Seiten für alle Presetfamilien samt messbarer Performance.
8. README, Architekturübersicht, Public API, Preset-Schema und Anleitung für neue Module sind dokumentiert.
9. Ein weiteres, andersartiges Effektmodul belegt die tatsächliche Erweiterbarkeit.

## 12. Hinweise zum Umfang und Genauigkeit

Dies ist eine eigenständige technische Zielspezifikation, keine Reverse-Engineering-Dokumentation auf Source-Code-Ebene. Die Effektfamilien wurden aus öffentlich beschriebenen sichtbaren Fähigkeiten abstrahiert; Algorithmen, konkrete Parameterbereiche, Presetwerte, Shader und Performanceziele sind **eigene technische Vorschläge** und müssen durch Umsetzung und Tests validiert werden. Eine exakte visuelle Reproduktion jedes vorhandenen Presets ist nicht behauptet.

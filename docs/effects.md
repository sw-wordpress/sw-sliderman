# M9: erstes Effektpaket

## Bedienung und Vertrag

- **Slide → Effekte:** „Filmische Tiefe“ und „Lichtreflex“ einzeln einschalten; Standard aus. Anschließend Vorschau starten.
- **Ebene → Animation:** „Maskierte Einblendung von links“ oder „Kreisförmige Einblendung“ auswählen. Start, Dauer und Easing verwenden den vorhandenen Zeitplan; auch als zeitgesteuerter Austritt verfügbar.
- `slide.effects?: { cinematic?: boolean, lightSweep?: boolean }`; fehlende Schalter sind aus. Presets: `reveal-left`, `reveal-circle`. Gemeinsame PHP-/TS-Fixtures und JSON Schema. Bestehende Dokumente benötigen keine Migration; ältere Pluginversionen lehnen diese Ergänzungen ab.
- Undo/Redo, Duplizieren, Speichern und veröffentlichte Snapshots verwenden den normalen Dokumentpfad. Kein zusätzlicher Medien-/Fontbedarf. Der vollständige Archiv-Roundtrip bleibt bis M5 offen.

## Wiedergabe und Grenzen

Tiefe: Hintergrundbild verkleinert sich von 108 % auf Originalgröße; Vordergrundbühne bewegt sich um 6 gerenderte Pixel in die Endposition. Laufzeit höchstens fünf Sekunden, einmal pro Aktivierung. Ohne Hintergrundbild bleibt nur die Bühnenbewegung. Bildausschnitt am Anfang entsprechend prüfen.

Lichtreflex: einmaliges transparentes Lichtband über dem Slide, nach höchstens 900 ms, höchstens 1500 ms lang. Dekorativ, ohne Fokus-/Pointerziele; temporäres Element wird nach Ende/Abbruch entfernt. Beide Effekte beginnen gemeinsam mit den Ebenen nach dem Slideübergang. Keine Schleifen, Scroll- oder Pointersteuerung; gleiches Verhalten auf Touchgeräten.

Masken verändern nur den Animationswrapper und erzeugen keine zusätzlichen Textknoten: lokale Fontmessung, Links und Benutzerrotation bleiben erhalten. Die Tiefe wirkt auf Hintergrund/Bühne, getrennt von Ebenenanimation und Rotation.

Frontend: WordPress lädt `build/runtime/effects.js` nur bei aktivierten Effekten auf mindestens einem eingeschalteten Slide, als Abhängigkeit vor dem Runtime-Script und mit Pluginversion. Fehlendes Bundle lässt die Ausgabe statisch bezüglich Tiefe/Lichtreflex. Die Editorvorschau lädt denselben Player dynamisch. Masken sind zusätzliche Presets im vorhandenen Player.

Reduced Motion: statischer lesbarer Endzustand, kein Lichtband, kein Autoplay; eine Änderung während der Wiedergabe bricht sofort ab. Navigation/Destroy/verborgener Tab bereinigen Effekte. Hover, Fokus, Unsichtbarkeit und manuelle Pause pausieren Tiefe/Lichtreflex; Fortsetzung spielt nur noch laufende Effekte weiter. In der Editorvorschau beenden Dokument-/Gerätewechsel, verborgener Tab oder Reduced Motion die Wiedergabe.

## Nachweise und Abnahme

Automatisiert: gemeinsame Validator-Fixtures; Player-/Lifecycle-Tests; Editorbedienung und Vorschau, Undo/Redo, Duplizieren und Speichern; WordPress-Veröffentlichung und optionale Assetabhängigkeit; native Chromium-Prüfung bei 1180/820/375 px, getrennte Instanzen, Maskenstart vor Übergang und dynamisches/anfängliches Reduced Motion. Befehle: [Entwicklung](development.md). Bundlebudget umfasst beide Frontend-Scripts zusammen. Keine Aussage über reale Mobilgeräte, Safari/Firefox, Framezeiten oder abgeschlossenen Import/Export-Nachweis.

Empfohlene praktische Abnahme durch Stefan:

1. Hintergrundbild hinzufügen, beide Effekte einschalten und Vorschau starten: ruhiger Zoom mit leichtem Vordergrundversatz und genau einem Lichtreflex; keine angeschnittenen wichtigen Bildteile.
2. Überschrift mit maskierter Einblendung und Button mit Kreis-Einblendung versehen; speichern, neu öffnen, veröffentlichen: Zeiten, Auswahl und Darstellung bleiben erhalten, Links bedienbar.
3. Auf Mobilbreite prüfen und Betriebssystem auf reduzierte Bewegung stellen: lesbare statische Inhalte ohne Lichtreflex oder Maskierung; schnelle Slidewechsel hinterlassen einen sichtbaren Slide.

Optional: dieselbe Szene auf realem iOS Safari und Android Chrome sowie mit zwei Slidern auf einer Seite prüfen. Die persönliche Gestaltungs-/Geräteabnahme ist noch offen.

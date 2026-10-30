# M2 – Lokale Schriften testen

Empfohlene Abnahme durch Stefan (automatisierte Tests ersetzen diese Prüfung nicht):

| Schritte | Erwartetes Ergebnis |
| --- | --- |
| Unter **Schriften** Lato suchen; 400 normal, 700 normal und 400 kursiv sowie latin/latin-ext auswählen und lokal installieren. | Auftrag endet erfolgreich; nur gewählte Varianten erscheinen im Editor. Eine weitere Installation derselben Auswahl erzeugt keine Kopie. |
| Drei Textebenen mit diesen Varianten und `ÄÖÜäöüß € Āā Čč ä – Ελληνικά Кириллица` anlegen; Vorschau und veröffentlichte Ausgabe vergleichen. | Umlaute, Euro, Extended-Zeichen, Gewichte und Kursivsatz sind korrekt. Für nicht enthaltene griechische/kyrillische Glyphen greift die Systemschrift; für eigene Abdeckung passende Familie/Subsets installieren. |
| **Offline-Modus** aktivieren, Editor neu laden und vorhandenen Slider bearbeiten/ausgeben; anschließend statische WOFF2 samt passendem Lizenztext lokal importieren. | Bestehende Schriften und Import funktionieren; neue Downloads und Katalogupdates sind deaktiviert. |
| Eine verwendete Installation löschen, danach eine unbenutzte Installation löschen. | Verwendete Schriften bleiben geschützt, auch bei Referenzen aus Revisionen, Autosaves oder veröffentlichten Ständen. Unbenutzte Installation wird entfernt. |
| DevTools → Netzwerk leeren; Editor und Frontend neu laden, nach `font`/`woff` filtern. | Schriftdateien stammen ausschließlich von der eigenen Origin; keine Google-Verbindung, Imports oder externen Font-Preconnects. |

Optional auf einer Testinstanz: Servernetz sperren, Offline-Modus ausschalten und Installation starten → klarer Fehler, vorhandene Schrift bleibt verfügbar; danach erneut versuchen. Eine eigene WOFF2-Datei entfernen → Diagnose und Systemschrift; **Aktualisieren oder reparieren** stellt identische Dateien wieder her. Ein Providerupdate mit anderen Dateiinhalten erstellt eine neue Version; bestehende Slider behalten ihre bisherige Auswahl.

## Automatisierte Evidenz

`composer check`, `npm run lint && npm run typecheck && npm test && npm run build`, `bin/i18n.sh check`, `npm run coverage`, private WordPress-Suite ([Einrichtung](development.md)) und `node tests/e2e/fonts.mjs`. Der Browsertest verwendet den gebauten Editor mit abgefangenen REST-Antworten, prüft Offline-Schalter, Import und Auftragsanzeige und dekodiert echte lokale Lato-Dateien für Latin/Extended. Er verändert keine WordPress-Daten und kontaktiert keinen Provider. WordPress-Tests prüfen echte Registry/Dateien/REST sowie Fehler, Abbruch, Rechte, Leases, Origin-Diagnose, Katalogaktivierung und Frontend-CSS/Preload. Vorhandene Provider-Tests prüfen CSS-, WOFF2-, Größen-, SSRF- und Redirect-Fehler.

Offen: visuelle Abnahme von Kursivsatz/mehreren Gewichten und gemischten Schriftsystemen sowie End-to-End-Nachweis bei gesperrtem Servernetz. M5 muss seine gespeicherten Vorlagen an die Dokumentquelle der Referenzprüfung anschließen; die Referenzprüfung akzeptiert bereits beliebige Dokumentquellen, aber eine Vorlagenverwaltung gibt es noch nicht.

Manueller Import: eine statische Datei/Variante pro Installation, deklarierter Zeichenvorrat. Header/Verzeichnis, Größen und variable Tabellen werden geprüft; Brotli-Daten/Glyphen dekodiert abschließend der Browser. Zeichenvorrat daher in der Vorschau prüfen. Testdateien stammen aus Lato unter der beigefügten `tests/fixtures/fonts/OFL-Lato.txt`.

Coverage-Stand: PHP 83,01 %, TS/JS 80,23 % über den gesamten produktiven Code; beide Grenzen sind in CI verbindlich.

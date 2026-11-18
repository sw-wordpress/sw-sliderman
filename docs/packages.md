# Vorlagen und Slider-Pakete (M5)

In der Slider-Übersicht stehen drei lokale Vorlagen und der ZIP-Import bereit. Das Downloadmenü einer Sliderzeile exportiert den **gespeicherten Entwurf**, einschließlich unveröffentlichter Änderungen. Ein vollständiges Paket enthält Bilder, gepinnte Schriftinstallationen und deren Lizenztexte. „Ohne Dateien“ ist ausdrücklich unvollständig; beim Import müssen Bilder über die Mediathek und Schriften aus den lokalen Installationen zugeordnet werden. Alle Importe erstellen neue, unveröffentlichte Slider. Zielslider werden nie überschrieben; Navigationslinks bleiben redaktionelle Links und werden nicht auf eine neue Domain umgeschrieben.

## Vertrag und Grenzen

Format 1 benötigt mindestens Pluginversion 0.7.0 und enthält `manifest.json`, `slider.json`, `media/<sha256>.<ext>` und `fonts/<Quellinstallation>/{<sha256>.woff2,LICENSE.txt}`. Das Manifest benennt Format-/Dokumentschema, erzeugende und mindestens benötigte Pluginversion, Vollständigkeit, Titel, Dateigrößen/SHA-256, Quellmedien und Fontmetadaten. Medien-Lizenzangaben werden als Metadaten mitgeführt; fehlende Angaben bedeuten keine Lizenzfreigabe. Font-CSS, absolute Speicherpfade und Ressourcen-URLs werden beim Import neu erzeugt. Vorlagen und reproduzierbarer Generator: [templates](../templates/LICENSE.txt), `python3 bin/build-templates.py`.

Voraussetzungen: PHP `ZipArchive`, lokale Upload-URLs und ein beschreibbares `sys_get_temp_dir()` außerhalb von WordPress-/Webwurzel. Import benötigt `sws_import_sliders`, `sws_edit_sliders`, `sws_manage_fonts` und `upload_files`; Export zusätzlich das objektbezogene Bearbeitungsrecht, Medien das Leserecht. Aktivierung/Upgrade ergänzt die Administratorrechte. Cookie-REST verwendet den WordPress-Nonce.

Importgrenzen: 25 MiB ZIP, 100 MiB entpackt, 500 Einträge, 20 MiB je Ressource, 2 MiB je WOFF2, 512 KiB je JSON und höchstens 200:1 Kompression. Rasterbilder: PNG, JPEG, GIF, WebP, AVIF; höchstens 40 Megapixel und 20.000 px je Kante. SVG, Code/CSS, verschlüsselte Archive, Verzeichniseinträge, Traversal, Symlinks/Sonderdateien und doppelte Namen einschließlich Groß-/Kleinschreibung werden abgewiesen. Export verwendet unkomprimierte ZIP-Einträge und begrenzt Ressourcen vor dem Aufbau auf 24,5 MiB; der vollständige ZIP muss innerhalb von 25 MiB bleiben. Kein Shell-Fallback, keine Nachinstallation aus dem Netz.

## Übernahme und Fehler

Zunächst wird das vollständige Archiv geprüft; nur Zusammenfassung, Konflikte und ein benutzergebundener Zufallstoken gehen an den Browser. Unterschiedliche Inhalte unter gleichen Quellkennungen erhalten neue Zielkennungen. Medien werden über den Hash-Index früherer Importe gesucht und vor Wiederverwendung erneut gehasht; Fonts verwenden vollständige geprüfte, inhaltsadressierte Installationen. Ein Hash allein ersetzt keine Typ-/Dokumentprüfung.

Die Bestätigung erzeugt einen nicht automatisch geladenen, sitebezogenen Auftrag. Cron und `POST /packages/run` verwenden denselben PHP-Runner mit fortlaufenden Ressourcenprüfpunkten, echtem Schrittfortschritt und 180-Sekunden-Grenze. `GET /packages/status` liest ausschließlich; der Browser zeigt den Fortschritt und bewahrt die Sitzung im eigenen Tab über Neuladen hinweg. „Importstatus prüfen“ kann einen bereits bestätigten, wartenden Auftrag fortsetzen. Abbruch wird zwischen Ressourcen und vor der Slideranlage geprüft. Normale Fehler rollen ausschließlich selbst angelegte Medien/Fontregistrierungen/-verzeichnisse zurück; wiederverwendete oder vorher vorhandene Dateien bleiben erhalten. Ein korrigierbarer Fehler kann mit neuen Zuordnungen erneut bestätigt werden.

Browser-Runner und Abbruch lesen den Auftragsstatus nach Erhalt der Ressourcensperre direkt aus der Datenbank. Schließt Cron den Import währenddessen ab, liefern beide Endpunkte die ID des bereits erstellten Entwurfs.

Die kurze endgültige Slideranlage läuft über `SliderService` und das transaktionale Repository; sie erzeugt keinen Live-Snapshot. Datenbank und Dateien bilden keine gemeinsame Transaktion. Nach einem harten Prozessabbruch bleibt der Ausgang unbekannt: kein automatisches Wiederholen, zuerst die Sliderliste prüfen. Bereits übernommene, unreferenzierte Ressourcen können dann zurückbleiben. Das verhindert eine zweite Slideranlage nach einem möglicherweise erfolgreichen Commit.

Private Arbeitsverzeichnisse haben Modus 0700 und sind nach Installation/Site getrennt. Downloadtokens sind benutzergebunden, eine Stunde gültig und prüfen das aktuelle Objektbearbeitungsrecht erneut. Pro Site bleiben höchstens 100 Paketsitzungen erhalten; stündliche Bereinigung entfernt abgelaufene Sitzungen und nach einem Tag verwaiste eigene Stagingdateien. Fremde Dateien werden nicht rekursiv gelöscht. Deaktivierung stoppt Paket-Cronjobs.

## Nachweise und praktische Abnahme

Automatisiert: `PackageArchiveTest`, `PackageFontsTest`, `PackagesTest`, `package-api.test.ts`, `package-tools.test.ts` und `tests/e2e/packages.mjs`. Die WordPress-Suite arbeitet ausschließlich auf [privaten Testdatenbanken](development.md). `bin/test-packages-roundtrip.sh` führt den Zweitinstallationstest aus. Er läuft in getrennten PHPUnit-Prozessen mit eigenen Datenbanken, Domains und Uploadwurzeln; der Browser prüft echten Multipart-Upload, Download, Abbruch und die Dekodierung lokaler Bilder/WOFF2 bei blockierten fremden Browser-Origins und gesperrtem Server-HTTP. Aufruf des Browsertests steht im Skript; seine Testinstallation gehört nach `/tmp`.

Empfohlene Abnahme durch Stefan:

1. Jede Vorlage instanziieren, Text und mobile Ansicht ändern, speichern und vollständig exportieren. Erwartung: drei unabhängig bearbeitbare Entwürfe; erneutes Anlegen derselben Vorlage zeigt das unveränderte Original.
2. Einen Slider mit eigenen Bildern und lokal installierter Schrift vollständig exportieren und auf einer zweiten Installation importieren. Erwartung: Zusammenfassung vor Übernahme, neuer unveröffentlichter Slider, danach richtige Bilder/Schriften im Editor und nach Veröffentlichung im Frontend; keine externen Fontanfragen.
3. Ohne Dateien exportieren und wieder importieren. Erwartung: klare Kennzeichnung, fehlende Bilder/Schriften müssen lokal gewählt werden; unpassende Schriftschnitte werden abgelehnt.

Optional: Vor der Bestätigung abbrechen, die Importansicht neu laden und ein beschädigtes/neueres ZIP auswählen. Erwartung: kein zusätzlicher Slider bei Abbruch, wiederauffindbarer Auftragsstatus nach Neuladen und verständliche Ablehnung ungültiger Pakete. Die automatisierten Nachweise ersetzen diese praktische Abnahme nicht.

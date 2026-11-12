# Betrieb der verifizierten GitHub-Updates

**Produktive Updateversorgung noch nicht nachgewiesen:** Der Betreiber hat den öffentlichen Schlüssel `sw-sliderman-2026-11` lokal hinterlegt; er wird mit diesem Stand ausgeliefert. Geschützte GitHub-Umgebung, Signierkonfiguration, Vertrauensverteilung an bestehende Installationen und erster signierter Release sind weiterhin zu bestätigen. Der Implementierungsagent hat keine Produktionsschlüssel erzeugt, Secrets geändert oder Releases veröffentlicht.

Quelle: `sw-wordpress/sw-sliderman`, numerische Repository-ID `1438174384` (GitHub-API geprüft), ausschließlich `sw-sliderman/sw-sliderman.php`, Version aus `SWS_VERSION`. Referenz: ChurchTools Suite Commit `49dc66f`; vollständig lokal adaptierter Code, kein Nachladen aus der Referenz.

Vor der Schlüsselübergabe in [GitHub Environments](https://github.com/sw-wordpress/sw-sliderman/settings/environments) `plugin-releases` anlegen: erforderliche Freigaben, kein Selbstfreigeben und ausschließlich geschützte Release-Tags erlauben. Branch-/Tagregeln und Workflowänderungen reviewen. Wenn der GitHub-Tarif diese Regeln nicht durchsetzt, vor Nutzung eine entsprechend geschützte Signierumgebung einrichten.

Ein eigener Ed25519-Schlüssel gilt nur für dieses Plugin. `SW_PLUGIN_RELEASE_SIGNING_KEY` ist das Environment-Secret (64 Byte Sodium Secret Key, Base64), `SW_PLUGIN_RELEASE_KEY_ID` die Environment-Variable. Die CI-Namen dürfen in anderen Repositories gleich sein. WordPress erhält ausschließlich öffentliche Schlüssel in `includes/update/trusted-keys.php` oder der lokalen Array-Konstante `SWS_RELEASE_PUBLIC_KEYS`; keine gemeinsame SW-Vertrauensliste.

## Copy & Paste: Schlüssel für SW Sliderman einrichten

Diese Befehle sind für Bash/Zsh auf dem lokalen Entwicklungs-/Release-Rechner mit PHP und Sodium gedacht, nicht für den produktiven WordPress-Webserver. Der Checkout liegt hier unter `/var/www/html/wordpress_dev/wp-content/plugins/sw-sliderman`. Private Dateien landen ausschließlich unter `$HOME/.local/share/sw-sliderman-release-keys`, außerhalb dieses Checkouts und Webroots. Diesen Ordner separat verschlüsselt sichern; er gehört nicht in Git, Release-ZIPs oder öffentlich synchronisierte Ordner. Die Befehle wurden mit Wegwerfschlüsseln geprüft; produktive Schlüssel werden nicht durch die Dokumentation angelegt.

**1. Einmalig Schlüssel erzeugen.** Der Block verweigert einen bereits vorhandenen Schlüsselordner, damit ein erneutes Einfügen keinen bestehenden Schlüssel ersetzt. Die Key-ID ist eine öffentliche Kennung; beim späteren Schlüsselwechsel eine neue Kennung und einen neuen Ordner verwenden.

```bash
(
  set -eu
  umask 077
  export SWS_RELEASE_KEYS_DIR="$HOME/.local/share/sw-sliderman-release-keys"
  php <<'PHP'
<?php
declare(strict_types=1);
if (!function_exists('sodium_crypto_sign_keypair')) {
    throw new RuntimeException('PHP-Sodium fehlt.');
}
$dir = getenv('SWS_RELEASE_KEYS_DIR');
if (!$dir || file_exists($dir) || is_link($dir)) {
    throw new RuntimeException('Schlüsselordner existiert bereits oder Pfad fehlt. Keine Dateien verändert.');
}
if (!mkdir($dir, 0700, true)) {
    throw new RuntimeException('Schlüsselordner konnte nicht angelegt werden.');
}
$id = 'sw-sliderman-2026-11';
$pair = sodium_crypto_sign_keypair();
$secret = sodium_crypto_sign_secretkey($pair);
$public = sodium_crypto_sign_publickey($pair);
$files = [
    'signing-key.base64' => base64_encode($secret) . "\n",
    'public-keys.php' => "<?php\nreturn " . var_export([$id => base64_encode($public)], true) . ";\n",
    'key-id.txt' => $id . "\n",
];
foreach ($files as $name => $contents) {
    $handle = fopen($dir . '/' . $name, 'x');
    if (!$handle || fwrite($handle, $contents) !== strlen($contents)) {
        throw new RuntimeException('Schlüsseldatei konnte nicht vollständig geschrieben werden.');
    }
    fclose($handle);
}
sodium_memzero($secret);
sodium_memzero($pair);
echo "Schlüsseldateien erzeugt; privater Schlüssel wurde nicht ausgegeben.\n";
PHP
)
```

**2. Nur den öffentlichen Schlüssel ins Plugin übernehmen.** Dieser Block erhält bereits vorhandene öffentliche Schlüssel und lehnt eine abweichende Belegung derselben Key-ID ab. Dafür werden keine privaten Schlüssel in eine Umgebungsvariable oder nach WordPress kopiert.

```bash
(
  set -eu
  export SWS_PLUGIN_DIR='/var/www/html/wordpress_dev/wp-content/plugins/sw-sliderman'
  export SWS_RELEASE_KEYS_DIR="$HOME/.local/share/sw-sliderman-release-keys"
  php <<'PHP'
<?php
declare(strict_types=1);
$target = getenv('SWS_PLUGIN_DIR') . '/includes/update/trusted-keys.php';
$existing = require $target;
$incoming = require getenv('SWS_RELEASE_KEYS_DIR') . '/public-keys.php';
if (!is_array($existing) || !is_array($incoming) || count($incoming) !== 1) {
    throw new RuntimeException('Ungültiger öffentlicher Schlüsselring.');
}
foreach ($incoming as $id => $key) {
    $decoded = is_string($key) ? base64_decode($key, true) : false;
    if (!is_string($decoded) || strlen($decoded) !== 32 || (isset($existing[$id]) && $existing[$id] !== $key)) {
        throw new RuntimeException('Ungültiger öffentlicher Schlüssel oder widersprüchliche Key-ID.');
    }
    $existing[$id] = $key;
}
$contents = "<?php\n/** Public Ed25519 verification keys. */\ndeclare(strict_types=1);\n\nreturn " . var_export($existing, true) . ";\n";
if (file_put_contents($target, $contents, LOCK_EX) !== strlen($contents)) {
    throw new RuntimeException('Öffentlicher Schlüsselring konnte nicht geschrieben werden.');
}
echo "Öffentlicher Schlüsselring aktualisiert.\n";
PHP
  php -l "$SWS_PLUGIN_DIR/includes/update/trusted-keys.php"
  git -C "$SWS_PLUGIN_DIR" diff -- includes/update/trusted-keys.php
)
```

Die angezeigte Änderung an `includes/update/trusted-keys.php` enthält ausschließlich den öffentlichen Schlüssel. Diese Datei nach Review regulär committen. Bestehende Installationen benötigen sie einmal über einen vertrauenswürdigen manuellen Upload oder eine lokale Konfiguration; erst dann können sie signierte Folgeupdates akzeptieren.

**3. GitHub vorbereiten und Secret hinterlegen.** Zuerst in den [Repository-Environments](https://github.com/sw-wordpress/sw-sliderman/settings/environments) die Umgebung `plugin-releases` anlegen und Freigaben sowie erlaubte Release-Tags passend zum Workflow absichern. Erst danach folgenden Block mit einem für dieses Repository berechtigten GitHub-CLI-Konto ausführen. `gh auth status` prüft die Anmeldung; falls nötig zuvor `gh auth login` ausführen.

```bash
(
  set -eu
  SWS_RELEASE_KEYS_DIR="$HOME/.local/share/sw-sliderman-release-keys"
  gh auth status
  gh secret set SW_PLUGIN_RELEASE_SIGNING_KEY \
    --repo sw-wordpress/sw-sliderman --env plugin-releases \
    < "$SWS_RELEASE_KEYS_DIR/signing-key.base64"
  gh variable set SW_PLUGIN_RELEASE_KEY_ID \
    --repo sw-wordpress/sw-sliderman --env plugin-releases \
    --body "$(cat "$SWS_RELEASE_KEYS_DIR/key-id.txt")"
  gh secret list --repo sw-wordpress/sw-sliderman --env plugin-releases
  gh variable list --repo sw-wordpress/sw-sliderman --env plugin-releases
)
```

Der private Schlüssel wird über Standardeingabe an GitHub übergeben und erscheint weder im Befehlsargument noch in der Terminalausgabe. Die Listen zeigen Secret-Namen beziehungsweise öffentliche Variablen. Referenzen: [GitHub CLI: Secret setzen](https://cli.github.com/manual/gh_secret_set), [Variable setzen](https://cli.github.com/manual/gh_variable_set), [PHP: Ed25519-Schlüsselpaar erzeugen](https://www.php.net/manual/en/function.sodium-crypto-sign-keypair.php).

Ein erneutes Setzen des Secrets ersetzt den GitHub-Wert. Deshalb vor Ausführung sicherstellen, dass dieser lokale Schlüssel zum gewünschten öffentlichen Schlüsselring passt; bei Rotation den Ablauf weiter unten verwenden. Die Befehle erzeugen keinen Release-Tag und veröffentlichen kein ZIP. Der eingerichtete Tag-Workflow übernimmt später Build, Signierung und Veröffentlichung.

## Release und Vertrauensstart

Auf einem sauberen Checkout des freigegebenen Branches `make release VERSION=0.1.1` ausführen (alternativ `X.Y.Z.W`). Das Kommando ändert Header-Version und `SWS_VERSION` gemeinsam, erstellt bei Änderung den Versionscommit und einen annotierten Tag und pusht Branch und Tag atomar nach `origin`. Die bereits eingetragene Version darf ohne leeren Commit getaggt werden. Uncommittete/untracked Dateien, Downgrades, widersprüchliche Versionsfelder, vorhandene Tags und nicht erreichbares `origin` brechen vor Änderung ab. Ein abgewiesener atomarer Push veröffentlicht weder Branch noch Tag; lokale Release-Commits/Tags bleiben zur Prüfung erhalten. Es gibt keinen Force-Push. Das Kommando wurde ausschließlich in temporären Repositories getestet; im echten Repository wurde kein Release ausgelöst.

Der Workflow akzeptiert stabile Tags `[v]X.Y.Z[.W][-NN]`. Der Tag normalisiert ausschließlich ein optionales zweistelliges Build-Suffix. Das ZIP heißt `sw-sliderman-<Version>.zip` und enthält `sw-sliderman/sw-sliderman.php`. Der geschützte Release-Workflow ergänzt den bestehenden öffentlichen Schlüsselring ohne Key-ID-Konflikte, baut Assets und Produktionsautoloader, prüft Paketvollständigkeit und bettet den Schlüssel ein. Er lädt ZIPs in einen Draft, signiert Manifestbytes mit tatsächlichen Asset-IDs und prüft die heruntergeladenen Artefakte vor Veröffentlichung. Veröffentlichte Releases werden nie überschrieben. Fehlende Schlüssel brechen vor Upload ab; Fehler danach lassen einen unveröffentlichten Draft zurück. Der Tag-Workflow startet keine Testsuite; Tests laufen ausschließlich auf Pull Requests.

**Bestehende Installationen benötigen den öffentlichen Schlüssel einmal über einen separat vertrauenswürdigen Weg**, etwa kontrollierten manuellen ZIP-Upload mit überprüftem Schlüssel. Ein erster Release darf seinen eigenen Schlüssel nicht legitimieren. Ein im Build eingebetteter Schlüssel allein richtet bestehende Installationen nicht ein. Private Schlüssel niemals auf WordPress speichern, committen, protokollieren oder ins ZIP aufnehmen.

## Prüfen, Installieren und Fehler

Unter **Plugins → Installierte Plugins** stehen Prüfschaltfläche und lokaler Status direkt in der Zeile von **SW Sliderman**, ebenso in der Netzwerk-Pluginübersicht bei Multisite. Im Slider-Editor gibt es keine Updatebedienung. Das Prüfskript lädt ausschließlich in der Pluginübersicht. Nach vollständigem Seitenaufbau prüft ein berechtigter Hintergrundauftrag frühestens alle 24 Stunden. Jeder HTTP-/Signaturfehler verbraucht den Versuch; Transient-Löschung setzt die Frist nicht zurück. „Jetzt auf Updates prüfen“ benötigt Nonce und `update_plugins`, mindestens 60 Sekunden Abstand. Ohne Schlüssel, Sodium oder ZipArchive bleibt der Provider gesperrt. Frontend, Cron, REST und WP-CLI prüfen nie GitHub.

Installation ausschließlich durch die nativen WordPress-Einzel-, AJAX- oder Sammelupdates in der Pluginübersicht. Keine Auto-Updates, auch nicht aus alten gecachten Angeboten. Anzeige und Details verwenden ausschließlich lokalen Cache; der Download prüft die Signatur erneut sowie Paket-Hash, Größe, ZIP-Struktur und Header vor der Core-Extraktion. Der Updater entpackt oder kopiert selbst nichts. Ein manuell hochgeladenes ZIP ist ein separater WordPress-Installationsweg und wird nicht als verifiziert bezeichnet.

Lokaler Netzwerkzustand: `sws_verified_github_updates_v1`, Lease: `sws_verified_github_updates_lock_v1`, Migration: `sws_verified_updates_migrated`. Keine Alt-Updater/-Cronjobs im Ziel vorgefunden; die Migration entfernt gezielt eigene alte Core-Angebote und Auto-Update-Auswahlen. Deaktivierung entfernt eigene Angebote vor Wegfall der Guards und erhält fremde Angebote. Metadatenversuche und höchste akzeptierte Version bleiben zur Drosselung und zum Rollback-Schutz erhalten. Ein Lock gilt 120 Sekunden; Übernahme und Freigabe prüfen Eigentum, Multisite-Akquisition serialisiert mit MySQL `GET_LOCK` (erforderliche DB-Funktion).

Signierte Angebote gelten höchstens sieben Tage ab erfolgreicher Prüfung. Fehler verlängern die Gültigkeit nicht. Bei abgelaufenem Cache erneut manuell prüfen; bei ungültiger Signatur, unbekanntem Schlüssel oder Hashfehler keine Installation erzwingen. Metadaten: 5 Sekunden pro HTTP-Aufruf, 256 KiB Manifest, 1 KiB Signatur. HTTPS/443 mit vier Redirects, feste GitHub-Hosts und Repositorypfade. ZIP: 50 MiB, 250 MiB entpackt, 10.000 Einträge, begrenztes Kompressionsverhältnis. CDN-Änderungen können eine bewusste Clientanpassung erfordern. Temporäre Pakete werden bei Fehlern und spätestens beim Request-Ende gelöscht.

## Rotation und WordPress.org

Rotation: neue Key-ID und neuen privaten Ordner verwenden. Zunächst eine mit dem bisherigen Schlüssel signierte Übergangsrelease mit beiden öffentlichen Schlüsseln verteilen. Erst danach mit der neuen ID signieren. Alte Schlüssel erst nach verteilter Übergangsphase entfernen. Bei kompromittiertem Schlüssel separat vertrauenswürdigen Wiederherstellungsweg nutzen. Ohne zusätzliches signiertes zeitlich gültiges Channel-Verzeichnis bleibt das Vorenthalten neuerer Releases gegenüber erstmaligen Clients prinzipiell unerkennbar.

Für WordPress.org den temporären Provider aus `Plugin::boot()`, dessen Lifecycle-Aufruf und den Update-URI-Header im Store-Build entfernen; auch Updater-Skript/UI und Konfiguration entfernen. Eine letzte signierte Übergangsrelease muss eigene Angebote/Zustände gezielt bereinigen und diesen Wechsel ausliefern. Kein automatischer Wechsel aufgrund eines gleichnamigen Store-Angebots.

## Verifikation und praktische Abnahme

Automatisierte Ergebnisse und Grenzen stehen in [GITHUB-UPDATES-TESTS.md](GITHUB-UPDATES-TESTS.md). HTTP ist simuliert, Schlüssel sind Wegwerfmaterial; native Installationen laufen ausschließlich im privaten WordPress unter `tests/wp/vendor`. DB-Suiten mit gemeinsamem Zustand sequenziell ausführen.

Empfohlene Abnahme durch Stefan: Plugins → Installierte Plugins öffnen → in der Sliderman-Zeile Sperrhinweis und deaktivierte Prüfschaltfläche bei leerem Schlüsselring. Nach Betreiberkonfiguration in einer Testinstallation „Jetzt auf Updates prüfen“ klicken → Ergebnis in derselben Zeile; über „Plugin-Liste neu laden“ erscheint das signierte Angebot; dort manuell aktualisieren → neue Version, keine Auto-Update-Auswahl. Zweiter Klick innerhalb 60 Sekunden → Drosselmeldung. Optional Multisite: Site-Administrator ohne Netzwerkrechte → keine Prüfung, Netzwerkadministrator → gleiche manuelle Abläufe.

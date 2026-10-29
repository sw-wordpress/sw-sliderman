# Translations

- PHP: gettext, text domain `sw-sliderman`, catalog source `languages/src/php-de_DE.json` → `languages/sw-sliderman-de_DE.po/.mo`.
- Editor: `wp.i18n` via `wp_set_script_translations( 'sws-editor', … )`; source `languages/src/editor-de_DE.json` → `languages/sw-sliderman-de_DE-sws-editor.json` (Jed).
- German variants without own files (`de_DE_formal`, `de_AT`, `de_CH`) load the `de_DE` files explicitly (`Infrastructure/Translations`), because just-in-time loading does not consult fallback filters.
- `bin/i18n.sh update` regenerates everything (WP-CLI for the POT); `bin/i18n.sh check` fails on missing or stale strings and runs in CI.

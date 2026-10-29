#!/usr/bin/env bash
# Translations (docs/translations.md).
#   bin/i18n.sh update  -> regenerate POT (needs WP-CLI), write de_DE.po/.mo and the editor JSON
#   bin/i18n.sh check   -> fail on untranslated PHP or editor strings (no WP-CLI needed; used in CI)
set -euo pipefail
cd "$(dirname "$0")/.."

case "${1:-check}" in
  update)
    wp i18n make-pot . languages/sw-sliderman.pot --domain=sw-sliderman \
      --exclude=vendor,node_modules,build,tests,assets,bin,dist --skip-js --skip-block-json --skip-theme-json \
      --package-name="SW Sliderman" --headers='{"Report-Msgid-Bugs-To":"","POT-Creation-Date":""}'
    python3 bin/i18n-po.py
    msgfmt --check --output-file=languages/sw-sliderman-de_DE.mo languages/sw-sliderman-de_DE.po
    node bin/i18n-js.mjs check
    node bin/i18n-js.mjs build
    ;;
  check)
    expected="$(mktemp)"
    trap 'rm -f "$expected"' EXIT
    python3 bin/i18n-po.py "$expected" >/dev/null
    cmp -s "$expected" languages/sw-sliderman-de_DE.po || { echo "de_DE.po is outdated: run bin/i18n.sh update" >&2; exit 1; }
    msgfmt --check --statistics --output-file=/dev/null languages/sw-sliderman-de_DE.po
    node bin/i18n-js.mjs check
    ;;
  *) echo "usage: $0 update|check" >&2; exit 2 ;;
esac

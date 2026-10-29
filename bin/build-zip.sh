#!/usr/bin/env bash
# Builds an installable WordPress plugin ZIP: compiled editor/runtime + production autoloader.
# Usage: bin/build-zip.sh [output-dir]   (needs composer and node/npm on the BUILD machine only)
# The bundles are always rebuilt from the current sources so a release never ships stale assets;
# SWS_SKIP_ASSET_BUILD=1 reuses build/, but only when it is newer than every file in assets/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/dist}"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
NAME=sw-sliderman

if [ "${SWS_SKIP_ASSET_BUILD:-0}" = "1" ] && [ -f "$ROOT/build/editor/editor.js" ] \
  && [ -z "$(find "$ROOT/assets" "$ROOT/package-lock.json" -newer "$ROOT/build/editor/editor.js" -print -quit)" ]; then
  echo ">> reusing built assets (SWS_SKIP_ASSET_BUILD=1, assets are up to date)"
else
  echo ">> building editor and runtime"
  (cd "$ROOT" && npm ci && npm run build)
fi

echo ">> assembling plugin tree"
mkdir -p "$STAGE/$NAME"
# Untracked, not ignored files (local notes, experiments) are never shipped.
UNTRACKED="$STAGE/untracked.txt"
if git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git -C "$ROOT" ls-files --others --exclude-standard | sed 's|^|/|' > "$UNTRACKED"
else
  : > "$UNTRACKED"
fi
rsync -a --exclude-from="$UNTRACKED" --exclude-from=- "$ROOT/" "$STAGE/$NAME/" <<'EXCLUDES'
.git
.gitignore
.editorconfig
.prettierrc.json
.prettierignore
.phpunit.cache
.phpstan.cache
.phpcs*.cache
/vendor
/.github
/node_modules
/assets
/tests
/tools
/bin
/coverage
/.scannerwork
/sonar-project.properties
/dist
/build/editor/.vite
/languages/src
/languages/*.pot
/docs/adr
eslint.config.js
tsconfig.json
env.d.ts
vite.*.config.ts
vitest.config.ts
package.json
package-lock.json
phpunit.xml.dist
phpstan.neon.dist
phpcs.xml.dist
Makefile
PLAN.md
CODE-STYLE.md
TODO.md
AGENTS.md
composer.lock
EXCLUDES

echo ">> installing the production autoloader"
cp "$ROOT/composer.json" "$ROOT/composer.lock" "$STAGE/$NAME/"
(cd "$STAGE/$NAME" && composer validate --strict && composer install --no-dev --prefer-dist --optimize-autoloader --classmap-authoritative --no-interaction --no-progress --no-scripts)
rm -f "$STAGE/$NAME/composer.lock"
php "$ROOT/tests/package-smoke.php" "$STAGE/$NAME"

mkdir -p "$OUT"
VERSION="$(grep -m1 "Version:" "$ROOT/sw-sliderman.php" | awk '{print $NF}')"
# zip -r would update an existing archive and keep files that no longer exist: always start fresh.
rm -f "$OUT/$NAME-$VERSION.zip"
(cd "$STAGE" && zip -qr "$OUT/$NAME-$VERSION.zip" "$NAME")
echo ">> $OUT/$NAME-$VERSION.zip"

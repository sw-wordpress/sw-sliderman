#!/usr/bin/env bash
# Two independent throw-away WordPress databases, domains and upload roots. No dev-site data.
set -euo pipefail
cd "$(dirname "$0")/.."
bin/test-db.sh start
M5_TEMP="$(mktemp -d)"
trap 'rm -rf "$M5_TEMP"' EXIT
mariadb --socket="${SWS_TEST_DB_DIR:-/tmp/sws-test-db}/mysql.sock" -uroot -e \
  'CREATE DATABASE IF NOT EXISTS sws_packages_source CHARACTER SET utf8mb4; CREATE DATABASE IF NOT EXISTS sws_packages_target CHARACTER SET utf8mb4'
SWS_WP_TEST_DB_NAME=sws_packages_source SWS_M5_ROUNDTRIP=source SWS_M5_PACKAGE="$M5_TEMP/package.zip" \
  composer test:wp -- --filter test_cross_installation_roundtrip
SWS_WP_TEST_DB_NAME=sws_packages_target SWS_M5_ROUNDTRIP=target SWS_M5_PACKAGE="$M5_TEMP/package.zip" \
  composer test:wp -- --filter test_cross_installation_roundtrip

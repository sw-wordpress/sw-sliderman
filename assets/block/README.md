# WordPress block module

This directory reserves the separate Gutenberg integration entry point from PLAN.md. The functional block is M4.11 work; M1 does not register an incomplete block. Future block code must use WordPress' block APIs and the existing public rendering boundary. It must not import Vue/Quasar editor code or bundle the frontend runtime into the editor. The current shortcode remains the working integration.

Source of the block `sw-sliderman/slider` (`block.json`, build-free `editor.js`, `editor.asset.php`). `assets/` is not part of the release ZIP: `npm run build` copies these files to `build/block/` (`bin/build-block.mjs`), which the plugin registers and `bin/check-bundles.mjs` and `tests/package-smoke.php` verify. A checkout without a build falls back to this directory.


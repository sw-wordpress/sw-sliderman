# ADR 0002 – Google Fonts provider route (TODO M0.07)

**Problem.** Fonts must be installed locally with license data; browsers may never contact Google (PLAN.md 8).

**Decision.**
- Catalog: `bin/build-font-catalog.php` builds `fonts/catalog.json` on the build machine from the official `google/fonts` `METADATA.pb` files (family, category, license, variants, subsets, variation axes) and verifies that the license file exists. Only explicitly mapped families are offered. Families with variation axes are `static: false` and rejected in 1.0.
- Files: the server requests the Google Fonts CSS2 API with a current browser user agent (→ WOFF2), parses it with a restricted grammar (`FontFaceParser`), requires every requested variant/subset exactly once, rejects shared files across weights (variable font), downloads each WOFF2 from `fonts.gstatic.com`, checks signature/length/size, hashes and stores it.
- License: the family's `OFL.txt`/`UFL.txt`/`LICENSE.txt` is downloaded from `raw.githubusercontent.com/google/fonts/main/…` and stored with the installation; without it the installation fails.
- All URLs pass `DownloadPolicy` (HTTPS, fixed hosts and paths, no port/user info, public IPs only incl. after redirects) plus the WordPress Safe HTTP API with redirects disabled.
- Installation: prepared in `fonts/.tmp-*`, activated by one rename into `fonts/<content hash>/`, registered only when complete; per-family lock via atomic `add_option`.

**Evidence (29.10.2026, dev site).** Lato 400/700 latin+latin-ext installed; Roboto/Open Sans/Montserrat return one file for several weights and are correctly rejected; editor and frontend render the local font with Google blocked (`tests/e2e/editor.mjs`).

**Risks.** The CSS2 response format and the user-agent dependence are not a contract; the parser rejects any change instead of guessing. Before release a versioned provider adapter or a build-time file manifest may replace the runtime CSS2 call (PLAN.md 8.2).

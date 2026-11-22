# Local fonts

Sliderman's editor and frontend load installed fonts from the website's own upload origin. They never fall back to a Google-hosted browser font. This concerns this plugin only; a theme or another plugin may still request external fonts.

## Install from the catalog

1. Open **Sliderman → Fonts** and use **Search family** in **Catalog**.
2. Choose **Install** (or **Install more styles**), select the required **Styles** and **Character sets**, then choose **Install locally**.
3. Wait for the job to become **Completed** under **Font downloads**. Keep the page open; **Continue processing** can advance queued work when WP-Cron is unavailable. Failed jobs offer **Retry**.
4. In the editor, select a text/button layer and choose the installed font under **Typography → Font (locally installed)**, with the installed weight/style.
5. Check actual text including accented characters and symbols, then save and publish.

Only selected variants/subsets are downloaded; missing weights are not synthesized. Choose Latin/Latin Extended or other appropriate character sets for the real text. The catalog shows metadata for uninstalled fonts, not remotely loaded previews. Families marked **Variable font – not supported yet** cannot be used as variable-font installations.

## Import a local WOFF2 file

Choose **Import WOFF2**, select a **static** WOFF2 file no larger than **2 MiB**, and provide **Family**, **Weight**, **Style**, **Character sets**, **License identifier** and **License text**. Choose **Import locally**, then verify its character coverage in the local preview. The plugin does not convert TTF files or make variable-font support available through this path.

Use only font files whose license permits the intended use/transfer. The license accompanies an installation and complete slider exports; a successful import is not proof of ownership or permission.

## Offline mode and connections

**Fonts → Font downloads → Offline mode** blocks new server-side font downloads; installed fonts and local imports remain available. It does not disable plugin-update traffic or control other plugins' connections.

Installing fonts or explicitly updating the catalog causes server-side requests to the provider. Google font resolution/files use `fonts.googleapis.com` / `fonts.gstatic.com`, and license/catalog sources include the Google Fonts GitHub repository. Visitor and editor font requests remain local. These local fonts are not a statement that the entire website complies with privacy law.

## Repair, update and remove

- **Update or repair** obtains a new/repaired installation; existing sliders keep their pinned font version until changed in the editor. Review each slider deliberately, including its draft and live output.
- **Files missing** indicates the local files need repair. A lost/unusable font falls back to system text, never an external font.
- **Upload origin differs: local font loading is disabled.** means uploads are being served from another origin. Arrange for `uploads/sw-sliderman/` to be served by the website's own origin rather than a remote offload/CDN host.
- **Remove** deletes local font files only when no slider, revision or published version uses that installation. **In use** is not resolved by hiding the layer or merely changing the current visible page.

Keep the uploads directory in site backups. The [font testing notes](https://github.com/sw-wordpress/sw-sliderman/blob/master/docs/font-testing.md) describe technical verification.

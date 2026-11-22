# Templates and slider packages

Open **Sliderman → Sliders → Templates and packages**. PHP ZipArchive and local readable/writable storage are required. Import permission includes slider editing, font management and media uploads; a missing panel/control can indicate missing capabilities.

## Start from a bundled template

Select a **Local template**, then **Create from template**. Three bundled examples are available: image slider, text hero and event. Each creates an independent **unpublished** slider. Change its content and mobile layout, save and publish when ready; the original bundled template is unchanged.

## Export a saved draft

1. Save your latest changes in the editor, then return to the slider list.
2. Open **Export slider** on the desired row.
3. Choose **Complete ZIP with files** for a portable package with images, pinned local font installations and their license texts.
4. Use **Incomplete ZIP without files** only when you intend to assign the missing resources on the destination site.

Export always uses the **saved draft**, including unpublished edits, not necessarily the current live version. Treat the ZIP as potentially private draft material. Transfer it securely and check image/font reuse licenses; missing media license metadata does not grant permission. A slider ZIP is not a full website/database backup.

## Import a ZIP

1. Choose a **Slider ZIP archive** and click **Check package**.
2. Review the title, complete/incomplete status, image/font counts and conflicts. Checking alone does not create the slider.
3. For incomplete packages, use **Choose replacement for image …** and **Local replacement font for …**. Install compatible font weights/styles first if necessary.
4. Choose **Import as new draft**, then wait for progress to finish. Keep the tab open to allow the browser runner to process queued work. The same tab can recover status after reload with **Check import status**.
5. Inspect the new slider, its images, links, fonts and mobile layout. Save and publish explicitly when ready.

Imports always create a new unpublished slider; they do not overwrite an existing target. Identical verified resources may be reused, conflicting source identities are remapped, and no missing resources are fetched from the network. Editorial link destinations are **not rewritten to the new domain**: review absolute URLs before publishing.

**Cancel import** stops work at a safe checkpoint; if processing has already completed, inspect the returned slider instead of assuming cancellation removed it. If the outcome is uncertain after a hard interruption, check status and the slider list before repeating the import, to avoid a duplicate. Existing/reused resources are not removed as rollback cleanup.

## Limits and rejected files

- ZIP up to **25 MiB**, at most **100 MiB** expanded and **500 entries**; smaller server upload/request limits may also apply.
- Individual resources up to **20 MiB**, WOFF2 up to **2 MiB** and JSON documents up to **512 KiB**.
- Package raster images: PNG, JPEG, GIF, WebP and AVIF, within the validated dimensions (up to 40 megapixels and 20,000 px per edge).
- SVG, executable code/CSS, encrypted archives, unsafe paths, symlinks, duplicate names and excessive compression are rejected. A general ZIP of unrelated files is not a slider package.
- Format 1 packages require at least plugin **0.7.0**; unsupported newer formats/versions cannot simply be forced into an older plugin.

Reduce image sizes or use a deliberately incomplete export when a complete package exceeds the limits. Keep media originals readable; an offloaded-only media file cannot be exported as a local file. For archive contracts, temporary storage and recovery detail, see the existing [technical package guide (German)](https://github.com/sw-wordpress/sw-sliderman/blob/master/docs/packages.md).

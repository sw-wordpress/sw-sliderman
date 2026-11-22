# Getting started

## Requirements

- WordPress **6.6+**, PHP **8.2+** with JSON, and MySQL/MariaDB with InnoDB tables.
- PHP **ZipArchive** for slider ZIP import/export. Package processing also needs a writable PHP temporary directory outside the WordPress/web root.
- A single-site installation; multisite is not yet tested.
- An administrator account for initial setup. Activation/upgrades grant administrators `sws_edit_sliders`, `sws_publish_sliders`, `sws_manage_fonts` and `sws_import_sliders`. Import also requires media upload permission. Other accounts need the relevant capabilities; an absent control can mean missing permission.

Use a test site: this plugin is an early-development preview. Back up the site before installation or updates.

## Install an installable plugin ZIP

1. Obtain an installable **SW Sliderman release ZIP** from the project's trusted distribution path. Check [GitHub releases](https://github.com/sw-wordpress/sw-sliderman/releases) for available packages; availability is not guaranteed.
2. In WordPress, open **Plugins → Add New Plugin → Upload Plugin**, select the ZIP and choose **Install Now**, then **Activate Plugin**.
3. Open **Sliderman → Sliders**. The visual editor must load before continuing.

GitHub's **Source code** ZIP is not an installable build: it lacks compiled editor/runtime assets and the production autoloader. If no installable ZIP is available, a maintainer must build one using the [development instructions](https://github.com/sw-wordpress/sw-sliderman#development). End users do not need Node.js or Composer for a built package.

## Publish a first slider

1. Open **Sliderman → Sliders → New slider**.
2. Enter a **Name**, such as `Community event`, then click **Create and edit**. A new slider starts with one empty slide.
3. Click **Add layer → Text**, select the layer and enter a short heading under **Properties → Layer**. Use **Position and size** or drag the layer into place.
4. Optionally add an **Image** from the WordPress media library or a **Button** with its **Label** and **Link**. See [Editor](./editor.md).
5. Switch between **Desktop**, **Tablet** and **Mobile** and check the content fits. [Responsive layout](./responsive-layout.md) explains inheritance.
6. Click **Save** and wait for **All changes saved**. Click **Preview** to play the selected slide's animations; **Open saved draft preview** opens the saved draft separately for an authorized editor.
7. Click **Publish**. Check for **The slider is published.** Saving alone does not update the live site.

## Add it to a WordPress page

### Shortcode

Click **Copy embed code** in the editor or slider list. Paste it into a WordPress **Shortcode** block, for example:

```text
[sw_slider id="123"]
```

Use the copied ID, not the example number. Save/publish the WordPress page and inspect its frontend as a visitor.

### Block

Insert **SW SliderMan** in the WordPress block editor and choose the published slider in the block sidebar. The block uses the same renderer as the shortcode. Multiple sliders, including repeated instances, can appear on a page.

Only published sliders render publicly. An unpublished, trashed or otherwise unavailable slider shows an editor notice but nothing to visitors. [Troubleshooting](./troubleshooting.md) covers missing output.

For theme developers, the same renderer is available through `sws_render_slider( 123 );`; passing `false` as the second argument returns markup instead of echoing it. See the [README](https://github.com/sw-wordpress/sw-sliderman#usage).

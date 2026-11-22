# Troubleshooting and maintenance

## The editor does not load

**The SW Sliderman editor has not been built** or a missing vendor-directory notice means a source checkout was installed without compiled assets or the production autoloader. Install a trusted built plugin ZIP; do not try to fix this by installing documentation dependencies in WordPress. See [Getting started](./getting-started.md).

If Sliderman or publishing/import controls are missing, ask an administrator to check the required capabilities and current login. Editing, publishing, font management and import are separately authorized. A logged-in user does not automatically have all of them.

## Nothing appears on a page

1. Check the shortcode ID or the **SW SliderMan** block selection.
2. Confirm the slider was **Published**, not only saved, and is not in **Trash**.
3. Ensure at least one slide is enabled and the required layers are not hidden for the current container width.
4. If publication failed, resolve the reported image/font/file problem and publish again; failed publication never replaces an existing live snapshot.
5. Test the actual frontend as a visitor. Editors can see an unavailable-slider note where visitors see nothing. A later draft is not public until published.

Theme/page-builder container width affects responsive selection. If the content exists but is cut off or tiny, check the [responsive stage and overrides](./responsive-layout.md).

## Saving fails or a version conflict appears

Fix marked invalid fields first. A missing image/font or oversized document can prevent publication. **Try again** retries saving after the underlying failure is resolved.

For **Version conflict**, preserve **Export my changes** before **Discard and reload**, close duplicate tabs, and reapply intended edits to the current server draft. Do not assume browser storage or exported recovery JSON replaces a full portable package. The [editor recovery guide](./editor.md#recovery-and-conflicts) explains the distinction.

## Font installation is queued or unavailable

Keep **Sliderman → Fonts** open or choose **Continue processing**. Check **Offline mode**, the job error and **Retry** where offered. Installed fonts still work in offline mode. Verify the font's weight/style and character coverage if text uses a system fallback.

**Upload origin differs: local font loading is disabled.** requires same-origin delivery of the plugin's upload files. **Files missing** needs local restoration/repair. See [Local fonts](./fonts.md).

## Package processing stalls or a ZIP is rejected

Use **Check import status** in the same tab before starting another import. After an uncertain hard interruption, also inspect the slider list. Ensure ZipArchive, private writable temporary storage, local files, upload permissions and server request-size limits are available. Rejected encrypted/SVG/unsafe/oversized archives cannot be enabled with an editor switch. See [package limits](./templates-and-packages.md#limits-and-rejected-files).

## Animation or particles are static

Check reduced-motion preferences, JavaScript availability, the selected effect and its module/version, and whether the slider is paused/offscreen. WebGL2/GPU or module failures intentionally show the static fallback; they do not justify requiring visitors to turn off accessibility preferences. Use normal text layers for essential information. See [Playback and effects](./playback-and-effects.md).

## Plugin updates

Update-check status appears in the SW Sliderman row under **Plugins → Installed Plugins**. Checks use GitHub; installation is an explicit native WordPress update action and automatic installation is blocked. Use only a trusted package/update source; verification or release-signing problems must be resolved by a maintainer, not bypassed by disabling checks.

Back up before updating this preview plugin. Trust-key bootstrap and release configuration are maintainer responsibilities, documented in the [update operations guide (German)](https://github.com/sw-wordpress/sw-sliderman/blob/master/docs/GITHUB-UPDATES-BETRIEB.md).

## Deactivate or delete the plugin

Deactivation retains sliders, revisions, fonts and settings. Deleting the plugin removes its capabilities and version marker, but sliders, revisions and installed files under `wp-content/uploads/sw-sliderman/` remain. If permanent removal is required, arrange a site backup and deliberate manual data cleanup; do not treat plugin deletion as automatic erasure of content or private draft material.

For a reproducible unresolved problem, record plugin/WordPress/PHP versions, the exact safe error text, steps and whether it affects a saved draft or published output. Report via the [repository issues](https://github.com/sw-wordpress/sw-sliderman/issues), omitting credentials, private draft contents and personal data.

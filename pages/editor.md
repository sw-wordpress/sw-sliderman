# Editor, drafts and revisions

## Slides and layers

Open **Sliderman → Sliders** and choose **Edit**. The left side contains **Slides** and **Layers**, the centre contains the stage, and **Properties** has **Layer**, **Slide** and **Slider** tabs.

- Use **Add slide**, **Duplicate**, **Move up**, **Move down** and **Delete** to manage slides. In the slide properties, change **Slide name**, **Duration**, **Background** colour/image and optional **Overlay**.
- Use **Add layer** to add **Text**, **Image**, **Button**, **Shape** or **Effect**. Select a layer to edit its properties; rename layers so they can be identified later.
- Arrange layer stacking with **Bring forward** / **Send backward**. **Lock layer** protects canvas editing. **Hide on this screen size** changes visibility for the current responsive range, not all sizes.

### Layer content

| Type | Main controls and checks |
| --- | --- |
| Text | Limited rich text: paragraphs, line breaks, bold, italic and links. Set **Semantic element** deliberately (paragraph, heading or text block); use a heading level that fits the page. **Typography** offers installed fonts and available weights/styles. |
| Image | Choose a media-library image, set **Alternative text**, or mark it **Decorative (no alternative text)** only when it conveys no information. Use **Fit** and focal-point controls to inspect cropping; a link is optional. |
| Button | Set **Label**, **Link** and optional **Open in a new tab**. Check **Button states**, including hover and **Focus outline**, so keyboard focus remains visible. |
| Shape | Choose rectangle/circle and adjust colour, border and corner radius. Shapes are decoration, not replacement text or links. |
| Effect | Choose an available module/preset and a **Static image**; see [Playback and effects](./playback-and-effects.md#particle-effect-layers). |

Navigation links accept `https://`, `http://`, `mailto:`, `tel:`, site-relative `/path` or `#anchor`. Arbitrary HTML, JavaScript, CSS and script URLs are not supported. Use only links and media appropriate for publication.

## Canvas controls

Drag to move a layer; handles resize it and the round handle rotates it. **Shift** keeps the aspect ratio when resizing and snaps rotation to 15° steps. Arrow keys move by 1 logical pixel, or 10 with Shift; **Esc** cancels a gesture. Use numeric **Position and size** controls for exact placement.

Multiple selected layers can move together; **Align and distribute** arranges them. The toolbar provides grid/snapping and zoom. Zoom changes the workspace view, not the saved stage dimensions. **Undo** / **Redo** are also available as Ctrl+Z / Ctrl+Y; text input fields retain their editing behavior.

## Save, preview and publish are different

- **Save** writes the draft. Autosave also saves after inactivity; always check the displayed status before leaving.
- **Preview** plays the selected slide in the canvas. **Open saved draft preview** shows the saved draft in a separate, permission-protected frontend view. Save first to include the latest edits. This is not a public share link.
- **Publish** validates content and referenced resources before replacing the live snapshot. A failed publication leaves the previous live version unchanged. After later edits the status becomes **Published, newer draft** until publishing again.

Under **Revisions**, select an earlier revision and choose **Restore**. Current changes are saved first; the restored revision becomes a new draft, not an automatic rollback of the live site. Inspect it, then publish if it should replace the visible version.

## Recovery and conflicts

Work on a slider in one tab at a time. If **This slider was changed elsewhere.** appears, nothing was silently overwritten. **Export my changes** downloads a local JSON copy for preservation; then **Discard and reload** loads the server version. This recovery JSON is not the portable ZIP format and is not an import button workflow. Reapply the needed edits deliberately.

**Unsaved changes found in this browser.** offers **Restore** or **Discard** when a compatible recovery copy exists. Copies contain draft content/title in local browser storage, not media or authentication nonces. Browser storage may be blocked or cleared: it is a best-effort recovery aid, not a backup. Do not clear browser data or use a shared browser carelessly while recovering private drafts.

Invalid values stop saving/publishing; fix the marked fields instead of repeatedly reloading. The document is limited to **50 slides**, **100 layers per slide** (including at most **3 effect layers**) and **512 KiB** serialized document data. Keep large image files in the media library rather than embedding content in text fields.

## Manage existing sliders

The slider list supports **Search sliders**, **Duplicate**, **Active** and **Trash**. A duplicate is a new unpublished slider; existing installed resources remain shared.

**Move to trash** immediately removes public output from pages using that slider; revisions and fonts remain. **Restore** returns it from Trash. **Delete permanently** requires confirmation and removes the slider, revisions and published version; it cannot be undone. Keep a full [ZIP export](./templates-and-packages.md) and site backup when preservation matters.

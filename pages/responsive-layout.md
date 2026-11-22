# Responsive layout

Sliderman uses the **slider container width**, not necessarily the browser window width. A slider in a narrow column may use its mobile layout on a desktop monitor.

## Defaults for a new slider

| Range | Container width | Logical stage width × height |
| --- | --- | --- |
| Desktop | From 1024 px | 1440 × 600 px |
| Tablet | 768–1023 px | 1024 × 560 px |
| Mobile | Below 768 px | 390 × 520 px |

Under **Properties → Slider → Screen sizes (container width)**, edit thresholds and **Stage width** / **Stage height**. Thresholds must increase from mobile to tablet to desktop. The stage is proportionally scaled to the available width, including its text: it does not automatically reflow like ordinary page text.

**Boxed** layout has a default **Maximum width** of **1440 px**. **Full width** fills the available container; it does not bypass the surrounding theme/page-builder layout to guarantee full browser width.

## Set a mobile override

1. Build the desktop composition first.
2. Switch **Edited screen size** to **Tablet**, then **Mobile**. Use **Preview width (px)** to test widths within each range, including near its smallest edge.
3. Select a layer and adjust properties such as position, width and font size. A changed responsive field becomes **Own value** for that range.
4. Use **Reset to inherited value** to remove an override rather than entering a guessed desktop value.
5. Switch back to Desktop and confirm the base composition is unchanged. Save, then inspect the saved draft preview inside the actual page/container layout before publishing.

Values inherit property by property: **Desktop → Tablet → Mobile**. A mobile field without its own override inherits the tablet value if one exists, otherwise desktop. The UI identifies the source as **inherited from desktop** or **inherited from tablet**. Resetting a field restores inheritance, not a factory default.

## Keep the content readable

- Increase mobile font size and give text enough width/height instead of relying on desktop text being shrunk.
- Use horizontal/vertical anchors to control positioning, and check the resulting composition at several widths.
- Set **Hide on this screen size** only for content that is genuinely unnecessary there; it hides the layer for that range without deleting it.
- Inspect **Checks** for layers extending outside the stage and small rendered text. **No layout problems found.** is not a contrast/accessibility certification.
- Check image focal points and the beginning of any zoom effect so important subjects are not cropped.

The fixed-stage model is not a general page builder. Changes to browser width, theme columns or mobile stage dimensions can change the displayed size substantially. Confirm the real frontend, not just the editor's zoomed canvas.

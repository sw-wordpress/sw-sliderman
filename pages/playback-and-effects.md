# Playback and effects

## Slider playback

In **Properties → Slider**, new sliders start with **Autoplay (with pause button)** off; **Loop**, **Arrows** and **Dots** are on. The accessible name falls back to the slider name when **Accessible name** is empty. Give it a meaningful label when the internal name is unsuitable for visitors.

Arrows/dots provide navigation when there are multiple slides. Touch users can swipe horizontally without replacing normal vertical page scrolling. With autoplay enabled, a pause/start control is shown; hover/focus, a hidden tab or an offscreen slider pause automatic slide changes. A visitor's manual pause is not automatically undone.

Without JavaScript the first slide remains static and navigation controls are hidden. With reduced-motion preferences, content is static and autoplay is disabled; manual navigation remains available. Do not put essential information only on later automatically timed slides.

## Timing and animation

1. In **Properties → Slide**, set **Duration** (a new slide starts at **6 seconds**).
2. Choose **Transition to this slide**: **Cut**, **Fade** or **Push**, and **Transition duration** (new-slide default: Fade, **600 ms**).
3. Select a layer and open **Animation**. Choose **Entrance**, start, duration and easing. Keep **Visible until slide end**, or choose **Timed exit** and configure the exit preset, start and duration.
4. Use **Preview** to play the selected slide. The editor shows when the layer animation schedule requires a longer slide duration; the slide remains visible for at least that long.
5. Save, inspect the saved draft preview, then publish and check navigation/links on the real page.

A slide's duration is constrained to **1–60 seconds**, transitions to at most **3 seconds**, and individual animation durations to at most **10 seconds**. This editor provides entrance/exit settings, not a full keyframe timeline.

## Optional slide effects

Under **Slide → Effects**, enable **Cinematic depth** and/or **Light sweep**; both are off by default. Cinematic depth moves/scales the background and stage once per activation; inspect cropping at the beginning. Light sweep adds a single decorative light band. Select **Masked reveal from left** or **Circular reveal** in a layer's animation controls for masked entrance/exit.

Reduced motion shows the readable static end state, without the depth/sweep animations. These slide effects are not continuous scroll/parallax controls. Implementation details remain in the [effects reference](https://github.com/sw-wordpress/sw-sliderman/blob/master/docs/effects.md).

## Particle effect layers

1. Choose **Add layer → Effect** and select **Particle field** under **Effect type**.
2. Start with a **Presets** choice, then adjust the exposed **Spawn**, **Lifecycle**, **Forces and behaviour**, **Appearance**, **Camera** and pointer controls. Image-based presets use **Media → Image to rebuild**.
3. Set **Static image** and its **Alternative text of the static image**. This is distinct from an image used to build particles: configure the fallback explicitly.
4. Use **Preview**, check the chosen quality setting on the intended device, and test the static content with reduced motion. At most three effect layers can be added per slide.

**Quality → Automatic** adapts quality when rendering is slow; fixed settings stay fixed. Lower quality or fewer particles may be needed on slower devices. Continuous effects have a pause/start button even without autoplay and on a single slide. They pause when hidden/offscreen or manually paused; unlike autoplay, interactive GPU effects do not pause merely on hover/focus.

Without JavaScript, WebGL2/GPU support, a usable module, or with reduced motion, the static fallback is shown instead. If no fallback image is provided, that layer has no replacement picture. Keep essential text/links in ordinary layers, not solely in a particle reconstruction.

If an add-on effect is unavailable, the editor warns and visitors see its static image. Another saved parameter version may also require a fallback; do not discard or overwrite unfamiliar parameters just to remove a notice. No broad device/performance guarantee is established. Advanced module behavior and limits are documented in the [GPU effects reference](https://github.com/sw-wordpress/sw-sliderman/blob/master/docs/GPU_EFFECTS.md).

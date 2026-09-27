# Particles — Webflow integration

Interactive particle backgrounds for Webflow sections. You don't need a build step or a framework: add one script to the site, then configure each section with `data-*` attributes.

## 1. Add the script (once, site-wide)

In **Site settings → Custom code → Footer code**, add:

```html
<script type="module" src="https://cdn.jsdelivr.net/gh/<org>/<repo>@<version>/dist-runtime/particles.js"></script>
```

Always pin a version tag (`@1.0.0`), never `@latest` or a branch. A pinned URL never changes, so jsDelivr and browsers can cache it permanently.

`particles.js` is a ~4 kB loader. It downloads the WebGL engine (`engine.js`, ~138 kB gzip, mostly Three.js) only when a particle section comes near the viewport. Pages without particle sections never load the engine.

### Using the site's `window.libs` loader instead

To load it through the shared lazy loader in the site's base code, add:

```js
/* PARTICLES (Three.js engine) */
window.loadParticles = () => {
  if (!document.querySelector("[data-particles]")) return Promise.resolve();
  return window.libs.load("particles", () =>
    import("https://cdn.jsdelivr.net/gh/<org>/<repo>@<version>/dist-runtime/particles.js")
  );
};
```

It must use `import()`, not `window.libs.script()`. The file is an ES module that loads its engine relative to its own URL, and as a classic `<script>` that path would resolve against the page instead.

Three.js is bundled into `engine.js` (only the parts used), so there's no separate Three.js CDN script to load. The engine is fetched once per page and shared by every particle section, all drawing through one WebGL context. It only starts after the `load` event, when the browser is idle and a particle section is near the viewport.

## 2. Mark up a section

Each site section has its own look, saved as a named **preset** in this repo (`src/runtime/presets.json`). Select the Section or Div block, open **Element settings → Custom attributes**, and add two attributes:

| Name | Value |
|---|---|
| `data-particles` | *(empty)* |
| `data-preset` | `hero` *(the section's preset name)* |

### Sections

| Section | Put the attributes on | Preset |
|---|---|---|
| CTA ("See how Clarify solves yours", Figma `13311:5898`) | the rounded card (`13311:5899`), not the outer section | `cta` |

The card must keep `overflow: clip` (or `hidden`) and its border radius as in Figma. The graph is larger than the card, and the card crops it.

That's all. Looks are designed and changed in the playground, not in Webflow. To restyle a section later, update its preset and release a new version. The Webflow markup stays the same. The script adds a `<canvas>` inside the element:

- **Background:** it sits behind the element's content but above the element's own background color or image.
- **Clicks:** the canvas never blocks clicks.
- **Layout:** it follows the element's size, border radius and `overflow` clipping.

The element can be a full section, a hero, or a card inside a grid. The script sets `position: relative` on the element (if it was static) and `isolation: isolate` so layering works. Nothing else is changed.

> Custom code doesn't run in the Webflow Designer canvas. Check the effect in **Preview** or on the published staging site.

## Configuration

Presets are the recommended route. Settings can also be overridden per element, resolved in this order (later wins):

1. Defaults
2. `data-preset="name"`: a named look from `src/runtime/presets.json`
3. `data-config='{"shape":"sphere", ...}'`: JSON (the playground's "Copy Webflow attributes" outputs this for unsaved looks)
4. Individual attributes such as `data-shape="sphere"` or `data-count="4000"`

Attribute names are the config keys in kebab-case (`sizeMin` → `data-size-min`). If you mistype a name or value, the browser console shows a warning that names the element.

### Particle shapes: `data-particles` (default)

| Attribute | Default | Notes |
|---|---|---|
| `data-shape` | `concentricRings` | `chaosField` `noiseLines` `straightLines` `terrain` `waterfall` `nebula` `veins` `concentricRings` `square` `triangle` `sphere` `cube` `torus` `torusKnot` `hexCone` `octahedron` `icosahedron` `dodecahedron` `stellated` `gem` `cubesIntersect` `crossCubes` `interlock` `sacredGeometry` |
| `data-count` | `6000` | Particle count on desktop |
| `data-count-mobile` | half of count | Particle count under 768px width |
| `data-size-min` / `data-size-max` | `1` / `2.5` | |
| `data-opacity-min` / `data-opacity-max` | `0.15` / `1` | |
| `data-color-mode` | `single` | `single`, `gradient`, `hueRange` |
| `data-color1` / `data-color2` | `#ffffff` / `#33aaff` | Hex colors |
| `data-hue-min` / `data-hue-max` | `180` / `220` | For `hueRange` |
| `data-chaos` | `0` | 0 = formed shape, 1 = full scatter |
| `data-ease` | `0.06` | How fast particles settle into the shape |
| `data-speed` | `0` | Shape animation speed |
| `data-idle-motion` | `true` | Slow drift |
| `data-auto-rotate` | `true` | Tumble for 3D shapes |
| `data-rot-x` / `-y` / `-z` | `0` | Base rotation in degrees |
| `data-inner-copies` | `1` | Nested copies of 3D shapes |
| `data-seed` | `1234` | Change for a different random layout |

### Node graph: `data-particles="graph"`

| Attribute | Default | Notes |
|---|---|---|
| `data-mode` | `hubBurst` | `hubBurst`, `geoSphere`, `burstSphereMorph`, `coneTorusMorph`, `sequence` |
| `data-sequence` | `constellation,torus,helix,galaxy` | Shapes looped in `sequence` mode: `constellation` `clusters` `spiral` (these three share the dense "network" style: mesh plus a fan into one fixed hub) `burst` `sphere` `globe` `cone` `torus` `helix` `cube` `galaxy` `knot` `atom` `icosa` `wave`. `galaxy`, `wave` and `burst` are flat, so they turn edge-on under a strong idle rotation |
| `data-hold-time` / `data-morph-time` | `4` / `2.5` | Seconds on each shape / per transition |
| `data-stagger` | `0.35` | 0–1: nodes start their move at different times |
| `data-morph-implode` / `data-morph-swirl` | `0` / `0` | Mid-morph pull toward the core (0–1) and swirl (radians) |
| `data-fit` / `data-fit-padding` | `false` / `16` | Keep every shape fully inside the canvas (never clipped) |
| `data-anchor-left` | `false` | Keep only the left edge inside (for effects beside text); it may bleed off top, right and bottom |
| `data-morph-scatter` | `0` | Scatter & reform: nodes fling outward mid-morph (never leftward), lines dim |
| `data-hover-glow` | `0` | 0–1: nodes near the cursor grow/brighten, their lines light up |
| `data-hover-path` | `false` | Hovering near a node traces its route through the network to the hub |
| `data-pulses` / `data-pulse-speed` / `data-pulse-size` / `data-pulse-color` | `0` / `180` / `3` / `#a4c9e9` | Data pulses traveling the lines toward the hub (count, px/s, size, color) |
| `data-depth` | `0` | 0–1: perspective, far nodes smaller and dimmer |
| `data-parallax` | `0` | Tilt toward the cursor anywhere over the section (radians) |
| `data-intro` | `0` | Seconds for the nodes to fly in once a quarter of the section is visible (0 = off) |
| `data-opacity-min` / `data-opacity-max` | `0.45` / `1` | Node brightness range |
| `data-count` | `140` | Nodes |
| `data-size-min` / `data-size-max` | `4` / `14` | |
| `data-color` / `data-line-color` | `#e8e8e8` | |
| `data-line-opacity` / `data-line-width` | `0.25` / `1` | Line width in CSS px |
| `data-center-x` / `data-center-y` / `data-scale` | `0.5` / `0.5` / `1` | Placement in the element |
| `data-rot-x` / `-y` / `-z` | `0` | Base orientation in degrees |
| `data-tiers` | `0` | Quantize node sizes into N steps |
| `data-morph-hold` | `0.5` | Morph position when `data-morph-speed="0"` |
| `data-morph-speed` | `0.4` | Morph modes only |
| `data-idle-rotation-speed` | `0.08` | |
| `data-idle-tilt-amount` | `0.35` | |
| `data-seed` | `4321` | |

### Shared

| Attribute | Default | Notes |
|---|---|---|
| `data-background` | `transparent` | `transparent` shows the Webflow background; a hex color paints the canvas |
| `data-blend` | `additive` (points), `normal` (graph) | Use `normal` for dark particles on light backgrounds |
| `data-interactive` | `true` | Hover repel and click reactions |
| `data-softness` | `1` | Dot edge: `1` soft glow, `0` solid disc |
| `data-solid` | `false` | Opaque dots (brightness from dimming, not transparency) |
| `data-canvas-inset` | `0` | CSS inset of the effect inside the element, e.g. `0 0 0 50%` = right half only |
| `data-edge-fade` | `0` | px of soft fade on inset edges (hides the clip line) |
| `data-hover-radius` / `data-hover-strength` | `120` / `1.2` (graph: `140` / `1`) | |
| `data-click-behavior` | `burst` | `burst`, `reshuffle`, `ripple` (graph: a light wave through the connections), `none` |

Clicks on links, buttons, form fields and anything marked `data-particles-ignore` never trigger the click effect. Clicking the empty effect area never starts a text selection.

**Button tie-in:** add `data-particles-excite` to any element inside the section (the CTA's "Get started" button). Hovering or focusing it makes the network pulse with light, "ready to activate": the hub beats, the lines and nodes throb, and the data pulses speed up.

## Performance and accessibility (built in)

- **One WebGL context for the whole page**, no matter how many sections use it.
- **Pausing:** the animation stops completely when no particle section is on screen or the tab is hidden.
- **Resolution cap:** rendering is capped at 2× pixel density (1.5× on phones).
- **Phones:** use half the particles by default.
- **Resizes** (including the mobile address bar showing or hiding) never reset the animation.
- **`prefers-reduced-motion`:** a single still frame of the formed shape, with no animation.
- **No WebGL:** the section just shows its normal Webflow design.
- **Screen readers:** the canvas is `aria-hidden`.

## JavaScript API (optional)

The script sets up every section on page load. These calls are only needed for content that appears later, or for page-transition libraries:

```js
ClarifyParticles.init(container?)   // mount new [data-particles] elements (e.g. after CMS load / page transition)
ClarifyParticles.destroy(element?)  // tear down one element, or all
ClarifyParticles.refresh(element?)  // re-read attributes after changing them
ClarifyParticles.debug()            // live engine state (loop, WebGL context, sections, recent events)
```

If a section is removed from the page without calling `destroy()`, the script frees its GPU resources automatically.

Each element fires a `particles:ready` event (it bubbles) on its first drawn frame, when the effect starts fading in. Use it to time intro animations:

```js
section.addEventListener("particles:ready", () => gsap.from(".cta__content", { opacity: 0, y: 12 }));
```

## Development (this repo)

```bash
npm install
npm run dev              # playground: design section looks, save presets
npm run build:runtime    # production files -> dist-runtime/
npm run preview:runtime  # test page with several sections -> /demo.html
```

### Designing a section's look (playground)

The playground previews through the production engine, so what you see is what the site draws.

1. **Section panel:** pick an existing preset to edit, or keep `(new)`.
   - Set **Frame** to roughly the section's shape (full, 16:9, square card, mobile). Shapes scale to their container.
   - Set **Section color** to the section's Webflow background.
2. **Particles / Graph panel:** tune the look. Most controls apply live; count and size rebuild the particles.
3. **Save the preset:** type a name (`hero`, `services`…) and click **Save preset**. This writes `src/runtime/presets.json`, storing only values that differ from the defaults.
4. **Release:** rebuild and release (below). In Webflow, the section uses `data-preset="<name>"`.

Saving only works under `npm run dev`. A static build of the playground can still copy `data-config` attributes.

To release: run `npm run build:runtime`, commit `dist-runtime/`, then tag (`git tag v1.0.0 && git push --tags`). Update the version in the Webflow script tag.

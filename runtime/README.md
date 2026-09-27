# Particles — Webflow integration

Interactive particle backgrounds for Webflow sections. You don't need a build step or a framework: add one script to the site, then configure each section with `data-*` attributes.

## 1. Add the script (once, site-wide)

In **Site settings → Custom code → Footer code**, add:

```html
<script type="module" src="https://cdn.jsdelivr.net/gh/<org>/<repo>@<version>/dist-runtime/particles.js"></script>
```

Always pin a version tag (`@1.0.0`), never `@latest` or a branch. A pinned URL never changes, so jsDelivr and browsers can cache it permanently.

`particles.js` is a ~4 kB loader. It downloads the WebGL engine (`engine.js`, ~138 kB gzip, mostly Three.js) only when a particle section comes near the viewport. Pages without particle sections never load the engine.

## 2. Mark up a section

Select a Section or Div block and open **Element settings → Custom attributes**. Add `data-particles`, which can have an empty value. Then add either a preset or individual settings:

| Name | Value |
|---|---|
| `data-particles` | *(empty)* |
| `data-preset` | `rings` |

That's all. The script adds a `<canvas>` inside the element:

- **Background:** it sits behind the element's content but above the element's own background color or image.
- **Clicks:** the canvas never blocks clicks.
- **Layout:** it follows the element's size, border radius and `overflow` clipping.

The element can be a full section, a hero, or a card inside a grid. The script sets `position: relative` on the element (if it was static) and `isolation: isolate` so layering works. Nothing else is changed.

> Custom code doesn't run in the Webflow Designer canvas. Check the effect in **Preview** or on the published staging site.

## Configuration

Settings are resolved in this order, and later ones win:

1. Defaults
2. `data-preset="name"`: a named look defined in `src/runtime/presets.ts`
3. `data-config='{"shape":"sphere", ...}'`: JSON (the playground's copy button outputs this)
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
| `data-mode` | `hubBurst` | `hubBurst`, `geoSphere`, `burstSphereMorph`, `coneTorusMorph` |
| `data-count` | `140` | Nodes |
| `data-size-min` / `data-size-max` | `4` / `14` | |
| `data-color` / `data-line-color` | `#e8e8e8` | |
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
| `data-hover-radius` / `data-hover-strength` | `120` / `1.2` (graph: `140` / `1`) | |
| `data-click-behavior` | `burst` | `burst`, `reshuffle`, `none` |

Clicks on links, buttons, form fields and anything marked `data-particles-ignore` never trigger the click effect.

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
```

If a section is removed from the page without calling `destroy()`, the script frees its GPU resources automatically.

## Development (this repo)

```bash
npm install
npm run dev              # playground: design looks
npm run build:runtime    # production files -> dist-runtime/
npm run preview:runtime  # test page with several sections -> /demo.html
```

To release: run `npm run build:runtime`, commit `dist-runtime/`, then tag (`git tag v1.0.0 && git push --tags`). Update the version in the Webflow script tag.

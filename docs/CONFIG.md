# Configuration reference

Markup: `[data-particles-component]` > `[data-particles-wrap]`. The script creates `div.u-particles-threejs` in the wrap, with the canvas at 100% × 100% inside it. Style that class in Webflow to set the effect's area (see runtime/README.md). Settings go on the component or the wrap, and the wrap wins.

Every setting can be part of a preset (`src/runtime/presets.json`, the recommended route) or be set per element. Resolution order, later wins:

1. **Defaults:** below.
2. **`data-preset="name"`:** a named look from `presets.json`.
3. **`data-config='{"key": value, ...}'`:** JSON.
4. **Individual attributes:** each key in kebab-case, e.g. `sizeMin` → `data-size-min`.

**Breakpoints:** a preset can carry `"breakpoints": [{ "maxWidth": 991, "config": { … } }, { "maxWidth": 430, "config": { … } }]` next to its `"config"`. Like CSS max-width media queries, every tier the screen is at or under applies on top of `config`, widest first, so narrower tiers win (and all before `data-config` and individual attributes). Use them when a smaller screen needs a different composition (e.g. `cta`: stacked band from 991 down, its phone look from 430 down). Crossing any tier's width (resize, rotation) re-mounts every effect so the right set applies.

Unknown keys and invalid values print a `[particles]` console warning that names the element. Webflow's own `data-w-*` / `data-wf-*` attributes are ignored.

The type comes from the preset (it carries its own). Without a preset, `data-particles-component="graph"` (or legacy `data-particles="graph"`) selects a **node graph**, and anything else gives **points** (a particle-field shape).

## Shared (both types)

| Key | Default | Notes |
|---|---|---|
| `background` | `transparent` | `transparent` shows the element's own background; a hex color paints the canvas |
| `blend` | `additive` (points) / `normal` (graph) | Use `normal` for dark particles on light backgrounds |
| `interactive` | `true` | Hover and click reactions |
| `touchHover` | `true` | A finger drives the hover reactions (glow, push, parallax, the excite button). `false`: touch only taps (and spins, with `touchSpin`), since phones have no hover |
| `touchSpin` | `false` | Touch "drag to spin" (graph and points): a sideways drag on the effect's zone turns it, and it coasts on after release (the tilt from any up/down part eases back). Sets `touch-action: pan-y pinch-zoom` on the zone, so up/down swipes still scroll the page and pinch-zoom still works |
| `touchHold` | `0` | With `touchSpin`: a finger held still this long (ms) grabs the effect outright (it lights up), and then up/down drags turn it too instead of scrolling. Also turns off the iOS callout/selection on the zone. `0` = off |
| `softness` | `1` | Dot edge: `1` soft glow, `0` crisp disc |
| `solid` | `false` | Opaque dots: brightness from dimming the color, so lines behind don't show through |
| `mobileDpr` | `1.5` | Resolution cap (device-pixel ratio) under 768 px; desktop is 2. `2` is noticeably crisper on 3× phones for ~1.8× the pixels |
| `bleed` | `false` | The canvas covers the whole component; `.u-particles-threejs` only places and sizes the effect, so nothing is cut at its edges (only by the component's own clipping). Content that should sit above it needs `position: relative; z-index: 1` |
| `countMobile` | `0` | Count under 768 px width; `0` = half of `count` (points only) |
| `sizeScaleMobile` | `1` | Dot size multiplier under 768 px width (points only) |
| `hoverRadius` / `hoverStrength` | `120` / `1.2` (graph `140` / `1`) | Pointer push |
| `clickBehavior` | `burst` | `burst`, `reshuffle`, `ripple` (graph), `none` |
| `seed` | `1234` (graph `4321`) | Change for a different random layout |

## Points (`data-particles`)

| Key | Default | Notes |
|---|---|---|
| `shape` | `concentricRings` | `chaosField` `noiseLines` `straightLines` `terrain` `waterfall` `nebula` `veins` `concentricRings` `square` `triangle` `sphere` `cube` `torus` `torusKnot` `hexCone` `octahedron` `icosahedron` `dodecahedron` `stellated` `gem` `cubesIntersect` `crossCubes` `interlock` `sacredGeometry` `meridians` `spiral` `burst` (hero shape study, round) |
| `parallax` | `0` | The shape turns toward the pointer over the whole section (radians, as the graph's) |
| `gather` | `true` | On load the dots fly in from a scatter; `false` = they start formed |
| `sequence` / `holdTime` | `""` / `6` | Shapes looped in order, e.g. `sphere,meridians,spiral,burst` (`""` = just `shape`): each held `holdTime` s, then a `morphTime` morph to the next |
| `holdShape` | `""` | Morph to this shape and stay (overrides the sequence; `""` = off). Can be set live with `ClarifyParticles.set()` |
| `morphTime` / `stagger` | `2` / `0.4` | That morph: seconds, and how spread out the dots' start times are (0..0.9) |
| `count` | `6000` | |
| `sizeMin` / `sizeMax` | `1` / `2.5` | |
| `opacityMin` / `opacityMax` | `0.15` / `1` | |
| `colorMode` | `single` | `single`, `gradient`, `hueRange` |
| `color1` / `color2` | `#ffffff` / `#33aaff` | |
| `hueMin` / `hueMax` | `180` / `220` | For `hueRange` |
| `chaos` | `0` | `0` = formed shape, `1` = full scatter |
| `ease` | `0.06` | Settle speed |
| `speed` | `0` | Shape animation speed |
| `idleMotion` / `autoRotate` | `true` / `true` | |
| `rotX` / `rotY` / `rotZ` | `0` | Degrees |
| `innerCopies` | `1` | Nested copies of 3D shapes |
| `scale` | `1` | Size multiplier around the canvas center; above 1 the shape bleeds off the canvas |
| `scaleByWidth` | `false` | Size from the canvas width instead of its shorter side, so a shape fills a wide band (mobile) |
| `hoverGlow` | `0` | Dots near the pointer light up (brighter, up to 60% bigger) within 1.3 × `hoverRadius`, the graph's hover glow; `0` = off |
| `fit` / `fitPadding` | `false` / `8` | Keep the shape inside its zone: shrink it (never grow) so the outer radius stops `fitPadding` px inside every edge |

## Graph (`data-particles="graph"`)

### Shape and loop

| Key | Default | Notes |
|---|---|---|
| `mode` | `hubBurst` | `hubBurst`, `geoSphere`, `burstSphereMorph`, `coneTorusMorph`, `sequence` |
| `sequence` | `constellation,torus,helix,galaxy` | Shapes looped in `sequence` mode. **Network style:** `constellation`, `clusters`, `spiral` (dense mesh plus a fan into one fixed hub, round). **Others:** `burst`, `sphere`, `globe`, `cone`, `torus`, `helix`, `cube`, `galaxy`, `knot`, `atom`, `icosa`, `wave`. The flat ones (`burst`, `galaxy`, `wave`) turn edge-on under strong idle rotation. |
| `holdTime` / `morphTime` | `4` / `2.5` | Seconds on each shape / per transition |
| `stagger` | `0.35` | 0–1: nodes start moving at different times |
| `morphHold` | `0.5` | How far `constellation` blends toward the sphere (the fan strength is 1 − this); also the held morph position when `morphSpeed` = 0 in the legacy morph modes |
| `morphSpeed` | `0.4` | Legacy ping-pong morph modes only |
| `morphScatter` | `0` | Scatter & reform: nodes fling outward mid-morph (never leftward) |
| `morphImplode` / `morphSwirl` | `0` / `0` | Mid-morph pull to the core (0–1) and swirl (radians) |

### Nodes and lines

| Key | Default | Notes |
|---|---|---|
| `count` | `140` | Nodes |
| `sizeMin` / `sizeMax` | `4` / `14` | |
| `opacityMin` / `opacityMax` | `0.45` / `1` | Brightness range across node weights |
| `tiers` | `0` | Quantize sizes and brightness into N steps (`0` = continuous) |
| `color` / `lineColor` | `#e8e8e8` | |
| `lineOpacity` / `lineWidth` | `0.25` / `1` | Width in CSS px |
| `spokeFraction` | `1` | Share of nodes that keep their spoke to the hub; the same nodes in every shape, so the fan stays steady through morphs |
| `nodeGap` / `gapColor` | `0` / `#000000` | Ring (CSS px) of `gapColor` (use the section background) around each node, so lines stop short of it |
| `lineGap` | `0` | Strip of `gapColor` (CSS px each side) under every line, so lines cut a clean path through a background pattern (`grid`) and read as on top of it. Fainter lines cut fainter strips |
| `snapSizes` | `false` | Round node sizes to whole device pixels (crisp edges) |
| `depthSize` | `true` | Depth also scales node size; `false`: depth only dims (far nodes stay crisp) |
| `sizeCurve` | `1` | Above 1 skews node sizes small: most nodes tiny, a few big (stronger hierarchy) |
| `nodeShape` | `round` | `round`, `square` ("pixel" nodes, like the eyebrow icon), or `mixed` (squares, with the biggest tier round) |

### Placement and motion

| Key | Default | Notes |
|---|---|---|
| `centerX` / `centerY` / `scale` | `0.5` / `0.5` / `1` | Center as a fraction of the canvas; size multiplier |
| `scaleByWidth` | `false` | Size from the canvas width instead of its shorter side, so the shape fills a wide band (mobile) |
| `fit` / `fitPadding` | `false` / `16` | Keep every shape fully inside the canvas |
| `anchorLeft` | `false` | Keep only the left edge inside; bleeds off top, right and bottom |
| `anchorBottom` | `false` | Keep the bottom edge inside (lifts the center when needed); bleeds off top, left and right |
| `rotX` / `rotY` / `rotZ` | `0` | Base orientation, degrees (`rotZ` is in-plane) |
| `idleRotationSpeed` / `idleTiltAmount` | `0.08` / `0.35` | |
| `depth` | `0` | 0–1: perspective, far nodes smaller and dimmer |
| `parallax` | `0` | Tilt toward the cursor over the whole section (radians) |

### Interaction and effects

| Key | Default | Notes |
|---|---|---|
| `hoverGlow` | `0` | 0–1: nodes near the cursor grow/brighten, their lines light up |
| `hoverPath` | `false` | Hover traces the route through the mesh to the hub |
| `rippleSpeed` | `7` | Click ripple speed (hops/s), with `clickBehavior: "ripple"` |
| `glow` | `0` | Soft background glow behind the network: peak opacity of an elliptical gaussian of `glowColor` (`0` = off). Drawn in WebGL (no CSS blur); node gap rings take its color so they don't show as dark specks |
| `glowColor` | `#1c2329` | Glow color |
| `glowX` / `glowY` | `0.5` / `0.5` | Glow center, as a fraction of the canvas width/height (with `bleed`, the whole component) |
| `glowSizeX` / `glowSizeY` | `0.35` / `0.4` | Glow spread (gaussian sigma), as a fraction of the canvas width/height |
| `grid` | `0` | Background pattern: a grid of small squares, lit by drifting lights and the hover trail, behind the network (`0` = off; value = overall opacity). One WebGL quad, no CSS |
| `gridPitch` / `gridDot` | `3` / `2` | Square spacing and size in CSS px, rounded to whole device pixels so the squares stay crisp |
| `gridColor` / `gridBase` | `#273037` / `0` | Every square's own color before any light, and its opacity |
| `gridHot` / `gridHotColor` | `0.6` / `#5f8db4` | Squares near the pointer light up in this color, up to this opacity |
| `gridHotRadius` / `gridHotFade` | `56` / `1.2` | Reach of the pointer light (px) and how long lit squares take to fade (s): a trail |
| `gridAuto` | `touch` | Soft lights drifting over the grid by themselves: `touch` (devices without hover), `always`, `off` |
| `gridAutoColor` / `gridAutoStrength` | `#5f8db4` / `0.6` | The drifting lights' own color and peak opacity (separate from the hover's) |
| `gridAutoCount` / `gridAutoSize` / `gridAutoSpeed` | `3` / `90` / `0.06` | How many drifting lights (max 4), their spread (px) and speed |
| `exciteRate` | `0.35` | Breaths/s while a `data-particles-excite` element is hovered; `0` = steady light-up |
| `pulses` / `pulseSpeed` / `pulseSize` / `pulseColor` | `0` / `180` / `3` / `#a4c9e9` | Data pulses traveling the lines to the hub |
| `intro` | `0` | Seconds for nodes to fly in once 25% of the section is visible (`0` = off) |

## Element-level markers

| Attribute | Effect |
|---|---|
| `data-particles-component` | The component root: settings + scope for its excite buttons |
| `data-particles-wrap` | Inside a component: where the script creates `div.u-particles-threejs` (defaults to the component) |
| `data-how-component` / `data-how-wrap` | Same as `data-particles-component` / `data-particles-wrap`, under the names the hero uses (v1.5.1) |
| `data-particles-excite` | Hovering or focusing it "excites" its component's effect (graph: lights up / breathes). In legacy markup: the nearest effect sharing a container. |
| `data-particles-ignore` | Clicks on this element never trigger the click effect (links, buttons and form fields are already excluded) |

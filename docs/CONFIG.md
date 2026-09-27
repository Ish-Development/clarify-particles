# Configuration reference

Every setting can be part of a preset (`src/runtime/presets.json`, the recommended route) or be set per element. Resolution order, later wins:

1. **Defaults:** below.
2. **`data-preset="name"`:** a named look from `presets.json`.
3. **`data-config='{"key": value, ...}'`:** JSON. The playground's "Copy Webflow attributes" produces this for unsaved looks.
4. **Individual attributes:** each key in kebab-case, e.g. `sizeMin` → `data-size-min`.

Unknown keys and invalid values print a `[particles]` console warning that names the element. Webflow's own `data-w-*` / `data-wf-*` attributes are ignored.

The type comes from the `data-particles` value: empty for **points** (a particle-field shape), or `graph` for a **node graph**. A preset carries its own type.

## Shared (both types)

| Key | Default | Notes |
|---|---|---|
| `background` | `transparent` | `transparent` shows the element's own background; a hex color paints the canvas |
| `blend` | `additive` (points) / `normal` (graph) | Use `normal` for dark particles on light backgrounds |
| `interactive` | `true` | Hover and click reactions |
| `softness` | `1` | Dot edge: `1` soft glow, `0` crisp disc |
| `solid` | `false` | Opaque dots: brightness from dimming the color, so lines behind don't show through |
| `canvasInset` | `"0"` | CSS inset of the effect inside the element, e.g. `"0 0 0 45%"` = right 55% |
| `edgeFade` | `0` | px of soft fade on inset edges |
| `countMobile` | `0` | Count under 768 px width; `0` = half of `count` (points only) |
| `hoverRadius` / `hoverStrength` | `120` / `1.2` (graph `140` / `1`) | Pointer push |
| `clickBehavior` | `burst` | `burst`, `reshuffle`, `ripple` (graph), `none` |
| `seed` | `1234` (graph `4321`) | Change for a different random layout |

## Points (`data-particles`)

| Key | Default | Notes |
|---|---|---|
| `shape` | `concentricRings` | `chaosField` `noiseLines` `straightLines` `terrain` `waterfall` `nebula` `veins` `concentricRings` `square` `triangle` `sphere` `cube` `torus` `torusKnot` `hexCone` `octahedron` `icosahedron` `dodecahedron` `stellated` `gem` `cubesIntersect` `crossCubes` `interlock` `sacredGeometry` |
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

### Placement and motion

| Key | Default | Notes |
|---|---|---|
| `centerX` / `centerY` / `scale` | `0.5` / `0.5` / `1` | Center as a fraction of the canvas; size multiplier |
| `fit` / `fitPadding` | `false` / `16` | Keep every shape fully inside the canvas |
| `anchorLeft` | `false` | Keep only the left edge inside; bleeds off top, right and bottom |
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
| `exciteRate` | `0.35` | Breaths/s while a `data-particles-excite` element is hovered; `0` = steady light-up |
| `pulses` / `pulseSpeed` / `pulseSize` / `pulseColor` | `0` / `180` / `3` / `#a4c9e9` | Data pulses traveling the lines to the hub |
| `intro` | `0` | Seconds for nodes to fly in once 25% of the section is visible (`0` = off) |

## Element-level markers

| Attribute | Effect |
|---|---|
| `data-particles-excite` | Hovering or focusing it "excites" the nearest particle effect (graph: lights up / breathes). It targets the effect sharing the closest container with it; the button doesn't need to be inside the effect's element. |
| `data-particles-ignore` | Clicks on this element never trigger the click effect (links, buttons and form fields are already excluded) |

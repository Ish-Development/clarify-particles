# Configuration reference

Markup: `[data-particles-component]` > `[data-particles-wrap]`. The script creates `div.u-particles-threejs` in the wrap, with the canvas at 100% × 100% inside it. Style that class in Webflow to set the effect's area (see runtime/README.md). Settings go on the component or the wrap, and the wrap wins.

Every setting can be part of a preset (`src/runtime/presets.json`, the recommended route) or be set per element. Resolution order, later wins:

1. **Defaults:** below.
2. **`data-preset="name"`:** a named look from `presets.json`.
3. **`data-config='{"key": value, ...}'`:** JSON.
4. **Individual attributes:** each key in kebab-case, e.g. `sizeMin` → `data-size-min`.

**Breakpoints:** a preset can carry `"breakpoints": [{ "maxWidth": 991, "config": { … } }, { "maxWidth": 430, "config": { … } }]` next to its `"config"`. Like CSS max-width media queries, every tier the screen is at or under applies on top of `config`, widest first, so narrower tiers win (and all before `data-config` and individual attributes). Use them when a smaller screen needs a different composition (e.g. `cta`: stacked band from 991 down, its phone look from 430 down). Crossing any tier's width (resize, rotation) re-mounts every effect so the right set applies.

Unknown keys and invalid values print a `[particles]` console warning that names the element. Webflow's own `data-w-*` / `data-wf-*` attributes are ignored.

The type comes from the preset (it carries its own). Without a preset, `data-particles-component="graph"` (or legacy `data-particles="graph"`) selects a **node graph**, `"map"` the **spatial map**, and anything else gives **points** (a particle-field shape).

## Shared (both types)

| Key | Default | Notes |
|---|---|---|
| `background` | `transparent` | `transparent` shows the element's own background; a hex color paints the canvas |
| `blend` | `additive` (points) / `normal` (graph) | Use `normal` for dark particles on light backgrounds |
| `interactive` | `true` | Hover and click reactions |
| `touchHover` | `true` | A finger drives the hover reactions (glow, push, parallax, the excite button). `false`: touch only taps (and spins, with `touchSpin`), since phones have no hover |
| `touchSpin` | `false` | Touch "drag to spin" (graph and points): a sideways drag on the effect's zone turns it, and it coasts on after release (the tilt from any up/down part eases back). Sets `touch-action: pan-y pinch-zoom` on the zone, so up/down swipes still scroll the page and pinch-zoom still works |
| `mouseSpin` | `false` | Mouse "drag to spin" (desktop, graph and points): press on the effect's zone and drag to turn it; it coasts on after release and the tilt eases back. The zone gets `cursor: grab` (`grabbing` while dragging). Off under reduced motion, like `touchSpin` |
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
| `morphBurst` / `morphSwirl` | `0` / `0` | Morph drama: halfway through its morph each dot is flung out from the center by up to `morphBurst` (0.5 = half again as far; a little more or less per dot) and swirled around it by up to `morphSwirl` radians, then pulled into the next shape |
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
| `rotateSpeed` | `1` | How fast the shape turns and idles (0.5 = half speed) |
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
| `gridGlows` | `""` | Static soft glows lighting the squares' own color (`gridColor` at `gridBase`), like blurred ellipses seen through the grid: `"x y rx ry"` per glow, the centre in 0..1 of the canvas and the radii in canvas heights (`rx = ry` stays round on any shape), `;` between, up to 4. Empty: the squares are lit evenly |
| `gridGlowDrift` / `gridGlowSpeed` | `0` / `1` | The glows drift like liquid around their spots (a slow wave plus a faster one, breathing and stretching as they go): how far (0..1 of the canvas, also sets how much they morph) and how fast (1 ≈ a minute per drift); `0` = still |
| `gridGlowMerge` | `0` | `0`: overlapping glows add up; `1`: they merge like liquid when they meet (a soft threshold on their sum, metaball style) |
| `gridGlowWarp` / `gridGlowWarpScale` | `0` / `2.5` | The glows seen through a slowly drifting, smooth flow field (one layer of large swirls, so they bend and roll like liquid, not cloud): how far points are pushed (0..1 of the canvas; `0` = off) and how fine the swirls are (small = big lazy curls). Moves at `gridGlowSpeed` |
| `gridGlowGlide` / `gridGlowGlidePause` / `gridGlowGliders` | `0` / `1.5` / `1` | Instead of drifting in place, lights travel between the `gridGlows` (their stops) on gently curved paths that bend differently every trip, eased, resting at each stop, landing a little off it, with a slow wobble. Seconds per trip (0 = off; varies ±25%), seconds resting (varies), and how many lights (1–4, each on its own trips, starting at different stops). A light's size changes from one stop's to the next. Needs 2+ glows |
| `gridSparkle` / `gridSparkleColor` | `0` / `#a4c9e9` | Random squares softly flash on their own clocks, no pointer involved: peak opacity (`0` = off) and color |
| `gridSparkleRate` / `gridSparkleSpeed` | `0.003` / `1` | Share of the squares lit at any moment (a little more where the glows are), and how fast a flash runs |
| `exciteRate` | `0.35` | Breaths/s while a `data-particles-excite` element is hovered; `0` = steady light-up |
| `pulses` / `pulseSpeed` / `pulseSize` / `pulseColor` | `0` / `180` / `3` / `#a4c9e9` | Data pulses traveling the lines to the hub |
| `shine` / `shineEvery` / `shineTime` / `shineWidth` / `shineAngle` | `0` / `5` / `2.4` / `0.22` / `35` | A soft band of light crossing the shape every `shineEvery` s (back to back if `shineTime` is longer), taking `shineTime` s, at `shineAngle`° (before `rotZ`): the nodes it passes grow and brighten and their lines light up. `shine` = strength (0 = off); `shineWidth` = how soft the band is (the light falls to about a third that far from its middle), as a fraction of the radius |
| `intro` | `0` | Seconds for nodes to fly in once 25% of the section is visible (`0` = off) |

## Map (`data-preset="fjord"`)

The "What Clarify does" spatial map (`map-scene.ts`), driven by tabs. Shared keys that apply: `mobileDpr` (default `2` here), `background`. Its pointer handling is its own (`interactive` is `false`).

The `fjord` preset is the **staged story** (`stagedLayers: true`, since v1.7.0); the defaults below are the original map (v1.6.0), which the other keys still describe. The preset's values are in `src/runtime/presets.json`.

### The staged story

The story (and the tab timer) start once a quarter of the map is in view. Tab 1 (Own): the floor's needles grow out of the floor (a wave from the centre out) and churn, a line sweeps them into an even field that keeps swelling, with a pulse rolling out from the centre, while the camera pushes in (with `storyAnomaly` on, the old v1.7.1 ending: one needle rises as the anomaly, with its card). Tab 2 (Refine): dots lift onto Signals and gather into three clusters (with `storyAnomaly` off, the anomaly needle rises here, under the pink one); the scan builds Reasoning and three tiles assemble from the clusters' dots, with their chips. Tab 3 (Deliver): straight down onto the stack; everything below the ring fades back (floor, Signals, all three tiles, the level grids); the pink tile's dots form a ring on Actions, routed to two actors whose switches flip on. Each tab plays its part the first time it shows; later visits, coming back down and reduced motion land on its end. A re-click on the open tab does nothing. The needles move all the time, so a staged map redraws every frame while it's on screen (it stops off screen and under reduced motion).

| Key | Default | `fjord` | Notes |
|---|---|---|---|
| `stagedLayers` | `false` | `true` | The staged story (above) |
| `mapForms` | `true` | `false` | The original map's forms: coastline, regions, anomaly ring, specks, dashed trace |
| `tempo` | `1` | `1.3` | The story's speed: scales the tab timelines, the scan and the camera flights together (clamped to ≥ 0.05) |
| `buildSpeed` | `2.2` | `8` | How fast the scan plane rises (world units/s; a level is 6) |
| `sweepTime` / `reliefOrderHeight` | `0.9` / `0.9` | `1.1` / `1.8` | Tab 1: the sweep's length (s); the even height the needles settle to (world units). They stay settled on later visits |
| `reliefSettleSwell` | `0` | `1` | How much the settled needles still breathe: a slow swell moving through them together (0 = still) |
| `reliefPulse` / `reliefPulseEvery` | `0` / `3.5` | `1` / `3.5` | A pulse rolling out from the floor's centre through the settled needles, lifting and brightening them as it passes: its strength (0 = none) and seconds between pulses |
| `storyAnomaly` | `true` | `false` | Tab 1 ends on the anomaly needle and its card. Off: tab 1 has no accent colour (only the floor's motion), the camera looks down onto the floor so it fills the panel, and the anomaly needle rises on tab 2 as the pink cluster gathers over it; the `alert*` copy is then unused |
| `sweepColor` / `alertColor` | `#a2d0c1` / `#e0607e` | `#5f8db4` / — | The sweep line; the alert colour (the anomaly, the pink cluster, tile and ring, the UI's accents) |
| `storyLevels` | `, Signals, Reasoning, Actions` | `Raw data, Signals, Reasoning, Actions` | Level labels (HTML), bottom to top; an empty entry is skipped. Left of the stack where there's room, otherwise (phones) just above each level's left corner, a little smaller. The floor's from tab 2; none on tab 3 |
| `tileLabels` | `Asset health, Maintenance risk, Energy use` | — | The three Reasoning tiles' chips |
| `alertTag` / `alertTitle` / `alertText` | `EVT-2291` / `Pump 14` / `Vibration above baseline` | — | The anomaly's card (tab 1, only with `storyAnomaly` on) |
| `routeTitle` / `routeText` | `Routed to` / `EVT-2291 · Pump 14 maintenance risk` | — | The routing card's header (tab 3) |
| `actor1` / `actor1Text`, `actor2` / `actor2Text` | `Operations lead` / `Person`, `Maintenance planner` / `Work order drafted` | — | Its two rows, each with a switch |
| `closingLabel` / `closingValue` | `Caught before failure` / `18 h` | — | Its closing row and bar |

Any copy key can also be set per element as an attribute (e.g. `data-alert-title="Pump 7"`). The UI is HTML over the canvas (`map-overlay.ts`): `fj-` prefixed classes, injected CSS, scaled with the panel (down to 72% on phones), in the site's card and motion language; it assumes the site loads Geist and Geist Mono.

### The floor

| Key | Default | `fjord` | Notes |
|---|---|---|---|
| `reliefStyle` | `"columns"` | `"needles"` | `"columns"`: a box per bright cell; `"dots"`: a soft point cloud at the column tops; `"needles"`: a regular grid of hair-thin lines whose heights keep moving (a swell plus each needle's flicker) |
| `reliefNeedleGrid` | `32` | `64` | Needles: how many per side. Motion: `reliefDriftSpeed` (speed), `reliefDriftScale` (swell size), `reliefTwinkle` (0 = only the swell, 1 = only each needle's flicker); colour `reliefPale` at the floor to `reliefDeep` at a tall tip |
| `reliefDotSize` / `reliefDotRise` / `reliefDotsPerCell` | `0.35` / `1` / `2` | — | Dots: size (world units), height as a share of the column's, dots per cell (jittered) |
| `reliefDriftSpeed` / `reliefDriftScale` | `1` / `0.22` | `0.95` / `0.29` | Dots: how fast each dot's life runs (1 ≈ 5–8 s), the currents' size (smaller = bigger, smoother). Needles: as above |
| `reliefDrift` / `reliefTwinkle` | `0` / `0` | — / `0.5` | Dots: how far each sweeps along the current per life (world units) and twinkle (0..1); either keeps the map redrawing while on screen |
| `reliefPale` / `reliefDeep` / `reliefOpacity` | `#FFFFFF` / `#7B7E81` / `0.7` | `#3a3d41` / `#b7bec5` / — | Relief colours, base → tip; opacity |
| `reliefThreshold` | `0.11` | — | Cells darker than this (0..1 luminance) get no spike. The outlines were baked at 0.11 (`scripts/bake-map.mjs`) |
| `wireColor` / `wireOpacity` | `#7B7E81` / `0.5` | — / `0` | The terrain wireframe at the floor |

### Structure, the original forms, camera

| Key | Default | `fjord` | Notes |
|---|---|---|---|
| `frameColor` / `gridOpacity` | `#3E4143` / `0.28` | `#575b5f` / — | The box frame and the three level grids (the frame edges at `0.3 + 2 × gridOpacity`) |
| `walls` | `true` | `false` | The box frame's edges; `false` leaves the level grids floating |
| `coastColor` | `#D7D9DA` | — | The extracted coastline |
| `formColor` / `formStrongColor` | `#3E4143` / `#7B7E81` | — | Hatching (and the coast cutout's edge); the refined regions' edges |
| `accentColor` / `traceColor` | `#D7D9DA` / `#7B7E81` | — | Anomaly ring + signal specks; the dashed trace |
| `labelColor` / `calloutColor` | `#D7D9DA` / `#D7D9DA` | — | In-scene text |
| `fontSans` / `fontMono` | Geist / Geist Mono | — | CSS font families for the in-scene text (the site must load them; the map waits up to 2 s) |
| `labels` / `labelSize` | `The Operation, Extracted, Refined, The Signal` / `0.42` | `""` | In-scene level names, bottom to top; their size (world units) |
| `extractStat` / `extractCaption` | `45M` / `Sensor signals / day` | `""` | Callout on the coastline (both empty: none) |
| `refineStat` / `refineCaption` | `162` / `Active sites monitored` | `""` | Callout on the ringed region |
| `signalTitle` / `signalStat` / `signalCaption` | `The Signal` / `3` / `Actions this week` | `""` | The top-down block |
| `smoothTime` | `0.6` | — | Camera flight smoothing (s); staged flights take 2.5× this, at `tempo` |
| `zoom` | `1.09` | — | Camera distance multiplier (all steps) |
| `fitAspect` | `1` | — | Panels narrower than this (width / height) move the camera back so the box fits across |
| `drag` | `true` | `false` | Mouse drag orbits (desktop; touch never does) |
| `autoplay` | `7` | — | Seconds per tab before the next opens (`0` = click only) |

## Element-level markers

| Attribute | Effect |
|---|---|
| `data-particles-component` | The component root: settings + scope for its excite buttons |
| `data-particles-wrap` | Inside a component: where the script creates `div.u-particles-threejs` (defaults to the component) |
| `data-how-component` / `data-how-wrap` | Same as `data-particles-component` / `data-particles-wrap`, under the names the hero uses (v1.5.1) |
| `data-fjord-component` / `data-fjord-wrap` | The same again, under the names the spatial map section uses |
| `data-fjord-tab="0\|1\|2"` | A tab driving its component's map (several elements may share an index). The active one gets `is-active` and `--tab-progress` (0 → 1, the autoplay timer); the component gets `data-fjord-active` and a `particles:step` event |
| `data-fjord-panel="0\|1\|2"` | Optional: an element shown for that tab (gets `is-active` with it) |
| `data-particles-excite` | Hovering or focusing it "excites" its component's effect (graph: lights up / breathes). In legacy markup: the nearest effect sharing a container. |
| `data-particles-ignore` | Clicks on this element never trigger the click effect (links, buttons and form fields are already excluded) |

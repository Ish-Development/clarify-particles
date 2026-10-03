# Sections

One entry per site section: Figma source, where the effect mounts, the preset, and what was decided with the client while tuning. Figma file: **Clarify — Website Design Foundation (Internal)**, key `Z2um6nL77J4AOzXI1PC35c`.

## Status (2026-10-03, v1.5.0 released)

- **Released to the devs:** v1.5.0 (2026-10-03).
  - **Hero:** loops through four dotted shapes (sphere → meridians → spiral → burst, 6 s hold / 2 s morph, the CTA's timing); no entrance; turns toward the cursor; the two hero buttons light it up (mouse only); no tap/click reaction below desktop and no touch reaction at all; tablet (768–991) horizontal like desktop with fewer, smaller dots; phones: the shape fitted inside the band, full resolution. Canvas = `.u-particles-threejs` only (no `bleed`).
  - **CTA:** background grid (and its lights/hover trail) and the network's hover glow removed. Everything else unchanged.
  - **Engine (points), all off by default:** `sequence`/`holdTime`/`morphTime`/`stagger`/`holdShape`, `fit`/`fitPadding`, `parallax`, `gather`, `hoverGlow`, `touchSpin` for points, excite for points, shapes `meridians`/`spiral`/`burst`; `ClarifyParticles.set(el, patch)`.
  - **Repo:** the playground, `sections.html` and the tune page were deleted; the reference page is the only page.
- **Reference page:** GitHub Pages and Vercel (https://clarify-particles.vercel.app).
- **Tell the devs:** bump the pinned version to `@1.5.0`. Hero: add `data-particles-excite` to "Book a demo" and "Talk to an engineer" (in the hero), and update the hero's `.u-particles-threejs` CSS: tablet (≤ 991) keeps the desktop layout with `width: 70.3%` and the content at `max-width: calc(50% - 24px)`; the stacked 50svh band now starts at ≤ 767 (was ≤ 991). CTA: no markup or CSS changes.
- **Next:** the user's call.

Workflow for a new section:
1. **Figma context:** get the design context, variables and screenshot for the section node.
2. **Template:** build `src/sections/<name>.html` using the tokens in `src/sections/tokens.css`, with the Webflow component markup (`data-particles-component` + `data-preset` on the component, `data-particles-wrap`, and `data-particles-excite` on any trigger). Style `.u-particles-threejs` for it in `sections.css`, the way Webflow will.
3. **Register it** in `src/sections/guide.js` (its tab and Webflow guide on the reference page). Images go in `public/assets/`, referenced as `assets/<file>`.
4. **Tune:** edit its preset in `presets.json` (named after the section), `npm run build:runtime`, and compare screenshots on the reference page.
5. **Review** with the client on the reference page (localhost:4792), then release (see CLAUDE.md).

---

## Hero: "Learn from the past and predict the future"

- **Figma:** desktop `12735:86263` (1512 × 982), mobile `13651:45904` (393 × 852). The artwork is three dotted spheres masked by a circle (`12916:71353`): outer radius 404 px centered at (1274, 546) on desktop, 220 px at (204, 295) on mobile.
- **Markup:** the section is `data-particles-component data-particles-wrap data-preset="hero"`. The navbar sits on top of it in Figma but isn't part of the effect.
- **Effect area:** the points `sphere` is drawn at the center of its div with radius `0.38 × min(w, h)`, so on desktop `.u-particles-threejs` is a `1063px` square centered on the spheres at (84.26%, 545px). The section clips it.
- **Tablet (768–991 px, 2026-10-03, "same layout principles as the CTA"):** horizontal like desktop: the effect div keeps desktop's proportions (`width: 70.3%` of the hero, same center), so the spheres scale with the screen and stay clear of the text, which takes the left half (`max-width: calc(50% - 24px)`). Replaces the 2026-10-01 stacked tablet.
- **Mobile (≤ 767 px):** stacked, per the mobile band rule: a full-width band, `50svh` tall, the animation centered in it and cropped. The band starts under the navbar (`--navbar-h` 63 px), and the hero's `padding-top: calc(var(--navbar-h) + 50svh + var(--space-7, 36px))` reserves it. The spheres are fitted to the band instead of the screen width (2026-10-03, after the user spotted a hard cut at the band's edges) (now ≤ 767 `scale: 1.47` + `fit`, see Interactions below; first try was scale 1.3 / 1.47 per width, which still reached under the navbar on some phones). Measured clear of the text at 767/600/479/430/393/375/320 (17–40 px). Was `scale: 1.48, scaleByWidth: true` from 991 down, which overflowed the band and was cut flat at its top and bottom.
- **Canvas = the zone, no `bleed` (2026-10-03):** the hero is a full-width section, not a card, so the canvas is just `.u-particles-threejs` (half the pixels on phones, about a quarter fewer on desktop, nothing over the text). Safe because the shapes keep clear of the zone's edges: desktop ~127 px around the outer sphere (a hover push + click burst at its edge left the nearest dot ~110 px inside), tablet 35–54 px with a hover push at the edge (768/800/880/991), phones `fit` 8 px (measured 8–33 px clear). `bleed` was tried first (CTA-style); the CTA keeps it, as its card is the boundary (its mobile network measured 23–54 px inside the band over a full loop, and when tipped by a finger).
- **Tablet dots + phone resolution (2026-10-03, user: "on the iPad breakpoints it looks thicker and noisier; how can it be crisper"):** the engine's phone settings only start below 768 px, so 768–991 had desktop's 7000 dots at desktop size on spheres 51–66% as wide (2.3–3.9× the density). Fitted to the desktop render shrunk to tablet size (retina screenshots, lit area and brightness inside the sphere): ≤ 991 `count: 4500`, size 0.34–0.638 (lit 10.5% vs target 10.1%); ≤ 879 (every upright iPad) `count: 3300`, size 0.312–0.585 (10.8% vs 10.4% at 768). The ≤ 767 tier sets the sizes back to 0.4–0.75 (tiers stack), so phones keep their look. Crisper: `mobileDpr: 3` (phones rendered at 1.5×, upscaled on 3× screens; now native: 1179×1278 canvas at 393 px). Tablets and desktop already render at 2× (native on Retina).
- **Shape loop (2026-10-03, user: "same morph speed as the CTA; remove the tabs, I'm happy with the shapes"):** `sequence: sphere,meridians,spiral,burst`, `holdTime: 6`, `morphTime: 2`, `stagger: 0.4` (the CTA's timing), on the site too (new points `sequence`/`holdTime`; the morph dissolves into a cloud and re-forms). Measured: sphere → meridians at 8 s → spiral at 16 s → burst at 24 s → sphere at 32 s. The reference page's shape tabs and the phone's floating bar were removed.
- **Button light-up (2026-10-03, user: "light up on hover on the buttons, like the CTA"):** the hero's "Book a demo" and "Talk to an engineer" carry `data-particles-excite`; points views now react to excite like the graph's steady light-up (every dot +0.35 opacity, eased on/off). Mouse only (the hero's `touchHover: false`, as the CTA: a finger on the button is just a tap). Measured: sphere brightness 14.1 → 19.4 with the mouse on "Book a demo", back to 14.3 after; unchanged for a finger on a phone. (A cursor light-up on the dots, new points `hoverGlow`, was added by mistake first and removed; the option stays, off.) Colors: hero dots and CTA nodes/lines are the same `#f4f7fa`; the hero is dimmer and see-through (0.25–0.65), the CTA's nodes opaque (0.5–1).
- **Interactions aligned with the CTA (2026-10-03, user: "do what you think is best"):** `touchHover: false`, `touchSpin: true`, `touchHold: 300` (no hover on touch; drag sideways to spin, hold to grab and tilt, the same code and easing as the CTA; no light-up on the hold, as points have no excite); `parallax: 0.25` (turns toward the cursor, the CTA's value); `gather: false` (starts formed, as the CTA's entrance was rejected). Kept: hover push (100 px, 0.8) and the click burst (a ripple needs lines). Verified with simulated touches and mouse moves through the engine's debug state. Then the user: "we shouldn't hold and move these": `touchSpin`/`touchHold` removed from the hero (the engine keeps points support for them, off by default); a finger only taps (burst). Then: "they clip at the top behind the nav; remove the clicking below desktop; add a sideways spin": ≤ 767 tier `scale: 1.47` + new points `fit` (8 px): as big as the band allows, never under the navbar (measured 7–29 px clear at 767/479/430/393/375/320 for every study shape); ≤ 991 tier `clickBehavior: none`; `touchSpin: true` without a hold (sideways swipe spins right away, `touch-action: pan-y` leaves vertical swipes to the page). Meridians and spiral turn with the swipe and the parallax too (`Shape3D.yaw`). Then the swipe spin was dropped too ("not nice on mobile"): no `touchSpin`; on touch the hero doesn't react to a finger at all (the engine keeps points `touchSpin` support, off by default).
- **Preset:** `hero` (points).

| Setting | Value | Why |
|---|---|---|
| shape / innerCopies | `sphere` / 3 | Nested shells at 1, ⅔, ⅓ of the radius: Figma's ratio |
| count / countMobile | 7000 / 4500 | Every shell gets the same count, so the inner one is densest, as in Figma |
| sizeMin / sizeMax | 0.4 / 0.75 | Figma's fine dots (side-by-side compared) |
| sizeScaleMobile | 0.6 | The Figma mobile artwork is the desktop one scaled down, dots included. New option (v1.3) |
| opacity | 0.25–0.65 | Matched to Figma's grey |
| blend / softness | normal / 0 | Additive glow blew the dense inner shell out to white |
| rotX | −20 | The pole tilts toward the viewer, as in Figma |
| autoRotate / idleMotion | true / true | Slow tumble; first pass, not yet reviewed with the client |
| hover / click | 100 px, 0.8 / burst | Defaults toned down; not yet reviewed |

- **Approved shape (2026-10-03):** the v1.4.0 hero sphere is the user's "correct shape" (now the first shape of the v1.5.0 loop). Don't change its dots; new shapes reuse them.
- **New shape in progress (2026-10-03):** `orb`, "dense like the original and spherical". v1 was a ball filled evenly with dots ("a bit too simple"); v2 ("more layered and fun"): 5 nested layers at the sphere's outer radius, same dot count each (inner densest), alternating an even dot shell and stripe bands (9 latitude bands, a third of the gap wide; thin rings read as wireframe), each layer spinning on its own tilted axis in alternating directions. v3 ("too similar to the sphere, but I like the layering in the middle layer"): every layer banded (no plain shells), 4 layers, dots per layer growing with its radius so the outer bands read too, tilts 0.8 rad apart so the bands cross. v4 ("remove the smallest middle sphere, layer it as rings from top to bottom"): 3 layers (radius 1, ¾, ½), horizontal rings stacked top to bottom, alternate layers' rings half a gap apart so they interleave; the orb stays upright (no tumble, fixed −20° tilt toward the viewer, each layer turning around the vertical axis in alternating directions). v5 (user's reference image: a sphere sliced into stacked coloured plates, "not looking like this of course, but the shape, with our art direction"): 9 horizontal discs top to bottom, each as wide as the sphere at its height, dots by disc area; 60% of a disc's dots on a thin rim (so each reads as a plate), the rest filling it evenly; seen 10° from above (18° made the ellipses overlap into one dust ball), no tumble, discs turning in alternating directions. User: "well done but not convinced": back to v4 to iterate.
- **Shape study (2026-10-03, user: "create 6 different shapes, I'll tell you what we keep"):** tabs Sphere / Rings (v4) / Plates (v5) / Meridians (12 pole-to-pole bands, 2 layers) / Spiral (a band winding 8 times top to bottom, 2 layers opposite ways) / Ripple (a dotted sphere with a travelling wave around a still inner sphere) / Core (a solid ball of dots, radius 0.5, inside a thin outer shell). All at the sphere's outer radius with the hero's dots; `orb` was renamed `rings`. Workspace only (reference page tabs); the preset is unchanged. Then removed by the user: Plates and Core, then Rings, then Ripple (code deleted). Left: Meridians and Spiral. Meridians made "fuller and busier": 3 layers (1, ¾, ½) a third of a segment apart, bands 0.35 of a segment wide (was 2 layers, 0.25). Spiral made "a bit fuller": 3 layers (1, ¾, ½) alternating direction, band 0.45 of the turn spacing (was 2 layers, 0.3). Added on request: Burst (260 spokes from near the center to the full radius, denser toward the tips, tumbles like the sphere).
- **Open:**
  - Client review of the motion (tumble speed, hover, click, the gather-in on load).

---

## CTA: "See how Clarify solves yours"

- **Figma:** frame `13311:5898` (1512 wide); card `13311:5899`. The artwork in Figma was a static export of the old playground's burst↔sphere graph (lines `#E8E8E8` at 0.062, 2.08 px).
- **Markup (v1.2):** the card is `data-particles-component data-particles-wrap data-preset="cta"`. The script creates `div.u-particles-threejs`, styled `absolute; top/right/bottom: 0; left: 45%`. The card has `overflow: clip` and radius 24.
- **Excite:** the "Get started" button carries `data-particles-excite`.
- **Preset:** `cta` (graph).

| Setting | Value | Why |
|---|---|---|
| sequence | `constellation,clusters,spiral` | Client loves the constellation; the others are the same network style with a different round silhouette |
| holdTime / morphTime | 6 s / 2 s | 3.5 s hold pulled attention from the text; smooth glide preferred over scatter |
| morphScatter / swirl / implode | 0 | Tried scatter, swirl and implode; implode read as "mushed into a ball" |
| count | 220 | Dense, many connections |
| sizeMin / sizeMax | 2 / 6, now 1.5 / 4.5 + `sizeCurve` 2 | Asked for half-size dots; then a stronger hierarchy, and smaller max for squares (see Crisp + pixel look) |
| solid, softness | true, 0 | Filled dots, lines don't show through |
| opacity | 0.30–0.85, tiers 3 | Darker dots |
| lineOpacity / lineWidth | 0.18 / 2, now 0.35 / 0.75 | Darker lines; then crisp hairlines (see Crisp + pixel look) |
| (layout) | `.u-particles-threejs` at `left: 45%` | Effect in the right 55%; tried 50% and 60%. Styled in Webflow since v1.1/1.2 (was `canvasInset` in the preset) |
| anchorLeft, scale | true, 2.7 | Big: bleeds off top, right and bottom; left edge never over the text |
| centerX / centerY | 0.5 / 0.5 | With anchorLeft, the center is pushed right until the left edge clears the margin |
| rotZ | 9 | Swings the hub fan toward the bottom right, as in Figma |
| idle rotation / tilt | 0.05 / 0.2 | Visibly alive during holds |
| depth / parallax | 0.6 / 0.25 | Kept |
| hoverGlow / radius / strength | 0.35 / 110 / 0.5 | The first version was too much; the client asked for subtle |
| hoverPath | false | Tracing lines "moving fast and around" was too much |
| clickBehavior / rippleSpeed | ripple / 4 | Asked for a slower ripple |
| exciteRate | 0 | Button hover just lights up; the pulsing (even slow) was rejected |
| pulses | 0 | Blue pulses on the lines rejected |
| intro | 0 | Entrance animation rejected |

- **Background token:** `bg-secondary` changed in Figma to `#080a0c` (from `#0f1215`). It's reflected in `tokens.css`.
- **Staging:** v1.2 component markup agreed with the dev: component = card, the script creates `.u-particles-threejs` (styled in Webflow), and the button is scoped by the component. Before that, staging used legacy markup (the dev's own `.u-particles-threejs` div with `data-particles`), which still works. The container caps the card at 1512 px.
- **Bleed (2026-10-01):** the preset has `bleed: true`: the canvas covers the whole card and `.u-particles-threejs` only places/sizes the network, so it never gets a hard cut at the zone's edges (the bottom of the mobile band was clipping as the viewport changed). `.cta__content` is `position: relative; z-index: 1`.
- **Tablet (768–991, user chose horizontal):** desktop layout tightened: card padding 64/48, zone `left: 50%`, text `max-width: calc(50% - 24px)`. The stacked tablet version was tried and dropped.
- **Mobile** (≤ 767 px; Figma `13647:37427`, 393 wide): the card stacks. Text column centered, 313 px (the phone design's). `.u-particles-threejs` is a full-width band at the top of the card, `height: 50svh` (user rule for every effect on mobile: 100% wide, half the screen tall, animation centered and cropped by the band; Figma's 361 px area was replaced by it). The card's `padding-top: calc(50svh + var(--space-7))` reserves it. Text is centered below, and the button is full width.

| Breakpoint tier | Value | Why |
|---|---|---|
| ≤ 767 | anchorLeft false, centerX 0.5, rotZ 0 | Stacked: no text beside it, hub straight down (desktop's rotZ 9 swings it right) |
| ≤ 767 | scale 2.2, scaleByWidth, anchorBottom, centerY 0.5, count 300 | 480–767: fills the full width like 479 does (user liked that), bottom kept inside the band by `anchorBottom` (top crops); more nodes for the bigger area. Checked at 767 |
| ≤ 479 | centerY 0.3, scaleByWidth false, count 170 | The approved 479 look: sized from the band's shorter side, which there is about its width |
| ≤ 430 | centerY 0.4 | Real phones: the approved look (hub visible down to 320 × 568) |

  Dots and lines keep the approved desktop style; the Figma mobile artwork is the older, bigger-dot export.

- **Open:**
  - **Figma copy:** the body text in Figma starts with a stray leading space; it's omitted in our markup.

- **Crisp + pixel look (2026-10-01, now `cta`; the earlier soft round-dot look is in git history):** the earlier `cta` plus: hairline lines (`lineWidth` 0.75, `lineOpacity` 0.35) in the original white `#f4f7fa` (mist blue tried, rejected), `opacityMax` 0.95, `spokeFraction` 0.4 (hub fan no longer a smear), `nodeGap` 1.5 in `#080a0c` (lines stop short of nodes), `snapSizes`, `depthSize: false` (depth only dims), `mobileDpr` 2, stronger size hierarchy (`sizeMin` 1.5, `sizeMax` 7, `sizeCurve` 2).
- **Square nodes:** `nodeShape: square`: every node a square "pixel" (the eyebrow icon's motif). `sizeMax` 4.5 (7 made the biggest squares too heavy). `mixed` (biggest tier round) was tried; the user preferred all square. Mobile density falls with width (small screens looked tight and tangled at 170–300 nodes): ≤767 200 nodes, ≤479 130 + `spokeFraction` 0.25, ≤430 100 + `lineOpacity` 0.3.
- **Touch (2026-10-02, in `cta`; tested on an iPhone):** the user asked for no hover on mobile and a way to turn the network with a finger.
  - `touchHover: false`: a finger doesn't fire the button's excite, and the glow/push only follow it while it's pressed (lift = off). Parallax stays mouse-only. Taps still ripple.
  - `touchSpin: true` + `touchHold: 300`: inside the zone, a sideways drag turns it right away; a finger held still 0.3 s grabs it (it lights up) and can then turn it up/down too. It coasts after release and the tilt (capped at 1 rad) eases back. A swipe without the hold still scrolls the page.
  - Applies to every touch device (phones and tablets), whatever the width.
  - **Tried and dropped:** hold-only (the first version: awkward, set off iOS's long-press zoom); drag-only with `touch-action: pan-y` (iOS gave vertical moves straight to scrolling, so the hold couldn't take them; the hold mode keeps touch-action auto and decides on the first move).
  - **Phone log (Safari):** some holds missed because the finger moved 10 to 15 px before the 0.3 s (counted as a scroll). If that keeps happening, the drift allowance (`HOLD_SLOP` 10 px in `engine.ts`) can go up.
  - **Debug:** `ClarifyParticles.debug()` in the console gives the engine state (the `sections.html?debug=log` phone log went with that page on 2026-10-03).
- **Grid pattern (2026-10-02, now `cta`; was the `cta-grid` variant):** from Figma `13987:10914`: a grid of small squares over the whole card, lit by soft lights that drift over it by themselves (always, desktop and touch) and a hover trail. The Figma frame's three static blurred beams were built, then dropped by the user ("just the drifting"). User's values: pitch 7, drifting Mist/200 `#1a3145` at full strength, 4 lights of 296 px at speed 0.5; hover Mist/800 `#dbeaf7` at full strength, radius 240, fade 0.45 s. All in one WebGL quad (no CSS blur); per-square trail in a float texture, so the CPU only stamps squares near the pointer. Tuned on `/tune.html?preset=cta` (dev server). With it the network got brighter and bolder so it reads over the grid: nodes 0.5–1, lines 0.55 at 1.25 px, hover glow 0.8 within 200 px, `nodeGap` 0.5 (was 1.5), new `lineGap` 1.5 (a strip of card color under each line, so the lines cut through the grid). Mobile (≤ 767): calmer grid (opacity 0.75, spacing 7, square color 0.25, 2 slower lights, lines 1 px / gap 1). A soft top fade (network dissolving into the card's top edge) was tried; the user preferred the hard crop and it was removed. No grid hover below desktop (≤ 991 `gridHot: 0`).
- **Grid and hover glow removed (2026-10-03):** user: "remove the bg grid and the hover effect, that was too much". All `grid*` settings dropped from the preset and its tiers (the drifting lights and the grid's hover trail go with it), and `hoverGlow: 0`. The network keeps its 1.4 brightness, the hover push and the button's excite. The grid engine options remain, off by default.
- **Explored and rejected** (available as options):
  - **Background glow** (2026-10-02, `cta-pop`): first a mist-blue glow that followed the network ("too much and too light"), then Figma's prototype `13311:5898` (a blurred `#273037`→`#0F1317` ellipse, matched as a gaussian in WebGL, no CSS blur). Ditched by the user. Engine options `glow*` remain, off by default.
  - **Core sphere** (2026-10-01): the hub as a small dotted sphere at the network's center, lines radiating from it (`cta-core`). Rejected by the user ("bad idea"); the engine option was removed.
  - **Shapes:** torus, helix, galaxy, globe, knot, atom, icosa and wave in the CTA. The flat ones turn edge-on; the others read as "not the constellation style".
  - **Fit:** fully inside the canvas. The client preferred big and bleeding.

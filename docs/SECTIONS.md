# Sections

One entry per site section: Figma source, where the effect mounts, the preset, and what was decided with the client while tuning. Figma file: **Clarify — Website Design Foundation (Internal)**, key `Z2um6nL77J4AOzXI1PC35c`.

## Status (2026-10-02, v1.3.0 released)

- **Released to the devs:** v1.3.0 (2026-10-02):
  - **CTA:** desktop, tablet (horizontal) and mobile (stacked 50svh band); crisp square-pixel look; bleed; breakpoint tiers; touch interaction (drag to spin, hold to grab, no hover on touch; checked on an iPhone).
  - **Hero:** preset `hero` ships too, but its motion isn't reviewed with the client yet.
  - **Reference page:** tabbed site (`dist-runtime/demo.html`) with a breakpoint viewer and per-section Webflow guide.
  - **New engine settings** (all off by default): `breakpoints` tiers, `bleed`, `anchorBottom`, `scaleByWidth`, points `scale`, `sizeScaleMobile`, `mobileDpr`, `spokeFraction`, `nodeGap`/`gapColor`, `snapSizes`, `depthSize`, `sizeCurve`, `nodeShape`, `touchHover`, `touchSpin`, `touchHold`.
- **Tell the devs:** bump the pinned version to `@1.3.0` (script tag or their `window.libs` loader; the loader snippet must match `[data-particles-component]`, as in `runtime/README.md`).
- **Next:**
  1. CTA: more work (user, 2026-10-02).
  2. Hero: motion review; whether it gets the crisp/pixel treatment and button glow.
  3. CTA perf on a real phone (`mobileDpr` 2) wasn't checked item by item.

Workflow for a new section:
1. **Figma context:** get the design context, variables and screenshot for the section node.
2. **Template:** build `src/sections/<name>.html` using the tokens in `src/sections/tokens.css`, with the Webflow component markup (`data-particles-component` + `data-preset` on the component, `data-particles-wrap`, and `data-particles-excite` on any trigger). Style `.u-particles-threejs` for it in `sections.css`, the way Webflow will.
3. **Register it** as a frame in the playground (`TEMPLATES` / `FRAMES` in `src/playground/main.ts`), in `sections.html` (`addSection`), and in `src/sections/guide.js` (its tab and Webflow guide on the reference page). Images go in `public/assets/`, referenced as `assets/<file>`.
4. **Tune and save:** tune in the playground (`?frame=<name>`) and save the preset under the section's name.
5. **Review** with the client on the stable preview (port 4791), then release (see CLAUDE.md).

---

## Hero: "Learn from the past and predict the future"

- **Figma:** desktop `12735:86263` (1512 × 982), mobile `13651:45904` (393 × 852). The artwork is three dotted spheres masked by a circle (`12916:71353`): outer radius 404 px centered at (1274, 546) on desktop, 220 px at (204, 295) on mobile.
- **Markup:** the section is `data-particles-component data-particles-wrap data-preset="hero"`. The navbar sits on top of it in Figma but isn't part of the effect.
- **Effect area:** the points `sphere` is drawn at the center of its div with radius `0.38 × min(w, h)`, so on desktop `.u-particles-threejs` is a `1063px` square centered on the spheres at (84.26%, 545px). The section clips it.
- **Tablet + mobile (≤ 991 px, decided 2026-10-01: no tablet frame in Figma, the desktop layout put the spheres behind the headline):** stacked, per the mobile band rule: a full-width band, `50svh` tall, the animation centered in it and cropped. The band starts under the navbar (`--navbar-h`: 71 px tablet, 63 px mobile), and the hero's `padding-top: calc(var(--navbar-h) + 50svh + var(--space-7, 36px))` reserves it. The preset's ≤ 991 breakpoint tier (`scale: 1.48, scaleByWidth: true`) gives Figma's 220 px outer radius at 393 and fills the band at every width.
- **Excite:** none (points views have no excite reaction yet).
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
  - **Debug:** `sections.html?debug=log` sends the engine state to `.particles-debug.log` with no overlay (works on the stable preview too), for phone tests.
- **Explored and rejected** (available as options):
  - **Core sphere** (2026-10-01): the hub as a small dotted sphere at the network's center, lines radiating from it (`cta-core`). Rejected by the user ("bad idea"); the engine option was removed.
  - **Shapes:** torus, helix, galaxy, globe, knot, atom, icosa and wave in the CTA. The flat ones turn edge-on; the others read as "not the constellation style".
  - **Fit:** fully inside the canvas. The client preferred big and bleeding.

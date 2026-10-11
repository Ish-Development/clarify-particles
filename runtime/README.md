# Clarify particles: Webflow handover

Interactive particle/network backgrounds for Webflow sections. You don't need a build step or a framework: add one script to the site, then mark each section with two attributes. Each section's look lives in this repo as a named **preset**, so no design settings go into Webflow.

- **Live reference:** [clarify-particles.vercel.app](https://clarify-particles.vercel.app) has one tab per finished section: the section running the production script at any screen width (1920 down to 320, or drag to resize), and its exact Webflow implementation (attributes, `.u-particles-threejs` CSS, requirements). A Setup tab repeats steps 1 and 2 below.
- **All attributes:** [docs/CONFIG.md](../docs/CONFIG.md)

## 1. Add the script (once, site-wide)

**Site settings → Custom code → Footer code:**

```html
<script type="module" src="https://cdn.jsdelivr.net/gh/Ish-Development/clarify-particles@1.12.0/dist-runtime/particles.js"></script>
```

Always pin the version (`@1.12.0`), never `@latest` or a branch. Pinned URLs never change, so they're cached permanently. New releases get a new version number and you update this one line.

### Or through the site's `window.libs` loader

```js
/* PARTICLES (Three.js engine) */
window.loadParticles = () => {
  if (!document.querySelector("[data-particles-component], [data-how-component], [data-fjord-component], [data-particles]")) return Promise.resolve();
  return window.libs.load("particles", () =>
    import("https://cdn.jsdelivr.net/gh/Ish-Development/clarify-particles@1.12.0/dist-runtime/particles.js")
  );
};
```

It must use `import()`, not `window.libs.script()`. The file is an ES module that loads its engine relative to its own URL, and as a classic `<script>` that path would break.

### What loads, and when

- **`particles.js`** is a loader of about 5 kB gzipped. It finds `[data-particles-component]` (and legacy `[data-particles]`) elements, runs the map's tabs, and does nothing else up front.
- **`engine.js`** (~162 kB gzipped, mostly Three.js) is fetched only after all three of these:
  - the page's `load` event
  - an idle moment
  - a particle section coming within half a screen of the viewport
- **`map-scene.js`** (~37 kB gzipped, the spatial map and its data) is fetched only on pages with the map section.
- **Once per page:** the engine is fetched once however many sections use it, and they all draw through **one** WebGL context. Three.js is bundled in (only the parts used), so there's no separate Three.js script to add.

## 2. Mark up the sections

Each effect is a **component**:

```
[data-particles-component]        the component (e.g. the card): its settings + the scope for its buttons
  [data-particles-bg]             where the background goes (optional, CTA): canvas at 100% x 100%
  [data-particles-wrap]           where the effect goes (optional: defaults to the component itself)
    div.u-particles-threejs       CREATED BY THE SCRIPT: style this class in Webflow
      <canvas>                    created by the script, 100% x 100% of that div
```

- **Loop:** the script loops through every `[data-particles-component]`, finds its `[data-particles-wrap]`, and creates `<div class="u-particles-threejs">` as the wrap's first child with the canvas inside.
- **Styling the div:** the script adds no positioning or size to that div, so **style `.u-particles-threejs` in Webflow**. The canvas always fills it at 100% × 100%. If the div ends up with no size, the console warns you.
- **Section names:** the hero uses `data-how-component` / `data-how-wrap` and the spatial map `data-fjord-component` / `data-fjord-wrap`. They work exactly like `data-particles-component` / `data-particles-wrap` (any pair works on any section).
- **The spatial map's panel size is yours:** set the `data-fjord-wrap` element's size per breakpoint in Webflow (height or aspect ratio). The map, camera and cards fit whatever box they get. It's framed for roughly 16:10 to square; avoid very wide, short strips. The reference page uses 552 px tall on desktop, 16:10 on tablet, square on phones.
- **The spatial map's cards and labels** are drawn by the script (HTML over the map); nothing to build. Their text can be changed per section with attributes on the component, e.g. `data-route-text="EVT-2291 · Pump 7 maintenance risk"` (all keys: `docs/CONFIG.md`, "The staged story").
- **Tabs (the spatial map):** `data-fjord-tab="0|1|2"` on each tab. The script runs them: it adds `is-active` to the active tab (style that combo class), sets `--tab-progress` (0 → 1) on it for the timer line, moves on by itself every 7 s, and flies the map's camera. No Webflow Tabs component or interactions needed.
- **The CTA's background (optional):** an empty `data-particles-bg` div inside the card gets the background (the grid and its gliding lights) on its own canvas, at 100% × 100% of the div; give it `position: absolute; inset: 0` to cover the card. The network stays in `.u-particles-threejs`, which the script creates right after that div, so the network is on top without a z-index. Without the div, the background is drawn on the network's canvas as before; it looks the same.
- **The globe ("Built to extend", preset `globe`):** the globe's cell is the component and the wrap (`data-particles-component data-particles-wrap data-preset="globe"`); give it `position: relative` and `.u-particles-threejs` inside it `position: absolute; inset: 0`. It can be dragged to spin with the mouse and on touch (sideways; up/down swipes still scroll).
- **Settings:** `data-preset` goes on the component (or the wrap, which wins if both have one).
- **Buttons:** `data-particles-excite` elements inside a component light up **that component's** effect only, so several components on one page each react to their own button.

What the script does to the created div: sets `isolation: isolate` (and `position: relative` only if your class leaves it static). The canvas never takes clicks, and clicking the effect's empty area never selects text.

> Custom code doesn't run in the Webflow **Designer** canvas. Check it in **Preview** or on the published staging site.

**Older markup still works:** a single `[data-particles]` element (with `data-preset`) gets the canvas straight inside it, and `data-particles-excite` finds the nearest effect in the same container.

### Per section

Each section's attributes, `.u-particles-threejs` CSS (desktop and mobile), requirements and behaviour are on its tab of the [live reference](https://clarify-particles.vercel.app/).

| Section | Preset | Component | Tab |
|---|---|---|---|
| Hero ("Learn from the past and predict the future") | `hero` | the hero section (`data-how-component` + `data-how-wrap`); its "Book a demo" and "Talk to an engineer" buttons get `data-particles-excite` | [#hero](https://clarify-particles.vercel.app/#hero) |
| CTA ("See how Clarify solves yours") | `cta` | the card; an empty `data-particles-bg` div in it for the background (optional); the "Get started" button gets `data-particles-excite` | [#cta](https://clarify-particles.vercel.app/#cta) |
| What Clarify does ("How Clarify helps you earn more, and cut cost") | `fjord` | the section (`data-fjord-component`); the map panel is `data-fjord-wrap`; the tabs get `data-fjord-tab` | [#fjord](https://clarify-particles.vercel.app/#fjord) |

## Built in

- **Pausing:** it stops completely when no particle section is on screen. The loop also survives tab switches and WebGL context loss.
- **Resolution cap:** 2× pixel density (1.5× on phones).
- **Resizing:** no restart, including the mobile address bar showing or hiding.
- **`prefers-reduced-motion`:** a single still frame, with no animation.
- **No WebGL:** the section shows its normal Webflow design.
- **Accessibility:** the canvas is `aria-hidden`.

## JavaScript API (optional)

Everything mounts automatically. You only need these for content added later, or for page-transition libraries:

```js
ClarifyParticles.init(container?)   // mount new components (after CMS load / page transition)
ClarifyParticles.destroy(element?)  // tear down one component (pass it or anything inside it), or all
ClarifyParticles.refresh(element?)  // re-read attributes after changing them
ClarifyParticles.set(element, { holdShape: "spiral" })  // change live settings without a remount
ClarifyParticles.debug()            // live state: load timeline, loop, WebGL context, sections, recent events
```

Removed elements free their GPU resources automatically, even without `destroy()`.

Each element fires a bubbling **`particles:ready`** event on its first frame, as the effect fades in. You can use it to time intro animations:

```js
card.addEventListener("particles:ready", () => gsap.from(".cta__content", { opacity: 0, y: 12 }));
```

## Troubleshooting

- **Nothing appears:**
  - Check the console for `[particles]` warnings, which name the element and the bad attribute or preset.
  - Check it's the published or preview site, not the Designer.
- **Effect covers content:** the element probably has an unusual stacking setup. The canvas is `z-index: -1` inside an `isolation: isolate` element.
- **Diagnose live:** `ClarifyParticles.debug()` in the console.

# Clarify particles: Webflow handover

Interactive particle/network backgrounds for Webflow sections. You don't need a build step or a framework: add one script to the site, then mark each section with two attributes. Each section's look lives in this repo as a named **preset**, so no design settings go into Webflow.

- **Live reference:** [ish-development.github.io/clarify-particles/dist-runtime/demo.html](https://ish-development.github.io/clarify-particles/dist-runtime/demo.html) shows every finished section running the production script.
- **All attributes:** [docs/CONFIG.md](../docs/CONFIG.md)

## 1. Add the script (once, site-wide)

**Site settings → Custom code → Footer code:**

```html
<script type="module" src="https://cdn.jsdelivr.net/gh/Ish-Development/clarify-particles@1.2.0/dist-runtime/particles.js"></script>
```

Always pin the version (`@1.2.0`), never `@latest` or a branch. Pinned URLs never change, so they're cached permanently. New releases get a new version number and you update this one line.

### Or through the site's `window.libs` loader

```js
/* PARTICLES (Three.js engine) */
window.loadParticles = () => {
  if (!document.querySelector("[data-particles]")) return Promise.resolve();
  return window.libs.load("particles", () =>
    import("https://cdn.jsdelivr.net/gh/Ish-Development/clarify-particles@1.2.0/dist-runtime/particles.js")
  );
};
```

It must use `import()`, not `window.libs.script()`. The file is an ES module that loads its engine relative to its own URL, and as a classic `<script>` that path would break.

### What loads, and when

- **`particles.js`** is a loader of about 3 kB gzipped. It finds `[data-particles]` elements and does nothing else up front.
- **`engine.js`** (~147 kB gzipped, mostly Three.js) is fetched only after all three of these:
  - the page's `load` event
  - an idle moment
  - a particle section coming within half a screen of the viewport
- **Once per page:** the engine is fetched once however many sections use it, and they all draw through **one** WebGL context. Three.js is bundled in (only the parts used), so there's no separate Three.js script to add.

## 2. Mark up the sections

Each effect is a **component**:

```
[data-particles-component]        the component (e.g. the card): its settings + the scope for its buttons
  [data-particles-wrap]           where the effect goes (optional: defaults to the component itself)
    div.u-particles-threejs       CREATED BY THE SCRIPT: style this class in Webflow
      <canvas>                    created by the script, 100% x 100% of that div
```

- **Loop:** the script loops through every `[data-particles-component]`, finds its `[data-particles-wrap]`, and creates `<div class="u-particles-threejs">` as the wrap's first child with the canvas inside.
- **Styling the div:** the script adds no positioning or size to that div, so **style `.u-particles-threejs` in Webflow**. The canvas always fills it at 100% × 100%. If the div ends up with no size, the console warns you.
- **Settings:** `data-preset` goes on the component (or the wrap, which wins if both have one).
- **Buttons:** `data-particles-excite` elements inside a component light up **that component's** effect only, so several components on one page each react to their own button.

### CTA ("See how Clarify solves yours", Figma `13311:5898`)

| Element | Attributes |
|---|---|
| the card (Figma `13311:5899`) | `data-particles-component`<br>`data-preset` = `cta` |
| the wrap: the card itself, or an inner div covering the card | `data-particles-wrap` |
| the **"Get started" button** | `data-particles-excite` |

**`.u-particles-threejs` style for the CTA:** `position: absolute; top: 0; right: 0; bottom: 0; left: 45%` (the right 55% of the card).

Card requirements (as in Figma):
- **Clipping:** keep `overflow: clip` (or `hidden`), the 24 px radius, and `position: relative`. The network bleeds off the top, right and bottom of its div, and the card crops it.
- **Left edge:** the network's left edge always stays inside the div, so it never reaches the text.

What the script does to the created div: sets `isolation: isolate` (and `position: relative` only if your class leaves it static). The canvas never takes clicks, and clicking the effect's empty area never selects text.

**Growth on big screens:** the card follows the site container, which stops at 1512 px wide, so the effect stops growing there too. That's expected.

> Custom code doesn't run in the Webflow **Designer** canvas. Check it in **Preview** or on the published staging site.

**Not designed yet:** mobile. Restyle `.u-particles-threejs` for the mobile breakpoint in Webflow (e.g. the bottom part of the card); the effect follows the div.

**Older markup still works:** a single `[data-particles]` element (with `data-preset`) gets the canvas straight inside it, and `data-particles-excite` finds the nearest effect in the same container.

## Behaviour to expect (CTA)

- **Loop:** three round network shapes (constellation → clusters → spiral). Each holds for 6 s, then glides into the next over 2 s.
- **Depth:** far nodes are smaller and dimmer, and the network tilts gently toward the cursor.
- **Hover:** the nodes nearest the cursor softly brighten and are pushed aside.
- **Click:** clicking the network sends a slow ripple of light through the connections. Clicking the empty effect area never selects text.
- **Button:** hovering "Get started" lights the whole network up.

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

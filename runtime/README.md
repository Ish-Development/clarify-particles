# Clarify particles: Webflow handover

Interactive particle/network backgrounds for Webflow sections. You don't need a build step or a framework: add one script to the site, then mark each section with two attributes. Each section's look lives in this repo as a named **preset**, so no design settings go into Webflow.

- **Live reference:** [`dist-runtime/demo.html`](https://cdn.jsdelivr.net/gh/Ish-Development/clarify-particles@1.0.0/dist-runtime/demo.html) shows every finished section running the production script.
- **All attributes:** [docs/CONFIG.md](../docs/CONFIG.md)

## 1. Add the script (once, site-wide)

**Site settings → Custom code → Footer code:**

```html
<script type="module" src="https://cdn.jsdelivr.net/gh/Ish-Development/clarify-particles@1.0.0/dist-runtime/particles.js"></script>
```

Always pin the version (`@1.0.0`), never `@latest` or a branch. Pinned URLs never change, so they're cached permanently. New releases get a new version number and you update this one line.

### Or through the site's `window.libs` loader

```js
/* PARTICLES (Three.js engine) */
window.loadParticles = () => {
  if (!document.querySelector("[data-particles]")) return Promise.resolve();
  return window.libs.load("particles", () =>
    import("https://cdn.jsdelivr.net/gh/Ish-Development/clarify-particles@1.0.0/dist-runtime/particles.js")
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

**Element settings → Custom attributes** on the element named below:

| Section | Element | Attributes |
|---|---|---|
| **CTA**: "See how Clarify solves yours" (Figma `13311:5898`) | the rounded **card** (Figma `13311:5899`), not the outer section | `data-particles` = *(empty)*<br>`data-preset` = `cta` |
| | the **"Get started" button** inside the card | `data-particles-excite` = *(empty)* |

CTA card requirements (as in Figma):
- **Clipping:** keep `overflow: clip` (or `hidden`) and the 24 px radius. The network bleeds off the card's top, right and bottom, and the card crops it.
- **Right side:** the effect covers the card's right 55% and never enters the text area on the left.
- **Button:** hovering or focusing "Get started" makes the network light up.

The script inserts a `<div><canvas></div>` as the element's first child:
- **Stacking:** it sits behind the element's content and above its background.
- **Clicks:** it never takes clicks.
- **Element styles:** the script sets `isolation: isolate` on the element, and `position: relative` if it was static. It changes nothing else.

> Custom code doesn't run in the Webflow **Designer** canvas. Check it in **Preview** or on the published staging site.

**Not designed yet:** mobile. The CTA keeps the right-55% layout at every width. When the card stacks on mobile, the effect needs its own mobile setting. Ask before launch.

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
ClarifyParticles.init(container?)   // mount new [data-particles] elements (after CMS load / page transition)
ClarifyParticles.destroy(element?)  // tear down one element, or all
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

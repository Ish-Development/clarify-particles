# Architecture and decisions

## Pieces

```
src/core/          simulation, no rendering: shared by runtime and playground
  config.ts          points config + defaults + SHAPE_NAMES
  shapes.ts          points shape functions (index -> position per frame)
  particles.ts       ParticleSystem (typed arrays, springs, non-resetting resize)
  graphConfig.ts     graph config + defaults + GRAPH_MODES (kept tiny: see "Loader size")
  graph.ts           graph layouts (network style, shapes), GraphSystem (timeline,
                     projection, depth/parallax, highlights, pulses, ripple, intro)
  interaction.ts     pointer forces (hover push, click burst/reshuffle)
  noise.ts, rng.ts, color.ts
src/runtime/       what ships to Webflow
  index.ts           LOADER (eager, ~3 kB gz): finds components / [data-particles], waits, imports engine
  host.ts            component markup: creates div.u-particles-threejs in the wrap
  spec.ts            attribute/preset/JSON parsing + validation
  defaults.ts        runtime defaults (points/graph + RuntimeOptions)
  presets.json       named section looks (written by the playground)
  presets.ts         typed access to presets.json
  engine.ts          ENGINE chunk (lazy, ~147 kB gz): Three.js renderer, views, loop
src/playground/    design tool (DialKit panels) rendering through the real engine
src/sections/      Figma section markup + tokens (playground frames, sections.html, demo.html)
sections.html      preview of built sections with the production runtime (+ ?debug)
scripts/build-demo.mjs  composes dist-runtime/demo.html from src/sections
dist-runtime/      COMMITTED build output served by jsDelivr (particles.js, engine.js, demo.html)
```

## Runtime flow

1. **Loader** (`index.ts`):
   - An IntersectionObserver with a `50%` rootMargin watches every `[data-particles-component]`, plus any legacy `[data-particles]` element.
   - The first time one approaches the viewport, it waits for `pageReady` (`window.load` + `requestIdleCallback`, 300 ms cap).
   - Then `import("./engine.js")` fetches the engine once, and the loader creates the host div and calls `mount(host, parseSpec([component, wrap]), { root: component })`.
2. **Engine** (`engine.ts`):
   - **One `Stage`:** one `WebGLRenderer` with its own offscreen canvas.
   - **One `View` per element:**
     - **DOM (v1.2, dev's spec):**
       - **The div:** for each `[data-particles-component]`, the loader creates `div.u-particles-threejs` inside its `[data-particles-wrap]` (`host.ts`). Webflow styles that class.
       - **The canvas:** the engine puts a 2D `<canvas>` in that div at 100% × 100%, with no inset.
       - **Scope:** the component is the view's `root`, which scopes its excite buttons, parallax and click handling.
       - **Legacy:** a `[data-particles]` element gets the canvas directly.
       - **Earlier versions:** a wrapper box and a `canvasInset` option (removed in v1.1).
     - **Each frame:** the view's scene is rendered into the shared GL buffer, and `drawImage` copies it into the view's own canvas.
     - **Why:** browsers cap WebGL contexts at about 16, and each costs GPU memory. A per-element 2D canvas also stacks, clips and scrolls natively with the Webflow layout. A single fixed full-page GL canvas can't sit behind content and above section backgrounds at the same time.
3. **Views:**
   - **`PointsView`:** `ParticleSystem` drawn as one `Points` draw call.
   - **`GraphView`:** `GraphSystem` drawn as:
     - edge layers (instanced quads, so line width is real CSS px; WebGL `LINES` are 1 device px)
     - highlight segments (pulse trails, hover path)
     - node `Points`
     - pulse-head `Points`
   - **Shaders:** positions are in CSS px, and the vertex shader maps them to clip space (no camera). Blending uses premultiplied alpha. Colors are passed through untouched, with no color management, so they match the design values.
4. **Loop:**
   - **Scheduling:** a single `requestAnimationFrame` loop runs while any view is visible, and stops itself otherwise.
   - **Sleep/wake:** the loop stops when no view is visible, and `wake()` restarts it.
   - **Watchdog:** a 1 s watchdog, plus the `visibilitychange`, `focus`, `pageshow` and `pointermove` events, restarts a stalled loop.
   - **Lost GL context:** if the browser never restores it, the engine creates a new `Stage` (1.5 s watchdog). The scenes don't belong to any renderer, so they simply re-upload.

## Graph "network style" (the look the client chose)

`networkOf(shapeLayout, n, seed, mix, spokes)` is the recipe behind `constellation`, `clusters` and `spiral`:

- **Positions:** a blend of a random hub-burst disc and the shape. `mix` sets how strictly nodes follow the shape.
- **Hub:** node 0. Every network shape puts node 0 at the top pole (0, 1, 0), so the hub, and the fan of spokes into it, stays in the same place across morphs.
- **Edges:** spokes from every node to the hub (weight = `spokes`), plus the shape's own mesh (kNN or structural). `meshFrom` marks where the mesh edges start; pulses, paths and ripples travel on the mesh only.
- **Spacing:** `spaceOut()` pushes apart nodes closer than 80% of the even spacing for their count, preserving each node's radius. This is the "not messy" fix.

## Decisions log

- **Shipping format:**
  - The site gets presets, not attributes. Looks live in `presets.json`, and Webflow only references `data-preset`, so re-styling never touches Webflow.
  - The playground renders through the production engine, so what you tune is what ships. It saves presets through a dev-server endpoint (`POST /__presets`, see `vite.config.ts`).
- **Three.js:** chosen by the client/dev. It's bundled and tree-shaken into `engine.js` rather than loaded from a separate CDN script. Current Three.js has no UMD build (since r160), so the dev's `libs.script()` pattern can't load it anyway.
- **Loading:** the engine loads after `window.load` + idle (the dev's request), and fades in on its first frame (0.8 s).
- **Hosting:** jsDelivr from the **public** repo `Ish-Development/clarify-particles`, pinned tags. `dist-runtime/` is committed so a tag is directly servable.

## Gotchas (learned the hard way)

- **Negative frame delta:**
  - A rAF timestamp can be earlier than the `performance.now()` taken when the loop was woken.
  - The negative `dt` sent the sequence clock negative, which indexed layout −1 and threw inside the frame.
  - That was the "animation missing / slow / gone after switching windows" bug. `dt` is clamped ≥ 0.
- **Sequence hold looked like a morph:** during a hold, `timeline()` returns `from ≠ to` with `t = 0`. "Morphing" means `blending && t > 0`. Before the fix, pulses, the hover path and the ripple silently never ran.
- **`document.hidden` isn't reliable:** don't gate the loop on it. Arc can leave it stuck `true`, and browsers already stop rAF for hidden pages.
- **Canvas layout:** a `<canvas>` is a replaced element and won't stretch between insets, so it's sized with `width/height: 100%` rather than insets.
- **Back-face culling:** the vertex shader flips y, which reverses triangle winding. Line quads need `DoubleSide`.
- **`sortObjects`:** Three's transparent sorting computes bounding spheres from our 2-component positions and logs NaN, so `renderer.sortObjects = false`. Draw order is explicit.
- **Loader size:** anything the loader imports from `core/graph.ts` drags the layout builders into the eager chunk. Keep config and defaults in `graphConfig.ts`.
- **Dev server vs your browser:**
  - Editing `vite.config.ts` restarts Vite and hot-reloads open tabs, even background ones. That can leave a page with two module copies and a broken loop.
  - **Review on the stable preview** (`npm run build && npx vite preview --port 4791`), not the dev server.
- **Presets file and HMR:** `presets.json` is excluded from HMR (`handleHotUpdate`), so saving a preset doesn't reload the playground.

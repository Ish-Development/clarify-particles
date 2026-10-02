# Clarify particles

Production particle/network effects for the Clarify Webflow site, plus the playground used to design them. The client designs section by section from Figma. A Webflow dev implements them with `data-particles` + `data-preset` attributes and one script tag.

Read first:
- `docs/SECTIONS.md`: per-section specs and every tuning decision
- `docs/ARCHITECTURE.md`: how it works, and the gotchas
- `runtime/README.md`: the dev handover
- `docs/CONFIG.md`: every setting

## Commands

```bash
npm run dev             # playground http://localhost:4790 (+ /sections.html, ?debug)
npm run build           # playground + sections preview -> dist/
npx vite preview --port 4791   # STABLE preview of dist/ for client review (no HMR)
npm run build:runtime   # production files -> dist-runtime/ (particles.js, engine.js, demo.html)
npx vite preview --config vite.runtime.config.ts --port 4792   # the reference page: localhost:4792/demo.html
npx tsc -b              # typecheck
```

- **Client review:** always show the client **http://localhost:4791/sections.html**. Rebuild (`npm run build`) after changes and have them refresh.
- **Why not the dev server:** 4790 hot-reloads background tabs, and restarts break pages.
- **Variants:** `sections.html?cta=<preset>` previews another preset for a section; `?debug` shows a live state overlay. `?debug` also posts it to `.particles-debug.log` (dev server and stable preview); `?debug=log` does that with no overlay, for phone tests (preview with `--host`, phone on the LAN IP).
- **Playground deep link:** `/?preset=cta&frame=cta`.
- **Tune page (dev server):** `/tune.html?preset=cta`: the CTA alone at real size (no scaling, so fine patterns render 1:1) with a DialKit panel for the grid pattern and the network's brightness/gaps, a Figma palette in each color folder; "Save preset" writes the desktop config to `presets.json` (keeps the breakpoint tiers), "Copy values" copies every dial as JSON.

## Release (the dev's script URL pins a tag)

1. Bump `version` in package.json **first**: the reference page prints it in the script tag.
2. `npm run build:runtime`, then commit, **including `dist-runtime/`**, and tag: `git tag vX.Y.Z && git push && git push --tags`.
3. jsDelivr serves `https://cdn.jsdelivr.net/gh/Ish-Development/clarify-particles@X.Y.Z/dist-runtime/particles.js`.
4. Give the dev the new version number, and update it in `runtime/README.md`.

A tag's files are cached permanently: never re-point or reuse a tag, always release a new version.

## Working conventions

- **Showing variants:** add a new preset (e.g. `cta-plus`) instead of changing the approved one, and link `?cta=<variant>`. The client often wants to compare, then go back.
- **Tuning changes:** usually belong in `presets.json`. Add engine options (`src/core/graphConfig.ts` + defaults + playground `fields.ts` + `docs/CONFIG.md`) only when a look needs one. Keep new options off by default so existing presets don't change.
- **Verification:** screenshot through agent-browser and crop the canvas region. Test multiple fresh loads for anything touching the loop or loading.
- **Mobile rule (every effect, under 768 px):** `.u-particles-threejs` is a full-width band, `50svh` tall; the animation is centered in it and cropped (preset `breakpoints` tiers, e.g. `maxWidth` 991 and 430; check the bottom edge across a full morph loop). The section reserves the band with padding-top.
- **Typography:** headings `text-wrap: balance`, paragraphs `text-wrap: pretty` (global rule in `sections.css`; on the Setup tab for the devs).
- **Section markup:** lives in `src/sections/` (Figma tokens in `tokens.css`, mobile mode under 768 px) and feeds the playground frames, `sections.html` and `demo.html`.
- **Reference page** (`dist-runtime/demo.html`, on GitHub Pages): one tab per section (a viewer: the section in an iframe at a real screen width, 1920 → 320 buttons, drag-to-resize corner, Fit/100% scale; then the Webflow guide) plus Setup, for the devs and the client. Per-section guide text lives in `src/sections/guide.js`; the markup and CSS shown are read from the templates and `sections.css`.

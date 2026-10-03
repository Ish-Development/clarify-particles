# Clarify particles

Production particle/network effects for the Clarify Webflow site, and the reference page used to design, review and hand them off. Figma is only a prototype: the real thing is what's built here and shown on the reference page, which is the source of truth for layout, tokens and look. A Webflow dev implements them with `data-particles` + `data-preset` attributes and one script tag.

Read first:
- `docs/SECTIONS.md`: per-section specs and every tuning decision
- `docs/ARCHITECTURE.md`: how it works, and the gotchas
- `runtime/README.md`: the dev handover
- `docs/CONFIG.md`: every setting

## Commands

```bash
npm run build:runtime   # production files -> dist-runtime/ (particles.js, engine.js, demo.html)
npx vite preview --config vite.runtime.config.ts --port 4792 --host   # the reference page: localhost:4792/demo.html (--host: phones on the LAN too, e.g. 192.168.1.134:4792/demo.html?only=hero)
npx tsc -b              # typecheck
```

- **One page (since 2026-10-03):** the reference page is the only page. Work and review on **http://localhost:4792/demo.html** (one tab per section, breakpoint buttons 1920 → 320); the devs get the same page on Vercel. The playground, `sections.html` and the tune page were deleted at the user's request (in git history if ever needed). Rebuild with `npm run build:runtime` after changes and have the user refresh (hard refresh if it looks stale). `build:runtime` rewrites the committed `dist-runtime/`: at release, rebuild after the version bump.
- **Variants:** `demo.html?cta=<preset>` previews another preset in a section.
- **Tuning:** edit `src/runtime/presets.json`, rebuild, compare screenshots.

## Release (the dev's script URL pins a tag)

1. Bump `version` in package.json **first**: the reference page prints it in the script tag.
2. `npm run build:runtime`, then commit, **including `dist-runtime/`**, and tag: `git tag vX.Y.Z && git push && git push --tags`.
3. jsDelivr serves `https://cdn.jsdelivr.net/gh/Ish-Development/clarify-particles@X.Y.Z/dist-runtime/particles.js`.
4. Give the dev the new version number, and update it in `runtime/README.md`.
5. Update the Vercel copy of the reference page (ISH team, project `clarify-particles`, https://clarify-particles.vercel.app): `vercel deploy --prod --scope ish24`. It serves the committed `dist-runtime/` as-is (`vercel.json`, `.vercelignore`); GitHub Pages updates on push by itself.

A tag's files are cached permanently: never re-point or reuse a tag, always release a new version.

## Working conventions

- **Showing variants:** add a new preset (e.g. `cta-plus`) instead of changing the approved one, and link `?cta=<variant>`. The client often wants to compare, then go back.
- **Tuning changes:** usually belong in `presets.json`. Add engine options (`src/core/config.ts` / `graphConfig.ts` + defaults + `docs/CONFIG.md`) only when a look needs one. Keep new options off by default so existing presets don't change.
- **Verification:** screenshot through agent-browser and crop the canvas region. Test multiple fresh loads for anything touching the loop or loading.
- **Mobile rule (every effect, under 768 px):** `.u-particles-threejs` is a full-width band, `50svh` tall; the animation is centered in it and cropped (preset `breakpoints` tiers, e.g. `maxWidth` 991 and 430; check the bottom edge across a full morph loop). The section reserves the band with padding-top.
- **Typography:** headings `text-wrap: balance`, paragraphs `text-wrap: pretty` (global rule in `sections.css`; on the Setup tab for the devs).
- **Section markup:** lives in `src/sections/` (Figma tokens in `tokens.css`, mobile mode under 768 px) and feeds `demo.html`.
- **Reference page** (`dist-runtime/demo.html`, on GitHub Pages): one tab per section (a viewer: the section in an iframe at a real screen width, 1920 → 320 buttons, drag-to-resize corner, Fit/100% scale; then the Webflow guide) plus Setup, for the devs and the client. Per-section guide text lives in `src/sections/guide.js`; the markup and CSS shown are read from the templates and `sections.css`.

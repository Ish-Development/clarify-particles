# Clarify particles

Interactive particle and network backgrounds for the Clarify Webflow site: a production script for the site, and a reference page (one tab per section) for designing, reviewing and handing off each section's look.

**Webflow devs:** start with [runtime/README.md](runtime/README.md). You need one script tag, and two attributes per section.

```html
<script type="module" src="https://cdn.jsdelivr.net/gh/Ish-Development/clarify-particles@1.5.1/dist-runtime/particles.js"></script>
```

| Doc | For |
|---|---|
| [runtime/README.md](runtime/README.md) | Webflow integration, per-section markup, API, troubleshooting |
| [docs/SECTIONS.md](docs/SECTIONS.md) | Each section's Figma source, preset and design decisions |
| [docs/CONFIG.md](docs/CONFIG.md) | Every setting |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How it works, decisions, gotchas |
| [CLAUDE.md](CLAUDE.md) | Working on the repo: commands, review and release process |

## Develop

```bash
npm install
npm run build:runtime   # production files + reference page -> dist-runtime/
npx vite preview --config vite.runtime.config.ts --port 4792   # localhost:4792/demo.html
```

- **Stack:** Vite + TypeScript, Three.js (bundled into the lazily loaded engine).
- **Structure:** `src/core` is the simulation, `src/runtime` is what ships, `src/sections` holds the Figma section markup, and `scripts/build-demo.mjs` builds the reference page.

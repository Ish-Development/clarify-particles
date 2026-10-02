# Clarify particles

Interactive particle and network backgrounds for the Clarify Webflow site: a production script for the site, and a playground for designing each section's look.

**Webflow devs:** start with [runtime/README.md](runtime/README.md). You need one script tag, and two attributes per section.

```html
<script type="module" src="https://cdn.jsdelivr.net/gh/Ish-Development/clarify-particles@1.4.0/dist-runtime/particles.js"></script>
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
npm run dev             # playground: design looks, save section presets
npm run build:runtime   # production files -> dist-runtime/
```

- **Stack:** Vite + TypeScript, Three.js (bundled into the lazily loaded engine) and DialKit (playground panels).
- **Structure:** `src/core` is the simulation, `src/runtime` is what ships, `src/playground` is the design tool, and `src/sections` holds the Figma section markup.

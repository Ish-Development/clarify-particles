# Sections

One entry per site section: Figma source, where the effect mounts, the preset, and what was decided with the client while tuning. Figma file: **Clarify — Website Design Foundation (Internal)**, key `Z2um6nL77J4AOzXI1PC35c`.

Workflow for a new section:
1. **Figma context:** get the design context, variables and screenshot for the section node.
2. **Template:** build `src/sections/<name>.html` using the tokens in `src/sections/tokens.css`, with the Webflow component markup (`data-particles-component` + `data-preset` on the component, `data-particles-wrap`, and `data-particles-excite` on any trigger). Style `.u-particles-threejs` for it in `sections.css`, the way Webflow will.
3. **Register it** as a frame in the playground (`TEMPLATES` / `FRAMES` in `src/playground/main.ts`), in `sections.html` (`addSection`), and in `SECTIONS` in `scripts/build-demo.mjs`.
4. **Tune and save:** tune in the playground (`?frame=<name>`) and save the preset under the section's name.
5. **Review** with the client on the stable preview (port 4791), then release (see CLAUDE.md).

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
| sizeMin / sizeMax | 2 / 6 | Asked for half-size dots |
| solid, softness | true, 0 | Filled dots, lines don't show through |
| opacity | 0.30–0.85, tiers 3 | Darker dots |
| lineOpacity / lineWidth | 0.18 / 2 | Darker lines |
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
- **Open:**
  - **Mobile layout:** not designed.
  - **Figma copy:** the body text in Figma starts with a stray leading space; it's omitted in our markup.

- **Explored and rejected** (available as options):
  - **Shapes:** torus, helix, galaxy, globe, knot, atom, icosa and wave in the CTA. The flat ones turn edge-on; the others read as "not the constellation style".
  - **Fit:** fully inside the canvas. The client preferred big and bleeding.

// The models gallery: every model (models.ts) in its own tile, grouped by
// style, each linking to the export lab with that model open. Run with the
// lab's dev server and open /lab/models.html.
import { mount } from "../src/runtime/engine";
import { MODELS, STYLES, specFor } from "./models";

const main = document.getElementById("grid")!;
for (const [style, title] of STYLES) {
  const models = MODELS.filter((m) => m.style === style);
  if (!models.length) continue;
  const h = document.createElement("h2");
  h.textContent = title;
  const grid = document.createElement("div");
  grid.className = "grid";
  main.append(h, grid);
  for (const m of models) {
    const a = document.createElement("a");
    a.className = "tile";
    a.href = `./export.html?model=${encodeURIComponent(m.name)}`;
    a.innerHTML = `<div class="art"></div><div class="name"><span></span><em></em></div>`;
    a.querySelector(".name span")!.textContent = m.name;
    const tag = a.querySelector(".name em")!;
    tag.textContent = m.site ? "on site" : "new";
    if (!m.site) tag.classList.add("new");
    grid.append(a);
    const art = a.querySelector<HTMLElement>(".art")!;
    mount(art, specFor(art, m), { root: art });
  }
}

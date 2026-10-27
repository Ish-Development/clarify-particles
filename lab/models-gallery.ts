// The models gallery: every model (models.ts) in its own tile, grouped by
// style, each linking to the export lab with that model open. Run with the
// lab's dev server and open /lab/models.html.
import { mount } from "../src/runtime/engine";
import { MODELS, STYLES, fitDots, specFor } from "./models";

const main = document.getElementById("grid")!;
const list = document.getElementById("list")!;
STYLES.forEach(([style, title], i) => {
  const models = MODELS.filter((m) => m.style === style);
  if (!models.length) return;
  const section = document.createElement("section");
  section.id = style;
  const h = document.createElement("h2");
  h.textContent = title;
  const grid = document.createElement("div");
  grid.className = "grid";
  section.append(h, grid);
  main.append(section);
  // the rail: the style, numbered, and its models under it
  const g = document.createElement("a");
  g.className = "group";
  g.href = `#${style}`;
  g.innerHTML = `<span class="eyebrow">${String(i + 1).padStart(2, "0")}</span><span></span>`;
  g.lastElementChild!.textContent = title;
  list.append(g);
  for (const m of models) {
    const href = `./export.html?model=${encodeURIComponent(m.name)}`;
    const r = document.createElement("a");
    r.href = href;
    r.textContent = m.name;
    list.append(r);
    const a = document.createElement("a");
    a.className = "tile";
    a.href = href;
    a.innerHTML = `<div class="art"></div><div class="name"><span></span><em></em></div>`;
    a.querySelector(".name span")!.textContent = m.name;
    const tag = a.querySelector(".name em")!;
    tag.textContent = m.site ? "on site" : "new";
    if (!m.site) tag.classList.add("new");
    grid.append(a);
    const art = a.querySelector<HTMLElement>(".art")!;
    mount(art, specFor(art, m), { root: art });
    fitDots(art, art.clientWidth);
  }
});

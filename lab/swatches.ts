// The lab's colour panel (left): every place a colour is used, with its
// swatch, and the Figma colour scales as rows of swatches underneath (laid
// out like parasail-pattern.vercel.app). Pick a place, click a swatch; the
// DialKit dropdowns follow. Swatches in use get a dot, the picked place's
// colour a ring.
import { FIGMA_SCALES, colorName } from "../src/sections/figma-colors";

type Kit = {
  values: Record<string, unknown>;
  setValues(v: Record<string, unknown>): void;
  subscribe(fn: () => void, immediate?: boolean): () => void;
};
export type Slot = { section: string; label: string; kit: Kit; folder: string; key: string };

const get = (s: Slot) => String((s.kit.values[s.folder] as Record<string, unknown>)[s.key]).toLowerCase();

export function mountSwatches(slots: Slot[], extras: string[]) {
  const el = document.createElement("aside");
  el.id = "swatches";
  document.body.appendChild(el);
  let active = 0;

  const rows: { name: string; hexes: { hex: string; label: string }[] }[] = FIGMA_SCALES.map((sc) => ({
    name: sc.name,
    hexes: sc.steps.map(([step, hex]) => ({ hex, label: `${sc.name}/${step}` })),
  }));
  const others = [...new Set(extras.map((h) => h.toLowerCase()))].filter((h) => !colorName(h));
  if (others.length) rows.push({ name: "Other", hexes: others.map((hex) => ({ hex, label: "the released map's own grey, not a Figma variable" })) });

  function render() {
    const used = new Set(slots.map(get));
    const cur = get(slots[active]);
    let html = "";
    let section = "";
    slots.forEach((s, i) => {
      if (s.section !== section) {
        if (section) html += `</div>`;
        section = s.section;
        html += `<div class="group"><h3>${section}</h3>`;
      }
      const hex = get(s);
      html += `<button class="slot${i === active ? " on" : ""}" data-slot="${i}">
        <i style="background:${hex}"></i><span>${s.label}</span><em>${colorName(hex) ?? "not Figma"}</em></button>`;
    });
    html += `</div><div class="palette"><h3>${slots[active].label} <em>${colorName(cur) ?? cur}</em></h3>`;
    for (const r of rows) {
      html += `<div class="row"><span>${r.name}</span>`;
      for (const { hex, label } of r.hexes) {
        const cls = [hex === cur ? "cur" : "", used.has(hex) ? "used" : ""].join(" ");
        html += `<button class="sw ${cls}" data-hex="${hex}" title="${label} · ${hex}" style="background:${hex}"></button>`;
      }
      html += `</div>`;
    }
    el.innerHTML = html + `</div>`;
  }

  el.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("button");
    if (!b) return;
    if (b.dataset.slot) {
      active = Number(b.dataset.slot);
      render();
    } else if (b.dataset.hex) {
      const s = slots[active];
      s.kit.setValues({ [s.folder]: { [s.key]: b.dataset.hex } });
    }
  });
  for (const k of new Set(slots.map((s) => s.kit))) k.subscribe(render, false);
  render();
}

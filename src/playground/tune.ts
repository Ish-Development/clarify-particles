// Tune page (dev server only): one section at its real size with a DialKit
// panel for the grid pattern. Edits apply live (the engine
// reads the config object by reference); "Save preset" writes it to
// src/runtime/presets.json, keeping the preset's breakpoint tiers.
import { createDialKit, createDialRoot } from "dialkit/vanilla";
import "dialkit/vanilla/styles.css";
import { graphDefaults, type GraphViewConfig } from "../runtime/defaults";
import { mount, remount } from "../runtime/engine";
import { COMPONENT, createHost } from "../runtime/host";
import type { Preset } from "../runtime/presets";
import { diffConfig } from "./fields";
import { colorName, FIGMA_SCALES } from "../sections/figma-colors";
import "../sections/sections.css";
import ctaHtml from "../sections/cta.html?raw";

type Values = Record<string, any>;

const name = new URLSearchParams(location.search).get("preset") || "cta";
const toastEl = document.getElementById("toast")!;
function toast(msg: string) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout((toast as any).t);
  (toast as any).t = setTimeout(() => toastEl.classList.remove("show"), 2200);
}

const presets: Record<string, Preset> = await (await fetch("/__presets")).json();
const preset = presets[name];
if (!preset || preset.type !== "graph") throw new Error(`no graph preset "${name}"`);

// the desktop config (breakpoint tiers are kept as they are on save)
const cfg: GraphViewConfig = structuredClone({ ...graphDefaults, ...preset.config }) as GraphViewConfig;

const section = document.getElementById("section")!;
section.innerHTML = ctaHtml;
const component = section.querySelector<HTMLElement>(COMPONENT)!;
const host = createHost(component).el;
const spec = () => ({ type: "graph" as const, config: cfg });
mount(host, spec(), { editor: true, root: component });

// --- sliders (DialKit) ---

// folder, label (DialKit title-cases it), config key. Each folder with a
// color also gets a Figma palette under its picker (see palettes below).
type Ctl =
  | { folder: string; label: string; key: keyof GraphViewConfig; slider: [number, number, number] }
  | { folder: string; label: string; key: keyof GraphViewConfig; options: [string, string][] };
const CTLS: Ctl[] = [
  { folder: "squares", label: "opacity", key: "grid", slider: [0, 1, 0.01] },
  { folder: "squares", label: "colorStrength", key: "gridBase", slider: [0, 1, 0.01] },
  { folder: "squares", label: "spacing", key: "gridPitch", slider: [2, 12, 1] },
  { folder: "squares", label: "size", key: "gridDot", slider: [1, 10, 1] },
  { folder: "network", label: "nodeBrightnessMin", key: "opacityMin", slider: [0, 1, 0.01] },
  { folder: "network", label: "nodeBrightnessMax", key: "opacityMax", slider: [0, 1, 0.01] },
  { folder: "network", label: "lineBrightness", key: "lineOpacity", slider: [0, 1, 0.01] },
  { folder: "network", label: "lineThickness", key: "lineWidth", slider: [0.25, 4, 0.05] },
  { folder: "network", label: "hoverGlow", key: "hoverGlow", slider: [0, 1, 0.01] },
  { folder: "network", label: "hoverGlowRadius", key: "hoverRadius", slider: [20, 400, 1] },
  { folder: "network", label: "lineGap", key: "lineGap", slider: [0, 6, 0.25] },
  { folder: "network", label: "nodeGap", key: "nodeGap", slider: [0, 6, 0.25] },
  { folder: "hover", label: "strength", key: "gridHot", slider: [0, 1, 0.01] },
  { folder: "hover", label: "radius", key: "gridHotRadius", slider: [8, 240, 1] },
  { folder: "hover", label: "fadeSeconds", key: "gridHotFade", slider: [0.1, 5, 0.05] },
  {
    folder: "drifting",
    label: "mode",
    key: "gridAuto",
    options: [
      ["touch", "touch (phones/tablets)"],
      ["always", "always (preview here)"],
      ["off", "off"],
    ],
  },
  { folder: "drifting", label: "strength", key: "gridAutoStrength", slider: [0, 1, 0.01] },
  { folder: "drifting", label: "count", key: "gridAutoCount", slider: [0, 4, 1] },
  { folder: "drifting", label: "size", key: "gridAutoSize", slider: [20, 400, 1] },
  { folder: "drifting", label: "speed", key: "gridAutoSpeed", slider: [0, 0.5, 0.005] },
];
// folder -> its color in cfg
const COLORS: Record<string, { get: () => string; set: (hex: string) => void }> = {
  squares: { get: () => cfg.gridColor, set: (h) => (cfg.gridColor = h) },
  hover: { get: () => cfg.gridHotColor, set: (h) => (cfg.gridHotColor = h) },
  drifting: { get: () => cfg.gridAutoColor, set: (h) => (cfg.gridAutoColor = h) },
};

function panelConfig() {
  const out: Values = {};
  const c = cfg as unknown as Values;
  for (const [folder, col] of Object.entries(COLORS)) {
    out[folder] = { color: { type: "color", default: col.get() } };
  }
  for (const ctl of CTLS) {
    const f = (out[ctl.folder] ??= {});
    const v = c[ctl.key];
    if ("slider" in ctl) f[ctl.label] = [v, ...ctl.slider];
    else f[ctl.label] = { type: "select" as const, options: ctl.options.map(([value, label]) => ({ value, label })), default: v };
  }
  out.copy = { type: "action", label: "Copy values" };
  out.save = { type: "action", label: `Save preset "${name}"` };
  return out;
}

const REBUILD = new Set<keyof GraphViewConfig>(["gridPitch", "gridDot", "opacityMin", "opacityMax"]);
const round = (v: unknown) => (typeof v === "number" ? +v.toFixed(4) : v);

function apply(values: Values) {
  const c = cfg as unknown as Values;
  let rebuild = false;
  for (const ctl of CTLS) {
    const v = round(values[ctl.folder]?.[ctl.label]);
    if (v === undefined || c[ctl.key] === v) continue;
    // read at mount: squares are sized in device px, node brightness is
    // baked per node
    if (REBUILD.has(ctl.key)) rebuild = true;
    c[ctl.key] = v;
  }
  for (const [folder, col] of Object.entries(COLORS)) {
    const hex = values[folder]?.color;
    if (typeof hex === "string") col.set(hex.toLowerCase());
  }
  paintPalettes();
  if (rebuild) remount(host, spec(), { editor: true, root: component });
}

// --- palettes: the Figma scales under each folder's color picker ---

// DialKit's folders, by key ("hover"): matched on their titles
function folderEl(key: string): HTMLElement | null {
  for (const t of document.querySelectorAll<HTMLElement>(".dialkit-folder-title")) {
    if (t.textContent?.replace(/\s/g, "").toLowerCase() === key) return t.closest(".dialkit-folder");
  }
  return null;
}

function paletteHtml(key: string) {
  const steps = FIGMA_SCALES[0].steps.map(([st]) => `<b>${st}</b>`).join("");
  const rows = FIGMA_SCALES.map(
    (sc) =>
      `<span>${sc.name}</span>${sc.steps
        .map(([step, hex]) => `<button data-folder="${key}" data-hex="${hex}" title="${sc.name}/${step} ${hex}" style="background:${hex}"></button>`)
        .join("")}`,
  ).join("");
  return `<div class="tune-name"></div><div class="tune-grid"><span></span>${steps}${rows}</div>`;
}

// add the palettes DialKit doesn't have yet (folders mount lazily), and
// mark each folder's current color
function paintPalettes() {
  for (const [key, col] of Object.entries(COLORS)) {
    const control = folderEl(key)?.querySelector<HTMLElement>(".dialkit-color-control");
    if (!control) continue;
    let pal = control.nextElementSibling as HTMLElement | null;
    if (!pal?.classList.contains("tune-palette")) {
      pal = document.createElement("div");
      pal.className = "tune-palette";
      pal.innerHTML = paletteHtml(key);
      control.after(pal);
    }
    const hex = col.get().toLowerCase();
    const name = colorName(hex);
    // only touch the DOM on a change: the observer below watches it
    const caption = pal.querySelector<HTMLElement>(".tune-name")!;
    const html = `<strong>${name ?? "custom"}</strong> ${hex}`;
    if (caption.innerHTML !== html) caption.innerHTML = html;
    for (const b of pal.querySelectorAll<HTMLElement>("button")) b.classList.toggle("on", b.dataset.hex === hex);
  }
}

document.addEventListener("click", (e) => {
  const b = (e.target as Element).closest<HTMLElement>(".tune-palette button");
  if (b) kit.setValue(`${b.dataset.folder}.color`, b.dataset.hex!);
});

const css = document.createElement("style");
css.textContent = `
.tune-palette { padding: 2px 0 8px; font: 11px/1.3 system-ui, sans-serif; color: #9a9aa0; }
.tune-name { margin: 0 0 6px 2px; font-family: ui-monospace, monospace; }
.tune-name strong { color: #e8e8ea; font-weight: 600; margin-right: 4px; }
.tune-grid { display: grid; grid-template-columns: 40px repeat(11, 1fr); gap: 2px; align-items: center; }
.tune-grid b { font-weight: 400; font-size: 8px; color: #6e6e74; text-align: center; }
.tune-grid > span { font-size: 10px; }
.tune-grid button { aspect-ratio: 1; padding: 0; border: 0; border-radius: 3px; cursor: pointer; box-shadow: inset 0 0 0 1px #ffffff1f; }
.tune-grid button:hover { transform: scale(1.2); position: relative; z-index: 1; }
.tune-grid button.on { box-shadow: 0 0 0 2px #fff; position: relative; z-index: 1; }
`;
document.head.append(css);

// every setting the page has a dial for (sliders and colors)
function panelValues() {
  const c = cfg as unknown as Values;
  const keys = new Set<string>(CTLS.map((ctl) => ctl.key));
  for (const k of ["gridColor", "gridHotColor", "gridAutoColor"]) keys.add(k);
  const out: Values = {};
  for (const k of keys) out[k] = c[k];
  return out;
}

async function onAction(action: string) {
  if (action === "copy") {
    await navigator.clipboard.writeText(JSON.stringify(panelValues(), null, 2));
    toast("Copied every value on this page");
  } else if (action === "save") {
    const config = diffConfig(cfg, graphDefaults);
    const body = { name, preset: { type: "graph", config, ...(preset.breakpoints && { breakpoints: preset.breakpoints }) } };
    const res = await fetch("/__presets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    toast(res.ok ? `Saved "${name}" → presets.json` : `Save failed (${res.status})`);
  }
}

createDialRoot({ mode: "popover", position: "top-right", defaultOpen: true, theme: "dark" });
const kit = createDialKit(`Grid · ${name}`, panelConfig() as any, { id: `tune-${name}`, onAction });
kit.subscribe((v) => apply(v as Values), false);
// folders mount and re-render on expand: keep the palettes in place
new MutationObserver(() => paintPalettes()).observe(document.body, { childList: true, subtree: true });
paintPalettes();

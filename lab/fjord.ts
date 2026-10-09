// Fjord lab: the `fjord` preset (the staged spatial map) on its own canvas
// with DialKit dials, to tune the story outside the section. It runs the
// runtime's own MapScene (with its signals layer) and MapOverlay, starting
// from presets.json, so what's tuned here is what ships: copy the values
// into the preset when they're right.
// Not part of the build; run `npx vite --config vite.lab.config.ts --port
// 4793 --host` and open /lab/fjord.html. Dial values persist in
// localStorage and are mirrored to lab/state.json on every change; "Copy
// JSON" puts them on the clipboard.
import { ACESFilmicToneMapping, Scene, WebGLRenderer } from "three";
import { createDialKit, createDialRoot, type DialConfig } from "dialkit/vanilla";
import "dialkit/vanilla/styles.css";
import { MapOverlay, MapScene } from "../src/runtime/map-scene";
import { mapDefaults, type MapConfig } from "../src/runtime/defaults";
import { PRESETS } from "../src/runtime/presets";
import { FIGMA_SCALES } from "../src/sections/figma-colors";
import { mountSwatches, type Slot } from "./swatches";

// the shipped preset is the starting point
const base = { ...mapDefaults, ...PRESETS.fjord.config } as MapConfig;

// colour controls: a dropdown of the Figma colour variables by name
// ("Mist/500"); a default that isn't one of them is listed as "Map now"
const FIGMA = FIGMA_SCALES.flatMap((sc) => sc.steps.map(([step, hex]) => ({ value: hex, label: `${sc.name}/${step}  ${hex}` })));
const color = (hex: string) => {
  const h = hex.toLowerCase();
  const options = FIGMA.some((o) => o.value === h) ? FIGMA : [{ value: h, label: `Map now  ${h}` }, ...FIGMA];
  return { type: "select" as const, options, default: h };
};
const text = (s: string) => ({ type: "text" as const, default: s });

// ?reset: forget the saved dials and start from the defaults in this file
if (new URLSearchParams(location.search).has("reset")) {
  for (const k of Object.keys(localStorage)) if (k.startsWith("dialkit:") || k.startsWith("lab:")) localStorage.removeItem(k);
  history.replaceState(null, "", location.pathname);
}

createDialRoot({ position: "top-right" });

// A default changed (here or in presets.json) shows up on a normal refresh:
// the saved value of that one dial is replaced, while dials whose defaults
// didn't change keep what was tuned. (Each panel's defaults are remembered
// in localStorage to tell what changed.)
type Cfg = Record<string, unknown>;
function defaultsOf(cfg: Cfg, prefix = "", out: Cfg = {}): Cfg {
  for (const [k, v] of Object.entries(cfg)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (Array.isArray(v)) out[path] = v[0];
    else if (v && typeof v === "object") {
      const o = v as Cfg;
      if (o.type === "action") continue;
      if ("type" in o) out[path] = o.default;
      else defaultsOf(o, path, out);
    } else out[path] = v;
  }
  return out;
}
function panel<T extends DialConfig>(name: string, cfg: T, opts?: Parameters<typeof createDialKit>[2]) {
  const kit = createDialKit(name, cfg, opts);
  const now = defaultsOf(cfg as Cfg);
  const key = `lab:defaults:${name}`;
  let before: Cfg | null = null;
  try {
    before = JSON.parse(localStorage.getItem(key) || "null");
  } catch {}
  if (before) {
    const updates: Cfg = {};
    for (const [path, v] of Object.entries(now)) {
      if (!(path in before) || JSON.stringify(before[path]) === JSON.stringify(v)) continue;
      const parts = path.split(".");
      let o = updates;
      for (const p of parts.slice(0, -1)) o = (o[p] ??= {}) as Cfg;
      o[parts[parts.length - 1]] = v;
    }
    if (Object.keys(updates).length) kit.setValues(updates as never);
  }
  try {
    localStorage.setItem(key, JSON.stringify(now));
  } catch {}
  return kit;
}

const STEPS = ["1 Own", "2 Refine", "3 Deliver"];
const view = panel(
  "View",
  {
    frame: { type: "select", options: ["desktop panel", "tablet", "phone", "full window"], default: "desktop panel" },
    step: { type: "select", options: STEPS, default: STEPS[0] },
    autoplay: false,
    copy: { type: "action", label: "Copy JSON" },
  },
  { persist: true, onAction: () => copyJson() },
);

const b = base;
const mapKit = panel(
  "Map",
  {
    // the story's pace: tempo, scan, camera flights, the floor's sweep
    build: {
      tempo: [b.tempo, 0.5, 2.5, 0.05],
      buildSpeed: [b.buildSpeed, 0.5, 14, 0.1],
      smoothTime: [b.smoothTime, 0.2, 3, 0.05],
      sweepTime: [b.sweepTime, 0.2, 3, 0.05],
      reliefOrderHeight: [b.reliefOrderHeight, 0.1, 3, 0.05],
      reliefSettleSwell: [b.reliefSettleSwell, 0, 1, 0.01],
      sweepColor: color(b.sweepColor),
      alertColor: color(b.alertColor),
    },
    // the floor's needles
    floor: {
      reliefOpacity: [b.reliefOpacity, 0, 1, 0.01],
      reliefDriftSpeed: [b.reliefDriftSpeed, 0, 4, 0.05],
      reliefDriftScale: [b.reliefDriftScale, 0.03, 1, 0.01],
      reliefTwinkle: [b.reliefTwinkle, 0, 1, 0.01],
      reliefNeedleGrid: [b.reliefNeedleGrid, 8, 100, 1],
      reliefPale: color(b.reliefPale),
      reliefDeep: color(b.reliefDeep),
      frameColor: color(b.frameColor),
    },
    // the story's UI copy (HTML over the map)
    copy: {
      storyLevels: text(b.storyLevels),
      tileLabels: text(b.tileLabels),
      alertTag: text(b.alertTag),
      alertTitle: text(b.alertTitle),
      alertText: text(b.alertText),
      routeTitle: text(b.routeTitle),
      routeText: text(b.routeText),
      actor1: text(b.actor1),
      actor1Text: text(b.actor1Text),
      actor2: text(b.actor2),
      actor2Text: text(b.actor2Text),
      closingLabel: text(b.closingLabel),
      closingValue: text(b.closingValue),
    },
  },
  { persist: true },
);

// --- the colour panel (left): where each colour is used ---
const slot = (section: string, label: string, folder: string, key: string): Slot => ({ section, label, kit: mapKit as unknown as Slot["kit"], folder, key });
mountSwatches(
  [
    slot("Story", "Anomaly, pink cluster, ring", "build", "alertColor"),
    slot("Story", "Sweep line", "build", "sweepColor"),
    slot("Floor", "Needles, base", "floor", "reliefPale"),
    slot("Floor", "Needles, tips", "floor", "reliefDeep"),
    slot("Structure", "Level grids", "floor", "frameColor"),
  ],
  [b.reliefPale, b.reliefDeep, b.frameColor],
);

// --- dials -> config ---
const flat = (o: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.values(o).flatMap((g) => Object.entries(g as object)));
const mapCfg = () => ({ ...base, ...flat(mapKit.values) }) as MapConfig;

// mirror the dials to lab/state.json (the lab dev server), so they can be
// read back outside the browser
let saveTimer = 0;
function saveState() {
  // not from a test browser (it would overwrite what's on your screen)
  if (navigator.webdriver || location.search.includes("nosave")) return;
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    const body = JSON.stringify({ view: view.values, map: flat(mapKit.values) });
    fetch("/__lab/state", { method: "POST", body }).catch(() => {});
  }, 300);
}
for (const k of [view, mapKit]) k.subscribe(saveState);

function copyJson() {
  const json = JSON.stringify(flat(mapKit.values), null, 2);
  navigator.clipboard?.writeText(json).catch(() => {});
  console.log(json);
}

// --- renderer ---
const frame = document.getElementById("frame")!;
const hud = document.getElementById("hud")!;
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.toneMapping = ACESFilmicToneMapping;
renderer.setClearColor("#080a0c");
frame.appendChild(renderer.domElement);
const scene = new Scene();

let map: MapScene | null = null;
let overlay: MapOverlay | null = null;
let w = 1;
let h = 1;

const stepIndex = () => STEPS.indexOf(view.values.step as string);

function layout() {
  const kind = view.values.frame;
  frame.classList.toggle("full", kind === "full window");
  if (kind === "tablet") {
    // 768-991: the section's mobile layout with a 16:10 map (~720 wide)
    const tw = Math.min(720, innerWidth - 32);
    frame.style.width = `${tw}px`;
    frame.style.height = `${Math.round(tw / 1.6)}px`;
  } else if (kind === "phone") {
    const s = Math.min(361, innerWidth - 32);
    frame.style.width = frame.style.height = `${s}px`;
  } else if (kind === "desktop panel") {
    const st = document.getElementById("stage")!.getBoundingClientRect();
    const k = Math.min(1, (st.width - 32) / 894, (st.height - 32 - 56) / 552);
    frame.style.width = `${894 * k}px`;
    frame.style.height = `${552 * k}px`;
  }
  const r = frame.getBoundingClientRect();
  w = Math.max(1, Math.round(r.width));
  h = Math.max(1, Math.round(r.height));
  renderer.setSize(w, h, false);
  if (map) {
    map.setAspect(w / h);
    map.setResolution(w, h);
    map.setPointScale(h * renderer.getPixelRatio());
  }
}

// a new map (and its UI) for the current dials; the tab carries over
function buildMap() {
  const step = map ? map.step : Math.max(0, stepIndex());
  if (map) {
    scene.remove(map.root);
    map.dispose();
    overlay?.dispose();
  }
  const cfg = mapCfg();
  map = new MapScene(cfg);
  overlay = new MapOverlay(frame, cfg);
  scene.add(map.root);
  layout();
  map.setStep(step, true);
  (window as unknown as { lab: unknown }).lab = { map, overlay, view, mapKit, renderer };
}

let mapTimer = 0;
const fonts = Promise.race([
  Promise.all([mapDefaults.fontSans, mapDefaults.fontMono].map((f) => document.fonts.load(`400 64px ${f}`).catch(() => []))),
  new Promise((r) => setTimeout(r, 2000)),
]);
fonts.then(() => {
  buildMap();
  mapKit.subscribe(() => {
    clearTimeout(mapTimer);
    mapTimer = window.setTimeout(buildMap, 150);
  }, false);
  let lastStep = view.values.step;
  let lastFrame = view.values.frame;
  view.subscribe((v) => {
    if (v.frame !== lastFrame) {
      lastFrame = v.frame;
      layout();
    }
    if (v.step !== lastStep) {
      lastStep = v.step;
      map?.setStep(stepIndex());
      playClock = 0;
    }
  }, false);
  requestAnimationFrame(loop);
});
addEventListener("resize", layout);

// --- view tabs under the canvas (the section's three tabs); a re-click on
// the open tab does nothing, as in the section ---
const tabs = [...document.querySelectorAll<HTMLButtonElement>("#tabs button")];
const markTab = () => tabs.forEach((b, i) => b.classList.toggle("on", i === stepIndex()));
tabs.forEach((b, i) => b.addEventListener("click", () => stepIndex() !== i && view.setValues({ step: STEPS[i] })));
view.subscribe(markTab);

// --- loop ---
let last = performance.now();
let playClock = 0;
let fps = 60;
function loop(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;
  if (map) {
    if (view.values.autoplay) {
      playClock += dt;
      if (playClock > 7) {
        playClock = 0;
        view.setValues({ step: STEPS[(map.step + 1) % 3] });
      }
    }
    map.update(dt);
    renderer.render(scene, map.camera);
    overlay?.update(map, w, h, now / 1000);
  }
  hud.textContent = `${w}×${h} · ${Math.round(fps)} fps`;
  requestAnimationFrame(loop);
}

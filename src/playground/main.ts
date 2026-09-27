// Playground: design each site section's particle look and save it as a
// named preset. Preview renders through the production engine itself, so
// what you tune here is exactly what the Webflow site draws.
import { createDialKit, createDialRoot, type DialKitController } from "dialkit/vanilla";
import "dialkit/vanilla/styles.css";
import { graphDefaults, pointsDefaults, type GraphViewConfig, type PointsConfig } from "../runtime/defaults";
import { getView, mount, refreshLook, remount } from "../runtime/engine";
import type { Preset } from "../runtime/presets";
import type { ViewSpec } from "../runtime/spec";
import { applyValues, buildDialConfig, cfgToValues, diffConfig, graphFields, pointsFields, type Field } from "./fields";
import { buildGraphSvg, buildPointsSvg, downloadBlob, exportPngSequence, exportVideo } from "./exports";

type Type = "points" | "graph";
type AnyConfig = PointsConfig | GraphViewConfig;
type Values = Record<string, unknown>;

const NEW = "(new)";
const stage = document.getElementById("stage")!;
const toastEl = document.getElementById("toast")!;

const defaultsFor = (t: Type): AnyConfig => ({ ...(t === "graph" ? graphDefaults : pointsDefaults) });
const fieldsFor = (t: Type): Field[] => (t === "graph" ? graphFields : pointsFields);

let type: Type = "points";
let cfg: AnyConfig = defaultsFor(type);
let presets: Record<string, Preset> = {};
let presetsWritable = true;
let paramKit: DialKitController<any> | null = null;
// set while code (not the user) pushes values into a panel, so the
// resulting subscribe callbacks don't echo back
let syncing = false;

function toast(msg: string) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout((toast as any).t);
  (toast as any).t = setTimeout(() => toastEl.classList.remove("show"), 2200);
}

const spec = (): ViewSpec => ({ type, config: cfg }) as ViewSpec;
const rebuild = () => remount(stage, spec(), { editor: true });

// --- presets (src/runtime/presets.json via the dev server) ---

async function loadPresets() {
  try {
    const res = await fetch("/__presets");
    if (!res.ok) throw new Error(String(res.status));
    presets = await res.json();
  } catch {
    // static build (e.g. a shared preview link): no file access
    presetsWritable = false;
    presets = (await import("../runtime/presets.json")).default as Record<string, Preset>;
  }
}

async function writePreset(body: { name: string; preset?: Preset; delete?: true }) {
  const res = await fetch("/__presets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  presets = data;
}

// --- section panel: which preset / type / preview frame ---

const FRAMES = [
  { value: "full", label: "Full window" },
  { value: "section", label: "Section 16:9" },
  { value: "card", label: "Card (square)" },
  { value: "mobile", label: "Mobile 390×844" },
];

function sectionConfig() {
  return {
    // explicit labels: DialKit title-cases bare strings, but names must read
    // exactly as typed into Webflow's data-preset
    preset: {
      type: "select" as const,
      options: [NEW, ...Object.keys(presets)].map((n) => ({ value: n, label: n })),
      default: NEW,
    },
    name: { type: "text" as const, default: "", placeholder: "e.g. hero, services" },
    type: {
      type: "select" as const,
      options: [
        { value: "points", label: "Particle shape" },
        { value: "graph", label: "Node graph" },
      ],
      default: "points",
    },
    frame: { type: "select" as const, options: FRAMES, default: "full" },
    sectionColor: { type: "color" as const, default: "#0b0b0c" },
    save: { type: "action" as const, label: "Save preset" },
    remove: { type: "action" as const, label: "Delete preset" },
    copy: { type: "action" as const, label: "Copy Webflow attributes" },
    reset: { type: "action" as const, label: "Reset to defaults" },
  };
}

let sectionKit: DialKitController<ReturnType<typeof sectionConfig>>;
let lastSection: Values = {};

function onSectionChange(v: Values) {
  if (syncing) return;
  const prev = lastSection;
  lastSection = { ...v };
  stage.dataset.frame = v.frame as string;
  document.body.style.setProperty("--section-color", v.sectionColor as string);
  if (v.preset !== prev.preset && v.preset !== NEW) loadPreset(v.preset as string);
  else if (v.type !== prev.type && prev.type !== undefined) setType(v.type as Type, defaultsFor(v.type as Type));
}

function setSection(values: Values) {
  syncing = true;
  sectionKit.setValues(values);
  lastSection = { ...sectionKit.getValues() };
  syncing = false;
}

async function onSectionAction(action: string) {
  const name = String(sectionKit.getValues().name || "").trim();
  if (action === "copy") {
    const diff = diffConfig(cfg, defaultsFor(type));
    const attrs = `${type === "graph" ? 'data-particles="graph"' : "data-particles"} data-config='${JSON.stringify(diff)}'`;
    await navigator.clipboard.writeText(name && presets[name] ? `data-particles data-preset="${name}"` : attrs);
    toast(name && presets[name] ? `Copied data-preset="${name}"` : "Copied data-config attributes");
  } else if (action === "reset") {
    setType(type, defaultsFor(type));
    toast("Reset to defaults");
  } else if (action === "save" || action === "remove") {
    if (!presetsWritable) return toast("Saving presets needs the dev server (npm run dev)");
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) return toast("Name: lowercase letters, digits, dashes (e.g. hero)");
    try {
      if (action === "save") {
        await writePreset({ name, preset: { type, config: diffConfig(cfg, defaultsFor(type)) } as Preset });
        toast(`Saved preset "${name}" → presets.json`);
      } else {
        if (!presets[name]) return toast(`No preset "${name}"`);
        if (!confirm(`Delete preset "${name}"? Sections using data-preset="${name}" will fall back to defaults.`)) return;
        await writePreset({ name, delete: true });
        toast(`Deleted preset "${name}"`);
      }
      sectionKit.updateConfig(sectionConfig());
      setSection({ preset: action === "save" ? name : NEW });
    } catch (err) {
      toast(String((err as Error).message ?? err));
    }
  }
}

// --- parameter panel (rebuilt when switching points <-> graph) ---

function buildParamKit() {
  paramKit?.destroy();
  const fields = fieldsFor(type);
  const actions: Record<string, string> =
    type === "points" ? { scatter: "Scatter", assemble: "Assemble", reroll: "Reroll seed" } : { reroll: "Reroll seed" };
  paramKit = createDialKit(type === "points" ? "Particles" : "Graph", buildDialConfig(fields, cfg, actions), {
    id: `params-${type}`,
    onAction: (a) => {
      if (a === "scatter") paramKit!.setValue("motion.chaos", 1);
      if (a === "assemble") paramKit!.setValue("motion.chaos", 0);
      if (a === "reroll") {
        cfg.seed = Math.floor(Math.random() * 1e9);
        rebuild();
      }
    },
  });
  // panels list in creation order: keep Export below the parameters
  buildExportKit();
  paramKit.subscribe((values) => {
    if (syncing) return;
    const change = applyValues(fields, values as Values, cfg);
    if (change === "rebuild") rebuild();
    else if (change === "look") refreshLook(stage);
  }, false);
}

// Swap in a whole config (type switch, preset load, reset).
function setType(t: Type, next: AnyConfig) {
  const typeChanged = t !== type || !paramKit;
  type = t;
  cfg = next;
  if (typeChanged) buildParamKit();
  syncing = true;
  paramKit!.setValues(cfgToValues(fieldsFor(type), cfg));
  syncing = false;
  rebuild();
}

function loadPreset(name: string) {
  const p = presets[name];
  if (!p) return;
  setType(p.type, { ...defaultsFor(p.type), ...p.config } as AnyConfig);
  setSection({ name, type: p.type });
  toast(`Loaded preset "${name}"`);
}

// --- export panel ---

let exportKit: { destroy(): void } | null = null;

function buildExportKit() {
  exportKit?.destroy();
  const kit = createDialKit(
    "Export",
    {
      fps: [30, 12, 60, 1],
      pngSeconds: [4, 1, 20, 1],
      videoSeconds: [6, 1, 30, 1],
      png: { type: "action", label: "PNG sequence (zip)" },
      video: { type: "action", label: "Video (webm)" },
      svg: { type: "action", label: "SVG (current frame)" },
      copySvg: { type: "action", label: "Copy SVG" },
    },
    {
      id: "export",
      defaultCollapsed: true,
      onAction: async (a) => {
        const view = getView(stage);
        if (!view) return;
        const v = kit.getValues();
        if (a === "png") {
          toast("Rendering frames…");
          await exportPngSequence(view, v.fps, v.pngSeconds);
        } else if (a === "video") {
          toast(`Recording ${v.videoSeconds}s…`);
          await exportVideo(view, v.videoSeconds);
        } else {
          const svg = type === "graph" ? buildGraphSvg(view, cfg as GraphViewConfig) : buildPointsSvg(view, cfg as PointsConfig);
          if (a === "svg") downloadBlob(new Blob([svg], { type: "image/svg+xml" }), `particles-${Date.now()}.svg`);
          else await navigator.clipboard.writeText(svg).then(() => toast("SVG copied"));
        }
      },
    },
  );
  exportKit = kit;
}

// --- boot ---

await loadPresets();
const root = createDialRoot({ position: "top-right", theme: "dark" });
// clicks on the panel must not trigger the effect's click burst
root.element.setAttribute("data-particles-ignore", "");

sectionKit = createDialKit("Section", sectionConfig(), { id: "section", onAction: onSectionAction });
buildParamKit();
mount(stage, spec(), { editor: true });
sectionKit.subscribe((v) => onSectionChange(v as Values));

import { defaultConfig, SHAPE_NAMES, type ParticleConfig } from "../core/config";
import { defaultGraphConfig, GRAPH_MODES, type GraphConfig } from "../core/graph";
import { PRESETS } from "./presets";

// Runtime-only options layered on top of the playground configs.
export interface RuntimeOptions {
  // particle count used on small screens; 0 = auto (half of `count`)
  countMobile: number;
  // "additive" = the playground's glowing "lighter" look, "normal" = plain
  // alpha blending (needed on light backgrounds, where additive washes out)
  blend: "additive" | "normal";
  // hover/click reactions on or off
  interactive: boolean;
}

export type PointsSpec = { type: "points"; config: ParticleConfig & RuntimeOptions };
export type GraphSpec = { type: "graph"; config: GraphConfig & RuntimeOptions };
export type ViewSpec = PointsSpec | GraphSpec;

const runtimeDefaults: RuntimeOptions = { countMobile: 0, blend: "additive", interactive: true };

// On the site the section's own Webflow background shows through by
// default; the playground's black backdrop is opt-in via data-background.
// The playground starts as a frozen scatter (chaos 1, ease 0) waiting for a
// shape button; on the site data-shape alone should show the shape forming.
const pointsDefaults = { ...defaultConfig, ...runtimeDefaults, background: "transparent", chaos: 0, ease: 0.06 };
const graphDefaults = { ...defaultGraphConfig, ...runtimeDefaults, blend: "normal" as const, background: "transparent" };

// Reserved dataset keys that aren't config fields.
const RESERVED = new Set(["particles", "preset", "config"]);

function warn(el: Element, msg: string) {
  console.warn(`[particles] ${msg}`, el);
}

// Coerce an attribute string to the type of the default value it overrides.
function coerce(raw: string, like: unknown): unknown {
  if (typeof like === "number") {
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : undefined;
  }
  if (typeof like === "boolean") return raw === "" || raw === "true" || raw === "1";
  return raw;
}

// Resolution order (later wins):
//   type defaults -> data-preset -> data-config (JSON) -> individual data-* attributes
// Individual attributes map 1:1 onto config keys via dataset camelCasing,
// e.g. data-size-min -> sizeMin, data-hover-radius -> hoverRadius.
export function parseSpec(el: HTMLElement): ViewSpec {
  const ds = el.dataset;
  const preset = ds.preset ? PRESETS[ds.preset] : undefined;
  if (ds.preset && !preset) warn(el, `unknown preset "${ds.preset}"`);

  const type = ds.particles === "graph" || (!ds.particles && preset?.type === "graph") ? "graph" : "points";
  const cfg: Record<string, unknown> = { ...(type === "graph" ? graphDefaults : pointsDefaults) };

  if (preset) {
    if (preset.type !== type) warn(el, `preset "${ds.preset}" is a ${preset.type} preset`);
    else Object.assign(cfg, preset.config);
  }

  if (ds.config) {
    try {
      Object.assign(cfg, JSON.parse(ds.config));
    } catch {
      warn(el, "data-config is not valid JSON");
    }
  }

  for (const [key, raw] of Object.entries(ds)) {
    if (RESERVED.has(key) || raw === undefined) continue;
    if (!(key in cfg)) {
      // Webflow stamps its own data-w-id / data-wf-* on elements
      if (/^w[A-Zf]/.test(key)) continue;
      warn(el, `unknown attribute data-${key.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())}`);
      continue;
    }
    const v = coerce(raw, cfg[key]);
    if (v !== undefined) cfg[key] = v;
  }

  if (type === "points" && !(SHAPE_NAMES as readonly string[]).includes(cfg.shape as string)) {
    warn(el, `unknown shape "${cfg.shape}"`);
    cfg.shape = defaultConfig.shape;
  }
  if (type === "graph" && !(GRAPH_MODES as readonly string[]).includes(cfg.mode as string)) {
    warn(el, `unknown mode "${cfg.mode}"`);
    cfg.mode = defaultGraphConfig.mode;
  }

  return { type, config: cfg } as unknown as ViewSpec;
}

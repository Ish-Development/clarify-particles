import { defaultConfig, SHAPE_NAMES } from "../core/config";
import { defaultGraphConfig, GRAPH_MODES } from "../core/graphConfig";
import { graphDefaults, mapDefaults, pointsDefaults, type GraphViewConfig, type MapViewConfig, type PointsConfig } from "./defaults";
import { maxWidthQuery, PRESETS } from "./presets";

export type PointsSpec = { type: "points"; config: PointsConfig };
export type GraphSpec = { type: "graph"; config: GraphViewConfig };
export type MapSpec = { type: "map"; config: MapViewConfig };
export type ViewSpec = PointsSpec | GraphSpec | MapSpec;

// Reserved dataset keys that aren't config fields.
const RESERVED = new Set([
  "particles",
  "preset",
  "config",
  "particlesComponent",
  "particlesWrap",
  "howComponent",
  "howWrap",
  "fjordComponent",
  "fjordWrap",
  "fjordTab",
  "fjordPanel",
  "fjordActive",
  "particlesHost",
  "particlesExcite",
  "particlesIgnore",
]);

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
// `sources`: elements whose data-* attributes configure the effect, later
// ones winning — [component, wrap] in component markup, or the single
// [data-particles] element.
export function parseSpec(sources: HTMLElement | HTMLElement[]): ViewSpec {
  const list = Array.isArray(sources) ? sources : [sources];
  const el = list[list.length - 1];
  const ds: Record<string, string | undefined> = Object.assign({}, ...list.map((s) => ({ ...s.dataset })));
  const preset = ds.preset ? PRESETS[ds.preset] : undefined;
  if (ds.preset && !preset) warn(el, `unknown preset "${ds.preset}"`);

  const own = Object.keys(ds).filter((k) => !RESERVED.has(k) && !/^w[A-Zf]/.test(k));
  if (!ds.preset && !ds.config && own.length === 0) {
    warn(el, `no data-preset — showing the default look. Available presets: ${Object.keys(PRESETS).join(", ")}`);
  }

  const typeAttr = ds.particles || ds.particlesComponent || ds.howComponent || ds.fjordComponent;
  const type = typeAttr === "graph" || typeAttr === "map" ? typeAttr : !typeAttr && preset ? preset.type : "points";
  const cfg: Record<string, unknown> = { ...(type === "graph" ? graphDefaults : type === "map" ? mapDefaults : pointsDefaults) };

  if (preset) {
    if (preset.type !== type) warn(el, `preset "${ds.preset}" is a ${preset.type} preset`);
    else {
      Object.assign(cfg, preset.config);
      const tiers = [...(preset.breakpoints ?? [])].sort((a, b) => b.maxWidth - a.maxWidth);
      for (const t of tiers) if (matchMedia(maxWidthQuery(t.maxWidth)).matches) Object.assign(cfg, t.config);
    }
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

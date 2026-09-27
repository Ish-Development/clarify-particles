import type { DialConfig } from "dialkit/vanilla";
import type { ShapeName } from "../core/config";
import type { GraphMode } from "../core/graph";
import type { GraphViewConfig, PointsConfig } from "../runtime/defaults";

// How a change to a field reaches the running effect:
//   live    — the simulation reads cfg every frame; nothing to do
//   look    — colors/background/blend: re-upload without resetting motion
//   rebuild — particle buffers depend on it: remount the view
type Kind = "live" | "look" | "rebuild";

type Control =
  | [number, number, number, number?]
  | boolean
  | { type: "select"; options: { value: string; label: string }[] }
  | { type: "color" }
  | { type: "text"; placeholder?: string };

export interface Field {
  key: string;
  folder?: string;
  control: Control;
  kind: Kind;
}

const select = (options: (string | [string, string])[]): Control => ({
  type: "select",
  options: options.map((o) => (typeof o === "string" ? { value: o, label: o } : { value: o[0], label: o[1] })),
});
const color: Control = { type: "color" };

const SHAPES: [ShapeName, string][] = [
  ["concentricRings", "Flat · Circle"],
  ["square", "Flat · Square"],
  ["triangle", "Flat · Triangle"],
  ["noiseLines", "Flat · Lines (wavy)"],
  ["straightLines", "Flat · Lines (straight)"],
  ["chaosField", "Field · Grid"],
  ["terrain", "Field · Terrain"],
  ["waterfall", "Field · Waterfall"],
  ["nebula", "Field · Nebula"],
  ["veins", "Field · Veins"],
  ["sphere", "3D · Sphere"],
  ["cube", "3D · Cube"],
  ["torus", "3D · Torus"],
  ["torusKnot", "3D · Torus knot"],
  ["hexCone", "3D · Hex cone"],
  ["octahedron", "3D · Octahedron"],
  ["icosahedron", "3D · Icosahedron"],
  ["dodecahedron", "3D · Dodecahedron"],
  ["stellated", "3D · Star"],
  ["gem", "3D · Gem"],
  ["cubesIntersect", "3D · Intersecting cubes"],
  ["crossCubes", "3D · Cross cubes"],
  ["interlock", "3D · Interlock"],
  ["sacredGeometry", "Pattern · Sacred geometry"],
];

const MODES: [GraphMode, string][] = [
  ["sequence", "Sequence (loop)"],
  ["hubBurst", "Hub burst"],
  ["geoSphere", "Geo sphere"],
  ["burstSphereMorph", "Burst ↔ Sphere"],
  ["coneTorusMorph", "Cone ↔ Torus"],
];

const shared: Field[] = [
  { folder: "look", key: "blend", control: select(["additive", "normal"]), kind: "look" },
  { folder: "look", key: "softness", control: [1, 0, 1, 0.01], kind: "look" },
  { folder: "look", key: "solid", control: false, kind: "look" },
  { folder: "canvas", key: "canvasInset", control: { type: "text", placeholder: "0 0 0 50%" }, kind: "rebuild" },
  { folder: "canvas", key: "edgeFade", control: [0, 0, 300, 1], kind: "rebuild" },
  { folder: "look", key: "paintBackground", control: false, kind: "look" },
  { folder: "look", key: "backgroundColor", control: color, kind: "look" },
  { folder: "interaction", key: "interactive", control: true, kind: "live" },
  { folder: "interaction", key: "hoverRadius", control: [120, 20, 400, 1], kind: "live" },
  { folder: "interaction", key: "hoverStrength", control: [1.2, 0, 5, 0.1], kind: "live" },
  { folder: "interaction", key: "clickBehavior", control: select(["burst", "reshuffle", "ripple", "none"]), kind: "live" },
];

export const pointsFields: Field[] = [
  { key: "shape", control: select(SHAPES), kind: "live" },
  { folder: "motion", key: "chaos", control: [0, 0, 1, 0.01], kind: "live" },
  { folder: "motion", key: "ease", control: [0.06, 0, 0.3, 0.005], kind: "live" },
  { folder: "motion", key: "speed", control: [0, 0, 2, 0.01], kind: "live" },
  { folder: "motion", key: "idleMotion", control: true, kind: "live" },
  { folder: "rotation", key: "autoRotate", control: true, kind: "live" },
  { folder: "rotation", key: "rotX", control: [0, -180, 180, 1], kind: "live" },
  { folder: "rotation", key: "rotY", control: [0, -180, 180, 1], kind: "live" },
  { folder: "rotation", key: "rotZ", control: [0, -180, 180, 1], kind: "live" },
  { folder: "rotation", key: "innerCopies", control: [1, 1, 6, 1], kind: "live" },
  { folder: "particles", key: "count", control: [6000, 200, 12000, 100], kind: "rebuild" },
  // site only — the playground always renders the desktop count
  { folder: "particles", key: "countMobile", control: [0, 0, 12000, 100], kind: "live" },
  { folder: "particles", key: "sizeMin", control: [1, 0.5, 10, 0.1], kind: "rebuild" },
  { folder: "particles", key: "sizeMax", control: [2.5, 0.5, 20, 0.1], kind: "rebuild" },
  { folder: "particles", key: "opacityMin", control: [0.15, 0, 1, 0.01], kind: "rebuild" },
  { folder: "particles", key: "opacityMax", control: [1, 0, 1, 0.01], kind: "rebuild" },
  { folder: "look", key: "colorMode", control: select(["single", "gradient", "hueRange"]), kind: "look" },
  { folder: "look", key: "color1", control: color, kind: "look" },
  { folder: "look", key: "color2", control: color, kind: "look" },
  { folder: "look", key: "hueMin", control: [180, 0, 360, 1], kind: "look" },
  { folder: "look", key: "hueMax", control: [220, 0, 360, 1], kind: "look" },
  ...shared,
];

export const graphFields: Field[] = [
  { key: "mode", control: select(MODES), kind: "rebuild" },
  { folder: "nodes", key: "count", control: [140, 20, 400, 5], kind: "rebuild" },
  { folder: "nodes", key: "sizeMin", control: [4, 1, 20, 0.5], kind: "rebuild" },
  { folder: "nodes", key: "sizeMax", control: [14, 1, 30, 0.5], kind: "rebuild" },
  { folder: "nodes", key: "tiers", control: [0, 0, 6, 1], kind: "rebuild" },
  { folder: "nodes", key: "opacityMin", control: [0.45, 0, 1, 0.01], kind: "rebuild" },
  { folder: "nodes", key: "opacityMax", control: [1, 0, 1, 0.01], kind: "rebuild" },
  { folder: "placement", key: "fit", control: false, kind: "live" },
  { folder: "placement", key: "fitPadding", control: [16, 0, 200, 1], kind: "live" },
  { folder: "placement", key: "anchorLeft", control: false, kind: "live" },
  { folder: "placement", key: "centerX", control: [0.5, -0.5, 1.5, 0.01], kind: "live" },
  { folder: "placement", key: "centerY", control: [0.5, -0.5, 1.5, 0.01], kind: "live" },
  { folder: "placement", key: "scale", control: [1, 0.2, 5, 0.01], kind: "live" },
  { folder: "placement", key: "rotX", control: [0, -180, 180, 1], kind: "live" },
  { folder: "placement", key: "rotY", control: [0, -180, 180, 1], kind: "live" },
  { folder: "placement", key: "rotZ", control: [0, -180, 180, 1], kind: "live" },
  { folder: "motion", key: "idleRotationSpeed", control: [0.08, 0, 0.5, 0.005], kind: "live" },
  { folder: "motion", key: "idleTiltAmount", control: [0.35, 0, 1.2, 0.01], kind: "live" },
  { folder: "motion", key: "morphSpeed", control: [0.4, 0, 2, 0.01], kind: "live" },
  { folder: "motion", key: "morphHold", control: [0.5, 0, 1, 0.01], kind: "rebuild" },
  // shapes: constellation, clusters, spiral (network style), burst, sphere,
  // globe, cone, torus, helix, cube, galaxy, knot, atom, icosa, wave
  { folder: "sequence", key: "sequence", control: { type: "text", placeholder: "constellation,torus,helix" }, kind: "rebuild" },
  { folder: "sequence", key: "holdTime", control: [4, 0, 15, 0.1], kind: "live" },
  { folder: "sequence", key: "morphTime", control: [2.5, 0.3, 8, 0.1], kind: "live" },
  { folder: "sequence", key: "stagger", control: [0.35, 0, 0.9, 0.01], kind: "live" },
  { folder: "sequence", key: "morphImplode", control: [0, 0, 1, 0.01], kind: "live" },
  { folder: "sequence", key: "morphSwirl", control: [0, 0, 6.3, 0.05], kind: "live" },
  { folder: "sequence", key: "morphScatter", control: [0, 0, 2, 0.01], kind: "live" },
  { folder: "interaction", key: "hoverGlow", control: [0, 0, 1, 0.01], kind: "live" },
  { folder: "interaction", key: "hoverPath", control: false, kind: "live" },
  { folder: "interaction", key: "parallax", control: [0, 0, 0.8, 0.01], kind: "live" },
  { folder: "effects", key: "pulses", control: [0, 0, 60, 1], kind: "live" },
  { folder: "effects", key: "pulseSpeed", control: [180, 20, 800, 5], kind: "live" },
  { folder: "effects", key: "pulseSize", control: [3, 1, 10, 0.5], kind: "live" },
  { folder: "effects", key: "pulseColor", control: color, kind: "look" },
  { folder: "effects", key: "depth", control: [0, 0, 1, 0.01], kind: "live" },
  { folder: "effects", key: "intro", control: [0, 0, 5, 0.1], kind: "rebuild" },
  { folder: "effects", key: "exciteRate", control: [0.35, 0, 2, 0.01], kind: "live" },
  { folder: "effects", key: "rippleSpeed", control: [7, 0.5, 20, 0.1], kind: "live" },
  { folder: "look", key: "color", control: color, kind: "look" },
  { folder: "look", key: "lineColor", control: color, kind: "look" },
  { folder: "look", key: "lineOpacity", control: [0.25, 0, 1, 0.005], kind: "live" },
  { folder: "look", key: "lineWidth", control: [1, 0.25, 6, 0.05], kind: "live" },
  ...shared,
];

type AnyConfig = PointsConfig | GraphViewConfig;
type Values = Record<string, unknown>;

// `background` is one config key ("transparent" or a hex) but two controls.
function readCfg(cfg: AnyConfig, key: string): unknown {
  if (key === "paintBackground") return cfg.background !== "transparent";
  if (key === "backgroundColor") return cfg.background === "transparent" ? "#000000" : cfg.background;
  return (cfg as unknown as Values)[key];
}

// DialKit config whose defaults are the given cfg's values. Actions are
// merged in at the top level.
export function buildDialConfig(fields: Field[], cfg: AnyConfig, actions: Record<string, string>): DialConfig {
  const out: Record<string, Values> & Values = {};
  for (const f of fields) {
    const v = readCfg(cfg, f.key);
    let control: unknown;
    if (Array.isArray(f.control)) control = [v as number, f.control[1], f.control[2], f.control[3]];
    else if (typeof f.control === "boolean") control = v as boolean;
    else control = { ...f.control, default: v as string };
    const target = f.folder ? (out[f.folder] ??= { _collapsed: f.folder !== "motion" && f.folder !== "look" }) : out;
    target[f.key] = control;
  }
  for (const [key, label] of Object.entries(actions)) out[key] = { type: "action", label };
  return out as DialConfig;
}

export function cfgToValues(fields: Field[], cfg: AnyConfig): Values {
  const out: Values = {};
  for (const f of fields) {
    const target = f.folder ? ((out[f.folder] as Values) ??= {}) : out;
    target[f.key] = readCfg(cfg, f.key);
  }
  return out;
}

// Write panel values into cfg (in place — the engine holds this object by
// reference) and report the strongest kind of change.
export function applyValues(fields: Field[], values: Values, cfg: AnyConfig): Kind | null {
  const c = cfg as unknown as Values;
  let strongest: Kind | null = null;
  const bump = (k: Kind) => {
    if (k === "rebuild" || (k === "look" && strongest !== "rebuild") || strongest === null) strongest = k;
  };
  for (const f of fields) {
    if (f.key === "paintBackground" || f.key === "backgroundColor") continue;
    const src = f.folder ? (values[f.folder] as Values | undefined) : values;
    let v = src?.[f.key];
    // sliders can report float noise (0.0599999…); presets should read 0.06
    if (typeof v === "number") v = +v.toFixed(4);
    if (v === undefined || v === c[f.key]) continue;
    c[f.key] = v;
    bump(f.kind);
  }
  const look = values.look as Values | undefined;
  if (look) {
    const bg = look.paintBackground ? (look.backgroundColor as string) : "transparent";
    if (bg !== cfg.background) {
      cfg.background = bg;
      bump("look");
    }
  }
  return strongest;
}

// Only what differs from the defaults — what goes into a preset or
// data-config, so presets pick up future default improvements.
export function diffConfig(cfg: AnyConfig, defaults: AnyConfig): Values {
  const out: Values = {};
  const c = cfg as unknown as Values;
  const d = defaults as unknown as Values;
  for (const key of Object.keys(d)) if (c[key] !== d[key]) out[key] = c[key];
  return out;
}

// Every model the presets show, one by one, for stills: each shape of a
// morphing preset held still, and the presets that are one model as they
// are. Each is centred and fitted inside its box (nothing cut at the
// edges), with no backdrop pattern. Plus new ones for brand assets only.
// Listed by style, then shape family (ORDER). Shared by the export lab and
// the gallery.
import { blocksDefaults, glyphDefaults, graphDefaults } from "../src/runtime/defaults";
import { PRESETS } from "../src/runtime/presets";
import { parseSpec, type ViewSpec } from "../src/runtime/spec";
import { BLOCK_SHAPES } from "./blocks";
import { DOT_SHAPES } from "./dots";
import { LINE_SHAPES } from "./lines";
import { DRAWING_KINDS } from "./drawings";

export const STYLES = [
  ["dots", "Dots"],
  ["network", "Networks"],
  ["blocks", "Blocks"],
  ["lines", "Lines"],
  ["drawing", "Flat drawings"],
] as const;
export type Style = (typeof STYLES)[number][0];
// site: one of the shapes the presets show (else new, for brand assets)
export type Model = { name: string; preset: string; style: Style; site: boolean; config: Record<string, unknown> };
const STYLE_OF: Record<string, Style> = { points: "dots", graph: "network", blocks: "blocks", glyph: "drawing" };

// "preset · shape" -> the name shown
const NAMES: Record<string, string> = {
  "hero · sphere": "Dot sphere",
  "hero · meridians": "Meridians",
  "hero · spiral": "Dot spiral",
  "hero · burst": "Dot burst",
  "cta · constellation": "Constellation",
  "cta · clusters": "Clusters",
  "cta · spiral": "Network spiral",
  globe: "Network globe",
  "integrations · cube": "Block cube",
  "integrations · cross": "Block cross",
  "integrations · diamond": "Block diamond",
  "integrations · frame": "Block frame",
  "integrations · skyline": "Block skyline",
  "integrations · checker": "Block checker",
  "integrations · hub": "Block hub",
  "depth-api": "Spider",
  "depth-data": "Pendulum",
  "depth-security": "Rings",
};

// centred, fitted, still: off with the section's placement (anchored,
// bleeding, cropped by its card), parallax and backdrop
const STILL: Record<string, Record<string, unknown>> = {
  points: { fit: true, fitPadding: 16, scale: 1, scaleByWidth: false, parallax: 0 },
  // the blocks' motion blur and streaks grow with on-screen speed, so a
  // big still of a turning shape came out soft. They start in true
  // isometric (three faces) and turn slowly, to pause at another angle
  // A held shape gets a bolt now and then too (boltEvery), not only after a morph.
  // (rare and soft: lit up whole, a bright bolt reads as a flash)
  blocks: { blur: 0, streak: 0, turnSpeed: 0.03, boltEvery: 9, boltGain: 0.45 },
  graph: { fit: true, fitPadding: 16, scale: 1, scaleByWidth: false, centerX: 0.5, centerY: 0.5, anchorLeft: false, anchorBottom: false, bleed: false, parallax: 0, grid: 0, glow: 0, background: "transparent" },
};

const split = (s: unknown) =>
  String(s ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

// the spatial map (fjord) is left out: a staged 3D story driven by its
// section's tabs, it draws nothing on its own here yet
export const MODELS: Model[] = Object.entries(PRESETS).flatMap(([preset, p]): Model[] => {
  if (p.type === "map") return [];
  const c = p.config as Record<string, unknown>;
  const one = (shape: string, config: Record<string, unknown> = {}): Model => {
    const key = shape ? `${preset} · ${shape}` : preset;
    return { name: NAMES[key] ?? key, preset, style: STYLE_OF[p.type], site: true, config: { ...STILL[p.type], ...config } };
  };
  // a one-shape sequence holds that shape
  if (p.type === "points") return (split(c.sequence).length ? split(c.sequence) : [String(c.shape ?? "sphere")]).map((s) => one(s, { sequence: s, shape: s }));
  if (p.type === "graph" && c.mode === "sequence") return split(c.sequence).map((s) => one(s, { sequence: s }));
  // blocks: the shape first (the first shape sets the size the others are
  // fitted to) and a hold that never ends
  if (p.type === "blocks") {
    const shapes = split(c.shapes ?? blocksDefaults.shapes);
    return shapes.map((s) => one(s, { shapes: [s, ...shapes.filter((x) => x !== s)].join(","), holdTime: 1e6 }));
  }
  return [one("")];
});

// New: the engine's other shapes, in the hero's dots or the CTA's network,
// picked for the brand: clear silhouettes and calm textures. Left out
// (muddy, flat or clichéd as stills): dots dodecahedron, stellated, cube,
// cubesIntersect, crossCubes, interlock, straightLines, veins, chaosField,
// square, triangle, sacredGeometry, concentricRings, and the textures (terrain, noiseLines, waterfall,
// nebula); networks globe, torus, cube, knot, atom, cone, helix, galaxy,
// wave, burst.
const DOTS: [string, string][] = [
  ["torus", "Dot torus"],
  ["torusKnot", "Dot knot"],
  ["icosahedron", "Dot icosahedron"],
  ["octahedron", "Dot octahedron"],
  ["gem", "Dot gem"],
  ["hexCone", "Dot cone"],
];
const NETS: [string, string][] = [
  ["sphere", "Network sphere"],
  ["icosa", "Network icosahedron"],
];
MODELS.push(
  ...DOTS.map(([s, name]): Model => ({ name, preset: "hero", style: "dots", site: false, config: { ...STILL.points, sequence: s, shape: s } })),
  ...NETS.map(([s, name]): Model => ({ name, preset: "cta", style: "network", site: false, config: { ...STILL.graph, sequence: s } })),
  // more globes: the site's network globe, finer, sparser or with the CTA's
  // square nodes
  ...([
    ["Network globe fine", { count: 320, sizeMin: 2.5, sizeMax: 3.5, lineWidth: 0.6 }],
    ["Network globe sparse", { count: 70, sizeMin: 7, sizeMax: 9, lineWidth: 1, lineOpacity: 0.6 }],
    ["Network globe square", { nodeShape: "square", sizeMin: 3, sizeMax: 6, tiers: 3 }],
  ] as [string, Record<string, unknown>][]).map(([name, o]): Model => ({ name, preset: "globe", style: "network", site: false, config: { ...STILL.graph, ...o } })),
  // the new round dot shapes (dots.ts): one copy, not the hero's nested three
  ...DOT_SHAPES.map(([s, name]): Model => ({ name, preset: "hero", style: "dots", site: false, config: { ...STILL.points, sequence: s, innerCopies: 1 } })),
  // the new block shapes (blocks.ts), in the Integrations look, each its own size
  ...BLOCK_SHAPES.map(([shapes, name]): Model => ({ name, preset: "integrations", style: "blocks", site: false, config: { ...STILL.blocks, shapes, holdTime: 1e6 } })),
  // line models (lines.ts): the blocks' scene and look, other structures
  ...LINE_SHAPES.map(([shapes, name, , o]): Model => ({ name, preset: "integrations", style: "lines", site: false, config: { ...STILL.blocks, shapes, holdTime: 1e6, ...o } })),
  // the new flat drawings (drawings.ts), in the Technical depth cards' look
  ...DRAWING_KINDS.map(([kind, name]): Model => ({ name, preset: "depth-api", style: "drawing", site: false, config: { kind } })),
);

// too busy as a still image (on the site, or cut on review)
const HIDDEN = new Set(["Constellation", "Clusters", "Dot dome", "Dot planet", "Dot gyroscope", "Dot orbits", "Dot wheel", "Dot gear", "Dot torus", "Dot ring torus", "Dot sunflower", "Dot vortex",
  "Dot knot", "Dot cylinder", "Dot hyperboloid",
  "Line wheel", "Line gear", "Line knot", "Line nested globes", "Line spiral sphere", "Line sunflower", "Line vortex", "Line geodesic dome",
  "Line tower", "Line space frame", "Line bridge",
  "Block skyline", "Block wave", "Block checker", "Block stack", "Block modules", "Block bridge", "Block ring", "Block arch",
  "Network globe sparse", "Block frame", "Block walls", "Block corner", "Block stairs", "Line gem",
  "Kagome mesh", "Triangle mesh", "Diamond mesh", "Polar mesh", "Hex mesh fine", "Brick mesh",
  "Line saddle", "Line Möbius", "Line torus knot"]);
for (let i = MODELS.length - 1; i >= 0; i--) if (HIDDEN.has(MODELS[i].name)) MODELS.splice(i, 1);

// within a style, shape families together: round, then spirals and
// bursts, then rings and knots, then solids
const ORDER = [
  "Dot sphere", "Dot parallels", "Meridians", "Dot graticule", "Dot dome", "Dot planet", "Dot gyroscope", "Dot orbits", "Dot spiral", "Dot burst",
  "Dot sunflower", "Dot vortex", "Dot wheel", "Dot gear", "Dot torus", "Dot ring torus", "Dot knot", "Dot cylinder", "Dot hyperboloid",
  "Dot icosahedron", "Dot octahedron", "Dot gem", "Dot cone",
  "Network globe", "Network globe fine", "Network globe sparse", "Network globe square", "Network sphere", "Network spiral", "Network icosahedron",
  "Block cube", "Block sphere", "Block frame", "Block walls", "Block cross", "Block hub", "Block diamond", "Block pyramid", "Block corner", "Block stairs",
  "Block skyline", "Block wave", "Block checker", "Block stack", "Block modules", "Block bridge", "Block ring", "Block arch",
  "Line globe", "Line parallels", "Line meridians", "Line slices", "Line armillary", "Line mesh sphere", "Line nested globes", "Line spiral sphere", "Line geodesic dome", "Line burst", "Line star",
  "Line sunflower", "Line vortex", "Line wheel", "Line gear", "Line torus", "Line ring torus", "Line knot", "Line hyperboloid", "Line lattice tube", "Line saddle", "Line Möbius", "Line torus knot", "Line coil", "Line cone",
  "Line icosahedron", "Line octahedron", "Line dodecahedron", "Line merkaba", "Line geodesic", "Line Sierpinski", "Line cube grid", "Line tesseract",
  "Line cube spiral", "Line octet truss", "Line twisted prism", "Line tunnel", "Line gem", "Line drum", "Line hex column", "Line twist", "Line tower", "Line pyramid", "Line layers", "Line contours", "Line well", "Line wave surface",
  "Line space frame", "Line bridge", "Line masts",
  "Rings", "Orbit", "Pendulum", "Converge", "Spider", "Routes", "Hex mesh", "Hex mesh fine", "Cube mesh", "Octagon mesh", "Brick mesh", "Kagome mesh", "Triangle mesh", "Square mesh", "Diamond mesh", "Polar mesh", "Tree", "Signal",
];
const styleRank = (m: Model) => STYLES.findIndex(([s]) => s === m.style);
const rank = (m: Model) => (ORDER.includes(m.name) ? ORDER.indexOf(m.name) : ORDER.length);
MODELS.sort((a, b) => styleRank(a) - styleRank(b) || rank(a) - rank(b));

export const modelByName = (name: string) => MODELS.find((m) => m.name === name) ?? MODELS[0];

// Dots made crisp for a still: the site's fine, faint dots shimmer in motion
// but smear into grey once frozen, so fewer, bigger, more solid ones.
// density: share of the preset's dots; size: × their size; opacity: the
// faintest one (the brightest is 1).
export function crispDots(m: Model, d: { density: number; size: number; opacity: number }): Record<string, unknown> {
  if (m.style !== "dots") return {};
  const c = PRESETS[m.preset].config as Record<string, number>;
  return {
    count: Math.round((c.count ?? 10000) * d.density),
    sizeMin: (c.sizeMin ?? 0.5) * d.size,
    sizeMax: (c.sizeMax ?? 1) * d.size,
    opacityMin: d.opacity,
    opacityMax: 1,
  };
}

// Each style's own panel in the export lab, shown only for its models: the
// dials (multipliers on the model's own settings, 1: as it is, unless said)
// and what they set on a model.
const x1 = (max: number, min = 0): [number, number, number, number] => [1, min, max, 0.05];
const LINE_DIALS = {
  lines: { brightness: x1(3), width: x1(4, 0.25) },
  dots: { brightness: x1(2), size: x1(4) },
  // the inside lines, and how bright the far side draws
  depth: { inner: x1(4), farSide: x1(3.3) },
  // rest: s between bolts (not a multiplier)
  electricity: { brightness: x1(3), speed: x1(4, 0.25), afterglow: x1(4, 0.2), rest: [9, 0.5, 30, 0.1] as [number, number, number, number] },
};
export const STYLE_DIALS = {
  // fewer, bigger, more solid dots read crisp as a still (crispDots);
  // 1 / 1 / 0.25 is the site's look
  dots: { density: [0.5, 0.1, 1, 0.05], size: [1.6, 0.5, 4, 0.05], opacity: [0.6, 0, 1, 0.05] },
  network: { lines: { brightness: x1(3), width: x1(4, 0.25) }, nodes: { size: x1(4) } },
  blocks: LINE_DIALS,
  lines: LINE_DIALS,
  drawing: { lines: { brightness: x1(3), width: x1(4, 0.25) }, dots: { brightness: x1(2) }, electricity: { brightness: x1(3), speed: x1(4, 0.25), afterglow: x1(4, 0.2) } },
} as const;
type Dials = Record<string, Record<string, number>>;
const cap = (n: number) => Math.min(1, n);
// what a style panel's values set on a model (the drawings' electricity is
// set apart, in drawings.ts LOOK)
export function styleOverrides(m: Model, values: unknown): Record<string, unknown> {
  const d = values as Dials;
  const p = PRESETS[m.preset];
  if (m.style === "dots") return crispDots(m, values as { density: number; size: number; opacity: number });
  if (m.style === "lines" || m.style === "blocks") {
    const c = { ...blocksDefaults, ...p.config, ...m.config } as unknown as Record<string, number>;
    return {
      lineOpacity: c.lineOpacity * d.lines.brightness,
      lineWidth: c.lineWidth * d.lines.width,
      nodeOpacity: cap(c.nodeOpacity * d.dots.brightness),
      nodeSize: c.nodeSize * d.dots.size,
      inner: cap(c.inner * d.depth.inner),
      backDim: cap(c.backDim * d.depth.farSide),
      boltGain: c.boltGain * d.electricity.brightness,
      boltStep: c.boltStep / d.electricity.speed,
      boltFade: c.boltFade * d.electricity.afterglow,
      boltEvery: d.electricity.rest,
    };
  }
  if (m.style === "network") {
    const c = { ...graphDefaults, ...p.config, ...m.config } as unknown as Record<string, number>;
    return { lineOpacity: cap(c.lineOpacity * d.lines.brightness), lineWidth: c.lineWidth * d.lines.width, sizeMin: c.sizeMin * d.nodes.size, sizeMax: c.sizeMax * d.nodes.size };
  }
  const c = { ...glyphDefaults, ...p.config, ...m.config } as unknown as Record<string, number>;
  return { lineOpacity: c.lineOpacity * d.lines.brightness, lineWidth: c.lineWidth * d.lines.width, nodeOpacity: cap(c.nodeOpacity * d.dots.brightness) };
}

// a model's spec: its preset and the still overrides. The parser only knows
// the shipped drawing kinds (it would reset a new one), so the overrides go
// in again after it.
// `extra`: overrides on top (the export lab's dials)
export function specFor(el: HTMLElement, m: Model, extra: Record<string, unknown> = {}): ViewSpec {
  el.dataset.preset = m.preset;
  const { kind, ...rest } = { ...m.config, ...extra };
  el.dataset.config = JSON.stringify(rest);
  const spec = parseSpec(el);
  if (kind !== undefined) Object.assign(spec.config, { kind });
  return spec;
}

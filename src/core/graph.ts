import type { ClickBehavior } from "./config";
import { makeRng } from "./rng";

export const GRAPH_MODES = ["hubBurst", "geoSphere", "burstSphereMorph", "coneTorusMorph", "sequence"] as const;
export type GraphMode = (typeof GRAPH_MODES)[number];

export interface GraphConfig {
  seed: number;
  count: number;
  sizeMin: number;
  sizeMax: number;
  // node brightness range across weights (tiers)
  opacityMin: number;
  opacityMax: number;
  mode: GraphMode;
  morphSpeed: number;
  // morph position (0 = first layout, 1 = second) held when morphSpeed = 0
  morphHold: number;
  idleRotationSpeed: number;
  idleTiltAmount: number;
  hoverRadius: number;
  hoverStrength: number;
  clickBehavior: ClickBehavior;
  background: string;
  color: string;
  lineColor: string;
  lineOpacity: number;
  // edge thickness in CSS px
  lineWidth: number;
  // placement in the container: center as a fraction of width/height, and
  // a size multiplier (1 = fits comfortably; >1 overflows, cropped by the box)
  centerX: number;
  centerY: number;
  scale: number;
  // base orientation in degrees, added to the idle rotation/tilt
  rotX: number;
  rotY: number;
  // in-plane rotation of the projected graph (swings e.g. the burst hub
  // toward a corner)
  rotZ: number;
  // quantize node weights into N size/brightness steps (0 = continuous)
  tiers: number;
  // "sequence" mode: comma-separated shapes (see SHAPES below) visited in a
  // loop — hold on each for holdTime s, then morph for morphTime s. stagger
  // (0..1) offsets nodes so they don't all move in lockstep.
  sequence: string;
  holdTime: number;
  morphTime: number;
  stagger: number;
  // hover highlight: nodes near the pointer grow and brighten and their
  // edges light up (0 = off)
  hoverGlow: number;
  // fit: size every shape to stay fully inside the canvas (scale becomes a
  // multiplier capped at 1); fitPadding = extra px kept clear of the edges
  fit: boolean;
  fitPadding: number;
  // morph drama (sequence mode): mid-morph, nodes pull toward the core by
  // up to morphImplode (0..1) and swirl around the vertical axis by up to
  // morphSwirl radians — both keep nodes inside the fitted radius
  morphImplode: number;
  morphSwirl: number;
}

export const defaultGraphConfig: GraphConfig = {
  seed: 4321,
  count: 140,
  sizeMin: 4,
  sizeMax: 14,
  opacityMin: 0.45,
  opacityMax: 1,
  mode: "hubBurst",
  morphSpeed: 0.4,
  morphHold: 0.5,
  idleRotationSpeed: 0.08,
  idleTiltAmount: 0.35,
  hoverRadius: 140,
  hoverStrength: 1,
  clickBehavior: "burst",
  background: "#050505",
  color: "#e8e8e8",
  lineColor: "#e8e8e8",
  lineOpacity: 0.25,
  lineWidth: 1,
  centerX: 0.5,
  centerY: 0.5,
  scale: 1,
  rotX: 0,
  rotY: 0,
  rotZ: 0,
  tiers: 0,
  sequence: "constellation,torus,helix,galaxy",
  holdTime: 4,
  morphTime: 2.5,
  stagger: 0.35,
  hoverGlow: 0,
  fit: false,
  fitPadding: 16,
  morphImplode: 0,
  morphSwirl: 0,
};

interface Layout {
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  weight: Float32Array;
  edges: [number, number][];
  // optional per-edge alpha multiplier (default 1)
  edgeWeight?: Float32Array;
}

// Node count is small (tens-hundreds) so an O(n^2) neighbor search done once
// per rebuild is cheap — no need for a spatial index.
function nearestNeighborEdges(x: Float32Array, y: Float32Array, z: Float32Array, k: number): [number, number][] {
  const n = x.length;
  const seen = new Set<string>();
  const edges: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const dists: { j: number; d: number }[] = [];
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const dx = x[i] - x[j];
      const dy = y[i] - y[j];
      const dz = z[i] - z[j];
      dists.push({ j, d: dx * dx + dy * dy + dz * dz });
    }
    dists.sort((a, b) => a.d - b.d);
    for (let m = 0; m < k && m < dists.length; m++) {
      const j = dists[m].j;
      const key = i < j ? `${i}_${j}` : `${j}_${i}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push(i < j ? [i, j] : [j, i]);
      }
    }
  }
  return edges;
}

// Node 0 is the hub (weight 1, drawn largest); every other node gets one
// spoke edge back to it, at a random angle/radius in a flat disc.
function buildHubBurst(n: number, seed: number): Layout {
  const rng = makeRng(seed);
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const z = new Float32Array(n);
  const weight = new Float32Array(n);
  weight[0] = 1;
  for (let i = 1; i < n; i++) {
    const angle = rng.next() * Math.PI * 2;
    const r = 0.22 + Math.pow(rng.next(), 0.6) * 0.78;
    x[i] = Math.cos(angle) * r;
    y[i] = Math.sin(angle) * r;
    z[i] = (rng.next() - 0.5) * 0.1;
    weight[i] = rng.next();
  }
  const edges: [number, number][] = [];
  for (let i = 1; i < n; i++) edges.push([0, i]);
  return { x, y, z, weight, edges };
}

// Fibonacci sphere lattice with nearest-neighbor mesh edges — a triangulated
// wireframe globe.
function buildGeoSphere(n: number, seed: number): Layout {
  const rng = makeRng(seed);
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const z = new Float32Array(n);
  const weight = new Float32Array(n);
  const GOLDEN_ANGLE = 2.39996322972865332;
  for (let i = 0; i < n; i++) {
    const yy = 1 - (i / Math.max(1, n - 1)) * 2;
    const radiusAtY = Math.sqrt(Math.max(0, 1 - yy * yy));
    const theta = i * GOLDEN_ANGLE;
    x[i] = Math.cos(theta) * radiusAtY;
    z[i] = Math.sin(theta) * radiusAtY;
    y[i] = yy;
    weight[i] = rng.next();
  }
  return { x, y, z, weight, edges: nearestNeighborEdges(x, y, z, 3) };
}

// A static lean baked into the cone's own geometry (independent of the idle
// camera tilt below) so its axis reads as tilted rather than dead-vertical
// from any viewing angle.
const CONE_TILT = 0.5;

// Points distributed across rings from apex to base, ring size scaled so
// density per layer stays even (same technique as shapes.ts polygonRingsPoint).
function buildCone(n: number, seed: number): Layout {
  const rng = makeRng(seed);
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const z = new Float32Array(n);
  const weight = new Float32Array(n);
  const ringCount = Math.max(5, Math.round(Math.sqrt(n)));
  const total = (ringCount * (ringCount + 1)) / 2;
  let i = 0;
  for (let r = 1; r <= ringCount && i < n; r++) {
    const c = Math.max(1, Math.round((n * r) / total));
    const frac = r / ringCount;
    const yPos = 1 - frac * 2;
    for (let k = 0; k < c && i < n; k++, i++) {
      const angle = (k / c) * Math.PI * 2 + r * 0.3;
      x[i] = Math.cos(angle) * frac;
      z[i] = Math.sin(angle) * frac;
      y[i] = yPos;
      weight[i] = rng.next();
    }
  }
  while (i < n) {
    x[i] = 0;
    y[i] = 1;
    z[i] = 0;
    weight[i] = rng.next();
    i++;
  }
  const tiltCos = Math.cos(CONE_TILT);
  const tiltSin = Math.sin(CONE_TILT);
  for (let j = 0; j < n; j++) {
    const yy = y[j];
    const zz = z[j];
    y[j] = yy * tiltCos - zz * tiltSin;
    z[j] = yy * tiltSin + zz * tiltCos;
  }
  return { x, y, z, weight, edges: nearestNeighborEdges(x, y, z, 3) };
}

function buildTorus(n: number, seed: number): Layout {
  const rng = makeRng(seed);
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const z = new Float32Array(n);
  const weight = new Float32Array(n);
  const majorSteps = Math.max(8, Math.round(Math.sqrt(n)));
  const minorSteps = Math.max(1, Math.ceil(n / majorSteps));
  const R = 0.7;
  const r = 0.3;
  for (let i = 0; i < n; i++) {
    const majorIdx = i % majorSteps;
    const minorIdx = Math.floor(i / majorSteps) % minorSteps;
    const u = (majorIdx / majorSteps) * Math.PI * 2;
    const v = (minorIdx / minorSteps) * Math.PI * 2;
    x[i] = (R + r * Math.cos(v)) * Math.cos(u);
    z[i] = (R + r * Math.cos(v)) * Math.sin(u);
    y[i] = r * Math.sin(v);
    weight[i] = rng.next();
  }
  return { x, y, z, weight, edges: nearestNeighborEdges(x, y, z, 3) };
}

// Hub-burst spokes blended into the geo sphere at `mix` (0..1): the burst's
// spokes fade out and the sphere mesh fades in by the same amount — the
// "network globe" look (the CTA design is mix 0.75). Weights come from the
// burst, so the hub stays the largest node.
function buildConstellation(n: number, seed: number, mix: number): Layout {
  const a = buildHubBurst(n, seed);
  const b = buildGeoSphere(n, seed + 1);
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const z = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = a.x[i] + (b.x[i] - a.x[i]) * mix;
    y[i] = a.y[i] + (b.y[i] - a.y[i]) * mix;
    z[i] = a.z[i] + (b.z[i] - a.z[i]) * mix;
  }
  const edges = [...a.edges, ...b.edges];
  const edgeWeight = new Float32Array(edges.length);
  edgeWeight.fill(1 - mix, 0, a.edges.length);
  edgeWeight.fill(mix, a.edges.length);
  return { x, y, z, weight: a.weight, edges, edgeWeight };
}

// Double helix along Y: nodes alternate strands, rungs join each pair.
function buildHelix(n: number, seed: number): Layout {
  const rng = makeRng(seed);
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const z = new Float32Array(n);
  const weight = new Float32Array(n);
  const turns = 2.2;
  const R = 0.42;
  const pairs = Math.ceil(n / 2);
  for (let i = 0; i < n; i++) {
    const level = Math.floor(i / 2) / Math.max(1, pairs - 1);
    const a = level * turns * Math.PI * 2 + (i % 2) * Math.PI;
    x[i] = Math.cos(a) * R;
    z[i] = Math.sin(a) * R;
    y[i] = level * 2.2 - 1.1;
    weight[i] = rng.next();
  }
  const edges: [number, number][] = [];
  for (let i = 0; i + 1 < n; i += 2) edges.push([i, i + 1]); // rungs
  for (let i = 0; i + 2 < n; i++) edges.push([i, i + 2]); // strands
  return { x, y, z, weight, edges };
}

// Nodes spread over the six faces of a cube, meshed to their neighbors.
function buildCube(n: number, seed: number): Layout {
  const rng = makeRng(seed);
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const z = new Float32Array(n);
  const weight = new Float32Array(n);
  const H = 0.62;
  for (let i = 0; i < n; i++) {
    const face = i % 6;
    const u = (rng.next() * 2 - 1) * H;
    const v = (rng.next() * 2 - 1) * H;
    const s = face % 2 ? H : -H;
    if (face < 2) [x[i], y[i], z[i]] = [u, v, s];
    else if (face < 4) [x[i], y[i], z[i]] = [s, u, v];
    else [x[i], y[i], z[i]] = [u, s, v];
    weight[i] = rng.next();
  }
  return { x, y, z, weight, edges: nearestNeighborEdges(x, y, z, 3) };
}

// Globe: latitude rings (dot count per ring follows its circumference),
// linked around each ring and to the nearest nodes on neighboring rings.
function buildGlobe(n: number, seed: number): Layout {
  const rng = makeRng(seed);
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const z = new Float32Array(n);
  const weight = new Float32Array(n);
  const rings = Math.max(4, Math.round(Math.sqrt(n / 2.5)));
  const circ: number[] = [];
  for (let r = 0; r < rings; r++) circ.push(Math.sin((Math.PI * (r + 0.5)) / rings));
  const total = circ.reduce((a, b) => a + b, 0);
  const edges: [number, number][] = [];
  let i = 0;
  for (let r = 0; r < rings && i < n; r++) {
    const lat = (Math.PI * (r + 0.5)) / rings;
    const count = r === rings - 1 ? n - i : Math.max(3, Math.round((n * circ[r]) / total));
    const start = i;
    for (let k = 0; k < count && i < n; k++, i++) {
      const lon = (k / count) * Math.PI * 2 + r * 0.4;
      x[i] = Math.sin(lat) * Math.cos(lon);
      z[i] = Math.sin(lat) * Math.sin(lon);
      y[i] = Math.cos(lat);
      weight[i] = rng.next();
      if (k > 0) edges.push([i - 1, i]);
    }
    if (i - start > 2) edges.push([start, i - 1]); // close the ring
  }
  const seen = new Set(edges.map(([a, b]) => `${Math.min(a, b)}_${Math.max(a, b)}`));
  for (const [a, b] of nearestNeighborEdges(x, y, z, 2)) {
    if (!seen.has(`${a}_${b}`)) edges.push([a, b]);
  }
  return { x, y, z, weight, edges };
}

// (p=2, q=3) trefoil knot: nodes walk the curve with a little tube jitter,
// linked along the curve and to near neighbors across crossings.
function buildKnot(n: number, seed: number): Layout {
  const rng = makeRng(seed);
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const z = new Float32Array(n);
  const weight = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const r = 2 + Math.cos(3 * t);
    const j = () => (rng.next() - 0.5) * 0.18;
    x[i] = (r * Math.cos(2 * t)) / 3 + j();
    y[i] = (r * Math.sin(2 * t)) / 3 + j();
    z[i] = Math.sin(3 * t) / 3 + j();
    weight[i] = rng.next();
  }
  const edges: [number, number][] = [];
  for (let i = 0; i < n; i++) edges.push([i, (i + 1) % n]);
  return { x, y, z, weight, edges };
}

// Atom: three tilted orbit rings around a dense nucleus.
function buildAtom(n: number, seed: number): Layout {
  const rng = makeRng(seed);
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const z = new Float32Array(n);
  const weight = new Float32Array(n);
  const core = Math.max(6, Math.round(n * 0.18));
  const perRing = Math.floor((n - core) / 3);
  const edges: [number, number][] = [];
  let i = 0;
  for (let ring = 0; ring < 3; ring++) {
    const tilt = 1.1; // each orbit leans out of the screen plane
    const spin = (ring / 3) * Math.PI; // ... and is turned 60° from the last
    const count = ring === 2 ? n - core - 2 * perRing : perRing;
    const start = i;
    for (let k = 0; k < count; k++, i++) {
      const a = (k / count) * Math.PI * 2;
      const px = Math.cos(a);
      const py = Math.sin(a) * Math.cos(tilt);
      const pz = Math.sin(a) * Math.sin(tilt);
      x[i] = px * Math.cos(spin) - py * Math.sin(spin);
      y[i] = px * Math.sin(spin) + py * Math.cos(spin);
      z[i] = pz;
      weight[i] = rng.next() * 0.7;
      edges.push([i, k + 1 < count ? i + 1 : start]);
    }
  }
  const coreStart = i;
  for (; i < n; i++) {
    const u = rng.next() * 2 - 1;
    const a = rng.next() * Math.PI * 2;
    const r = 0.2 * Math.cbrt(rng.next());
    const s = Math.sqrt(1 - u * u);
    x[i] = Math.cos(a) * s * r;
    y[i] = Math.sin(a) * s * r;
    z[i] = u * r;
    weight[i] = 0.5 + rng.next() * 0.5;
  }
  const cx = x.subarray(coreStart);
  const cy = y.subarray(coreStart);
  const cz = z.subarray(coreStart);
  for (const [a, b] of nearestNeighborEdges(cx, cy, cz, 3)) edges.push([a + coreStart, b + coreStart]);
  return { x, y, z, weight, edges };
}

// Icosahedron wireframe: the 12 vertices plus nodes spaced along its 30
// edges, each edge a chain.
function buildIcosa(n: number, seed: number): Layout {
  const rng = makeRng(seed);
  const t = (1 + Math.sqrt(5)) / 2;
  const raw = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];
  const len = Math.hypot(1, t);
  const V = raw.map((v) => v.map((c) => c / len));
  const E: [number, number][] = [];
  for (let a = 0; a < 12; a++) {
    for (let b = a + 1; b < 12; b++) {
      const d = Math.hypot(V[a][0] - V[b][0], V[a][1] - V[b][1], V[a][2] - V[b][2]);
      if (d < 1.1) E.push([a, b]); // edge length is ~1.05 on the unit sphere
    }
  }
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const z = new Float32Array(n);
  const weight = new Float32Array(n);
  const edges: [number, number][] = [];
  const nv = Math.min(12, n);
  for (let i = 0; i < nv; i++) {
    [x[i], y[i], z[i]] = V[i];
    weight[i] = 1;
  }
  const along = Math.max(0, n - nv);
  let i = nv;
  E.forEach(([a, b], e) => {
    const k = Math.floor(along / E.length) + (e < along % E.length ? 1 : 0);
    let prev = a;
    for (let m = 1; m <= k && i < n; m++, i++) {
      const f = m / (k + 1);
      x[i] = V[a][0] + (V[b][0] - V[a][0]) * f;
      y[i] = V[a][1] + (V[b][1] - V[a][1]) * f;
      z[i] = V[a][2] + (V[b][2] - V[a][2]) * f;
      weight[i] = rng.next() * 0.6;
      edges.push([prev, i]);
      prev = i;
    }
    if (a < nv && b < nv) edges.push([prev, b]);
  });
  return { x, y, z, weight, edges };
}

// Rippling grid, leaned back so the waves read in depth.
function buildWave(n: number, seed: number): Layout {
  const rng = makeRng(seed);
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const z = new Float32Array(n);
  const weight = new Float32Array(n);
  const cols = Math.max(2, Math.round(Math.sqrt(n)));
  const rows = Math.max(2, Math.ceil(n / cols));
  const lean = 1.0;
  const edges: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const u = (c / (cols - 1)) * 2 - 1;
    const v = (r / (rows - 1)) * 2 - 1;
    const h = 0.22 * Math.sin(u * 3.2) * Math.cos(v * 2.6);
    // grid in XZ (the ground) at 0.68 of the unit radius, tipped toward
    // the viewer around X
    const gx = u * 0.68;
    const gy = h;
    const gz = v * 0.68;
    x[i] = gx;
    y[i] = gy * Math.cos(lean) - gz * Math.sin(lean);
    z[i] = gy * Math.sin(lean) + gz * Math.cos(lean);
    weight[i] = rng.next();
    if (c + 1 < cols && i + 1 < n) edges.push([i, i + 1]);
    if (i + cols < n) edges.push([i, i + cols]);
  }
  return { x, y, z, weight, edges };
}

// Three-armed spiral disc.
function buildGalaxy(n: number, seed: number): Layout {
  const rng = makeRng(seed);
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const z = new Float32Array(n);
  const weight = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const arm = i % 3;
    const r = 0.08 + Math.pow(rng.next(), 0.8) * 0.95;
    const a = (arm / 3) * Math.PI * 2 + r * 3.6 + (rng.next() - 0.5) * 0.5;
    // in the XY plane, facing the viewer (the idle spin is around Y, so a
    // disc in XZ would be seen edge-on as a flat streak)
    x[i] = Math.cos(a) * r;
    y[i] = Math.sin(a) * r;
    z[i] = (rng.next() - 0.5) * 0.08;
    weight[i] = rng.next();
  }
  return { x, y, z, weight, edges: nearestNeighborEdges(x, y, z, 2) };
}

// Shapes usable in a sequence (and their builders).
export const SHAPES = [
  "constellation",
  "burst",
  "sphere",
  "globe",
  "cone",
  "torus",
  "helix",
  "cube",
  "galaxy",
  "knot",
  "atom",
  "icosa",
  "wave",
] as const;
export type GraphShape = (typeof SHAPES)[number];

function buildShape(shape: GraphShape, n: number, seed: number, cfg: GraphConfig): Layout {
  switch (shape) {
    case "constellation":
      return buildConstellation(n, seed, cfg.morphHold);
    case "burst":
      return buildHubBurst(n, seed);
    case "sphere":
      return buildGeoSphere(n, seed);
    case "globe":
      return buildGlobe(n, seed);
    case "cone":
      return buildCone(n, seed);
    case "torus":
      return buildTorus(n, seed);
    case "helix":
      return buildHelix(n, seed);
    case "cube":
      return buildCube(n, seed);
    case "galaxy":
      return buildGalaxy(n, seed);
    case "knot":
      return buildKnot(n, seed);
    case "atom":
      return buildAtom(n, seed);
    case "icosa":
      return buildIcosa(n, seed);
    case "wave":
      return buildWave(n, seed);
  }
}

export function parseSequence(seq: string): GraphShape[] {
  const shapes = seq
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is GraphShape => (SHAPES as readonly string[]).includes(s));
  return shapes.length ? shapes : ["constellation"];
}

// One visible edge set this frame: layouts' edges, with the layer's
// cross-fade alpha and optional per-edge weights.
export interface EdgeLayer {
  edges: [number, number][];
  weight: Float32Array | undefined;
  alpha: number;
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Node positions live in flat typed arrays (same convention as
// ParticleSystem). Layouts are generated once in unit space (~-1..1), then
// blended, rotated and projected to screen space every frame. Edges are
// never recomputed per frame: during a morph the outgoing layout's edges
// fade out while the incoming layout's fade in.
//   - single modes (hubBurst, geoSphere): one static layout
//   - the two legacy morph modes: sine ping-pong between two layouts
//   - "sequence": loop through cfg.sequence with hold + eased morph
export class GraphSystem {
  count = 0;
  offX!: Float32Array;
  offY!: Float32Array;
  offVX!: Float32Array;
  offVY!: Float32Array;
  size!: Float32Array;
  opacity!: Float32Array;
  screenX!: Float32Array;
  screenY!: Float32Array;
  // hover highlight per node, eased 0..1 (see updateGlow)
  glow!: Float32Array;
  // [outgoing, incoming] edge sets for this frame
  layers: [EdgeLayer, EdgeLayer] = [
    { edges: [], weight: undefined, alpha: 1 },
    { edges: [], weight: undefined, alpha: 0 },
  ];
  // most edges any layout has — lets renderers size buffers once
  maxEdges = 0;
  time = 0;

  private layouts: Layout[] = [];
  // largest distance from the origin over every layout (for fit)
  private maxRadius = 1;
  private delay!: Float32Array;
  private rot = 0;
  private lastW: number;
  private lastH: number;

  constructor(
    private cfg: GraphConfig,
    w: number,
    h: number,
  ) {
    this.lastW = w;
    this.lastH = h;
    this.rebuild(w, h);
  }

  // Interaction (see interaction.ts) reads baseX/baseY as the pre-offset
  // "rest" position — screenX/screenY (post rotation+morph+projection) is
  // exactly that, so expose them under the name it expects.
  get baseX() {
    return this.screenX;
  }
  get baseY() {
    return this.screenY;
  }

  rebuild(w: number = this.lastW, h: number = this.lastH) {
    this.lastW = w;
    this.lastH = h;
    const cfg = this.cfg;
    const n = cfg.count;
    this.count = n;
    this.time = 0;
    this.rot = 0;

    const shapes: GraphShape[] =
      cfg.mode === "hubBurst"
        ? ["burst"]
        : cfg.mode === "geoSphere"
          ? ["sphere"]
          : cfg.mode === "burstSphereMorph"
            ? ["burst", "sphere"]
            : cfg.mode === "coneTorusMorph"
              ? ["cone", "torus"]
              : parseSequence(cfg.sequence);
    // consecutive layouts get different seeds so their random weights and
    // jitter differ (matches the original morph modes' seed + 1)
    this.layouts = shapes.map((shape, i) => buildShape(shape, n, cfg.seed + i, cfg));
    this.maxEdges = Math.max(...this.layouts.map((l) => l.edges.length));
    // rotation preserves distance from the origin, and a blend of two points
    // is never farther out than the farther one — so this bounds every frame
    this.maxRadius = 1e-6;
    for (const l of this.layouts) {
      for (let i = 0; i < n; i++) this.maxRadius = Math.max(this.maxRadius, Math.hypot(l.x[i], l.y[i], l.z[i]));
    }

    const rng = makeRng(cfg.seed ^ 0x5bd1e995);
    this.delay = new Float32Array(n);
    for (let i = 0; i < n; i++) this.delay[i] = rng.next();

    this.offX = new Float32Array(n);
    this.offY = new Float32Array(n);
    this.offVX = new Float32Array(n);
    this.offVY = new Float32Array(n);
    this.size = new Float32Array(n);
    this.opacity = new Float32Array(n);
    this.screenX = new Float32Array(n);
    this.screenY = new Float32Array(n);
    this.glow = new Float32Array(n);
    // node sizes follow the first layout's weights for the whole loop
    for (let i = 0; i < n; i++) {
      const raw = this.layouts[0].weight[i];
      const steps = Math.round(cfg.tiers);
      const wgt = steps > 1 ? Math.round(raw * (steps - 1)) / (steps - 1) : raw;
      this.size[i] = cfg.sizeMin + wgt * (cfg.sizeMax - cfg.sizeMin);
      this.opacity[i] = cfg.opacityMin + wgt * (cfg.opacityMax - cfg.opacityMin);
    }
    this.update(0, w, h);
  }

  // Which two layouts are blended this frame, and how far (0..1).
  private timeline(): { from: number; to: number; t: number; staggered: boolean } {
    const cfg = this.cfg;
    const L = this.layouts.length;
    if (L < 2) return { from: 0, to: 0, t: 0, staggered: false };
    if (cfg.mode !== "sequence") {
      const t = cfg.morphSpeed > 0 ? 0.5 + 0.5 * Math.sin(this.time * cfg.morphSpeed) : cfg.morphHold;
      return { from: 0, to: 1, t, staggered: false };
    }
    const hold = Math.max(0, cfg.holdTime);
    const morph = Math.max(0.05, cfg.morphTime);
    const period = hold + morph;
    const cycle = Math.floor(this.time / period);
    const local = this.time - cycle * period;
    const from = cycle % L;
    return { from, to: (from + 1) % L, t: local < hold ? 0 : (local - hold) / morph, staggered: true };
  }

  update(dt: number, w: number, h: number) {
    const cfg = this.cfg;
    this.time += dt;
    this.rot += dt * cfg.idleRotationSpeed;
    const n = this.count;
    const { from, to, t, staggered } = this.timeline();
    const A = this.layouts[from];
    const B = this.layouts[to];
    const blending = from !== to;
    this.layers[0].edges = A.edges;
    this.layers[0].weight = A.edgeWeight;
    this.layers[0].alpha = blending ? 1 - (staggered ? easeInOutCubic(t) : t) : 1;
    this.layers[1].edges = blending ? B.edges : [];
    this.layers[1].weight = B.edgeWeight;
    this.layers[1].alpha = blending ? 1 - this.layers[0].alpha : 0;
    // stagger: node i starts its move delay[i] * s into the morph, and all
    // nodes still finish on time
    const s = staggered ? Math.min(1, Math.max(0, cfg.stagger)) : 0;

    const cx = w * cfg.centerX;
    const cy = h * cfg.centerY;
    let scale = Math.min(w, h) * 0.32 * cfg.scale;
    if (cfg.fit) {
      // keep clear: padding + the largest dot (incl. 60% hover growth) +
      // room for the hover push
      const margin = cfg.fitPadding + cfg.sizeMax * 1.6 + 20;
      const room = Math.max(1, Math.min(cx, w - cx, cy, h - cy) - margin);
      scale = (room / this.maxRadius) * Math.min(1, cfg.scale);
    }
    const DEG = Math.PI / 180;
    const cosR = Math.cos(this.rot + cfg.rotY * DEG);
    const sinR = Math.sin(this.rot + cfg.rotY * DEG);
    // slow nodding tilt (around X) layered on top of the constant Y-axis
    // spin — the combination sweeps the camera through varied angles
    // instead of a flat, always-equatorial view.
    const tiltAngle = Math.sin(this.time * cfg.idleRotationSpeed * 0.6) * cfg.idleTiltAmount + cfg.rotX * DEG;
    const cosT = Math.cos(tiltAngle);
    const sinT = Math.sin(tiltAngle);
    const cosZ = Math.cos(cfg.rotZ * DEG);
    const sinZ = Math.sin(cfg.rotZ * DEG);
    const k = 60;
    const damp = 8;

    for (let i = 0; i < n; i++) {
      let x = A.x[i];
      let y = A.y[i];
      let z = A.z[i];
      if (blending) {
        let ti = t;
        if (staggered) {
          ti = Math.min(1, Math.max(0, (t - this.delay[i] * s) / (1 - s || 1)));
          ti = easeInOutCubic(ti);
        }
        x += (B.x[i] - x) * ti;
        y += (B.y[i] - y) * ti;
        z += (B.z[i] - z) * ti;
        if (staggered && (cfg.morphImplode || cfg.morphSwirl)) {
          // peaks mid-morph for each node (bell over its own progress)
          const bell = Math.sin(Math.PI * ti);
          const pull = 1 - Math.min(1, Math.max(0, cfg.morphImplode)) * bell;
          const a = cfg.morphSwirl * bell;
          const ca = Math.cos(a);
          const sa = Math.sin(a);
          const sx = (x * ca + z * sa) * pull;
          z = (-x * sa + z * ca) * pull;
          x = sx;
          y *= pull;
        }
      }
      const rx = x * cosR + z * sinR;
      const rz = -x * sinR + z * cosR;
      const ry = y * cosT - rz * sinT;
      this.screenX[i] = cx + (rx * cosZ - ry * sinZ) * scale;
      this.screenY[i] = cy + (rx * sinZ + ry * cosZ) * scale;

      const ax = -k * this.offX[i] - damp * this.offVX[i];
      const ay = -k * this.offY[i] - damp * this.offVY[i];
      this.offVX[i] += ax * dt;
      this.offVY[i] += ay * dt;
      this.offX[i] += this.offVX[i] * dt;
      this.offY[i] += this.offVY[i] * dt;
    }
  }

  // Ease each node's glow toward its closeness to the pointer (null = no
  // pointer): a smooth falloff over 1.3x the hover radius, so the highlight
  // blooms in and fades out rather than snapping.
  updateGlow(px: number | null, py: number, dt: number) {
    const n = this.count;
    const R = this.cfg.hoverRadius * 1.3;
    const ease = 1 - Math.exp(-dt * 6);
    for (let i = 0; i < n; i++) {
      let target = 0;
      if (px !== null) {
        const dx = this.screenX[i] + this.offX[i] - px;
        const dy = this.screenY[i] + this.offY[i] - py;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < R) {
          const f = 1 - d / R;
          target = f * f * (3 - 2 * f);
        }
      }
      this.glow[i] += (target - this.glow[i]) * ease;
    }
  }

  reroll() {
    this.cfg.seed = Math.floor(Math.random() * 1e9);
    this.rebuild();
  }
}

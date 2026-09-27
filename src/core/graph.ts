import type { ClickBehavior } from "./config";
import { makeRng } from "./rng";

export const GRAPH_MODES = ["hubBurst", "geoSphere", "burstSphereMorph", "coneTorusMorph"] as const;
export type GraphMode = (typeof GRAPH_MODES)[number];

export interface GraphConfig {
  seed: number;
  count: number;
  sizeMin: number;
  sizeMax: number;
  mode: GraphMode;
  morphSpeed: number;
  idleRotationSpeed: number;
  idleTiltAmount: number;
  hoverRadius: number;
  hoverStrength: number;
  clickBehavior: ClickBehavior;
  background: string;
  color: string;
  lineColor: string;
}

export const defaultGraphConfig: GraphConfig = {
  seed: 4321,
  count: 140,
  sizeMin: 4,
  sizeMax: 14,
  mode: "hubBurst",
  morphSpeed: 0.4,
  idleRotationSpeed: 0.08,
  idleTiltAmount: 0.35,
  hoverRadius: 140,
  hoverStrength: 1,
  clickBehavior: "burst",
  background: "#050505",
  color: "#e8e8e8",
  lineColor: "#e8e8e8",
};

interface Layout {
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  weight: Float32Array;
  edges: [number, number][];
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

function buildBaseLayout(mode: "hubBurst" | "geoSphere" | "cone" | "torus", n: number, seed: number): Layout {
  switch (mode) {
    case "hubBurst":
      return buildHubBurst(n, seed);
    case "geoSphere":
      return buildGeoSphere(n, seed);
    case "cone":
      return buildCone(n, seed);
    case "torus":
      return buildTorus(n, seed);
  }
}

// Node positions live in flat typed arrays (same convention as
// ParticleSystem). Layouts are generated once in unit space (~-1..1) by a
// builder above, then rotated + projected to screen space every frame; the
// two morph modes cross-fade between two layouts' positions AND edge sets
// (rather than recomputing topology each frame) using a ping-pong sine.
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
  edgesA: [number, number][] = [];
  edgesB: [number, number][] = [];
  edgeAlphaA = 1;
  edgeAlphaB = 0;
  time = 0;

  private layoutA!: Layout;
  private layoutB: Layout | null = null;
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

    switch (cfg.mode) {
      case "hubBurst":
        this.layoutA = buildBaseLayout("hubBurst", n, cfg.seed);
        this.layoutB = null;
        break;
      case "geoSphere":
        this.layoutA = buildBaseLayout("geoSphere", n, cfg.seed);
        this.layoutB = null;
        break;
      case "burstSphereMorph":
        this.layoutA = buildBaseLayout("hubBurst", n, cfg.seed);
        this.layoutB = buildBaseLayout("geoSphere", n, cfg.seed + 1);
        break;
      case "coneTorusMorph":
        this.layoutA = buildBaseLayout("cone", n, cfg.seed);
        this.layoutB = buildBaseLayout("torus", n, cfg.seed + 1);
        break;
    }

    this.offX = new Float32Array(n);
    this.offY = new Float32Array(n);
    this.offVX = new Float32Array(n);
    this.offVY = new Float32Array(n);
    this.size = new Float32Array(n);
    this.opacity = new Float32Array(n);
    this.screenX = new Float32Array(n);
    this.screenY = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const wgt = this.layoutA.weight[i];
      this.size[i] = cfg.sizeMin + wgt * (cfg.sizeMax - cfg.sizeMin);
      this.opacity[i] = 0.45 + wgt * 0.55;
    }
    this.edgesA = this.layoutA.edges;
    this.edgesB = this.layoutB?.edges ?? [];
    this.update(0, w, h);
  }

  update(dt: number, w: number, h: number) {
    const cfg = this.cfg;
    this.time += dt;
    this.rot += dt * cfg.idleRotationSpeed;
    const n = this.count;
    const A = this.layoutA;
    const B = this.layoutB;
    const morphT = B ? 0.5 + 0.5 * Math.sin(this.time * cfg.morphSpeed) : 0;
    this.edgeAlphaA = B ? 1 - morphT : 1;
    this.edgeAlphaB = B ? morphT : 0;

    const cx = w / 2;
    const cy = h / 2;
    const scale = Math.min(w, h) * 0.32;
    const cosR = Math.cos(this.rot);
    const sinR = Math.sin(this.rot);
    // slow nodding tilt (around X) layered on top of the constant Y-axis
    // spin — the combination sweeps the camera through varied angles
    // instead of a flat, always-equatorial view.
    const tiltAngle = Math.sin(this.time * cfg.idleRotationSpeed * 0.6) * cfg.idleTiltAmount;
    const cosT = Math.cos(tiltAngle);
    const sinT = Math.sin(tiltAngle);
    const k = 60;
    const damp = 8;

    for (let i = 0; i < n; i++) {
      let x = A.x[i];
      let y = A.y[i];
      let z = A.z[i];
      if (B) {
        x += (B.x[i] - x) * morphT;
        y += (B.y[i] - y) * morphT;
        z += (B.z[i] - z) * morphT;
      }
      const rx = x * cosR + z * sinR;
      const rz = -x * sinR + z * cosR;
      const ry = y * cosT - rz * sinT;
      this.screenX[i] = cx + rx * scale;
      this.screenY[i] = cy + ry * scale;

      const ax = -k * this.offX[i] - damp * this.offVX[i];
      const ay = -k * this.offY[i] - damp * this.offVY[i];
      this.offVX[i] += ax * dt;
      this.offVY[i] += ay * dt;
      this.offX[i] += this.offVX[i] * dt;
      this.offY[i] += this.offVY[i] * dt;
    }
  }

  reroll() {
    this.cfg.seed = Math.floor(Math.random() * 1e9);
    this.rebuild();
  }
}

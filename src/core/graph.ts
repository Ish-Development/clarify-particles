import type { GraphConfig } from "./graphConfig";
import { makeRng } from "./rng";

export { GRAPH_MODES, defaultGraphConfig } from "./graphConfig";
export type { GraphConfig, GraphMode } from "./graphConfig";

interface Layout {
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  weight: Float32Array;
  edges: [number, number][];
  // optional per-edge alpha multiplier (default 1)
  edgeWeight?: Float32Array;
  // edges before this index are hub spokes (network shapes); the rest are
  // the mesh that pulses, paths and ripples travel along
  meshFrom?: number;
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
// The "network style" shared by constellation, clusters and spiral: any
// shape layout blended with a hub burst. Node 0 is the hub; every shape here
// puts its node 0 at the top pole (0, 1, 0), so the hub — and the fan of
// spokes into it — sits in the same place for all of them.
// `mix` = how strictly nodes follow the shape (vs the random burst disc);
// `spokes` = fan line strength, kept independent so every network shape has
// the same fan however strict its silhouette.
function networkOf(b: Layout, n: number, seed: number, mix: number, spokes = 1 - mix): Layout {
  const a = buildHubBurst(n, seed);
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const z = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = a.x[i] + (b.x[i] - a.x[i]) * mix;
    y[i] = a.y[i] + (b.y[i] - a.y[i]) * mix;
    z[i] = a.z[i] + (b.z[i] - a.z[i]) * mix;
  }
  spaceOut(x, y, z);
  const edges = [...a.edges, ...b.edges];
  const edgeWeight = new Float32Array(edges.length);
  edgeWeight.fill(spokes, 0, a.edges.length);
  edgeWeight.fill(1 - spokes, a.edges.length);
  return { x, y, z, weight: a.weight, edges, edgeWeight, meshFrom: a.edges.length };
}

// Minimum spacing: nodes closer than ~80% of the even spacing for this many
// nodes on a sphere are pushed apart over a few passes, each node keeping
// its distance from the center (so the round silhouette is unchanged).
// Node 0, the hub, stays put. O(n^2) per pass, once per rebuild.
function spaceOut(x: Float32Array, y: Float32Array, z: Float32Array) {
  const n = x.length;
  const minD = 0.8 * Math.sqrt((4 * Math.PI) / Math.max(1, n));
  const min2 = minD * minD;
  const radius = new Float32Array(n);
  for (let i = 0; i < n; i++) radius[i] = Math.hypot(x[i], y[i], z[i]);
  for (let pass = 0; pass < 12; pass++) {
    let moved = false;
    for (let i = 1; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = x[j] - x[i];
        const dy = y[j] - y[i];
        const dz = z[j] - z[i];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= min2) continue;
        const d = Math.sqrt(d2) || 1e-4;
        const push = (minD - d) / 2 / d;
        x[i] -= dx * push;
        y[i] -= dy * push;
        z[i] -= dz * push;
        x[j] += dx * push;
        y[j] += dy * push;
        z[j] += dz * push;
        moved = true;
      }
    }
    for (let i = 1; i < n; i++) {
      const r = Math.hypot(x[i], y[i], z[i]) || 1;
      const k = radius[i] / r;
      x[i] *= k;
      y[i] *= k;
      z[i] *= k;
    }
    if (!moved) break;
  }
}

function buildConstellation(n: number, seed: number, mix: number): Layout {
  return networkOf(buildGeoSphere(n, seed + 1), n, seed, mix);
}

// Communities: nodes gather into clumps spread over the sphere (dense
// links inside each clump, a few bridges between neighboring clumps).
function buildClusters(n: number, seed: number): Layout {
  const rng = makeRng(seed);
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const z = new Float32Array(n);
  const weight = new Float32Array(n);
  const K = 8;
  const GOLDEN_ANGLE = 2.39996322972865332;
  const centers: number[][] = [];
  for (let k = 0; k < K; k++) {
    const cy = 1 - ((k + 0.5) / K) * 2;
    const r = Math.sqrt(1 - cy * cy);
    centers.push([Math.cos(k * GOLDEN_ANGLE) * r, cy, Math.sin(k * GOLDEN_ANGLE) * r]);
  }
  const member: number[][] = centers.map(() => []);
  y[0] = 1; // the hub pole
  weight[0] = rng.next();
  const gauss = () => (rng.next() + rng.next() + rng.next() - 1.5) * 0.3;
  for (let i = 1; i < n; i++) {
    const k = i % K;
    const c = centers[k];
    const px = c[0] + gauss();
    const py = c[1] + gauss();
    const pz = c[2] + gauss();
    const len = Math.hypot(px, py, pz) || 1;
    const r = 0.88 + rng.next() * 0.12;
    x[i] = (px / len) * r;
    y[i] = (py / len) * r;
    z[i] = (pz / len) * r;
    weight[i] = rng.next();
    member[k].push(i);
  }
  const edges = nearestNeighborEdges(x, y, z, 3);
  // bridges: each clump links to its two nearest neighboring clumps
  for (let k = 0; k < K; k++) {
    const others = centers
      .map((c, j) => ({ j, d: Math.hypot(c[0] - centers[k][0], c[1] - centers[k][1], c[2] - centers[k][2]) }))
      .filter((o) => o.j !== k)
      .sort((p, q) => p.d - q.d)
      .slice(0, 2);
    for (const { j } of others) {
      for (let b = 0; b < 2; b++) {
        const a = member[k][Math.floor(rng.next() * member[k].length)];
        const c = member[j][Math.floor(rng.next() * member[j].length)];
        if (a !== undefined && c !== undefined) edges.push([Math.min(a, c), Math.max(a, c)]);
      }
    }
  }
  return { x, y, z, weight, edges };
}

// Spherical spiral (loxodrome) from pole to pole: linked along the spiral
// and across neighboring turns — an orderly vortex.
function buildSpiral(n: number, seed: number): Layout {
  const rng = makeRng(seed);
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const z = new Float32Array(n);
  const weight = new Float32Array(n);
  const turns = 4.5;
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1);
    const py = 1 - 2 * t; // i = 0 -> top pole (the hub)
    const r = Math.sqrt(Math.max(0, 1 - py * py));
    const a = t * turns * Math.PI * 2;
    x[i] = Math.cos(a) * r;
    y[i] = py;
    z[i] = Math.sin(a) * r;
    weight[i] = rng.next();
  }
  // the spiral itself, plus a sparse set of rungs to the next turn (every
  // third node) so the turns read as lines rather than a mesh
  const edges: [number, number][] = [];
  for (let i = 0; i + 1 < n; i++) edges.push([i, i + 1]);
  const perTurn = n / turns;
  for (let i = 0; i < n; i += 3) {
    const j = Math.round(i + perTurn);
    if (j < n) edges.push([i, j]);
  }
  return { x, y, z, weight, edges };
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
  "clusters",
  "spiral",
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
    // stricter silhouettes than the constellation so they read as distinct
    // shapes, with the constellation's fan strength
    case "clusters":
      return networkOf(buildClusters(n, seed + 1), n, seed, 0.85, 1 - cfg.morphHold);
    case "spiral":
      return networkOf(buildSpiral(n, seed + 1), n, seed, 0.88, 1 - cfg.morphHold);
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
interface Pulse {
  a: number; // from node
  b: number; // to node
  t: number; // 0..1 along the edge (negative = waiting to start)
  hops: number; // mesh hops left before heading into the hub
  first: boolean; // fades in on its first edge
}

// Per-layout graph structure for the traveling effects.
interface Topology {
  adj: number[][]; // mesh adjacency (spokes excluded)
  parent: Int32Array; // next hop toward the hub (node 0) over the mesh, -1 = none
  network: boolean; // has hub spokes
}

function topology(l: Layout, n: number): Topology {
  const from = l.meshFrom ?? 0;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (let e = from; e < l.edges.length; e++) {
    const [a, b] = l.edges[e];
    adj[a].push(b);
    adj[b].push(a);
  }
  const parent = new Int32Array(n).fill(-1);
  const seen = new Uint8Array(n);
  const queue = [0];
  seen[0] = 1;
  for (let q = 0; q < queue.length; q++) {
    const u = queue[q];
    for (const v of adj[u]) {
      if (seen[v]) continue;
      seen[v] = 1;
      parent[v] = u;
      queue.push(v);
    }
  }
  return { adj, parent, network: from > 0 };
}

// Hop distances from `start` over the mesh (-1 = unreachable).
function hops(adj: number[][], start: number): Int16Array {
  const dist = new Int16Array(adj.length).fill(-1);
  const queue = [start];
  dist[start] = 0;
  for (let q = 0; q < queue.length; q++) {
    const u = queue[q];
    for (const v of adj[u]) {
      if (dist[v] >= 0) continue;
      dist[v] = dist[u] + 1;
      queue.push(v);
    }
  }
  return dist;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const MAX_PULSES = 64;
const MAX_PATH = 64;

// Node positions live in flat typed arrays (same convention as
// ParticleSystem). Layouts are generated once in unit space (~-1..1), then
// blended, rotated and projected to screen space every frame. Edges are
// never recomputed per frame: during a morph the outgoing layout's edges
// fade out while the incoming layout's fade in.
//   - single modes (hubBurst, geoSphere): one static layout
//   - the two legacy morph modes: sine ping-pong between two layouts
//   - "sequence": loop through cfg.sequence with hold + eased morph
// Optional effects (all off by default): traveling pulses, depth +
// parallax, hover path to the hub, "excite" (a site element hovered),
// click ripples and an entrance.
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
  // hover highlight per node, eased 0..1
  glow!: Float32Array;
  // what the renderer draws this frame (base size/opacity with depth,
  // highlights and entrance applied)
  renderSize!: Float32Array;
  renderAlpha!: Float32Array;
  // 0..1 highlight per node (hover glow, path, ripple) — edges between lit
  // nodes light up too
  light!: Float32Array;
  // depth dimming per node (1 = nearest)
  depthAlpha!: Float32Array;
  // multiplier on every line's opacity (entrance, excite)
  lineGain = 1;
  // [outgoing, incoming] edge sets for this frame
  layers: [EdgeLayer, EdgeLayer] = [
    { edges: [], weight: undefined, alpha: 1 },
    { edges: [], weight: undefined, alpha: 0 },
  ];
  // most edges any layout has — lets renderers size buffers once
  maxEdges = 0;
  time = 0;
  // bright line segments (pulse trails, hover path): ax, ay, bx, by,
  // alpha, taper (1 = fades toward a) per segment
  highlights = new Float32Array((MAX_PULSES + MAX_PATH) * 6);
  highlightCount = 0;
  // pulse heads: x, y, alpha
  pulseHeads = new Float32Array(MAX_PULSES * 3);
  pulseCount = 0;

  private layouts: Layout[] = [];
  private topo: Topology[] = [];
  // largest distance from the origin over every layout (for fit)
  private maxRadius = 1;
  private delay!: Float32Array;
  private rot = 0;
  private lastW: number;
  private lastH: number;
  private rng = makeRng(1);
  // pointer in canvas px (null = away); parallax target -1..1 over the section
  private pointer: { x: number; y: number } | null = null;
  private par = { x: 0, y: 0, tx: 0, ty: 0 };
  private excite = 0;
  private exciteTarget = 0;
  // own clock for the excite beat, restarted on each hover so every
  // "breath" starts from dim and swells
  private beatT = 0;
  private pulses: Pulse[] = [];
  private path: number[] = [];
  private pathNode = -1;
  private pathT = 0;
  private pathAlpha = 0;
  private ripple: { dist: Int16Array; t0: number } | null = null;
  // entrance: "wait" (hidden until startIntro), "play", "done"
  private intro: "wait" | "play" | "done" = "done";
  private introT = 0;
  private introDir!: Float32Array;
  private seqTime = 0;

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
    this.seqTime = 0;
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
    this.topo = this.layouts.map((l) => topology(l, n));
    this.maxEdges = Math.max(...this.layouts.map((l) => l.edges.length));
    // rotation preserves distance from the origin, and a blend of two points
    // is never farther out than the farther one — so this bounds every frame
    this.maxRadius = 1e-6;
    for (const l of this.layouts) {
      for (let i = 0; i < n; i++) this.maxRadius = Math.max(this.maxRadius, Math.hypot(l.x[i], l.y[i], l.z[i]));
    }

    this.rng = makeRng(cfg.seed ^ 0x5bd1e995);
    const rng = this.rng;
    this.delay = new Float32Array(n);
    this.introDir = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      this.delay[i] = rng.next();
      // entrance: fly in from the right / above / below — never from the
      // text side
      const a = (rng.next() - 0.5) * Math.PI * 1.2;
      this.introDir[i * 2] = Math.cos(a);
      this.introDir[i * 2 + 1] = Math.sin(a);
    }

    this.offX = new Float32Array(n);
    this.offY = new Float32Array(n);
    this.offVX = new Float32Array(n);
    this.offVY = new Float32Array(n);
    this.size = new Float32Array(n);
    this.opacity = new Float32Array(n);
    this.screenX = new Float32Array(n);
    this.screenY = new Float32Array(n);
    this.glow = new Float32Array(n);
    this.renderSize = new Float32Array(n);
    this.renderAlpha = new Float32Array(n);
    this.light = new Float32Array(n);
    this.depthAlpha = new Float32Array(n).fill(1);
    // node sizes follow the first layout's weights for the whole loop
    for (let i = 0; i < n; i++) {
      const raw = this.layouts[0].weight[i];
      const steps = Math.round(cfg.tiers);
      const wgt = steps > 1 ? Math.round(raw * (steps - 1)) / (steps - 1) : raw;
      this.size[i] = cfg.sizeMin + wgt * (cfg.sizeMax - cfg.sizeMin);
      this.opacity[i] = cfg.opacityMin + wgt * (cfg.opacityMax - cfg.opacityMin);
    }
    this.pulses = [];
    this.path = [];
    this.pathNode = -1;
    this.ripple = null;
    this.intro = cfg.intro > 0 ? "wait" : "done";
    this.introT = 0;
    this.update(0, w, h);
  }

  // --- inputs from the renderer ---

  setPointer(p: { x: number; y: number } | null) {
    this.pointer = p;
  }
  // pointer over the whole section, -1..1 (null = away): drives parallax
  setSectionPointer(p: { x: number; y: number } | null) {
    this.par.tx = p ? p.x : 0;
    this.par.ty = p ? p.y : 0;
  }
  setExcite(on: boolean) {
    if (on && this.exciteTarget === 0 && this.excite < 0.05) this.beatT = 0;
    this.exciteTarget = on ? 1 : 0;
  }
  // entrance: start (section scrolled into view) or skip (reduced motion)
  startIntro() {
    if (this.intro === "wait") {
      this.intro = "play";
      this.introT = 0;
    }
  }
  skipIntro() {
    this.intro = "done";
  }
  // light wave spreading hop by hop from the node nearest (px, py)
  rippleAt(px: number, py: number) {
    const i = this.nearest(px, py, Infinity);
    if (i < 0) return;
    const { from } = this.timeline();
    this.ripple = { dist: hops(this.topo[from].adj, i), t0: this.time };
  }

  private nearest(px: number, py: number, maxD: number) {
    let best = -1;
    let bd = maxD * maxD;
    for (let i = 0; i < this.count; i++) {
      const dx = this.screenX[i] + this.offX[i] - px;
      const dy = this.screenY[i] + this.offY[i] - py;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
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
    const time = Math.max(0, this.seqTime);
    const cycle = Math.floor(time / period);
    const local = time - cycle * period;
    const from = cycle % L;
    return { from, to: (from + 1) % L, t: local < hold ? 0 : (local - hold) / morph, staggered: true };
  }

  update(dt: number, w: number, h: number) {
    const cfg = this.cfg;
    const n = this.count;
    // the entrance holds the idle spin and the shape loop until it's done
    const waiting = this.intro === "wait";
    if (!waiting) {
      this.time += dt;
      if (this.intro === "done") this.seqTime += dt;
      this.rot += dt * cfg.idleRotationSpeed;
    }
    if (this.intro === "play") {
      this.introT += dt;
      if (this.introT >= cfg.intro) this.intro = "done";
    }
    const introP = this.intro === "play" ? clamp01(this.introT / Math.max(0.01, cfg.intro)) : 1;
    const easeK = (rate: number) => 1 - Math.exp(-dt * rate);
    this.excite += (this.exciteTarget - this.excite) * easeK(5);
    this.par.x += (this.par.tx - this.par.x) * easeK(2.5);
    this.par.y += (this.par.ty - this.par.y) * easeK(2.5);

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

    let cx = w * cfg.centerX;
    const cy = h * cfg.centerY;
    let scale = Math.min(w, h) * 0.32 * cfg.scale;
    if (cfg.fit) {
      // keep clear: padding + the largest dot (incl. 60% hover growth) +
      // room for the hover push
      const fitMargin = cfg.fitPadding + cfg.sizeMax * 1.6 + 20;
      const room = Math.max(1, Math.min(cx, w - cx, cy, h - cy) - fitMargin);
      scale = (room / this.maxRadius) * Math.min(1, cfg.scale);
    }
    // depth: perspective scales near nodes up to 1/(1 - 0.3 depth)
    const depth = clamp01(cfg.depth);
    const maxPersp = 1 / (1 - 0.3 * depth);
    const margin = cfg.fitPadding + cfg.sizeMax * 1.6 + 20;
    // left edge stays clear; top/right/bottom may bleed
    if (cfg.anchorLeft && !cfg.fit) cx = Math.max(cx, margin + this.maxRadius * scale * maxPersp);
    const R = this.maxRadius * scale;
    const scatter = staggered ? Math.max(0, cfg.morphScatter) : 0;
    if (scatter && blending) {
      // lines dim while the nodes are flung apart
      const dim = 1 - 0.85 * Math.sin(Math.PI * t);
      this.layers[0].alpha *= dim;
      this.layers[1].alpha *= dim;
    }
    const DEG = Math.PI / 180;
    // parallax: the network turns toward the pointer
    const yaw = this.rot + cfg.rotY * DEG + this.par.x * cfg.parallax;
    const cosR = Math.cos(yaw);
    const sinR = Math.sin(yaw);
    // slow nodding tilt (around X) layered on top of the constant Y-axis
    // spin — the combination sweeps the camera through varied angles
    // instead of a flat, always-equatorial view.
    const tiltAngle =
      Math.sin(this.time * cfg.idleRotationSpeed * 0.6) * cfg.idleTiltAmount + cfg.rotX * DEG - this.par.y * cfg.parallax;
    const cosT = Math.cos(tiltAngle);
    const sinT = Math.sin(tiltAngle);
    const cosZ = Math.cos(cfg.rotZ * DEG);
    const sinZ = Math.sin(cfg.rotZ * DEG);
    const k = 60;
    const damp = 8;
    const introS = 0.5;

    for (let i = 0; i < n; i++) {
      let x = A.x[i];
      let y = A.y[i];
      let z = A.z[i];
      let bell = 0;
      if (blending) {
        let ti = t;
        if (staggered) {
          ti = Math.min(1, Math.max(0, (t - this.delay[i] * s) / (1 - s || 1)));
          ti = easeInOutCubic(ti);
        }
        x += (B.x[i] - x) * ti;
        y += (B.y[i] - y) * ti;
        z += (B.z[i] - z) * ti;
        // peaks mid-morph for each node (bell over its own progress)
        bell = Math.sin(Math.PI * ti);
        if (staggered && (cfg.morphImplode || cfg.morphSwirl)) {
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
      // depth toward the viewer, -1 (far) .. 1 (near)
      const zn = (y * sinT + rz * cosT) / this.maxRadius;
      const persp = depth ? 1 / (1 - 0.3 * depth * zn) : 1;
      let sx = cx + (rx * cosZ - ry * sinZ) * scale * persp;
      let sy = cy + (rx * sinZ + ry * cosZ) * scale * persp;
      if (scatter && bell > 0) {
        // fling outward from the center, mirrored so nothing heads left
        const dx = sx - cx;
        const dy = sy - cy;
        const d = Math.hypot(dx, dy) || 1;
        const m = scatter * R * bell * (0.4 + this.delay[i]);
        sx += (Math.abs(dx) / d) * m;
        sy += (dy / d) * m;
      }
      // entrance: each node flies in from off to the right/top/bottom
      let introVis = 1;
      if (waiting) introVis = 0;
      else if (introP < 1) {
        const pi = easeInOutCubic(clamp01((introP * (1 + introS) - this.delay[i] * introS) / 1));
        const off = (1 - pi) * R * 1.4;
        sx += this.introDir[i * 2] * off;
        sy += this.introDir[i * 2 + 1] * off;
        introVis = pi;
      }
      this.screenX[i] = sx;
      this.screenY[i] = sy;
      this.depthAlpha[i] = 1 - depth * 0.5 * (1 - (zn + 1) / 2);
      this.renderSize[i] = this.size[i] * (1 + depth * 0.45 * zn);
      this.renderAlpha[i] = introVis; // finished below once highlights are known

      const ax = -k * this.offX[i] - damp * this.offVX[i];
      const ay = -k * this.offY[i] - damp * this.offVY[i];
      this.offVX[i] += ax * dt;
      this.offVY[i] += ay * dt;
      this.offX[i] += this.offVX[i] * dt;
      this.offY[i] += this.offVY[i] * dt;
    }

    // excite ("ready to activate"): a slow, steady breath of light through
    // the whole network, strongest at the hub
    this.beatT += dt;
    // exciteRate 0 = no breathing: just light up (eased on and off)
    const beat =
      cfg.exciteRate > 0 ? this.excite * (0.5 - 0.5 * Math.cos(this.beatT * Math.PI * 2 * cfg.exciteRate)) : this.excite;
    this.lineGain = (waiting ? 0 : introP * introP) * (1 + 1.2 * beat);
    // during a sequence hold `blending` is true with t = 0 — only an actual
    // transition in progress counts as morphing
    this.updateHighlights(dt, blending && t > 0, from);

    // final node size/alpha: base * depth, plus highlight and excite boosts
    for (let i = 0; i < n; i++) {
      const lit = Math.max(this.light[i], i === 0 ? beat : 0);
      this.renderSize[i] *= 1 + 0.6 * lit + (i === 0 ? 1.2 * beat : 0);
      this.renderAlpha[i] *= Math.min(1, (this.opacity[i] + 0.6 * lit + 0.35 * beat) * this.depthAlpha[i]);
    }
  }

  // Hover glow, hover path, ripple and pulses — everything that lights up
  // nodes or draws bright segments. Paused mid-morph (layouts in flux).
  private updateHighlights(dt: number, blending: boolean, from: number) {
    const cfg = this.cfg;
    const n = this.count;
    const topo = this.topo[from];
    const px = (i: number) => this.screenX[i] + this.offX[i];
    const py = (i: number) => this.screenY[i] + this.offY[i];
    const glowEase = 1 - Math.exp(-dt * 6);
    const hoverR = cfg.hoverRadius * 1.3;
    const p = this.pointer;
    const hg = cfg.hoverGlow;
    const ready = this.intro === "done" && !blending;

    // hover path: nearest node -> hub over the mesh, traced segment by segment
    if (cfg.hoverPath && p && ready) {
      const node = this.nearest(p.x, p.y, hoverR);
      if (node !== this.pathNode) {
        this.pathNode = node;
        this.path = [];
        this.pathT = 0;
        for (let v = node; v >= 0 && this.path.length < MAX_PATH; v = topo.parent[v]) {
          this.path.push(v);
          if (v === 0) break;
        }
        if (this.path[this.path.length - 1] !== 0) this.path = [];
      }
    } else if (!p || !ready) {
      this.pathNode = -1;
    }
    this.pathT += dt;
    const pathOn = this.pathNode >= 0 && this.path.length > 1;
    this.pathAlpha += ((pathOn ? 1 : 0) - this.pathAlpha) * (1 - Math.exp(-dt * 5));
    const pathProgress = this.pathT * 7; // segments per second
    const onPath = new Uint8Array(n);
    if (this.pathAlpha > 0.01) {
      for (let k = 0; k < this.path.length; k++) if (pathProgress >= k) onPath[this.path[k]] = 1;
    }

    // ripple: a ring of light moving outward rippleSpeed hops/s; it lives
    // long enough to cross ~24 hops at any speed, fading as it goes
    let rippleR = -1;
    let rippleFade = 0;
    if (this.ripple) {
      const speed = Math.max(0.5, cfg.rippleSpeed);
      const life = 24.5 / speed;
      const age = this.time - this.ripple.t0;
      if (age > life || blending) this.ripple = null;
      else {
        rippleR = age * speed;
        rippleFade = 1 - age / life;
      }
    }

    for (let i = 0; i < n; i++) {
      let target = 0;
      if (p && hg > 0) {
        const dx = px(i) - p.x;
        const dy = py(i) - p.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < hoverR) {
          const f = 1 - d / hoverR;
          target = f * f * (3 - 2 * f) * hg;
        }
      }
      if (onPath[i]) target = Math.max(target, this.pathAlpha);
      this.glow[i] += (target - this.glow[i]) * glowEase;
      let lit = this.glow[i];
      if (this.ripple && this.ripple.dist[i] >= 0) {
        const dd = this.ripple.dist[i] - rippleR;
        lit = Math.max(lit, Math.exp(-(dd * dd) / 0.8) * rippleFade);
      }
      this.light[i] = lit;
    }

    // --- bright segments: hover path, then pulse trails ---
    const hl = this.highlights;
    let h = 0;
    const seg = (ax: number, ay: number, bx: number, by: number, alpha: number, taper: number) => {
      const o = h * 6;
      hl[o] = ax;
      hl[o + 1] = ay;
      hl[o + 2] = bx;
      hl[o + 3] = by;
      hl[o + 4] = alpha;
      hl[o + 5] = taper;
      h++;
    };
    if (this.pathAlpha > 0.01) {
      for (let k = 0; k + 1 < this.path.length && h < MAX_PATH; k++) {
        const f = clamp01(pathProgress - k);
        if (f <= 0) break;
        const a = this.path[k];
        const b = this.path[k + 1];
        seg(px(a), py(a), px(a) + (px(b) - px(a)) * f, py(a) + (py(b) - py(a)) * f, this.pathAlpha, 0);
      }
    }

    // pulses: walk a few mesh hops toward the hub, then ride a spoke into it
    const want = ready ? Math.min(MAX_PULSES, Math.round(cfg.pulses * (1 + this.excite))) : 0;
    if (!ready) this.pulses = [];
    while (this.pulses.length < want) this.pulses.push(this.spawnPulse(topo, true));
    if (this.pulses.length > want) this.pulses.length = want;
    const speed = cfg.pulseSpeed * (1 + this.excite);
    let pc = 0;
    for (let q = 0; q < this.pulses.length; q++) {
      let pu = this.pulses[q];
      const len = Math.max(20, Math.hypot(px(pu.b) - px(pu.a), py(pu.b) - py(pu.a)));
      pu.t += (dt * speed) / len;
      if (pu.t >= 1) {
        pu = this.pulses[q] = this.nextHop(pu, topo);
      }
      if (pu.t < 0) continue;
      const t = Math.min(1, pu.t);
      const ax = px(pu.a);
      const ay = py(pu.a);
      const hx = ax + (px(pu.b) - ax) * t;
      const hy = ay + (py(pu.b) - ay) * t;
      const L = Math.max(20, Math.hypot(px(pu.b) - ax, py(pu.b) - ay));
      const tail = Math.max(0, t - 46 / L);
      const alpha = pu.first ? Math.min(1, t * 5) : 1;
      if (h < MAX_PATH + MAX_PULSES) seg(ax + (px(pu.b) - ax) * tail, ay + (py(pu.b) - ay) * tail, hx, hy, alpha, 1);
      const o = pc * 3;
      this.pulseHeads[o] = hx;
      this.pulseHeads[o + 1] = hy;
      this.pulseHeads[o + 2] = alpha;
      pc++;
    }
    this.highlightCount = h;
    this.pulseCount = pc;
  }

  private spawnPulse(topo: Topology, stagger: boolean): Pulse {
    const n = this.count;
    const a = 1 + Math.floor(this.rng.next() * Math.max(1, n - 1));
    const par = topo.parent[a];
    const b = par >= 0 ? par : topo.network ? 0 : (topo.adj[a][0] ?? 0);
    return { a, b, t: stagger ? -this.rng.next() * 2 : 0, hops: 1 + Math.floor(this.rng.next() * 4), first: true };
  }

  private nextHop(pu: Pulse, topo: Topology): Pulse {
    const at = pu.b;
    if (at === 0) return this.spawnPulse(topo, false);
    const par = topo.parent[at];
    if (pu.hops > 0 && par >= 0) return { a: at, b: par, t: 0, hops: pu.hops - 1, first: false };
    if (topo.network) return { a: at, b: 0, t: 0, hops: 0, first: false };
    return this.spawnPulse(topo, false);
  }

  debug() {
    return { intro: this.intro, activePulses: this.pulses.length, excite: +this.excite.toFixed(2) };
  }

  reroll() {
    this.cfg.seed = Math.floor(Math.random() * 1e9);
    this.rebuild();
  }
}

// Line models for brand assets: networks of nodes and lines in the
// Integrations scene (blocks-scene.ts: isometric, see-through, the far side
// dimmer, a bolt branching through), but built from structures other than
// boxes: globes, solids, lattices, surfaces. Registered with the blocks
// scene so `shapes` names them; lab only, nothing here ships.
// Procedural: each is built as it mounts, its counts scaled by the export
// lab's density dial and its dots by the dots dial (params.ts).
import { registerLineShape, type Net } from "../src/runtime/blocks-scene";
import { N, SHAPE, dotShown } from "./params";

const TAU = Math.PI * 2;
type P = [number, number, number];

// nodes (merged where they meet) and lines (once each); inner lines draw
// fainter, as the blocks' inside edges. A curve's points are nodes too, but
// hidden (no dot): a dot only where one is shown (crossings, hubs, tips),
// more or fewer with the dots dial.
class Builder {
  readonly pos: number[][] = [];
  readonly lines: [number, number, boolean][] = [];
  private readonly ids = new Map<string, number>();
  private readonly seen = new Set<string>();
  private readonly shown = new Set<number>();
  private key(p: P) {
    return p.map((x) => Math.round(x * 1000)).join(",");
  }
  node(p: P, show = true) {
    const k = this.key(p);
    let id = this.ids.get(k);
    if (id === undefined) this.ids.set(k, (id = this.pos.push([...p]) - 1));
    if (show) this.shown.add(id);
    return id;
  }
  // show the dot on a node (at p, if there is one)
  mark(p: P) {
    const id = this.ids.get(this.key(p));
    if (id !== undefined) this.shown.add(id);
  }
  // a curve through the points, its dots hidden
  curve(ps: P[], outer = true, closed = false) {
    for (let i = 1; i < ps.length; i++) this.line(ps[i - 1], ps[i], outer, false);
    if (closed && ps.length > 2) this.line(ps[ps.length - 1], ps[0], outer, false);
  }
  line(a: P, b: P, outer = true, show = true) {
    const i = this.node(a, show);
    const j = this.node(b, show);
    const k = i < j ? `${i}-${j}` : `${j}-${i}`;
    if (i === j || this.seen.has(k)) return;
    this.seen.add(k);
    this.lines.push([i, j, outer]);
  }
  path(ps: P[], outer = true, closed = false) {
    for (let i = 1; i < ps.length; i++) this.line(ps[i - 1], ps[i], outer);
    if (closed && ps.length > 2) this.line(ps[ps.length - 1], ps[0], outer);
  }
  // centred in space; a node is outer if any outer line meets it
  done(): Net {
    const lo = [0, 1, 2].map((a) => Math.min(...this.pos.map((p) => p[a])));
    const hi = [0, 1, 2].map((a) => Math.max(...this.pos.map((p) => p[a])));
    const pos = this.pos.map((p) => p.map((x, a) => x - (lo[a] + hi[a]) / 2));
    const outer = new Array(pos.length).fill(false);
    for (const [a, b, o] of this.lines) if (o) outer[a] = outer[b] = true;
    return { pos, lines: this.lines, outer, hidden: pos.map((_, i) => !dotShown(i, this.shown.has(i))) };
  }
}
// a circle centred on c, in the plane of u and v (unit, square), n points
const circleAt = (n: number, r: number, c: P, u: P, v: P, a0 = 0, a1 = TAU, closed = a1 - a0 >= TAU - 1e-9): P[] =>
  Array.from({ length: closed ? n : n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [c[0] + (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * r, c[1] + (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * r, c[2] + (u[2] * Math.cos(a) + v[2] * Math.sin(a)) * r];
  });
const X: P = [1, 0, 0];
const Y: P = [0, 1, 0];
const Z: P = [0, 0, 1];
const O: P = [0, 0, 0];
const golden = 2.39996322972865332;
const fib = (i: number, n: number, r: number): P => {
  const y = 1 - (i / (n - 1)) * 2;
  const q = Math.sqrt(Math.max(0, 1 - y * y));
  return [Math.cos(i * golden) * q * r, y * r, Math.sin(i * golden) * q * r];
};
const ring = (n: number, r: number, y: number, phase = 0): P[] => Array.from({ length: n }, (_, i) => [Math.cos(phase + (i * TAU) / n) * r, y, Math.sin(phase + (i * TAU) / n) * r]);
// n values evenly between a and b, both ends out
const between = (n: number, a: number, b: number) => Array.from({ length: n }, (_, k) => a + ((b - a) * (k + 1)) / (n + 1));
const uniq = (xs: number[]) => [...new Set(xs.map((x) => Math.round(x * 1e6) / 1e6))].sort((p, q) => p - q);

// A sphere's latitudes (degrees) and meridians (this many great circles):
// every curve is sampled at the others' crossings too, so they meet exactly
// and each crossing gets a dot. With no meridians, `marks` dots per latitude.
function globe(b: Builder, R: number, lats: number[], meridians: number, marks = 12) {
  const at = (lat: number, lon: number): P => {
    const la = (lat * Math.PI) / 180;
    const lo = (lon * Math.PI) / 180;
    return [Math.cos(la) * Math.cos(lo) * R, Math.sin(la) * R, Math.cos(la) * Math.sin(lo) * R];
  };
  const lons = meridians > 0 ? Array.from({ length: meridians * 2 }, (_, m) => (m * 180) / meridians) : Array.from({ length: marks }, (_, m) => (m * 360) / marks);
  const fine = (a: number, z: number) => Array.from({ length: Math.round((z - a) / 5) }, (_, i) => a + i * 5);
  const lonSamples = uniq([...fine(0, 360), ...lons]);
  for (const lat of lats) b.curve(lonSamples.map((lon) => at(lat, lon)), true, true);
  for (let m = 0; m < meridians; m++) {
    const lon = lons[m];
    const far = lons[m + meridians];
    // over the north pole and down the far side: the whole great circle
    const ts = uniq([...fine(-90, 270), ...lats, ...lats.map((l) => 180 - l)]);
    b.curve(ts.map((t) => (t <= 90 ? at(t, lon) : at(180 - t, far))), true, true);
  }
  for (const lat of lats) for (const lon of lons) b.mark(at(lat, lon));
  if (meridians > 0) {
    b.mark(at(90, 0));
    b.mark(at(-90, 0));
  }
}
// a solid's edges (vertices, and the pairs `edge` apart), scaled
function solid(b: Builder, V: P[], edge: number, scale: number, outer = true) {
  const S = V.map((p): P => [p[0] * scale, p[1] * scale, p[2] * scale]);
  for (let i = 0; i < V.length; i++)
    for (let j = i + 1; j < V.length; j++) if (Math.abs(Math.hypot(V[i][0] - V[j][0], V[i][1] - V[j][1], V[i][2] - V[j][2]) - edge) < 1e-3) b.line(S[i], S[j], outer);
}
const PHI = (1 + Math.sqrt(5)) / 2;
const ICOSA: P[] = [[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]];
const OCTA: P[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const CUBE = (k: number): P[] => [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z): P => [x * k, y * k, z * k])));
const nearest = (pts: P[], i: number, k: number) =>
  pts
    .map((q, j) => ({ j, d: Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1], q[2] - pts[i][2]) }))
    .filter((o) => o.j !== i)
    .sort((x, y) => x.d - y.d)
    .slice(0, k)
    .map((o) => o.j);
// n things, each made from its index and the count
const make = <T>(n: number, f: (i: number, n: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i, n));
// nested copies, from the outer one in
const nest = (n: number, outer: number, inner: number) => Array.from({ length: n }, (_, i) => outer + ((inner - outer) * i) / Math.max(1, n - 1));

// name, label, the network, and settings for it (curves are many short
// lines: a bolt quicker per line keeps its pace)
const CURVY = { boltStep: 0.018 };
export const LINE_SHAPES: [string, string, () => Net, Record<string, unknown>?][] = [
  // --- globes ---
  // latitudes and longitudes, a dot on each crossing
  ["globe", "Line globe", () => {
    const b = new Builder();
    globe(b, 1.5, between(N(11), -90, 90), N(12));
    return b.done();
  }, CURVY],
  // the latitudes only, marked at even longitudes
  ["parallels", "Line parallels", () => {
    const b = new Builder();
    globe(b, 1.5, between(N(23), -90, 90), 0, N(12));
    return b.done();
  }, CURVY],
  // many meridians tied by a few latitudes
  ["meridians", "Line meridians", () => {
    const b = new Builder();
    globe(b, 1.5, between(N(5, 1), -90, 90), N(24));
    return b.done();
  }, CURVY],
  // the sphere cut by planes both ways, a circle in each
  ["slices", "Line slices", () => {
    const b = new Builder();
    for (const c of between(N(12), -1.5, 1.5)) {
      const r = Math.sqrt(1.5 * 1.5 - c * c);
      b.curve(circleAt(72, r, [c, 0, 0], Z, Y), true, true);
      b.curve(circleAt(72, r, [0, 0, c], X, Y), false, true);
    }
    b.curve(circleAt(96, 1.5, O, X, Z), true, true);
    return b.done();
  }, CURVY],
  // great circles, every one tilted its own way
  ["armillary", "Line armillary", () => {
    const b = new Builder();
    const n = N(14);
    for (let i = 0; i < n; i++) {
      const nrm = fib(i, n * 2, 1);
      const ref: P = Math.abs(nrm[1]) < 0.9 ? Y : X;
      let u: P = [nrm[1] * ref[2] - nrm[2] * ref[1], nrm[2] * ref[0] - nrm[0] * ref[2], nrm[0] * ref[1] - nrm[1] * ref[0]];
      const ul = Math.hypot(...u);
      u = [u[0] / ul, u[1] / ul, u[2] / ul];
      const v: P = [nrm[1] * u[2] - nrm[2] * u[1], nrm[2] * u[0] - nrm[0] * u[2], nrm[0] * u[1] - nrm[1] * u[0]];
      const pts = circleAt(96, 1.5, O, u, v);
      b.curve(pts, true, true);
      b.mark(pts[0]);
      b.mark(pts[48]);
    }
    return b.done();
  }, CURVY],
  // an even shell of nodes, each tied to its five nearest
  ["meshSphere", "Line mesh sphere", () => {
    const b = new Builder();
    const shell = make(N(320, 12), (i, n) => fib(i, n, 1.5));
    shell.forEach((p, i) => nearest(shell, i, 5).forEach((j) => b.line(p, shell[j])));
    return b.done();
  }],
  // a geodesic sphere: the icosahedron's faces split, pushed onto the sphere
  ["geodesic", "Line geodesic", () => {
    const b = new Builder();
    const unit = (p: P): P => {
      const r = Math.hypot(...p);
      return [(p[0] / r) * 1.5, (p[1] / r) * 1.5, (p[2] / r) * 1.5];
    };
    const near = (a: P, c: P) => Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]) < 2.1;
    const F = N(4, 1);
    for (let i = 0; i < 12; i++)
      for (let j = i + 1; j < 12; j++)
        for (let k = j + 1; k < 12; k++) {
          const [a, c, d] = [ICOSA[i], ICOSA[j], ICOSA[k]];
          if (!near(a, c) || !near(c, d) || !near(a, d)) continue;
          const at = (u: number, v: number): P => unit([0, 1, 2].map((q) => a[q] + ((c[q] - a[q]) * u) / F + ((d[q] - a[q]) * v) / F) as P);
          for (let u = 0; u < F; u++)
            for (let v = 0; u + v < F; v++) {
              b.line(at(u, v), at(u + 1, v));
              b.line(at(u, v), at(u, v + 1));
              b.line(at(u + 1, v), at(u, v + 1));
            }
        }
    return b.done();
  }],
  // --- radial ---
  // spokes from a hub out every way, a dot on each tip
  ["burst", "Line burst", () => {
    const b = new Builder();
    const n = N(260, 8);
    for (let i = 0; i < n; i++) b.line([0, 0, 0], fib(i, n, 1.5), i % 3 === 0);
    return b.done();
  }],
  // a hub tied to a shell of nodes, each tied to its four nearest
  ["star", "Line star", () => {
    const b = new Builder();
    const shell = make(N(110, 8), (i, n) => fib(i, n, 1.4));
    shell.forEach((p) => b.line([0, 0, 0], p, false));
    shell.forEach((p, i) => nearest(shell, i, 4).forEach((j) => b.line(p, shell[j])));
    return b.done();
  }],
  // --- round ---
  // a torus: rings round the tube and lines along it
  ["wireTorus", "Line torus", () => {
    const b = new Builder();
    const U = N(40, 6);
    const V = N(18, 4);
    const at = (i: number, j: number): P => {
      const u = (i * TAU) / U;
      const v = (j * TAU) / V;
      const r = 1.1 + 0.42 * Math.cos(v);
      return [Math.cos(u) * r, 0.42 * Math.sin(v), Math.sin(u) * r];
    };
    for (let i = 0; i < U; i++)
      for (let j = 0; j < V; j++) {
        b.line(at(i, j), at(i, (j + 1) % V));
        b.line(at(i, j), at((i + 1) % U, j), j % 2 === 0);
      }
    return b.done();
  }],
  // a torus as rings round its tube, one ring round the middle
  ["ringTorus", "Line ring torus", () => {
    const b = new Builder();
    const n = N(52, 6);
    for (let i = 0; i < n; i++) {
      const a = (i * TAU) / n;
      const radial: P = [Math.cos(a), 0, Math.sin(a)];
      b.curve(circleAt(24, 0.42, [radial[0] * 1.1, 0, radial[2] * 1.1], radial, Y), true, true);
    }
    b.curve(circleAt(56, 1.52, O, X, Z), false, true);
    return b.done();
  }, CURVY],
  // a hyperboloid: both families of straight lines between two rings
  ["hyperboloid", "Line hyperboloid", () => {
    const b = new Builder();
    const n = N(60, 8);
    const top = circleAt(n, 1, [0, 1.3, 0], X, Z);
    const bot = circleAt(n, 1, [0, -1.3, 0], X, Z, (TAU * 2) / 5, (TAU * 2) / 5 + TAU);
    const bot2 = circleAt(n, 1, [0, -1.3, 0], X, Z, -(TAU * 2) / 5, -(TAU * 2) / 5 + TAU);
    b.path(top, true, true);
    b.path(bot, true, true);
    top.forEach((p, i) => {
      b.line(p, bot[i]);
      b.line(p, bot2[i], false);
    });
    return b.done();
  }],
  // a cylinder of crossing helices, a ring top and bottom
  ["latticeTube", "Line lattice tube", () => {
    const b = new Builder();
    const n = N(28, 4);
    const H = 2.6;
    const at = (a: number, y: number): P => [Math.cos(a) * 0.9, y, Math.sin(a) * 0.9];
    for (const dir of [1, -1])
      for (let k = 0; k < n; k++) {
        const pts = Array.from({ length: 41 }, (_, i) => at((k * TAU) / n + dir * (i / 40) * Math.PI, (i / 40) * H));
        b.curve(pts, dir > 0);
        b.mark(pts[0]);
        b.mark(pts[40]);
      }
    b.curve(circleAt(56, 0.9, O, X, Z), true, true);
    b.curve(circleAt(56, 0.9, [0, H, 0], X, Z), true, true);
    return b.done();
  }, CURVY],
  // a (p, 3) torus knot: one line wound round a torus, more turns denser
  ["torusKnot", "Line torus knot", () => {
    const b = new Builder();
    let p = N(7, 2);
    if (p % 3 === 0) p++;
    const q = 3;
    const n = 130 * p;
    const pts = Array.from({ length: n }, (_, i): P => {
      const t = (i * TAU) / n;
      const r = 1.05 + 0.42 * Math.cos(p * t);
      return [Math.cos(q * t) * r, 0.42 * Math.sin(p * t), Math.sin(q * t) * r];
    });
    b.curve(pts, true, true);
    for (let i = 0; i < n; i += 75) b.mark(pts[i]);
    return b.done();
  }, { boltStep: 0.006 }],
  // a coil: a spring wound tight, four straight lines down its side
  ["coil", "Line coil", () => {
    const b = new Builder();
    const turns = N(22, 3);
    const H = 2.6;
    const n = turns * 48;
    const pts = Array.from({ length: n + 1 }, (_, i): P => {
      const a = (i * TAU) / 48;
      return [Math.cos(a) * 0.85, (i / n) * H, Math.sin(a) * 0.85];
    });
    b.curve(pts);
    for (let k = 0; k < 4; k++) {
      const a = (k * TAU) / 4;
      b.line([Math.cos(a) * 0.85, 0, Math.sin(a) * 0.85], [Math.cos(a) * 0.85, H, Math.sin(a) * 0.85], false);
    }
    for (let i = 0; i <= n; i += 12) b.mark(pts[i]);
    return b.done();
  }, { boltStep: 0.006 }],
  // a cone: rings up it to the apex, lines from the base to the tip
  ["cone", "Line cone", () => {
    const b = new Builder();
    const H = 2.6;
    const lines = N(48, 6);
    const rings = make(N(8, 2), (i, n) => i / n);
    for (const k of rings) b.curve(circleAt(lines, 1.3 * (1 - k), [0, k * H, 0], X, Z), true, true);
    for (let i = 0; i < lines; i++) {
      const a = (i * TAU) / lines;
      b.line([Math.cos(a) * 1.3, 0, Math.sin(a) * 1.3], [0, H, 0], i % 2 === 0);
      for (const k of rings) i % 2 === 0 && b.mark([Math.cos(a) * 1.3 * (1 - k), k * H, Math.sin(a) * 1.3 * (1 - k)]);
    }
    return b.done();
  }],
  // a drum: rings and staves round a cylinder, hubs and spokes at the ends
  ["drum", "Line drum", () => {
    const b = new Builder();
    const n = N(36, 6);
    const levels = make(N(9), (j, n) => (j * 1.76) / (n - 1));
    const top = levels[levels.length - 1];
    for (const y of levels) b.path(ring(n, 1.1, y), true, true);
    for (let j = 0; j < levels.length - 1; j++) ring(n, 1.1, levels[j]).forEach((p, i) => b.line(p, ring(n, 1.1, levels[j + 1])[i]));
    for (const y of [0, top]) ring(n, 1.1, y).forEach((p) => b.line([0, y, 0], p, false));
    return b.done();
  }],
  // a hexagonal column, every face crossed, a thinner one inside
  ["hexPrism", "Line hex column", () => {
    const b = new Builder();
    const L = N(12);
    for (const [r, o] of [[0.8, true], [0.42, false]] as const) {
      for (let j = 0; j <= L; j++) b.path(ring(6, r, (j * 2.88) / L), o, true);
      for (let j = 0; j < L; j++) {
        const lo = ring(6, r, (j * 2.88) / L);
        const hi = ring(6, r, ((j + 1) * 2.88) / L);
        lo.forEach((p, i) => {
          b.line(p, hi[i], o);
          b.line(p, hi[(i + 1) % 6], false);
          b.line(hi[i], lo[(i + 1) % 6], false);
        });
      }
    }
    return b.done();
  }],
  // a twist: rails winding up a column, rungs between neighbours
  ["twist", "Line twist", () => {
    const b = new Builder();
    const n = 40;
    const R = N(12, 3);
    const at = (i: number, k: number): P => {
      const a = (i / n) * Math.PI * 1.4 + (k * TAU) / R;
      const r = 0.75 + 0.25 * Math.cos((i / n) * TAU);
      return [Math.cos(a) * r, i * 0.07, Math.sin(a) * r];
    };
    for (let k = 0; k < R; k++)
      for (let i = 0; i <= n; i++) {
        if (i < n) b.line(at(i, k), at(i + 1, k), true, false);
        if (i % 4 === 0) b.line(at(i, k), at(i, (k + 1) % R), false, true);
      }
    return b.done();
  }],
  // --- solids ---
  // icosahedra, one inside the next, corners tied through
  ["icosa", "Line icosahedron", () => {
    const b = new Builder();
    const ks = nest(N(4, 1), 0.8, 0.2);
    ks.forEach((k, i) => solid(b, ICOSA, 2, k, i === 0));
    const lo = ks[ks.length - 1];
    if (ks.length > 1) for (const p of ICOSA) b.line([p[0] * lo, p[1] * lo, p[2] * lo], [p[0] * 0.8, p[1] * 0.8, p[2] * 0.8], false);
    return b.done();
  }],
  // octahedra, one inside the next, corners tied through
  ["octa", "Line octahedron", () => {
    const b = new Builder();
    const ks = nest(N(6, 1), 1.6, 0.27);
    ks.forEach((k, i) => solid(b, OCTA, Math.SQRT2, k, i === 0));
    const lo = ks[ks.length - 1];
    if (ks.length > 1) for (const p of OCTA) b.line([p[0] * lo, p[1] * lo, p[2] * lo], [p[0] * 1.6, p[1] * 1.6, p[2] * 1.6], false);
    return b.done();
  }],
  // dodecahedra, one inside the next
  ["dodeca", "Line dodecahedron", () => {
    const b = new Builder();
    const g = 1 / PHI;
    const V: P[] = [...CUBE(1)];
    for (const a of [-1, 1])
      for (const c of [-1, 1]) {
        V.push([0, a * g, c * PHI]);
        V.push([a * g, c * PHI, 0]);
        V.push([a * PHI, 0, c * g]);
      }
    nest(N(3, 1), 0.9, 0.3).forEach((k, i) => solid(b, V, 2 * g, k, i === 0));
    return b.done();
  }],
  // a merkaba: two tetrahedra through each other, smaller ones inside
  ["merkaba", "Line merkaba", () => {
    const b = new Builder();
    const A: P[] = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
    const B: P[] = A.map(([x, y, z]): P => [-x, -y, -z]);
    nest(N(3, 1), 1.4, 0.5).forEach((k, i) => {
      solid(b, A, 2 * Math.SQRT2, k, i === 0);
      solid(b, B, 2 * Math.SQRT2, k, i === 0);
    });
    return b.done();
  }],
  // a Sierpinski tetrahedron: split into four corner tetrahedra, again and again
  ["sierpinski", "Line Sierpinski", () => {
    const b = new Builder();
    const s = 1.5;
    const T: P[] = [[s, s, s], [s, -s, -s], [-s, s, -s], [-s, -s, s]];
    const mid = (a: P, c: P): P => [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2];
    const split = (t: P[], depth: number) => {
      if (depth === 0) {
        for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) b.line(t[i], t[j]);
        return;
      }
      for (let i = 0; i < 4; i++) split(t.map((p) => mid(p, t[i])), depth - 1);
    };
    split(T, Math.max(1, Math.min(5, Math.round(3 + Math.log2(SHAPE.density)))));
    return b.done();
  }],
  // a cube, every face gridded
  ["cubeGrid", "Line cube grid", () => {
    const b = new Builder();
    const n = N(9);
    const S = 1.2;
    const c = (i: number) => -S + (2 * S * i) / n;
    for (let i = 0; i <= n; i++)
      for (const e of [-S, S]) {
        b.curve([[e, c(i), -S], [e, c(i), S]]);
        b.curve([[e, -S, c(i)], [e, S, c(i)]]);
        b.curve([[c(i), e, -S], [c(i), e, S]]);
        b.curve([[-S, e, c(i)], [S, e, c(i)]]);
        b.curve([[c(i), -S, e], [c(i), S, e]]);
        b.curve([[-S, c(i), e], [S, c(i), e]]);
      }
    for (const p of CUBE(S)) b.mark(p);
    return b.done();
  }],
  // a tesseract: cubes inside cubes, the outer and inner corners joined
  ["tesseract", "Line tesseract", () => {
    const b = new Builder();
    const sizes = nest(N(3), 1.5, 0.6);
    sizes.forEach((k, i) => solid(b, CUBE(1), 2, k, i === 0 || i === sizes.length - 1));
    const o = CUBE(sizes[0]);
    const n = CUBE(sizes[sizes.length - 1]);
    o.forEach((p, i) => b.line(p, n[i], false));
    return b.done();
  }],
  // cubes, each smaller and turned a little further
  ["cubeSpiral", "Line cube spiral", () => {
    const b = new Builder();
    const n = N(10, 2);
    for (let k = 0; k < n; k++) {
      const s = 1.3 * (1 - (k * 0.8) / n);
      const a = (k * Math.PI) / (2 * n);
      const V = CUBE(1).map(([x, y, z]): P => [x * Math.cos(a) - z * Math.sin(a), y, x * Math.sin(a) + z * Math.cos(a)]);
      solid(b, V, 2, s, k === 0);
    }
    return b.done();
  }],
  // an octet truss: a cube of tetrahedra and octahedra
  ["octet", "Line octet truss", () => {
    const b = new Builder();
    const n = 2 * N(3, 1); // half steps a side
    const s = 2.5 / n;
    const at = (i: number, j: number, k: number): P => [(i - n / 2) * s, (j - n / 2) * s, (k - n / 2) * s];
    for (let i = 0; i <= n; i++)
      for (let j = 0; j <= n; j++)
        for (let k = 0; k <= n; k++) {
          if ((i + j + k) % 2) continue;
          for (const [di, dj, dk] of [[1, 1, 0], [1, -1, 0], [1, 0, 1], [1, 0, -1], [0, 1, 1], [0, 1, -1]]) {
            const [a, c, d] = [i + di, j + dj, k + dk];
            if (a < 0 || c < 0 || d < 0 || a > n || c > n || d > n) continue;
            b.line(at(i, j, k), at(a, c, d), [i, j, k, a, c, d].some((x) => x === 0 || x === n));
          }
        }
    return b.done();
  }],
  // a square turned a little at each of its levels
  ["twistPrism", "Line twisted prism", () => {
    const b = new Builder();
    const L = N(16, 2);
    const sq = (j: number) => ring(4, 0.9, (j * 2.7) / L, (j * Math.PI) / (2.5 * L));
    for (let j = 0; j <= L; j++) b.path(sq(j), true, true);
    for (let j = 0; j < L; j++)
      sq(j).forEach((p, i) => {
        b.line(p, sq(j + 1)[i]);
        b.line(p, sq(j + 1)[(i + 1) % 4], false);
      });
    return b.done();
  }],
  // squares receding into the distance, each turned a little, corners joined
  ["tunnel", "Line tunnel", () => {
    const b = new Builder();
    const L = N(24, 3);
    const sq = (j: number) => ring(4, 1.2 * (1 - (j * 0.29) / L), 0, (j * Math.PI) / (2 * L)).map(([x, , z]): P => [x, z, (j * 2.9) / L]);
    for (let j = 0; j <= L; j++) b.path(sq(j), j % 4 === 0, true);
    for (let j = 0; j < L; j++) sq(j).forEach((p, i) => b.line(p, sq(j + 1)[i], true, j % 4 === 0));
    return b.done();
  }],
  // a pyramid: a ring each level, each face's lines up to the apex, a gridded base
  ["pyramidFrame", "Line pyramid", () => {
    const b = new Builder();
    const L = N(10);
    const H = 2.1;
    const at = (i: number, j: number): P => {
      const w = 1.2 * (1 - j / L);
      return [i & 1 ? w : -w, (j * H) / L, i & 2 ? w : -w];
    };
    const corners = [0, 1, 3, 2];
    for (let j = 0; j < L; j++) b.path(corners.map((c) => at(c, j)), true, true);
    for (let j = 0; j < L; j++) corners.forEach((c) => b.line(at(c, j), at(c, j + 1)));
    const G = N(10);
    for (let s = 1; s < G; s++) {
      const x = -1.2 + (s * 2.4) / G;
      for (const e of [-1.2, 1.2]) {
        b.line([x, 0, e], [0, H, 0], false);
        b.line([e, 0, x], [0, H, 0], false);
      }
      b.line([x, 0, -1.2], [x, 0, 1.2], false);
      b.line([-1.2, 0, x], [1.2, 0, x], false);
    }
    return b.done();
  }],
  // --- fields ---
  // layers: square grids stacked apart, joined at the corners (data in levels)
  ["layers", "Line layers", () => {
    const b = new Builder();
    const w = 1.1;
    const ys = make(N(6), (j, n) => (j * 2) / (n - 1));
    const G = N(8);
    const corner = (i: number, y: number): P => [i & 1 ? w : -w, y, i & 2 ? w : -w];
    for (const y of ys) {
      b.path([0, 1, 3, 2].map((c) => corner(c, y)), true, true);
      for (let s = 1; s < G; s++) {
        const x = -w + (s * 2 * w) / G;
        b.line([x, y, -w], [x, y, w], false);
        b.line([-w, y, x], [w, y, x], false);
      }
    }
    for (let i = 0; i < 4; i++) for (let j = 0; j < ys.length - 1; j++) b.line(corner(i, ys[j]), corner(i, ys[j + 1]));
    return b.done();
  }],
  // contours: rings stacked into a peak, each a little warped, as a map's
  ["contours", "Line contours", () => {
    const b = new Builder();
    const K = N(18);
    for (let k = 0; k < K; k++) {
      const f = 1 - k / K;
      const pts = Array.from({ length: 96 }, (_, i): P => {
        const a = (i * TAU) / 96;
        const r = 1.55 * Math.sqrt(f) * (1 + 0.13 * Math.sin(3 * a + k * (6.3 / K)) + 0.07 * Math.sin(5 * a - k * (3.6 / K)));
        return [Math.cos(a) * r, (k * 2) / K, Math.sin(a) * r];
      });
      b.curve(pts, true, true);
      for (let i = 0; i < 96; i += 24) b.mark(pts[(i + k * 5) % 96]);
    }
    return b.done();
  }, CURVY],
  // a gravity well: rings and spokes, sinking toward the middle
  ["well", "Line well", () => {
    const b = new Builder();
    const R = N(14);
    const S = N(40, 6);
    const at = (j: number, k: number): P => {
      const r = 0.12 + (1.48 * j) / R;
      const a = (k * TAU) / S;
      return [Math.cos(a) * r, -1.5 * Math.exp(-r * 2.2), Math.sin(a) * r];
    };
    for (let j = 0; j <= R; j++) b.curve(Array.from({ length: S }, (_, k) => at(j, k)), true, true);
    for (let k = 0; k < S; k++) b.curve(Array.from({ length: R + 1 }, (_, j) => at(j, k)), k % 2 === 0);
    for (let j = 0; j <= R; j += 2) for (let k = 0; k < S; k += 4) b.mark(at(j, k));
    return b.done();
  }, CURVY],
  // a rolling surface: a fine grid lifted in waves
  ["waveSurface", "Line wave surface", () => {
    const b = new Builder();
    const n = N(26, 4);
    const at = (i: number, k: number): P => {
      const x = -1.5 + (3 * i) / n;
      const z = -1.5 + (3 * k) / n;
      return [x, 0.28 * Math.sin(x * 2.2) + 0.22 * Math.cos(z * 2.6 + x), z];
    };
    for (let i = 0; i <= n; i++) {
      b.curve(Array.from({ length: n + 1 }, (_, k) => at(i, k)));
      b.curve(Array.from({ length: n + 1 }, (_, k) => at(k, i)), i % 2 === 0);
    }
    for (let i = 0; i <= n; i += 4) for (let k = 0; k <= n; k += 4) b.mark(at(i, k));
    return b.done();
  }, CURVY],
  // masts of different heights standing on a grid floor
  ["antennas", "Line masts", () => {
    const b = new Builder();
    const n = N(11);
    const s = 3 / n;
    // heights from a fixed hash: about half the crossings get a mast
    const H = (i: number, k: number) => {
      const h = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
      const f = h - Math.floor(h);
      return f < 0.5 ? 0 : Math.round(1 + (f - 0.5) * 10);
    };
    for (let i = 0; i <= n; i++)
      for (let k = 0; k <= n; k++) {
        if (i < n) b.line([i * s, 0, k * s], [(i + 1) * s, 0, k * s], false);
        if (k < n) b.line([i * s, 0, k * s], [i * s, 0, (k + 1) * s], false);
        for (let j = 0; j < H(i, k) * 2; j++) b.line([i * s, j * 0.22, k * s], [i * s, (j + 1) * 0.22, k * s]);
      }
    return b.done();
  }],
];

for (const [name, , make] of LINE_SHAPES) registerLineShape(name, make);

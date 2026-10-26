// More flat drawings for brand assets, in the Technical depth cards' language
// (glyph-scene.ts): the 435-unit Figma card, origin in the middle, y up;
// hairlines at the preset's lineOpacity (alpha 1 = as the rings), dots
// crisp, motion slow. Registered with the glyph scene so `kind` picks them;
// lab only, nothing here ships.
// Their motion is the site's: a bolt of light runs through the lines (bright
// at its head, a glow behind it, branching the quickest way to every node,
// as through the Integrations blocks), what it reaches flashes, and a small
// ring of light spreads from where it lands (the rings' meetings, the
// spider's footfalls); moving dots trail a glow.
import { drawingMaker, registerDrawing, type Drawing, type Pen } from "../src/runtime/glyph-scene";

const TAU = Math.PI * 2;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const wrap = (a: number) => ((a % TAU) + TAU) % TAU;
type Pt = [number, number];
const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);

// a circle (or an arc) in segments
function arc(pen: Pen, x: number, y: number, r: number, segs: number, alpha: (mid: number) => number, from = 0, to = TAU) {
  for (let s = 0; s < segs; s++) {
    const a0 = from + ((to - from) * s) / segs;
    const a1 = from + ((to - from) * (s + 1)) / segs;
    pen.line(x + Math.cos(a0) * r, y + Math.sin(a0) * r, x + Math.cos(a1) * r, y + Math.sin(a1) * r, alpha((a0 + a1) / 2));
  }
}
const lengthOf = (pts: Pt[]) => pts.reduce((s, p, i) => (i ? s + dist(pts[i - 1], p) : 0), 0);
function pointAt(pts: Pt[], d: number): Pt {
  for (let i = 1; i < pts.length; i++) {
    const len = dist(pts[i - 1], pts[i]);
    if (d <= len) {
      const k = len > 0 ? d / len : 0;
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k];
    }
    d -= len;
  }
  return pts[pts.length - 1];
}
// short segments, so light along a line can fade smoothly
function subdivide(pts: Pt[], step = 8): Pt[] {
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const n = Math.max(1, Math.ceil(dist(pts[i - 1], pts[i]) / step));
    for (let k = 1; k <= n; k++) out.push([pts[i - 1][0] + ((pts[i][0] - pts[i - 1][0]) * k) / n, pts[i - 1][1] + ((pts[i][1] - pts[i - 1][1]) * k) / n]);
  }
  return out;
}
// a cubic curve as points
function cubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, n: number): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const u = 1 - t;
    return [0, 1].map((k) => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]) as Pt;
  });
}

// A line with light on it: everywhere `base`; behind the head (units along
// from its start) `glow`, brightest at the head, as the blocks' bolt.
function litLine(pen: Pen, pts: Pt[], base: number, head = -1, glow = 0) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) {
    const len = dist(pts[i - 1], pts[i]);
    const mid = s + len / 2;
    const lit = head >= 0 && mid <= head ? glow * (0.45 + 0.55 * Math.exp(-(head - mid) / 28)) : 0;
    pen.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], base + lit);
    s += len;
  }
}

// The electricity's look, set from the export lab's Drawing panel:
// brightness, speed and afterglow, multipliers (1: as designed)
export const LOOK = { gain: 1, speed: 1, fade: 1, dotInner: 1, dotOuter: 1 };

// The bolt: from a seed node it takes the quickest way to every node it can
// reach (each line a little slower or quicker), so it branches; only the
// lines it reached a node by light up. Times in s since the strike.
type Edge = { a: number; b: number };
class Bolt {
  t = Infinity;
  // when the last node is reached, s after the strike
  private last = 0;
  private readonly hit: Float64Array;
  private readonly tin: Float64Array;
  private readonly tout: Float64Array;
  private readonly fromB: Uint8Array;
  private readonly adj: [number, number][][];
  constructor(
    n: number,
    readonly edges: Edge[],
    private readonly o: { speed: number; jitter: number; fade: number; gain: number; reach?: number },
  ) {
    this.hit = new Float64Array(n).fill(Infinity);
    this.tin = new Float64Array(edges.length).fill(Infinity);
    this.tout = new Float64Array(edges.length).fill(Infinity);
    this.fromB = new Uint8Array(edges.length);
    this.adj = Array.from({ length: n }, () => []);
    edges.forEach(({ a, b }, k) => {
      this.adj[a].push([b, k]);
      this.adj[b].push([a, k]);
    });
  }
  strike(seed: number, len: (k: number) => number) {
    const { speed, jitter } = this.o;
    const reach = this.o.reach ?? Infinity;
    this.hit.fill(Infinity);
    this.tin.fill(Infinity);
    this.tout.fill(Infinity);
    this.hit[seed] = 0;
    const done = new Uint8Array(this.hit.length);
    for (;;) {
      let u = -1;
      for (let i = 0; i < this.hit.length; i++) if (!done[i] && this.hit[i] < Infinity && (u < 0 || this.hit[i] < this.hit[u])) u = i;
      if (u < 0) break;
      done[u] = 1;
      for (const [v, k] of this.adj[u]) {
        const t = this.hit[u] + (len(k) / (speed * LOOK.speed)) * (1 - jitter / 2 + jitter * Math.random());
        if (t > reach || t >= this.hit[v]) continue;
        this.hit[v] = t;
        this.tin[k] = this.hit[u];
        this.tout[k] = t;
        this.fromB[k] = this.edges[k].b === u ? 1 : 0;
      }
    }
    this.edges.forEach((e, k) => {
      if (this.tout[k] === Infinity) return;
      const to = this.fromB[k] ? e.a : e.b;
      if (this.hit[to] !== this.tout[k]) this.tin[k] = this.tout[k] = Infinity;
    });
    this.last = Math.max(0, ...Array.from(this.hit).filter((h) => h < Infinity));
    this.t = 0;
  }
  // the bolt has reached everything it will, and its light has died down
  // (a strike never cuts one off midway)
  done() {
    return !(this.t < this.last + this.o.fade * LOOK.fade * 2.5);
  }
  // advances; the nodes it reached in this step
  step(dt: number): number[] {
    const before = this.t;
    this.t += dt;
    const out: number[] = [];
    this.hit.forEach((h, i) => {
      if (h > before && h <= this.t) out.push(i);
    });
    return out;
  }
  // edge k's points (from a to b) drawn with the bolt on them
  draw(pen: Pen, k: number, pts: Pt[], base: number) {
    if (!(this.t >= this.tin[k])) return litLine(pen, pts, base);
    const head = clamp01((this.t - this.tin[k]) / Math.max(1e-3, this.tout[k] - this.tin[k]));
    const glow = this.o.gain * LOOK.gain * Math.exp(-Math.max(0, this.t - this.tout[k]) / (this.o.fade * LOOK.fade));
    const p = this.fromB[k] ? [...pts].reverse() : pts;
    litLine(pen, p, base, head * lengthOf(p), glow);
  }
  flash(i: number) {
    return this.t >= this.hit[i] ? Math.min(1.5, LOOK.gain) * Math.exp(-(this.t - this.hit[i]) / (this.o.fade * LOOK.fade)) : 0;
  }
}

// small rings of light spreading from where something lands
const SPARK = { life: 0.7, size: 18, segs: 24 };
class Sparks {
  // `at`: where it is (a moving dot's spark goes with it)
  private list: { at: () => Pt; t: number }[] = [];
  constructor(readonly max: number) {}
  get lines() {
    return this.max * SPARK.segs;
  }
  add(p: Pt | (() => Pt)) {
    this.list.push({ at: typeof p === "function" ? p : () => p, t: 0 });
    if (this.list.length > this.max) this.list.shift();
  }
  step(dt: number) {
    for (const s of this.list) s.t += dt;
    this.list = this.list.filter((s) => s.t < SPARK.life);
  }
  draw(pen: Pen) {
    for (const s of this.list) {
      const [x, y] = s.at();
      const k = s.t / SPARK.life;
      const r = 3 + SPARK.size * (1 - (1 - k) ** 3);
      const a = 1.6 * (1 - k) ** 2;
      arc(pen, x, y, r, SPARK.segs, () => a);
      pen.dot(x, y, 3 + 4 * (1 - k), 1 - k);
    }
  }
}

// A drawing's connections, swapped for new ones every so often: the new
// set fades in as the old one fades out (FADE s), so a still can be paused
// on whichever wiring reads best.
const FADE = 1.2;
const fadeIn = (t: number) => {
  const p = clamp01(t / FADE);
  return p * p * (3 - 2 * p);
};

/* ORBIT: a core, three rings round it, riders on each (each trailing a
 * glow), linked inward ring by ring to the core, a chord across a ring
 * here and there; a ring of ticks outside. It all turns together, slowly,
 * as one figure, so the links hold. Every few s a bolt leaves the core and
 * branches out along the links; each rider it reaches flashes and sparks.
 * Every REWIRE bolts the links fade over to a new wiring. */
const ORBIT = { rings: [62, 108, 154], riders: [2, 3, 5], loop: 48, core: 11, rider: 6, ticks: 60, tickR: 182, segs: 120, trail: 0.8, every: 9, rewire: 2, chords: 0.3 };
type OrbitWiring = { links: Edge[]; bolt: Bolt; t: number };
class Orbit implements Drawing {
  readonly maxLines = ORBIT.rings.length * ORBIT.segs + 2 * 18 * 40 + 12 * SPARK.segs;
  readonly maxDots = 1 + 10 + ORBIT.ticks + 12;
  private t = 4;
  // the first bolt somewhere in the first rest, so a page of them doesn't flash at once
  private since = ORBIT.every * Math.random();
  private strikes = 0;
  private rewired = false;
  private wire: OrbitWiring;
  private old: Edge[] | null = null;
  private readonly sparks = new Sparks(12);
  // node 0: the core; then the riders, ring by ring
  private readonly ring: number[] = [-1];
  private readonly slot: number[] = [-1];
  constructor() {
    ORBIT.riders.forEach((n, k) => {
      for (let j = 0; j < n; j++) {
        this.ring.push(k);
        this.slot.push(j);
      }
    });
    this.wire = this.wiring(true);
    this.wire.t = FADE;
  }
  private angle(i: number) {
    const k = this.ring[i];
    const { riders, loop } = ORBIT;
    return k * 1.3 + (this.slot[i] * TAU) / riders[k] + (this.t * TAU) / loop;
  }
  private at(i: number): Pt {
    if (i === 0) return [0, 0];
    const r = ORBIT.rings[this.ring[i]];
    const a = this.angle(i);
    return [Math.cos(a) * r, Math.sin(a) * r];
  }
  // each rider to one a ring in (the first ring's to the core): the nearest,
  // or (a new wiring) the nearest or the next nearest; then a chord to the
  // next rider round now and then. The figure turns as one, so it holds.
  private wiring(nearest: boolean): OrbitWiring {
    const links: Edge[] = [];
    for (let i = 1; i < this.ring.length; i++) {
      const k = this.ring[i];
      let to = 0;
      if (k > 0) {
        const inner = this.ring.map((rk, j) => (rk === k - 1 ? j : -1)).filter((j) => j > 0);
        inner.sort((a, b) => dist(this.at(i), this.at(a)) - dist(this.at(i), this.at(b)));
        to = inner[!nearest && inner.length > 1 && Math.random() < 0.4 ? 1 : 0];
      }
      links.push({ a: to, b: i });
    }
    if (!nearest)
      for (let i = 1; i < this.ring.length; i++) {
        const k = this.ring[i];
        const n = ORBIT.riders[k];
        if (n < 3 || Math.random() >= ORBIT.chords) continue;
        const next = this.ring.findIndex((rk, j) => rk === k && this.slot[j] === (this.slot[i] + 1) % n);
        links.push({ a: i, b: next });
      }
    return { links, bolt: new Bolt(this.ring.length, links, { speed: 170, jitter: 0.4, fade: 0.7, gain: 1.8 }), t: 0 };
  }
  step(dt: number) {
    this.t += dt;
    this.since += dt;
    this.wire.t += dt;
    if (this.wire.t > FADE) this.old = null;
    this.sparks.step(dt);
    for (const i of this.wire.bolt.step(dt)) if (i > 0) this.sparks.add(() => this.at(i));
    if (this.since > ORBIT.every && this.wire.bolt.done()) {
      this.since = 0;
      if (this.strikes > 0 && this.strikes % ORBIT.rewire === 0 && !this.rewired) {
        // a new wiring, and the next bolt once it has faded in
        this.old = this.wire.links;
        this.wire = this.wiring(false);
        this.rewired = true;
        this.since = ORBIT.every - FADE - 0.3;
      } else {
        const links = this.wire.links;
        this.wire.bolt.strike(0, (k) => dist(this.at(links[k].a), this.at(links[k].b)));
        this.strikes++;
        this.rewired = false;
      }
    }
  }
  draw(pen: Pen) {
    const { rings, core, rider, ticks, tickR, segs, trail } = ORBIT;
    // the rings, a glow trailing each rider
    rings.forEach((r, k) => {
      const mine = this.ring.map((rk, i) => (rk === k ? i : -1)).filter((i) => i > 0);
      arc(pen, 0, 0, r, segs, (mid) => {
        let l = 0;
        for (const i of mine) {
          const back = wrap(this.angle(i) - mid);
          if (back < trail) l = Math.max(l, (1 - back / trail) ** 2);
        }
        return 0.7 + 1.4 * l;
      });
    });
    const m = fadeIn(this.wire.t);
    if (this.old) for (const e of this.old) litLine(pen, subdivide([this.at(e.a), this.at(e.b)]), 1 - m);
    this.wire.links.forEach((e, k) => this.wire.bolt.draw(pen, k, subdivide([this.at(e.a), this.at(e.b)]), m));
    for (let i = 0; i < ticks; i++) {
      const a = (i / ticks) * TAU;
      pen.dot(Math.cos(a) * tickR, Math.sin(a) * tickR, 2.5, i % 5 ? 0.35 : 0.8);
    }
    const f = (i: number) => this.wire.bolt.flash(i);
    pen.dot(0, 0, core * (1 + 0.5 * f(0)), 1);
    for (let i = 1; i < this.ring.length; i++) pen.dot(...this.at(i), rider * (1 + 0.7 * f(i)), 1);
    this.sparks.draw(pen);
  }
}

/* ROUTES: a lattice of dots; a few routes cross it in right angles, left
 * to right, sharing a stretch here and there. Every few s a bolt sets off
 * from one route's start and runs through the routes, branching where they
 * meet; the ends it reaches flash and spark. Every REWIRE bolts the routes
 * fade over to a new set. */
const ROUTES = { n: 9, gap: 40, routes: [3, 5], end: 5, every: 9, rewire: 2 };
type RouteSet = { nodes: Pt[]; edges: Edge[]; starts: number[]; ends: number[]; bolt: Bolt; t: number };
class Routes implements Drawing {
  readonly square = true;
  readonly maxLines = 2 * 140 * Math.ceil(ROUTES.gap / 8) + 8 * SPARK.segs;
  readonly maxDots = ROUTES.n * ROUTES.n + 2 * 140 + 8;
  private since = ROUTES.every * Math.random();
  private strikes = 0;
  private rewired = false;
  private set: RouteSet;
  private old: RouteSet | null = null;
  private readonly sparks = new Sparks(8);
  constructor() {
    this.set = this.routes();
    this.set.t = FADE;
  }
  // 3 to 5 routes from rows picked at random, stepping up or down a dot at
  // a time now and then
  private routes(): RouteSet {
    const { n, gap } = ROUTES;
    const c = (i: number) => (i - (n - 1) / 2) * gap;
    const nodes: Pt[] = [];
    const edges: Edge[] = [];
    const starts: number[] = [];
    const ends: number[] = [];
    const ids = new Map<string, number>();
    const node = (p: Pt) => {
      const k = `${p[0]},${p[1]}`;
      if (!ids.has(k)) ids.set(k, nodes.push(p) - 1);
      return ids.get(k)!;
    };
    const seen = new Set<string>();
    const link = (a: number, b: number) => {
      const k = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (a !== b && !seen.has(k)) {
        seen.add(k);
        edges.push({ a, b });
      }
    };
    const [lo, hi] = ROUTES.routes;
    const count = lo + Math.floor(Math.random() * (hi - lo + 1));
    const rows = Array.from({ length: n }, (_, j) => j)
      .sort(() => Math.random() - 0.5)
      .slice(0, count);
    for (let j of rows) {
      let prev = node([c(0), c(j)]);
      starts.push(prev);
      for (let i = 1; i < n; i++) {
        if (Math.random() < 0.45) {
          const to = Math.max(0, Math.min(n - 1, j + (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 2))));
          while (j !== to) {
            j += Math.sign(to - j);
            const q = node([c(i - 1), c(j)]);
            link(prev, q);
            prev = q;
          }
        }
        const q = node([c(i), c(j)]);
        link(prev, q);
        prev = q;
      }
      ends.push(prev);
    }
    return { nodes, edges, starts, ends, bolt: new Bolt(nodes.length, edges, { speed: 230, jitter: 0.5, fade: 0.6, gain: 1.9 }), t: 0 };
  }
  step(dt: number) {
    const r = this.set;
    this.since += dt;
    r.t += dt;
    if (r.t > FADE) this.old = null;
    this.sparks.step(dt);
    for (const i of r.bolt.step(dt)) if (r.ends.includes(i) || r.starts.includes(i)) this.sparks.add(r.nodes[i]);
    if (this.since > ROUTES.every && r.bolt.done()) {
      this.since = 0;
      if (this.strikes > 0 && this.strikes % ROUTES.rewire === 0 && !this.rewired) {
        this.old = r;
        this.set = this.routes();
        this.rewired = true;
        this.since = ROUTES.every - FADE - 0.3;
      } else {
        r.bolt.strike(r.starts[Math.floor(Math.random() * r.starts.length)], (k) => dist(r.nodes[r.edges[k].a], r.nodes[r.edges[k].b]));
        this.strikes++;
        this.rewired = false;
      }
    }
  }
  draw(pen: Pen) {
    const { n, gap, end } = ROUTES;
    const r = this.set;
    const m = fadeIn(r.t);
    const o = this.old;
    if (o) for (const e of o.edges) litLine(pen, subdivide([o.nodes[e.a], o.nodes[e.b]]), 1 - m);
    r.edges.forEach((e, k) => r.bolt.draw(pen, k, subdivide([r.nodes[e.a], r.nodes[e.b]]), m));
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) pen.dot((i - (n - 1) / 2) * gap, (j - (n - 1) / 2) * gap, 2.5, 0.45);
    r.nodes.forEach((p, i) => {
      const f = r.bolt.flash(i);
      if (f > 0.02) pen.dot(...p, 2.5 + 3 * f, f);
    });
    if (o) for (const i of [...o.starts, ...o.ends]) pen.dot(...o.nodes[i], end, 1 - m);
    for (const i of [...r.starts, ...r.ends]) pen.dot(...r.nodes[i], end * (1 + 0.6 * r.bolt.flash(i)), m);
    this.sparks.draw(pen);
  }
}

/* SIGNAL: a spectrum, a row of bars about a baseline, tallest in the
 * middle, each rising and falling at its own pace; a dot on each tip.
 * Every few s a sweep of light crosses it, left to right, lighting each
 * bar as it passes and leaving a glow behind. */
const SIGNAL = { bars: 41, span: 170, min: 6, max: 132, dot: 3, every: 3.8, cross: 1.5 };
class Signal implements Drawing {
  readonly maxLines = SIGNAL.bars + 1;
  readonly maxDots = SIGNAL.bars * 2;
  private t = 3;
  step(dt: number) {
    this.t += dt;
  }
  draw(pen: Pen) {
    const { bars, span, min, max, dot, every, cross } = SIGNAL;
    // the sweep: from past the left end to past the right one
    const p = (this.t % every) / cross;
    const sx = -span - 40 + (2 * span + 80) * p;
    pen.line(-span - 14, 0, span + 14, 0, 0.5);
    for (let i = 0; i < bars; i++) {
      const x = -span + (i * 2 * span) / (bars - 1);
      const env = Math.exp(-((x / 100) ** 2));
      const w = 0.55 + 0.45 * Math.sin(this.t * 1.1 + i * 0.47) * Math.sin(this.t * 0.63 + i * 0.19 + 1);
      const h = min + (max - min) * env * w;
      const g = p <= 1.3 ? Math.exp(-(((x - sx) / 22) ** 2)) + (x < sx ? 0.45 * Math.exp(-(sx - x) / 70) : 0) : 0;
      pen.line(x, -h, x, h, 1.2 + 1.8 * g);
      pen.dot(x, h, dot * (1 + 0.8 * g), 1);
      pen.dot(x, -h, dot * (1 + 0.8 * g), 1);
    }
  }
}

/* TREE: a hierarchy, one root over 3, 9 and 18, joined by right-angled
 * links. Every few s a bolt drops from the root and branches down through
 * every link; each node it reaches flashes, each leaf sparks. */
const TREE = { levels: [150, 55, -40, -135], kids: [3, 3, 2], width: 340, every: 9, sizes: [10, 7, 5, 3.5] };
class Tree implements Drawing {
  readonly maxLines: number;
  readonly maxDots = 31 + 12;
  private since = TREE.every * Math.random();
  private readonly nodes: { x: number; y: number; level: number; parent: number }[] = [];
  private readonly edges: Edge[] = [];
  private readonly links: Pt[][] = [];
  private readonly bolt: Bolt;
  private readonly sparks = new Sparks(18);
  constructor() {
    const { levels, kids, width } = TREE;
    // leaves evenly across, each parent over the middle of its children
    const count = kids.reduce((n, k) => n * k, 1);
    const build = (level: number, parent: number, first: number): number => {
      const i = this.nodes.push({ x: 0, y: levels[level], level, parent }) - 1;
      if (level === levels.length - 1) {
        this.nodes[i].x = -width / 2 + (first * width) / (count - 1);
        return 1;
      }
      let used = 0;
      const xs: number[] = [];
      for (let k = 0; k < kids[level]; k++) {
        const c = this.nodes.length;
        used += build(level + 1, i, first + used);
        xs.push(this.nodes[c].x);
      }
      this.nodes[i].x = (xs[0] + xs[xs.length - 1]) / 2;
      return used;
    };
    build(0, -1, 0);
    for (let i = 1; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      const p = this.nodes[n.parent];
      const mid = (p.y + n.y) / 2;
      this.edges.push({ a: n.parent, b: i });
      this.links.push(
        subdivide([
          [p.x, p.y],
          [p.x, mid],
          [n.x, mid],
          [n.x, n.y],
        ]),
      );
    }
    this.bolt = new Bolt(this.nodes.length, this.edges, { speed: 260, jitter: 0.5, fade: 0.7, gain: 1.9 });
    this.maxLines = this.links.reduce((s, l) => s + l.length - 1, 0) + this.sparks.lines;
  }
  step(dt: number) {
    this.since += dt;
    this.sparks.step(dt);
    for (const i of this.bolt.step(dt)) if (this.nodes[i].level === TREE.levels.length - 1) this.sparks.add([this.nodes[i].x, this.nodes[i].y]);
    if (this.since > TREE.every && this.bolt.done()) {
      this.since = 0;
      this.bolt.strike(0, (k) => lengthOf(this.links[k]));
    }
  }
  draw(pen: Pen) {
    this.links.forEach((pts, k) => this.bolt.draw(pen, k, pts, 0.85));
    this.nodes.forEach((n, i) => pen.dot(n.x, n.y, TREE.sizes[n.level] * (1 + 0.8 * this.bolt.flash(i)), 1));
    this.sparks.draw(pen);
  }
}

/* CONVERGE: many inputs on the left curve into one core; a few outputs
 * leave it on the right. Signals run in along the inputs, each with a glow
 * behind it; one landing in the core makes it flash and spark and sends a
 * signal out along an output, which flashes and sparks as it arrives. */
const CONVERGE = { inputs: 22, outputs: 5, x: 178, inSpan: 160, outSpan: 96, segs: 22, run: 1.4, fade: 0.6, core: 11, gap: 0.35 };
type Run = { curve: number; t: number };
class Converge implements Drawing {
  readonly maxLines = (CONVERGE.inputs + CONVERGE.outputs) * CONVERGE.segs + 10 * SPARK.segs;
  readonly maxDots = CONVERGE.inputs + CONVERGE.outputs + 1 + 20;
  private t = 0;
  private coreAt = -Infinity;
  private lastOut = -Infinity;
  private readonly curves: { pts: Pt[]; len: number; out: boolean; flashAt: number }[] = [];
  private readonly runs: Run[] = [];
  private readonly sparks = new Sparks(10);
  constructor() {
    const { inputs, outputs, x, inSpan, outSpan, segs } = CONVERGE;
    for (let i = 0; i < inputs; i++) {
      const y = -inSpan + (i * 2 * inSpan) / (inputs - 1);
      const pts = cubic([-x, y], [-x + 95, y], [-70, 0], [0, 0], segs);
      this.curves.push({ pts, len: lengthOf(pts), out: false, flashAt: -Infinity });
    }
    for (let i = 0; i < outputs; i++) {
      const y = -outSpan + (i * 2 * outSpan) / (outputs - 1);
      const pts = cubic([0, 0], [70, 0], [x - 95, y], [x, y], segs);
      this.curves.push({ pts, len: lengthOf(pts), out: true, flashAt: -Infinity });
    }
    // a few already on their way in
    for (let k = 0; k < 3; k++) this.runs.push({ curve: Math.floor(Math.random() * inputs), t: Math.random() * CONVERGE.run });
  }
  step(dt: number) {
    const { inputs, outputs, run, fade, gap } = CONVERGE;
    this.t += dt;
    this.sparks.step(dt);
    // a new signal sets off on an input about every 0.6 s
    if (Math.random() < dt / 0.6) this.runs.push({ curve: Math.floor(Math.random() * inputs), t: 0 });
    for (const r of this.runs) {
      const before = r.t;
      r.t += dt;
      if (before < run && r.t >= run) {
        const c = this.curves[r.curve];
        if (!c.out) {
          // landed in the core: it flashes, and sends one out (not too often)
          this.coreAt = this.t;
          this.sparks.add([0, 0]);
          if (this.t - this.lastOut > gap) {
            this.lastOut = this.t;
            this.runs.push({ curve: inputs + Math.floor(Math.random() * outputs), t: 0 });
          }
        } else {
          c.flashAt = this.t;
          this.sparks.add(c.pts[c.pts.length - 1]);
        }
      }
    }
    for (let i = this.runs.length - 1; i >= 0; i--) if (this.runs[i].t > run + fade * 3) this.runs.splice(i, 1);
  }
  draw(pen: Pen) {
    const { run, fade, core } = CONVERGE;
    // the brightest signal on each curve
    const on = new Map<number, Run>();
    for (const r of this.runs) if (!on.has(r.curve) || r.t < on.get(r.curve)!.t) on.set(r.curve, r);
    const heads: Pt[] = [];
    this.curves.forEach((c, i) => {
      const r = on.get(i);
      const base = c.out ? 1.1 : 0.75;
      if (!r) return litLine(pen, c.pts, base);
      const head = Math.min(1, r.t / run) * c.len;
      litLine(pen, c.pts, base, head, 1.9 * Math.exp(-Math.max(0, r.t - run) / fade));
      if (r.t < run) heads.push(pointAt(c.pts, head));
    });
    for (const c of this.curves) {
      const f = Math.exp(-(this.t - c.flashAt) / fade);
      pen.dot(...(c.out ? c.pts[c.pts.length - 1] : c.pts[0]), c.out ? 6 * (1 + 0.6 * f) : 3, 1);
    }
    for (const h of heads) pen.dot(...h, 4, 1);
    pen.dot(0, 0, core * (1 + 0.5 * Math.exp(-(this.t - this.coreAt) / fade)), 1);
    this.sparks.draw(pen);
  }
}

/* RINGS OF STROKES, in the pendulum's language: strokes between an inner
 * and an outer ring, the middle empty, a dot at each end; a spark sweeps
 * round now and then, lighting the strokes it passes. */
// how lit a stroke at angle a is by a sweep (head at h, rad, going round)
function swept(a: number, h: number, tail: number) {
  const back = wrap(h - a);
  return back < tail ? (1 - back / tail) ** 2 : 0;
}
const SWEEP = { every: 9, round: 2.4, tail: 1.6 };
const sweepHead = (t: number) => {
  const p = (t % SWEEP.every) / SWEEP.round;
  return p <= 1 ? { h: -Math.PI / 2 + p * TAU, on: 1 } : { h: 0, on: 0 };
};

/* HALO: string art. Each stroke joins outer dot i to inner dot i + k, so
 * together they wrap the hole in a twisted band; the twist breathes slowly. */
const HALO = { n: 72, outer: 172, inner: 92, twist: 14, breathe: 6, period: 22 };
class Halo implements Drawing {
  readonly maxLines = HALO.n;
  readonly maxDots = HALO.n * 2;
  private t = 0;
  step(dt: number) {
    this.t += dt;
  }
  draw(pen: Pen) {
    const { n, outer, inner, twist, breathe, period } = HALO;
    const k = twist + breathe * Math.sin((this.t * TAU) / period);
    const { h, on } = sweepHead(this.t);
    for (let i = 0; i < n; i++) {
      const a = (i * TAU) / n;
      const b = ((i + k) * TAU) / n;
      const l = on * swept(a, h, SWEEP.tail);
      pen.line(Math.cos(a) * outer, Math.sin(a) * outer, Math.cos(b) * inner, Math.sin(b) * inner, 0.9 + 1.6 * l);
      pen.dot(Math.cos(a) * outer, Math.sin(a) * outer, 3.5 * (1 + 0.6 * l), 1);
      pen.dot(Math.cos(b) * inner, Math.sin(b) * inner, 2.5, 1);
    }
  }
}

/* IRIS: a camera iris. Two families of strokes lean either way across the
 * band between the rings, crossing into a lattice round the empty middle;
 * the inner ring opens and closes slowly. */
// lean: dot steps a stroke turns across the band (a whole number, so it ends on a dot)
const IRIS = { n: 48, outer: 175, inner: [70, 110], lean: 4, period: 18 };
class Iris implements Drawing {
  readonly maxLines = IRIS.n * 2 + 2 * 96;
  readonly maxDots = IRIS.n * 2;
  private t = 0;
  step(dt: number) {
    this.t += dt;
  }
  draw(pen: Pen) {
    const { n, outer, lean, period } = IRIS;
    const inner = IRIS.inner[0] + (IRIS.inner[1] - IRIS.inner[0]) * (0.5 + 0.5 * Math.sin((this.t * TAU) / period));
    const { h, on } = sweepHead(this.t);
    for (const r of [outer, inner]) for (let s = 0; s < 96; s++) {
      const a0 = (s * TAU) / 96;
      const a1 = ((s + 1) * TAU) / 96;
      pen.line(Math.cos(a0) * r, Math.sin(a0) * r, Math.cos(a1) * r, Math.sin(a1) * r, r === outer ? 0.5 : 0.35);
    }
    for (let i = 0; i < n; i++) {
      const a = (i * TAU) / n;
      const l = on * swept(a, h, SWEEP.tail);
      for (const dir of [1, -1]) {
        const b = a + (dir * lean * TAU) / n;
        pen.line(Math.cos(a) * outer, Math.sin(a) * outer, Math.cos(b) * inner, Math.sin(b) * inner, (dir > 0 ? 1 : 0.55) + 1.5 * l);
      }
      pen.dot(Math.cos(a) * outer, Math.sin(a) * outer, 3.5 * (1 + 0.6 * l), 1);
      pen.dot(Math.cos(a) * inner, Math.sin(a) * inner, 2.5, 1);
    }
  }
}

/* DIAL: a gauge. Three rings of radial ticks round an empty middle, long
 * ones every fifth, the inner rings turning slowly against each other. */
const DIAL = { rings: [[120, 178, 0], [84, 112, 1 / 40], [60, 76, -1 / 28]] as [number, number, number][] };
class Dial implements Drawing {
  readonly maxLines = 120 + 90 + 60;
  readonly maxDots = 120 + 90 + 60;
  private t = 0;
  step(dt: number) {
    this.t += dt;
  }
  draw(pen: Pen) {
    const { h, on } = sweepHead(this.t);
    DIAL.rings.forEach(([r0, r1, spin], k) => {
      const n = [120, 90, 60][k];
      const turn = spin * this.t * TAU;
      for (let i = 0; i < n; i++) {
        const a = turn + (i * TAU) / n;
        const long = i % 5 === 0;
        const ro = long ? r1 : r0 + (r1 - r0) * 0.55;
        const l = on * swept(a, h, SWEEP.tail);
        pen.line(Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a) * ro, Math.sin(a) * ro, (long ? 1 : 0.6) + 1.6 * l);
        if (long) pen.dot(Math.cos(a) * ro, Math.sin(a) * ro, 3 * (1 + 0.6 * l), 1);
        else pen.dot(Math.cos(a) * r0, Math.sin(a) * r0, 1.6, 0.6);
      }
    });
  }
}

/* STUDIES: geometric constructions, drawn like a page of a geometry book:
 * crisp lines, dots where they mean something, calm, no electricity. A
 * study draws itself in, holds, and starts again. */
const ease = (p: number) => p * p * (3 - 2 * p);
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
// a polyline drawn in up to p (0..1 of its length)
function drawIn(pen: Pen, pts: Pt[], p: number, alpha: number) {
  if (p <= 0) return;
  const len = lengthOf(pts);
  let s = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i]);
    if (s >= p * len) break;
    const e = Math.min(d, p * len - s);
    const k = d > 0 ? e / d : 0;
    pen.line(pts[i - 1][0], pts[i - 1][1], pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k, alpha);
    s += d;
  }
}
const circlePts = (c: Pt, r: number, n: number, a0 = 0, a1 = TAU): Pt[] => Array.from({ length: n + 1 }, (_, i) => [c[0] + Math.cos(a0 + ((a1 - a0) * i) / n) * r, c[1] + Math.sin(a0 + ((a1 - a0) * i) / n) * r]);
// a heavier ring: three hairlines side by side
function ring(pen: Pen, c: Pt, r: number, alpha: number) {
  for (const d of [-1, 0, 1]) arc(pen, c[0], c[1], r + d, 96, () => alpha);
}

/* PROOF: Pythagoras on a dot grid. A 3-4-5 right triangle, a square on
 * each side; the squares draw in one after another, the dots inside each
 * swelling as it closes. */
const PROOF = { g: 24, cycle: 14 };
class Proof implements Drawing {
  readonly maxLines = 3 + 3 * 4;
  readonly maxDots = 14 * 15;
  private t = 0;
  // in grid units: the right angle at (0, 0), legs 4 left and 3 up
  private readonly squares: Pt[][] = [
    [[-4, 0], [0, 0], [0, -4], [-4, -4]],
    [[0, 0], [3, 0], [3, 3], [0, 3]],
    [[-4, 0], [0, 3], [-3, 7], [-7, 4]],
  ];
  step(dt: number) {
    this.t += dt;
  }
  draw(pen: Pen) {
    const { g, cycle } = PROOF;
    const k = this.t % cycle;
    // the whole figure fades out at the end of its cycle
    const fade = k > cycle - 1.5 ? clamp((cycle - k) / 1.5) : 1;
    const P = ([x, y]: Pt): Pt => [(x + 1.5) * g, (y - 1.5) * g];
    const inside = (sq: Pt[], [x, y]: Pt) =>
      sq.every((a, i) => {
        const b = sq[(i + 1) % 4];
        return (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) <= 1e-9;
      }) || sq.every((a, i) => {
        const b = sq[(i + 1) % 4];
        return (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) >= -1e-9;
      });
    const done = this.squares.map((_, i) => ease(clamp((k - 0.8 - i * 1.6) / 1.4)));
    for (let x = -8; x <= 4; x++)
      for (let y = -5; y <= 8; y++) {
        let grow = 0;
        this.squares.forEach((sq, i) => {
          if (inside(sq, [x, y])) grow = Math.max(grow, done[i] >= 1 ? 1 : 0);
        });
        pen.dot(...P([x, y]), 2.6 + 1.6 * grow * fade, 0.75);
      }
    // the triangle, then each square drawn in
    const tri: Pt[] = [[-4, 0], [0, 0], [0, 3], [-4, 0]];
    drawIn(pen, tri.map(P), fade, 1.3);
    this.squares.forEach((sq, i) => drawIn(pen, [...sq, sq[0]].map(P), done[i] * fade, 1.3));
  }
}

/* TALLY: columns of dots, some marked with an asterisk beside them, like
 * a punch card or a tally sheet; now and then one mark comes or goes. */
const TALLY = { cols: 7, rows: 13, dx: 46, dy: 26, every: 1.6, fade: 0.6 };
class Tally implements Drawing {
  readonly maxLines = TALLY.cols * TALLY.rows * 3;
  readonly maxDots = TALLY.cols * TALLY.rows;
  private t = 0;
  private readonly on: boolean[] = [];
  private readonly since: number[] = [];
  constructor() {
    for (let i = 0; i < TALLY.cols * TALLY.rows; i++) {
      this.on.push(Math.random() < 0.3);
      this.since.push(Infinity);
    }
  }
  step(dt: number) {
    const before = this.t;
    this.t += dt;
    for (let i = 0; i < this.since.length; i++) this.since[i] += dt;
    if (Math.floor(before / TALLY.every) !== Math.floor(this.t / TALLY.every)) {
      const i = Math.floor(Math.random() * this.on.length);
      this.on[i] = !this.on[i];
      this.since[i] = 0;
    }
  }
  draw(pen: Pen) {
    const { cols, rows, dx, dy, fade } = TALLY;
    for (let c = 0; c < cols; c++)
      for (let r = 0; r < rows; r++) {
        const i = c * rows + r;
        const x = (c - (cols - 1) / 2) * dx;
        const y = ((rows - 1) / 2 - r) * dy;
        pen.dot(x, y, 3.4, 1);
        const k = clamp(this.since[i] / fade);
        const a = this.on[i] ? k : 1 - k;
        if (a <= 0.01) continue;
        // the asterisk, up and to the right (marks on the right edge sit to the left)
        const side = c === 0 ? -1 : 1;
        const [ax, ay] = [x + side * 13, y + 13];
        for (let j = 0; j < 3; j++) {
          const ang = Math.PI / 2 + (j * Math.PI) / 3;
          pen.line(ax - Math.cos(ang) * 6.5, ay - Math.sin(ang) * 6.5, ax + Math.cos(ang) * 6.5, ay + Math.sin(ang) * 6.5, 2.2 * a);
        }
      }
  }
}

/* CIRCLES: two circle studies side by side on one diameter: chords fanning
 * from the top of the left circle and radii from its middle, a polar grid
 * in the right one; the fans open and close slowly. */
const CIRC = { r: 100, gap: 104, chords: 12, rings: 6, spokes: 36, breathe: 16 };
class CircleStudy implements Drawing {
  readonly maxLines = 2 * 97 + 3 + 2 * CIRC.chords + CIRC.rings * 97 + CIRC.spokes;
  readonly maxDots = 4;
  private t = 0;
  step(dt: number) {
    this.t += dt;
  }
  draw(pen: Pen) {
    const { r, gap, chords, rings, spokes, breathe } = CIRC;
    const L: Pt = [-gap, 0];
    const R: Pt = [gap, 0];
    const b = 0.5 - 0.5 * Math.cos((this.t / breathe) * TAU);
    arc(pen, L[0], L[1], r, 96, () => 1.3);
    arc(pen, R[0], R[1], r, 96, () => 1.3);
    pen.line(L[0] - r, 0, R[0] + r, 0, 1.8);
    pen.line(L[0], -r, L[0], r, 1.3);
    // chords from the top to the lower left arc, radii to the lower right
    const top: Pt = [L[0], r];
    for (let i = 1; i <= chords; i++) {
      const a = Math.PI + (Math.PI / 2) * (i / (chords + 1)) * (0.55 + 0.45 * b);
      pen.line(top[0], top[1], L[0] + Math.cos(a) * r, Math.sin(a) * r, 0.9);
      const c = -Math.PI / 2 + (Math.PI / 2) * (i / (chords + 1)) * (0.55 + 0.45 * (1 - b));
      pen.line(L[0], 0, L[0] + Math.cos(c) * r, Math.sin(c) * r, 0.9);
    }
    // the polar grid
    for (let k = 1; k < rings; k++) arc(pen, R[0], R[1], (r * k) / rings, 96, () => 0.9);
    for (let k = 0; k < spokes; k++) {
      const a = (k * TAU) / spokes;
      pen.line(R[0], 0, R[0] + Math.cos(a) * r, Math.sin(a) * r, 0.8);
    }
    pen.dot(L[0], 0, 3.5, 1);
    pen.dot(top[0], top[1], 3.5, 1);
    pen.dot(R[0], 0, 3.5, 1);
  }
}

/* ROSETTE: twelve circles round a heavier ring, overlapping into a rosette;
 * it turns very slowly, one circle at a time a little brighter. */
const ROSE = { n: 12, r: 88, d: 70, hub: 46, turn: 90, every: 2.4 };
class Rosette implements Drawing {
  readonly maxLines = ROSE.n * 97 + 3 * 97;
  readonly maxDots = 0;
  private t = 0;
  step(dt: number) {
    this.t += dt;
  }
  draw(pen: Pen) {
    const { n, r, d, hub, turn, every } = ROSE;
    const rot = (this.t / turn) * TAU;
    const lit = Math.floor(this.t / every) % n;
    const k = (this.t % every) / every;
    for (let i = 0; i < n; i++) {
      const a = rot + (i * TAU) / n;
      const glow = i === lit ? Math.sin(Math.PI * k) : 0;
      arc(pen, Math.cos(a) * d, Math.sin(a) * d, r, 96, () => 0.95 + 0.9 * glow);
    }
    ring(pen, [0, 0], hub, 1.6);
  }
}

/* CONSTRUCTION: a compass construction: two circles through each other's
 * middles, the line through the middles, and the perpendicular bisector
 * through where they cross, with the two equilateral triangles; it draws
 * itself step by step, holds, and starts again. */
const CONS = { r: 110, cycle: 16 };
class Construction implements Drawing {
  readonly maxLines = 2 * 97 + 2 + 4 * 2 + 2;
  readonly maxDots = 4;
  private t = 0;
  step(dt: number) {
    this.t += dt;
  }
  draw(pen: Pen) {
    const { r, cycle } = CONS;
    const k = this.t % cycle;
    const fade = k > cycle - 1.5 ? clamp((cycle - k) / 1.5) : 1;
    const A: Pt = [-r / 2, 0];
    const B: Pt = [r / 2, 0];
    const h = Math.sqrt(r * r - (r / 2) ** 2);
    const U: Pt = [0, h];
    const D: Pt = [0, -h];
    const at = (start: number, dur = 1.6) => ease(clamp((k - start) / dur)) * fade;
    drawIn(pen, [[-r * 1.6, 0], [r * 1.6, 0]], at(0.4, 1.2), 0.8);
    drawIn(pen, circlePts(A, r, 96, 0, TAU), at(1.2, 2), 1.3);
    drawIn(pen, circlePts(B, r, 96, Math.PI, Math.PI + TAU), at(2.6, 2), 1.3);
    drawIn(pen, [[0, h * 1.45], [0, -h * 1.45]], at(4.4, 1.2), 0.8);
    const tri = at(5.4, 1.4);
    drawIn(pen, [A, U, B, D, A], tri, 1.3);
    drawIn(pen, [A, B], tri, 1.3);
    pen.dot(...A, 3.5, fade);
    pen.dot(...B, 3.5, fade);
    if (tri > 0.3) {
      pen.dot(...U, 3.5, fade);
      pen.dot(...D, 3.5, fade);
    }
  }
}

// a dashed line, drawn in up to p
function dashedIn(pen: Pen, a: Pt, b: Pt, p: number, alpha: number, dash = 5, gap = 5) {
  const len = dist(a, b) * clamp(p);
  const full = dist(a, b);
  for (let s = 0; s < len; s += dash + gap) {
    const e = Math.min(len, s + dash);
    pen.line(a[0] + ((b[0] - a[0]) * s) / full, a[1] + ((b[1] - a[1]) * s) / full, a[0] + ((b[0] - a[0]) * e) / full, a[1] + ((b[1] - a[1]) * e) / full, alpha);
  }
}
// a study's clock: k s into its cycle, at(start, dur) eased 0..1, the
// whole fading out at the end of the cycle
function cycleOf(t: number, cycle: number) {
  const k = t % cycle;
  const fade = k > cycle - 1.5 ? clamp((cycle - k) / 1.5) : 1;
  return { k, fade, at: (start: number, dur = 1.5) => ease(clamp((k - start) / dur)) * fade };
}

/* HEXAGON: the compass hexagon. A circle; six arcs of the same radius
 * stepped round it, each from where the last landed, making the petals;
 * the hexagon through the six points, then the two triangles of the star. */
const HEXA = { r: 120, cycle: 18 };
class Hexagon implements Drawing {
  readonly maxLines = 97 + 6 * 33 + 6 + 6;
  readonly maxDots = 7;
  private t = 0;
  step(dt: number) {
    this.t += dt;
  }
  draw(pen: Pen) {
    const { r } = HEXA;
    const { at, fade } = cycleOf(this.t, HEXA.cycle);
    const P = Array.from({ length: 6 }, (_, k): Pt => [Math.cos(Math.PI / 2 + (k * TAU) / 6) * r, Math.sin(Math.PI / 2 + (k * TAU) / 6) * r]);
    drawIn(pen, circlePts([0, 0], r, 96, Math.PI / 2, Math.PI / 2 + TAU), at(0.4, 1.8), 1.3);
    P.forEach((c, k) => {
      // the petal: the arc round c through the middle, between its neighbours
      const a = Math.PI / 2 + (k * TAU) / 6 + Math.PI;
      drawIn(pen, circlePts(c, r, 32, a - Math.PI / 3, a + Math.PI / 3), at(2.4 + k * 0.55, 0.8), 0.95);
    });
    drawIn(pen, [...P, P[0]], at(6.2, 1.6), 1.3);
    drawIn(pen, [P[0], P[2], P[4], P[0]], at(8, 1.2), 0.9);
    drawIn(pen, [P[1], P[3], P[5], P[1]], at(8.8, 1.2), 0.9);
    pen.dot(0, 0, 3.5, fade);
    P.forEach((p, k) => at(2.4 + k * 0.55, 0.1) > 0 && pen.dot(...p, 3.5, fade));
  }
}

/* GOLDEN: the Fibonacci squares, 1, 1, 2, 3, 5, 8, laid round each other,
 * then the golden spiral drawn through them, a quarter circle in each. */
const GOLD = { fib: [1, 1, 2, 3, 5, 8], u: 24, cycle: 16 };
class Golden implements Drawing {
  readonly maxLines = 6 * 4 + 6 * 24;
  readonly maxDots = 2;
  private t = 0;
  private readonly squares: Pt[][] = [];
  private readonly spiral: Pt[] = [];
  constructor() {
    const { fib, u } = GOLD;
    let [x0, y0, x1, y1] = [0, 0, 1, 1];
    const sq = (x: number, y: number, s: number): Pt[] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
    const raw: Pt[][] = [sq(0, 0, 1)];
    fib.slice(1).forEach((s, i) => {
      const d = i % 4;
      if (d === 0) (raw.push(sq(x1, y0, s)), (x1 += s));
      else if (d === 1) (raw.push(sq(x0, y1, s)), (y1 += s));
      else if (d === 2) (raw.push(sq(x0 - s, y0, s)), (x0 -= s));
      else (raw.push(sq(x0, y0 - s, s)), (y0 -= s));
    });
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    for (const q of raw) this.squares.push(q.map(([x, y]): Pt => [(x - cx) * u, (y - cy) * u]));
    // The spiral: a quarter circle in each square, round one of the two
    // corners it shares with the squares before (the first: any corner),
    // each starting where the last ended. Found by trying every choice.
    const near = (a: Pt, b: Pt) => dist(a, b) < 1e-6;
    const sqs = this.squares;
    const shared = (i: number) => (i === 0 ? [0, 1, 2, 3] : [0, 1, 2, 3].filter((c) => sqs.slice(0, i).some((p) => p.some((q) => near(q, sqs[i][c])))));
    const go = (i: number, end: Pt | null, out: Pt[]): Pt[] | null => {
      if (i === sqs.length) return out;
      const q = sqs[i];
      const s = dist(q[0], q[1]);
      for (const c of shared(i))
        for (const [a, b] of [[q[(c + 1) % 4], q[(c + 3) % 4]], [q[(c + 3) % 4], q[(c + 1) % 4]]]) {
          if (end && !near(a, end)) continue;
          const a0 = Math.atan2(a[1] - q[c][1], a[0] - q[c][0]);
          let a1 = Math.atan2(b[1] - q[c][1], b[0] - q[c][0]);
          if (a1 - a0 > Math.PI) a1 -= TAU;
          if (a0 - a1 > Math.PI) a1 += TAU;
          const r = go(i + 1, b, [...out, ...circlePts(q[c], s, 24, a0, a1).slice(out.length ? 1 : 0)]);
          if (r) return r;
        }
      return null;
    };
    this.spiral.push(...(go(0, null, []) ?? []));
  }
  step(dt: number) {
    this.t += dt;
  }
  draw(pen: Pen) {
    const { at, fade } = cycleOf(this.t, GOLD.cycle);
    this.squares.forEach((q, i) => drawIn(pen, [...q, q[0]], at(0.4 + i * 0.7, 0.8), i === this.squares.length - 1 ? 1.3 : 1));
    drawIn(pen, this.spiral, at(5, 3), 1.6);
    if (this.spiral.length && at(5, 0.1) > 0) pen.dot(...this.spiral[0], 3.5, fade);
    if (this.spiral.length && at(8, 0.1) > 0) pen.dot(...this.spiral[this.spiral.length - 1], 3.5, fade);
  }
}

/* PERSPECTIVE: a cube in two-point perspective: the horizon, two vanishing
 * points, the construction lines to them dashed, the cube's edges drawn
 * over them; the hidden edges dashed. */
const PERSP = { horizon: 95, vp: 195, cycle: 16 };
class Perspective implements Drawing {
  readonly maxLines = 900;
  readonly maxDots = 3;
  private t = 0;
  step(dt: number) {
    this.t += dt;
  }
  draw(pen: Pen) {
    const { horizon, vp } = PERSP;
    const { at, fade } = cycleOf(this.t, PERSP.cycle);
    const V1: Pt = [-vp, horizon];
    const V2: Pt = [vp, horizon];
    const Ft: Pt = [5, 40];
    const Fb: Pt = [5, -70];
    // a point on the line from p toward v, at x
    const onX = (p: Pt, v: Pt, x: number): Pt => [x, p[1] + ((v[1] - p[1]) * (x - p[0])) / (v[0] - p[0])];
    const Lt = onX(Ft, V1, -82);
    const Lb = onX(Fb, V1, -82);
    const Rt = onX(Ft, V2, 92);
    const Rb = onX(Fb, V2, 92);
    // the back corner: where the lines from Lt to V2 and from Rt to V1 cross
    const cross = (a: Pt, b: Pt, c: Pt, d: Pt): Pt => {
      const den = (a[0] - b[0]) * (c[1] - d[1]) - (a[1] - b[1]) * (c[0] - d[0]);
      const u = ((a[0] - c[0]) * (c[1] - d[1]) - (a[1] - c[1]) * (c[0] - d[0])) / den;
      return [a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1])];
    };
    const Bt = cross(Lt, V2, Rt, V1);
    const Bb = cross(Lb, V2, Rb, V1);
    drawIn(pen, [[-205, horizon], [205, horizon]], at(0.3, 1.2), 0.9);
    const guide = at(1.4, 1.6);
    for (const [p, v] of [[Ft, V1], [Ft, V2], [Fb, V1], [Fb, V2], [Lt, V2], [Rt, V1]] as [Pt, Pt][]) dashedIn(pen, p, v, guide, 0.45);
    const edges = at(3.2, 2);
    drawIn(pen, [Fb, Ft], edges, 1.4);
    drawIn(pen, [Lb, Lt, Ft, Rt, Rb, Fb, Lb], edges, 1.4);
    drawIn(pen, [Lt, Bt, Rt], at(4.4, 1.2), 1.4);
    const hidden = at(5.4, 1.2);
    for (const [a, b] of [[Lb, Bb], [Rb, Bb], [Bt, Bb]] as [Pt, Pt][]) dashedIn(pen, a, b, hidden, 0.8, 4, 4);
    pen.dot(...V1, 3.5, fade);
    pen.dot(...V2, 3.5, fade);
  }
}

/* TANGENTS: a circle and a point outside it, the two tangents from the
 * point, the radii to where they touch with their right angles, the line
 * to the middle dashed; the point drifts slowly and it all follows. */
const TANG = { c: [55, -10] as Pt, r: 85, drift: 30 };
class Tangents implements Drawing {
  readonly maxLines = 600;
  readonly maxDots = 4;
  private t = 0;
  step(dt: number) {
    this.t += dt;
  }
  draw(pen: Pen) {
    const { c, r, drift } = TANG;
    const w = (this.t / drift) * TAU;
    const P: Pt = [-150 + 12 * Math.sin(w), 20 + 110 * Math.sin(w * 0.5 + 0.6)];
    const d = dist(P, c);
    const base = Math.atan2(P[1] - c[1], P[0] - c[0]);
    const b = Math.acos(r / d);
    arc(pen, c[0], c[1], r, 96, () => 1.3);
    dashedIn(pen, P, c, 1, 0.6);
    for (const s of [-1, 1]) {
      const T: Pt = [c[0] + Math.cos(base + s * b) * r, c[1] + Math.sin(base + s * b) * r];
      // the tangent, carried on past where it touches
      const ext: Pt = [T[0] + (T[0] - P[0]) * 0.35, T[1] + (T[1] - P[1]) * 0.35];
      pen.line(P[0], P[1], ext[0], ext[1], 1.3);
      pen.line(c[0], c[1], T[0], T[1], 0.9);
      // the right angle at T
      const u = [(c[0] - T[0]) / r, (c[1] - T[1]) / r];
      const v = [(P[0] - T[0]) / dist(P, T), (P[1] - T[1]) / dist(P, T)];
      const m = 10;
      const a: Pt = [T[0] + u[0] * m, T[1] + u[1] * m];
      const q: Pt = [T[0] + (u[0] + v[0]) * m, T[1] + (u[1] + v[1]) * m];
      const e: Pt = [T[0] + v[0] * m, T[1] + v[1] * m];
      pen.line(a[0], a[1], q[0], q[1], 0.9);
      pen.line(q[0], q[1], e[0], e[1], 0.9);
      pen.dot(...T, 3.2, 1);
    }
    pen.dot(...P, 4, 1);
    pen.dot(...c, 3.2, 1);
  }
}

/* SINE: a point going round a circle, its height carried across by a
 * dashed line onto the sine wave it traces beside the circle; the radius
 * and its angle drawn in. */
const SINE = { c: [-125, 0] as Pt, r: 62, x0: -40, x1: 195, period: 9 };
class Sine implements Drawing {
  readonly maxLines = 600;
  readonly maxDots = 3;
  private t = 0;
  step(dt: number) {
    this.t += dt;
  }
  draw(pen: Pen) {
    const { c, r, x0, x1, period } = SINE;
    const th = (this.t / period) * TAU;
    arc(pen, c[0], c[1], r, 96, () => 1.3);
    pen.line(c[0] - r - 12, 0, x1, 0, 0.9);
    pen.line(c[0], -r - 12, c[0], r + 12, 0.6);
    pen.line(x0, -r - 12, x0, r + 12, 0.6);
    const P: Pt = [c[0] + Math.cos(th) * r, Math.sin(th) * r];
    pen.line(c[0], 0, P[0], P[1], 1.2);
    arc(pen, c[0], 0, 18, 16, () => 0.9, 0, ((th % TAU) + TAU) % TAU);
    dashedIn(pen, P, [x0, P[1]], 1, 0.6);
    // the wave: the newest height at x0, older ones further right
    const n = 120;
    const span = TAU * 1.5;
    for (let i = 0; i < n; i++) {
      const xa = x0 + ((x1 - x0) * i) / n;
      const xb = x0 + ((x1 - x0) * (i + 1)) / n;
      pen.line(xa, Math.sin(th - (span * i) / n) * r, xb, Math.sin(th - (span * (i + 1)) / n) * r, 1.3);
    }
    pen.dot(...P, 4, 1);
    pen.dot(x0, P[1], 4, 1);
    pen.dot(c[0], 0, 3, 1);
  }
}

/* INCIRCLE: a triangle, its three angle bisectors meeting at the
 * incentre, the circle inside touching all three sides, small arcs
 * marking the angles; drawn step by step. */
const INC = { A: [-160, -105] as Pt, B: [165, -105] as Pt, C: [35, 135] as Pt, cycle: 16 };
class Incircle implements Drawing {
  readonly maxLines = 600;
  readonly maxDots = 7;
  private t = 0;
  step(dt: number) {
    this.t += dt;
  }
  draw(pen: Pen) {
    const { A, B, C } = INC;
    const { at, fade } = cycleOf(this.t, INC.cycle);
    const a = dist(B, C);
    const b = dist(A, C);
    const c = dist(A, B);
    const p = a + b + c;
    const I: Pt = [(a * A[0] + b * B[0] + c * C[0]) / p, (a * A[1] + b * B[1] + c * C[1]) / p];
    const s = p / 2;
    const r = Math.sqrt(((s - a) * (s - b) * (s - c)) / s);
    drawIn(pen, [A, B, C, A], at(0.3, 2), 1.4);
    // the angle arcs, then the bisectors from each corner through I to the far side
    const corners: [Pt, Pt, Pt][] = [[A, B, C], [B, C, A], [C, A, B]];
    corners.forEach(([v, n1, n2], i) => {
      const a1 = Math.atan2(n1[1] - v[1], n1[0] - v[0]);
      let a2 = Math.atan2(n2[1] - v[1], n2[0] - v[0]);
      if (a2 - a1 > Math.PI) a2 -= TAU;
      if (a1 - a2 > Math.PI) a2 += TAU;
      drawIn(pen, circlePts(v, 24, 16, a1, a2), at(2.4 + i * 0.3, 0.6), 1);
      // where the bisector meets the far side
      const k = dist(v, n1) / (dist(v, n1) + dist(v, n2));
      const F: Pt = [n1[0] + (n2[0] - n1[0]) * k, n1[1] + (n2[1] - n1[1]) * k];
      dashedIn(pen, v, F, at(3.4 + i * 0.4, 1.2), 0.7);
    });
    drawIn(pen, circlePts(I, r, 96, -Math.PI / 2, -Math.PI / 2 + TAU), at(5.4, 1.8), 1.3);
    // the touching points: I dropped square onto each side
    if (at(7.2, 0.4) > 0)
      for (const [u, v] of [[A, B], [B, C], [C, A]] as [Pt, Pt][]) {
        const L = dist(u, v);
        const k = ((I[0] - u[0]) * (v[0] - u[0]) + (I[1] - u[1]) * (v[1] - u[1])) / (L * L);
        pen.dot(u[0] + (v[0] - u[0]) * k, u[1] + (v[1] - u[1]) * k, 3, at(7.2, 0.4));
      }
    for (const v of [A, B, C]) pen.dot(...v, 3.5, fade);
    if (at(5.2, 0.1) > 0) pen.dot(...I, 3.5, fade);
  }
}

/* HINGE: circles hinged at one point on the left, each turned a different
 * way about the upright through it, so they read as ellipses of every
 * width; some solid, some dashed, a dot riding on two. They turn slowly,
 * like pages. */
// turns: rad about the upright, all under a quarter turn so each opens to the right
const HINGE = { r: 150, turns: [0.12, 0.42, 0.7, 0.95, 1.18, 1.38], dashed: [false, true, false, true, false, true], period: 40 };
class Hinge implements Drawing {
  readonly maxLines = 6 * 200;
  readonly maxDots = 2;
  private t = 0;
  step(dt: number) {
    this.t += dt;
  }
  draw(pen: Pen) {
    const { r, turns, dashed, period } = HINGE;
    const base = Math.sin((this.t / period) * TAU) * 0.1;
    // a circle through (-r, 0) touching the upright there, turned by th about it
    const at = (th: number, a: number): Pt => [-r + (Math.cos(a) + 1) * r * Math.cos(th) * 0.85, Math.sin(a) * r];
    turns.forEach((tt, k) => {
      const th = tt + base;
      const n = 96;
      for (let i = 0; i < n; i++) {
        if (dashed[k] && i % 2) continue;
        const [x0, y0] = at(th, (i * TAU) / n);
        const [x1, y1] = at(th, ((i + 1) * TAU) / n);
        pen.line(x0 + 50, y0, x1 + 50, y1, dashed[k] ? 1.1 : 1.3);
      }
    });
    // the two riders, on dashed circles, going round slowly
    for (const [k, sp, ph] of [[1, 0.05, 0.4], [5, -0.035, 2.2]] as const) {
      const [x, y] = at(turns[k] + base, ph + this.t * sp * TAU);
      pen.dot(x + 50, y, 7, 1);
    }
  }
}

/* MESHES: a tiling (hexagons, triangles, squares, rhombi...) cut to a
 * shape, a dot on every corner. A bolt strikes a corner and crawls out
 * along the edges, branching, till it has run through the whole mesh, the
 * corners it reaches flashing; then, after a rest, the next. Now and then a
 * cell glows and fades. */
// every: the rest between bolts; each runs through the whole mesh
const MESH = { every: 7, speed: 150, cellEvery: 1.6, cellFade: 2.2 };
type Poly = Pt[];
type Clip = (c: Pt) => boolean;
class Mesh implements Drawing {
  readonly maxLines: number;
  readonly maxDots: number;
  private t = 0;
  private since = MESH.every * Math.random();
  private nextCell = 0;
  private readonly corners: Pt[] = [];
  private readonly edges: Edge[] = [];
  private readonly cells: { v: number[]; c: Pt }[] = [];
  private readonly lit: { cell: number; t: number }[] = [];
  private readonly bolt: Bolt;
  private readonly sparks = new Sparks(4);
  // dot: a corner's dot size
  constructor(
    polys: Poly[],
    private readonly dot = 2.5,
  ) {
    const ids = new Map<string, number>();
    const corner = (p: Pt) => {
      const k = `${Math.round(p[0] * 10)},${Math.round(p[1] * 10)}`;
      if (!ids.has(k)) ids.set(k, this.corners.push(p) - 1);
      return ids.get(k)!;
    };
    const seen = new Set<string>();
    for (const poly of polys) {
      const v = poly.map(corner);
      const c: Pt = [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];
      this.cells.push({ v, c });
      v.forEach((a, i) => {
        const b = v[(i + 1) % v.length];
        const k = a < b ? `${a}-${b}` : `${b}-${a}`;
        if (!seen.has(k)) {
          seen.add(k);
          this.edges.push({ a, b });
        }
      });
    }
    this.bolt = new Bolt(this.corners.length, this.edges, { speed: MESH.speed, jitter: 0.6, fade: 0.8, gain: 2 });
    this.maxLines = this.edges.reduce((s, e) => s + Math.max(1, Math.ceil(dist(this.corners[e.a], this.corners[e.b]) / 8)), 0) + 2 * 8 + this.sparks.lines;
    this.maxDots = this.corners.length + 2 + 4;
  }
  step(dt: number) {
    this.t += dt;
    this.since += dt;
    this.sparks.step(dt);
    this.bolt.step(dt);
    for (const l of this.lit) l.t += dt;
    while (this.lit.length && this.lit[0].t > MESH.cellFade) this.lit.shift();
    if (this.t >= this.nextCell) {
      this.nextCell = this.t + MESH.cellEvery;
      this.lit.push({ cell: Math.floor(Math.random() * this.cells.length), t: 0 });
    }
    if (this.since > MESH.every && this.bolt.done()) {
      this.since = 0;
      const seed = Math.floor(Math.random() * this.corners.length);
      this.bolt.strike(seed, (k) => dist(this.corners[this.edges[k].a], this.corners[this.edges[k].b]));
      this.sparks.add(this.corners[seed]);
    }
  }
  draw(pen: Pen) {
    this.edges.forEach((e, k) => this.bolt.draw(pen, k, subdivide([this.corners[e.a], this.corners[e.b]]), 0.7));
    for (const l of this.lit) {
      const k = 1 - l.t / MESH.cellFade;
      const v = this.cells[l.cell].v.map((i) => this.corners[i]);
      v.forEach((p, i) => pen.line(p[0], p[1], v[(i + 1) % v.length][0], v[(i + 1) % v.length][1], 1.4 * k * k));
    }
    this.corners.forEach((p, i) => {
      const f = this.bolt.flash(i);
      pen.dot(p[0], p[1], this.dot * (1 + 1.2 * f), 0.45 + 0.55 * f);
    });
    for (const l of this.lit) pen.dot(...this.cells[l.cell].c, 5, 1 - l.t / MESH.cellFade);
    this.sparks.draw(pen);
  }
}

// the tilings, kept where a cell's centre falls inside the clip
const SQ3 = Math.sqrt(3);
// a hexagon's shape round the middle (flat-topped), a circle, a square
const inHex = (R: number): Clip => ([x, y]) => Math.abs(y) <= (SQ3 / 2) * R && Math.abs(x) + Math.abs(y) / SQ3 <= R;
const inCircle = (R: number): Clip => ([x, y]) => Math.hypot(x, y) <= R;
const inSquare = (R: number): Clip => ([x, y]) => Math.abs(x) <= R && Math.abs(y) <= R;
const centre = (poly: Poly): Pt => [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];
const keep = (polys: Poly[], clip: Clip) => polys.filter((p) => clip(centre(p)));
const span = 220; // tile out to here, then clip
function hexagons(r: number): Poly[] {
  const out: Poly[] = [];
  const n = Math.ceil(span / r);
  for (let q = -n; q <= n; q++)
    for (let s = -n; s <= n; s++) {
      const c: Pt = [1.5 * r * q, SQ3 * r * (s + q / 2)];
      out.push(Array.from({ length: 6 }, (_, i): Pt => [c[0] + Math.cos((i * TAU) / 6) * r, c[1] + Math.sin((i * TAU) / 6) * r]));
    }
  return out;
}
function triangles(a: number): Poly[] {
  const out: Poly[] = [];
  const h = (a * SQ3) / 2;
  const n = Math.ceil(span / h) + 2;
  const P = (i: number, j: number): Pt => [(i + j / 2) * a, j * h];
  for (let j = -n; j <= n; j++)
    for (let i = -2 * n; i <= 2 * n; i++) {
      out.push([P(i, j), P(i + 1, j), P(i, j + 1)]);
      out.push([P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)]);
    }
  return out;
}
function squares(a: number, turn = 0): Poly[] {
  const out: Poly[] = [];
  const n = Math.ceil(span / a);
  const rot = ([x, y]: Pt): Pt => [x * Math.cos(turn) - y * Math.sin(turn), x * Math.sin(turn) + y * Math.cos(turn)];
  for (let i = -n; i < n; i++)
    for (let j = -n; j < n; j++)
      out.push(
        [
          [i * a, j * a],
          [(i + 1) * a, j * a],
          [(i + 1) * a, (j + 1) * a],
          [i * a, (j + 1) * a],
        ].map((p) => rot(p as Pt)),
      );
  return out;
}
// rhombille: each hexagon split into three rhombi, which read as cubes
function rhombi(r: number): Poly[] {
  return hexagons(r).flatMap((v) => {
    const c = centre(v);
    return [
      [c, v[0], v[1], v[2]],
      [c, v[2], v[3], v[4]],
      [c, v[4], v[5], v[0]],
    ];
  });
}
// kagome: the triangles joining the middles of a triangle lattice's edges
function kagome(a: number): Poly[] {
  const mid = (p: Pt, q: Pt): Pt => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  return triangles(a * 2).map(([p, q, r]) => [mid(p, q), mid(q, r), mid(r, p)]);
}
// octagons and squares (the truncated square tiling)
function octagons(a: number): Poly[] {
  const out: Poly[] = [];
  const e = a / (1 + Math.SQRT2); // the shared edge
  const R = e / (2 * Math.sin(Math.PI / 8));
  const n = Math.ceil(span / a);
  for (let i = -n; i <= n; i++)
    for (let j = -n; j <= n; j++) {
      out.push(Array.from({ length: 8 }, (_, k): Pt => [i * a + Math.cos(Math.PI / 8 + (k * TAU) / 8) * R, j * a + Math.sin(Math.PI / 8 + (k * TAU) / 8) * R]));
      const c: Pt = [(i + 0.5) * a, (j + 0.5) * a];
      const h = e / Math.SQRT2;
      out.push([
        [c[0] + h, c[1]],
        [c[0], c[1] + h],
        [c[0] - h, c[1]],
        [c[0], c[1] - h],
      ]);
    }
  return out;
}
// bricks: rows of 2 × 1 blocks, every other row offset by half; each
// brick's top and bottom carry the corners of the bricks against it
function bricks(a: number): Poly[] {
  const out: Poly[] = [];
  const n = Math.ceil(span / a);
  for (let j = -n; j <= n; j++) {
    const off = j & 1 ? a : 0;
    for (let i = -n; i <= n; i++) {
      const x = i * 2 * a + off;
      const y = j * a;
      out.push([
        [x, y],
        [x + a, y],
        [x + 2 * a, y],
        [x + 2 * a, y + a],
        [x + a, y + a],
        [x, y + a],
      ]);
    }
  }
  return out;
}
// polar: rings and spokes, a fan of triangles in the middle
function polar(rings: number, spokes: number, r0: number, R: number): Poly[] {
  const out: Poly[] = [];
  const at = (r: number, k: number): Pt => [Math.cos((k * TAU) / spokes) * r, Math.sin((k * TAU) / spokes) * r];
  for (let k = 0; k < spokes; k++) out.push([[0, 0], at(r0, k), at(r0, k + 1)]);
  for (let j = 0; j < rings; j++) {
    const a = r0 + ((R - r0) * j) / rings;
    const b = r0 + ((R - r0) * (j + 1)) / rings;
    for (let k = 0; k < spokes; k++) out.push([at(a, k), at(b, k), at(b, k + 1), at(a, k + 1)]);
  }
  return out;
}

export const DRAWING_KINDS: [string, string][] = [
  ["orbit", "Orbit"],
  ["routes", "Routes"],
  ["signal", "Signal"],
  ["tree", "Tree"],
  ["converge", "Converge"],
  ["halo", "Halo"],
  ["iris", "Iris"],
  ["dial", "Dial"],
  ["proof", "Proof"],
  ["tally", "Tally"],
  ["circleStudy", "Circle study"],
  ["rosette", "Rosette"],
  ["construction", "Construction"],
  ["hexagon", "Hexagon"],
  ["golden", "Golden spiral"],
  ["perspective", "Perspective"],
  ["tangents", "Tangents"],
  ["sine", "Sine"],
  ["incircle", "Incircle"],
  ["hinge", "Hinge"],
  ["hex", "Hex mesh"],
  ["hexFine", "Hex mesh fine"],
  ["triMesh", "Triangle mesh"],
  ["squareMesh", "Square mesh"],
  ["diamondMesh", "Diamond mesh"],
  ["cubeMesh", "Cube mesh"],
  ["kagomeMesh", "Kagome mesh"],
  ["polarMesh", "Polar mesh"],
  ["octagonMesh", "Octagon mesh"],
  ["brickMesh", "Brick mesh"],
];
registerDrawing("orbit", () => new Orbit());
registerDrawing("halo", () => new Halo());
registerDrawing("iris", () => new Iris());
registerDrawing("dial", () => new Dial());
registerDrawing("proof", () => new Proof());
registerDrawing("tally", () => new Tally());
registerDrawing("circleStudy", () => new CircleStudy());
registerDrawing("rosette", () => new Rosette());
registerDrawing("construction", () => new Construction());
registerDrawing("hexagon", () => new Hexagon());
registerDrawing("golden", () => new Golden());
registerDrawing("perspective", () => new Perspective());
registerDrawing("tangents", () => new Tangents());
registerDrawing("sine", () => new Sine());
registerDrawing("incircle", () => new Incircle());
registerDrawing("hinge", () => new Hinge());
registerDrawing("routes", () => new Routes());
registerDrawing("signal", () => new Signal());
registerDrawing("tree", () => new Tree());
registerDrawing("converge", () => new Converge());
registerDrawing("hex", () => new Mesh(keep(hexagons(26), inHex(150))));
registerDrawing("hexFine", () => new Mesh(keep(hexagons(14), inHex(175)), 1.8));
registerDrawing("triMesh", () => new Mesh(keep(triangles(26), inHex(175)), 2));
registerDrawing("squareMesh", () => new Mesh(keep(squares(22), inCircle(170)), 2));
registerDrawing("diamondMesh", () => new Mesh(keep(squares(24, Math.PI / 4), inSquare(150)), 2));
registerDrawing("cubeMesh", () => new Mesh(keep(rhombi(22), inHex(170)), 2));
registerDrawing("kagomeMesh", () => new Mesh(keep(kagome(22), inHex(175)), 2));
registerDrawing("polarMesh", () => new Mesh(polar(9, 48, 22, 175), 1.8));
registerDrawing("octagonMesh", () => new Mesh(keep(octagons(36), inCircle(170)), 2));
registerDrawing("brickMesh", () => new Mesh(keep(bricks(18), inSquare(150)), 2));

// Every drawing, the site's three too, with its dots split by distance from
// the middle (the inner half of the radii drawn this frame, and the outer)
// and each half's brightness set from the Drawing panel.
function splitDots(make: () => Drawing): () => Drawing {
  return () => {
    const d = make();
    const dots: [number, number, number, number][] = [];
    const draw = d.draw.bind(d);
    d.draw = (pen: Pen) => {
      dots.length = 0;
      draw({ line: pen.line.bind(pen), dot: (x, y, size, alpha) => void dots.push([x, y, size, alpha]) });
      let lo = Infinity;
      let hi = 0;
      for (const [x, y] of dots) {
        const r = Math.hypot(x, y);
        lo = Math.min(lo, r);
        hi = Math.max(hi, r);
      }
      const mid = (lo + hi) / 2;
      for (const [x, y, size, alpha] of dots) pen.dot(x, y, size, Math.min(1, alpha * (Math.hypot(x, y) < mid ? LOOK.dotInner : LOOK.dotOuter)));
    };
    return d;
  };
}
for (const kind of ["spider", "pendulum", "rings", ...DRAWING_KINDS.map(([k]) => k)]) {
  const make = drawingMaker(kind);
  if (make) registerDrawing(kind, splitDots(make));
}

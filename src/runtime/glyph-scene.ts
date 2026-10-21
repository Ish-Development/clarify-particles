// The Technical depth cards (type "glyph"): three small flat drawings of
// nodes and lines, one per card, picked by `kind`.
//   spider    a node walking over a grid of dots on eight legs: each leg
//             holds a dot, and lets go to reach for the next one ahead
//   pendulum  a ring of spokes swinging back and forth like a pendulum,
//             the spiral turning one way, straightening, then the other
//   rings     a 3 × 3 chain of rings with nodes running round them, passing
//             from ring to ring where they cross; each crossing a node
//             passes lights up, like a link locking
// Drawn in design units: CSS px on the Figma card (435 px square), scaled
// to the canvas' short side. Loaded as its own chunk (engine.ts).
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  OrthographicCamera,
  Points,
  ShaderMaterial,
  Vector2,
} from "three";
import type { GlyphConfig } from "./defaults";

const CARD = 435; // the Figma card's side, design units

const LINE_VERT = /* glsl */ `
  uniform float uPt;
  uniform vec2 uRes; // drawing buffer, px
  uniform float uWidth;
  attribute vec2 aA;
  attribute vec2 aB;
  attribute float aAlpha;
  varying float vA;
  varying float vSide;
  varying float vHalf;
  void main() {
    vec4 a = projectionMatrix * modelViewMatrix * vec4(aA, 0.0, 1.0);
    vec4 b = projectionMatrix * modelViewMatrix * vec4(aB, 0.0, 1.0);
    vec2 d = (b.xy - a.xy) * uRes;
    float len = length(d);
    vec2 n = len > 1e-4 ? vec2(-d.y, d.x) / len : vec2(0.0, 1.0);
    vHalf = uWidth * uPt * 0.5;
    vSide = position.y * (vHalf + 1.0);
    vec4 c = mix(a, b, position.x);
    c.xy += n * vSide / uRes * 2.0;
    gl_Position = c;
    vA = aAlpha;
  }
`;
const LINE_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vA;
  varying float vSide;
  varying float vHalf;
  void main() {
    float a = clamp(vHalf + 0.5 - abs(vSide), 0.0, 1.0) * vA;
    if (a <= 0.0) discard;
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
  }
`;
const NODE_VERT = /* glsl */ `
  uniform float uUnit; // drawing buffer px per design unit
  attribute float aSize; // design units across
  attribute float aAlpha;
  varying float vA;
  varying float vSize;
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vSize = max(1.0, aSize * uUnit);
    gl_PointSize = vSize + 2.0;
    vA = aAlpha;
  }
`;
const NODE_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uSquare; // 1: square dots, 0: round
  varying float vA;
  varying float vSize;
  void main() {
    vec2 q = abs(gl_PointCoord - 0.5);
    float r = mix(length(q), max(q.x, q.y), uSquare) * (vSize + 2.0);
    float a = clamp(vSize * 0.5 - r + 0.5, 0.0, 1.0) * vA;
    if (a <= 0.0) discard;
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
  }
`;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (p: number) => p * p * (3 - 2 * p);
const TAU = Math.PI * 2;

// what a drawing writes each frame: lines (alpha relative to lineOpacity)
// and dots (size in design units, alpha relative to nodeOpacity)
export interface Pen {
  line(ax: number, ay: number, bx: number, by: number, alpha: number): void;
  dot(x: number, y: number, size: number, alpha: number): void;
}
interface Cross {
  at: number; // where on this ring (rad)
  ring: number; // the other ring
  there: number; // where on the other ring
  spot: number; // the crossing
}
export interface Drawing {
  readonly square?: boolean; // square dots
  readonly maxLines: number;
  readonly maxDots: number;
  step(dt: number): void;
  draw(pen: Pen): void;
}

/* ─────────────────────────────────────────────────────────
 * SPIDER (API-first)
 *
 *   always   the body walks round a grid of dots that fills the card,
 *            from one spot to the next (WANDER), turning smoothly and
 *            easing in its pace on the turns.
 *            Eight legs, four a side, splayed from its heading, each
 *            holding a dot
 *   a leg    whose dot falls half a STRIDE behind where it would reach
 *            now lets go (unless a leg next to it is mid-step) and
 *            swings in STEP s to a dot half a stride ahead (never the
 *            one next door), inside its own slice round the body so no
 *            two legs cross; the dot it grabs flashes, and a ring of
 *            light bursts out from it over the dots round it, dying
 *            out as it spreads (GLOW s)
 * ───────────────────────────────────────────────────────── */
const SPIDER = {
  grid: 25, // dots a side (the outer ones past the card's edge)
  gap: 18, // between dots
  edge: 216, // where the grid has faded out, from the middle
  legs: [0.45, 1.1, 2.05, 2.7], // rad off the heading, one side (mirrored on the other)
  reach: 99, // a leg's length
  stride: 96, // how far a foot travels in a step: it lets go half a stride
  // behind where the leg would reach, and lands half a stride ahead
  minStep: 58, // a foot never steps to a dot nearer than this to the one it held
  lead: 0.2, // s ahead of the walk a stepping leg aims (the turn)
  step: 0.42, // s a step takes
  speed: 30, // the body's pace, units per s
  turn: 0.55, // rad per s it turns at most: it walks in wide curves, not corners
  wander: 95, // how far from the middle it goes (its legs reach further)
  aim: 1, // rad either side of its heading it picks the next spot
  body: 11, // dot sizes: the body, every grid dot
  dot: 2.5,
  dim: 0.5, // a grid dot's brightness (a held one: full)
  light: 84, // a landing foot sends a ring of light out over the dots, this far
  ring: 8, // the ring's width
  glow: 0.9, // s the ring takes to spread and die out
};
const smoother = (p: number) => p * p * p * (p * (p * 6 - 15) + 10);
class Spider implements Drawing {
  readonly square = true;
  readonly maxLines = SPIDER.legs.length * 2;
  readonly maxDots: number;
  private bx = 0;
  private by = 0;
  private heading = -0.6;
  private spin = 0; // rad per s, eased
  private pace = 0;
  private vx = 0;
  private vy = 0;
  private readonly lights: { x: number; y: number; t: number }[] = []; // where feet landed, s ago
  private readonly holding = new Set<number>(); // the dots held this frame (reused)
  private tx = 0; // where it's walking to
  private ty = 0;
  private readonly dots: { x: number; y: number; fade: number; flash: number }[] = [];
  // each leg: its angle off the heading, the dot it holds, or swings from
  // (from) to (to), p 0..1 through the swing
  // lo/hi: the leg's own slice round the body (rad off the heading, halfway
  // to the legs either side), so no two legs ever cross
  // (prev/next: the legs either side, round the body)
  private readonly legs: { off: number; lo: number; hi: number; prev: number; next: number; from: number; to: number; p: number }[] = [];

  constructor() {
    const { grid, gap, legs } = SPIDER;
    const mid = (grid - 1) / 2;
    for (let j = 0; j < grid; j++)
      for (let i = 0; i < grid; i++) {
        const x = (i - mid) * gap;
        const y = (j - mid) * gap;
        // the grid fades out toward the card's edge, rounder at the corners
        const n = (Math.abs(x) ** 4 + Math.abs(y) ** 4) ** 0.25;
        const fade = smooth(clamp01((SPIDER.edge - n) / (SPIDER.edge / 3)));
        this.dots.push({ x, y, fade, flash: 0 });
      }
    this.maxDots = this.dots.length + legs.length * 2 + 1;
    this.bx = -30;
    this.by = 20;
    this.pick();
    const offs = [...legs, ...legs.map((a) => -a)];
    const round = [...offs].sort((a, b) => a - b);
    for (const off of offs) {
      const k = round.indexOf(off);
      const prev = k > 0 ? round[k - 1] : round[round.length - 1] - TAU;
      const next = k < round.length - 1 ? round[k + 1] : round[0] + TAU;
      const at = (o: number) => offs.indexOf(o);
      const leg = {
        off,
        lo: (prev + off) / 2,
        hi: (off + next) / 2,
        prev: at(round[(k + round.length - 1) % round.length]),
        next: at(round[(k + 1) % round.length]),
        from: -1,
        to: -1,
        p: 1,
      };
      leg.from = leg.to = this.target(leg, new Set(this.legs.map((l) => l.to)));
      this.legs.push(leg);
    }
  }

  // the next spot to walk to: ahead, a little to one side or the other
  // (toward the middle when the card's edge is ahead)
  private pick() {
    const { wander: R, aim } = SPIDER;
    for (let k = 0; k < 30; k++) {
      const a = this.heading + (Math.random() * 2 - 1) * aim * (1 + k / 10);
      const r = 100 + 70 * Math.random();
      const x = this.bx + Math.cos(a) * r;
      const y = this.by + Math.sin(a) * r;
      if (Math.abs(x) < R && Math.abs(y) < R) {
        this.tx = x;
        this.ty = y;
        return;
      }
    }
    this.tx = (Math.random() - 0.5) * R;
    this.ty = (Math.random() - 0.5) * R;
  }

  // the body: turns toward the spot, slowing on sharp turns
  private walk(dt: number) {
    const { speed, turn } = SPIDER;
    const dx = this.tx - this.bx;
    const dy = this.ty - this.by;
    if (Math.hypot(dx, dy) < 45) this.pick();
    let off = Math.atan2(dy, dx) - this.heading;
    off = Math.atan2(Math.sin(off), Math.cos(off));
    const want = Math.max(-turn, Math.min(turn, off * 1.2));
    this.spin += (want - this.spin) * Math.min(1, dt * 3);
    this.heading += this.spin * dt;
    const goal = speed * (0.35 + 0.65 * Math.max(0, Math.cos(off)));
    this.pace += (goal - this.pace) * Math.min(1, dt * 2);
    this.vx = Math.cos(this.heading) * this.pace;
    this.vy = Math.sin(this.heading) * this.pace;
    this.bx += this.vx * dt;
    this.by += this.vy * dt;
  }

  // where leg `off` reaches, `ahead` s ahead of the walk
  private reachOf(off: number, ahead: number) {
    const a = this.heading + this.spin * ahead + off;
    const r = SPIDER.reach;
    return [this.bx + this.vx * ahead + Math.cos(a) * r, this.by + this.vy * ahead + Math.sin(a) * r];
  }

  // the angle from the body to dot i
  private angleTo(i: number) {
    return Math.atan2(this.dots[i].y - this.by, this.dots[i].x - this.bx);
  }

  // whether dot i lies in a leg's slice round the body (`ahead` s ahead of
  // the walk), `margin` rad inside its edges
  private inSlice(i: number, leg: { lo: number; hi: number }, ahead: number, margin: number) {
    const d = this.dots[i];
    const h = this.heading + this.spin * ahead;
    let a = Math.atan2(d.y - (this.by + this.vy * ahead), d.x - (this.bx + this.vx * ahead)) - h;
    a = Math.atan2(Math.sin(a), Math.cos(a));
    // the slice behind the body straddles ±π
    if (leg.hi > Math.PI && a < 0) a += TAU;
    if (leg.lo < -Math.PI && a > 0) a -= TAU;
    return a > leg.lo + margin && a < leg.hi - margin;
  }

  // the free dot nearest half a stride ahead of where leg `off` reaches, at
  // least minStep from the dot it lets go of (or -1 if none would do)
  private target(leg: { off: number; lo: number; hi: number }, taken: Set<number>, from = -1) {
    const [rx, ry] = this.reachOf(leg.off, SPIDER.lead);
    const v = Math.hypot(this.vx, this.vy) || 1;
    const ax = rx + (this.vx / v) * SPIDER.stride * 0.5;
    const ay = ry + (this.vy / v) * SPIDER.stride * 0.5;
    const f = from >= 0 ? this.dots[from] : null;
    let best = -1;
    let bd = Infinity;
    this.dots.forEach((d, i) => {
      if (d.fade < 0.25 || taken.has(i)) return;
      if (f && Math.hypot(d.x - f.x, d.y - f.y) < SPIDER.minStep) return;
      if (!this.inSlice(i, leg, SPIDER.lead, 0.12)) return;
      const dd = Math.hypot(d.x - ax, d.y - ay);
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    });
    return best;
  }

  step(dt: number) {
    const { stride, step } = SPIDER;
    this.walk(dt);
    for (const d of this.dots) d.flash = Math.max(0, d.flash - dt / 0.5);
    for (const l of this.lights) l.t += dt;
    while (this.lights.length && this.lights[0].t > SPIDER.glow) this.lights.shift();
    const n = this.legs.length;
    const half = n / 2;
    this.legs.forEach((leg, k) => {
      if (leg.p < 1) {
        leg.p = Math.min(1, leg.p + dt / step);
        if (leg.p === 1) {
          leg.from = leg.to;
          const d = this.dots[leg.to];
          d.flash = 1;
          this.lights.push({ x: d.x, y: d.y, t: 0 });
        }
        return;
      }
      // a leg next to one mid-step, on its side or across, stays put
      // (a ripple, not all at once)
      const side = k < half ? 0 : half;
      const i = k - side;
      const blocked = (i > 0 && this.legs[side + i - 1].p < 1) || (i < half - 1 && this.legs[side + i + 1].p < 1) || this.legs[(k + half) % n].p < 1;
      const held = this.dots[leg.to];
      const [ax, ay] = this.reachOf(leg.off, 0);
      // a foot about to pass a neighbour's (round the body) steps at once,
      // so no two legs cross
      const a = this.angleTo(leg.to);
      const ahead = (j: number) => Math.atan2(Math.sin(this.angleTo(this.legs[j].to) - a), Math.cos(this.angleTo(this.legs[j].to) - a));
      const out = ahead(leg.next) < 0.15 || ahead(leg.prev) > -0.15;
      if (!out && (blocked || Math.hypot(held.x - ax, held.y - ay) < stride * 0.5)) return;
      const taken = new Set(this.legs.flatMap((l) => [l.to, l.from]));
      const next = this.target(leg, taken, leg.to);
      if (next < 0 || next === leg.to) return;
      leg.from = leg.to;
      leg.to = next;
      leg.p = 0;
    });
  }

  draw(pen: Pen) {
    const { body, dot, dim } = SPIDER;
    const holding = this.holding;
    holding.clear();
    for (const l of this.legs) if (l.p === 1) holding.add(l.to);
    // every grid dot the same size; a held one bright, flashing as it's
    // caught; from a landing foot a ring of light bursts out over the dots
    // round it, fading as it spreads
    const { light, ring, glow } = SPIDER;
    this.dots.forEach((d, i) => {
      if (d.fade <= 0) return;
      let lit = 0;
      for (const l of this.lights) {
        const p = l.t / glow;
        const front = light * (1 - (1 - p) ** 3);
        const r = Math.hypot(d.x - l.x, d.y - l.y);
        if (Math.abs(r - front) < 2.5 * ring) lit = Math.max(lit, Math.exp(-(((r - front) / ring) ** 2)) * (1 - p) ** 2);
      }
      pen.dot(d.x, d.y, dot * (1 + 0.35 * lit), d.fade * ((holding.has(i) ? 1 : dim) + lit) + d.flash);
    });
    for (const leg of this.legs) {
      const a = this.dots[leg.from];
      const b = this.dots[leg.to];
      // mid-step the foot swings over, lifted (drawn in toward the body,
      // as seen from above), the leg dimmer
      const e = smoother(leg.p);
      const lift = Math.sin(Math.PI * leg.p) * 0.22;
      let fx = a.x + (b.x - a.x) * e;
      let fy = a.y + (b.y - a.y) * e;
      fx -= (fx - this.bx) * lift;
      fy -= (fy - this.by) * lift;
      pen.line(this.bx, this.by, fx, fy, 1.4 - 0.6 * Math.sin(Math.PI * leg.p));
      if (leg.p < 1) pen.dot(fx, fy, 3, 0.8);
    }
    pen.dot(this.bx, this.by, body, 1);
  }
}

/* ─────────────────────────────────────────────────────────
 * PENDULUM (Your data stays yours)
 *
 *   always   SPOKES straight lines from dots fixed round a circle to an
 *            empty circle in the middle, where a hidden square places
 *            them: each spoke ends where its dot, run square onto the
 *            square's nearest side, lands (past a side's end: at its
 *            corner), seen from the middle. The square turns clockwise
 *            at an even pace, a quarter turn every QUARTER s (a perfect
 *            loop): the inner ends slide round, bunching at its corners,
 *            spreading along its sides
 *   every EVERY quarters  as the square comes square, a spark sweeps round
 *            clockwise from the top (SWEEP s): on each spoke a pulse runs
 *            out from the middle (RUN s), leaving a glow behind it, and
 *            the outer dot flashes as it arrives (FLASH s): data leaving
 *            for your own stack
 * ───────────────────────────────────────────────────────── */
const PENDULUM = {
  spokes: 48,
  outer: 150, // the circle's radius
  half: 72, // half the square's side
  hole: 72, // the empty middle's radius: the spokes end on this circle
  quarter: 4.5, // s the square takes to turn a quarter (and look the same again)
  outerDot: 4.5,
  innerDot: 3,
  every: 2, // quarter turns from one spark to the next
  sweep: 1.4, // s the spark takes round the circle
  run: 1.3, // s a pulse takes from the middle out
  pulse: 0.1, // the pulse's length, a share of the spoke
  trail: 0.35, // the glow it leaves behind it, a share of the spoke
  flash: 0.6, // s an outer dot glows after the pulse reaches it
  segs: 12, // segments a spoke is drawn in (for the pulse)
};
class Pendulum implements Drawing {
  readonly maxLines = PENDULUM.spokes * PENDULUM.segs;
  readonly maxDots = PENDULUM.spokes * 2;
  private t = PENDULUM.quarter * 0.6;

  step(dt: number) {
    this.t += dt;
  }

  draw(pen: Pen) {
    const { spokes, outer, half, hole, quarter, every, outerDot, innerDot, sweep, run, pulse, trail, flash, segs } = PENDULUM;
    const cycle = quarter * every;
    // clockwise on screen (y up), a quarter turn every `quarter` s, for ever
    const turn = -((this.t / quarter) * Math.PI) / 2;
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * TAU - Math.PI / 2;
      const px = Math.cos(a) * outer;
      const py = Math.sin(a) * outer;
      // the square's side facing this dot: its outward normal n, along it t
      const k = Math.round((a - turn) / (Math.PI / 2));
      const na = turn + (k * Math.PI) / 2;
      const nx = Math.cos(na);
      const ny = Math.sin(na);
      const along = Math.max(-half, Math.min(half, -px * ny + py * nx));
      // its place on the square, brought in along its angle to the circle
      const sx = nx * half - ny * along;
      const sy = ny * half + nx * along;
      const m = hole / Math.hypot(sx, sy);
      const qx = sx * m;
      const qy = sy * m;
      // the pulse: every `every` quarter turns, as the square comes square, a spark
      // sweeps round clockwise from the top (in `sweep` s); on each spoke
      // it reaches, the head runs from the
      // inner end (0) out (1), easing in at the end, lighting the spoke
      // behind it
      const order = (((spokes / 2 - i) % spokes) + spokes) % spokes;
      const since = (((this.t - (order / spokes) * sweep) % cycle) + cycle) % cycle;
      const p = since / run;
      const head = p <= 0 ? -1 : 1 - (1 - Math.min(1, p)) ** 2;
      const fade = p >= 1 ? Math.max(0, 1 - ((p - 1) * run) / flash) : 1;
      for (let sg = 0; sg < segs; sg++) {
        const u0 = sg / segs;
        const u1 = (sg + 1) / segs;
        const u = (u0 + u1) / 2;
        let lit = 0;
        if (head >= 0 && u <= head + pulse) {
          const behind = head - u;
          lit = behind < 0 ? 1 + behind / pulse : behind < pulse ? 1 : Math.max(0, 1 - (behind - pulse) / trail) * 0.5;
          lit *= fade;
        }
        pen.line(qx + (px - qx) * u0, qy + (py - qy) * u0, qx + (px - qx) * u1, qy + (py - qy) * u1, 1 + 1.4 * lit);
      }
      // the outer dot flashes as the pulse arrives
      const glow = p >= 1 ? Math.max(0, 1 - ((p - 1) * run) / flash) : 0;
      pen.dot(px, py, outerDot * (1 + 0.6 * glow), 1);
      pen.dot(qx, qy, innerDot, 1);
    }
  }
}

/* ─────────────────────────────────────────────────────────
 * RINGS (Security posture)
 *
 *   always   a 3 × 3 chain of rings, side by side ones crossing, a dot
 *            on each running round, neighbours turning opposite ways,
 *            each at its own pace that drifts faster and slower (about
 *            a turn every LOOP s); where a dot passes a crossing as the
 *            neighbour's dot is close by, they meet: a small ring of
 *            light spreads and dies out (SPARK s). Each dot trails a
 *            short glow
 *   once a loop (at LOCK s in)  light enters the top left ring and runs
 *            round it the way its dot turns, passing at a crossing into
 *            the next ring, snaking through all nine; when it has been
 *            round the last, the whole chain flashes (locked) and fades
 *            (FADE s), then rests till the next loop
 * ───────────────────────────────────────────────────────── */
const RINGS = {
  radius: 52,
  gap: 75, // between ring centres
  loop: 8, // s a dot takes round its ring, about; the lock pulse comes once in this
  pace: 0.25, // how much the dots' paces differ (share of the average)
  drift: 0.6, // how much a dot speeds up and slows down (share of its pace)
  near: 0.55, // rad: how close the neighbour's dot must be for a meeting
  trail: 1.1, // rad of lit ring behind a dot
  spark: 0.7, // s a meeting's ring of light takes to spread and die out
  sparkSize: 18, // how far it spreads
  lock: 1, // s into each loop the lock pulse sets off
  lap: 0.9, // s the pulse takes round a ring
  fade: 1.2, // s the chain takes to fade once locked
  path: [0, 1, 2, 5, 4, 3, 6, 7, 8], // the rings the pulse runs through (0 top left, row by row)
  segs: 96, // segments a ring is drawn in
  ring: 0.75, // a ring's brightness (share of lineOpacity)
  rider: 7,
};
interface Cross {
  at: number; // where on this ring (rad)
  ring: number; // the other ring
  there: number; // where on the other ring
  spot: number; // the crossing
}
class Rings implements Drawing {
  readonly maxLines: number;
  readonly maxDots: number;
  private t = 0;
  // dir: -1 clockwise (on screen, y up), 1 the other way; its dot: where
  // it set off, its pace (rad per s) and its drift (amplitude rad, rate,
  // phase)
  private readonly rings: { x: number; y: number; dir: number; phase: number; w: number; amp: number; nu: number; psi: number; cross: Cross[] }[] = [];
  private readonly spots: { x: number; y: number; t: number }[] = []; // the crossings, s since a meeting sparked there
  // the lock pulse through each ring of the path: when it enters (s into
  // the pulse), where, and the way round
  private readonly pulse: { ring: number; at: number; from: number }[] = [];
  private readonly pulseOf: ({ ring: number; at: number; from: number } | undefined)[] = []; // the same, by ring
  private locked = 0; // s into the pulse the chain locks
  private readonly SPARK_SEGS = 24;

  constructor() {
    const { radius, gap, segs, path, lap } = RINGS;
    for (let j = 0; j < 3; j++)
      for (let i = 0; i < 3; i++) {
        // neighbours turn opposite ways, like gears; each dot at its own
        // pace, drifting faster and slower (never stopping or turning back)
        const r = Math.random;
        const w = (TAU / RINGS.loop) * (1 + RINGS.pace * (2 * r() - 1));
        const nu = 0.5 + 0.9 * r();
        this.rings.push({
          x: (i - 1) * gap,
          y: (1 - j) * gap,
          dir: (i + j) % 2 ? 1 : -1,
          phase: r() * TAU,
          w,
          amp: (RINGS.drift * w) / nu,
          nu,
          psi: r() * TAU,
          cross: [],
        });
      }
    // where side by side rings cross: two points each pair
    this.rings.forEach((a, ia) =>
      this.rings.forEach((b, ib) => {
        if (ib <= ia) return;
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        if (d >= 2 * radius) return;
        const base = Math.atan2(b.y - a.y, b.x - a.x);
        const off = Math.acos(d / (2 * radius));
        for (const sg of [-1, 1]) {
          const at = base + sg * off;
          const x = a.x + Math.cos(at) * radius;
          const y = a.y + Math.sin(at) * radius;
          const spot = this.spots.push({ x, y, t: Infinity }) - 1;
          const there = Math.atan2(y - b.y, x - b.x);
          a.cross.push({ at: wrap(at), ring: ib, there: wrap(there), spot });
          b.cross.push({ at: wrap(there), ring: ia, there: wrap(at), spot });
        }
      }),
    );
    // the lock pulse's way through the path: into each ring where it
    // left the last, round the way its dot turns to the first crossing
    // with the next
    const speed = TAU / lap;
    let at = 0;
    let from = (3 * Math.PI) / 4; // into the first from the top left
    path.forEach((ri, k) => {
      const r = this.rings[ri];
      this.pulse.push((this.pulseOf[ri] = { ring: ri, at, from }));
      if (k === path.length - 1) {
        this.locked = at + lap;
        return;
      }
      let best: Cross | null = null;
      let arc = Infinity;
      for (const c of r.cross) {
        if (c.ring !== path[k + 1]) continue;
        const a = wrap((c.at - from) * r.dir);
        if (a > 0.3 && a < arc) {
          arc = a;
          best = c;
        }
      }
      at += arc / speed;
      from = best!.there;
    });
    this.maxLines = 9 * segs + this.spots.length * this.SPARK_SEGS;
    this.maxDots = this.spots.length + 9;
  }

  // ring r's dot, at time t
  private angle(r: number, t: number) {
    const g = this.rings[r];
    return g.phase + g.dir * (g.w * t + g.amp * Math.sin(g.nu * t + g.psi));
  }

  step(dt: number) {
    const before = this.t;
    this.t += dt;
    for (const s of this.spots) s.t += dt;
    // meetings: a dot passing one of its ring's crossings as the
    // neighbour's dot is close to it
    this.rings.forEach((ring, r) => {
      const a0 = this.angle(r, before);
      const moved = wrap((this.angle(r, this.t) - a0) * ring.dir);
      for (const c of ring.cross) {
        const ahead = wrap((c.at - a0) * ring.dir);
        if (!(ahead > 0 && ahead <= moved)) continue;
        const other = this.angle(c.ring, this.t);
        if (Math.abs(Math.atan2(Math.sin(other - c.there), Math.cos(other - c.there))) < RINGS.near) this.spots[c.spot].t = 0;
      }
    });
  }

  draw(pen: Pen) {
    const { radius, segs, trail, ring, rider, spark, sparkSize, lock, lap, fade, loop } = RINGS;
    const speed = TAU / lap;
    // the lock pulse, s since it set off this loop
    const p = (((this.t - lock) % loop) + loop) % loop;
    const glow = p < this.locked ? 1 : Math.max(0, 1 - (p - this.locked) / fade);
    const flash = p < this.locked ? 0 : Math.exp(-(p - this.locked) / 0.3);
    this.rings.forEach((c, ic) => {
      const dot = this.angle(ic, this.t);
      const q = this.pulseOf[ic];
      // how far round the pulse has run on this ring (rad), if it's reached it
      const swept = q && p >= q.at ? Math.min(TAU, (p - q.at) * speed) : -1;
      for (let sg = 0; sg < segs; sg++) {
        const a0 = (sg / segs) * TAU;
        const a1 = ((sg + 1) / segs) * TAU;
        const mid = (a0 + a1) / 2;
        // the dot's trail
        const back = wrap((dot - mid) * c.dir);
        let l = back < trail ? (1 - back / trail) ** 2 : 0;
        // the lock pulse: bright at its head, a glow behind it till the
        // chain fades
        if (swept >= 0 && q) {
          const off = wrap((mid - q.from) * c.dir);
          if (off <= swept) l = Math.max(l, glow * (0.35 + 0.9 * Math.exp(-(swept - off) / 0.5)));
        }
        l += flash;
        pen.line(c.x + Math.cos(a0) * radius, c.y + Math.sin(a0) * radius, c.x + Math.cos(a1) * radius, c.y + Math.sin(a1) * radius, ring + 1.6 * l);
      }
    });
    // the meetings' sparks: a small ring of light spreading from the crossing
    const n = this.SPARK_SEGS;
    for (const s of this.spots) {
      if (s.t >= spark) continue;
      const k = s.t / spark;
      const r = 3 + sparkSize * (1 - (1 - k) ** 3);
      const a = 1.6 * (1 - k) ** 2;
      for (let sg = 0; sg < n; sg++) {
        const a0 = (sg / n) * TAU;
        const a1 = ((sg + 1) / n) * TAU;
        pen.line(s.x + Math.cos(a0) * r, s.y + Math.sin(a0) * r, s.x + Math.cos(a1) * r, s.y + Math.sin(a1) * r, a);
      }
      pen.dot(s.x, s.y, 3 + 4 * (1 - k), 1 - k);
    }
    this.rings.forEach((c, ic) => {
      const a = this.angle(ic, this.t);
      pen.dot(c.x + Math.cos(a) * radius, c.y + Math.sin(a) * radius, rider, 1);
    });
  }
}
const wrap = (a: number) => ((a % TAU) + TAU) % TAU;

const DRAWINGS: Record<string, () => Drawing> = {
  spider: () => new Spider(),
  pendulum: () => new Pendulum(),
  rings: () => new Rings(),
};

// More drawings, from outside the shipped chunk (the export lab's): `kind`
// then picks them like the three above.
export function registerDrawing(kind: string, make: () => Drawing) {
  DRAWINGS[kind] = make;
}
// the maker a kind has now (to wrap it from outside)
export const drawingMaker = (kind: string): (() => Drawing) | undefined => DRAWINGS[kind];

export class GlyphScene {
  readonly root = new Group();
  readonly camera = new OrthographicCamera(-1, 1, 1, -1, -10, 10);
  private readonly cfg: GlyphConfig;
  private readonly drawing: Drawing;
  private readonly nodeGeo = new BufferGeometry();
  private readonly lineGeo = new InstancedBufferGeometry();
  private readonly nodeMat: ShaderMaterial;
  private readonly lineMat: ShaderMaterial;
  private readonly nodePos: BufferAttribute;
  private readonly nodeSize: BufferAttribute;
  private readonly nodeAlpha: BufferAttribute;
  private readonly lineA: InstancedBufferAttribute;
  private readonly lineB: InstancedBufferAttribute;
  private readonly lineAlpha: InstancedBufferAttribute;
  private reduced = false;

  constructor(cfg: GlyphConfig) {
    this.cfg = cfg;
    this.drawing = (DRAWINGS[cfg.kind] ?? DRAWINGS.spider)();
    const { maxLines: L, maxDots: D } = this.drawing;

    this.nodePos = new BufferAttribute(new Float32Array(D * 3), 3);
    this.nodeSize = new BufferAttribute(new Float32Array(D), 1);
    this.nodeAlpha = new BufferAttribute(new Float32Array(D), 1);
    this.nodeGeo.setAttribute("position", this.nodePos);
    this.nodeGeo.setAttribute("aSize", this.nodeSize);
    this.nodeGeo.setAttribute("aAlpha", this.nodeAlpha);
    this.nodeMat = new ShaderMaterial({
      uniforms: { uColor: { value: new Color(cfg.color) }, uUnit: { value: 1 }, uSquare: { value: this.drawing.square ? 1 : 0 } },
      vertexShader: NODE_VERT,
      fragmentShader: NODE_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });
    const pts = new Points(this.nodeGeo, this.nodeMat);
    pts.frustumCulled = false;
    pts.renderOrder = 2;

    const g = this.lineGeo;
    g.setAttribute("position", new Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.lineA = new InstancedBufferAttribute(new Float32Array(L * 2), 2);
    this.lineB = new InstancedBufferAttribute(new Float32Array(L * 2), 2);
    this.lineAlpha = new InstancedBufferAttribute(new Float32Array(L), 1);
    g.setAttribute("aA", this.lineA);
    g.setAttribute("aB", this.lineB);
    g.setAttribute("aAlpha", this.lineAlpha);
    this.lineMat = new ShaderMaterial({
      uniforms: {
        uColor: { value: new Color(cfg.color) },
        uPt: { value: 1 },
        uRes: { value: new Vector2(1, 1) },
        uWidth: { value: cfg.lineWidth },
      },
      vertexShader: LINE_VERT,
      fragmentShader: LINE_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });
    const mesh = new Mesh(g, this.lineMat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    this.root.add(mesh, pts);
    this.draw();
  }

  setReducedMotion(on: boolean) {
    this.reduced = on;
  }

  setSize(w: number, h: number, dpr: number) {
    // the card fills the canvas' short side (at zoom 1)
    const unit = (Math.min(w, h) / CARD) * this.cfg.zoom; // CSS px per design unit
    const cam = this.camera;
    cam.left = -w / 2 / unit;
    cam.right = w / 2 / unit;
    cam.top = h / 2 / unit;
    cam.bottom = -h / 2 / unit;
    cam.updateProjectionMatrix();
    this.lineMat.uniforms.uPt.value = dpr;
    this.lineMat.uniforms.uRes.value.set(w * dpr, h * dpr);
    this.nodeMat.uniforms.uUnit.value = unit * dpr;
  }

  private draw() {
    const c = this.cfg;
    const pos = this.nodePos.array as Float32Array;
    const size = this.nodeSize.array as Float32Array;
    const na = this.nodeAlpha.array as Float32Array;
    const la = this.lineA.array as Float32Array;
    const lb = this.lineB.array as Float32Array;
    const al = this.lineAlpha.array as Float32Array;
    let nl = 0;
    let nd = 0;
    const { maxLines, maxDots } = this.drawing;
    this.drawing.draw({
      line(ax, ay, bx, by, alpha) {
        if (nl >= maxLines) return;
        la[nl * 2] = ax;
        la[nl * 2 + 1] = ay;
        lb[nl * 2] = bx;
        lb[nl * 2 + 1] = by;
        al[nl] = Math.min(1, c.lineOpacity * alpha);
        nl++;
      },
      dot(x, y, s, alpha) {
        if (nd >= maxDots) return;
        pos[nd * 3] = x;
        pos[nd * 3 + 1] = y;
        pos[nd * 3 + 2] = 0;
        size[nd] = s;
        na[nd] = Math.min(1, c.nodeOpacity * alpha);
        nd++;
      },
    });
    this.lineGeo.instanceCount = nl;
    this.nodeGeo.setDrawRange(0, nd);
    this.nodePos.needsUpdate = true;
    this.nodeSize.needsUpdate = true;
    this.nodeAlpha.needsUpdate = true;
    this.lineA.needsUpdate = true;
    this.lineB.needsUpdate = true;
    this.lineAlpha.needsUpdate = true;
  }

  /** Advances the drawing; true while it moves (always, unless reduced). */
  update(dt: number): boolean {
    if (this.reduced) return false;
    // (a long frame, e.g. back from a hidden tab, doesn't jump)
    this.drawing.step(Math.min(dt, 0.1) * this.cfg.speed);
    this.draw();
    return true;
  }

  dispose() {
    this.nodeGeo.dispose();
    this.lineGeo.dispose();
    this.nodeMat.dispose();
    this.lineMat.dispose();
    this.root.removeFromParent();
  }
}

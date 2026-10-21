// The integrations network (type "blocks"): boxes packed together, drawn
// as a network of nodes and lines, morphing from one shape to the next (a
// cube, a cross, a diamond, a frame, a skyline, a checkerboard, a hub). A
// node on every box corner, a line along every box edge (the inside ones
// fainter). To morph, the nodes travel to their places in the next shape,
// swirling on the way and settling past the mark, and the lines stay on
// them; lines only one of the shapes has fade in or out. Fast movement
// blurs: nodes and lines soften and moving nodes leave a short streak. As
// the new shape locks in, a bolt of light branches through it from its top
// node, line by line. See-through, the far side dimmer, turning slowly
// (faster while morphing). Loaded as its own chunk (engine.ts), like the
// spatial map.
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
import type { BlocksConfig } from "./defaults";

/* ─────────────────────────────────────────────────────────
 * STORYBOARD (one shape to the next)
 *
 *   0            the shape holds (holdTime), turning slowly
 *   holdTime     the nodes set off one after another, those bound for the
 *                bottom of the next shape first (spread over `stagger` s);
 *                each travels to its place in morphTime, swirling on the
 *                way (and bursting out, with `burst`), the lines on it
 *                stretching along, blurred by their speed;
 *                the turn speeds up (spinKick)
 *   landed       a bolt branches through the new shape from its top node
 *                (boltStep s a line), fading behind (boltFade)
 *   then         the next shape holds; after the last, the first again
 * ───────────────────────────────────────────────────────── */

// a shape: filled cells of a grid (i across, j up, k deep), the cells'
// width and height
export interface Cells {
  cells: [number, number, number][];
  size: number;
  height: number;
}

// every shape is about 3 units across
const SKYLINE = [
  [2, 4, 1, 3, 5, 2],
  [3, 6, 2, 4, 1, 3],
  [1, 3, 5, 2, 4, 2],
  [4, 2, 3, 6, 2, 1],
  [2, 5, 1, 3, 4, 3],
  [1, 2, 4, 2, 1, 2],
];
const SHAPES: Record<string, () => Cells> = {
  // 5 × 5 × 5
  cube: () => fill(5, 5, () => 5, 0.6),
  // stepped octahedron
  diamond: () => pick(7, (i, j, k) => Math.abs(i - 3) + Math.abs(j - 3) + Math.abs(k - 3) <= 3, 3 / 7),
  // a cube's 12 edges, two boxes thick
  frame: () => pick(6, (i, j, k) => [i, j, k].filter((x) => x < 2 || x > 3).length >= 2, 0.5),
  // a 3D checkerboard of 2 × 2 × 2 blocks
  checker: () => pick(6, (i, j, k) => (Math.floor(i / 2) + Math.floor(j / 2) + Math.floor(k / 2)) % 2 === 0, 0.5),
  // a solid core with a block out of every face
  hub: () =>
    pick(6, (i, j, k) => {
      const core = [i, j, k].every((x) => x >= 1 && x <= 4);
      const arm = [i, j, k].filter((x) => x === 2 || x === 3).length >= 2;
      return core || arm;
    }, 0.5),
  // towers of different heights
  skyline: () => fill(6, 6, (i, k) => SKYLINE[i][k], 0.5, 0.6),
  // three bars through the middle, two boxes thick
  cross: () => pick(6, (i, j, k) => [i, j, k].filter((x) => x === 2 || x === 3).length >= 2, 0.5),
};
export function fill(nx: number, nz: number, levels: (i: number, k: number) => number, size: number, height = size): Cells {
  const cells: [number, number, number][] = [];
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) for (let j = 0; j < levels(i, k); j++) cells.push([i, j, k]);
  return { cells, size, height };
}
export function pick(n: number, inside: (i: number, j: number, k: number) => boolean, size: number): Cells {
  const cells: [number, number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) if (inside(i, j, k)) cells.push([i, j, k]);
  return { cells, size, height: size };
}

// More shapes, from outside the shipped chunk (the export lab's): `shapes`
// then names them like the seven above. A block shape is cells; a line
// shape is its network as it is (nodes in units, centred; lines between
// them, outer or inner), for shapes that aren't boxes. `hidden` nodes draw
// no dot (the points along a curve), their lines as usual.
export type Net = { pos: number[][]; lines: [number, number, boolean][]; outer: boolean[]; hidden?: boolean[] };
const LINE_SHAPES: Record<string, () => Net> = {};
export function registerBlockShape(name: string, make: () => Cells) {
  SHAPES[name] = make;
}
export function registerLineShape(name: string, make: () => Net) {
  LINE_SHAPES[name] = make;
}

// a shape's network: nodes (positions, centred, and whether they're on the
// outside) and lines (node pairs, and whether they're on the outside)
function network({ cells, size, height }: Cells) {
  const has = new Set(cells.map((c) => c.join(",")));
  const filled = (i: number, j: number, k: number) => has.has(`${i},${j},${k}`);
  const ids = new Map<string, number>();
  const nodes: number[][] = [];
  const node = (p: number[]) => {
    const key = p.join(",");
    let id = ids.get(key);
    if (id === undefined) {
      id = nodes.length;
      ids.set(key, id);
      nodes.push(p);
    }
    return id;
  };
  const lines: [number, number, boolean][] = [];
  const done = new Set<string>();
  for (const [i, j, k] of cells)
    for (let ax = 0; ax < 3; ax++) {
      const [u, v] = [(ax + 1) % 3, (ax + 2) % 3];
      for (const a of [0, 1])
        for (const b of [0, 1]) {
          // the edge along axis ax at this cell's corner (a, b)
          const p = [i, j, k];
          p[u] += a;
          p[v] += b;
          const q = [...p];
          q[ax] += 1;
          const key = p.join(",") + "|" + ax;
          if (done.has(key)) continue;
          done.add(key);
          let around = 0;
          for (const da of [-1, 0])
            for (const db of [-1, 0]) {
              const c = [...p];
              c[u] += da;
              c[v] += db;
              if (filled(c[0], c[1], c[2])) around++;
            }
          // an edge with all four cells around it filled is inside
          lines.push([node(p), node(q), around < 4]);
        }
    }
  // centred, in units
  const lo = [0, 1, 2].map((a) => Math.min(...nodes.map((n) => n[a])));
  const hi = [0, 1, 2].map((a) => Math.max(...nodes.map((n) => n[a])));
  const pos = nodes.map((n) => n.map((x, a) => (x - (lo[a] + hi[a]) / 2) * (a === 1 ? height : size)));
  const outer = new Array(nodes.length).fill(false);
  for (const [a, b, out] of lines) if (out) outer[a] = outer[b] = true;
  return { pos, lines, outer };
}

const LINE_VERT = /* glsl */ `
  uniform float uPt;
  uniform vec2 uRes; // drawing buffer, px
  uniform float uWidth;
  uniform float uBlur; // px a line spreads at full speed
  attribute vec3 aA;
  attribute vec3 aB;
  attribute float aAlpha;
  attribute vec3 aBolt; // the bolt on it: head (0..1 from the end it enters by), brightness, entering at B (1) or A (0)
  attribute float aBlur; // 0 still .. 1 moving fast
  varying float vA;
  varying float vSide;
  varying float vHalf;
  varying float vSoft;
  varying float vX;
  varying vec3 vBolt;
  void main() {
    vec4 a = projectionMatrix * modelViewMatrix * vec4(aA, 1.0);
    vec4 b = projectionMatrix * modelViewMatrix * vec4(aB, 1.0);
    vec2 d = (b.xy - a.xy) * uRes;
    float len = length(d);
    vec2 n = len > 1e-4 ? vec2(-d.y, d.x) / len : vec2(0.0, 1.0);
    // moving fast, a line spreads and softens (and dims, as much light
    // over more width)
    float spread = aBlur * uBlur;
    vHalf = uWidth * uPt * (0.5 + 0.4 * aBolt.y) + 0.5;
    vSoft = 1.0 + spread;
    vSide = position.y * (vHalf + spread + 0.5);
    vX = mix(position.x, 1.0 - position.x, aBolt.z);
    vBolt = aBolt;
    vec4 c = mix(a, b, position.x);
    c.xy += n * vSide / uRes * 2.0;
    gl_Position = c;
    vA = aAlpha / (1.0 + 1.5 * aBlur);
  }
`;
const LINE_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vA;
  varying float vSide;
  varying float vHalf;
  varying float vSoft;
  varying float vX;
  varying vec3 vBolt;
  void main() {
    // lit behind the head, brightest at it
    float lit = step(vX, vBolt.x) * vBolt.y * (0.45 + 0.55 * smoothstep(vBolt.x - 0.5, vBolt.x, vX));
    float a = clamp((vHalf + 0.5 * (vSoft - 1.0) - abs(vSide)) / vSoft, 0.0, 1.0) * min(1.0, vA + lit);
    if (a <= 0.0) discard;
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
  }
`;
const NODE_VERT = /* glsl */ `
  uniform float uSize;
  uniform float uBlur;
  attribute float aAlpha;
  attribute float aFlash;
  attribute float aBlur;
  varying float vA;
  varying float vSize;
  varying float vSoft;
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vSize = uSize * (1.0 + 0.9 * aFlash) + aBlur * uBlur;
    vSoft = 1.0 + 0.5 * aBlur * uBlur;
    gl_PointSize = vSize + vSoft;
    vA = min(1.0, aAlpha + aFlash) / (1.0 + 1.5 * aBlur);
  }
`;
const NODE_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vA;
  varying float vSize;
  varying float vSoft;
  void main() {
    float r = length(gl_PointCoord - 0.5) * (vSize + vSoft);
    float a = clamp((vSize * 0.5 - r) / vSoft + 0.5, 0.0, 1.0) * vA;
    if (a <= 0.0) discard;
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
  }
`;

const smoother = (p: number) => p * p * p * (p * (p * 6 - 15) + 10);
// in-out with a pull back first and a settle past the mark (easeInOutBack, scaled)
function easeBack(p: number, overshoot: number) {
  const c = 1.70158 * overshoot * 1.525;
  return p < 0.5 ? ((2 * p) ** 2 * ((c + 1) * 2 * p - c)) / 2 : ((2 * p - 2) ** 2 * ((c + 1) * (p * 2 - 2) + c) + 2) / 2;
}
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export class BlocksScene {
  readonly root = new Group();
  readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  private readonly cfg: BlocksConfig;
  // per shape: every node's place, and whether it's in the shape (ghost
  // nodes sit on a real one, unseen)
  private readonly places: Float32Array[] = [];
  private readonly real: Float32Array[] = []; // 1 outside, `inner` inside, 0 a ghost
  // every line any shape has, and which shapes have it
  private readonly lines: { a: number; b: number; in: Float32Array }[] = [];
  private readonly n: number;
  private readonly delay: Float32Array;
  private readonly swirl: Float32Array; // each node's share of the swirl
  // the bolt: when it reaches each node (Infinity: not), and the lines it
  // runs along (entered from their a end, or b), when it enters and leaves
  private readonly hit: Float32Array;
  private readonly boltIn: Float32Array;
  private readonly boltOut: Float32Array;
  private readonly boltFromB: Uint8Array;
  private boltClock = -Infinity; // s since the last bolt (none yet: never reached)
  private readonly now: Float32Array; // node positions this frame
  private readonly nodeGeo = new BufferGeometry();
  private readonly lineGeo = new InstancedBufferGeometry();
  private readonly nodeMat: ShaderMaterial;
  private readonly lineMat: ShaderMaterial;
  private readonly nodePos: BufferAttribute;
  private readonly nodeAlpha: BufferAttribute;
  private readonly nodeFlash: BufferAttribute;
  private readonly lineA: InstancedBufferAttribute;
  private readonly lineB: InstancedBufferAttribute;
  private readonly lineAlpha: InstancedBufferAttribute;
  private readonly lineBolt: InstancedBufferAttribute;
  private readonly radius: number;
  private readonly reach = { x: 0, y: 0 };
  // the canvas' height, CSS px, and the camera's half height in units
  private cssH = 1;
  private half = 1;
  // each node's screen place last frame (units) and its blur, 0..1
  private prevScreen: Float32Array | null = null;
  private blur!: Float32Array;
  // where each node's streak trails from (it lags the node by about `streak` s)
  private trail: Float32Array | null = null;
  private nodeBlur!: BufferAttribute;
  private lineBlurAttr!: InstancedBufferAttribute; // the farthest any shape gets from the centre on screen, as it turns
  private shape = 0; // the shape held, or being morphed into
  private from = 0;
  private clock = 0; // s into the hold, then the morph
  private morphing = false;
  private turn = 0.25; // starts off the straight isometric view, where the far grid lines up behind the near one
  private aspect = 1;
  private reduced = false;

  constructor(cfg: BlocksConfig) {
    this.cfg = cfg;
    const names = cfg.shapes
      .split(",")
      .map((s) => s.trim())
      .filter((s) => SHAPES[s] || LINE_SHAPES[s]);
    const nets = (names.length ? names : ["cube"]).map((n) => (LINE_SHAPES[n] ? LINE_SHAPES[n]() : network(SHAPES[n]())));
    // every shape at least as tall on screen as the first, at any point of the turn
    // (screen y is (2y - x - z) / sqrt 6 after the turn), but no wider
    // than a quarter more than it
    const measure = (pos: number[][]) => {
      let tall = Infinity;
      let mid = 0;
      for (let a = 0; a < 12; a++) {
        const cs = Math.cos((a * Math.PI) / 6);
        const sn = Math.sin((a * Math.PI) / 6);
        let lo = Infinity;
        let hi = -Infinity;
        for (const [x, y, z] of pos) {
          const sy = 2 * y - (x * cs + z * sn) - (-x * sn + z * cs);
          lo = Math.min(lo, sy);
          hi = Math.max(hi, sy);
        }
        tall = Math.min(tall, hi - lo);
        mid += (hi + lo) / 24;
      }
      return { tall, mid, wide: Math.max(...pos.map(([x, , z]) => Math.hypot(x, z))) };
    };
    const ref = measure(nets[0].pos);
    nets.forEach((net) => {
      const m = measure(net.pos);
      const k = Math.min(ref.tall / m.tall, (ref.wide * 1.25) / m.wide);
      for (const p of net.pos) {
        for (let a = 0; a < 3; a++) p[a] *= k;
        // centred on screen, not just in space (a skyline leans back)
        p[1] -= (m.mid * k) / 2;
      }
    });
    const N = (this.n = Math.max(...nets.map((s) => s.pos.length)));

    // node i of one shape becomes node i of the next: each takes the
    // nearest free place of the next shape, so the network moves as a whole
    const r = Math.random;
    let prev: number[][] | null = null;
    const lineMap = new Map<string, Float32Array>();
    nets.forEach((net, s) => {
      const count = net.pos.length;
      // the shape's places, padded with ghosts on random real nodes
      const slots = net.pos.map((p, i) => ({ p, real: true, id: i }));
      while (slots.length < N) {
        const k = Math.floor(r() * count);
        slots.push({ p: net.pos[k], real: false, id: -1 });
      }
      const assign: typeof slots = new Array(N);
      if (!prev) slots.forEach((sl, i) => (assign[i] = sl));
      else {
        const free = new Set(slots.map((_, i) => i));
        const order = Array.from({ length: N }, (_, i) => i).sort(() => r() - 0.5);
        // real places first, so no real node is left to a far-off ghost
        for (const pass of [true, false])
          for (const i of order) {
            if (assign[i]) continue;
            let best = -1;
            let bd = Infinity;
            for (const j of free) {
              if (slots[j].real !== pass) continue;
              const d = (slots[j].p[0] - prev[i][0]) ** 2 + (slots[j].p[1] - prev[i][1]) ** 2 + (slots[j].p[2] - prev[i][2]) ** 2;
              if (d < bd) {
                bd = d;
                best = j;
              }
            }
            if (best < 0) continue;
            assign[i] = slots[best];
            free.delete(best);
          }
      }
      const place = new Float32Array(N * 3);
      const real = new Float32Array(N);
      const index = new Map<number, number>(); // the shape's node id -> network node
      assign.forEach((sl, i) => {
        place.set(sl.p, i * 3);
        real[i] = sl.real ? ((net as Net).hidden?.[sl.id] ? 0 : net.outer[sl.id] ? 1 : cfg.inner) : 0;
        if (sl.real) index.set(sl.id, i);
      });
      this.places.push(place);
      this.real.push(real);
      for (const [a, b, out] of net.lines) {
        const u = index.get(a)!;
        const v = index.get(b)!;
        const key = u < v ? `${u},${v}` : `${v},${u}`;
        let on = lineMap.get(key);
        if (!on) lineMap.set(key, (on = new Float32Array(nets.length)));
        on[s] = out ? 1 : cfg.inner;
      }
      prev = assign.map((sl) => sl.p);
    });
    for (const [key, on] of lineMap) {
      const [a, b] = key.split(",").map(Number);
      this.lines.push({ a, b, in: on });
    }
    this.radius = Math.max(...this.places.map((pl) => Math.max(...Array.from({ length: N }, (_, i) => Math.hypot(pl[i * 3], pl[i * 3 + 1], pl[i * 3 + 2])))));
    // screen x is (x - z) / sqrt 2, screen y (2y - x - z) / sqrt 6, after the turn
    for (const pl of this.places)
      for (let a = 0; a < 24; a++) {
        const cs = Math.cos((a * Math.PI) / 12);
        const sn = Math.sin((a * Math.PI) / 12);
        for (let i = 0; i < N; i++) {
          const x = pl[i * 3] * cs + pl[i * 3 + 2] * sn;
          const z = -pl[i * 3] * sn + pl[i * 3 + 2] * cs;
          this.reach.x = Math.max(this.reach.x, Math.abs(x - z) / Math.SQRT2);
          this.reach.y = Math.max(this.reach.y, Math.abs(2 * pl[i * 3 + 1] - x - z) / Math.sqrt(6));
        }
      }

    this.delay = new Float32Array(N);
    this.swirl = Float32Array.from({ length: N }, () => 0.6 + 0.4 * r());
    this.hit = new Float32Array(N).fill(Infinity);
    const E0 = this.lines.length;
    this.boltIn = new Float32Array(E0).fill(Infinity);
    this.boltOut = new Float32Array(E0).fill(Infinity);
    this.boltFromB = new Uint8Array(E0);
    this.now = new Float32Array(this.places[0]);

    // the nodes
    this.nodePos = new BufferAttribute(new Float32Array(N * 3), 3);
    this.nodeAlpha = new BufferAttribute(new Float32Array(N), 1);
    this.nodeGeo.setAttribute("position", this.nodePos);
    this.nodeGeo.setAttribute("aAlpha", this.nodeAlpha);
    this.nodeFlash = new BufferAttribute(new Float32Array(N), 1);
    this.nodeGeo.setAttribute("aFlash", this.nodeFlash);
    this.blur = new Float32Array(N);
    this.nodeBlur = new BufferAttribute(new Float32Array(N), 1);
    this.nodeGeo.setAttribute("aBlur", this.nodeBlur);
    this.nodeMat = new ShaderMaterial({
      uniforms: { uColor: { value: new Color(cfg.color) }, uSize: { value: cfg.nodeSize }, uBlur: { value: cfg.blur } },
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

    // the lines: a screen-space quad each
    // the lines, then one streak per node (drawn as a line from where it
    // trails to where it is, faint to bright)
    const E = this.lines.length + N;
    const g = this.lineGeo;
    g.setAttribute("position", new Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.lineA = new InstancedBufferAttribute(new Float32Array(E * 3), 3);
    this.lineB = new InstancedBufferAttribute(new Float32Array(E * 3), 3);
    this.lineAlpha = new InstancedBufferAttribute(new Float32Array(E), 1);
    g.setAttribute("aA", this.lineA);
    g.setAttribute("aB", this.lineB);
    g.setAttribute("aAlpha", this.lineAlpha);
    this.lineBolt = new InstancedBufferAttribute(new Float32Array(E * 3), 3);
    g.setAttribute("aBolt", this.lineBolt);
    this.lineBlurAttr = new InstancedBufferAttribute(new Float32Array(E), 1);
    g.setAttribute("aBlur", this.lineBlurAttr);
    g.instanceCount = E;
    this.lineMat = new ShaderMaterial({
      uniforms: {
        uColor: { value: new Color(cfg.color) },
        uPt: { value: 1 },
        uRes: { value: new Vector2(1, 1) },
        uWidth: { value: cfg.lineWidth },
        uBlur: { value: cfg.blur },
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
    if (!on) return;
    // the first shape, still
    this.shape = this.from = 0;
    this.morphing = false;
    this.now.set(this.places[0]);
    this.draw();
  }

  setSize(w: number, h: number, dpr: number) {
    this.aspect = w / h;
    this.cssH = h;
    this.lineMat.uniforms.uPt.value = dpr;
    this.lineMat.uniforms.uRes.value.set(w * dpr, h * dpr);
    this.lineMat.uniforms.uBlur.value = this.cfg.blur * dpr;
    this.nodeMat.uniforms.uSize.value = this.cfg.nodeSize * dpr;
    this.nodeMat.uniforms.uBlur.value = this.cfg.blur * dpr;
    this.frame();
  }

  private startMorph() {
    const c = this.cfg;
    this.from = this.shape;
    this.shape = (this.shape + 1) % this.places.length;
    // those bound for the bottom of the next shape first, a little out of step
    const to = this.places[this.shape];
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < this.n; i++) {
      lo = Math.min(lo, to[i * 3 + 1]);
      hi = Math.max(hi, to[i * 3 + 1]);
    }
    for (let i = 0; i < this.n; i++) {
      const h = hi > lo ? (to[i * 3 + 1] - lo) / (hi - lo) : 0;
      this.delay[i] = c.stagger * (0.7 * h + 0.3 * Math.random());
    }
    this.morphing = true;
    this.clock = 0;
  }

  // a bolt through the shape held, from its top node: each line takes
  // about boltStep s, a little more or less, and the bolt follows the
  // quickest way to every node, so it branches
  private strike() {
    const c = this.cfg;
    const s = this.shape;
    const P = this.places[s];
    const real = this.real[s];
    const adj: [number, number][][] = Array.from({ length: this.n }, () => []);
    this.lines.forEach((l, k) => {
      if (!l.in[s]) return;
      adj[l.a].push([l.b, k]);
      adj[l.b].push([l.a, k]);
    });
    let seed = -1;
    for (let i = 0; i < this.n; i++) if (real[i] && (seed < 0 || P[i * 3 + 1] > P[seed * 3 + 1] + 1e-6 || (Math.abs(P[i * 3 + 1] - P[seed * 3 + 1]) < 1e-6 && Math.random() < 0.5))) seed = i;
    this.hit.fill(Infinity);
    this.boltIn.fill(Infinity);
    this.boltOut.fill(Infinity);
    if (seed < 0) return;
    this.hit[seed] = 0;
    const done = new Uint8Array(this.n);
    // (a few hundred nodes: a plain scan for the nearest is quick enough)
    for (;;) {
      let u = -1;
      for (let i = 0; i < this.n; i++) if (!done[i] && this.hit[i] < Infinity && (u < 0 || this.hit[i] < this.hit[u])) u = i;
      if (u < 0) break;
      done[u] = 1;
      for (const [v, k] of adj[u]) {
        const t = this.hit[u] + c.boltStep * (0.4 + 1.2 * Math.random());
        if (t < this.hit[v]) {
          this.hit[v] = t;
          this.boltIn[k] = this.hit[u];
          this.boltOut[k] = t;
          this.boltFromB[k] = this.lines[k].b === u ? 1 : 0;
        }
      }
    }
    // only the lines the bolt reached each node by
    this.lines.forEach((l, k) => {
      if (this.boltOut[k] === Infinity) return;
      const to = this.boltFromB[k] ? l.a : l.b;
      if (this.hit[to] !== this.boltOut[k]) this.boltIn[k] = this.boltOut[k] = Infinity;
    });
    this.boltClock = 0;
  }

  // how far node i is through the morph, 0..1 (1 while holding)
  private progress(i: number) {
    return this.morphing ? clamp01((this.clock - this.delay[i]) / this.cfg.morphTime) : 1;
  }

  // node positions, the turn, the far side dimmer, into the buffers
  private draw(dt = 0) {
    const c = this.cfg;
    const N = this.n;
    const unit = this.cssH / (2 * this.half); // CSS px per unit
    const prev = this.prevScreen ?? (this.prevScreen = new Float32Array(N * 2).fill(NaN));
    const nb = this.nodeBlur.array as Float32Array;
    const A = this.places[this.from];
    const B = this.places[this.shape];
    const ra = this.real[this.from];
    const rb = this.real[this.shape];
    const cos = Math.cos(this.turn);
    const sin = Math.sin(this.turn);
    const pos = this.nodePos.array as Float32Array;
    const na = this.nodeAlpha.array as Float32Array;
    const e = new Float32Array(N);
    const near = new Float32Array(N); // 0 far .. 1 near
    const vis = new Float32Array(N); // how much of the node shows
    const fl = this.nodeFlash.array as Float32Array;
    const bt = this.boltClock;
    for (let i = 0; i < N; i++) {
      const p = this.progress(i);
      const t = (e[i] = smoother(p));
      // the way there: pulled back, then past the mark; out and round
      const m = easeBack(p, c.overshoot);
      const arc = Math.sin(Math.PI * p);
      const out = 1 + c.burst * arc;
      let x = (A[i * 3] + (B[i * 3] - A[i * 3]) * m) * out;
      const y = (A[i * 3 + 1] + (B[i * 3 + 1] - A[i * 3 + 1]) * m) * out;
      let z = (A[i * 3 + 2] + (B[i * 3 + 2] - A[i * 3 + 2]) * m) * out;
      if (arc > 0) {
        const w = c.swirl * arc * this.swirl[i];
        const cw = Math.cos(w);
        const sw = Math.sin(w);
        [x, z] = [x * cw + z * sw, -x * sw + z * cw];
      }
      const rx = x * cos + z * sin;
      const ry = y;
      const rz = -x * sin + z * cos;
      // screen place (units): x along (1, 0, -1), y along (-1, 2, -1)
      const sx = (rx - rz) / Math.SQRT2;
      const sy = (2 * ry - rx - rz) / Math.sqrt(6);
      // blur by speed on screen
      if (dt > 0 && prev[i * 2] === prev[i * 2]) {
        const speed = (Math.hypot(sx - prev[i * 2], sy - prev[i * 2 + 1]) * unit) / dt;
        const target = clamp01(speed / c.blurSpeed);
        this.blur[i] += (target - this.blur[i]) * Math.min(1, dt * 14);
      }
      prev[i * 2] = sx;
      prev[i * 2 + 1] = sy;
      nb[i] = this.blur[i];
      fl[i] = bt >= this.hit[i] ? c.boltGain * Math.exp(-(bt - this.hit[i]) / c.boltFade) : 0;
      pos[i * 3] = this.now[i * 3] = rx;
      pos[i * 3 + 1] = this.now[i * 3 + 1] = ry;
      pos[i * 3 + 2] = this.now[i * 3 + 2] = rz;
      // depth toward the camera, which looks down (-1, -1, -1)
      near[i] = clamp01(((rx + ry + rz) / Math.sqrt(3) / this.radius + 1) / 2);
      const seen = ra[i] + (rb[i] - ra[i]) * t;
      vis[i] = seen * (c.backDim + (1 - c.backDim) * near[i]);
      na[i] = c.nodeOpacity * vis[i];
    }
    this.nodePos.needsUpdate = true;
    this.nodeAlpha.needsUpdate = true;
    this.nodeFlash.needsUpdate = true;
    this.nodeBlur.needsUpdate = true;
    const lbl = this.lineBlurAttr.array as Float32Array;
    const bo = this.lineBolt.array as Float32Array;

    const la = this.lineA.array as Float32Array;
    const lb = this.lineB.array as Float32Array;
    const al = this.lineAlpha.array as Float32Array;
    this.lines.forEach((l, k) => {
      la.set(this.now.subarray(l.a * 3, l.a * 3 + 3), k * 3);
      lb.set(this.now.subarray(l.b * 3, l.b * 3 + 3), k * 3);
      const t = (e[l.a] + e[l.b]) / 2;
      const seen = l.in[this.from] + (l.in[this.shape] - l.in[this.from]) * t;
      al[k] = c.lineOpacity * seen * (c.backDim + (1 - c.backDim) * (near[l.a] + near[l.b]) / 2);
      lbl[k] = (this.blur[l.a] + this.blur[l.b]) / 2;
      const t0 = this.boltIn[k];
      const t1 = this.boltOut[k];
      if (bt >= t0) {
        bo[k * 3] = clamp01((bt - t0) / Math.max(1e-3, t1 - t0));
        bo[k * 3 + 1] = c.boltGain * Math.exp(-Math.max(0, bt - t1) / c.boltFade);
        bo[k * 3 + 2] = this.boltFromB[k];
      } else bo[k * 3 + 1] = 0;
    });
    // the streaks: each node's trail follows it about `streak` s behind
    const tr = this.trail ?? (this.trail = new Float32Array(this.now));
    const follow = dt > 0 && c.streak > 0 ? 1 - Math.exp(-dt / c.streak) : 1;
    const k0 = this.lines.length;
    for (let i = 0; i < N; i++) {
      for (let a = 0; a < 3; a++) tr[i * 3 + a] += (this.now[i * 3 + a] - tr[i * 3 + a]) * follow;
      const k = k0 + i;
      la.set(tr.subarray(i * 3, i * 3 + 3), k * 3);
      lb.set(this.now.subarray(i * 3, i * 3 + 3), k * 3);
      al[k] = 0;
      const len = Math.hypot(this.now[i * 3] - tr[i * 3], this.now[i * 3 + 1] - tr[i * 3 + 1], this.now[i * 3 + 2] - tr[i * 3 + 2]) * unit;
      // lit like a bolt that has reached its head: bright at the node, fading back
      bo[k * 3] = 1;
      bo[k * 3 + 1] = c.streakGain * vis[i] * clamp01(len / 16);
      bo[k * 3 + 2] = 0;
      lbl[k] = this.blur[i];
    }
    this.lineBolt.needsUpdate = true;
    this.lineA.needsUpdate = true;
    this.lineB.needsUpdate = true;
    this.lineAlpha.needsUpdate = true;
    this.lineBlurAttr.needsUpdate = true;
  }

  /** Advances the network; true while anything moves (always, unless reduced). */
  update(dt: number): boolean {
    if (this.reduced) return false;
    const c = this.cfg;
    this.clock += dt;
    this.boltClock += dt;
    const all = c.stagger + c.morphTime;
    const kick = this.morphing ? c.spinKick * Math.sin(Math.PI * clamp01(this.clock / all)) : 0;
    this.turn += dt * c.turnSpeed * (1 + kick);
    if (!this.morphing) {
      if (this.places.length > 1 && this.clock >= c.holdTime) this.startMorph();
    } else if (this.clock >= all) {
      this.morphing = false;
      this.from = this.shape;
      this.clock = 0;
      this.strike();
    }
    this.draw(dt);
    return true;
  }

  // --- camera: true isometric, fitted to every shape at every point of the turn ---
  private frame() {
    const half = (this.half = Math.max(this.reach.y, this.reach.x / this.aspect) / this.cfg.zoom);
    const cam = this.camera;
    cam.left = -half * this.aspect;
    cam.right = half * this.aspect;
    cam.top = half;
    cam.bottom = -half;
    cam.updateProjectionMatrix();
    cam.position.set(20, 20, 20);
    cam.lookAt(0, 0, 0);
  }

  dispose() {
    this.nodeGeo.dispose();
    this.lineGeo.dispose();
    this.nodeMat.dispose();
    this.lineMat.dispose();
    this.root.removeFromParent();
  }
}

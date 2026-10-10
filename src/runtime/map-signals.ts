// The Signals level's beat (experimental, tuned in lab/fjord.html), after
// the client's "signal-stack-tabs" video: on the middle tab, dots lift off
// the settled floor onto the Signals level, each on a dotted line down to
// its needle; then some glide into three clusters (teal, pink over the
// anomaly, white), link up and get a dashed ring, while the rest dim.
// Played by the map's staged timeline (MapScene.step / stageTime).
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  DoubleSide,
  Points,
  RingGeometry,
  ShaderMaterial,
  type PerspectiveCamera,
} from "three";
import { ANOMALY_XZ, LEVEL, REASONING_AT, WORLD } from "./map-consts";

export interface SignalsConfig {
  dots: number; // how many lift onto the Signals level
  clustered: number; // share of them that join a cluster (0..1)
  dotSize: number; // world units
  colors: [string, string, string]; // the clusters: teal, pink (the anomaly), white
  dim: string; // dots that don't join a cluster
  // the Reasoning tiles over the clusters (same order as colors)
  tiles: [string, string, string];
  // tiles: "slab" (a solid slab dropping in) or "dots" (built from the
  // cluster's own dots streaming up); dots: grid per side, spacing (world),
  // seconds a dot takes to stream up, how much the pink one keeps
  // flickering ("thinking", 0..1)
  tileStyle: "slab" | "dots";
  slabGrid: number;
  slabGap: number;
  streamTime: number;
  think: number;
  // the pink cluster sits over the anomaly needle
  alertAt: [number, number];
}

export const signalsDefaults: SignalsConfig = {
  dots: 70,
  clustered: 0.55,
  dotSize: 0.28,
  colors: ["#5fc4a8", "#e0607e", "#f4f7fa"],
  dim: "#757a7f",
  tiles: ["Asset health", "Maintenance risk", "Energy use"],
  tileStyle: "dots",
  slabGrid: 6,
  slabGap: 0.3,
  streamTime: 0.6,
  think: 0.6,
  alertAt: ANOMALY_XZ,
};

// the timeline on the middle tab (s)
const RISE_FROM = 0.45; // as the scan builds the level
const RISE_SPREAD = 0.45; // dots start rising over this long
const RISE = 0.4;
export const GATHER_AT = 1.2;
const GATHER = 0.65;
const LINK_AT = GATHER_AT + GATHER - 0.2;
const LINK = 0.4;

const Y = LEVEL.extract; // the Signals level
const RY = LEVEL.refine; // the Reasoning level
const AY = LEVEL.signal; // the Actions level
// the top tab: once the scan has built Actions, the pink tile sends dots up
// that form a ring there (s after landing on the tab)
const RING_AT = 1.05;
const RING_DOTS = 28;
const RING_R = 1.15;
// tiles drop in once the scan has built Reasoning, one after another
const TILES_AT = REASONING_AT + 0.8;
const TILE_GAP = 0.16;
const TILE = 0.55;
const ease = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
const easeIO = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, t)));

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

const POINT_VERT = /* glsl */ `
  attribute float alpha;
  attribute vec3 tint;
  uniform float uSize;
  uniform float uScale;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = max(1.5, uSize * uScale / -mv.z);
    vAlpha = alpha;
    vColor = tint;
  }
`;
const SLAB_VERT = /* glsl */ `
  attribute float alpha;
  attribute float sz;
  attribute vec3 tint;
  uniform float uSize;
  uniform float uScale;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = max(1.5, uSize * sz * uScale / -mv.z);
    vAlpha = alpha;
    vColor = tint;
  }
`;
const POINT_FRAG = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    gl_FragColor = vec4(vColor, vAlpha * smoothstep(1.0, 0.6, d));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
// lines with a per-vertex colour and alpha; `dash` > 0 cuts them into dots
// along world height (the vertical source lines) or along their length
const LINE_VERT = /* glsl */ `
  attribute vec4 rgba;
  attribute float along;
  varying vec4 vColor;
  varying float vAlong;
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vColor = rgba;
    vAlong = along;
  }
`;
const LINE_FRAG = /* glsl */ `
  uniform float uDash;
  varying vec4 vColor;
  varying float vAlong;
  void main() {
    if (uDash > 0.0 && fract(vAlong * uDash) > 0.45) discard;
    gl_FragColor = vColor;
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

type Dot = {
  src: [number, number]; // the needle under it (floor x, z)
  home: [number, number]; // where it lands on the level
  cluster: number; // -1: none
  spot: [number, number]; // its place in the cluster
  delay: number;
};

class Lines {
  readonly geo = new BufferGeometry();
  readonly pos: Float32Array;
  readonly rgba: Float32Array;
  readonly along: Float32Array;
  readonly mat: ShaderMaterial;
  readonly obj: LineSegments;
  constructor(segments: number, dash: number) {
    this.pos = new Float32Array(segments * 6);
    this.rgba = new Float32Array(segments * 8);
    this.along = new Float32Array(segments * 2);
    this.geo.setAttribute("position", new BufferAttribute(this.pos, 3));
    this.geo.setAttribute("rgba", new BufferAttribute(this.rgba, 4));
    this.geo.setAttribute("along", new BufferAttribute(this.along, 1));
    this.mat = new ShaderMaterial({ vertexShader: LINE_VERT, fragmentShader: LINE_FRAG, uniforms: { uDash: { value: dash } }, transparent: true, depthWrite: false });
    this.obj = new LineSegments(this.geo, this.mat);
    this.obj.frustumCulled = false;
  }
  set(i: number, a: number[], b: number[], col: Color, alpha: number, alongA: number, alongB: number) {
    this.pos.set([...a, ...b], i * 6);
    this.rgba.set([col.r, col.g, col.b, alpha, col.r, col.g, col.b, alpha], i * 8);
    this.along.set([alongA, alongB], i * 2);
  }
  dirty() {
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.rgba.needsUpdate = true;
    this.geo.attributes.along.needsUpdate = true;
  }
  dispose() {
    this.geo.dispose();
    this.mat.dispose();
  }
}

export class SignalsLayer {
  readonly root = new Group();
  private readonly dots: Dot[] = [];
  private readonly centers: [number, number][];
  private readonly links: [number, number][] = [];
  private readonly pts = new BufferGeometry();
  private readonly pPos: Float32Array;
  private readonly pAlpha: Float32Array;
  private readonly pTint: Float32Array;
  private readonly pMat: ShaderMaterial;
  private readonly src: Lines; // dotted lines down to the needles
  private readonly linkLines: Lines; // inside the clusters
  private readonly rings: Lines; // dashed rings round the clusters
  private readonly col: { cluster: Color[]; dim: Color; white: Color };
  private readonly tmp = new Color();
  // 0..1: how present the whole layer is (fades out off the middle tabs)
  private show = 0;
  // the Reasoning tiles: a thin slab, its edges, a few "text" lines on top;
  // a dashed line up from the cluster; progress 0..1 each
  private readonly tiles: { g: Group; fill: MeshBasicMaterial; edge: LineBasicMaterial; marks: LineBasicMaterial; prog: number }[] = [];
  private readonly up: Lines;
  // dots-style tiles: per tile, slabGrid^2 dots streaming up from the
  // cluster into a grid on Reasoning
  private readonly slab: { tile: number; slot: [number, number]; from: number; delay: number; seed: number }[] = [];
  private readonly sGeo = new BufferGeometry();
  private sPos!: Float32Array;
  private sAlpha!: Float32Array;
  private sSize!: Float32Array;
  private sTint!: Float32Array;
  private sMat!: ShaderMaterial;
  private time = 0;
  private readonly cfg: SignalsConfig;
  // the top tab's ring: dots streaming up from the pink tile into a ring on
  // Actions, its line, pulses, and the dashed line up; ring 0..1
  private ring = 0;
  private readonly rGeo = new BufferGeometry();
  private readonly rPos = new Float32Array(RING_DOTS * 3);
  private readonly rAlpha = new Float32Array(RING_DOTS);
  private readonly rSize = new Float32Array(RING_DOTS);
  private readonly rTint = new Float32Array(RING_DOTS * 3);
  private readonly rDelay: number[] = [];
  private readonly rMat: ShaderMaterial;
  private readonly ringLine: Lines;
  private readonly ringUp: Lines;
  private readonly pulses: { m: Mesh; mat: MeshBasicMaterial }[] = [];

  constructor(cfg: SignalsConfig) {
    const c = cfg;
    this.cfg = cfg;
    this.labels = c.tiles;
    const rand = rng(11);
    this.col = { cluster: c.colors.map((h) => new Color(h)), dim: new Color(c.dim), white: new Color("#dee2e8") };
    // the clusters: teal back-left, pink over the anomaly, white back-right
    // (as seen from the middle tab's camera)
    this.centers = [[-5.8, 3.4], [c.alertAt[0], c.alertAt[1]], [3.0, -4.4]];
    // dots: above needles near the middle of the floor
    const n = Math.max(3, Math.round(c.dots));
    const cell = WORLD / 32;
    for (let i = 0; i < n; i++) {
      const ix = Math.floor(6 + rand() * 20);
      const iz = Math.floor(6 + rand() * 20);
      const src: [number, number] = [(ix + 0.5) * cell - WORLD / 2, (iz + 0.5) * cell - WORLD / 2];
      // the nearest cluster, if this one joins one
      let cluster = -1;
      if (rand() < c.clustered) {
        let best = Infinity;
        this.centers.forEach((cc, k) => {
          const d = (cc[0] - src[0]) ** 2 + (cc[1] - src[1]) ** 2;
          if (d < best) {
            best = d;
            cluster = k;
          }
        });
      }
      const a = rand() * Math.PI * 2;
      const r = 0.3 + rand() * 0.9;
      const cc = cluster >= 0 ? this.centers[cluster] : src;
      this.dots.push({ src, home: [src[0], src[1]], cluster, spot: [cc[0] + Math.cos(a) * r, cc[1] + Math.sin(a) * r * 0.8], delay: rand() });
    }
    // every cluster gets at least a few dots
    this.centers.forEach((_, k) => {
      let have = this.dots.filter((d) => d.cluster === k).length;
      for (const d of this.dots) {
        if (have >= 6) break;
        if (d.cluster !== -1) continue;
        d.cluster = k;
        const a = rand() * Math.PI * 2;
        const r = 0.3 + rand() * 0.9;
        d.spot = [this.centers[k][0] + Math.cos(a) * r, this.centers[k][1] + Math.sin(a) * r * 0.8];
        have++;
      }
    });
    // links inside a cluster: each dot to its two nearest cluster-mates
    const seen = new Set<string>();
    this.dots.forEach((d, i) => {
      if (d.cluster < 0) return;
      this.dots
        .map((e, j) => ({ j, e, dd: (e.spot[0] - d.spot[0]) ** 2 + (e.spot[1] - d.spot[1]) ** 2 }))
        .filter((x) => x.j !== i && x.e.cluster === d.cluster)
        .sort((x, y) => x.dd - y.dd)
        .slice(0, 2)
        .forEach(({ j }) => {
          const key = i < j ? `${i}-${j}` : `${j}-${i}`;
          if (seen.has(key)) return;
          seen.add(key);
          this.links.push([i, j]);
        });
    });

    // drawables
    this.pPos = new Float32Array(n * 3);
    this.pAlpha = new Float32Array(n);
    this.pTint = new Float32Array(n * 3);
    this.pts.setAttribute("position", new BufferAttribute(this.pPos, 3));
    this.pts.setAttribute("alpha", new BufferAttribute(this.pAlpha, 1));
    this.pts.setAttribute("tint", new BufferAttribute(this.pTint, 3));
    this.pMat = new ShaderMaterial({ vertexShader: POINT_VERT, fragmentShader: POINT_FRAG, uniforms: { uSize: { value: c.dotSize }, uScale: { value: 600 } }, transparent: true, depthWrite: false });
    const points = new Points(this.pts, this.pMat);
    points.frustumCulled = false;
    this.src = new Lines(n, 3.5);
    this.linkLines = new Lines(this.links.length, 0);
    this.linkLines.mat.blending = AdditiveBlending;
    const RING = 40;
    this.rings = new Lines(this.centers.length * RING, 1);
    this.centers.forEach(([x, z], k) => {
      for (let s = 0; s < RING; s++) {
        const a0 = (s / RING) * Math.PI * 2;
        const a1 = ((s + 0.5) / RING) * Math.PI * 2; // half: a dashed ring
        this.rings.set(k * RING + s, [x + Math.cos(a0) * 1.7, Y + 0.02, z + Math.sin(a0) * 1.4], [x + Math.cos(a1) * 1.7, Y + 0.02, z + Math.sin(a1) * 1.4], this.col.cluster[k], 0, 0, 0);
      }
    });
    this.rings.dirty();
    // the tiles, over each cluster's centre on Reasoning
    const slab = new BoxGeometry(2.4, 0.24, 2);
    const slabEdges = new EdgesGeometry(slab);
    const marksGeo = new BufferGeometry();
    marksGeo.setAttribute(
      "position",
      new BufferAttribute(new Float32Array([-0.7, 0.13, -0.45, 0.7, 0.13, -0.45, -0.7, 0.13, 0, 0.5, 0.13, 0, -0.7, 0.13, 0.45, 0.2, 0.13, 0.45]), 3),
    );
    this.centers.forEach(([x, z], k) => {
      const col = this.col.cluster[k];
      const g = new Group();
      g.position.set(x, RY + 0.14, z);
      const fill = new MeshBasicMaterial({ color: col, transparent: true, opacity: 0, depthWrite: false });
      const edge = new LineBasicMaterial({ color: col, transparent: true, opacity: 0, depthWrite: false });
      const marks = new LineBasicMaterial({ color: col, transparent: true, opacity: 0, depthWrite: false });
      g.add(new Mesh(slab, fill), new LineSegments(slabEdges, edge), new LineSegments(marksGeo, marks));
      g.visible = false;
      this.root.add(g);
      this.tiles.push({ g, fill, edge, marks, prog: 0 });
    });
    const disposeTiles0 = () => {
      slab.dispose();
      slabEdges.dispose();
      marksGeo.dispose();
      for (const t of this.tiles) [t.fill, t.edge, t.marks].forEach((m) => m.dispose());
    };
    // dots-style tiles: a grid per tile, each dot starting from one of the
    // cluster's dots
    if (c.tileStyle === "dots") {
      const g = Math.max(2, Math.round(c.slabGrid));
      this.centers.forEach(([x, z], k) => {
        const members = this.dots.map((d, i) => (d.cluster === k ? i : -1)).filter((i) => i >= 0);
        for (let iy = 0; iy < g; iy++) {
          for (let ix = 0; ix < g; ix++) {
            const slot: [number, number] = [x + (ix - (g - 1) / 2) * c.slabGap, z + (iy - (g - 1) / 2) * c.slabGap * 0.85];
            // from one of the cluster's dots (-1: none, start at the centre)
            const from = members.length ? members[(iy * g + ix) % members.length] : -1;
            this.slab.push({ tile: k, slot, from, delay: rand(), seed: rand() * 100 });
          }
        }
      });
      const n = this.slab.length;
      this.sPos = new Float32Array(n * 3);
      this.sAlpha = new Float32Array(n);
      this.sSize = new Float32Array(n);
      this.sTint = new Float32Array(n * 3);
      this.sGeo.setAttribute("position", new BufferAttribute(this.sPos, 3));
      this.sGeo.setAttribute("alpha", new BufferAttribute(this.sAlpha, 1));
      this.sGeo.setAttribute("sz", new BufferAttribute(this.sSize, 1));
      this.sGeo.setAttribute("tint", new BufferAttribute(this.sTint, 3));
      this.sMat = new ShaderMaterial({
        vertexShader: SLAB_VERT,
        fragmentShader: POINT_FRAG,
        uniforms: { uSize: { value: c.dotSize }, uScale: { value: 600 } },
        transparent: true,
        depthWrite: false,
      });
      const sp = new Points(this.sGeo, this.sMat);
      sp.frustumCulled = false;
      // over the level's grid, so they read from any angle (from above too)
      sp.renderOrder = 4;
      this.root.add(sp);
    }
    this.up = new Lines(this.centers.length, 3.5);
    // the ring (top tab)
    for (let i = 0; i < RING_DOTS; i++) this.rDelay.push(rand());
    this.rGeo.setAttribute("position", new BufferAttribute(this.rPos, 3));
    this.rGeo.setAttribute("alpha", new BufferAttribute(this.rAlpha, 1));
    this.rGeo.setAttribute("sz", new BufferAttribute(this.rSize, 1));
    this.rGeo.setAttribute("tint", new BufferAttribute(this.rTint, 3));
    this.rMat = new ShaderMaterial({ vertexShader: SLAB_VERT, fragmentShader: POINT_FRAG, uniforms: { uSize: { value: c.dotSize }, uScale: { value: 600 } }, transparent: true, depthWrite: false });
    const rPts = new Points(this.rGeo, this.rMat);
    rPts.frustumCulled = false;
    rPts.renderOrder = 4;
    const SEG = 72;
    this.ringLine = new Lines(SEG, 0);
    const [ax, az] = this.centers[1];
    for (let s = 0; s < SEG; s++) {
      const a0 = (s / SEG) * Math.PI * 2;
      const a1 = ((s + 1) / SEG) * Math.PI * 2;
      this.ringLine.set(s, [ax + Math.cos(a0) * RING_R, AY + 0.04, az + Math.sin(a0) * RING_R], [ax + Math.cos(a1) * RING_R, AY + 0.04, az + Math.sin(a1) * RING_R], this.col.cluster[1], 0, 0, 0);
    }
    this.ringLine.dirty();
    this.ringUp = new Lines(1, 3.5);
    const pulseGeo = new RingGeometry(0.96, 1, 72);
    for (let k = 0; k < 2; k++) {
      const mat = new MeshBasicMaterial({ color: this.col.cluster[1], transparent: true, opacity: 0, depthWrite: false, side: DoubleSide });
      const m = new Mesh(pulseGeo, mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(ax, AY + 0.05, az);
      m.visible = false;
      this.root.add(m);
      this.pulses.push({ m, mat });
    }
    this.root.add(rPts, this.ringLine.obj, this.ringUp.obj);
    const disposeRing = () => {
      this.rGeo.dispose();
      this.rMat.dispose();
      this.ringLine.dispose();
      this.ringUp.dispose();
      pulseGeo.dispose();
      for (const p of this.pulses) p.mat.dispose();
    };
    this.disposeTiles = () => {
      disposeTiles0();
      disposeRing();
    };
    this.root.add(this.src.obj, this.rings.obj, this.linkLines.obj, points, this.up.obj);
  }

  private disposeTiles: () => void = () => {};

  // the Actions ring (world) and how formed it is, for the HTML overlay
  get ringInfo() {
    return { x: this.centers[1][0], y: AY + 0.06, z: this.centers[1][1], formed: this.show * Math.max(0, (this.ring - 0.75) / 0.25) };
  }

  // the tiles' label anchors (world) and presence, for the HTML overlay
  get tileLabels() {
    return this.tiles.map((t, k) => ({
      x: this.centers[k][0],
      y: RY + 0.5,
      z: this.centers[k][1],
      text: this.labels[k] ?? "",
      color: "#" + this.col.cluster[k].getHexString(),
      show: this.show * Math.max(0, (t.prog - 0.35) / 0.65),
    }));
  }
  private readonly labels: string[];

  setView(camera: PerspectiveCamera, heightPx: number) {
    this.pMat.uniforms.uScale.value = heightPx / (2 * Math.tan(((camera.fov / 2) * Math.PI) / 180));
    if (this.sMat) this.sMat.uniforms.uScale.value = this.pMat.uniforms.uScale.value;
    this.rMat.uniforms.uScale.value = this.pMat.uniforms.uScale.value;
  }

  // step: the map's tab (0 floor, 1 middle, 2 top); t: seconds on it
  // snap: land in the end state at once (a jump, reduced motion)
  // dim: 0..1, the top tab's fade-back of everything below the ring (the
  // Signals level, and the teal/white tiles; the pink tile stays)
  update(dt: number, step: number, t: number, snap = false, dim = 0) {
    // shown from the middle tab up; on the top tab it's all already there
    const goal = step >= 1 ? 1 : 0;
    this.show += (goal - this.show) * (snap ? 1 : 1 - Math.pow(0.85, dt * 60));
    if (Math.abs(goal - this.show) < 0.003) this.show = goal;
    this.root.visible = this.show > 0.003;
    if (!this.root.visible) return;
    const tt = step >= 2 ? 99 : t;
    const show = this.show;
    // below the ring: Signals fades most, the side tiles a little less
    const low = 1 - 0.95 * dim;
    const side = 1 - 0.85 * dim;
    // the pink tile fades back too (the ring above carries the colour now)
    const pinkDim = 1 - 0.8 * dim;

    const gather = (d: Dot) => (d.cluster < 0 ? 0 : easeIO((tt - GATHER_AT - d.delay * 0.3) / GATHER));
    this.dots.forEach((d, i) => {
      const r = ease((tt - RISE_FROM - d.delay * RISE_SPREAD) / RISE);
      const g = gather(d);
      const x = d.home[0] + (d.spot[0] - d.home[0]) * g;
      const z = d.home[1] + (d.spot[1] - d.home[1]) * g;
      const y = 0.9 + (Y - 0.9) * r;
      this.pPos.set([x, y, z], i * 3);
      // white while it rises; then its cluster's colour, or dim
      const after = ease((tt - GATHER_AT - d.delay * 0.3) / GATHER);
      const target = d.cluster >= 0 ? this.col.cluster[d.cluster] : this.col.dim;
      this.tmp.copy(this.col.white).lerp(target, after);
      this.pTint.set([this.tmp.r, this.tmp.g, this.tmp.b], i * 3);
      this.pAlpha[i] = low * show * (r > 0 ? Math.min(1, r * 3) : 0) * (d.cluster < 0 ? 1 - 0.6 * after : 1);
      // its dotted line down to the needle
      const la = low * show * Math.min(1, r * 3) * (d.cluster < 0 ? 0.35 - 0.25 * after : 0.35 + 0.15 * after);
      this.src.set(i, [d.src[0], 0.9, d.src[1]], [x, y, z], this.tmp, la, 0.9, y);
    });
    this.pts.attributes.position.needsUpdate = true;
    this.pts.attributes.alpha.needsUpdate = true;
    this.pts.attributes.tint.needsUpdate = true;
    this.src.dirty();

    // links grow inside the clusters once they've gathered
    this.links.forEach(([i, j], k) => {
      const a = this.dots[i];
      const g = ease((tt - LINK_AT - a.delay * 0.3) / LINK);
      const ax = this.pPos[i * 3], ay = this.pPos[i * 3 + 1], az = this.pPos[i * 3 + 2];
      const bx = this.pPos[j * 3], by = this.pPos[j * 3 + 1], bz = this.pPos[j * 3 + 2];
      const end = [ax + (bx - ax) * g, ay + (by - ay) * g, az + (bz - az) * g];
      this.linkLines.set(k, [ax, ay, az], end, this.col.cluster[a.cluster], low * show * 0.7 * Math.min(1, g * 2), 0, 0);
    });
    this.linkLines.dirty();
    // the dashed rings fade in with the links
    const ringA = low * show * 0.55 * ease((tt - LINK_AT) / LINK);
    for (let s = 0; s < this.rings.rgba.length / 4; s++) this.rings.rgba[s * 4 + 3] = ringA;
    this.rings.geo.attributes.rgba.needsUpdate = true;

    // the tiles drop onto Reasoning one by one (Apple-like ease: quick
    // start, long soft landing), each with a dashed line up from its cluster
    this.time += dt;
    const dotsStyle = this.cfg.tileStyle === "dots";
    const stream = Math.max(0.1, this.cfg.streamTime);
    this.tiles.forEach((tl, k) => {
      // dots style: the tile is "done" once its last dot has landed
      const span = dotsStyle ? stream + 0.35 : TILE;
      tl.prog = Math.min(1, Math.max(0, (tt - TILES_AT - k * TILE_GAP) / span));
      const e = 1 - (1 - tl.prog) ** 4;
      tl.g.visible = tl.prog > 0 && show > 0.003;
      if (dotsStyle) {
        // just a faint frame round the assembled dots
        tl.g.position.y = RY + 0.02;
        const g = Math.max(2, Math.round(this.cfg.slabGrid));
        tl.g.scale.set(((g - 1) * this.cfg.slabGap + 0.7) / 2.4, 0.05, ((g - 1) * this.cfg.slabGap * 0.85 + 0.7) / 2);
        tl.fill.opacity = 0;
        tl.marks.opacity = 0;
        tl.edge.opacity = (k === 1 ? pinkDim : side) * show * 0.28 * Math.max(0, (tl.prog - 0.6) / 0.4);
      } else {
        tl.g.position.y = RY + 0.14 + (1 - e) * 1.4;
        tl.g.scale.setScalar(0.85 + 0.15 * e);
        tl.fill.opacity = show * 0.22 * e;
        tl.edge.opacity = show * 0.95 * e;
        tl.marks.opacity = show * 0.5 * Math.max(0, (tl.prog - 0.5) / 0.5);
      }
      // the line up: grows from the cluster to the tile, just ahead of it
      const lg = ease((tt - TILES_AT - k * TILE_GAP + 0.25) / 0.6);
      const [x, z] = this.centers[k];
      this.up.set(k, [x, Y + 0.05, z], [x, Y + 0.05 + (RY - Y) * lg, z], this.col.cluster[k], (k === 1 ? pinkDim : low) * show * 0.7 * Math.min(1, lg * 3), Y, Y + (RY - Y) * lg);
    });
    this.up.dirty();

    // dots style: each slab dot streams from its cluster dot up the line
    // and into its slot (a curve through the line), lands with a small pop;
    // then teal/white breathe calmly and the pink one keeps flickering
    if (dotsStyle && this.slab.length) {
      this.slab.forEach((s, i) => {
        const [cx, cz] = this.centers[s.tile];
        const start = TILES_AT + s.tile * TILE_GAP + s.delay * 0.35;
        const u = Math.min(1, Math.max(0, (tt - start) / stream));
        const e = easeIO(u);
        const fx = s.from < 0 ? cx : this.pPos[s.from * 3];
        const fy = s.from < 0 ? Y : this.pPos[s.from * 3 + 1];
        const fz = s.from < 0 ? cz : this.pPos[s.from * 3 + 2];
        // quadratic curve: from the cluster dot, via the line's top, to the slot
        const mx = cx;
        const my = RY + 0.6;
        const mz = cz;
        const a = (1 - e) * (1 - e);
        const b = 2 * (1 - e) * e;
        const q = e * e;
        // once landed: a slow ripple runs across the grid (faster on the
        // pink one), lifting and brightening the dots as it passes
        const [cxx, czz] = this.centers[s.tile];
        const dist = Math.hypot(s.slot[0] - cxx, s.slot[1] - czz);
        const speed = s.tile === 1 ? 3.2 : 1.6;
        const wave = 0.5 + 0.5 * Math.sin(this.time * speed - dist * 5 + s.tile * 2);
        const settle = Math.min(1, Math.max(0, (tt - start - stream) / 0.6));
        const lift = 0.16 + 0.14 * wave * settle;
        this.sPos.set([a * fx + b * mx + q * s.slot[0], a * fy + b * my + q * (RY + lift), a * fz + b * mz + q * s.slot[1]], i * 3);
        const col = this.col.cluster[s.tile];
        this.sTint.set([col.r, col.g, col.b], i * 3);
        const landed = Math.max(0, (tt - start - stream) / 0.4);
        const pop = landed > 0 && landed < 1 ? Math.sin(Math.PI * landed) * 0.6 : 0;
        // after landing: calm breathing, or the pink one "thinking"
        const thinking = s.tile === 1 ? this.cfg.think : 0;
        const breathe = 0.85 + 0.15 * Math.sin(this.time * 1.4 + s.seed);
        const flick = 0.5 + 0.5 * Math.sin(this.time * (5 + (s.seed % 4)) + s.seed * 3);
        const idle = u >= 1 ? (0.7 + 0.3 * wave) * (breathe * (1 - thinking) + (0.35 + 0.65 * flick) * thinking) : 1;
        this.sAlpha[i] = (s.tile === 1 ? pinkDim : side) * show * (u > 0 ? Math.min(1, u * 4) : 0) * idle;
        this.sSize[i] = 0.8 + 0.15 * wave * settle + pop;
      });
      this.sGeo.attributes.position.needsUpdate = true;
      this.sGeo.attributes.alpha.needsUpdate = true;
      this.sGeo.attributes.sz.needsUpdate = true;
      this.sGeo.attributes.tint.needsUpdate = true;
    }

    // the top tab: dots stream up from the pink tile, gather on the line
    // above it and fan out into a ring on Actions; then the ring line
    // shows and pulses go out. Leaving the tab, they sink back quickly.
    const ringGoal = step === 2 && t >= RING_AT ? 1 : 0;
    this.ring = snap ? ringGoal : ringGoal ? Math.min(1, this.ring + dt / 1.1) : Math.max(0, this.ring - dt / 0.45);
    const [ax, az] = this.centers[1];
    const pink = this.col.cluster[1];
    const g = Math.max(2, Math.round(this.cfg.slabGrid));
    for (let i = 0; i < RING_DOTS; i++) {
      const r = easeIO((this.ring - this.rDelay[i] * 0.35) / 0.65);
      // from a spot on the tile
      const sx = ax + (((i * 7) % g) - (g - 1) / 2) * this.cfg.slabGap;
      const sz = az + ((Math.floor(i / g) % g) - (g - 1) / 2) * this.cfg.slabGap * 0.85;
      // via the line above the tile, to its place on the ring
      const ang = (i / RING_DOTS) * Math.PI * 2 + this.time * 0.15 * r;
      const ex = ax + Math.cos(ang) * RING_R;
      const ez = az + Math.sin(ang) * RING_R;
      const a = (1 - r) * (1 - r);
      const b = 2 * (1 - r) * r;
      const q = r * r;
      this.rPos.set([a * sx + b * ax + q * ex, a * (RY + 0.3) + b * (AY - 1.2) + q * (AY + 0.06), a * sz + b * az + q * ez], i * 3);
      this.rTint.set([pink.r, pink.g, pink.b], i * 3);
      this.rAlpha[i] = show * (r > 0 ? Math.min(1, r * 5) : 0) * (r >= 1 ? 0.85 + 0.15 * Math.sin(this.time * 3 + i) : 1);
      this.rSize[i] = 0.9;
    }
    this.rGeo.attributes.position.needsUpdate = true;
    this.rGeo.attributes.alpha.needsUpdate = true;
    this.rGeo.attributes.sz.needsUpdate = true;
    this.rGeo.attributes.tint.needsUpdate = true;
    const formed = Math.max(0, (this.ring - 0.75) / 0.25);
    for (let s = 0; s < this.ringLine.rgba.length / 4; s++) this.ringLine.rgba[s * 4 + 3] = show * 0.85 * formed;
    this.ringLine.geo.attributes.rgba.needsUpdate = true;
    const up = ease(this.ring / 0.5);
    this.ringUp.set(0, [ax, RY + 0.3, az], [ax, RY + 0.3 + (AY - RY - 0.3) * up, az], pink, show * 0.6 * Math.min(1, this.ring * 4), RY, RY + (AY - RY) * up);
    this.ringUp.dirty();
    this.pulses.forEach((p, k) => {
      const ph = (this.time * 0.3 + k * 0.5) % 1;
      p.m.visible = formed > 0 && show > 0.003;
      p.m.scale.setScalar(RING_R * (1 + ph * 1.4));
      p.mat.opacity = show * formed * 0.55 * (1 - ph) ** 2;
    });
  }

  dispose() {
    this.disposeTiles();
    this.sGeo.dispose();
    this.sMat?.dispose();
    this.up.dispose();
    this.pts.dispose();
    this.pMat.dispose();
    this.src.dispose();
    this.linkLines.dispose();
    this.rings.dispose();
  }
}

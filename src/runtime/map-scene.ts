// The "What Clarify does" spatial map, as a plain Three.js scene. Loaded
// lazily (with its baked data, map-data.ts) only when a page has a map
// section, so the hero/CTA pages never pay for it.
//
// A port of the Clarify Spatial Data Map's R3F scene (iteration 005, dark
// template) without React, drei, troika or d3: a tall gridded box over a
// real fjord — wireframe terrain and relief spikes at the floor, the
// extracted coastline and regions on two glass levels, the distilled signal
// specks on top, a dashed trace through them, and in-scene labels/callouts.
// Three camera steps (one per tab) fly between the levels; a mouse drag
// orbits within a step.
//
// stagedLayers turns it into the staged story (the `fjord` preset): the
// floor's needles churn, a sweep orders them and an anomaly rises (tab 1);
// signals cluster and tiles drop onto Reasoning (tab 2, map-signals.ts);
// a ring forms on Actions and is routed to its actors (tab 3). Each tab
// plays its part the first time it shows and lands on its end after. The
// story's UI is HTML over the canvas (map-overlay.ts, re-exported here so it
// rides in this chunk).
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  RepeatWrapping,
  Shape,
  ShapeGeometry,
  TorusGeometry,
  Vector3,
  BufferGeometry,
  type Material,
  type Object3D,
  type Texture,
} from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { MAP_DATA } from "./map-data";
import { ANOMALY_XZ, LEVEL, LEVEL_H, LEVELS, REASONING_AT, WORLD } from "./map-consts";
import { SignalsLayer, signalsDefaults } from "./map-signals";
// the staged UI rides in this (lazy) chunk too
export { MapOverlay } from "./map-overlay";
import type { MapConfig } from "./defaults";

// --- scene constants (the spatial map's generators.ts / camera-storyboard.ts) ---
const BOX_H = LEVEL.signal + 3;
const FOV = 40;
type V3 = [number, number, number];
const STEPS: { position: V3; target: V3 }[] = [
  { position: [30, 23, 30], target: [0, LEVEL.refine - 3.5, 0] },
  { position: [16, 15, 16], target: [0, (LEVEL.extract + LEVEL.refine) / 2, 0] },
  // north-up top-down (a hair of +z keeps the up vector stable)
  { position: [0, LEVEL.signal + 18, 0.001], target: [0, LEVEL.signal, 0] },
];
// stagedLayers: the first tab is a close-up of the floor alone; once the
// floor has settled the camera moves in closer, onto the anomaly
const FLOOR_STEP: { position: V3; target: V3 } = { position: [15, 8.5, 15], target: [0, 1.2, 0] };
const FLOOR_CLOSE: { position: V3; target: V3 } = { position: [9.5, 6.5, 11], target: [-0.5, 2.2, 0.5] };
// staged middle tab: the camera pulls back to take in floor to Reasoning,
// the clusters and the tiles
const REFINE_WIDE: { position: V3; target: V3 } = { position: [16, 19, 18], target: [0, 6.8, 0] };
// staged top tab: straight down onto the stack, centred on the ring (its
// spot on the levels), the tiles and clusters showing through below; a
// bigger move for the last step. Near-square panels (phones) aim a little
// lower so the ring sits in the top half, clear of the card below.
const RING_AT_XZ = ANOMALY_XZ;
// wide panels: closer, and the picture shifted left (a lens shift, so no
// parallax: the ring stays over its tile) so the stack fills the left
// two-thirds and the routing card gets the right third to itself
const DELIVER_STEP: { position: V3; target: V3 } = {
  position: [RING_AT_XZ[0], LEVEL_H * 3 + 17, RING_AT_XZ[1] + 0.001],
  target: [RING_AT_XZ[0], LEVEL_H * 2, RING_AT_XZ[1]],
};
// the lens shift (camera.filmOffset, mm on a 35 mm gauge) on wide panels
const DELIVER_LENS = 7;
const DELIVER_SQUARE: { position: V3; target: V3 } = {
  position: [RING_AT_XZ[0], LEVEL_H * 3 + 24, RING_AT_XZ[1] + 3.2],
  target: [RING_AT_XZ[0], LEVEL_H * 2, RING_AT_XZ[1] + 3.2],
};
const REFINE_FLIGHT = REASONING_AT + 1.6;
// the first tab's timeline (s): chaos, then the sweep orders the floor,
// the camera moves in, and one needle rises as the anomaly
// (the needles first grow out of the floor, a wave from the centre out,
// over GROW s; the chaos then churns until CHAOS_HOLD)
const GROW = 1.7;
const CHAOS_HOLD = 2.5;
const ALERT_DELAY = 0.3; // after the floor has settled
const ALERT_RISE = 0.7;
// the anomaly: a needle near the middle (a cell of the 32 grid), how tall
const ALERT_AT = ANOMALY_XZ;
const ALERT_H = 4.5;
const POLAR_MIN = 0.02;
const POLAR_MAX = Math.PI / 2 + 0.15;
// camera-controls' draggingSmoothTime: how fast a drag catches up
const DRAG_SMOOTH = 0.125;

// --- data decoding ---
function bytes(b64: string) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
type Feature = { ring: [number, number][]; centroid: [number, number]; area: number };
function feature(f: { ring: string; centroid: number[]; area: number }): Feature {
  const raw = bytes(f.ring);
  const a = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
  const ring: [number, number][] = [];
  for (let i = 0; i < a.length; i += 2) ring.push([a[i] / MAP_DATA.ringScale, a[i + 1] / MAP_DATA.ringScale]);
  return { ring, centroid: [f.centroid[0], f.centroid[1]], area: f.area };
}

// --- in-scene text: canvas-texture planes (troika's <Text> without troika) ---
// A text plane lies in its local XY plane facing +z, sized in world units
// like troika's fontSize; anchors match troika's (left/center/right,
// top/middle/bottom of the line box).
const TEXT_PX = 256; // texture pixels per world unit at fontSize 1
type TextOpts = {
  family: string;
  weight?: number;
  size: number; // world units (em)
  spacing?: number; // letter spacing, em
  anchorX?: "left" | "center" | "right";
  anchorY?: "top" | "middle" | "bottom";
  color: string;
  opacity?: number;
};
function makeText(text: string, o: TextOpts) {
  const px = Math.max(24, Math.round(o.size * TEXT_PX));
  const font = `${o.weight ?? 400} ${px}px ${o.family}`;
  const spacing = (o.spacing ?? 0) * px;
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = font;
  const chars = [...text];
  const widths = chars.map((c) => measure.measureText(c).width);
  const textW = widths.reduce((a, b) => a + b, 0) + spacing * Math.max(0, chars.length - 1);
  const lineH = px * 1.2;
  const pad = Math.ceil(px * 0.1);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(textW) + pad * 2;
  canvas.height = Math.ceil(lineH) + pad * 2;
  const ctx = canvas.getContext("2d")!;
  ctx.font = font;
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  let x = pad;
  chars.forEach((c, i) => {
    ctx.fillText(c, x, pad + lineH / 2);
    x += widths[i] + spacing;
  });
  const tex = new CanvasTexture(canvas);
  tex.anisotropy = 8;
  const mat = new MeshBasicMaterial({
    map: tex,
    color: o.color,
    transparent: true,
    opacity: o.opacity ?? 1,
    depthWrite: false,
    side: DoubleSide,
  });
  const k = o.size / px; // world units per texture pixel
  const w = canvas.width * k;
  const h = canvas.height * k;
  const geo = new PlaneGeometry(w, h);
  const ax = o.anchorX ?? "left";
  const ay = o.anchorY ?? "middle";
  // shift so the anchor point (on the line box, not the padding) sits at 0,0
  const tx = ax === "left" ? w / 2 - pad * k : ax === "right" ? -w / 2 + pad * k : 0;
  const ty = ay === "top" ? -h / 2 + pad * k : ay === "bottom" ? h / 2 - pad * k : 0;
  geo.translate(tx, ty, 0);
  return new Mesh(geo, mat);
}

// --- fat lines (drei <Line>: Line2 with a CSS-px width) ---
function makeLine(points: V3[], o: { color: string; width: number; opacity: number; dashed?: boolean }) {
  const geo = new LineGeometry();
  geo.setPositions(points.flat());
  const mat = new LineMaterial({
    color: new Color(o.color).getHex(),
    linewidth: o.width,
    transparent: true,
    opacity: o.opacity,
    dashed: !!o.dashed,
    dashSize: 0.25,
    gapSize: 0.15,
  });
  const line = new Line2(geo, mat);
  if (o.dashed) line.computeLineDistances();
  return line;
}

// --- relief dots: soft round points moved by a slow noise field, so
// neighbours drift together (currents) and brightness passes over in
// patches (cloud shadows), instead of each dot jittering on its own ---
// 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT)
const SIMPLEX = /* glsl */ `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }
`;
const DOT_VERT = /* glsl */ `
  attribute vec3 color;
  attribute float seed;
  uniform float uTime;
  uniform float uSize;
  uniform float uScale;
  uniform float uOpacity;
  uniform float uDrift;
  uniform float uTwinkle;
  uniform float uSpeed;
  uniform float uField; // noise frequency: smaller = bigger, slower-looking currents
  varying vec3 vColor;
  varying float vAlpha;
  ${SIMPLEX}
  // the current at a point: a smooth, mostly sideways direction field
  vec3 current(vec3 q, float t) {
    return vec3(snoise(q + vec3(0.0, 0.0, t)), 0.25 * snoise(q + vec3(17.3, 4.1, t)), snoise(q + vec3(41.7, 9.2, t)));
  }
  void main() {
    float t = uTime * uSpeed;
    float s = seed * 6.2831;
    // each dot lives a few seconds (staggered by seed): it fades in at its
    // spot on the terrain, sweeps uDrift units along the current on a
    // curved path, fades out, and starts again
    float life = fract(t * (0.12 + 0.08 * seed) + seed);
    float slow = t * 0.05;
    vec3 a = current(position * uField, slow);
    vec3 b = current((position + a * uDrift) * uField, slow);
    vec3 p = position + uDrift * (life * a + 0.5 * life * life * (b - a));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uScale / -mv.z;
    vColor = color;
    // fade in/out over the life; brightness patches drift over the field
    float fade = sin(3.14159 * life);
    float shade = 0.5 + 0.5 * snoise(position * uField * 0.7 + vec3(slow * 3.0, 0.0, -slow * 2.0));
    vAlpha = uOpacity * mix(1.0, fade, step(0.001, uDrift)) * (1.0 - uTwinkle * shade);
  }
`;
// --- relief needles: a regular grid of hair-thin lines whose heights keep
// moving: a slow swell (noise over the field) plus each needle's own fast
// flicker; base heights follow the terrain ---
const NEEDLE_VERT = /* glsl */ `
  attribute float top; // 0 at the floor, 1 at the tip
  attribute float base; // the needle's terrain height
  attribute float seed;
  uniform float uTime;
  uniform float uSpeed;
  uniform float uField;
  uniform float uFlicker; // 0: only the swell, 1: only each needle's flicker
  uniform float uSweep; // staged: 0..1 the order sweep across the floor
  uniform float uOrderH; // the even height the needles settle to
  uniform float uSettleSwell; // how much the settled field still breathes
  uniform float uWorld;
  uniform float uMaxRise;
  uniform float uGrow; // staged intro: 0..1, the needles growing out of the floor
  uniform vec3 uLow;
  uniform vec3 uHigh;
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vAlpha;
  ${SIMPLEX}
  void main() {
    float t = uTime * uSpeed;
    float swell = 0.5 + 0.5 * snoise(vec3(position.xz * uField, t * 0.2));
    float flick = 0.5 + 0.5 * snoise(vec3(seed * 91.7, t * 0.9, seed * 13.1));
    float k = clamp(mix(swell, flick, uFlicker) * 1.25 - 0.1, 0.04, 1.2);
    // order: behind the sweep (along x) the needles settle to one even,
    // gently breathing height
    // the sweep runs from the back (-z) to the front (+z)
    float sz = position.z / uWorld + 0.5;
    float o = clamp((uSweep * 1.25 - sz) / 0.25, 0.0, 1.0);
    o = o * o * (3.0 - 2.0 * o);
    // settled: an even field that keeps the terrain's soft shape, with one
    // slow swell shared by neighbours (no per-needle wobble: that shimmers)
    float settled = uOrderH * (0.3 + 0.7 * base / uMaxRise) * (1.0 - uSettleSwell + uSettleSwell * swell);
    float h = mix(base * k, settled, o);
    // growing in: a wave from the centre out, each needle a little late
    float r = length(position.xz) / (uWorld * 0.71);
    float g = clamp((uGrow * 1.6 - r - seed * 0.3) / 0.3, 0.0, 1.0);
    g = g * g * (3.0 - 2.0 * g);
    h *= g;
    vec3 p = position;
    p.y += top * h;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    // dim at the floor, brighter toward a tall tip; even once ordered
    vColor = mix(uLow, uHigh, top * mix(clamp(k, 0.0, 1.0), 0.6, o));
    vAlpha = uOpacity * mix(0.25, 1.0, top) * min(1.0, g * 2.0);
  }
`;
const NEEDLE_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(vColor, vAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const DOT_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    gl_FragColor = vec4(vColor, vAlpha * smoothstep(1.0, 0.45, d));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// --- Unity-style SmoothDamp (what camera-controls uses) ---
type Damp = { v: number };
// `eps`: an error this small (with the motion nearly stopped) lands on the
// goal; it's under half a pixel at the map's distances, so the view stops
// redrawing ~3 s after a flight instead of creeping on.
function smoothDamp(cur: number, to: number, vel: Damp, smooth: number, dt: number, eps: number) {
  smooth = Math.max(0.0001, smooth);
  const omega = 2 / smooth;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - to;
  const temp = (vel.v + omega * change) * dt;
  vel.v = (vel.v - omega * temp) * exp;
  let out = to + (change + temp) * exp;
  if (to - cur > 0 === out > to || (Math.abs(out - to) < eps && Math.abs(vel.v) < eps * 5)) {
    out = to;
    vel.v = 0;
  }
  return out;
}

export class MapScene {
  readonly root = new Group();
  readonly camera = new PerspectiveCamera(FOV, 1, 0.1, 400);
  private readonly lines: LineMaterial[] = [];
  private readonly disposables: (BufferGeometry | Material | Texture)[] = [];
  // fade groups: side labels/callouts (gone top-down), the flat top block
  private readonly side: Object3D[] = [];
  private readonly top: Object3D[] = [];
  // the levels above the floor (1 extract, 2 refine, 3 signal): their grid
  // and content, and the side labels/callouts that belong to them. With
  // stagedLayers the first tab shows none, the middle tab builds 1-2 and the
  // top-down tab 3: a scan plane rises and each level fades in as it passes
  private readonly levelObjs: Object3D[][] = [[], [], [], []];
  private readonly levelSide: { obj: Object3D; level: number }[] = [];
  private readonly levelReveal = [1, 1, 1, 1];
  // linear progress behind levelReveal (which is that, eased out)
  private readonly levelProg = [1, 1, 1, 1];
  private scanY: number = LEVEL.signal;
  private scanAlpha = 0;
  // staged: the floor's chaos -> order sweep (0..1), and its line
  private sweep = 0;
  private sweepLine: Line2 | null = null;
  // the first tab's timeline: time on this tab, moved in yet, the anomaly
  private stageT = 0;
  private closeUp = false;
  // per tab: its animation has played once (later visits skip to its end)
  private readonly played = [false, false, false];
  private alertProg = 0;
  private alert: Group | null = null;
  private alertStem: Object3D | null = null;
  private alertRing: Object3D | null = null;
  // staged: tab flights run a fixed-length ease that ends exactly, instead
  // of the damped approach's long sub-pixel tail (thin lines crawl and the
  // HTML overlay steps a pixel at a time while it creeps)
  private flight: { from: number[]; to: number[]; t: number; dur: number } | null = null;
  // staged intro: the needles growing out of the floor (0..1)
  private grow = 1;
  // staged top tab: everything below the ring fades back (0..1)
  private dim = 0;
  // the lens shift, current and goal (flies with the camera)
  private lens = 0;
  private lensGoal = 0;
  private scan: Mesh | null = null;
  private sideReveal = 1;
  // relief dots (reliefStyle "dots"), animated while drift/twinkle are on
  private reliefMat: ShaderMaterial | null = null;
  private time = 0;
  private topReveal = 0;

  // camera: spherical around a target, current + goal, damped
  private readonly target = new Vector3();
  private readonly goalTarget = new Vector3();
  private radius = 1;
  private phi = 1;
  private theta = 0;
  private goal = { radius: 1, phi: 1, theta: 0 };
  private readonly vel = { radius: { v: 0 }, phi: { v: 0 }, theta: { v: 0 }, x: { v: 0 }, y: { v: 0 }, z: { v: 0 } };
  private stepIndex = 0;
  private aspect = 1;
  private dragging = false;
  // false until the first setStep: the first framing is placed, not flown
  private placed = false;
  // reduced motion (setReducedMotion); a jump the next update settles in one go
  private reduced = false;
  private snap = false;
  // staged: the Signals/Reasoning/Actions beats (map-signals.ts)
  readonly signals: SignalsLayer | null = null;
  private readonly cfg: MapConfig;

  constructor(cfg: MapConfig) {
    // a zero tempo or scan speed would never land
    this.cfg = { ...cfg, tempo: Math.max(0.05, cfg.tempo), buildSpeed: Math.max(0.1, cfg.buildSpeed) };
    this.build();
    if (this.cfg.stagedLayers) {
      const c = this.cfg;
      this.signals = new SignalsLayer({
        ...signalsDefaults,
        colors: [signalsDefaults.colors[0], c.alertColor, signalsDefaults.colors[2]],
        tiles: c.tileLabels.split(",").map((t) => t.trim()) as [string, string, string],
      });
      this.root.add(this.signals.root);
    }
  }

  get step() {
    return this.stepIndex;
  }

  private track<T extends BufferGeometry | Material | Texture>(x: T): T {
    this.disposables.push(x);
    return x;
  }

  private line(points: V3[], o: Parameters<typeof makeLine>[1], parent: Object3D = this.root) {
    const l = makeLine(points, o);
    this.lines.push(l.material);
    this.track(l.geometry);
    this.track(l.material);
    parent.add(l);
    return l;
  }

  private text(text: string, o: TextOpts, parent: Object3D) {
    const m = makeText(text, o);
    this.track(m.geometry);
    this.track(m.material as Material);
    this.track((m.material as MeshBasicMaterial).map!);
    m.userData.opacity = o.opacity ?? 1;
    parent.add(m);
    return m;
  }

  private build() {
    const c = this.cfg;
    const root = this.root;

    // --- the tall gridded box ---
    const edges = this.track(new EdgesGeometry(new BoxGeometry(WORLD, BOX_H, WORLD)));
    const box = new LineSegments(
      edges,
      this.track(new LineBasicMaterial({ color: c.frameColor, transparent: true, opacity: Math.min(1, 0.3 + c.gridOpacity * 2) })),
    );
    box.position.y = BOX_H / 2 - 0.5;
    if (c.walls) root.add(box);
    const gridGeo = this.track(new PlaneGeometry(WORLD, WORLD, 44, 44));
    const gridMat = this.track(
      new MeshBasicMaterial({ color: c.frameColor, wireframe: true, transparent: true, opacity: c.gridOpacity, depthWrite: false }),
    );
    [LEVEL.extract, LEVEL.refine, LEVEL.signal].forEach((y, i) => {
      // a material per level, so each can fade on its own
      const g = new Mesh(gridGeo, i ? this.track(gridMat.clone()) : gridMat);
      g.position.y = y;
      g.rotation.x = -Math.PI / 2;
      root.add(g);
      this.levelObjs[i + 1].push(g);
    });
    // the scan plane (stagedLayers): a faint sheet with a bright edge
    if (c.stagedLayers) {
      const scan = new Mesh(
        this.track(new PlaneGeometry(WORLD, WORLD)),
        this.track(new MeshBasicMaterial({ color: c.labelColor, transparent: true, opacity: 0, depthWrite: false, side: DoubleSide })),
      );
      scan.rotation.x = -Math.PI / 2;
      const edge = new LineSegments(
        this.track(new EdgesGeometry(scan.geometry)),
        this.track(new LineBasicMaterial({ color: c.labelColor, transparent: true, opacity: 0, depthWrite: false })),
      );
      scan.add(edge);
      scan.visible = false;
      root.add(scan);
      this.scan = scan;
      // the sweep: a bright line across the floor (along x), moving front-ward
      this.sweepLine = this.line([[-WORLD / 2, 0.05, 0], [WORLD / 2, 0.05, 0]], { color: c.sweepColor, width: 2, opacity: 0 });
      this.sweepLine.visible = false;
      // the anomaly: a tall needle and a ring at its foot, in the alert colour
      const a = new Group();
      a.position.set(ALERT_AT[0], LEVEL.floor + 0.03, ALERT_AT[1]);
      const stem = this.line([[0, 0, 0], [0, 1, 0]], { color: c.alertColor, width: 2.5, opacity: 1 }, a);
      this.alertStem = stem;
      const ring: V3[] = [];
      for (let k = 0; k <= 48; k++) ring.push([Math.cos((k / 48) * Math.PI * 2) * 0.4, 0.01, Math.sin((k / 48) * Math.PI * 2) * 0.4]);
      const r = this.line(ring, { color: c.alertColor, width: 1.2, opacity: 0.7 }, a);
      this.alertRing = r;
      a.visible = false;
      root.add(a);
      this.alert = a;
    }

    // --- floor: the real elevation as a wireframe (floor.tsx) ---
    {
      const seg = MAP_DATA.floor.segments;
      const hs = bytes(MAP_DATA.floor.heights);
      const geo = this.track(new PlaneGeometry(WORLD, WORLD, seg, seg));
      const pos = geo.attributes.position;
      // PlaneGeometry vertices run row by row from +y (the far edge), the
      // same order the heights were baked in
      for (let i = 0; i < pos.count; i++) pos.setZ(i, (hs[i] / 255) * 1.6);
      pos.needsUpdate = true;
      const floor = new Mesh(
        geo,
        this.track(new MeshBasicMaterial({ color: c.wireColor, wireframe: true, transparent: true, opacity: c.wireOpacity })),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = LEVEL.floor;
      root.add(floor);
    }

    // --- relief: thin spikes off the bright cells (hanging-relief.tsx) ---
    {
      const res = MAP_DATA.relief.res;
      const raw = bytes(MAP_DATA.relief.cells);
      const cells = new Uint16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
      const t = c.reliefThreshold;
      const cell = WORLD / res;
      const maxRise = (LEVEL.extract - LEVEL.floor) * 0.9;
      const pale = new Color(c.reliefPale);
      const deep = new Color(c.reliefDeep);
      const mats: Matrix4[] = [];
      const cols: Color[] = [];
      const dots = c.reliefStyle === "dots";
      const needles = c.reliefStyle === "needles";
      const dotPos: number[] = [];
      const dotCol: number[] = [];
      const dotSeed: number[] = [];
      // seeded, so the cloud is the same on every load
      let seed = 1;
      const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
      if (needles) {
        // a regular n x n grid over the floor, each needle's base height
        // from the terrain cell under it (low ground gets short needles)
        const n = Math.max(4, Math.round(c.reliefNeedleGrid));
        const pos: number[] = [];
        const top: number[] = [];
        const base: number[] = [];
        const sd: number[] = [];
        for (let iy = 0; iy < n; iy++) {
          for (let ix = 0; ix < n; ix++) {
            const u = (ix + 0.5) / n;
            const w = (iy + 0.5) / n;
            const v = cells[Math.min(res - 1, Math.floor(w * res)) * res + Math.min(res - 1, Math.floor(u * res))] / 65535;
            const intensity = Math.min(1, Math.max(0, (v - t * 0.5) / Math.max(1e-6, 0.5 - t * 0.5)));
            const h = maxRise * (0.15 + 0.85 * intensity);
            const x = (u - 0.5) * WORLD;
            const z = (w - 0.5) * WORLD;
            const r = rand();
            pos.push(x, LEVEL.floor + 0.03, z, x, LEVEL.floor + 0.03, z);
            top.push(0, 1);
            base.push(h, h);
            sd.push(r, r);
          }
        }
        const geo = this.track(new BufferGeometry());
        geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
        geo.setAttribute("top", new Float32BufferAttribute(top, 1));
        geo.setAttribute("base", new Float32BufferAttribute(base, 1));
        geo.setAttribute("seed", new Float32BufferAttribute(sd, 1));
        this.reliefMat = this.track(
          new ShaderMaterial({
            vertexShader: NEEDLE_VERT,
            fragmentShader: NEEDLE_FRAG,
            uniforms: {
              uTime: { value: 0 },
              uSpeed: { value: c.reliefDriftSpeed },
              uField: { value: c.reliefDriftScale },
              uFlicker: { value: c.reliefTwinkle },
              uSweep: { value: 0 },
              uOrderH: { value: c.reliefOrderHeight },
              uSettleSwell: { value: c.reliefSettleSwell },
              uWorld: { value: WORLD },
              uMaxRise: { value: maxRise },
              uGrow: { value: 1 },
              uLow: { value: new Color(c.reliefPale) },
              uHigh: { value: new Color(c.reliefDeep) },
              uOpacity: { value: c.reliefOpacity },
            },
            transparent: true,
            depthWrite: false,
          }),
        );
        const lines = new LineSegments(geo, this.reliefMat);
        lines.frustumCulled = false;
        root.add(lines);
      }
      for (let gy = 0; gy < res && !needles; gy++) {
        for (let gx = 0; gx < res; gx++) {
          const v = cells[gy * res + gx] / 65535;
          if (v < t) continue;
          const intensity = Math.min(1, (v - t) / Math.max(1e-6, 0.5 - t));
          const h = maxRise * (0.12 + intensity * 0.88);
          const x = (gx / (res - 1) - 0.5) * WORLD;
          const z = (gy / (res - 1) - 0.5) * WORLD;
          if (dots) {
            const col = new Color().lerpColors(pale, deep, intensity ** 0.7);
            for (let k = 0; k < Math.max(1, Math.round(c.reliefDotsPerCell)); k++) {
              dotPos.push(x + (rand() - 0.5) * cell, LEVEL.floor + 0.03 + h * c.reliefDotRise * (0.85 + rand() * 0.3), z + (rand() - 0.5) * cell);
              dotCol.push(col.r, col.g, col.b);
              dotSeed.push(rand());
            }
            continue;
          }
          const m = new Matrix4().makeTranslation(x, LEVEL.floor + h / 2 + 0.03, z);
          m.multiply(new Matrix4().makeScale(cell * 0.42, h, cell * 0.42));
          mats.push(m);
          cols.push(new Color().lerpColors(pale, deep, intensity ** 0.7));
        }
      }
      if (dotPos.length) {
        const geo = this.track(new BufferGeometry());
        geo.setAttribute("position", new Float32BufferAttribute(dotPos, 3));
        geo.setAttribute("color", new Float32BufferAttribute(dotCol, 3));
        geo.setAttribute("seed", new Float32BufferAttribute(dotSeed, 1));
        this.reliefMat = this.track(
          new ShaderMaterial({
            vertexShader: DOT_VERT,
            fragmentShader: DOT_FRAG,
            uniforms: {
              uTime: { value: 0 },
              uSize: { value: c.reliefDotSize },
              uScale: { value: 500 },
              uOpacity: { value: c.reliefOpacity },
              uDrift: { value: c.reliefDrift },
              uTwinkle: { value: c.reliefTwinkle },
              uSpeed: { value: c.reliefDriftSpeed },
              uField: { value: c.reliefDriftScale },
            },
            transparent: true,
            depthWrite: false,
          }),
        );
        const pts = new Points(geo, this.reliefMat);
        pts.frustumCulled = false;
        root.add(pts);
      }
      if (mats.length) {
        const mesh = new InstancedMesh(
          this.track(new BoxGeometry(1, 1, 1)),
          this.track(new MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: c.reliefOpacity, depthWrite: true })),
          mats.length,
        );
        mats.forEach((m, i) => {
          mesh.setMatrixAt(i, m);
          mesh.setColorAt(i, cols[i]);
        });
        // instances spread over the map; culling by the unit box would drop them
        mesh.frustumCulled = false;
        root.add(mesh);
      }
    }

    // --- extraction levels (extraction-levels.tsx) ---
    let from = root.children.length;
    const toLevel = (level: number) => {
      this.levelObjs[level].push(...root.children.slice(from));
      from = root.children.length;
    };
    const coast = feature(MAP_DATA.coast);
    const regions = MAP_DATA.regions.map(feature);
    const hatch = this.hatchTexture();
    const ring3 = (r: [number, number][], y: number): V3[] => r.map(([x, z]) => [x, y, z]);
    const cutout = (f: Feature, y: number, edge: string, edgeOpacity: number) => {
      const shape = new Shape();
      f.ring.forEach(([x, z], i) => (i ? shape.lineTo(x, z) : shape.moveTo(x, z)));
      shape.closePath();
      const m = new Mesh(
        this.track(new ShapeGeometry(shape)),
        this.track(new MeshBasicMaterial({ map: hatch, transparent: true, opacity: 0.5, side: DoubleSide, depthWrite: false })),
      );
      m.position.y = y;
      m.rotation.x = Math.PI / 2;
      root.add(m);
      this.line(ring3(f.ring, y), { color: edge, width: 1.2, opacity: edgeOpacity });
    };
    // the original map's forms (mapForms; off for the staged video story)
    if (c.mapForms) {
      // extract: the coastline lifted off the map + its hatched landmass
      this.line(ring3(coast.ring, LEVEL.extract), { color: c.coastColor, width: 1.4, opacity: 0.85 });
      cutout(coast, LEVEL.extract - 0.02, c.frameColor, 0.4);
      toLevel(1);
      // refine: fewer, tighter shapes; the first is ringed as the anomaly
      regions.forEach((r, i) => {
        cutout(r, LEVEL.refine, c.formStrongColor, 0.9);
        if (i) return;
        const torus = new Mesh(
          this.track(new TorusGeometry(Math.min(1.4, Math.sqrt(r.area) / 60 + 0.5), 0.025, 8, 64)),
          this.track(new MeshBasicMaterial({ color: c.accentColor, transparent: true, opacity: 0.95 })),
        );
        torus.position.set(r.centroid[0], LEVEL.refine + 0.02, r.centroid[1]);
        torus.rotation.x = -Math.PI / 2;
        root.add(torus);
      });
      toLevel(2);
      // signal: the distilled specks
      const speckMat = this.track(new MeshBasicMaterial({ color: c.accentColor, side: DoubleSide }));
      const speckBig = this.track(new PlaneGeometry(0.3, 0.3));
      const speckSmall = this.track(new PlaneGeometry(0.14, 0.14));
      MAP_DATA.specks.forEach(([x, z], i) => {
        const m = new Mesh(i ? speckSmall : speckBig, speckMat);
        m.position.set(x, LEVEL.signal, z);
        m.rotation.x = -Math.PI / 2;
        root.add(m);
      });
      // the trace: a spine up through the levels, then a branch to every speck
      {
        const [cx, cz] = coast.centroid;
        const a = regions[0]?.centroid ?? coast.centroid;
        const anchor: V3 = [a[0], LEVEL.refine, a[1]];
        this.line([[cx, LEVEL.floor + 0.05, cz], [cx, LEVEL.extract, cz], anchor], { color: c.traceColor, width: 1.2, opacity: 0.6, dashed: true });
        for (const [sx, sz] of MAP_DATA.specks) {
          this.line([anchor, [sx, LEVEL.signal, sz]], { color: c.traceColor, width: 0.8, opacity: 0.4, dashed: true });
        }
      }
    }
    if (!c.mapForms) {
      toLevel(1);
      toLevel(2);
    }
    toLevel(3);

    // --- level labels (SpatialDataMap.tsx LevelLabels): side view only ---
    const labels = c.labels.split(",").map((s) => s.trim());
    [LEVEL.floor, LEVEL.extract, LEVEL.refine, LEVEL.signal].forEach((y, i) => {
      if (!labels[i]) return;
      const t = this.text(
        labels[i].toUpperCase(),
        { family: c.fontSans, size: c.labelSize, spacing: 0.1, anchorX: "right", anchorY: "middle", color: c.labelColor, opacity: 0.8 },
        root,
      );
      t.position.set(-WORLD / 2 - 1.2, y + 0.35, WORLD / 2);
      // above the floor: also fades with its level
      if (i) this.levelSide.push({ obj: t, level: i });
      else this.side.push(t);
      // staged: the floor's label sits under the floor's near corner,
      // turned to the close-up camera, so it stays in frame
      if (!i && c.stagedLayers) {
        t.geometry.computeBoundingBox();
        const bb = t.geometry.boundingBox!;
        t.geometry.translate(-(bb.min.x + bb.max.x) / 2, 0, 0);
        t.position.set(WORLD / 2 - 1.5, -0.9, WORLD / 2 - 1.5);
        t.rotation.y = Math.PI / 4;
      }
    });

    // --- callouts (callouts.tsx): upright leaders + stats, side view ---
    const edge = WORLD / 2 + 1.6;
    const upright: { from: V3; stat: string; caption: string; side: 1 | -1 }[] = [
      { from: [coast.centroid[0], LEVEL.extract, coast.centroid[1]], stat: c.extractStat, caption: c.extractCaption, side: 1 },
    ];
    if (regions[0]) {
      upright.push({ from: [regions[0].centroid[0], LEVEL.refine, regions[0].centroid[1]], stat: c.refineStat, caption: c.refineCaption, side: -1 });
    }
    for (const [ui, u] of upright.entries()) {
      // no stat and no caption: no callout
      if (!u.stat.trim() && !u.caption.trim()) continue;
      const g = new Group();
      const tx = u.side * edge;
      const tz = u.from[2];
      const ty = u.from[1] + 0.9;
      const ax = u.side > 0 ? "left" : "right";
      this.line([u.from, [u.from[0], ty, tz], [tx, ty, tz]], { color: c.calloutColor, width: 0.8, opacity: 0.6 }, g);
      this.text(u.stat, { family: c.fontMono, size: 0.52, spacing: 0.02, anchorX: ax, anchorY: "bottom", color: c.calloutColor }, g).position.set(tx, ty + 0.35, tz);
      this.text(u.caption.toUpperCase(), { family: c.fontSans, size: 0.24, spacing: 0.08, anchorX: ax, anchorY: "top", color: c.calloutColor }, g).position.set(tx, ty - 0.08, tz);
      root.add(g);
      this.levelSide.push({ obj: g, level: ui + 1 });
    }

    // --- the flat signal block, readable top-down (SignalFlatCallouts) ---
    {
      const g = new Group();
      g.position.y = LEVEL.signal + 0.04;
      g.rotation.x = -Math.PI / 2;
      const bx = -WORLD / 2 + 1.4;
      const by = WORLD / 2 - 1.6;
      const parts: [string, TextOpts, number, number][] = [
        [c.signalTitle.toUpperCase(), { family: c.fontSans, size: 0.5, spacing: 0.22, anchorX: "left", anchorY: "top", color: c.calloutColor }, bx, by],
        [c.signalStat, { family: c.fontMono, size: 1.7, anchorX: "left", anchorY: "top", color: c.calloutColor }, bx - 0.05, by - 0.7],
        [c.signalCaption.toUpperCase(), { family: c.fontSans, size: 0.34, spacing: 0.12, anchorX: "left", anchorY: "top", color: c.calloutColor }, bx, by - 2.55],
      ];
      for (const [s, o, x, y] of parts) {
        const t = this.text(s, o, g);
        t.position.set(x, y, 0);
        t.renderOrder = 20;
      }
      root.add(g);
      this.top.push(g);
    }
    this.applyReveal();
  }

  // 45° hatching, seeded offsets (extraction-levels.tsx paintHatchTexture)
  private hatchTexture() {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    ctx.strokeStyle = this.cfg.formColor;
    ctx.lineWidth = 1;
    for (const t of MAP_DATA.hatch) {
      const y = t * size * 2 - size / 2;
      ctx.beginPath();
      ctx.moveTo(-4, y);
      ctx.lineTo(size + 4, y - size);
      ctx.stroke();
    }
    const tex = this.track(new CanvasTexture(canvas));
    tex.wrapS = tex.wrapT = RepeatWrapping;
    tex.repeat.set(2, 2);
    return tex;
  }

  // --- camera ---

  // The step's framing for this aspect: the original was composed for a
  // wide panel (≈2.3:1); narrower panels move the camera back so the box
  // still fits across (the close-up keeps a desktop panel's width of view,
  // so its side labels stay in), and the top-down step backs off until the
  // whole signal square (with its text block) fits.
  private framing(i: number) {
    const s = !this.cfg.stagedLayers ? STEPS[i] : i === 0 ? (this.closeUp ? FLOOR_CLOSE : FLOOR_STEP) : i === 1 ? REFINE_WIDE : this.aspect < 1.25 ? DELIVER_SQUARE : DELIVER_STEP;
    const t = new Vector3(...s.target);
    const off = new Vector3(...s.position).sub(t);
    let radius = off.length();
    const phi = Math.acos(Math.min(1, Math.max(-1, off.y / radius)));
    const theta = Math.atan2(off.x, off.z);
    const tanHalf = Math.tan(((FOV / 2) * Math.PI) / 180);
    if (i === 2 && !this.cfg.stagedLayers) {
      // the 16-unit square plus a margin, in the narrower screen direction
      radius = Math.max(radius, (WORLD / 2 + 0.6) / (tanHalf * Math.min(1, this.aspect)));
    } else {
      radius *= Math.max(1, (this.cfg.fitAspect * (i === 1 ? 1.25 : 1)) / this.aspect);
    }
    return { target: t, radius: radius * this.cfg.zoom, phi, theta };
  }

  setAspect(aspect: number) {
    this.aspect = aspect;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    // re-frame the camera only (keeping any drag offset is not worth it on
    // resize); a flight in progress keeps going, to the new framing. The
    // tab's timeline (sweep, anomaly, build) is left alone.
    if (!this.placed || this.dragging) return;
    if (this.flight) {
      // retarget the flight and its goal together, so nothing drifts back
      // to the old framing when it lands
      const f = this.framing(this.stepIndex);
      this.goalTarget.copy(f.target);
      this.goal = { radius: f.radius, phi: f.phi, theta: this.flight.to[2] };
      this.lensGoal = this.deliverLens();
      this.flight.to = [f.radius, f.phi, this.flight.to[2], f.target.x, f.target.y, f.target.z, this.lensGoal];
    } else this.aim(true);
  }

  // relief dot sizes: drawing-buffer pixels per world unit at distance 1
  // (half the buffer height, as three's PointsMaterial)
  setPointScale(bufferHeight: number) {
    if (this.reliefMat?.uniforms.uScale) this.reliefMat.uniforms.uScale.value = bufferHeight / 2;
  }

  setResolution(w: number, h: number) {
    for (const m of this.lines) m.resolution.set(w, h);
    this.signals?.setView(this.camera, h);
  }

  // Fly to a step (or jump: `instant`, reduced motion, the first framing).
  setStep(i: number, instant = false) {
    const next = Math.max(0, Math.min(2, i));
    const prev = this.stepIndex;
    const first = !this.placed;
    // the tab already on show (a re-click): staged, nothing (its animation
    // never restarts); otherwise fly back to its view after a drag
    if (!first && next === prev) {
      if (!this.cfg.stagedLayers) this.aim(instant);
      return;
    }
    this.stepIndex = next;
    if (!this.cfg.stagedLayers) {
      this.aim(instant, undefined, instant);
      return;
    }
    // Staged: a tab plays its part the first time it shows. Later visits,
    // coming back down from a higher tab, a jump and reduced motion go
    // straight to its end (the camera still flies, unless it's a jump).
    // (the first placement is never flown; `instant` there only places it)
    const jump = this.reduced || (instant && !first);
    const skip = this.reduced || (instant && !first) || this.played[next] || (!first && next < prev);
    this.stageT = skip ? this.stageEnd(next) : 0;
    this.snap = jump;
    if (next === 0 && !skip) {
      // the intro: placed wide, then one continuous push-in, timed to land
      // as the anomaly rises
      this.closeUp = false;
      this.grow = 0;
      this.aim(jump, undefined, jump);
      this.closeUp = true;
      this.aim(jump, CHAOS_HOLD + this.cfg.sweepTime + ALERT_DELAY + 0.6);
      return;
    }
    this.closeUp = next === 0;
    // jumping past a tab (Own -> Deliver): no scan through the levels in
    // between; they fade straight in (already faded back), one thing at a
    // time while the camera makes its big move
    if (!first && next - prev > 1) this.scanY = LEVELS[this.targetLevel()];
    // the middle tab's first play: one continuous pull-back, landing as the
    // tiles drop in
    this.aim(jump || first, next === 1 && !skip ? REFINE_FLIGHT : undefined, jump || first);
  }

  // the lens shift on the staged top tab (wide panels)
  private deliverLens() {
    return this.cfg.stagedLayers && this.stepIndex === 2 && this.aspect >= 1.25 ? DELIVER_LENS : 0;
  }

  // reduced motion: tabs jump to their end, nothing animates
  setReducedMotion(on: boolean) {
    this.reduced = on;
  }

  // point the camera at the current step's framing (fly, or jump)
  // reset: also put the tab's timeline state in its landed place (a jump
  // to a tab), not just the camera
  private aim(instant = false, dur = this.cfg.smoothTime * 2.5, reset = false) {
    const f = this.framing(this.stepIndex);
    this.goalTarget.copy(f.target);
    // the shortest way round to the goal azimuth (after a drag)
    const turn = Math.PI * 2;
    const theta = f.theta + Math.round((this.theta - f.theta) / turn) * turn;
    this.goal = { radius: f.radius, phi: f.phi, theta: this.placed ? theta : f.theta };
    this.lensGoal = this.deliverLens();
    this.flight =
      this.cfg.stagedLayers && this.placed && !instant && !this.dragging
        ? {
            from: [this.radius, this.phi, this.theta, this.target.x, this.target.y, this.target.z, this.lens],
            to: [this.goal.radius, this.goal.phi, this.goal.theta, this.goalTarget.x, this.goalTarget.y, this.goalTarget.z, this.lensGoal],
            t: 0,
            dur,
          }
        : null;
    if (instant || !this.placed) {
      this.target.copy(this.goalTarget);
      this.lens = this.lensGoal;
      this.radius = this.goal.radius;
      this.phi = this.goal.phi;
      this.theta = this.goal.theta;
      for (const v of Object.values(this.vel)) v.v = 0;
    }
    if (reset || !this.placed) {
      this.sideReveal = this.stepIndex === 2 ? 0 : 1;
      this.topReveal = this.stepIndex === 2 ? 1 : 0;
      const to = this.targetLevel();
      this.scanY = LEVELS[to];
      // the first tab's floor and anomaly, as far as its timeline has got
      const settled = to > 0 || this.stageT >= CHAOS_HOLD + this.cfg.sweepTime;
      this.sweep = settled ? 1 : 0;
      this.alertProg = to > 0 || this.stageT >= this.stageEnd(0) ? 1 : 0;
      for (let l = 1; l <= 3; l++) this.levelReveal[l] = this.levelProg[l] = l <= to ? 1 : 0;
      this.scanAlpha = 0;
      this.applyReveal();
    }
    if (!instant && this.placed) {
      // building up: the scan rises from where it is (update); going
      // down: it drops, and the levels above fade out
      this.scanY = Math.min(this.scanY, LEVELS[this.targetLevel()]);
    }
    this.placed = true;
    this.applyCamera();
  }

  // Mouse drag: dx/dy in CSS px; rotates like camera-controls (a drag the
  // height of the panel turns a full circle).
  drag(dx: number, dy: number, panelH: number) {
    const k = (Math.PI * 2) / Math.max(1, panelH);
    this.goal.theta -= dx * k;
    this.goal.phi = Math.min(POLAR_MAX, Math.max(POLAR_MIN, this.goal.phi - dy * k));
  }
  setDragging(on: boolean) {
    this.dragging = on;
    if (on && this.flight) {
      // take over from the flight where it is
      this.goal = { radius: this.radius, phi: this.phi, theta: this.theta };
      this.goalTarget.copy(this.target);
      this.flight = null;
    }
  }

  // Advance the camera and fades. Returns true while anything moved (the
  // view only redraws then).
  update(dt: number) {
    // staged: the story's clock runs at `tempo` (flights, timelines, scan)
    const st = dt * (this.cfg.stagedLayers ? this.cfg.tempo : 1);
    if (dt <= 0) return false;
    this.time += dt;
    const alive =
      !!this.reliefMat && !this.reduced && (this.cfg.reliefStyle === "needles" ? this.cfg.reliefDriftSpeed > 0 : this.cfg.reliefDrift > 0 || this.cfg.reliefTwinkle > 0);
    if (alive) this.reliefMat!.uniforms.uTime.value = this.time;
    const smooth = this.dragging ? DRAG_SMOOTH : this.cfg.smoothTime;
    const before = this.radius + this.phi + this.theta + this.target.x + this.target.y + this.target.z;
    // world units; radians (5e-4 rad ≈ 0.02 units at these distances)
    const E = 0.02;
    const A = 5e-4;
    if (this.flight) {
      // a gentle sine ease in-out, landing exactly
      const fl = this.flight;
      fl.t = Math.min(1, fl.t + st / Math.max(0.2, fl.dur));
      const e = 0.5 - 0.5 * Math.cos(Math.PI * fl.t);
      const v = fl.from.map((a, i) => a + (fl.to[i] - a) * e);
      [this.radius, this.phi, this.theta] = v;
      this.target.set(v[3], v[4], v[5]);
      this.lens = v[6];
      if (fl.t >= 1) {
        this.flight = null;
        for (const d of Object.values(this.vel)) d.v = 0;
      }
    } else {
      this.radius = smoothDamp(this.radius, this.goal.radius, this.vel.radius, smooth, dt, E);
      this.phi = smoothDamp(this.phi, this.goal.phi, this.vel.phi, smooth, dt, A);
      this.theta = smoothDamp(this.theta, this.goal.theta, this.vel.theta, smooth, dt, A);
      this.target.x = smoothDamp(this.target.x, this.goalTarget.x, this.vel.x, smooth, dt, E);
      this.target.y = smoothDamp(this.target.y, this.goalTarget.y, this.vel.y, smooth, dt, E);
      this.target.z = smoothDamp(this.target.z, this.goalTarget.z, this.vel.z, smooth, dt, E);
      this.lens = this.lensGoal;
    }
    const moved = Math.abs(this.radius + this.phi + this.theta + this.target.x + this.target.y + this.target.z - before) > 1e-6;
    // labels cross-fade with the step (use-reveal: 0.12 per 60 fps frame)
    const k = 1 - Math.pow(1 - 0.12, dt * 60);
    const sideTo = this.stepIndex === 2 ? 0 : 1;
    const topTo = this.stepIndex === 2 ? 1 : 0;
    let faded = false;
    if (this.sideReveal !== sideTo) {
      this.sideReveal += (sideTo - this.sideReveal) * k;
      if (Math.abs(sideTo - this.sideReveal) < 0.004) this.sideReveal = sideTo;
      faded = true;
    }
    if (this.topReveal !== topTo) {
      this.topReveal += (topTo - this.topReveal) * k;
      if (Math.abs(topTo - this.topReveal) < 0.004) this.topReveal = topTo;
      faded = true;
    }
    // the build: the scan rises to the tab's top level; each level fades in
    // (~1 s) once the scan reaches it, and out when the tab doesn't show it
    const to = this.targetLevel();
    const top = LEVELS[to];
    // staged: first the sweep orders the floor (going up from the first
    // tab), then the scan rises; back on the first tab the floor unsettles
    if (this.cfg.stagedLayers) {
      this.stageT += st;
      // the first tab: chaos for a moment, then the sweep; other tabs: settled
      const first = this.stepIndex === 0;
      const goal = !first || this.stageT >= CHAOS_HOLD ? 1 : 0;
      if (this.sweep !== goal) {
        this.sweep = goal > this.sweep ? Math.min(1, this.sweep + st / this.cfg.sweepTime) : Math.max(0, this.sweep - st / 0.4);
        faded = true;
      }
      if (this.reliefMat?.uniforms.uSweep) this.reliefMat.uniforms.uSweep.value = this.sweep;
      if (this.grow < 1) {
        this.grow = this.snap || this.reduced || !first ? 1 : Math.min(1, this.grow + st / GROW);
        if (this.reliefMat?.uniforms.uGrow) this.reliefMat.uniforms.uGrow.value = this.grow;
        faded = true;
      }
      if (this.sweepLine) {
        const on = goal === 1 && this.sweep > 0 && this.sweep < 1;
        this.sweepLine.visible = on;
        this.sweepLine.position.z = (this.sweep * 1.25 - 0.125 - 0.5) * WORLD;
        this.sweepLine.material.opacity = on ? 0.95 : 0;
      }
      // settled (the camera is pushing in all along): the anomaly rises
      const alertGoal = !first || this.stageT >= CHAOS_HOLD + this.cfg.sweepTime + ALERT_DELAY ? 1 : 0;
      if (this.alertProg !== alertGoal) {
        this.alertProg = alertGoal > this.alertProg ? Math.min(1, this.alertProg + st / ALERT_RISE) : Math.max(0, this.alertProg - st / 0.3);
        faded = true;
      }
      if (this.stageT >= this.stageEnd(this.stepIndex)) this.played[this.stepIndex] = true;
      if (this.alert) {
        const e = 1 - (1 - this.alertProg) ** 3;
        this.alert.visible = this.alertProg > 0;
        this.alertStem!.scale.y = Math.max(0.001, ALERT_H * e);
        this.alertRing!.scale.setScalar(Math.max(0.001, e));
      }
    }
    // staged top tab: the layers below the ring fade back (they read as
    // noise from straight above), and return on the other tabs
    if (this.cfg.stagedLayers) {
      const goal = this.stepIndex === 2 ? 1 : 0;
      if (this.dim !== goal) {
        this.dim = this.snap || this.reduced ? goal : goal > this.dim ? Math.min(1, this.dim + st / 0.4) : Math.max(0, this.dim - st / 0.6);
        faded = true;
      }
      const d = 1 - 0.95 * this.dim;
      if (this.reliefMat?.uniforms.uOpacity) this.reliefMat.uniforms.uOpacity.value = this.cfg.reliefOpacity * d;
      if (this.alertStem) (this.alertStem as Line2).material.opacity = 1 - 0.75 * this.dim;
      if (this.alertRing) (this.alertRing as Line2).material.opacity = 0.7 * (1 - 0.75 * this.dim);
    }
    const building = this.scanY < top && (!this.cfg.stagedLayers || this.sweep >= 1);
    if (building) this.scanY = Math.min(top, this.scanY + this.cfg.buildSpeed * st);
    const kb = 1 - Math.pow(1 - 0.08, dt * 60);
    for (let l = 1; l <= 3; l++) {
      const goal = l <= to && this.scanY >= LEVELS[l] - 1e-3 ? 1 : 0;
      if (this.levelProg[l] === goal) continue;
      // ~0.45 s, eased out (snappy start, soft landing)
      const step = st / 0.45;
      this.levelProg[l] = goal > this.levelProg[l] ? Math.min(1, this.levelProg[l] + step) : Math.max(0, this.levelProg[l] - step * 1.5);
      this.levelReveal[l] = 1 - (1 - this.levelProg[l]) ** 3;
      faded = true;
    }
    if (this.scan) {
      const goal = building ? 1 : 0;
      if (this.scanAlpha !== goal) {
        this.scanAlpha += (goal - this.scanAlpha) * kb;
        if (Math.abs(goal - this.scanAlpha) < 0.004) this.scanAlpha = goal;
        faded = true;
      }
      this.scan.position.y = this.scanY;
      this.scan.visible = this.scanAlpha > 0.004;
      (this.scan.material as MeshBasicMaterial).opacity = 0.05 * this.scanAlpha;
      ((this.scan.children[0] as LineSegments).material as LineBasicMaterial).opacity = 0.75 * this.scanAlpha;
      if (building) faded = true;
    }
    if (faded) this.applyReveal();
    if (moved) this.applyCamera();
    // staged beats above the floor; a jump lands them in one update
    const snap = this.snap;
    this.snap = false;
    if (this.signals) this.signals.update(st, this.stepIndex, this.stageT, snap || this.reduced, this.dim);
    return moved || faded || alive || snap || !!(this.signals && !this.reduced);
  }

  private applyCamera() {
    const sp = Math.sin(this.phi);
    this.camera.position.set(
      this.target.x + this.radius * sp * Math.sin(this.theta),
      this.target.y + this.radius * Math.cos(this.phi),
      this.target.z + this.radius * sp * Math.cos(this.theta),
    );
    this.camera.lookAt(this.target);
    if (this.camera.filmOffset !== this.lens) {
      this.camera.filmOffset = this.lens;
      this.camera.updateProjectionMatrix();
    }
  }

  // the highest level this tab shows (stagedLayers: none / 1-2 / all)
  private targetLevel() {
    // staged: the middle tab builds Signals, then Reasoning once the
    // clusters have formed (its tiles drop in then)
    if (!this.cfg.stagedLayers) return 3;
    return this.stepIndex === 1 ? (this.stageT >= REASONING_AT ? 2 : 1) : [0, 1, 3][this.stepIndex];
  }

  // when a tab's staged animation is over (s)
  private stageEnd(step: number) {
    return step === 0 ? CHAOS_HOLD + this.cfg.sweepTime + ALERT_DELAY + ALERT_RISE : step === 1 ? REFINE_FLIGHT + 0.6 : 3;
  }

  // the camera isn't flying between tabs (text waits for this)
  get landed() {
    return !this.flight;
  }

  // seconds since this tab was landed on (staged timelines)
  get stageTime() {
    return this.stageT;
  }

  // the anomaly's tip (world) and how far its card is in (0..1), for the
  // HTML overlay; null when there is none
  get alertTip(): { x: number; y: number; z: number; card: number } | null {
    if (!this.alert || this.alertProg <= 0) return null;
    const e = 1 - (1 - this.alertProg) ** 3;
    // on the first tab, once the camera has (nearly) landed
    const landing = !this.flight || this.flight.t > 0.75;
    const card = this.stepIndex === 0 && landing ? Math.max(0, (this.alertProg - 0.7) / 0.3) : 0;
    return { x: ALERT_AT[0], y: LEVEL.floor + ALERT_H * e, z: ALERT_AT[1], card };
  }

  // how built each level is (1 extract, 2 refine, 3 signal), 0..1
  get levels(): [number, number, number] {
    return [this.levelReveal[1], this.levelReveal[2], this.levelReveal[3]];
  }

  private applyReveal() {
    const set = (objs: Object3D[], r: number) => {
      for (const o of objs) {
        o.visible = r > 0.01;
        o.traverse((n) => {
          const m = (n as Mesh).material as (Material & { opacity: number }) | undefined;
          if (!m || !("opacity" in m)) return;
          if (n.userData.opacity === undefined) n.userData.opacity = m.opacity;
          m.opacity = n.userData.opacity * r;
        });
      }
    };
    set(this.side, this.sideReveal);
    // the top tab's fade-back of the levels below the ring
    const levelDim = [1, 1 - 0.9 * this.dim, 1 - 0.8 * this.dim, 1 - 0.5 * this.dim];
    for (let l = 1; l <= 3; l++) {
      set(this.levelObjs[l], this.levelReveal[l] * levelDim[l]);
      // its lines (coastline, edges, trace) draw along their length
      for (const o of this.levelObjs[l]) {
        o.traverse((n) => {
          if (!(n instanceof Line2)) return;
          const g = n.geometry as LineGeometry;
          const total = g.attributes.instanceStart?.count ?? 0;
          g.instanceCount = this.levelReveal[l] >= 1 ? Infinity : Math.ceil(total * this.levelReveal[l]);
        });
      }
    }
    for (const { obj, level } of this.levelSide) set([obj], this.sideReveal * this.levelReveal[level]);
    set(this.top, this.topReveal);
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.signals?.dispose();
  }
}

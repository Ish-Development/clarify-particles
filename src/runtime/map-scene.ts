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
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  EdgesGeometry,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  RepeatWrapping,
  Shape,
  ShapeGeometry,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
  type Object3D,
  type Texture,
} from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { MAP_DATA } from "./map-data";
import type { MapConfig } from "./defaults";

// --- scene constants (the spatial map's generators.ts / camera-storyboard.ts) ---
const WORLD = MAP_DATA.world; // 16
const LEVEL_H = 6;
const LEVEL = { floor: 0, extract: LEVEL_H, refine: LEVEL_H * 2, signal: LEVEL_H * 3 };
const BOX_H = LEVEL.signal + 3;
const FOV = 40;
type V3 = [number, number, number];
const STEPS: { position: V3; target: V3 }[] = [
  { position: [30, 23, 30], target: [0, LEVEL.refine - 3.5, 0] },
  { position: [16, 15, 16], target: [0, (LEVEL.extract + LEVEL.refine) / 2, 0] },
  // north-up top-down (a hair of +z keeps the up vector stable)
  { position: [0, LEVEL.signal + 18, 0.001], target: [0, LEVEL.signal, 0] },
];
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
  private sideReveal = 1;
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

  constructor(private readonly cfg: MapConfig) {
    this.build();
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
    root.add(box);
    const gridGeo = this.track(new PlaneGeometry(WORLD, WORLD, 44, 44));
    const gridMat = this.track(
      new MeshBasicMaterial({ color: c.frameColor, wireframe: true, transparent: true, opacity: c.gridOpacity, depthWrite: false }),
    );
    for (const y of [LEVEL.extract, LEVEL.refine, LEVEL.signal]) {
      const g = new Mesh(gridGeo, gridMat);
      g.position.y = y;
      g.rotation.x = -Math.PI / 2;
      root.add(g);
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
      for (let gy = 0; gy < res; gy++) {
        for (let gx = 0; gx < res; gx++) {
          const v = cells[gy * res + gx] / 65535;
          if (v < t) continue;
          const intensity = Math.min(1, (v - t) / Math.max(1e-6, 0.5 - t));
          const h = maxRise * (0.12 + intensity * 0.88);
          const x = (gx / (res - 1) - 0.5) * WORLD;
          const z = (gy / (res - 1) - 0.5) * WORLD;
          const m = new Matrix4().makeTranslation(x, LEVEL.floor + h / 2 + 0.03, z);
          m.multiply(new Matrix4().makeScale(cell * 0.42, h, cell * 0.42));
          mats.push(m);
          cols.push(new Color().lerpColors(pale, deep, intensity ** 0.7));
        }
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
    // extract: the coastline lifted off the map + its hatched landmass
    this.line(ring3(coast.ring, LEVEL.extract), { color: c.coastColor, width: 1.4, opacity: 0.85 });
    cutout(coast, LEVEL.extract - 0.02, c.frameColor, 0.4);
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

    // --- level labels (SpatialDataMap.tsx LevelLabels): side view only ---
    const labels = c.labels.split(",").map((s) => s.trim());
    [LEVEL.floor, LEVEL.extract, LEVEL.refine, LEVEL.signal].forEach((y, i) => {
      if (!labels[i]) return;
      const t = this.text(
        labels[i].toUpperCase(),
        { family: c.fontSans, size: 0.42, spacing: 0.1, anchorX: "right", anchorY: "middle", color: c.labelColor, opacity: 0.8 },
        root,
      );
      t.position.set(-WORLD / 2 - 1.2, y + 0.35, WORLD / 2);
      this.side.push(t);
    });

    // --- callouts (callouts.tsx): upright leaders + stats, side view ---
    const edge = WORLD / 2 + 1.6;
    const upright: { from: V3; stat: string; caption: string; side: 1 | -1 }[] = [
      { from: [coast.centroid[0], LEVEL.extract, coast.centroid[1]], stat: c.extractStat, caption: c.extractCaption, side: 1 },
    ];
    if (regions[0]) {
      upright.push({ from: [regions[0].centroid[0], LEVEL.refine, regions[0].centroid[1]], stat: c.refineStat, caption: c.refineCaption, side: -1 });
    }
    for (const u of upright) {
      const g = new Group();
      const tx = u.side * edge;
      const tz = u.from[2];
      const ty = u.from[1] + 0.9;
      const ax = u.side > 0 ? "left" : "right";
      this.line([u.from, [u.from[0], ty, tz], [tx, ty, tz]], { color: c.calloutColor, width: 0.8, opacity: 0.6 }, g);
      this.text(u.stat, { family: c.fontMono, size: 0.52, spacing: 0.02, anchorX: ax, anchorY: "bottom", color: c.calloutColor }, g).position.set(tx, ty + 0.35, tz);
      this.text(u.caption.toUpperCase(), { family: c.fontSans, size: 0.24, spacing: 0.08, anchorX: ax, anchorY: "top", color: c.calloutColor }, g).position.set(tx, ty - 0.08, tz);
      root.add(g);
      this.side.push(g);
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
    const s = STEPS[i];
    const t = new Vector3(...s.target);
    const off = new Vector3(...s.position).sub(t);
    let radius = off.length();
    const phi = Math.acos(Math.min(1, Math.max(-1, off.y / radius)));
    const theta = Math.atan2(off.x, off.z);
    const tanHalf = Math.tan(((FOV / 2) * Math.PI) / 180);
    if (i === 2) {
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
    // re-frame (keeping any drag offset is not worth it on resize)
    if (this.placed && !this.dragging) this.setStep(this.stepIndex, true);
  }

  setResolution(w: number, h: number) {
    for (const m of this.lines) m.resolution.set(w, h);
  }

  // Fly to a step (or jump: `instant`, reduced motion, the first framing).
  setStep(i: number, instant = false) {
    this.stepIndex = Math.max(0, Math.min(2, i));
    const f = this.framing(this.stepIndex);
    this.goalTarget.copy(f.target);
    // the shortest way round to the goal azimuth (after a drag)
    const turn = Math.PI * 2;
    const theta = f.theta + Math.round((this.theta - f.theta) / turn) * turn;
    this.goal = { radius: f.radius, phi: f.phi, theta: this.placed ? theta : f.theta };
    if (instant || !this.placed) {
      this.target.copy(this.goalTarget);
      this.radius = this.goal.radius;
      this.phi = this.goal.phi;
      this.theta = this.goal.theta;
      for (const v of Object.values(this.vel)) v.v = 0;
      this.sideReveal = this.stepIndex === 2 ? 0 : 1;
      this.topReveal = this.stepIndex === 2 ? 1 : 0;
      this.applyReveal();
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
  }

  // Advance the camera and fades. Returns true while anything moved (the
  // view only redraws then).
  update(dt: number) {
    if (dt <= 0) return false;
    const smooth = this.dragging ? DRAG_SMOOTH : this.cfg.smoothTime;
    const before = this.radius + this.phi + this.theta + this.target.x + this.target.y + this.target.z;
    // world units; radians (5e-4 rad ≈ 0.02 units at these distances)
    const E = 0.02;
    const A = 5e-4;
    this.radius = smoothDamp(this.radius, this.goal.radius, this.vel.radius, smooth, dt, E);
    this.phi = smoothDamp(this.phi, this.goal.phi, this.vel.phi, smooth, dt, A);
    this.theta = smoothDamp(this.theta, this.goal.theta, this.vel.theta, smooth, dt, A);
    this.target.x = smoothDamp(this.target.x, this.goalTarget.x, this.vel.x, smooth, dt, E);
    this.target.y = smoothDamp(this.target.y, this.goalTarget.y, this.vel.y, smooth, dt, E);
    this.target.z = smoothDamp(this.target.z, this.goalTarget.z, this.vel.z, smooth, dt, E);
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
    if (faded) this.applyReveal();
    if (moved) this.applyCamera();
    return moved || faded;
  }

  private applyCamera() {
    const sp = Math.sin(this.phi);
    this.camera.position.set(
      this.target.x + this.radius * sp * Math.sin(this.theta),
      this.target.y + this.radius * Math.cos(this.phi),
      this.target.z + this.radius * sp * Math.cos(this.theta),
    );
    this.camera.lookAt(this.target);
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
    set(this.top, this.topReveal);
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
  }
}

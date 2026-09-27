// WebGL engine chunk — loaded lazily by index.ts.
//
// Architecture: ONE WebGLRenderer (one GL context) serves every particle
// section on the page. Each section gets its own lightweight 2D <canvas>
// that lives inside the section (so it scrolls, clips and stacks natively
// with Webflow layouts); every frame each visible section's scene is rendered
// into the shared GL buffer and copied into that section's canvas. Browsers
// cap live GL contexts (~16) and each costs GPU memory, so one context per
// section doesn't scale — this does.
//
// Simulation (shapes, noise, springs, hover/click) is the playground's own
// code from ../core, so the site behaves exactly like the approved demo.
import {
  AddEquation,
  BufferAttribute,
  BufferGeometry,
  Camera,
  Color,
  CustomBlending,
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  Points,
  SRGBColorSpace,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from "three";
import { ParticleSystem } from "../core/particles";
import { GraphSystem } from "../core/graph";
import { applyClick, applyHover, type InteractionConfig, type Steerable } from "../core/interaction";
import { hexToRgb01, particleColor } from "../core/color";
import type { RuntimeOptions } from "./defaults";
import type { GraphSpec, PointsSpec, ViewSpec } from "./spec";

const isMobile = () => matchMedia("(max-width: 767px)").matches;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

// Steps used to pre-settle the simulation when drawing a still frame for
// reduced-motion users (enough for ease >= ~0.04 to converge).
const SETTLE_STEPS = 120;

// Elements whose clicks belong to the UI, not the effect.
const INTERACTIVE = "a,button,input,select,textarea,label,summary,[role=button],[data-particles-ignore]";

// --- shaders ---
// Positions arrive in CSS pixels (y down) exactly as the simulation produces
// them; the vertex shader maps them to clip space, so no camera math needed.
// Output is premultiplied alpha; color values are passed through untouched
// (no color-space conversion), matching the playground's Canvas2D colors.

const POINT_VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
uniform vec2 uRes;
uniform float uDpr;
uniform float uSizeScale;
uniform float uMaxSize;
varying float vAlpha;
varying vec3 vColor;
varying float vSize;
void main() {
  vec2 p = position.xy / uRes * 2.0 - 1.0;
  gl_Position = vec4(p.x, -p.y, 0.0, 1.0);
  gl_PointSize = min(aSize * uSizeScale * uDpr, uMaxSize);
  vSize = gl_PointSize;
  vAlpha = aAlpha;
  vColor = aColor;
}`;

// Round dot, blended between two profiles by uSoftness:
//   1 = soft glow matching the original radial-gradient sprite (color and
//       alpha both fall off linearly -> quadratic visible falloff)
//   0 = solid disc with a 1px anti-aliased edge
const POINT_FRAG = /* glsl */ `
uniform float uSoftness;
varying float vAlpha;
varying vec3 vColor;
varying float vSize;
void main() {
  float f = 1.0 - length(gl_PointCoord - 0.5) * 2.0;
  if (f <= 0.0) discard;
  float hard = clamp(f * vSize * 0.5, 0.0, 1.0);
  float a = mix(hard, f * f, uSoftness) * vAlpha;
  gl_FragColor = vec4(vColor * a, a);
}`;

// Edges are instanced quads, not GL lines (those are always 1 device pixel
// wide). The base quad spans position.x 0..1 along the edge and position.y
// -1..1 across it; per-instance aEnds holds both endpoints. The quad is
// padded by one device pixel so the fragment shader can anti-alias.
const LINE_VERT = /* glsl */ `
attribute vec4 aEnds;
attribute float aWeight;
uniform vec2 uRes;
uniform float uWidth;
uniform float uDpr;
varying float vDist;
varying float vWeight;
void main() {
  vWeight = aWeight;
  vec2 a = aEnds.xy;
  vec2 b = aEnds.zw;
  vec2 d = b - a;
  float len = length(d);
  vec2 dir = len > 0.0 ? d / len : vec2(1.0, 0.0);
  float hw = uWidth * 0.5 + 1.0 / uDpr;
  vec2 p = mix(a, b, position.x) + vec2(-dir.y, dir.x) * position.y * hw;
  vDist = position.y * hw;
  vec2 c = p / uRes * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
}`;

const LINE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uWidth;
uniform float uDpr;
varying float vDist;
varying float vWeight;
void main() {
  float cover = clamp((uWidth * 0.5 - abs(vDist)) * uDpr + 0.5, 0.0, 1.0);
  float a = min(1.0, uAlpha * vWeight) * cover;
  gl_FragColor = vec4(uColor * a, a);
}`;

// Base quad for the instanced edges (two triangles).
const EDGE_QUAD = new Float32Array([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, -1, 0, 1, 1, 0, 0, 1, 0]);

function makeMaterial(vert: string, frag: string, uniforms: ShaderMaterial["uniforms"], blend: RuntimeOptions["blend"]) {
  return new ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    // premultiplied blending: additive = the playground's "lighter" glow,
    // normal = standard over-compositing
    blending: CustomBlending,
    blendEquation: AddEquation,
    blendSrc: OneFactor,
    blendDst: blendDst(blend),
    blendSrcAlpha: OneFactor,
    blendDstAlpha: OneMinusSrcAlphaFactor,
  });
}

function blendDst(blend: RuntimeOptions["blend"]) {
  return blend === "additive" ? OneFactor : OneMinusSrcAlphaFactor;
}

// --- shared renderer ---

class Stage {
  readonly renderer: WebGLRenderer;
  readonly maxPointSize: number;
  private readonly camera = new Camera();
  private bufW = 1;
  private bufH = 1;
  lost = false;

  constructor() {
    // throws when WebGL is unavailable — caught in mount()
    this.renderer = new WebGLRenderer({ alpha: true, antialias: false, premultipliedAlpha: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(1, 1, false);
    this.renderer.autoClear = false;
    // draw order is explicit (edges, then nodes); sorting would also compute
    // bounding spheres from our 2-component positions and log NaN errors
    this.renderer.sortObjects = false;
    const gl = this.renderer.getContext();
    this.maxPointSize = (gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array)[1] || 64;
    const canvas = this.renderer.domElement;
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.lost = true;
    });
    canvas.addEventListener("webglcontextrestored", () => {
      this.lost = false;
      wake();
    });
  }

  draw(view: View) {
    if (this.lost) return;
    const { pw, ph } = view;
    // the GL buffer only ever grows (to the largest section seen), so
    // switching between differently sized sections never reallocates it
    if (pw > this.bufW || ph > this.bufH) {
      this.bufW = Math.max(this.bufW, pw);
      this.bufH = Math.max(this.bufH, ph);
      this.renderer.setSize(this.bufW, this.bufH, false);
    }
    const r = this.renderer;
    r.setViewport(0, 0, pw, ph);
    r.setScissor(0, 0, pw, ph);
    r.setScissorTest(true);
    r.setClearColor(view.clearColor, view.clearAlpha);
    r.clear(true, false, false);
    r.render(view.scene, this.camera);
    // GL's viewport origin is bottom-left; in image space that region sits
    // at the bottom of the buffer
    view.ctx.clearRect(0, 0, pw, ph);
    view.ctx.drawImage(r.domElement, 0, this.bufH - ph, pw, ph, 0, 0, pw, ph);
  }

  dispose() {
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

// --- views (one per [data-particles] element) ---

type ViewConfig = InteractionConfig & RuntimeOptions & { background: string };

abstract class View {
  readonly canvas = document.createElement("canvas");
  readonly ctx: CanvasRenderingContext2D;
  readonly scene = new Scene();
  readonly clearColor = new Color();
  clearAlpha = 0;
  w = 1;
  h = 1;
  dpr = 1;
  pw = 1;
  ph = 1;
  visible = false;
  abstract readonly system: Steerable;

  private readonly resizeObserver: ResizeObserver;
  private readonly visibilityObserver: IntersectionObserver;
  private readonly prevStyle: { position: string; isolation: string };

  constructor(
    readonly el: HTMLElement,
    readonly cfg: ViewConfig,
  ) {
    this.ctx = this.canvas.getContext("2d")!;
    this.applyBackground();

    // The canvas sits behind the element's content but above its background:
    // `isolation: isolate` makes the element a stacking context so the
    // z-index:-1 canvas can't fall behind it. Never blocks clicks.
    this.prevStyle = { position: el.style.position, isolation: el.style.isolation };
    if (getComputedStyle(el).position === "static") el.style.position = "relative";
    el.style.isolation = "isolate";
    this.canvas.setAttribute("aria-hidden", "true");
    this.canvas.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;z-index:-1";
    el.prepend(this.canvas);

    this.measure();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        // element removed from the page without destroy() (page
        // transitions, CMS re-renders): free its GPU resources
        if (!el.isConnected) return unmount(el);
        this.visible = entry.isIntersecting;
        if (this.visible && reducedMotion.matches) this.drawStill();
        wake();
      },
      { rootMargin: "100px 0px" },
    );
  }

  private applyBackground() {
    const bg = this.cfg.background;
    this.clearAlpha = 0;
    if (bg && bg !== "transparent") {
      const [r, g, b] = hexToRgb01(bg);
      this.clearColor.setRGB(r, g, b, SRGBColorSpace);
      this.clearAlpha = 1;
    }
  }

  // Re-read look settings (colors, background, blend) from cfg without
  // resetting the simulation — the playground's live color editing.
  refreshLook() {
    this.applyBackground();
    this.onLook();
    if (this.visible && !this.running) this.paint();
  }

  // Called by subclasses once their GPU resources exist.
  protected start() {
    this.resize();
    this.resizeObserver.observe(this.el);
    this.visibilityObserver.observe(this.el);
  }

  private measure() {
    this.w = Math.max(1, this.el.clientWidth);
    this.h = Math.max(1, this.el.clientHeight);
    this.dpr = Math.min(window.devicePixelRatio || 1, isMobile() ? 1.5 : 2);
    this.pw = Math.max(1, Math.round(this.w * this.dpr));
    this.ph = Math.max(1, Math.round(this.h * this.dpr));
  }

  private resize() {
    this.measure();
    if (this.canvas.width !== this.pw || this.canvas.height !== this.ph) {
      this.canvas.width = this.pw;
      this.canvas.height = this.ph;
    }
    this.onResize();
    // resizing clears the canvas; a running view repaints next frame, a
    // still (reduced-motion) one needs an explicit repaint
    if (this.visible && reducedMotion.matches) this.paint();
  }

  get running() {
    return this.visible && !paused && !document.hidden && !reducedMotion.matches;
  }

  // Reduced motion: fast-forward the simulation to its settled state and
  // show that single frame.
  drawStill() {
    for (let i = 0; i < SETTLE_STEPS; i++) this.step(1 / 60);
    this.paint();
  }

  paint() {
    this.sync();
    stage?.draw(this);
  }

  // Pointer position in this view's local (layout) pixels, or null if
  // outside. Rescaled by layout/visual size so CSS transforms on the section
  // (scale animations, scaled previews) don't offset the hover.
  localPointer(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
    return { x: (x * this.w) / (rect.width || 1), y: (y * this.h) / (rect.height || 1) };
  }

  abstract step(dt: number): void;
  // pointer in local px (null = not over this view), called every frame
  // before step(); used for hover effects beyond the shared repel force
  onPointer(_p: { x: number; y: number } | null, _dt: number) {}
  protected abstract sync(): void;
  protected abstract onResize(): void;
  protected abstract onLook(): void;
  protected abstract disposeGpu(): void;

  dispose() {
    this.resizeObserver.disconnect();
    this.visibilityObserver.disconnect();
    this.disposeGpu();
    this.canvas.remove();
    this.el.style.position = this.prevStyle.position;
    this.el.style.isolation = this.prevStyle.isolation;
  }
}

function pointUniforms(sizeScale: number, softness: number) {
  return {
    uSoftness: { value: softness },
    uRes: { value: [1, 1] },
    uDpr: { value: 1 },
    uSizeScale: { value: sizeScale },
    uMaxSize: { value: stage?.maxPointSize ?? 64 },
  };
}

class PointsView extends View {
  readonly system: ParticleSystem;
  private readonly geometry = new BufferGeometry();
  private readonly material: ShaderMaterial;
  private readonly pos: Float32Array;
  private readonly posAttr: BufferAttribute;
  private readonly colorAttr: BufferAttribute;

  // cfg is used BY REFERENCE: the simulation reads it every frame, so the
  // playground's live edits (chaos, ease, rotation, hover…) apply instantly.
  constructor(el: HTMLElement, cfg: PointsSpec["config"], editor: boolean) {
    if (!editor && isMobile()) cfg.count = cfg.countMobile || Math.round(cfg.count * 0.5);
    super(el, cfg);
    this.system = new ParticleSystem(cfg, this.w, this.h);
    const sys = this.system;
    const n = sys.count;

    this.pos = new Float32Array(n * 2);
    this.posAttr = new BufferAttribute(this.pos, 2).setUsage(DynamicDrawUsage);
    this.colorAttr = new BufferAttribute(new Float32Array(n * 3), 3);
    this.geometry.setAttribute("position", this.posAttr);
    this.geometry.setAttribute("aSize", new BufferAttribute(sys.size, 1));
    this.geometry.setAttribute("aAlpha", new BufferAttribute(sys.opacity, 1));
    this.geometry.setAttribute("aColor", this.colorAttr);
    this.writeColors();

    // 6 = the playground's sprite scale (render.ts: size * 6)
    this.material = makeMaterial(POINT_VERT, POINT_FRAG, pointUniforms(6, cfg.softness), cfg.blend);
    const points = new Points(this.geometry, this.material);
    points.frustumCulled = false;
    this.scene.add(points);
    this.start();
  }

  step(dt: number) {
    this.system.update(dt, this.w, this.h);
  }

  protected sync() {
    const s = this.system;
    const pos = this.pos;
    for (let i = 0; i < s.count; i++) {
      pos[i * 2] = s.baseX[i] + s.offX[i];
      pos[i * 2 + 1] = s.baseY[i] + s.offY[i];
    }
    this.posAttr.needsUpdate = true;
  }

  private writeColors() {
    const cfg = this.cfg as PointsSpec["config"];
    const colors = this.colorAttr.array as Float32Array;
    for (let i = 0; i < this.system.count; i++) colors.set(particleColor(cfg, this.system.colorT[i]), i * 3);
    this.colorAttr.needsUpdate = true;
  }

  protected onLook() {
    this.writeColors();
    this.material.blendDst = blendDst(this.cfg.blend);
    this.material.uniforms.uSoftness.value = this.cfg.softness;
  }

  protected onResize() {
    this.system.resize(this.w, this.h);
    this.material.uniforms.uRes.value = [this.w, this.h];
    this.material.uniforms.uDpr.value = this.dpr;
  }

  protected disposeGpu() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

interface EdgeBuffers {
  ends: InstancedBufferAttribute;
  weights: InstancedBufferAttribute;
  geometry: InstancedBufferGeometry;
  material: ShaderMaterial;
  mesh: Mesh;
}

class GraphView extends View {
  readonly system: GraphSystem;
  private readonly graphCfg: GraphSpec["config"];
  private readonly nodeGeometry = new BufferGeometry();
  private readonly nodeMaterial: ShaderMaterial;
  private readonly nodePos: Float32Array;
  private readonly nodePosAttr: BufferAttribute;
  private readonly nodeSizeAttr: BufferAttribute;
  private readonly nodeAlphaAttr: BufferAttribute;
  private readonly nodeColorAttr: BufferAttribute;
  // [outgoing, incoming] — mirrors GraphSystem.layers
  private readonly edgeBuffers: EdgeBuffers[] = [];

  constructor(el: HTMLElement, cfg: GraphSpec["config"]) {
    super(el, cfg);
    this.graphCfg = cfg;
    this.system = new GraphSystem(cfg, this.w, this.h);
    const n = this.system.count;
    // sized for the largest layout so a sequence never reallocates
    const cap = Math.max(1, this.system.maxEdges);

    // edges first (drawn under the nodes)
    for (let li = 0; li < 2; li++) {
      const ends = new InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(DynamicDrawUsage);
      const weights = new InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(DynamicDrawUsage);
      const geometry = new InstancedBufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(EDGE_QUAD, 3));
      geometry.setAttribute("aEnds", ends);
      geometry.setAttribute("aWeight", weights);
      geometry.instanceCount = 0;
      const material = makeMaterial(
        LINE_VERT,
        LINE_FRAG,
        {
          uRes: { value: [1, 1] },
          uColor: { value: [1, 1, 1] },
          uAlpha: { value: 0 },
          uWidth: { value: cfg.lineWidth },
          uDpr: { value: 1 },
        },
        cfg.blend,
      );
      // the shader's y-flip reverses triangle winding: don't cull
      material.side = DoubleSide;
      const mesh = new Mesh(geometry, material);
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.edgeBuffers.push({ ends, weights, geometry, material, mesh });
    }

    // node size/alpha are written every frame (hover glow scales them)
    this.nodePos = new Float32Array(n * 2);
    this.nodePosAttr = new BufferAttribute(this.nodePos, 2).setUsage(DynamicDrawUsage);
    this.nodeSizeAttr = new BufferAttribute(new Float32Array(n), 1).setUsage(DynamicDrawUsage);
    this.nodeAlphaAttr = new BufferAttribute(new Float32Array(n), 1).setUsage(DynamicDrawUsage);
    this.nodeColorAttr = new BufferAttribute(new Float32Array(n * 3), 3);
    this.nodeGeometry.setAttribute("position", this.nodePosAttr);
    this.nodeGeometry.setAttribute("aSize", this.nodeSizeAttr);
    this.nodeGeometry.setAttribute("aAlpha", this.nodeAlphaAttr);
    this.nodeGeometry.setAttribute("aColor", this.nodeColorAttr);
    // 2 = the playground's node scale (graphRender.ts: size * 2)
    this.nodeMaterial = makeMaterial(POINT_VERT, POINT_FRAG, pointUniforms(2, cfg.softness), cfg.blend);
    const nodes = new Points(this.nodeGeometry, this.nodeMaterial);
    nodes.frustumCulled = false;
    this.scene.add(nodes);
    this.onLook();
    this.start();
  }

  protected onLook() {
    const cfg = this.graphCfg;
    const color = hexToRgb01(cfg.color);
    const colors = this.nodeColorAttr.array as Float32Array;
    for (let i = 0; i < this.system.count; i++) colors.set(color, i * 3);
    this.nodeColorAttr.needsUpdate = true;
    this.nodeMaterial.blendDst = blendDst(cfg.blend);
    this.nodeMaterial.uniforms.uSoftness.value = cfg.softness;
    const lineColor = hexToRgb01(cfg.lineColor);
    for (const b of this.edgeBuffers) {
      b.material.uniforms.uColor.value = lineColor;
      b.material.blendDst = blendDst(cfg.blend);
    }
  }

  onPointer(p: { x: number; y: number } | null, dt: number) {
    if (this.graphCfg.hoverGlow > 0) this.system.updateGlow(p ? p.x : null, p ? p.y : 0, dt);
  }

  step(dt: number) {
    this.system.update(dt, this.w, this.h);
  }

  protected sync() {
    const s = this.system;
    const cfg = this.graphCfg;
    const hg = cfg.hoverGlow;
    const glow = s.glow;
    const pos = this.nodePos;
    const size = this.nodeSizeAttr.array as Float32Array;
    const alpha = this.nodeAlphaAttr.array as Float32Array;
    for (let i = 0; i < s.count; i++) {
      pos[i * 2] = s.screenX[i] + s.offX[i];
      pos[i * 2 + 1] = s.screenY[i] + s.offY[i];
      // hover: highlighted nodes grow up to 60% and brighten
      const g = hg * glow[i];
      size[i] = s.size[i] * (1 + 0.6 * g);
      alpha[i] = Math.min(1, s.opacity[i] + 0.6 * g);
    }
    this.nodePosAttr.needsUpdate = true;
    this.nodeSizeAttr.needsUpdate = true;
    this.nodeAlphaAttr.needsUpdate = true;

    s.layers.forEach((layer, li) => {
      const b = this.edgeBuffers[li];
      const count = layer.alpha > 0.002 ? layer.edges.length : 0;
      b.mesh.visible = count > 0;
      b.geometry.instanceCount = count;
      if (!count) return;
      b.material.uniforms.uAlpha.value = layer.alpha * cfg.lineOpacity;
      b.material.uniforms.uWidth.value = cfg.lineWidth;
      const ends = b.ends.array as Float32Array;
      const weights = b.weights.array as Float32Array;
      for (let e = 0; e < count; e++) {
        const [a, c] = layer.edges[e];
        ends[e * 4] = pos[a * 2];
        ends[e * 4 + 1] = pos[a * 2 + 1];
        ends[e * 4 + 2] = pos[c * 2];
        ends[e * 4 + 3] = pos[c * 2 + 1];
        // hover: edges touching highlighted nodes light up (up to 4x)
        const g = hg * Math.max(glow[a], glow[c]);
        weights[e] = (layer.weight ? layer.weight[e] : 1) * (1 + 3 * g);
      }
      b.ends.needsUpdate = true;
      b.weights.needsUpdate = true;
    });
  }

  protected onResize() {
    const res = [this.w, this.h];
    this.nodeMaterial.uniforms.uRes.value = res;
    this.nodeMaterial.uniforms.uDpr.value = this.dpr;
    for (const b of this.edgeBuffers) {
      b.material.uniforms.uRes.value = res;
      b.material.uniforms.uDpr.value = this.dpr;
    }
  }

  protected disposeGpu() {
    this.nodeGeometry.dispose();
    this.nodeMaterial.dispose();
    for (const b of this.edgeBuffers) {
      b.geometry.dispose();
      b.material.dispose();
    }
  }
}

// --- loop & pointer routing ---

let stage: Stage | null = null;
let paused = false;
const views = new Map<HTMLElement, View>();
let rafId = 0;
let lastT = 0;
const pointer = { x: 0, y: 0, active: false };

function frame(now: number) {
  rafId = 0;
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  let anyRunning = false;
  for (const view of views.values()) {
    if (!view.running) continue;
    anyRunning = true;
    const p = pointer.active && view.cfg.interactive ? view.localPointer(pointer.x, pointer.y) : null;
    if (p) applyHover(view.system, view.cfg, p.x, p.y, dt);
    view.onPointer(p, dt);
    view.step(dt);
    view.paint();
  }
  // the loop stops itself when nothing is on screen; wake() restarts it
  if (anyRunning) rafId = requestAnimationFrame(frame);
}

function wake() {
  if (rafId || !stage) return;
  for (const view of views.values()) {
    if (view.running) {
      lastT = performance.now();
      rafId = requestAnimationFrame(frame);
      return;
    }
  }
}

function onPointerMove(e: PointerEvent) {
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.active = true;
}

function onPointerDown(e: PointerEvent) {
  onPointerMove(e);
  if (e.button !== 0 || reducedMotion.matches) return;
  if (e.target instanceof Element && e.target.closest(INTERACTIVE)) return;
  for (const view of views.values()) {
    if (!view.running || !view.cfg.interactive) continue;
    const p = view.localPointer(e.clientX, e.clientY);
    if (p) applyClick(view.system, view.cfg, p.x, p.y);
  }
}

function onPointerEnd(e: PointerEvent) {
  // touch has no hover: stop repelling once the finger lifts
  if (e.pointerType !== "mouse") pointer.active = false;
}

function onPointerOut(e: PointerEvent) {
  // relatedTarget null = pointer left the window
  if (!e.relatedTarget) pointer.active = false;
}

function onReducedMotionChange() {
  if (reducedMotion.matches) {
    for (const view of views.values()) if (view.visible) view.drawStill();
  }
  wake();
}

function listen(on: boolean) {
  const m = on ? "addEventListener" : "removeEventListener";
  const opts = { passive: true };
  window[m]("pointermove", onPointerMove as EventListener, opts);
  window[m]("pointerdown", onPointerDown as EventListener, opts);
  window[m]("pointerup", onPointerEnd as EventListener, opts);
  window[m]("pointercancel", onPointerEnd as EventListener, opts);
  document[m]("pointerout", onPointerOut as EventListener, opts);
  document[m]("visibilitychange", wake);
  reducedMotion[m]("change", onReducedMotionChange);
}

// --- public API (used by index.ts) ---

// `editor` = the playground: exact config (no mobile particle reduction).
export function mount(el: HTMLElement, spec: ViewSpec, { editor = false } = {}) {
  if (views.has(el)) return;
  if (!stage) {
    try {
      stage = new Stage();
    } catch (err) {
      // no WebGL: leave the section as designed in Webflow, just without
      // the effect
      console.warn("[particles] WebGL unavailable, effect disabled", err);
      return;
    }
    listen(true);
  }
  const view = spec.type === "graph" ? new GraphView(el, spec.config) : new PointsView(el, spec.config, editor);
  views.set(el, view);
}

export function unmount(el: HTMLElement) {
  const view = views.get(el);
  if (!view) return;
  view.dispose();
  views.delete(el);
  if (views.size === 0 && stage) {
    cancelAnimationFrame(rafId);
    rafId = 0;
    listen(false);
    stage.dispose();
    stage = null;
  }
}

// --- playground hooks (not used by the site loader) ---

export type { View };

export function getView(el: HTMLElement): View | undefined {
  return views.get(el);
}

export function refreshLook(el: HTMLElement) {
  views.get(el)?.refreshLook();
}

// Freeze the loop (e.g. while an export steps the simulation manually).
export function setPaused(p: boolean) {
  paused = p;
  if (!p) wake();
}

// Replace an element's view (new particle buffers) while keeping the shared
// GL context alive — unmount + mount would tear it down and recreate it.
export function remount(el: HTMLElement, spec: ViewSpec, opts?: { editor?: boolean }) {
  views.get(el)?.dispose();
  views.delete(el);
  mount(el, spec, opts);
}

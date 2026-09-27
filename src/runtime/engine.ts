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
  DynamicDrawUsage,
  LineSegments,
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
import type { GraphSpec, PointsSpec, RuntimeOptions, ViewSpec } from "./spec";

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
void main() {
  vec2 p = position.xy / uRes * 2.0 - 1.0;
  gl_Position = vec4(p.x, -p.y, 0.0, 1.0);
  gl_PointSize = min(aSize * uSizeScale * uDpr, uMaxSize);
  vAlpha = aAlpha;
  vColor = aColor;
}`;

// Soft round dot matching the playground's radial-gradient sprite, which
// fades color -> rgba(0,0,0,0): color and alpha both fall off linearly, so
// the visible (premultiplied) intensity falls off quadratically.
const POINT_FRAG = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main() {
  float f = 1.0 - length(gl_PointCoord - 0.5) * 2.0;
  if (f <= 0.0) discard;
  float a = f * f * vAlpha;
  gl_FragColor = vec4(vColor * a, a);
}`;

const LINE_VERT = /* glsl */ `
uniform vec2 uRes;
void main() {
  vec2 p = position.xy / uRes * 2.0 - 1.0;
  gl_Position = vec4(p.x, -p.y, 0.0, 1.0);
}`;

const LINE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
void main() {
  gl_FragColor = vec4(uColor * uAlpha, uAlpha);
}`;

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
    blendDst: blend === "additive" ? OneFactor : OneMinusSrcAlphaFactor,
    blendSrcAlpha: OneFactor,
    blendDstAlpha: OneMinusSrcAlphaFactor,
  });
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
    if (cfg.background && cfg.background !== "transparent") {
      const [r, g, b] = hexToRgb01(cfg.background);
      this.clearColor.setRGB(r, g, b, SRGBColorSpace);
      this.clearAlpha = 1;
    }

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
    return this.visible && !document.hidden && !reducedMotion.matches;
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

  // Pointer position in this view's local CSS pixels, or null if outside.
  localPointer(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    return x >= 0 && y >= 0 && x <= rect.width && y <= rect.height ? { x, y } : null;
  }

  abstract step(dt: number): void;
  protected abstract sync(): void;
  protected abstract onResize(): void;
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

function pointUniforms(sizeScale: number) {
  return {
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

  constructor(el: HTMLElement, cfg: PointsSpec["config"]) {
    const count = isMobile() ? cfg.countMobile || Math.round(cfg.count * 0.5) : cfg.count;
    super(el, cfg);
    const sysCfg = { ...cfg, count };
    this.system = new ParticleSystem(sysCfg, this.w, this.h);
    const sys = this.system;
    const n = sys.count;

    this.pos = new Float32Array(n * 2);
    this.posAttr = new BufferAttribute(this.pos, 2).setUsage(DynamicDrawUsage);
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) colors.set(particleColor(sysCfg, sys.colorT[i]), i * 3);
    this.geometry.setAttribute("position", this.posAttr);
    this.geometry.setAttribute("aSize", new BufferAttribute(sys.size, 1));
    this.geometry.setAttribute("aAlpha", new BufferAttribute(sys.opacity, 1));
    this.geometry.setAttribute("aColor", new BufferAttribute(colors, 3));

    // 6 = the playground's sprite scale (render.ts: size * 6)
    this.material = makeMaterial(POINT_VERT, POINT_FRAG, pointUniforms(6), cfg.blend);
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

class GraphView extends View {
  readonly system: GraphSystem;
  private readonly nodeGeometry = new BufferGeometry();
  private readonly nodeMaterial: ShaderMaterial;
  private readonly nodePos: Float32Array;
  private readonly nodePosAttr: BufferAttribute;
  private readonly edgeLayers: {
    edges: [number, number][];
    pos: Float32Array;
    attr: BufferAttribute;
    geometry: BufferGeometry;
    material: ShaderMaterial;
    lines: LineSegments;
  }[] = [];

  constructor(el: HTMLElement, cfg: GraphSpec["config"]) {
    super(el, cfg);
    this.system = new GraphSystem(cfg, this.w, this.h);
    const sys = this.system;
    const n = sys.count;
    const lineColor = hexToRgb01(cfg.lineColor);

    // edges first (drawn under the nodes); the two layers cross-fade
    // during the morph modes
    for (const edges of [sys.edgesA, sys.edgesB]) {
      const pos = new Float32Array(Math.max(1, edges.length) * 4);
      const attr = new BufferAttribute(pos, 2).setUsage(DynamicDrawUsage);
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", attr);
      geometry.setDrawRange(0, edges.length * 2);
      const material = makeMaterial(
        LINE_VERT,
        LINE_FRAG,
        { uRes: { value: [1, 1] }, uColor: { value: lineColor }, uAlpha: { value: 0 } },
        cfg.blend,
      );
      const lines = new LineSegments(geometry, material);
      lines.frustumCulled = false;
      this.scene.add(lines);
      this.edgeLayers.push({ edges, pos, attr, geometry, material, lines });
    }

    this.nodePos = new Float32Array(n * 2);
    this.nodePosAttr = new BufferAttribute(this.nodePos, 2).setUsage(DynamicDrawUsage);
    const color = hexToRgb01(cfg.color);
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) colors.set(color, i * 3);
    this.nodeGeometry.setAttribute("position", this.nodePosAttr);
    this.nodeGeometry.setAttribute("aSize", new BufferAttribute(sys.size, 1));
    this.nodeGeometry.setAttribute("aAlpha", new BufferAttribute(sys.opacity, 1));
    this.nodeGeometry.setAttribute("aColor", new BufferAttribute(colors, 3));
    // 2 = the playground's node scale (graphRender.ts: size * 2)
    this.nodeMaterial = makeMaterial(POINT_VERT, POINT_FRAG, pointUniforms(2), cfg.blend);
    const nodes = new Points(this.nodeGeometry, this.nodeMaterial);
    nodes.frustumCulled = false;
    this.scene.add(nodes);
    this.start();
  }

  step(dt: number) {
    this.system.update(dt, this.w, this.h);
  }

  protected sync() {
    const s = this.system;
    const x = s.screenX;
    const y = s.screenY;
    for (let i = 0; i < s.count; i++) {
      this.nodePos[i * 2] = x[i] + s.offX[i];
      this.nodePos[i * 2 + 1] = y[i] + s.offY[i];
    }
    this.nodePosAttr.needsUpdate = true;

    const alphas = [s.edgeAlphaA, s.edgeAlphaB];
    this.edgeLayers.forEach((layer, li) => {
      const alpha = alphas[li];
      layer.lines.visible = alpha > 0.002 && layer.edges.length > 0;
      if (!layer.lines.visible) return;
      // GL lines are always 1 device pixel; the playground's are 1 CSS
      // pixel. Scaling alpha by dpr keeps the perceived line weight equal.
      layer.material.uniforms.uAlpha.value = Math.min(1, alpha * 0.25 * this.dpr);
      const pos = layer.pos;
      let k = 0;
      for (const [a, b] of layer.edges) {
        pos[k++] = this.nodePos[a * 2];
        pos[k++] = this.nodePos[a * 2 + 1];
        pos[k++] = this.nodePos[b * 2];
        pos[k++] = this.nodePos[b * 2 + 1];
      }
      layer.attr.needsUpdate = true;
    });
  }

  protected onResize() {
    const res = [this.w, this.h];
    this.nodeMaterial.uniforms.uRes.value = res;
    this.nodeMaterial.uniforms.uDpr.value = this.dpr;
    for (const layer of this.edgeLayers) layer.material.uniforms.uRes.value = res;
  }

  protected disposeGpu() {
    this.nodeGeometry.dispose();
    this.nodeMaterial.dispose();
    for (const layer of this.edgeLayers) {
      layer.geometry.dispose();
      layer.material.dispose();
    }
  }
}

// --- loop & pointer routing ---

let stage: Stage | null = null;
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
    if (pointer.active && view.cfg.interactive) {
      const p = view.localPointer(pointer.x, pointer.y);
      if (p) applyHover(view.system, view.cfg, p.x, p.y, dt);
    }
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

export function mount(el: HTMLElement, spec: ViewSpec) {
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
  const view = spec.type === "graph" ? new GraphView(el, spec.config) : new PointsView(el, spec.config);
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

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
uniform float uSolid;
varying float vAlpha;
varying vec3 vColor;
varying float vSize;
void main() {
  float f = 1.0 - length(gl_PointCoord - 0.5) * 2.0;
  if (f <= 0.0) discard;
  float hard = clamp(f * vSize * 0.5, 0.0, 1.0);
  float cover = mix(hard, f * f, uSoftness);
  // solid: opaque disc dimmed by vAlpha; otherwise vAlpha is transparency
  float a = cover * mix(vAlpha, 1.0, uSolid);
  vec3 col = vColor * mix(1.0, vAlpha, uSolid);
  gl_FragColor = vec4(col * a, a);
}`;

// Edges are instanced quads, not GL lines (those are always 1 device pixel
// wide). The base quad spans position.x 0..1 along the edge and position.y
// -1..1 across it; per-instance aEnds holds both endpoints. The quad is
// padded by one device pixel so the fragment shader can anti-alias.
const LINE_VERT = /* glsl */ `
attribute vec4 aEnds;
attribute float aWeight;
attribute float aTaper;
uniform vec2 uRes;
uniform float uWidth;
uniform float uDpr;
varying float vDist;
varying float vWeight;
varying float vAlong;
varying float vTaper;
void main() {
  vWeight = aWeight;
  vAlong = position.x;
  vTaper = aTaper;
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
varying float vAlong;
varying float vTaper;
void main() {
  float cover = clamp((uWidth * 0.5 - abs(vDist)) * uDpr + 0.5, 0.0, 1.0);
  // taper 1: fades out toward the segment's start (a trail behind a pulse)
  float a = min(1.0, uAlpha * vWeight) * cover * mix(1.0, vAlong * vAlong, vTaper);
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
  lostAt = 0;

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
      // ask the browser to give it back; resume() replaces the renderer if
      // it doesn't (some browsers never restore a backgrounded tab's context)
      e.preventDefault();
      this.lost = true;
      this.lostAt = performance.now();
      note("webgl context lost");
    });
    canvas.addEventListener("webglcontextrestored", () => {
      note("webgl context restored");
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
  // fires once, when a quarter of the element is on screen (entrance)
  private readonly enterObserver: IntersectionObserver;
  private readonly prevStyle: { position: string; isolation: string };

  // the component this effect belongs to: scope for its excite buttons,
  // parallax and click handling (the element itself for legacy markup)
  root: HTMLElement;

  constructor(
    readonly el: HTMLElement,
    readonly cfg: ViewConfig,
  ) {
    this.root = el;
    this.ctx = this.canvas.getContext("2d")!;
    this.applyBackground();

    // The canvas sits behind the element's content but above its background:
    // `isolation: isolate` makes the element a stacking context so the
    // z-index:-1 canvas can't fall behind it. Never blocks clicks.
    this.prevStyle = { position: el.style.position, isolation: el.style.isolation };
    if (getComputedStyle(el).position === "static") el.style.position = "relative";
    el.style.isolation = "isolate";
    // The canvas fills the element exactly (100% x 100%, no wrapper, no
    // inset): the site sizes and positions the element, the script only
    // draws. Starts transparent and fades in on the first frame (paint()).
    this.canvas.setAttribute("aria-hidden", "true");
    this.canvas.style.cssText =
      "position:absolute;top:0;left:0;width:100%;height:100%;display:block;pointer-events:none;z-index:-1;opacity:0";
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
    this.enterObserver = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        this.enterObserver.disconnect();
        if (reducedMotion.matches) this.onSkipIntro();
        else this.onEnter();
      },
      { threshold: 0.25 },
    );
  }

  // hooks for effects that need them (graph views)
  protected onEnter() {}
  protected onSkipIntro() {}
  onExcite(_on: boolean) {}
  onSectionPointer(_p: { x: number; y: number } | null) {}
  // extra live numbers for debugState()
  stats(): Record<string, unknown> {
    return {};
  }

  click(x: number, y: number) {
    applyClick(this.system, this.cfg, x, y);
  }

  // Pointer over the whole element as -1..1 (null = outside), for effects
  // that react beyond the canvas (parallax).
  sectionPointer(clientX: number, clientY: number) {
    const r = this.root.getBoundingClientRect();
    const x = (clientX - r.left) / (r.width || 1);
    const y = (clientY - r.top) / (r.height || 1);
    if (x < 0 || y < 0 || x > 1 || y > 1) return null;
    return { x: x * 2 - 1, y: y * 2 - 1 };
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
    this.enterObserver.observe(this.el);
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
    // deliberately not gated on document.hidden: browsers already stop
    // animation frames for truly hidden pages, and some (seen in Arc) can
    // leave document.hidden stuck at true after the window comes back —
    // which would freeze the effect for good
    return this.visible && !paused && !reducedMotion.matches;
  }

  // Reduced motion: fast-forward the simulation to its settled state and
  // show that single frame.
  drawStill() {
    this.onSkipIntro();
    for (let i = 0; i < SETTLE_STEPS; i++) this.step(1 / 60);
    this.paint();
  }

  private shown = false;

  paint() {
    this.sync();
    stage?.draw(this);
    if (!this.shown && stage && !stage.lost) {
      this.shown = true;
      // ease in rather than pop; reduced motion shows it immediately
      if (!reducedMotion.matches) this.canvas.style.transition = "opacity 0.8s ease-out";
      this.canvas.style.opacity = "1";
      // lets the site sequence its own intro animations with the effect
      this.el.dispatchEvent(new CustomEvent("particles:ready", { bubbles: true }));
      note("first frame");
    }
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
    this.enterObserver.disconnect();
    this.disposeGpu();
    this.canvas.remove();
    this.el.style.position = this.prevStyle.position;
    this.el.style.isolation = this.prevStyle.isolation;
  }
}

function pointUniforms(sizeScale: number, softness: number, solid: boolean) {
  return {
    uSoftness: { value: softness },
    uSolid: { value: solid ? 1 : 0 },
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
    this.material = makeMaterial(POINT_VERT, POINT_FRAG, pointUniforms(6, cfg.softness, cfg.solid), cfg.blend);
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
    this.material.uniforms.uSolid.value = this.cfg.solid ? 1 : 0;
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
  // bright segments (pulse trails, hover path) and pulse heads
  private readonly hl: EdgeBuffers & { tapers: InstancedBufferAttribute };
  private readonly pulseGeometry = new BufferGeometry();
  private readonly pulseMaterial: ShaderMaterial;
  private readonly pulsePos: BufferAttribute;
  private readonly pulseAlpha: BufferAttribute;
  private readonly pulseColor: BufferAttribute;

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

    // highlights: above the mesh, additive so they glow
    {
      const hcap = this.system.highlights.length / 6;
      const ends = new InstancedBufferAttribute(new Float32Array(hcap * 4), 4).setUsage(DynamicDrawUsage);
      const weights = new InstancedBufferAttribute(new Float32Array(hcap), 1).setUsage(DynamicDrawUsage);
      const tapers = new InstancedBufferAttribute(new Float32Array(hcap), 1).setUsage(DynamicDrawUsage);
      const geometry = new InstancedBufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(EDGE_QUAD, 3));
      geometry.setAttribute("aEnds", ends);
      geometry.setAttribute("aWeight", weights);
      geometry.setAttribute("aTaper", tapers);
      geometry.instanceCount = 0;
      const material = makeMaterial(
        LINE_VERT,
        LINE_FRAG,
        {
          uRes: { value: [1, 1] },
          uColor: { value: [1, 1, 1] },
          uAlpha: { value: 0.9 },
          uWidth: { value: cfg.lineWidth * 1.4 },
          uDpr: { value: 1 },
        },
        "additive",
      );
      material.side = DoubleSide;
      const mesh = new Mesh(geometry, material);
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.hl = { ends, weights, tapers, geometry, material, mesh };
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
    this.nodeMaterial = makeMaterial(POINT_VERT, POINT_FRAG, pointUniforms(2, cfg.softness, cfg.solid), cfg.blend);
    const nodes = new Points(this.nodeGeometry, this.nodeMaterial);
    nodes.frustumCulled = false;
    this.scene.add(nodes);

    // pulse heads: soft glowing dots on top of everything
    const pcap = this.system.pulseHeads.length / 3;
    this.pulsePos = new BufferAttribute(new Float32Array(pcap * 2), 2).setUsage(DynamicDrawUsage);
    this.pulseAlpha = new BufferAttribute(new Float32Array(pcap), 1).setUsage(DynamicDrawUsage);
    this.pulseColor = new BufferAttribute(new Float32Array(pcap * 3), 3);
    this.pulseGeometry.setAttribute("position", this.pulsePos);
    this.pulseGeometry.setAttribute("aSize", new BufferAttribute(new Float32Array(pcap).fill(1), 1));
    this.pulseGeometry.setAttribute("aAlpha", this.pulseAlpha);
    this.pulseGeometry.setAttribute("aColor", this.pulseColor);
    this.pulseGeometry.setDrawRange(0, 0);
    this.pulseMaterial = makeMaterial(POINT_VERT, POINT_FRAG, pointUniforms(cfg.pulseSize * 4, 1, false), "additive");
    const heads = new Points(this.pulseGeometry, this.pulseMaterial);
    heads.frustumCulled = false;
    this.scene.add(heads);

    this.onLook();
    this.start();
  }

  protected onEnter() {
    this.system.startIntro();
  }
  protected onSkipIntro() {
    this.system.skipIntro();
  }
  onExcite(on: boolean) {
    this.system.setExcite(on);
    wake();
  }
  onSectionPointer(p: { x: number; y: number } | null) {
    this.system.setSectionPointer(p);
  }
  stats() {
    const s = this.system;
    return { pulses: s.pulseCount, highlights: s.highlightCount, lineGain: +s.lineGain.toFixed(2), ...s.debug() };
  }
  click(x: number, y: number) {
    if (this.graphCfg.clickBehavior === "ripple") this.system.rippleAt(x, y);
    else super.click(x, y);
  }

  protected onLook() {
    const cfg = this.graphCfg;
    const color = hexToRgb01(cfg.color);
    const colors = this.nodeColorAttr.array as Float32Array;
    for (let i = 0; i < this.system.count; i++) colors.set(color, i * 3);
    this.nodeColorAttr.needsUpdate = true;
    this.nodeMaterial.blendDst = blendDst(cfg.blend);
    this.nodeMaterial.uniforms.uSoftness.value = cfg.softness;
    this.nodeMaterial.uniforms.uSolid.value = cfg.solid ? 1 : 0;
    const lineColor = hexToRgb01(cfg.lineColor);
    for (const b of this.edgeBuffers) {
      b.material.uniforms.uColor.value = lineColor;
      b.material.blendDst = blendDst(cfg.blend);
    }
    const pulse = hexToRgb01(cfg.pulseColor);
    this.hl.material.uniforms.uColor.value = pulse;
    const pc = this.pulseColor.array as Float32Array;
    for (let i = 0; i < pc.length; i += 3) pc.set(pulse, i);
    this.pulseColor.needsUpdate = true;
  }

  onPointer(p: { x: number; y: number } | null) {
    this.system.setPointer(p);
  }

  step(dt: number) {
    this.system.update(dt, this.w, this.h);
  }

  protected sync() {
    const s = this.system;
    const cfg = this.graphCfg;
    const light = s.light;
    const depthA = s.depthAlpha;
    const pos = this.nodePos;
    const size = this.nodeSizeAttr.array as Float32Array;
    const alpha = this.nodeAlphaAttr.array as Float32Array;
    for (let i = 0; i < s.count; i++) {
      pos[i * 2] = s.screenX[i] + s.offX[i];
      pos[i * 2 + 1] = s.screenY[i] + s.offY[i];
      size[i] = s.renderSize[i];
      alpha[i] = s.renderAlpha[i];
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
      b.material.uniforms.uAlpha.value = layer.alpha * cfg.lineOpacity * s.lineGain;
      b.material.uniforms.uWidth.value = cfg.lineWidth;
      const ends = b.ends.array as Float32Array;
      const weights = b.weights.array as Float32Array;
      for (let e = 0; e < count; e++) {
        const [a, c] = layer.edges[e];
        ends[e * 4] = pos[a * 2];
        ends[e * 4 + 1] = pos[a * 2 + 1];
        ends[e * 4 + 2] = pos[c * 2];
        ends[e * 4 + 3] = pos[c * 2 + 1];
        // edges touching lit nodes light up (up to 4x); far edges dim
        const g = Math.max(light[a], light[c]);
        weights[e] = (layer.weight ? layer.weight[e] : 1) * (1 + 3 * g) * 0.5 * (depthA[a] + depthA[c]);
      }
      b.ends.needsUpdate = true;
      b.weights.needsUpdate = true;
    });

    // highlights (hover path, pulse trails) and pulse heads
    const hc = s.highlightCount;
    const hs = s.highlights;
    const hEnds = this.hl.ends.array as Float32Array;
    const hW = this.hl.weights.array as Float32Array;
    const hT = this.hl.tapers.array as Float32Array;
    for (let k = 0; k < hc; k++) {
      hEnds[k * 4] = hs[k * 6];
      hEnds[k * 4 + 1] = hs[k * 6 + 1];
      hEnds[k * 4 + 2] = hs[k * 6 + 2];
      hEnds[k * 4 + 3] = hs[k * 6 + 3];
      hW[k] = hs[k * 6 + 4];
      hT[k] = hs[k * 6 + 5];
    }
    this.hl.geometry.instanceCount = hc;
    this.hl.mesh.visible = hc > 0;
    this.hl.material.uniforms.uWidth.value = cfg.lineWidth * 1.4;
    this.hl.ends.needsUpdate = this.hl.weights.needsUpdate = this.hl.tapers.needsUpdate = true;
    const pp = this.pulsePos.array as Float32Array;
    const pa = this.pulseAlpha.array as Float32Array;
    for (let q = 0; q < s.pulseCount; q++) {
      pp[q * 2] = s.pulseHeads[q * 3];
      pp[q * 2 + 1] = s.pulseHeads[q * 3 + 1];
      pa[q] = s.pulseHeads[q * 3 + 2];
    }
    this.pulseGeometry.setDrawRange(0, s.pulseCount);
    this.pulseMaterial.uniforms.uSizeScale.value = cfg.pulseSize * 4;
    this.pulsePos.needsUpdate = this.pulseAlpha.needsUpdate = true;
  }

  protected onResize() {
    const res = [this.w, this.h];
    this.nodeMaterial.uniforms.uRes.value = res;
    this.nodeMaterial.uniforms.uDpr.value = this.dpr;
    for (const b of [...this.edgeBuffers, this.hl]) {
      b.material.uniforms.uRes.value = res;
      b.material.uniforms.uDpr.value = this.dpr;
    }
    this.pulseMaterial.uniforms.uRes.value = res;
    this.pulseMaterial.uniforms.uDpr.value = this.dpr;
  }

  protected disposeGpu() {
    this.nodeGeometry.dispose();
    this.nodeMaterial.dispose();
    for (const b of [...this.edgeBuffers, this.hl]) {
      b.geometry.dispose();
      b.material.dispose();
    }
    this.pulseGeometry.dispose();
    this.pulseMaterial.dispose();
  }
}

// --- loop & pointer routing ---

let stage: Stage | null = null;
let paused = false;
const views = new Map<HTMLElement, View>();
let rafId = 0;
let lastT = 0;
// when the last frame actually ran — the watchdog uses it to spot a loop
// that stalled (a frame callback the browser dropped)
let lastFrameAt = 0;
let watchdog = 0;
// recent lifecycle events, for the ?debug overlay
const events: string[] = [];
function note(e: string) {
  events.push(`${(performance.now() / 1000).toFixed(1)}s ${e}`);
  if (events.length > 8) events.shift();
}
const pointer = { x: 0, y: 0, active: false };

function frame(now: number) {
  rafId = 0;
  lastFrameAt = performance.now();
  if (stage?.lost && now - stage.lostAt > 1500 && !document.hidden) replaceStage();
  // clamp at 0: a frame's timestamp can be slightly earlier than the
  // performance.now() recorded when the loop was woken
  const dt = Math.max(0, Math.min(0.05, (now - lastT) / 1000));
  lastT = now;
  let anyRunning = false;
  for (const view of views.values()) {
    if (!view.running) continue;
    anyRunning = true;
    const p = pointer.active && view.cfg.interactive ? view.localPointer(pointer.x, pointer.y) : null;
    if (p) applyHover(view.system, view.cfg, p.x, p.y, dt);
    view.onPointer(p, dt);
    view.onSectionPointer(pointer.active && view.cfg.interactive ? view.sectionPointer(pointer.x, pointer.y) : null);
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
  // any interaction revives an idle loop
  if (!rafId) wake();
}

function onPointerDown(e: PointerEvent) {
  onPointerMove(e);
  if (e.button !== 0 || reducedMotion.matches) return;
  if (e.target instanceof Element && e.target.closest(INTERACTIVE)) return;
  for (const view of views.values()) {
    if (!view.running || !view.cfg.interactive) continue;
    const p = view.localPointer(e.clientX, e.clientY);
    if (p) view.click(p.x, p.y);
  }
}

// Clicking the empty effect area lands on the section element itself (the
// canvas never takes pointer events); without this, a click or double-click
// there starts selecting the section's text. Presses on actual content
// (text, links, buttons) are left alone.
function onMouseDown(e: MouseEvent) {
  if (e.button !== 0) return;
  for (const view of views.values()) {
    // the press landed on the effect's element or one of its ancestors
    // within the component (wrap, card) — not on text or other content
    const t = e.target;
    const onEffect = t === view.el || (t instanceof Element && t.contains(view.el) && view.root.contains(t));
    if (!view.cfg.interactive || !onEffect) continue;
    if (view.localPointer(e.clientX, e.clientY)) {
      e.preventDefault();
      return;
    }
  }
}

// "excite": hovering/focusing an element marked data-particles-excite
// lights up the nearest particle effect — the one sharing the closest
// container with it (e.g. the same card), whether the button is inside the
// effect's element or next to it.
const EXCITE = "[data-particles-excite]";
const exciteOf = (t: EventTarget | null) => (t instanceof Element ? t.closest(EXCITE) : null);

const COMPONENT = "[data-particles-component]";

function viewFor(trigger: Element): View | null {
  // component markup: the effect of the trigger's own component
  const component = trigger.closest(COMPONENT);
  if (component) {
    for (const view of views.values()) if (view.root === component) return view;
  }
  // legacy markup: the effect sharing the closest container
  for (let a: Element | null = trigger; a; a = a.parentElement) {
    for (const view of views.values()) if (a.contains(view.el)) return view;
  }
  return null;
}

function onExciteEnter(e: Event) {
  const t = exciteOf(e.target);
  if (t) viewFor(t)?.onExcite(true);
}

function onExciteLeave(e: Event) {
  const from = exciteOf(e.target);
  if (from && from !== exciteOf((e as FocusEvent | PointerEvent).relatedTarget)) viewFor(from)?.onExcite(false);
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

// A lost context that was never restored: swap in a fresh renderer. Scenes,
// geometries and materials don't belong to a renderer, so every view simply
// re-uploads to the new one on its next draw — the animation carries on.
function replaceStage() {
  const old = stage;
  if (!old) return;
  try {
    stage = new Stage();
  } catch {
    return; // GPU still unavailable; try again on the next resume
  }
  try {
    old.renderer.dispose();
  } catch {
    // already gone
  }
  console.info("[particles] WebGL context was not restored — recreated the renderer");
  note("recreated renderer");
  for (const view of views.values()) if (view.visible) view.paint();
}

// Back to the page (tab shown, window focused, bfcache restore): recover
// from anything the browser did while we were in the background.
function resume(e?: Event) {
  if (!stage) return;
  if (e) note(`${e.type} (${document.visibilityState})`);
  const gl = stage.renderer.getContext();
  if (stage.lost || gl.isContextLost()) replaceStage();
  // a frame callback requested while backgrounded that the browser dropped
  // leaves rafId set and the loop never restarting
  if (rafId && performance.now() - lastFrameAt > 500) {
    cancelAnimationFrame(rafId);
    rafId = 0;
    note("restarted stalled loop");
  }
  wake();
}

// Belt and braces: once a second, restart the loop if something should be
// animating but no frame has run for a while.
function checkLoop() {
  if (!stage) return;
  const due = [...views.values()].some((v) => v.running);
  if (due && performance.now() - lastFrameAt > 1500) resume();
}

function listen(on: boolean) {
  const m = on ? "addEventListener" : "removeEventListener";
  const opts = { passive: true };
  window[m]("pointermove", onPointerMove as EventListener, opts);
  window[m]("pointerdown", onPointerDown as EventListener, opts);
  // not passive: needs preventDefault
  window[m]("mousedown", onMouseDown as EventListener);
  document[m]("pointerover", onExciteEnter, opts);
  document[m]("focusin", onExciteEnter, opts);
  document[m]("pointerout", onExciteLeave, opts);
  document[m]("focusout", onExciteLeave, opts);
  window[m]("pointerup", onPointerEnd as EventListener, opts);
  window[m]("pointercancel", onPointerEnd as EventListener, opts);
  document[m]("pointerout", onPointerOut as EventListener, opts);
  document[m]("visibilitychange", resume);
  window[m]("focus", resume);
  window[m]("pageshow", resume);
  reducedMotion[m]("change", onReducedMotionChange);
}

// --- public API (used by index.ts) ---

// `editor` = the playground: exact config (no mobile particle reduction).
// `root` = the component the effect belongs to (defaults to `el`).
export function mount(el: HTMLElement, spec: ViewSpec, { editor = false, root }: { editor?: boolean; root?: HTMLElement } = {}) {
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
    watchdog = window.setInterval(checkLoop, 1000);
  }
  const view = spec.type === "graph" ? new GraphView(el, spec.config) : new PointsView(el, spec.config, editor);
  view.root = root ?? el;
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
    clearInterval(watchdog);
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
export function remount(el: HTMLElement, spec: ViewSpec, opts?: { editor?: boolean; root?: HTMLElement }) {
  const root = views.get(el)?.root;
  views.get(el)?.dispose();
  views.delete(el);
  mount(el, spec, { root, ...opts });
}

// Live state for the ?debug overlay / support: is the loop running, is the
// context alive, which sections are visible, and recent lifecycle events.
export function debugState() {
  return {
    visibility: document.visibilityState,
    focused: document.hasFocus(),
    loop: rafId ? "running" : "idle",
    lastFrameMsAgo: Math.round(performance.now() - lastFrameAt),
    context: !stage ? "none" : stage.lost || stage.renderer.getContext().isContextLost() ? "LOST" : "ok",
    sections: [...views.values()].map((v) => ({ visible: v.visible, running: v.running, ...v.stats() })),
    events: [...events],
  };
}

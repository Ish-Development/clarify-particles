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
  DataTexture,
  DoubleSide,
  FloatType,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  NearestFilter,
  OneFactor,
  OneMinusSrcAlphaFactor,
  Points,
  RGFormat,
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

// = MOBILE_QUERY in presets.ts (kept literal: the engine imports no loader code)
const isMobile = () => matchMedia("(max-width: 767px)").matches;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
// touch-first devices (phones, tablets): no hover to drive the grid lights
const noHover = matchMedia("(hover: none)");

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

// Background glow (graph `glow`): alpha of an elliptical gaussian at a
// canvas px; center uGlowC and sigma uGlowS in canvas px, 0 peak = off.
// Matches Figma's heavily blurred ellipse at a fraction of the cost.
const GLOW_AT = /* glsl */ `
uniform float uGlow;
uniform vec2 uGlowC;
uniform vec2 uGlowS;
uniform vec3 uGlowColor;
float glowAt(vec2 px) {
  vec2 d = (px - uGlowC) / uGlowS;
  return uGlow * exp(-0.5 * dot(d, d));
}`;

const POINT_VERT = /* glsl */ `
${GLOW_AT}
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
attribute float aShape;
uniform vec2 uRes;
uniform vec2 uOffset;
uniform float uDpr;
uniform float uSizeScale;
uniform float uMaxSize;
uniform float uGap;
uniform float uSnap;
uniform vec3 uGapColor;
varying float vAlpha;
varying vec3 vColor;
varying float vSize;
varying float vPt;
varying float vShape;
varying vec3 vGapColor;
void main() {
  vShape = aShape;
  // the gap ring is the background behind the node: the card's color with
  // the glow over it, so it doesn't show as a dark speck on the glow
  float g = glowAt(position.xy + uOffset);
  vGapColor = uGapColor * (1.0 - g) + uGlowColor * g;
  vec2 p = (position.xy + uOffset) / uRes * 2.0 - 1.0;
  gl_Position = vec4(p.x, -p.y, 0.0, 1.0);
  // dot diameter in device px; snapped to whole pixels for crisp edges
  float s = aSize * uSizeScale * uDpr;
  if (uSnap > 0.5) s = max(1.0, floor(s + 0.5));
  s = min(s, uMaxSize);
  vSize = s;
  // the sprite also holds the gap ring around the dot
  gl_PointSize = s + 2.0 * uGap * uDpr;
  vPt = gl_PointSize;
  vAlpha = aAlpha;
  vColor = aColor;
}`;

// Round dot, blended between two profiles by uSoftness:
//   1 = soft glow matching the original radial-gradient sprite (color and
//       alpha both fall off linearly -> quadratic visible falloff)
//   0 = solid disc with a 1px anti-aliased edge
//   gap ring (nodeGap): an opaque ring of uGapColor around the dot, so lines
//       stop short of it instead of running into it
const POINT_FRAG = /* glsl */ `
uniform float uSoftness;
uniform float uSolid;
varying float vAlpha;
varying vec3 vColor;
varying float vSize;
varying float vPt;
varying float vShape;
varying vec3 vGapColor;
void main() {
  // distance from the center in px: round, or square ("pixel" nodes)
  vec2 q = abs(gl_PointCoord - 0.5) * vPt;
  float r = vShape > 0.5 ? max(q.x, q.y) : length(q);
  float R = vSize * 0.5;
  float ring = (vPt - vSize) * 0.5;
  float f = 1.0 - r / R;
  if (f <= 0.0) {
    float edge = clamp(R + ring - r, 0.0, 1.0);
    if (ring <= 0.0 || edge <= 0.0) discard;
    gl_FragColor = vec4(vGapColor * edge, edge);
    return;
  }
  float hard = clamp(f * R, 0.0, 1.0);
  float cover = mix(hard, f * f, uSoftness);
  // solid: opaque disc dimmed by vAlpha; otherwise vAlpha is transparency
  float a = cover * mix(vAlpha, 1.0, uSolid);
  vec3 col = vColor * mix(1.0, vAlpha, uSolid);
  // inside a gap ring the dot's anti-aliased edge blends into the ring
  if (ring > 0.0) gl_FragColor = vec4(col * a + vGapColor * (1.0 - a), 1.0);
  else gl_FragColor = vec4(col * a, a);
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
uniform vec2 uOffset;
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
  vec2 c = (p + uOffset) / uRes * 2.0 - 1.0;
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

// Full-canvas quad for the glow; vPx = canvas px (y down).
const GLOW_VERT = /* glsl */ `
uniform vec2 uRes;
varying vec2 vPx;
void main() {
  vPx = vec2(position.x + 1.0, 1.0 - position.y) * 0.5 * uRes;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const GLOW_FRAG = /* glsl */ `
${GLOW_AT}
varying vec2 vPx;
void main() {
  float a = glowAt(vPx);
  if (a <= 0.0) discard;
  // dither: a faint gradient on a dark background bands in 8 bits. The
  // noise is on alpha, so it's scaled by the color to move the composited
  // pixel by about one 8-bit level (triangular noise: two hashes)
  vec2 q = gl_FragCoord.xy;
  float n = fract(sin(dot(q, vec2(12.9898, 78.233))) * 43758.5453) + fract(sin(dot(q, vec2(39.3468, 11.1357))) * 24634.6345) - 1.0;
  float c = max(max(uGlowColor.r, uGlowColor.g), max(uGlowColor.b, 0.02));
  a = clamp(a + n / (255.0 * c), 0.0, 1.0);
  gl_FragColor = vec4(uGlowColor * a, a);
}`;
const FULL_QUAD = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0]);

// Grid pattern (graph `grid`): squares of uDot device px every uPitch,
// counted from the canvas' top-left, each one flat-lit at its center by its
// own color, the drifting lights (gaussians in canvas px) and the hover
// trail (uHeat: per square, peak and time lit).
const GRID_AUTO = 4;
const GRID_FRAG = /* glsl */ `
uniform vec2 uDev;
uniform float uDpr;
uniform float uPitch;
uniform float uDot;
uniform float uOpacity;
uniform sampler2D uHeat;
uniform vec2 uHeatSize;
uniform float uTime;
uniform float uFade;
uniform float uHot;
uniform vec3 uHotColor;
uniform vec3 uAuto[${GRID_AUTO}];
uniform float uAutoSize;
uniform vec3 uAutoColor;
uniform float uAutoStrength;
uniform vec3 uBaseColor;
uniform float uBase;
void main() {
  // device px, y down from the canvas' top-left
  vec2 dev = vec2(gl_FragCoord.x, uDev.y - gl_FragCoord.y);
  vec2 cell = floor(dev / uPitch);
  vec2 inCell = dev - cell * uPitch;
  if (inCell.x >= uDot || inCell.y >= uDot) discard;
  // the square's center in canvas CSS px
  vec2 c = (cell * uPitch + uDot * 0.5) / uDpr;
  // layers, bottom to top (premultiplied "over"): the squares' own color,
  // the drifting lights, the hover trail
  vec3 col = uBaseColor * uBase;
  float a = uBase;
  float drift = 0.0;
  for (int i = 0; i < ${GRID_AUTO}; i++) {
    vec2 d = (c - uAuto[i].xy) / uAutoSize;
    drift += uAuto[i].z * exp(-0.5 * dot(d, d));
  }
  float k = clamp(drift, 0.0, 1.0) * uAutoStrength;
  col = uAutoColor * k + col * (1.0 - k);
  a = k + a * (1.0 - k);
  float hot = 0.0;
  vec2 heat = texture2D(uHeat, (cell + 0.5) / uHeatSize).rg;
  if (heat.r > 0.0) hot = heat.r * exp(-(uTime - heat.g) / uFade);
  float h = clamp(hot, 0.0, 1.0) * uHot;
  col = uHotColor * h + col * (1.0 - h);
  a = h + a * (1.0 - h);
  gl_FragColor = vec4(col, a) * uOpacity;
}`;

// The grid pattern behind a graph's network: one full-canvas quad. The
// hover trail lives in a float texture with one texel per square (peak,
// time lit): the CPU only stamps the squares near the pointer, the shader
// does the fading.
class GridLayer {
  readonly mesh: Mesh;
  private readonly geometry = new BufferGeometry();
  private readonly material: ShaderMaterial;
  private heat: DataTexture | null = null;
  private heatData = new Float32Array(2);
  private nx = 1;
  private ny = 1;
  // pitch/dot in device px, and the canvas scale (CSS -> device)
  private pitch = 3;
  private dot = 2;
  private dpr = 1;
  private time = 0;
  private last: { x: number; y: number } | null = null;
  private readonly autoSeeds: number[] = [];

  constructor(private readonly cfg: GraphSpec["config"]) {
    this.geometry.setAttribute("position", new BufferAttribute(FULL_QUAD, 3));
    this.material = makeMaterial(
      GLOW_VERT,
      GRID_FRAG,
      {
        uRes: { value: [1, 1] },
        uDev: { value: [1, 1] },
        uDpr: { value: 1 },
        uPitch: { value: 3 },
        uDot: { value: 2 },
        uOpacity: { value: 1 },
        uHeat: { value: null },
        uHeatSize: { value: [1, 1] },
        uTime: { value: 0 },
        uFade: { value: 1 },
        uHot: { value: 0 },
        uHotColor: { value: [0, 0, 0] },
        // flat array: three uploads uniform arrays of plain numbers as-is
        uAuto: { value: new Float32Array(GRID_AUTO * 3) },
        uAutoSize: { value: 1 },
        uAutoColor: { value: [0, 0, 0] },
        uAutoStrength: { value: 0 },
        uBaseColor: { value: [0, 0, 0] },
        uBase: { value: 0 },
      },
      "normal",
    );
    this.material.side = DoubleSide;
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < GRID_AUTO; i++) this.autoSeeds.push(Math.random() * 100);
  }

  // canvas size in CSS px and device px
  resize(cw: number, ch: number, pw: number, ph: number, dpr: number) {
    const u = this.material.uniforms;
    this.dpr = dpr;
    // whole device pixels, so every square is the same crisp size
    this.pitch = Math.max(2, Math.round(this.cfg.gridPitch * dpr));
    this.dot = Math.min(this.pitch - 1, Math.max(1, Math.round(this.cfg.gridDot * dpr)));
    u.uRes.value = [cw, ch];
    u.uDev.value = [pw, ph];
    u.uDpr.value = dpr;
    u.uPitch.value = this.pitch;
    u.uDot.value = this.dot;
    const nx = Math.ceil(pw / this.pitch);
    const ny = Math.ceil(ph / this.pitch);
    if (!this.heat || nx !== this.nx || ny !== this.ny) {
      this.heat?.dispose();
      this.nx = nx;
      this.ny = ny;
      this.heatData = new Float32Array(nx * ny * 2);
      const t = new DataTexture(this.heatData, nx, ny, RGFormat, FloatType);
      t.magFilter = t.minFilter = NearestFilter;
      t.needsUpdate = true;
      this.heat = t;
      u.uHeat.value = t;
      u.uHeatSize.value = [nx, ny];
    }
  }

  // once per frame: p = pointer in canvas CSS px, or null
  update(p: { x: number; y: number } | null, dt: number, cw: number, ch: number) {
    const cfg = this.cfg;
    const u = this.material.uniforms;
    this.time += dt;
    this.mesh.visible = cfg.grid > 0;
    u.uOpacity.value = Math.min(1, cfg.grid);
    u.uTime.value = this.time;
    u.uFade.value = Math.max(0.05, cfg.gridHotFade);
    u.uHot.value = Math.min(1, cfg.gridHot);
    u.uHotColor.value = hexToRgb01(cfg.gridHotColor);
    u.uAutoColor.value = hexToRgb01(cfg.gridAutoColor);
    u.uAutoStrength.value = Math.min(1, Math.max(0, cfg.gridAutoStrength));
    u.uBaseColor.value = hexToRgb01(cfg.gridColor);
    u.uBase.value = Math.min(1, Math.max(0, cfg.gridBase));
    // drifting lights: slow Lissajous paths over the canvas, each fading in
    // and out on its own clock
    const auto = cfg.gridAuto === "always" || (cfg.gridAuto === "touch" && noHover.matches);
    const n = auto ? Math.min(GRID_AUTO, Math.max(0, Math.round(cfg.gridAutoCount))) : 0;
    u.uAutoSize.value = Math.max(1, cfg.gridAutoSize);
    const A: Float32Array = u.uAuto.value;
    for (let i = 0; i < GRID_AUTO; i++) {
      if (i >= n) {
        A.set([0, 0, 0], i * 3);
        continue;
      }
      const t = this.time * cfg.gridAutoSpeed + this.autoSeeds[i];
      const x = (0.5 + 0.45 * Math.sin(t * 1.3 + i * 2.1)) * cw;
      const y = (0.5 + 0.45 * Math.sin(t * 0.9 + i * 1.7 + 1)) * ch;
      const k = 0.5 + 0.5 * Math.sin(t * 2.3 + i * 4.2);
      A.set([x, y, k * k], i * 3);
    }
    if (p && cfg.grid > 0 && cfg.gridHot > 0) this.stampPath(p);
    this.last = p;
  }

  // light the squares around p, and along the way from the last position
  // so a fast move leaves a continuous trail
  private stampPath(p: { x: number; y: number }) {
    const r = Math.max(4, this.cfg.gridHotRadius);
    const from = this.last ?? p;
    const d = Math.hypot(p.x - from.x, p.y - from.y);
    const steps = Math.min(32, Math.ceil(d / (r / 3)));
    let any = false;
    for (let k = steps; k >= 0; k--) {
      const t = steps ? k / steps : 0;
      any = this.stamp(from.x + (p.x - from.x) * (1 - t), from.y + (p.y - from.y) * (1 - t), r) || any;
    }
    if (any && this.heat) this.heat.needsUpdate = true;
  }

  private stamp(x: number, y: number, r: number) {
    // CSS px -> square index
    const k = this.dpr / this.pitch;
    const cx = x * k;
    const cy = y * k;
    const rc = r * k;
    const x0 = Math.max(0, Math.floor(cx - rc));
    const x1 = Math.min(this.nx - 1, Math.ceil(cx + rc));
    const y0 = Math.max(0, Math.floor(cy - rc));
    const y1 = Math.min(this.ny - 1, Math.ceil(cy + rc));
    const fade = Math.max(0.05, this.cfg.gridHotFade);
    const data = this.heatData;
    let any = false;
    for (let j = y0; j <= y1; j++) {
      for (let i = x0; i <= x1; i++) {
        const dd = Math.hypot(i + 0.5 - cx, j + 0.5 - cy) / rc;
        if (dd >= 1) continue;
        const v = (1 - dd) * (1 - dd);
        // texel row j = square row j (the shader samples y-down indices)
        const o = (j * this.nx + i) * 2;
        const now = data[o] * Math.exp(-(this.time - data[o + 1]) / fade);
        if (v > now) {
          data[o] = v;
          data[o + 1] = this.time;
          any = true;
        }
      }
    }
    return any;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.heat?.dispose();
  }
}

const glowUniforms = () => ({
  uGlow: { value: 0 },
  uGlowC: { value: [0, 0] },
  uGlowS: { value: [1, 1] },
  uGlowColor: { value: [0, 0, 0] },
});

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
  // w/h: the zone (the element) the effect is laid out in. cw/ch: the
  // canvas, which is the zone, or with `bleed` the whole component, the zone
  // sitting at ox/oy inside it
  w = 1;
  h = 1;
  cw = 1;
  ch = 1;
  ox = 0;
  oy = 0;
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
  // inline styles set for touchSpin/touchHold, restored on dispose
  private readonly touchStyle: Record<string, string> = {};

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
  // touch "drag to spin" (graph views); dx/dy in CSS px of finger travel
  readonly canSpin: boolean = false;
  grab(_on: boolean, _held?: boolean) {}
  spinBy(_dx: number, _dy: number, _dt: number) {}
  // the effect's own zone (.u-particles-threejs), in client px: a drag
  // spins it only from here, never from the text around it
  inZone(clientX: number, clientY: number) {
    const r = this.el.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  }
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
    this.cw = this.w;
    this.ch = this.h;
    this.ox = this.oy = 0;
    if (this.cfg.bleed && this.root !== this.el) {
      // layout px (offsetWidth is unaffected by CSS transforms on ancestors)
      const z = this.el.getBoundingClientRect();
      const r = this.root.getBoundingClientRect();
      const k = this.el.offsetWidth / (z.width || 1);
      this.cw = Math.max(1, this.root.clientWidth);
      this.ch = Math.max(1, this.root.clientHeight);
      this.ox = (z.left - r.left) * k - this.root.clientLeft;
      this.oy = (z.top - r.top) * k - this.root.clientTop;
      Object.assign(this.canvas.style, {
        left: `${-this.ox}px`,
        top: `${-this.oy}px`,
        width: `${this.cw}px`,
        height: `${this.ch}px`,
      });
    } else {
      Object.assign(this.canvas.style, { left: "0", top: "0", width: "100%", height: "100%" });
    }
    this.dpr = Math.min(window.devicePixelRatio || 1, isMobile() ? this.cfg.mobileDpr : 2);
    this.pw = Math.max(1, Math.round(this.cw * this.dpr));
    this.ph = Math.max(1, Math.round(this.ch * this.dpr));
  }

  // The component this effect belongs to (set by mount). With `bleed` the
  // canvas covers it, so its size matters too.
  setRoot(root: HTMLElement) {
    this.root = root;
    if (root !== this.el) this.resizeObserver.observe(root);
    if (this.canSpin && this.cfg.touchSpin) {
      if (this.cfg.touchHold > 0) {
        // touch-action stays auto: a held finger must be able to claim
        // vertical moves, so the script decides on the first move instead
        // (onSpinTouchMove). A resting finger mustn't bring up iOS's
        // callout/loupe or select.
        this.setTouchStyle("-webkit-touch-callout", "none");
        this.setTouchStyle("-webkit-user-select", "none");
        this.setTouchStyle("user-select", "none");
        root.addEventListener("touchmove", onSpinTouchMove, { passive: false });
      } else {
        // sideways drags are ours (spin); vertical swipes and pinch-zoom
        // stay the browser's
        this.setTouchStyle("touch-action", "pan-y pinch-zoom");
      }
    }
    this.resize();
  }

  private setTouchStyle(prop: string, value: string) {
    if (!(prop in this.touchStyle)) this.touchStyle[prop] = this.el.style.getPropertyValue(prop);
    this.el.style.setProperty(prop, value);
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
    // anywhere over the canvas counts; coordinates are the zone's (with
    // `bleed`, negative or past w/h outside the zone)
    const rect = this.canvas.getBoundingClientRect();
    if (clientX < rect.left || clientY < rect.top || clientX > rect.right || clientY > rect.bottom) return null;
    const k = this.cw / (rect.width || 1);
    return { x: (clientX - rect.left) * k - this.ox, y: (clientY - rect.top) * k - this.oy };
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
    if (spin?.view === this) endSpin();
    this.disposeGpu();
    this.canvas.remove();
    this.el.style.position = this.prevStyle.position;
    this.el.style.isolation = this.prevStyle.isolation;
    for (const [prop, value] of Object.entries(this.touchStyle)) this.el.style.setProperty(prop, value);
    this.root.removeEventListener("touchmove", onSpinTouchMove);
  }
}

function pointUniforms(sizeScale: number, softness: number, solid: boolean) {
  return {
    uSoftness: { value: softness },
    uSolid: { value: solid ? 1 : 0 },
    uRes: { value: [1, 1] },
    uOffset: { value: [0, 0] },
    uDpr: { value: 1 },
    uSizeScale: { value: sizeScale },
    uMaxSize: { value: stage?.maxPointSize ?? 64 },
    uGap: { value: 0 },
    uSnap: { value: 0 },
    uGapColor: { value: [0, 0, 0] },
    ...glowUniforms(),
  };
}

class PointsView extends View {
  readonly system: ParticleSystem;
  private readonly geometry = new BufferGeometry();
  private readonly material: ShaderMaterial;
  private readonly pos: Float32Array;
  private readonly posAttr: BufferAttribute;
  private readonly colorAttr: BufferAttribute;
  // hoverGlow: per-dot light (eased), and the size/alpha actually drawn
  private readonly glow: Float32Array;
  private readonly sizeAttr: BufferAttribute;
  private readonly alphaAttr: BufferAttribute;
  private glowing = false;
  private ptr: { x: number; y: number } | null = null;
  // excite (a data-particles-excite button hovered): every dot lights up,
  // eased on and off, as the graph's steady excite
  private excite = 0;
  private exciteTarget = 0;
  // the last frame drew excite light, so one more pass clears it
  private excited = false;

  // cfg is used BY REFERENCE: the simulation reads it every frame, so the
  // playground's live edits (chaos, ease, rotation, hover…) apply instantly.
  constructor(el: HTMLElement, cfg: PointsSpec["config"], editor: boolean) {
    if (!editor && isMobile()) {
      cfg.count = cfg.countMobile || Math.round(cfg.count * 0.5);
      cfg.sizeMin *= cfg.sizeScaleMobile;
      cfg.sizeMax *= cfg.sizeScaleMobile;
    }
    super(el, cfg);
    this.system = new ParticleSystem(cfg, this.w, this.h);
    const sys = this.system;
    const n = sys.count;

    this.pos = new Float32Array(n * 2);
    this.posAttr = new BufferAttribute(this.pos, 2).setUsage(DynamicDrawUsage);
    this.colorAttr = new BufferAttribute(new Float32Array(n * 3), 3);
    this.geometry.setAttribute("position", this.posAttr);
    this.glow = new Float32Array(n);
    this.sizeAttr = new BufferAttribute(sys.size.slice(), 1).setUsage(DynamicDrawUsage);
    this.alphaAttr = new BufferAttribute(sys.opacity.slice(), 1).setUsage(DynamicDrawUsage);
    this.geometry.setAttribute("aSize", this.sizeAttr);
    this.geometry.setAttribute("aAlpha", this.alphaAttr);
    this.geometry.setAttribute("aColor", this.colorAttr);
    this.writeColors();

    // 6 = the playground's sprite scale (render.ts: size * 6)
    this.material = makeMaterial(POINT_VERT, POINT_FRAG, pointUniforms(6, cfg.softness, cfg.solid), cfg.blend);
    const points = new Points(this.geometry, this.material);
    points.frustumCulled = false;
    this.scene.add(points);
    this.start();
  }

  onSectionPointer(p: { x: number; y: number } | null) {
    this.system.setSectionPointer(p);
  }
  stats() {
    return this.system.debug();
  }
  // touch "drag to spin", as the graph (no light-up on a hold: points have
  // no excite)
  readonly canSpin = true;
  grab(on: boolean) {
    this.system.grab(on);
    wake();
  }
  spinBy(dx: number, dy: number, dt: number) {
    // a drag across the whole zone turns it half way round
    const k = Math.PI / Math.max(240, this.w);
    this.system.spinBy(dx * k, -dy * k, dt);
  }

  onPointer(p: { x: number; y: number } | null) {
    this.ptr = p;
  }
  onExcite(on: boolean) {
    this.exciteTarget = on ? 1 : 0;
    wake();
  }

  step(dt: number) {
    this.system.update(dt, this.w, this.h);
    this.updateGlow(dt);
  }

  // hoverGlow, as the graph does it: smoothstep within 1.3 x hoverRadius,
  // eased in and out; a lit dot gets brighter and up to 60% bigger. Excite
  // adds the graph's steady light-up to every dot (+0.35 opacity).
  private updateGlow(dt: number) {
    const cfg = this.cfg as PointsSpec["config"];
    const s = this.system;
    const hg = cfg.hoverGlow;
    const p = hg > 0 ? this.ptr : null;
    this.excite += (this.exciteTarget - this.excite) * (1 - Math.exp(-dt * 5));
    if (this.excite < 0.002 && this.exciteTarget === 0) this.excite = 0;
    const ex = this.excite;
    if (!p && !this.glowing && ex === 0 && !this.excited) return;
    this.excited = ex > 0;
    const ease = 1 - Math.exp(-dt * 6);
    const r = cfg.hoverRadius * 1.3;
    const size = this.sizeAttr.array as Float32Array;
    const alpha = this.alphaAttr.array as Float32Array;
    let any = false;
    for (let i = 0; i < s.count; i++) {
      let target = 0;
      if (p) {
        const dx = s.baseX[i] + s.offX[i] - p.x;
        const dy = s.baseY[i] + s.offY[i] - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < r * r) {
          const f = 1 - Math.sqrt(d2) / r;
          target = f * f * (3 - 2 * f) * hg;
        }
      }
      const g = (this.glow[i] += (target - this.glow[i]) * ease);
      if (g > 0.002) any = true;
      size[i] = s.size[i] * (1 + 0.6 * g);
      alpha[i] = Math.min(1, s.opacity[i] + 0.6 * g + 0.35 * ex);
    }
    this.glowing = any;
    this.sizeAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
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
    this.material.uniforms.uRes.value = [this.cw, this.ch];
    this.material.uniforms.uOffset.value = [this.ox, this.oy];
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
  // lineGap: the same edges, wider, in gapColor, drawn before every line
  knock?: Mesh;
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
  private readonly glowGeometry = new BufferGeometry();
  private readonly glowMaterial: ShaderMaterial;
  private readonly glowMesh: Mesh;
  private readonly grid: GridLayer;
  // pointer (canvas px) and time for the grid, applied at sync
  private gridPointer: { x: number; y: number } | null = null;
  private gridDt = 0;

  constructor(el: HTMLElement, cfg: GraphSpec["config"]) {
    super(el, cfg);
    this.graphCfg = cfg;
    this.system = new GraphSystem(cfg, this.w, this.h);
    const n = this.system.count;
    // sized for the largest layout so a sequence never reallocates
    const cap = Math.max(1, this.system.maxEdges);

    // glow: drawn first, behind everything
    this.glowGeometry.setAttribute("position", new BufferAttribute(FULL_QUAD, 3));
    this.glowMaterial = makeMaterial(GLOW_VERT, GLOW_FRAG, { uRes: { value: [1, 1] }, ...glowUniforms() }, "normal");
    this.glowMaterial.side = DoubleSide;
    this.glowMesh = new Mesh(this.glowGeometry, this.glowMaterial);
    this.glowMesh.frustumCulled = false;
    this.scene.add(this.glowMesh);
    // grid pattern: over the glow, under the network
    this.grid = new GridLayer(cfg);
    this.scene.add(this.grid.mesh);

    // edges first (drawn under the nodes); every layer's lineGap strips go
    // before any line, so no strip covers another layer's line
    const lineMeshes: Mesh[] = [];
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
          uOffset: { value: [0, 0] },
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
      lineMeshes.push(mesh);
      // same shader and instances: color = gapColor, alpha = the layer's
      // (not lineOpacity), so a normal edge cuts a solid strip
      const knockMaterial = makeMaterial(
        LINE_VERT,
        LINE_FRAG,
        {
          uRes: { value: [1, 1] },
          uOffset: { value: [0, 0] },
          uColor: { value: [0, 0, 0] },
          uAlpha: { value: 0 },
          uWidth: { value: 1 },
          uDpr: { value: 1 },
        },
        "normal",
      );
      knockMaterial.side = DoubleSide;
      const knock = new Mesh(geometry, knockMaterial);
      knock.frustumCulled = false;
      this.scene.add(knock);
      this.edgeBuffers.push({ ends, weights, geometry, material, mesh, knock });
    }
    for (const m of lineMeshes) this.scene.add(m);

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
          uOffset: { value: [0, 0] },
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
    this.nodeGeometry.setAttribute("aShape", new BufferAttribute(this.system.shape, 1));
    // 2 = the playground's node scale (graphRender.ts: size * 2)
    this.nodeMaterial = makeMaterial(POINT_VERT, POINT_FRAG, pointUniforms(2, cfg.softness, cfg.solid), cfg.blend);
    this.applyNodeLook();
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
  readonly canSpin = true;
  grab(on: boolean, held = false) {
    this.system.grab(on);
    // a hold lights it up: the grab "took" (released with the finger)
    if (held || !on) this.system.setExcite(on && held);
    wake();
  }
  spinBy(dx: number, dy: number, dt: number) {
    // a drag across the whole zone turns it half way round
    const k = Math.PI / Math.max(240, this.w);
    this.system.spinBy(dx * k, -dy * k, dt);
  }
  stats() {
    const s = this.system;
    return { pulses: s.pulseCount, highlights: s.highlightCount, lineGain: +s.lineGain.toFixed(2), ...s.debug() };
  }
  click(x: number, y: number) {
    if (this.graphCfg.clickBehavior === "ripple") this.system.rippleAt(x, y);
    else super.click(x, y);
  }

  // crispness options on the node sprites: gap ring, pixel-snapped sizes
  private applyNodeLook() {
    const cfg = this.graphCfg;
    const u = this.nodeMaterial.uniforms;
    u.uGap.value = Math.max(0, cfg.nodeGap);
    u.uGapColor.value = hexToRgb01(cfg.gapColor);
    u.uSnap.value = cfg.snapSizes ? 1 : 0;
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
    this.applyNodeLook();
    const glowColor = hexToRgb01(cfg.glowColor);
    this.glowMaterial.uniforms.uGlowColor.value = glowColor;
    this.nodeMaterial.uniforms.uGlowColor.value = glowColor;
    const lineColor = hexToRgb01(cfg.lineColor);
    const gap = hexToRgb01(cfg.gapColor);
    for (const b of this.edgeBuffers) {
      b.material.uniforms.uColor.value = lineColor;
      b.material.blendDst = blendDst(cfg.blend);
      if (b.knock) (b.knock.material as ShaderMaterial).uniforms.uColor.value = gap;
    }
    const pulse = hexToRgb01(cfg.pulseColor);
    this.hl.material.uniforms.uColor.value = pulse;
    const pc = this.pulseColor.array as Float32Array;
    for (let i = 0; i < pc.length; i += 3) pc.set(pulse, i);
    this.pulseColor.needsUpdate = true;
  }

  onPointer(p: { x: number; y: number } | null) {
    this.system.setPointer(p);
    // the grid covers the canvas: its coordinates are the canvas'
    this.gridPointer = p ? { x: p.x + this.ox, y: p.y + this.oy } : null;
  }

  step(dt: number) {
    this.gridDt += dt;
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
    this.syncGlow();
    this.grid.update(this.gridPointer, this.gridDt, this.cw, this.ch);
    this.gridDt = 0;

    s.layers.forEach((layer, li) => {
      const b = this.edgeBuffers[li];
      const count = layer.alpha > 0.002 ? layer.edges.length : 0;
      b.mesh.visible = count > 0;
      b.geometry.instanceCount = count;
      if (b.knock) {
        b.knock.visible = count > 0 && cfg.lineGap > 0;
        const ku = (b.knock.material as ShaderMaterial).uniforms;
        ku.uAlpha.value = layer.alpha;
        ku.uWidth.value = cfg.lineWidth + 2 * Math.max(0, cfg.lineGap);
      }
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

  // glow placement in canvas px, shared with the node shader for the gap
  // rings (read every frame, so the playground's sliders apply live)
  private syncGlow() {
    const cfg = this.graphCfg;
    const on = cfg.glow > 0;
    this.glowMesh.visible = on;
    for (const m of [this.glowMaterial, this.nodeMaterial]) {
      const u = m.uniforms;
      u.uGlow.value = on ? Math.min(1, cfg.glow) : 0;
      u.uGlowC.value = [cfg.glowX * this.cw, cfg.glowY * this.ch];
      u.uGlowS.value = [Math.max(1, cfg.glowSizeX * this.cw), Math.max(1, cfg.glowSizeY * this.ch)];
    }
  }

  protected onResize() {
    const res = [this.cw, this.ch];
    this.glowMaterial.uniforms.uRes.value = res;
    this.grid.resize(this.cw, this.ch, this.pw, this.ph, this.dpr);
    const off = [this.ox, this.oy];
    this.nodeMaterial.uniforms.uRes.value = res;
    this.nodeMaterial.uniforms.uOffset.value = off;
    this.nodeMaterial.uniforms.uDpr.value = this.dpr;
    for (const b of [...this.edgeBuffers, this.hl]) {
      for (const m of [b.material, b.knock?.material as ShaderMaterial | undefined]) {
        if (!m) continue;
        m.uniforms.uRes.value = res;
        m.uniforms.uOffset.value = off;
        m.uniforms.uDpr.value = this.dpr;
      }
    }
    this.pulseMaterial.uniforms.uRes.value = res;
    this.pulseMaterial.uniforms.uOffset.value = off;
    this.pulseMaterial.uniforms.uDpr.value = this.dpr;
  }

  protected disposeGpu() {
    this.glowGeometry.dispose();
    this.glowMaterial.dispose();
    this.grid.dispose();
    this.nodeGeometry.dispose();
    this.nodeMaterial.dispose();
    for (const b of [...this.edgeBuffers, this.hl]) {
      b.geometry.dispose();
      b.material.dispose();
      (b.knock?.material as ShaderMaterial | undefined)?.dispose();
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
// touch = the last pointer was a finger or pen; down = it's pressed
const pointer = { x: 0, y: 0, active: false, touch: false, down: false };
// a view's hover reactions follow the pointer; without touchHover, a finger
// only drives them while it's pressed (the glow follows it, lift = off)
const hovers = (view: View) => pointer.active && view.cfg.interactive && (!pointer.touch || view.cfg.touchHover || pointer.down);
// parallax stays mouse-only without touchHover: tilting toward the finger
// would fight the drag-to-spin
const parallaxes = (view: View) => hovers(view) && (!pointer.touch || view.cfg.touchHover);

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
    const on = hovers(view);
    const p = on ? view.localPointer(pointer.x, pointer.y) : null;
    if (p) applyHover(view.system, view.cfg, p.x, p.y, dt);
    view.onPointer(p, dt);
    view.onSectionPointer(parallaxes(view) ? view.sectionPointer(pointer.x, pointer.y) : null);
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
  pointer.touch = e.pointerType !== "mouse";
  if (spin && e.pointerId === spin.id) moveSpin(e);
  // any interaction revives an idle loop
  if (!rafId) wake();
}

function onPointerDown(e: PointerEvent) {
  onPointerMove(e);
  pointer.down = true;
  if (e.button !== 0 || reducedMotion.matches) return;
  if (e.target instanceof Element && e.target.closest(INTERACTIVE)) return;
  for (const view of views.values()) {
    if (!view.running || !view.cfg.interactive) continue;
    const p = view.localPointer(e.clientX, e.clientY);
    if (p) view.click(p.x, p.y);
  }
  if (e.pointerType === "touch" && e.isPrimary) startSpin(e);
}

// --- touch "drag to spin" (touchSpin) ---
// The zone has touch-action: pan-y, so an up/down swipe scrolls the page as
// usual (the browser takes it and cancels the pointer), while a sideways
// drag comes to us and turns the network; it coasts on after release.
// touchHold (ms) adds: a finger held still that long grabs it outright (it
// lights up), and then up/down drags turn it too instead of scrolling. The
// zone keeps touch-action auto then (browsers hand pan-y moves straight to
// scrolling), and the first move past the slop decides: sideways or after
// a hold = ours (the touchmove is cancelled), otherwise = a scroll.
const HOLD_SLOP = 10;
let spin: {
  view: View;
  id: number;
  x0: number;
  y0: number;
  x: number;
  y: number;
  t: number;
  grabbed: boolean;
  // grabbed by a hold: owns vertical moves too
  held: boolean;
  timer: number;
} | null = null;

function startSpin(e: PointerEvent) {
  endSpin();
  for (const view of views.values()) {
    if (!view.canSpin || !view.cfg.touchSpin || !view.cfg.interactive || !view.running) continue;
    if (!view.inZone(e.clientX, e.clientY)) {
      if (view.cfg.touchHold > 0 && view.localPointer(e.clientX, e.clientY)) note("spin: down outside the zone");
      continue;
    }
    const s = { view, id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t: e.timeStamp, grabbed: false, held: false, timer: 0 };
    if (view.cfg.touchHold > 0) {
      s.timer = window.setTimeout(() => {
        if (spin !== s || s.grabbed) return;
        s.grabbed = s.held = true;
        s.t = performance.now();
        view.grab(true, true);
        note("spin hold");
      }, view.cfg.touchHold);
    }
    spin = s;
    return;
  }
}

// Not grabbed yet and the finger is at (x, y): grab it, wait, or (mostly
// vertical, with touchHold) give it up as a scroll. True = grabbed.
function claimSpin(x: number, y: number) {
  const s = spin!;
  if (s.grabbed) return true;
  if (s.view.cfg.touchHold > 0) {
    // small jitter isn't a drag yet
    const dx = x - s.x0;
    const dy = y - s.y0;
    if (Math.hypot(dx, dy) < HOLD_SLOP) return false;
    if (Math.abs(dy) > Math.abs(dx)) {
      note(`spin: scroll (moved ${Math.round(Math.hypot(dx, dy))}px before the hold)`);
      endSpin();
      return false;
    }
  }
  clearTimeout(s.timer);
  s.grabbed = true;
  s.view.grab(true);
  return true;
}

function moveSpin(e: PointerEvent) {
  const s = spin!;
  if (!claimSpin(e.clientX, e.clientY)) return;
  const dt = Math.max(0, (e.timeStamp - s.t) / 1000);
  s.view.spinBy(e.clientX - s.x, e.clientY - s.y, dt);
  s.x = e.clientX;
  s.y = e.clientY;
  s.t = e.timeStamp;
}

function endSpin() {
  if (!spin) return;
  clearTimeout(spin.timer);
  if (spin.grabbed) spin.view.grab(false);
  spin = null;
}

// non-passive, on each touchHold component: stops the page scrolling once
// the finger is ours (sideways drag or a hold). Decides here too, as the
// browser may send it before the matching pointermove. Two fingers = a
// pinch: let it go.
function onSpinTouchMove(e: TouchEvent) {
  if (!spin) return;
  if (e.touches.length > 1) return endSpin();
  const t = e.touches[0];
  if (t && claimSpin(t.clientX, t.clientY) && e.cancelable) e.preventDefault();
}

// a long press would otherwise open the context menu
function onSpinContextMenu(e: Event) {
  if (spin && spin.view.cfg.touchHold > 0) e.preventDefault();
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

const COMPONENT = "[data-particles-component], [data-how-component]";

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
  const view = t && viewFor(t);
  if (!view) return;
  // a finger "hovering" the button is just a tap on it
  if (e instanceof PointerEvent && e.pointerType !== "mouse" && !view.cfg.touchHover) return;
  view.onExcite(true);
}

function onExciteLeave(e: Event) {
  const from = exciteOf(e.target);
  if (from && from !== exciteOf((e as FocusEvent | PointerEvent).relatedTarget)) viewFor(from)?.onExcite(false);
}

function onPointerEnd(e: PointerEvent) {
  // touch has no hover: stop repelling once the finger lifts
  if (e.pointerType !== "mouse") pointer.active = false;
  pointer.down = false;
  if (spin && e.pointerId === spin.id) {
    if (spin.view.cfg.touchHold > 0 && !spin.grabbed) note(e.type === "pointercancel" ? "spin: browser took it" : "spin: lifted before the hold");
    endSpin();
  }
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
  window[m]("contextmenu", onSpinContextMenu);
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
  view.setRoot(root ?? el);
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

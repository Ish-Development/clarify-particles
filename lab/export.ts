// Export lab: one model (models.ts: each shape held still, centred and
// fitted) on a frame of any size (a LinkedIn banner, a social post, a
// brand-guidelines plate), paused on the moment you want and copied as a PNG
// at up to 4x. It runs the runtime's own engine and presets.json, so the
// still is the shipped look. ?model=<name> opens one.
// DialKit's timeline dock under the preview plays and scrubs it (space
// plays and pauses, ← → step a frame, with shift a second). ⌘Z / ⇧⌘Z undo and redo
// the dials; ⌘-scroll or pinch zooms the preview, scroll or space-drag pans
// it, ⌘0 fits it again.
// Not part of the build; run `npx vite --config vite.lab.config.ts --port
// 4793 --host` and open /lab/export.html. Dial values persist in
// localStorage. HTML drawn over a canvas (the spatial map's UI) isn't in the
// export.
import { createDialKit, createDialRoot, createDialTimeline, createDialTimelineRoot } from "dialkit/vanilla";
import "dialkit/vanilla/styles.css";
import { getView, mount, setExportScale, setPaused, unmount } from "../src/runtime/engine";
import { PRESETS } from "../src/runtime/presets";
import { LOOK, LOOP, LOOP_UNITS } from "./drawings";
import { MODELS, STYLES, STYLE_DIALS, tidy, asMultipliers, modelByName, specFor, styleOverrides, type Style } from "./models";
import { progressButton } from "./progress";
import { encodeVideo, videoScale, VIDEO_SIZES, type VideoSize } from "./video";
import { GROUNDS, INKS, groundOf, inkOf, lightOf } from "./brand";
import { SIZES } from "./sizes";
import { shiftSnap } from "./snap";
import { viewToSvg } from "./svg";

const MAX = 4000;

createDialRoot({ position: "top-right", theme: "dark" });

const PANEL = {
  // labelled with their style, in the gallery's order
  model: { type: "select", options: MODELS.map((m) => ({ value: m.name, label: `${STYLES.find(([st]) => st === m.style)![1]} · ${m.name}` })), default: MODELS[0].name },
  output: {
    size: { type: "select", options: [...Object.keys(SIZES), "Custom"], default: "LinkedIn banner (4:1)" },
    w: [1584, 16, MAX, 1],
    h: [396, 16, MAX, 1],
    // the PNG's pixels per frame px
    scale: [2, 1, 4, 1],
    // the video's size (the frame fitted in 3840 × 2160, 2560 × 1440 or
    // 1920 × 1080)
    video: { type: "select", options: Object.keys(VIDEO_SIZES), default: "4K" },
    // the ground: a brand swatch (lab/brand.ts); on a light one the model is
    // drawn dark
    background: { type: "select", options: Object.keys(GROUNDS), default: "Carbon 900" },
    transparent: false,
    // the model's colour: Auto, the site's own; else a brand colour
    modelColour: { type: "select", options: ["Auto", ...Object.keys(INKS)], default: "Auto" },
  },
  // the model fits a square box, so it never stretches. size: that box,
  // % of the frame's shorter side; position: its centre on the frame, the
  // pad's edges the frame's (drag the frame to move it too)
  placement: {
    size: [100, 10, 500, 1],
    position: { type: "pad", x: [0, -1, 1, 0.01], y: [0, -1, 1, 0.01] },
    centre: { type: "action", label: "Centre in frame" },
  },
  // always a perfect loop: the timeline `length` s long, its last `blend`
  // s fading into its start, so played round (or as a video) it never jumps
  loop: { length: [10, 2, 60, 0.5], blend: [1.5, 0.2, 5, 0.1] },
  // a new take: new random choices (wirings, bolts), from 0 s
  take: { type: "action", label: "New take" },
  copySvg: { type: "action", label: "Copy SVG" },
  copy: { type: "action", label: "Copy PNG" },
  video: { type: "action", label: "Export video" },
};
const kit = createDialKit(
  "Export",
  PANEL,
  // (a new id: the dials changed units, old saved values would read wrong)
  { id: "export-2", persist: true, onAction: (a: string) => actions[a]?.() },
);
shiftSnap(kit as never, PANEL);

type V = typeof kit.values;
const v = (): V => kit.values;
const out = () => v().output;
const box = () => v().placement;
const scale = () => out().scale;
// a video being made (exportVideo), and the scale the model draws at for it
// (0: the panel's)
let exporting = false;
let videoK = 0;

const frame = document.getElementById("frame")!;
const effect = document.getElementById("effect")!;
const hud = document.getElementById("hud")!;
const stage = document.getElementById("stage")!;
// the preview's zoom (on top of fitting the frame on screen) and pan, in screen px
const view = { zoom: 1, x: 0, y: 0 };

// the largest buffer this GPU draws into: past it the export would be cut
const maxPx = (() => {
  const gl = document.createElement("canvas").getContext("webgl2");
  if (!gl) return 4096;
  const dims = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
  return Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number, dims[0], dims[1]);
})();

// While a model is rebuilt (scrubbing back starts again from 0 s), its last
// frame stays up as a still until the new one has painted; the new canvas
// shows at once, without the site's fade-in.
let ghost: HTMLCanvasElement | null = null;
function holdFrame() {
  const old = getView(effect)?.canvas;
  if (!old || ghost) return;
  ghost = document.createElement("canvas");
  ghost.width = old.width;
  ghost.height = old.height;
  ghost.getContext("2d")!.drawImage(old, 0, 0);
  ghost.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none";
  effect.append(ghost);
}
function showFrame() {
  const c = getView(effect)?.canvas;
  if (c) {
    c.style.transition = "none";
    c.style.opacity = "1";
  }
  ghost?.remove();
  ghost = null;
}

// --- the model's own panel: one per style (Dots, Lines, Network...), shown
// only while a model of that style is up, its values kept between visits ---
const PANEL_NAMES: Record<Style, string> = { dots: "Dots", network: "Network", blocks: "Blocks", lines: "Lines", drawing: "Drawing" };
let stylePanel: { style: Style; kit: ReturnType<typeof createDialKit> } | null = null;
let styleTimer = 0;
function showPanel(style: Style) {
  if (stylePanel?.style === style) return;
  stylePanel?.kit.destroy();
  const k = createDialKit(PANEL_NAMES[style], STYLE_DIALS[style] as never, { id: `export-${style}-pct`, persist: true });
  k.setValues(tidy(k.values) as never);
  stylePanel = { style, kit: k };
  shiftSnap(k as never, STYLE_DIALS[style]);
  // a dial rebuilds the model at the same moment, once the dial settles
  k.subscribe(() => {
    clearTimeout(styleTimer);
    styleTimer = window.setTimeout(remount, 150);
    if (!restoring) record();
  }, false);
}
const styleValues = () => stylePanel?.kit.values as unknown;

function mountModel() {
  holdFrame();
  unmount(effect);
  takeB.valid = false;
  setExportScale(videoK || scale());
  const m = modelByName(v().model);
  // (a new panel's own random ids don't come out of the take's numbers)
  const seeded = Math.random;
  Math.random = realRandom;
  showPanel(m.style);
  Math.random = seeded;
  const sv = styleValues();
  // the drawings' electricity is read live by drawings.ts
  const dv = m.style === "drawing" ? (asMultipliers(sv) as { electricity: { brightness: number; speed: number; afterglow: number }; dots: { inner: number; outer: number } }) : null;
  Object.assign(
    LOOK,
    dv ? { gain: dv.electricity.brightness, speed: dv.electricity.speed, fade: dv.electricity.afterglow, dotInner: dv.dots.inner, dotOuter: dv.dots.outer } : { gain: 1, speed: 1, fade: 1, dotInner: 1, dotOuter: 1 },
  );
  mount(effect, modelSpec(effect), { root: effect });
}
// the model's spec on a box (dots: in shape from the first frame, not
// gathering in from a scatter, which the loop's start faded over)
function modelSpec(el: HTMLElement) {
  const m = modelByName(v().model);
  return specFor(el, m, { ...styleOverrides(m, styleValues()), ...(m.style === "dots" ? { gather: false } : {}), ...inkOf(m.style, out().modelColour, lightOf(out())) });
}

// a new model (or size, or dots) at the same moment
function remount() {
  // (a video being made has the model to itself: it's made again after)
  if (exporting) return;
  take.valid = false;
  seek(playT);
}

// the default placement: the largest square that fits the frame, centred
const centred = () => ({ size: 100, position: { x: 0, y: 0 } });

// the effect box on the frame, in frame px: a square, size × the frame's
// shorter side, round its centre
const rect = () => {
  const o = out();
  const b = box();
  const w = Math.round((Math.min(o.w, o.h) * b.size) / 100);
  const p = b.position;
  return { w, h: w, left: Math.round(((1 + p.x) * o.w) / 2 - w / 2), top: Math.round(((1 - p.y) * o.h) / 2 - w / 2) };
};

// lay the frame and effect box out from the dials, and fit the frame on screen
function layout() {
  const o = out();
  const r = rect();
  document.documentElement.style.setProperty("--frame-aspect", String(Math.min(3, Math.max(0.75, o.w / o.h))));
  frame.style.width = `${o.w}px`;
  frame.style.height = `${o.h}px`;
  frame.style.background = o.transparent ? "transparent" : groundOf(o);
  effect.style.filter = effectB.style.filter = lightOf(o) ? "invert(1)" : "none";
  // the page behind goes light too, so a transparent frame shows the model
  document.body.classList.toggle("light", lightOf(o));
  for (const el of [effect, effectB])
    Object.assign(el.style, {
      width: `${r.w}px`,
      height: `${r.h}px`,
      left: `${r.left}px`,
      top: `${r.top}px`,
    });
  const st = stage.getBoundingClientRect();
  const fit = Math.min(1, (st.width - 48) / o.w, (st.height - 48) / o.h) * view.zoom;
  frame.style.transform = `translate(calc(-50% + ${view.x}px), calc(-50% + ${view.y}px)) scale(${fit})`;

  const k = scale();
  const big = Math.max(r.w, r.h) * k;
  hud.className = big > maxPx ? "warn" : "";
  hud.textContent =
    `output ${o.w * k} × ${o.h * k} px · ` +
    (big > maxPx ? `the box at ${k}× is ${big} px, over this GPU's ${maxPx}: make it smaller or lower the scale` : `preview ${Math.round(fit * 100)}% (⌘0 fits)`) +
    (loopUnit(v().model) ? ` · ${v().model} comes round every ${loopUnit(v().model)} s, so its loop is a multiple of that` : turnNote());
}

const actions: Record<string, () => void> = {
  // (where it is, not how big)
  "placement.centre": () => kit.setValues({ placement: { position: { x: 0, y: 0 } } }),
  take: () => {
    take.seed = (take.seed * 9301 + 49297) % 233280;
    take.valid = false;
    timeline.seek(0);
    seek(0);
  },
  copy: () => copyPng(),
  copySvg: () => copySvg(),
  video: () => exportVideo(),
};

// the left rail: every model by style, as in the gallery, the open one lit;
// its buttons are the panel's copy actions
const list = document.getElementById("list")!;
STYLES.forEach(([style, title], i) => {
  const models = MODELS.filter((m) => m.style === style);
  if (!models.length) return;
  const g = document.createElement("div");
  g.className = "group";
  g.innerHTML = `<span class="eyebrow">${String(i + 1).padStart(2, "0")}</span><span></span>`;
  g.lastElementChild!.textContent = title;
  list.append(g);
  for (const m of models) {
    const a = document.createElement("a");
    a.textContent = m.name;
    a.dataset.model = m.name;
    a.onclick = () => kit.setValues({ model: m.name });
    list.append(a);
  }
});
// the morph lab takes dots, blocks and lines: from a network or a flat
// drawing there's nothing to take there
const morphLink = document.querySelector<HTMLAnchorElement>('#rail .nav a[href="./morph.html"]')!;
morphLink.addEventListener("click", (e) => morphLink.classList.contains("off") && e.preventDefault());
function lightRail() {
  for (const a of list.querySelectorAll<HTMLElement>("a")) a.classList.toggle("on", a.dataset.model === v().model);
  const morphs = ["dots", "blocks", "lines"].includes(modelByName(v().model).style);
  morphLink.classList.toggle("off", !morphs);
  morphLink.title = morphs ? "" : "Networks and flat drawings don't morph";
  // (it starts the morph lab off with this model)
  morphLink.href = `./morph.html?model=${encodeURIComponent(v().model)}`;
  requestAnimationFrame(() => list.querySelector(".on")?.scrollIntoView({ block: "center" }));
}
for (const b of document.querySelectorAll<HTMLElement>("#rail [data-act]")) b.onclick = () => actions[b.dataset.act!]();

// react to the dials: a named size sets the frame, a typed one switches the
// size to Custom; a new frame starts centred, a new model keeps the
// placement (size and position)
let last = { model: v().model, scale: out().scale, size: out().size, w: out().w, h: out().h, light: lightOf(out()), ink: out().modelColour, loop: JSON.stringify({ length: v().loop.length, blend: v().loop.blend }) };
// --- time: the lab plays the model itself, a fixed step at a time, the
// engine's own loop stopped. Random choices (wirings, bolts, timings) come
// from a seeded generator while it steps, so a moment always looks the same
// within a take, played or scrubbed to; forward only steps the difference,
// back starts again from 0. ---
setPaused(true);
// the timeline's length: the loop's
const duration = () => v().loop.length;
// A drawing whose shapes move comes round every so many s (LOOP_UNITS): its
// loop is a whole number of those, or the cross-fade would show it in two
// places at once. The longest that fits the dial, if the dial is past it.
function loopUnit(name: string) {
  const m = modelByName(name);
  // (the site's own drawings name theirs in their preset)
  const kind = m.config.kind ?? (PRESETS[m.preset].config as Record<string, unknown>).kind;
  return m.style === "drawing" ? (LOOP_UNITS[String(kind)] ?? 0) : 0;
}
function snapLength(length: number, unit: number) {
  if (!unit) return length;
  const most = Math.floor(60 / unit) * unit;
  return Math.max(unit, Math.min(most, Math.round(length / unit) * unit));
}
// base: s of the take played before this round (played round, the take
// carries on rather than starting again: no stall as it comes round)
const take = { seed: 1, valid: false, t: 0, rng: 1, base: 0 };
let playing = true;
const SCRUB_DT = 1 / 60;
// the seeded generator stays in for the whole seek: a lazily loaded scene
// makes its random choices when it arrives, a frame or two after mounting
const realRandom = Math.random;
// (the generator's state: the take's, or the loop's second copy's)
let rngOf: { rng: number } = take;
function seed(on: boolean) {
  Math.random = on
    ? () => {
        // mulberry32
        let x = (rngOf.rng = (rngOf.rng + 0x6d2b79f5) | 0);
        x = Math.imul(x ^ (x >>> 15), x | 1);
        x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
      }
    : realRandom;
}
// the blocks and drawings load their scene a moment after mounting
async function sceneReady(el = effect) {
  for (let i = 0; i < 120; i++) {
    const view = getView(el);
    if (view && view.scene.children.some((c) => c.children.length > 0 || (c as { isMesh?: boolean }).isMesh || (c as { isPoints?: boolean }).isPoints)) return view;
    await new Promise((r) => requestAnimationFrame(r));
  }
  return getView(el);
}

// --- the perfect loop: a second copy of the model (the same take, so the
// same moments) runs `length` s ahead; over the loop's first `blend` s the
// preview fades from it into the model, so the end (length) and the start
// (0) are the same frame ---
const effectB = document.getElementById("effectB")!;
const takeB = { valid: false, t: 0, rng: 1 };
// how much of the model shows (1) against its copy ahead (0)
let blendW = 1;
function mix(w: number) {
  blendW = w;
  effect.style.opacity = String(w);
  effectB.style.opacity = String(1 - w);
  // (hidden, not removed: a removed view shrinks its canvas to 1 px)
  effectB.style.visibility = w >= 1 ? "hidden" : "visible";
}
function dropLoop() {
  takeB.valid = false;
  unmount(effectB);
  mix(1);
}
// --- the turn, round the loop: a model keeps turning (the dots tumble, the
// blocks and lines turn, the networks turn and nod), so by the loop's end it
// has moved on, and the fade into the start showed it twice. The lab turns it
// itself, by where it is in the loop: whole turns in the loop when that's
// near its own pace, else rocking to and fro at its own pace and back, so
// the end is where it started. The blocks' bolts keep clear of the ends ---
const TURNS = new WeakMap<object, Record<string, number>>();
// a clock's value at s into the loop (rate: per s, its own; period: a whole
// turn of it)
function round(at: number, rate: number, period: number) {
  const L = duration();
  const u = ((at % L) + L) % L;
  const n = Math.round((rate * L) / period);
  return n >= 1 ? (n * period * u) / L : ((rate * L) / TAU) * Math.sin((TAU * u) / L);
}
const TAU = Math.PI * 2;
type Clocks = Record<string, number | boolean>;
function loopTurn(view: NonNullable<ReturnType<typeof getView>>, at: number) {
  const vw = view as unknown as { system?: Clocks & { cfg?: Clocks }; blocks?: (Clocks & { cfg: Clocks; boltIn: Float32Array; boltOut: Float32Array; hit: Float32Array }) | null };
  const sys = vw.system;
  // dots: the tumble (both its turns: whole only after 2π / 0.06 of it),
  // and their own clock and idle drift (some shapes turn their shells by
  // them, and the dots drift on them): none comes round soon, so they rock
  if (sys && "rotTime" in sys && sys.cfg) {
    const cfg = sys.cfg;
    const spin = Math.max(0, Number(cfg.rotateSpeed));
    const own = TURNS.get(sys) ?? { on: cfg.autoRotate ? 1 : 0, spin, speed: Number(cfg.speed) || 0, idle: cfg.idleMotion ? 0.35 * spin : 0 };
    TURNS.set(sys, own);
    cfg.autoRotate = cfg.idleMotion = false;
    cfg.speed = 0;
    if (own.on) sys.rotTime = round(at, own.spin, TAU / 0.06);
    sys.time = round(at, own.speed, Infinity);
    sys.idleTime = round(at, own.idle, Infinity);
    return;
  }
  // networks: the turn, and the nod (a sine of its own clock)
  if (sys && "rot" in sys && sys.cfg) {
    const cfg = sys.cfg;
    const own = TURNS.get(sys) ?? { speed: Number(cfg.idleRotationSpeed) || 0, tilt: Number(cfg.idleTiltAmount) || 0, rotX: Number(cfg.rotX) || 0 };
    TURNS.set(sys, own);
    cfg.idleRotationSpeed = 0;
    sys.rot = round(at, own.speed, TAU);
    const nod = own.speed > 0 ? round(at, 1, TAU / (own.speed * 0.6)) * own.speed * 0.6 : 0;
    cfg.rotX = own.rotX + (Math.sin(nod) * own.tilt * 180) / Math.PI;
    return;
  }
  // blocks and lines: the turn; bolts as calm at the end as at the start
  const b = vw.blocks;
  if (b) {
    const cfg = b.cfg;
    const own = TURNS.get(b) ?? { turn: Number(cfg.turnSpeed) || 0, every: Number(cfg.boltEvery) || 0, gain: Number(cfg.boltGain) || 0, pass: 0 };
    TURNS.set(b, own);
    cfg.turnSpeed = 0;
    b.turn = round(at, own.turn, TAU);
    const L = duration();
    const u = ((at % L) + L) % L;
    const pass = Math.floor((at + 1e-9) / L);
    // round again (played on): calm, as at 0 s
    if (b.boltClock === -Infinity || pass !== own.pass) {
      b.hit.fill(Infinity);
      b.boltOut.fill(Infinity);
      b.boltIn.fill(Infinity);
      b.boltClock = 0;
      own.pass = pass;
    }
    const life = Math.max(1.5, Number(b.boltLast) || 0) * 1.2 + 4 * (Number(cfg.boltFade) || 0.5);
    cfg.boltEvery = L - u < life || u < Math.min(v().loop.blend, L / 2) ? 0 : own.every;
    cfg.boltGain = own.gain * Math.min(1, Math.max(0, (L - u) / 0.8));
  }
}

// what the loop does with the model's turn, for the status line
function turnNote() {
  const vw = getView(effect) as unknown as { system?: object; blocks?: object | null } | undefined;
  const own = vw && (TURNS.get(vw.blocks ?? {}) ?? TURNS.get(vw.system ?? {}));
  if (!own) return "";
  const rate = own.turn ?? own.speed ?? 0;
  if ("rotTime" in (vw!.system ?? {})) return own.on ? " · it rocks to and fro in the loop (its own tumble takes minutes to come round)" : "";
  if (!rate) return "";
  const n = Math.round((rate * duration()) / TAU);
  return n >= 1 ? ` · it turns ${n === 1 ? "once" : `${n} times`} round in the loop` : ` · it rocks to and fro in the loop (a whole turn takes ${Math.round(TAU / rate)} s: a loop of ${Math.ceil(Math.PI / rate)} s or more turns it round)`;
}

async function seekLoop(T: number, gen: number) {
  const { length: L, blend } = v().loop;
  const F = Math.min(blend, L / 2);
  // (a later round carries on from the last: it needs no fade)
  if (T >= F || take.base > 0) return mix(1);
  rngOf = takeB;
  if (!takeB.valid || T + L < takeB.t - 1e-6) {
    takeB.rng = take.seed;
    takeB.t = 0;
    unmount(effectB);
    const m = modelByName(v().model);
    mount(effectB, modelSpec(effectB), { root: effectB });
    takeB.valid = true;
  }
  const vb = await sceneReady(effectB);
  if (!vb || gen !== seekGen) return;
  if (takeB.t === 0) {
    loopTurn(vb, 0);
    vb.step(0);
  }
  while (takeB.t + SCRUB_DT <= T + L + 1e-6) {
    LOOP.t = takeB.t;
    loopTurn(vb, takeB.t + SCRUB_DT);
    vb.step(SCRUB_DT);
    takeB.t += SCRUB_DT;
  }
  vb.paint();
  vb.canvas.style.transition = "none";
  vb.canvas.style.opacity = "1";
  mix(T / F);
}

let seekGen = 0;
// the playhead: where the timeline is (the model steps to catch it up, a
// whole step at a time)
let playT = 0;
async function seek(T: number) {
  const gen = ++seekGen;
  T = playT = Math.max(0, Math.min(duration(), T));
  rngOf = take;
  seed(true);
  // the drawings: where the loop is (its light keeps clear of the ends)
  LOOP.length = duration();
  LOOP.start = Math.min(v().loop.blend, duration() / 2);
  try {
    if (!take.valid || take.base + T < take.t - 1e-6) {
      take.rng = take.seed;
      take.t = 0;
      take.base = 0;
      LOOP.t = 0;
      mountModel();
      take.valid = true;
    }
    const view = await sceneReady();
    // a newer seek took over while this one waited
    if (!view || gen !== seekGen) return;
    // a new take: its turn set for 0 s and one step of no time, so the first
    // frame is the loop's own
    if (take.t === 0) {
      loopTurn(view, 0);
      view.step(0);
      // (the status line says how it turns, now it's known)
      layout();
    }
    while (take.t + SCRUB_DT <= take.base + T + 1e-6) {
      LOOP.t = take.t;
      loopTurn(view, take.t + SCRUB_DT);
      view.step(SCRUB_DT);
      take.t += SCRUB_DT;
    }
    view.paint();
    showFrame();
    await seekLoop(T, gen);
  } finally {
    rngOf = take;
    if (gen === seekGen) {
      seed(false);
    }
  }
  drawTimeline();
}
// a dragged playhead asks many times a frame: seek once, to the latest
let seekTo = -1;
function requestSeek(T: number) {
  // (a video being made has the model to itself)
  if (exporting) return;
  if (seekTo < 0) requestAnimationFrame(() => {
    const t = seekTo;
    seekTo = -1;
    seek(t);
  });
  seekTo = T;
}

// --- the timeline: DialKit's dock under the preview, dark, stopping short
// of the panel's column (export.html). One clip, the model's motion, its
// length the timeline's; the dock's playhead is the time the model is
// stepped to. ---
const timelineConfig = (d: number) => ({ duration: d, motion: { at: 0, duration: d, from: { t: 0 }, to: { t: d }, transition: { type: "easing" as const, duration: d, ease: [0, 0, 1, 1] as [number, number, number, number] } } });
const timeline = createDialTimeline("Model", timelineConfig(duration()), { autoplay: true, loop: true });
createDialTimelineRoot({ theme: "dark", defaultOpen: true, defaultVisible: true });
timeline.subscribe((tv) => {
  if (exporting) return;
  playing = tv.playing;
  // come round while playing: the same take, carried on
  if (tv.playing && tv.time < playT - 1e-6 && playT > duration() - 0.5 && take.valid && take.t >= take.base + duration() - 3 * SCRUB_DT) take.base += duration();
  if (Math.abs(tv.time - playT) > 1e-6) requestSeek(tv.time);
}, false);
function setPlaying(p: boolean) {
  if (p) timeline.play();
  else timeline.pause();
}
function drawTimeline() {}

kit.subscribe((nv) => {
  const o = nv.output;
  if (!restoring && o.size !== last.size && SIZES[o.size]) {
    const [w, h] = SIZES[o.size];
    last = { ...last, size: o.size, w, h };
    kit.setValues({ output: { w, h }, placement: centred() });
    return;
  }
  if (!restoring && (o.w !== last.w || o.h !== last.h) && SIZES[o.size] && (SIZES[o.size][0] !== o.w || SIZES[o.size][1] !== o.h)) {
    last = { ...last, size: "Custom", w: o.w, h: o.h };
    kit.setValues({ output: { size: "Custom" } });
    return;
  }
  // a moving drawing's loop: whole rounds of it
  const snapped = snapLength(nv.loop.length, loopUnit(nv.model));
  if (Math.abs(snapped - nv.loop.length) > 1e-6) {
    kit.setValues({ loop: { length: snapped } });
    return;
  }
  // (a model colour, or a light ground with one: the model made again in it)
  const again = nv.model !== last.model || o.scale !== last.scale || o.modelColour !== last.ink || (o.modelColour !== "Auto" && lightOf(o) !== last.light);
  // the loop: the timeline its length, the copy ahead taken again
  const loop = JSON.stringify({ length: nv.loop.length, blend: nv.loop.blend });
  if (loop !== last.loop) {
    // (its light was kept clear of the old loop's ends)
    take.valid = false;
    dropLoop();
    timeline.updateConfig(timelineConfig(duration()) as never);
    requestSeek(Math.min(playT, duration()));
  }
  last = { model: nv.model, scale: o.scale, size: o.size, w: o.w, h: o.h, light: lightOf(o), ink: o.modelColour, loop };
  layout();
  if (again) remount();
  lightRail();
  if (!restoring) record();
}, false);
window.addEventListener("resize", layout);

// --- undo / redo: a step per settled change (a slider drag is one step) ---
const snap = () => {
  const val = v();
  // the dials' own values only, not the action buttons
  // (and the position pad's {x, y})
  const plain = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, x]) => typeof x !== "object" || (x !== null && "x" in x)));
  // and the model's own panel, with its style
  return JSON.stringify({ model: val.model, output: plain(val.output), placement: plain(val.placement), loop: plain(val.loop), panel: stylePanel ? { style: stylePanel.style, values: stylePanel.kit.values } : null });
};
const undos: string[] = [];
let redos: string[] = [];
let committed = snap();
let restoring = false;
let commitTimer = 0;
function commit() {
  clearTimeout(commitTimer);
  commitTimer = 0;
  const now = snap();
  if (now === committed) return;
  undos.push(committed);
  if (undos.length > 200) undos.shift();
  redos = [];
  committed = now;
}
function record() {
  clearTimeout(commitTimer);
  commitTimer = window.setTimeout(commit, 300);
}
function travel(from: string[], to: string[]) {
  if (commitTimer) commit();
  const s = from.pop();
  if (!s) return;
  to.push(committed);
  committed = s;
  restoring = true;
  const { panel, ...main } = JSON.parse(s);
  kit.setValues(main);
  // the model's panel once it's the right one (a model change swaps it)
  setTimeout(() => {
    const now = stylePanel;
    if (panel && now && now.style === panel.style) now.kit.setValues(panel.values);
    setTimeout(() => (restoring = false));
  });
}

// --- preview zoom and pan ---
function zoomAt(k: number, cx: number, cy: number) {
  const z = Math.min(16, Math.max(0.1, view.zoom * k));
  const st = stage.getBoundingClientRect();
  // keep the point under the cursor where it is
  const px = cx - (st.left + st.width / 2);
  const py = cy - (st.top + st.height / 2);
  const r = z / view.zoom;
  view.x = px - (px - view.x) * r;
  view.y = py - (py - view.y) * r;
  view.zoom = z;
  layout();
}
const zoomCentre = (k: number) => {
  const st = stage.getBoundingClientRect();
  zoomAt(k, st.left + st.width / 2, st.top + st.height / 2);
};
// ⌘/ctrl-scroll and trackpad pinch (a ctrl-wheel) zoom; plain scroll pans
stage.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
    else {
      view.x -= e.deltaX;
      view.y -= e.deltaY;
      layout();
    }
  },
  { passive: false },
);
const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
let space = false;
let panned = false;
window.addEventListener("keydown", (e) => {
  if (typing(e.target)) return;
  const mod = e.metaKey || e.ctrlKey;
  const key = e.key.toLowerCase();
  if (mod && key === "z") {
    e.preventDefault();
    if (e.shiftKey) travel(redos, undos);
    else travel(undos, redos);
  } else if (mod && key === "y") {
    e.preventDefault();
    travel(redos, undos);
  } else if (mod && (key === "=" || key === "+")) {
    e.preventDefault();
    zoomCentre(1.25);
  } else if (mod && key === "-") {
    e.preventDefault();
    zoomCentre(0.8);
  } else if (mod && key === "0") {
    e.preventDefault();
    Object.assign(view, { zoom: 1, x: 0, y: 0 });
    layout();
  } else if (e.code === "Space" && !e.repeat) {
    e.preventDefault();
    space = true;
    panned = false;
    stage.style.cursor = "grab";
  } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    // a frame (1/30 s), with shift a second
    e.preventDefault();
    setPlaying(false);
    timeline.seek(Math.max(0, Math.min(duration(), playT + (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 1 : 1 / 30))));
  } else if (e.key === "Home") {
    e.preventDefault();
    timeline.seek(0);
  }
});
window.addEventListener("keyup", (e) => {
  if (e.code !== "Space" || typing(e.target)) return;
  space = false;
  stage.style.cursor = "";
  // a tap plays or pauses; a hold that dragged was a pan
  if (!panned) setPlaying(!playing);
});
// space-drag (or the middle button) pans the preview
let pan: { x: number; y: number; vx: number; vy: number } | null = null;
stage.addEventListener(
  "pointerdown",
  (e) => {
    if (!(space || e.button === 1)) return;
    e.stopPropagation();
    e.preventDefault();
    pan = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    stage.setPointerCapture(e.pointerId);
  },
  true,
);
stage.addEventListener("pointermove", (e) => {
  if (!pan) return;
  panned = true;
  view.x = pan.vx + e.clientX - pan.x;
  view.y = pan.vy + e.clientY - pan.y;
  layout();
});
stage.addEventListener("pointerup", () => (pan = null));

// drag the frame to move the effect box (in frame px, whatever the preview scale)
let drag: { x: number; y: number; ex: number; ey: number; k: number } | null = null;
frame.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  const p = box().position;
  drag = { x: e.clientX, y: e.clientY, ex: p.x, ey: p.y, k: frame.getBoundingClientRect().width / out().w };
  frame.setPointerCapture(e.pointerId);
});
frame.addEventListener("pointermove", (e) => {
  if (!drag) return;
  // frame px to the pad's units (its edges the frame's)
  const o = out();
  const clamp1 = (n: number) => Math.max(-1, Math.min(1, n));
  const x = clamp1(drag.ex + ((e.clientX - drag.x) / drag.k / o.w) * 2);
  const y = clamp1(drag.ey - ((e.clientY - drag.y) / drag.k / o.h) * 2);
  kit.setValues({ placement: { position: { x, y } } });
});
frame.addEventListener("pointerup", () => (drag = null));

// the view's canvas holds the last frame at the export scale: draw it at the
// effect box's place on a frame-sized canvas, over the background colour
// draw the frame now onto c at k× (the model, mid-loop mixed with its copy
// ahead), over the background unless it's transparent (a video never is)
function compose(c: HTMLCanvasElement, k: number, opaque = false) {
  const view = getView(effect);
  if (!view) return false;
  const o = out();
  const ctx = c.getContext("2d")!;
  ctx.filter = "none";
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, c.width, c.height);
  if (opaque || !o.transparent) {
    ctx.fillStyle = groundOf(o);
    ctx.fillRect(0, 0, c.width, c.height);
  }
  const r = rect();
  let art: CanvasImageSource = view.canvas;
  const vb = getView(effectB);
  if (blendW < 1 && vb && vb.canvas.width === view.canvas.width) {
    // light added to light: a cross-fade of the two
    const mixed = document.createElement("canvas");
    mixed.width = view.canvas.width;
    mixed.height = view.canvas.height;
    const m = mixed.getContext("2d")!;
    m.globalAlpha = blendW;
    m.drawImage(view.canvas, 0, 0);
    m.globalCompositeOperation = "lighter";
    m.globalAlpha = 1 - blendW;
    m.drawImage(vb.canvas, 0, 0, mixed.width, mixed.height);
    art = mixed;
  }
  if (lightOf(o)) ctx.filter = "invert(1)";
  ctx.drawImage(art, r.left * k, r.top * k, r.w * k, r.h * k);
  ctx.filter = "none";
  return true;
}

function render(): Promise<Blob> {
  const o = out();
  const k = scale();
  const c = document.createElement("canvas");
  c.width = o.w * k;
  c.height = o.h * k;
  if (!compose(c, k)) return Promise.reject(new Error("no view"));
  return new Promise((ok, fail) => c.toBlob((blob) => (blob ? ok(blob) : fail(new Error("toBlob failed"))), "image/png"));
}

// Export video: the whole timeline from 0 s (the loop: its length, the last
// frame before it comes round), 60 fps, as an MP4 at the size picked. The
// model is drawn at the video's own scale for it (and back after).
const videoButton = progressButton(document.querySelector<HTMLElement>('#rail [data-act="video"]')!);
async function exportVideo() {
  if (exporting) return videoButton.stop();
  exporting = true;
  videoButton.start();
  const wasPlaying = playing;
  timeline.pause();
  const o = out();
  const k = videoScale(o.w, o.h, o.video as VideoSize);
  const c = document.createElement("canvas");
  c.width = Math.round((o.w * k) / 2) * 2;
  c.height = Math.round((o.h * k) / 2) * 2;
  const d = duration();
  const back = playT;
  let blob: Blob | null = null;
  try {
    videoK = k;
    take.valid = false;
    takeB.valid = false;
    await seek(0);
    blob = await encodeVideo(
      c,
      Math.round(d / SCRUB_DT),
      60,
      async (i) => {
        await seek(i * SCRUB_DT);
        compose(c, k, true);
      },
      (p, left) => videoButton.set(p, left),
      () => videoButton.stopped,
    );
  } catch (e) {
    console.error(e);
    videoButton.end("Couldn't export, see console");
  } finally {
    videoK = 0;
    exporting = false;
    playT = back;
    remount();
  }
  if (blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `clarify-${v().model.toLowerCase().replace(/\s+/g, "-")}-loop-${c.width}x${c.height}.mp4`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    videoButton.end(`Saved ${o.video} to Downloads ✓`);
  } else if (videoButton.stopped) videoButton.end("Stopped, nothing saved");
  timeline.seek(playT);
  if (wasPlaying) timeline.play();
}

// The clipboard takes the blob as a promise, so the write starts inside the
// click. Without a clipboard (plain http on the LAN) it downloads instead.
function copyPng() {
  const blob = render();
  const flash = (msg: string) => {
    hud.textContent = msg;
    setTimeout(layout, 2000);
  };
  const download = () =>
    blob.then((b) => {
      const o = out();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = `clarify-${v().model.toLowerCase().replace(/\s+/g, "-")}-${o.w}x${o.h}@${scale()}x.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      flash("no clipboard here: downloaded instead");
    });
  if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
    navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]).then(() => flash("copied to the clipboard"), download);
  } else download();
}

// SVG: the model as vectors (svg.ts), at the frame's size in px; pasted
// into Figma as SVG text it comes in as editable layers. Without a
// clipboard it downloads instead.
function svgText() {
  const view = getView(effect);
  if (!view) return "";
  const o = out();
  const r = rect();
  return viewToSvg(view, { w: o.w, h: o.h, left: r.left, top: r.top, background: o.transparent ? null : groundOf(o), invert: lightOf(o) });
}
function copySvg() {
  const svg = svgText();
  if (!svg) return;
  const flash = (msg: string) => {
    hud.textContent = msg;
    setTimeout(layout, 2000);
  };
  const download = () => {
    const o = out();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    a.download = `clarify-${v().model.toLowerCase().replace(/\s+/g, "-")}-${o.w}x${o.h}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    flash("no clipboard here: downloaded instead");
  };
  const kb = Math.round(svg.length / 1024);
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(svg).then(() => flash(`SVG copied (${kb} kB): paste into Figma`), download);
  else download();
}

// ?model=<name> opens that model, where the last one was
const asked = new URLSearchParams(location.search).get("model");
if (asked && MODELS.some((m) => m.name === asked)) {
  kit.setValues({ model: asked });
  last.model = asked;
  history.replaceState(null, "", location.pathname);
}
committed = snap();

layout();
remount();
lightRail();
(window as unknown as { lab: unknown }).lab = { kit, render, svgText, seek, setPlaying, take, timeline, panel: () => stylePanel?.kit };

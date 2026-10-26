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
import { LOOK } from "./drawings";
import { MODELS, STYLES, STYLE_DIALS, asMultipliers, modelByName, specFor, styleOverrides, type Style } from "./models";
import { viewToSvg } from "./svg";

const SIZES: Record<string, [number, number]> = {
  "LinkedIn banner (4:1)": [1584, 396],
  "LinkedIn company cover": [1128, 191],
  "LinkedIn post (1:1)": [1200, 1200],
  "Link preview (1.91:1)": [1200, 627],
  "X header (3:1)": [1500, 500],
  "1:1": [1080, 1080],
  "4:5": [1080, 1350],
  "3:4": [1080, 1440],
  "2:3": [1080, 1620],
  "9:16": [1080, 1920],
  "5:4": [1350, 1080],
  "4:3": [1440, 1080],
  "3:2": [1620, 1080],
  "16:9": [1920, 1080],
  "2:1": [2000, 1000],
  "21:9": [2520, 1080],
  "A4 landscape": [3508, 2480],
  "A4 portrait": [2480, 3508],
};
const MAX = 4000;

createDialRoot({ position: "top-right", theme: "dark" });

const kit = createDialKit(
  "Export",
  {
    // labelled with their style, in the gallery's order
    model: { type: "select", options: MODELS.map((m) => ({ value: m.name, label: `${STYLES.find(([st]) => st === m.style)![1]} · ${m.name}` })), default: MODELS[0].name },
    output: {
      size: { type: "select", options: [...Object.keys(SIZES), "Custom"], default: "LinkedIn banner (4:1)" },
      w: [1584, 16, MAX, 1],
      h: [396, 16, MAX, 1],
      // the PNG's pixels per frame px
      scale: [2, 1, 4, 1],
      // light: the model inverted, dark lines on Bone 100
      light: false,
      transparent: false,
      colour: { type: "color", default: "#060709" },
    },
    // the model fits a square box, so it never stretches. size: that box,
    // % of the frame's shorter side; position: its centre on the frame, the
    // pad's edges the frame's (drag the frame to move it too)
    placement: {
      size: [100, 10, 500, 1],
      position: { type: "pad", x: [0, -1, 1, 0.01], y: [0, -1, 1, 0.01] },
      centre: { type: "action", label: "Centre in frame" },
    },
    // a new take: new random choices (wirings, bolts), from 0 s
    take: { type: "action", label: "New take" },
    copySvg: { type: "action", label: "Copy SVG" },
    copy: { type: "action", label: "Copy PNG" },
  },
  // (a new id: the dials changed units, old saved values would read wrong)
  { id: "export-2", persist: true, onAction: (a: string) => actions[a]?.() },
);

type V = typeof kit.values;
const v = (): V => kit.values;
const out = () => v().output;
const box = () => v().placement;
const scale = () => out().scale;

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
  stylePanel = { style, kit: k };
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
  setExportScale(scale());
  const m = modelByName(v().model);
  showPanel(m.style);
  const sv = styleValues();
  // the drawings' electricity is read live by drawings.ts
  const dv = m.style === "drawing" ? (asMultipliers(sv) as { electricity: { brightness: number; speed: number; afterglow: number }; dots: { inner: number; outer: number } }) : null;
  Object.assign(
    LOOK,
    dv ? { gain: dv.electricity.brightness, speed: dv.electricity.speed, fade: dv.electricity.afterglow, dotInner: dv.dots.inner, dotOuter: dv.dots.outer } : { gain: 1, speed: 1, fade: 1, dotInner: 1, dotOuter: 1 },
  );
  mount(effect, specFor(effect, m, styleOverrides(m, sv)), { root: effect });
}

// a new model (or size, or dots) at the same moment
function remount() {
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
  frame.style.background = o.transparent ? "transparent" : o.colour;
  effect.style.filter = o.light ? "invert(1)" : "none";
  // the page behind goes light too, so a transparent frame shows the model
  document.body.classList.toggle("light", o.light);
  Object.assign(effect.style, {
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
    (big > maxPx ? `the box at ${k}× is ${big} px, over this GPU's ${maxPx}: make it smaller or lower the scale` : `preview ${Math.round(fit * 100)}% (⌘0 fits)`);
}

const actions: Record<string, () => void> = {
  "placement.centre": () => kit.setValues({ placement: centred() }),
  take: () => {
    take.seed = (take.seed * 9301 + 49297) % 233280;
    take.valid = false;
    timeline.seek(0);
    seek(0);
  },
  copy: () => copyPng(),
  copySvg: () => copySvg(),
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
function lightRail() {
  for (const a of list.querySelectorAll<HTMLElement>("a")) a.classList.toggle("on", a.dataset.model === v().model);
  requestAnimationFrame(() => list.querySelector(".on")?.scrollIntoView({ block: "center" }));
}
for (const b of document.querySelectorAll<HTMLElement>("#rail [data-act]")) b.onclick = () => actions[b.dataset.act!]();

// react to the dials: a named size sets the frame, a typed one switches the
// size to Custom; a new frame starts centred, a new model keeps the
// placement (size and position)
let last = { model: v().model, scale: out().scale, size: out().size, w: out().w, h: out().h, light: out().light };
// --- time: the lab plays the model itself, a fixed step at a time, the
// engine's own loop stopped. Random choices (wirings, bolts, timings) come
// from a seeded generator while it steps, so a moment always looks the same
// within a take, played or scrubbed to; forward only steps the difference,
// back starts again from 0. ---
setPaused(true);
const DURATION = 30;
const take = { seed: 1, valid: false, t: 0, rng: 1 };
let playing = true;
const SCRUB_DT = 1 / 60;
// the seeded generator stays in for the whole seek: a lazily loaded scene
// makes its random choices when it arrives, a frame or two after mounting
const realRandom = Math.random;
function seed(on: boolean) {
  Math.random = on
    ? () => {
        // mulberry32
        let x = (take.rng = (take.rng + 0x6d2b79f5) | 0);
        x = Math.imul(x ^ (x >>> 15), x | 1);
        x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
      }
    : realRandom;
}
// the blocks and drawings load their scene a moment after mounting
async function sceneReady() {
  for (let i = 0; i < 120; i++) {
    const view = getView(effect);
    if (view && view.scene.children.some((c) => c.children.length > 0 || (c as { isMesh?: boolean }).isMesh || (c as { isPoints?: boolean }).isPoints)) return view;
    await new Promise((r) => requestAnimationFrame(r));
  }
  return getView(effect);
}
let seekGen = 0;
// the playhead: where the timeline is (the model steps to catch it up, a
// whole step at a time)
let playT = 0;
async function seek(T: number) {
  const gen = ++seekGen;
  T = playT = Math.max(0, Math.min(DURATION, T));
  seed(true);
  try {
    if (!take.valid || T < take.t - 1e-6) {
      take.rng = take.seed;
      take.t = 0;
      mountModel();
      take.valid = true;
    }
    const view = await sceneReady();
    // a newer seek took over while this one waited
    if (!view || gen !== seekGen) return;
    while (take.t + SCRUB_DT <= T + 1e-6) {
      view.step(SCRUB_DT);
      take.t += SCRUB_DT;
    }
    view.paint();
    showFrame();
  } finally {
    if (gen === seekGen) {
      seed(false);
    }
  }
  drawTimeline();
}
// a dragged playhead asks many times a frame: seek once, to the latest
let seekTo = -1;
function requestSeek(T: number) {
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
const timeline = createDialTimeline(
  "Model",
  { duration: DURATION, motion: { at: 0, duration: DURATION, from: { t: 0 }, to: { t: DURATION }, transition: { type: "easing", duration: DURATION, ease: [0, 0, 1, 1] } } },
  { autoplay: true, loop: true },
);
createDialTimelineRoot({ theme: "dark", defaultOpen: true, defaultVisible: true });
timeline.subscribe((tv) => {
  playing = tv.playing;
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
  const again = nv.model !== last.model || o.scale !== last.scale;
  // a new mode takes its own background (changed after, it stays)
  if (!restoring && o.light !== last.light) {
    last = { ...last, light: o.light };
    kit.setValues({ output: { colour: o.light ? "#f4f7fa" : "#060709" } });
    return;
  }
  last = { model: nv.model, scale: o.scale, size: o.size, w: o.w, h: o.h, light: o.light };
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
  return JSON.stringify({ model: val.model, output: plain(val.output), placement: plain(val.placement), panel: stylePanel ? { style: stylePanel.style, values: stylePanel.kit.values } : null });
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
    timeline.seek(Math.max(0, Math.min(DURATION, playT + (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 1 : 1 / 30))));
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
function render(): Promise<Blob> {
  const view = getView(effect);
  if (!view) return Promise.reject(new Error("no view"));
  const o = out();
  const k = scale();
  const c = document.createElement("canvas");
  c.width = o.w * k;
  c.height = o.h * k;
  const ctx = c.getContext("2d")!;
  if (!o.transparent) {
    ctx.fillStyle = o.colour;
    ctx.fillRect(0, 0, c.width, c.height);
  }
  const r = rect();
  if (o.light) ctx.filter = "invert(1)";
  ctx.drawImage(view.canvas, r.left * k, r.top * k, r.w * k, r.h * k);
  return new Promise((ok, fail) => c.toBlob((blob) => (blob ? ok(blob) : fail(new Error("toBlob failed"))), "image/png"));
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
  return viewToSvg(view, { w: o.w, h: o.h, left: r.left, top: r.top, background: o.transparent ? null : o.colour, invert: o.light });
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

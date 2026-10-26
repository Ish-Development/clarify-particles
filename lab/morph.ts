// Morph lab: a few models of one family played one into the next, timed on
// DialKit's timeline (a clip per model: it starts morphing in at the clip's
// start and holds to the next one; drag a clip to retime it, its edges to
// lengthen it). The families that morph: the dots (the hero's holdShape, one
// shape to the next) and the blocks and lines (the Integrations scene's
// shapes, in turn). Played and scrubbed as the export lab plays a model: a
// fixed step at a time from 0 s, its random choices seeded. Copy a frame as a
// PNG or SVG, or record the whole timeline as a video.
// Not part of the build; with the lab's dev server open /lab/morph.html.
import { createDialKit, createDialRoot, createDialTimeline, createDialTimelineRoot } from "dialkit/vanilla";
import "dialkit/vanilla/styles.css";
import { getView, mount, setExportScale, setPaused, unmount } from "../src/runtime/engine";
import { MODELS, STYLES, STYLE_DIALS, modelByName, specFor, styleOverrides, type Model } from "./models";
import { SIZES } from "./sizes";
import { viewToSvg } from "./svg";

type Family = "dots" | "blocks";
const familyOf = (m: Model): Family | null => (m.style === "dots" ? "dots" : m.style === "blocks" || m.style === "lines" ? "blocks" : null);
const split = (s: unknown) =>
  String(s ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
// the engine's name for a model's shape (a dot shape, or a block or line shape)
const shapeOf = (m: Model) => (m.style === "dots" ? String(m.config.sequence || m.config.shape) : split(m.config.shapes)[0]);

const frame = document.getElementById("frame")!;
const effect = document.getElementById("effect")!;
const stage = document.getElementById("stage")!;
const hud = document.getElementById("hud")!;
const empty = document.getElementById("empty")!;

// --- the sequence: model names in the order they were added (they play in
// their clips' order); kept in this browser ---
const SEQ_KEY = "clarify-morph-lab-sequence";
const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private window: not kept */
    }
  },
};
const known = (n: string) => MODELS.some((m) => m.name === n && familyOf(m));
let seq: string[] = (() => {
  try {
    const s = JSON.parse(store.get(SEQ_KEY) ?? "null");
    if (Array.isArray(s)) return s.filter((n) => typeof n === "string" && known(n));
  } catch {
    /* none kept */
  }
  return ["Block cube", "Line globe", "Line torus"].filter(known);
})();
const family = (): Family | null => (seq.length ? familyOf(modelByName(seq[0])) : null);
// a clip's key on the timeline: the model's name, numbered when it's in twice
const keys = () => seq.map((n, i) => (seq.slice(0, i).includes(n) ? `${n} ${seq.slice(0, i).filter((x) => x === n).length + 1}` : n));

// --- the panel ---
createDialRoot({ position: "top-right", theme: "dark" });
const MAX = 4000;
const kit = createDialKit(
  "Morph",
  {
    output: {
      size: { type: "select", options: [...Object.keys(SIZES), "Custom"], default: "16:9" },
      w: [1920, 16, MAX, 1],
      h: [1080, 16, MAX, 1],
      // pixels per frame px (a video stops at 4K wide)
      scale: [1, 1, 4, 1],
      light: false,
      transparent: false,
      colour: { type: "color", default: "#060709" },
    },
    placement: {
      size: [100, 10, 500, 1],
      position: { type: "pad", x: [0, -1, 1, 0.01], y: [0, -1, 1, 0.01] },
      centre: { type: "action", label: "Centre in frame" },
    },
    // what a new sequence's clips get: s each model holds, and s each morph
    // takes (a clip shorter than that morphs for its whole length)
    timing: {
      hold: [2.5, 0.5, 10, 0.1],
      morph: [1.5, 0.2, 6, 0.1],
      even: { type: "action", label: "Space clips evenly" },
    },
    take: { type: "action", label: "New take" },
    copySvg: { type: "action", label: "Copy SVG" },
  },
  { id: "morph-1", persist: true, onAction: (a: string) => actions[a]?.() },
);
const v = () => kit.values;
const out = () => v().output;

// the family's look (the export lab's dials for its style)
let stylePanel: { family: Family; kit: ReturnType<typeof createDialKit> } | null = null;
let styleTimer = 0;
function showPanel(f: Family | null) {
  if (stylePanel?.family === f) return;
  stylePanel?.kit.destroy();
  stylePanel = null;
  if (!f) return;
  const dials = f === "dots" ? STYLE_DIALS.dots : STYLE_DIALS.blocks;
  const k = createDialKit(f === "dots" ? "Dots" : "Blocks and lines", dials as never, { id: `morph-${f}`, persist: true });
  stylePanel = { family: f, kit: k };
  k.subscribe(() => {
    clearTimeout(styleTimer);
    styleTimer = window.setTimeout(() => invalidate(), 150);
  }, false);
}

// --- the frame ---
const rect = () => {
  const o = out();
  const b = v().placement;
  const w = Math.round((Math.min(o.w, o.h) * b.size) / 100);
  const p = b.position;
  return { w, h: w, left: Math.round(((1 + p.x) * o.w) / 2 - w / 2), top: Math.round(((1 - p.y) * o.h) / 2 - w / 2) };
};
function layout() {
  const o = out();
  const r = rect();
  document.documentElement.style.setProperty("--frame-aspect", String(Math.min(3, Math.max(0.75, o.w / o.h))));
  frame.style.width = `${o.w}px`;
  frame.style.height = `${o.h}px`;
  frame.style.background = o.transparent ? "transparent" : o.colour;
  effect.style.filter = o.light ? "invert(1)" : "none";
  document.body.classList.toggle("light", o.light);
  Object.assign(effect.style, { width: `${r.w}px`, height: `${r.h}px`, left: `${r.left}px`, top: `${r.top}px` });
  const st = stage.getBoundingClientRect();
  const fit = Math.min(1, (st.width - 48) / o.w, (st.height - 48) / o.h);
  frame.style.transform = `translate(-50%, -50%) scale(${fit})`;
  empty.style.display = seq.length ? "none" : "";
  frame.style.visibility = seq.length ? "" : "hidden";
  if (!recording) hud.textContent = `output ${o.w * out().scale} × ${o.h * out().scale} px · ${seq.length < 2 ? "add a second model to morph" : "drag the clips below to retime"}`;
}

// --- time: as the export lab, the lab steps the model itself, seeded ---
setPaused(true);
const DT = 1 / 60;
const take = { seed: 1, valid: false, t: 0, rng: 1, clips: "" };
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
async function sceneReady() {
  for (let i = 0; i < 120; i++) {
    const view = getView(effect);
    if (view && view.scene.children.some((c) => c.children.length > 0 || (c as { isMesh?: boolean }).isMesh || (c as { isPoints?: boolean }).isPoints)) return view;
    await new Promise((r) => requestAnimationFrame(r));
  }
  return getView(effect);
}

// the clips, in time order: which model, from when, how long
type Clip = { name: string; at: number; dur: number };
function clips(): Clip[] {
  if (!timeline) return [];
  const tv = timeline.values as unknown as Record<string, { at: number; duration: number }>;
  return keys()
    .map((k, i) => ({ name: seq[i], at: tv[k]?.at ?? 0, dur: tv[k]?.duration ?? 1 }))
    .sort((a, b) => a.at - b.at);
}

// the model mounted for a take: the first clip's, with every clip's shape
// (blocks: in time order, as the scene morphs through them in turn)
let plan: { family: Family; shapes: string[]; clips: Clip[] } | null = null;
function mountTake() {
  unmount(effect);
  plan = null;
  const f = family();
  const cs = clips();
  if (!f || !cs.length) return;
  setExportScale(out().scale);
  const first = modelByName(cs[0].name);
  const shapes = cs.map((c) => shapeOf(modelByName(c.name)));
  const look = styleOverrides(first, stylePanel?.kit.values);
  const extra =
    f === "dots"
      ? { ...look, sequence: "", shape: shapes[0], holdShape: shapes[0] }
      : // held until the lab says (drive), no bolt between morphs
        { ...look, shapes: shapes.join(","), holdTime: 1e9 };
  mount(effect, specFor(effect, first, extra), { root: effect });
  plan = { family: f, shapes, clips: cs };
}

// before each step: the clip under the playhead, and its morph started
const baseStagger = { value: 0.6 };
function drive(view: ReturnType<typeof getView>, t: number) {
  if (!view || !plan) return;
  const cs = plan.clips;
  let k = 0;
  for (let i = 0; i < cs.length; i++) if (cs[i].at <= t + 1e-9) k = i;
  const morph = Math.max(0.2, Math.min(v().timing.morph, cs[k].dur));
  const cfg = (view as unknown as { cfg: Record<string, unknown> }).cfg;
  if (plan.family === "dots") {
    if (cfg.holdShape !== plan.shapes[k]) {
      cfg.morphTime = morph;
      cfg.holdShape = plan.shapes[k];
    }
    return;
  }
  // the blocks scene morphs to its next shape once its hold is up: the lab
  // ends the hold when the next clip starts (lab only: it reads the scene's
  // own place in the list)
  const b = (view as unknown as { blocks: { shape: number; morphing: boolean } | null }).blocks;
  if (!b) return;
  if (!b.morphing && b.shape < k) {
    cfg.stagger = Math.min(baseStagger.value, morph * 0.4);
    cfg.morphTime = morph - (cfg.stagger as number);
    cfg.holdTime = 0;
  } else cfg.holdTime = 1e9;
}

let seekGen = 0;
let playT = 0;
async function seek(T: number) {
  const gen = ++seekGen;
  const dur = duration();
  T = playT = Math.max(0, Math.min(dur, T));
  seed(true);
  try {
    const now = JSON.stringify(clips());
    if (!take.valid || T < take.t - 1e-6 || now !== take.clips) {
      take.rng = take.seed;
      take.t = 0;
      take.clips = now;
      mountTake();
      take.valid = true;
    }
    if (!plan) return;
    const view = await sceneReady();
    if (!view || gen !== seekGen) return;
    if (plan.family === "blocks") baseStagger.value = Number((view as unknown as { cfg: { stagger: number } }).cfg.stagger) || 0.6;
    while (take.t + DT <= T + 1e-6) {
      drive(view, take.t);
      view.step(DT);
      take.t += DT;
    }
    view.paint();
  } finally {
    if (gen === seekGen) seed(false);
  }
}
let seekTo = -1;
function requestSeek(T: number) {
  if (seekTo < 0)
    requestAnimationFrame(() => {
      const t = seekTo;
      seekTo = -1;
      // a recording steps the model itself
      if (!recording) seek(t);
    });
  seekTo = T;
}
function invalidate() {
  take.valid = false;
  seek(playT);
}

// --- the timeline: a clip per model, rebuilt when the sequence changes (its
// id names the sequence, so each one keeps its own timing) ---
let timeline: ReturnType<typeof createDialTimeline> | null = null;
let playing = true;
let spacing = Number(store.get("clarify-morph-lab-spacing") ?? 0) || 0;
const duration = () => (timeline ? Math.max(1, timeline.values.duration) : 1);
function buildTimeline() {
  timeline?.destroy();
  timeline = null;
  showPanel(family());
  renderRail();
  layout();
  if (!seq.length) {
    unmount(effect);
    plan = null;
    return;
  }
  const { hold, morph } = v().timing;
  const span = hold + morph;
  const config: Record<string, unknown> = { duration: Math.round(seq.length * span * 10) / 10 };
  keys().forEach((k, i) => {
    config[k] = { at: Math.round(i * span * 10) / 10, duration: span, from: { p: 0 }, to: { p: 1 }, transition: { type: "easing", duration: span, ease: [0, 0, 1, 1] } };
  });
  const id = `morph-${spacing}-${keys().join("|")}`;
  timeline = createDialTimeline("Morph", config as never, { id, persist: true, autoplay: playing, loop: true });
  timeline.subscribe((tv) => {
    if (recording) return;
    playing = tv.playing;
    // a clip moved: the take starts again, at the same moment
    if (JSON.stringify(clips()) !== take.clips) {
      renderRail();
      invalidate();
    } else if (Math.abs(tv.time - playT) > 1e-6) requestSeek(tv.time);
  }, false);
  take.valid = false;
  seek(0);
}
const dock = createDialTimelineRoot({ theme: "dark", defaultOpen: true, defaultVisible: true });
// the dock grows a row per clip: the preview keeps clear of it
new ResizeObserver(() => {
  const h = (dock.element.querySelector(".dialkit-timeline") ?? dock.element).getBoundingClientRect().height;
  document.documentElement.style.setProperty("--dock", `${Math.round(h) || 132}px`);
  layout();
}).observe(dock.element);

// --- the rail: the sequence in play order, and the models that can join ---
const seqList = document.getElementById("seq")!;
const seqNote = document.getElementById("seq-note")!;
const list = document.getElementById("list")!;
function setSeq(next: string[]) {
  seq = next;
  store.set(SEQ_KEY, JSON.stringify(seq));
  buildTimeline();
}
function renderRail() {
  seqList.textContent = "";
  const ks = keys();
  const order = clips().length === seq.length ? clips().map((c) => c.name) : seq;
  // the rail lists them in play order; × takes that one out
  const used = new Map<string, number>();
  for (const name of order) {
    const n = used.get(name) ?? 0;
    used.set(name, n + 1);
    const idx = seq.findIndex((s, i) => s === name && seq.slice(0, i).filter((x) => x === name).length === n);
    const li = document.createElement("li");
    li.innerHTML = `<span></span><button title="Remove">×</button>`;
    li.querySelector("span")!.textContent = ks[idx];
    li.querySelector("button")!.onclick = () => setSeq(seq.filter((_, i) => i !== idx));
    seqList.append(li);
  }
  seqNote.textContent = !seq.length ? "Empty. Add models below." : seq.length < 2 ? "Add one more to morph." : "";
  const f = family();
  for (const a of list.querySelectorAll<HTMLElement>("a")) a.classList.toggle("off", !!f && familyOf(modelByName(a.dataset.model!)) !== f);
}
STYLES.forEach(([style, title], i) => {
  const models = MODELS.filter((m) => m.style === style && familyOf(m));
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
    a.title = "Add to the sequence";
    a.onclick = () => setSeq([...seq, m.name]);
    list.append(a);
  }
});
const note = document.createElement("p");
note.className = "eyebrow";
note.style.cssText = "padding: 16px 24px 0; text-transform: none; line-height: 1.5";
note.textContent = "Dots morph with dots; blocks and lines with each other. Networks and flat drawings don't morph yet.";
list.append(note);

// --- actions ---
const actions: Record<string, () => void> = {
  "placement.centre": () => kit.setValues({ placement: { size: 100, position: { x: 0, y: 0 } } }),
  "timing.even": () => {
    spacing += 1;
    store.set("clarify-morph-lab-spacing", String(spacing));
    buildTimeline();
  },
  take: () => {
    take.seed = (take.seed * 9301 + 49297) % 233280;
    invalidate();
  },
  copy: () => copyPng(),
  copySvg: () => copySvg(),
  record: () => record(),
};
for (const b of document.querySelectorAll<HTMLElement>("#rail [data-act]")) b.onclick = () => actions[b.dataset.act!]();

let last = { size: out().size, w: out().w, h: out().h, light: out().light, scale: out().scale };
kit.subscribe((nv) => {
  const o = nv.output;
  if (o.size !== last.size && SIZES[o.size]) {
    const [w, h] = SIZES[o.size];
    last = { ...last, size: o.size, w, h };
    kit.setValues({ output: { w, h } });
    return;
  }
  if ((o.w !== last.w || o.h !== last.h) && SIZES[o.size] && (SIZES[o.size][0] !== o.w || SIZES[o.size][1] !== o.h)) {
    last = { ...last, size: "Custom", w: o.w, h: o.h };
    kit.setValues({ output: { size: "Custom" } });
    return;
  }
  if (o.light !== last.light) {
    last = { ...last, light: o.light };
    kit.setValues({ output: { colour: o.light ? "#f4f7fa" : "#060709" } });
    return;
  }
  const rescale = o.scale !== last.scale;
  last = { size: o.size, w: o.w, h: o.h, light: o.light, scale: o.scale };
  layout();
  if (rescale) invalidate();
}, false);
window.addEventListener("resize", layout);

// drag the frame to move the model
let drag: { x: number; y: number; ex: number; ey: number; k: number } | null = null;
frame.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  const p = v().placement.position;
  drag = { x: e.clientX, y: e.clientY, ex: p.x, ey: p.y, k: frame.getBoundingClientRect().width / out().w };
  frame.setPointerCapture(e.pointerId);
});
frame.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const o = out();
  const clamp1 = (n: number) => Math.max(-1, Math.min(1, n));
  const x = clamp1(drag.ex + ((e.clientX - drag.x) / drag.k / o.w) * 2);
  const y = clamp1(drag.ey - ((e.clientY - drag.y) / drag.k / o.h) * 2);
  kit.setValues({ placement: { position: { x, y } } });
});
frame.addEventListener("pointerup", () => (drag = null));

// space plays and pauses, ← → step a frame (with shift a second), Home to 0
const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
window.addEventListener("keydown", (e) => {
  if (typing(e.target) || !timeline || recording) return;
  if (e.code === "Space") {
    e.preventDefault();
    if (!e.repeat) {
      if (playing) timeline.pause();
      else timeline.play();
    }
  } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    e.preventDefault();
    timeline.pause();
    timeline.seek(Math.max(0, Math.min(duration(), playT + (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 1 : 1 / 30))));
  } else if (e.key === "Home") {
    e.preventDefault();
    timeline.seek(0);
  }
});

// --- output: the frame now (PNG, SVG), or the whole timeline (video) ---
// the view's canvas, drawn at the effect box's place on a frame-sized canvas
function compose(c: HTMLCanvasElement, k: number, opaque: boolean) {
  const view = getView(effect);
  const o = out();
  const ctx = c.getContext("2d")!;
  ctx.filter = "none";
  ctx.clearRect(0, 0, c.width, c.height);
  if (opaque || !o.transparent) {
    ctx.fillStyle = o.colour;
    ctx.fillRect(0, 0, c.width, c.height);
  }
  if (!view) return;
  const r = rect();
  if (o.light) ctx.filter = "invert(1)";
  ctx.drawImage(view.canvas, r.left * k, r.top * k, r.w * k, r.h * k);
}
const fileName = (ext: string) => `clarify-morph-${seq.map((n) => n.toLowerCase().replace(/\s+/g, "-")).join("-to-")}-${out().w}x${out().h}.${ext}`;
function flash(msg: string) {
  hud.textContent = msg;
  setTimeout(layout, 2500);
}
function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function copyPng() {
  const o = out();
  const k = o.scale;
  const c = document.createElement("canvas");
  c.width = o.w * k;
  c.height = o.h * k;
  compose(c, k, false);
  const blob = new Promise<Blob>((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error("toBlob failed"))), "image/png"));
  const fallback = () => blob.then((b) => (download(b, fileName("png")), flash("no clipboard here: downloaded instead")));
  if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]).then(() => flash("copied to the clipboard"), fallback);
  else fallback();
}
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
  const fallback = () => (download(new Blob([svg], { type: "image/svg+xml" }), fileName("svg")), flash("no clipboard here: downloaded instead"));
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(svg).then(() => flash(`SVG copied (${Math.round(svg.length / 1024)} kB): paste into Figma`), fallback);
  else fallback();
}

// A video of the whole timeline, from 0 s, at 60 fps: the lab steps and draws
// each frame and hands it to the recorder in time (MP4 where the browser
// records it, else WebM). Always on the background colour.
let recording = false;
async function record() {
  if (recording || !timeline || !plan) return;
  recording = true;
  const wasPlaying = playing;
  timeline.pause();
  const o = out();
  // at most 4K wide, and even sides for the encoder
  const k = Math.min(o.scale, 3840 / Math.max(o.w, o.h));
  const c = document.createElement("canvas");
  c.width = Math.round((o.w * k) / 2) * 2;
  c.height = Math.round((o.h * k) / 2) * 2;
  const types = ["video/mp4;codecs=avc1.640033", "video/mp4", "video/webm;codecs=vp9", "video/webm"];
  const mimeType = types.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
  const stream = c.captureStream(0);
  const track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
  const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 24_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((r) => (rec.onstop = () => r()));
  await seek(0);
  const view = getView(effect);
  rec.start();
  const dur = duration();
  const frames = Math.round(dur / DT);
  const t0 = performance.now();
  seed(true);
  try {
    for (let i = 0; i <= frames; i++) {
      if (i > 0 && view) {
        drive(view, take.t);
        view.step(DT);
        take.t += DT;
        view.paint();
      }
      compose(c, k, true);
      track.requestFrame?.();
      if (i % 30 === 0) hud.textContent = `recording ${Math.round((i / frames) * 100)}%`;
      // in time: the recorder stamps frames as they come
      const due = t0 + (i + 1) * DT * 1000;
      seed(false);
      await new Promise((r) => setTimeout(r, Math.max(0, due - performance.now())));
      seed(true);
    }
  } finally {
    seed(false);
  }
  rec.stop();
  await done;
  playT = take.t;
  download(new Blob(chunks, { type: mimeType || "video/webm" }), fileName(mimeType.includes("mp4") ? "mp4" : "webm"));
  recording = false;
  flash(`video saved (${(dur).toFixed(1)} s, ${c.width} × ${c.height})`);
  timeline.seek(playT);
  if (wasPlaying) timeline.play();
}

buildTimeline();
(window as unknown as { lab: unknown }).lab = { kit, seek, clips, timeline: () => timeline, setSeq, record, copySvg: svgText };

// Morph lab: a few models of one family played one into the next, timed on
// DialKit's timeline (a clip per model: it starts morphing in at the clip's
// start and holds to the next one; drag a clip to retime it, its edges to
// lengthen it). The families that morph: the dots (the hero's holdShape, one
// shape to the next) and the blocks and lines (the Integrations scene's
// shapes, in turn). Played and scrubbed as the export lab plays a model: a
// fixed step at a time from 0 s, its random choices seeded. Copy a frame as a
// PNG or SVG, or record the whole timeline as a video. ⌘Z / ⇧⌘Z undo and redo
// it all: the sequence, the clips' timing and the dials.
// Not part of the build; with the lab's dev server open /lab/morph.html.
import { DialStore, TimelineStore, createDialKit, createDialRoot, createDialTimeline, createDialTimelineRoot } from "dialkit/vanilla";
import "dialkit/vanilla/styles.css";
import { getView, mount, setExportScale, setPaused, unmount } from "../src/runtime/engine";
import { MODELS, STYLES, STYLE_DIALS, tidy, modelByName, specFor, styleOverrides, type Model } from "./models";
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
// a clip's key on the timeline: its slot (the model in it can change, from
// the clip's own popover), and its label: the model's name, numbered when
// it's in twice
const keys = () => seq.map((_, i) => `clip${i + 1}`);
const labels = () => seq.map((n, i) => (seq.slice(0, i).includes(n) ? `${n} ${seq.slice(0, i).filter((x) => x === n).length + 1}` : n));

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
    // length: the whole video's, s (drag it to stretch or squeeze every clip
    // together). hold + morph: a new sequence's clip, s each; morph: how long
    // each morph takes (a clip shorter than that morphs for its whole length)
    timing: {
      // the video's length: every clip longer or shorter together
      length: [12, 1, 120, 0.1],
      loop: true,
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
// Loop came in off; it's on now unless turned off since (once per browser)
if (!store.get("clarify-morph-lab-loop-default")) {
  kit.setValues({ timing: { loop: true } } as never);
  store.set("clarify-morph-lab-loop-default", "1");
}
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
  k.setValues(tidy(k.values) as never);
  stylePanel = { family: f, kit: k };
  k.subscribe(() => {
    clearTimeout(styleTimer);
    styleTimer = window.setTimeout(() => invalidate(), 150);
    record();
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
  if (!recording) hud.textContent = `output ${o.w * out().scale} × ${o.h * out().scale} px · ${seq.length < 2 ? "add a second model to morph" : "drag the clips below to retime"}${loopTail() ? ` · loops: back to ${clips()[0]?.name ?? seq[0]} by ${duration().toFixed(1)} s` : ""}`;
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
// look: a blocks or lines clip's own mix, % of the panel's (from its popover;
// dots: their size)
type Look = { lines: number; insideLines: number; farSide: number; dots: number };
const LOOK_KEYS = ["lines", "insideLines", "farSide", "dots"] as const;
const PLAIN: Look = { lines: 100, insideLines: 100, farSide: 100, dots: 100 };
type Clip = { name: string; at: number; dur: number; look: Look };
type ClipValues = Record<string, { at: number; duration: number; to?: Partial<Look> & { model?: string } }>;
const pick = (to: Partial<Look> | undefined): Partial<Look> => Object.fromEntries(LOOK_KEYS.filter((n) => typeof to?.[n] === "number").map((n) => [n, to![n]]));
function clips(): Clip[] {
  if (!timeline) return [];
  const tv = timeline.values as unknown as ClipValues;
  return keys()
    .map((k, i) => ({ name: seq[i], at: tv[k]?.at ?? 0, dur: tv[k]?.duration ?? 1, look: { ...PLAIN, ...pick(tv[k]?.to) } }))
    .sort((a, b) => a.at - b.at);
}

// the model mounted for a take: the first clip's, with every clip's shape
// (blocks: in time order, as the scene morphs through them in turn)
// (clocks: the scene's turn and spin at 0 s, and where they were when the
// loop's morph back began)
type Clocks = Record<string, number>;
let plan: { family: Family; shapes: string[]; clips: Clip[]; started: number; start: Clocks | null; tail: Clocks | null; base: Clocks | null } | null = null;
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
  plan = { family: f, shapes, clips: cs, started: 0, start: null, tail: null, base: null };
}

// before each step: the clip under the playhead, and its morph started (the
// Morph dial long, or the clip if it's shorter)
const baseStagger = { value: 0.6 };
function drive(view: ReturnType<typeof getView>, t: number) {
  if (!view || !plan) return;
  const cs = plan.clips;
  let k = 0;
  for (let i = 0; i < cs.length; i++) if (cs[i].at <= t + 1e-9) k = i;
  let morph = Math.max(0.2, Math.min(v().timing.morph, cs[k].dur));
  // Loop: past the last clip, the morph back to the first (index L: the
  // blocks go round their list to 0)
  const end = cs[cs.length - 1].at + cs[cs.length - 1].dur;
  if (loopTail() && t >= end - 1e-9) {
    k = cs.length;
    morph = loopTail();
  }
  turnBack(view, t, end);
  const cfg = (view as unknown as { cfg: Record<string, unknown> }).cfg;
  if (plan.family === "dots") {
    if (cfg.holdShape !== plan.shapes[k % plan.shapes.length]) {
      cfg.morphTime = morph;
      cfg.holdShape = plan.shapes[k % plan.shapes.length];
    }
    return;
  }
  // the blocks scene morphs to its next shape once its hold is up: the lab
  // ends the hold when the next clip starts (lab only: it reads whether the
  // scene is mid-morph)
  // (counted by the morphs the lab started: the scene's own index wraps)
  const b = (view as unknown as { blocks: { morphing: boolean } | null }).blocks;
  if (!b) return;
  mixLive(view, k, t, morph);
  if (!b.morphing && plan.started < k) {
    cfg.stagger = Math.min(baseStagger.value, morph * 0.4);
    cfg.morphTime = morph - (cfg.stagger as number);
    cfg.holdTime = 0;
    plan.started++;
  } else cfg.holdTime = 1e9;
}

// A clip's inside lines: the scene keeps, per shape, how bright each node and
// line draws (1 outside, `inner` inside, 0 a ghost), and blends them through a
// morph; the lab scales each shape's inside ones by its clip's mix (lab only)
function mixInside(view: NonNullable<ReturnType<typeof getView>>) {
  const p = plan!;
  const b = (view as unknown as { blocks: { real: Float32Array[]; lines: { in: Float32Array }[]; nodeMat: { uniforms: { uSize: { value: number } } } } | null }).blocks;
  const cfg = (view as unknown as { cfg: Record<string, number> }).cfg;
  if (!b) return;
  p.base = { lineOpacity: cfg.lineOpacity, nodeOpacity: cfg.nodeOpacity, backDim: cfg.backDim, dotSize: b.nodeMat.uniforms.uSize.value };
  const inner = cfg.inner;
  if (!(inner > 0 && inner < 1)) return;
  const to = (s: number) => Math.min(1, (inner * p.clips[s].look.insideLines) / 100);
  const fix = (arr: Float32Array, i: number, v: number) => {
    if (Math.abs(arr[i] - inner) < 1e-6) arr[i] = v;
  };
  p.clips.forEach((_, s) => {
    const v = to(s);
    const real = b.real[s];
    if (real) for (let i = 0; i < real.length; i++) fix(real, i, v);
    for (const l of b.lines) fix(l.in, s, v);
  });
}
// the live mix (lines, far side, dots): the clip's, blended through the
// morph from the one before
function mixLive(view: NonNullable<ReturnType<typeof getView>>, k: number, t: number, morph: number) {
  const p = plan!;
  if (!p.base) return;
  const cs = p.clips;
  const look = (i: number) => cs[((i % cs.length) + cs.length) % cs.length].look;
  const from = k === 0 ? look(0) : look(k - 1);
  const to = look(k);
  const startAt = k < cs.length ? cs[k].at : cs[cs.length - 1].at + cs[cs.length - 1].dur;
  const u = k === 0 ? 1 : Math.max(0, Math.min(1, (t - startAt) / morph));
  const mix = (n: keyof Look) => (from[n] + (to[n] - from[n]) * u) / 100;
  const cfg = (view as unknown as { cfg: Record<string, number> }).cfg;
  cfg.lineOpacity = p.base.lineOpacity * mix("lines");
  // dots: their size (the scene's own, a shader value); below 100 they fade
  // out too, so 0 is none
  const dots = mix("dots");
  cfg.nodeOpacity = p.base.nodeOpacity * Math.min(1, dots);
  const b = (view as unknown as { blocks: { nodeMat: { uniforms: { uSize: { value: number } } } } | null }).blocks;
  if (b) b.nodeMat.uniforms.uSize.value = p.base.dotSize * dots;
  cfg.backDim = Math.min(1, p.base.backDim * mix("farSide"));
}

// Loop: the morph back also turns the scene back to how it stood at 0 s
// (the blocks' slow turn, the dots' spin and drift), so the last frame is
// the first and the video loops without a jump (lab only: it sets those
// clocks on the scenes)
function turnBack(view: NonNullable<ReturnType<typeof getView>>, t: number, end: number) {
  const p = plan!;
  const blocks = p.family === "blocks";
  const target = (blocks ? (view as unknown as { blocks: Clocks | null }).blocks : (view as unknown as { system: Clocks }).system) as Clocks | null;
  if (!target) return;
  const names = blocks ? ["turn"] : ["rotTime", "idleTime", "time"];
  if (!p.start) p.start = Object.fromEntries(names.map((n) => [n, target[n]]));
  const tail = loopTail();
  if (!tail || t < end - 1e-9) {
    p.tail = null;
    return;
  }
  if (!p.tail) p.tail = Object.fromEntries(names.map((n) => [n, target[n]]));
  // where each clock should be after this step, less what the step adds
  const u = Math.min(1, (t + DT - end) / tail);
  const e = u * u * (3 - 2 * u);
  const cfg = (view as unknown as { cfg: Record<string, number | boolean> }).cfg;
  const spin = Math.max(0, Number(cfg.rotateSpeed) || 0);
  const adds: Clocks = blocks
    ? { turn: DT * Number(cfg.turnSpeed || 0) }
    : { rotTime: cfg.autoRotate ? DT * spin : 0, idleTime: cfg.idleMotion ? DT * 0.35 * spin : 0, time: DT * Number(cfg.speed ?? 1) };
  for (const n of names) target[n] = p.tail[n] + (p.start[n] - p.tail[n]) * e - (adds[n] ?? 0);
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
    if (plan.family === "blocks" && !plan.base) mixInside(view);
    if (plan.family === "blocks") baseStagger.value = Number((view as unknown as { cfg: { stagger: number } }).cfg.stagger) || 0.6;
    while (take.t + DT <= T + 1e-6) {
      drive(view, take.t);
      view.step(DT);
      take.t += DT;
    }
    view.paint();
    // no fade in (the engine eases a new view in; here it read as a flicker
    // each time the take started again)
    view.canvas.style.transition = "none";
    view.canvas.style.opacity = "1";
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

// --- the timeline: a clip per model, rebuilt when a model joins or leaves
// (its id names the family and the count, so each keeps its own timing). A
// clip's popover picks its model ---
let timeline: ReturnType<typeof createDialTimeline> | null = null;
let playing = true;
let spacing = Number(store.get("clarify-morph-lab-spacing") ?? 0) || 0;
// the video's length: where the last clip ends (the dock runs a little past
// it, room to drag that end out)
const clipsEnd = () => {
  const cs = clips();
  return cs.length ? Math.max(0.5, cs[cs.length - 1].at + cs[cs.length - 1].dur) : 1;
};
// Loop: after the last clip, its model morphs back into the first one's, and
// the video ends once it's there: played round, it never cuts
const loopTail = () => (v().timing.loop && seq.length > 1 ? Math.max(0.2, v().timing.morph) : 0);
const duration = () => clipsEnd() + loopTail();
// past the clips, the dock shows the loop's morph and a little room
const room = () => Math.max(3, loopTail() + 1);
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
  const f = family()!;
  // (labelled as named: DialKit title-cases a bare option)
  const options = MODELS.filter((m) => familyOf(m) === f).map((m) => ({ value: m.name, label: m.name }));
  keys().forEach((k, i) => {
    config[k] = {
      at: Math.round(i * span * 10) / 10,
      duration: span,
      // blocks and lines: the clip's own mix too (dots set theirs when built)
      to: f === "blocks" ? { model: { type: "select", options, default: seq[i] }, lines: [100, 0, 250, 5], insideLines: [100, 0, 400, 5], farSide: [100, 0, 330, 5], dots: [100, 0, 400, 5] } : { model: { type: "select", options, default: seq[i] } },
    };
  });
  // Loop: the morph back to the first model, a clip of its own after the
  // last (where honest() keeps it: it can't be moved)
  if (loopTail()) config[BACK] = { at: seq.length * span, duration: loopTail(), from: { p: 0 }, to: { p: 1 }, transition: { type: "easing", duration: loopTail(), ease: [0, 0, 1, 1] } };
  config.duration = Math.round((seq.length * span + room()) * 10) / 10;
  const id = `morph-${spacing}-${f}-${seq.length}`;
  timeline = createDialTimeline("Morph", config as never, { id, persist: true, autoplay: playing, loop: false });
  showModels();
  honest();
  layout();
  timeline.subscribe((tv) => {
    if (recording) return;
    playing = tv.playing;
    // a model picked in a clip's popover
    const picked = keys().map((k, i) => (tv as unknown as Record<string, { to?: { model?: string } }>)[k]?.to?.model ?? seq[i]);
    if (!restoring && picked.some((n, i) => n !== seq[i] && known(n))) {
      seq = picked;
      store.set(SEQ_KEY, JSON.stringify(seq));
      showModels();
      showStill();
    }
    honest();
    // past the last clip: round again from 0
    if (tv.playing && tv.time > duration() + 1e-6) {
      timeline!.seek(0);
      return;
    }
    // a clip moved: the take starts again, at the same moment
    if (JSON.stringify(clips()) !== take.clips) {
      renderRail();
      invalidate();
      record();
    } else if (Math.abs(tv.time - playT) > 1e-6) requestSeek(tv.time);
  }, false);
  take.valid = false;
  seek(0);
}
// The timeline tells the truth: a clip runs from its start to the next one's,
// as long as its model is on screen (no gaps, no overlaps). Dragging a clip
// past another reorders them; dragging a clip's end moves every clip after it
// along; the last clip's end is the video's (or, with Loop, the morph back
// to the first after it). The dock runs a little past it.
let shape: Record<string, { at: number; dur: number }> = {};
let evening = false;
// (once a drag on the dock ends: tidied mid-drag, the clips moved under it)
let dragging = false;
window.addEventListener("pointerdown", (e) => (dragging = e.target instanceof Element && !!e.target.closest(".dialkit-timeline")), true);
window.addEventListener("pointerup", () => {
  if (!dragging) return;
  dragging = false;
  setTimeout(honest);
}, true);
function honest(scaleTo?: number) {
  if (!timeline || evening || dragging) return;
  const id = timeline.id;
  const tv = timeline.values as unknown as ClipValues;
  const raw = keys().map((k) => ({ k, at: tv[k]?.at ?? 0, dur: tv[k]?.duration ?? 1 }));
  const prev = shape;
  let order = [...raw].sort((a, b) => a.at - b.at);
  const len = new Map<string, number>();
  if (restoring || !raw.every((c) => prev[c.k])) {
    // first look (or an undo): the starts say it all
    order.forEach((c, i) => len.set(c.k, i < order.length - 1 ? order[i + 1].at - c.at : c.dur));
  } else {
    // against the last tidy state, in its order
    order = [...raw].sort((a, b) => prev[a.k].at - prev[b.k].at);
    for (const c of order) len.set(c.k, prev[c.k].dur);
    let moving: (typeof raw)[number] | null = null;
    order.forEach((c, i) => {
      const p = prev[c.k];
      const moved = Math.abs(c.at - p.at) > 1e-6;
      const resized = Math.abs(c.dur - p.dur) > 1e-6;
      // moved whole: it goes where it was dropped
      if (moved && !resized) moving = c;
      // its end: its own length (the clips after it move along)
      else if (resized && !moved) len.set(c.k, c.dur);
      // its start: the cut with the clip before
      else if (resized && moved) {
        len.set(c.k, c.dur);
        if (i > 0) len.set(order[i - 1].k, len.get(order[i - 1].k)! + (c.at - p.at));
      }
    });
    if (moving) {
      const m = moving as (typeof raw)[number];
      const mid = m.at + len.get(m.k)! / 2;
      order = order.filter((o) => o !== m);
      const at = order.filter((o) => prev[o.k].at + prev[o.k].dur / 2 < mid).length;
      order.splice(at, 0, m);
    }
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  // the Length dial: every clip scaled together
  const total = order.reduce((sum, c) => sum + len.get(c.k)!, 0);
  const k = scaleTo ? scaleTo / total : 1;
  let at = 0;
  const next = order.map((c) => {
    const dur = r2(Math.max(0.2, len.get(c.k)! * k));
    const out = { k: c.k, at: r2(at), dur };
    at += dur;
    return out;
  });
  shape = Object.fromEntries(next.map((c) => [c.k, { at: c.at, dur: c.dur }]));
  const end = r2(at);
  evening = true;
  try {
    const meta = TimelineStore.getTimeline(id);
    if (meta && Math.abs(meta.duration - (end + room())) > 1e-6) TimelineStore.update({ ...meta, duration: r2(end + room()) });
    for (const c of next) {
      if (Math.abs((tv[c.k]?.at ?? 0) - c.at) > 1e-6) DialStore.updateValue(id, `${c.k}.at`, c.at);
      if (Math.abs((tv[c.k]?.duration ?? 0) - c.dur) > 1e-6) DialStore.updateValue(id, `${c.k}.duration`, c.dur);
    }
    // the loop's morph back: right after the last clip, the Morph dial long
    const back = tv[BACK];
    if (back) {
      if (Math.abs(back.at - end) > 1e-6) DialStore.updateValue(id, `${BACK}.at`, end);
      if (Math.abs(back.duration - loopTail()) > 1e-6) DialStore.updateValue(id, `${BACK}.duration`, loopTail());
    }
    // the Length dial shows it
    if (Math.abs(v().timing.length - end) > 0.05) kit.setValues({ timing: { length: Math.round(end * 10) / 10 } });
  } finally {
    evening = false;
  }
  // (the morph back names the first clip, which a move may have changed)
  showModels();
}

const BACK = "loopBack";
// the clips' models and labels from the sequence
function showModels() {
  if (!timeline) return;
  const id = timeline.id;
  keys().forEach((k, i) => {
    if ((DialStore.getValue(id, `${k}.to.model`) as string | undefined) !== seq[i]) DialStore.updateValue(id, `${k}.to.model`, seq[i]);
  });
  const meta = TimelineStore.getTimeline(id);
  const names = labels();
  const back = `↺ ${clips()[0]?.name ?? seq[0]}`;
  const label = (c: { key: string }, i: number) => (c.key === BACK ? back : names[i]);
  if (meta && meta.clips.some((c, i) => label(c, i) && c.label !== label(c, i))) TimelineStore.update({ ...meta, clips: meta.clips.map((c, i) => ({ ...c, label: label(c, i) ?? c.label })) });
}
// --- a clip's popover: a still of its model above its dropdown (DialKit's
// curve there is hidden: the morphs keep the engine's own pace) ---
const stills = new Map<string, string>();
let stillGen = 0;
// one at a time, off screen (each mounts a view, steps it a few seconds in,
// keeps a picture of it and lets it go)
const stillHost = document.createElement("div");
stillHost.style.cssText = "position:fixed;left:-10000px;top:0;width:360px;height:360px;pointer-events:none";
document.body.append(stillHost);
let stillQueue: Promise<unknown> = Promise.resolve();
function stillOf(name: string): Promise<string> {
  const hit = stills.get(name);
  if (hit) return Promise.resolve(hit);
  const job = stillQueue.then(async () => {
    // never while a video exports (it would take frames from it)
    while (recording) await new Promise((r) => setTimeout(r, 250));
    const again = stills.get(name);
    if (again) return again;
    const m = modelByName(name);
    try {
      mount(stillHost, specFor(stillHost, m, styleOverrides(m, stylePanel?.kit.values)), { root: stillHost });
      let view = getView(stillHost);
      for (let i = 0; i < 120 && !(view && view.scene.children.some((c) => c.children.length > 0 || (c as { isMesh?: boolean }).isMesh || (c as { isPoints?: boolean }).isPoints)); i++) {
        await new Promise((r) => requestAnimationFrame(r));
        view = getView(stillHost);
      }
      if (!view) return "";
      // its own randomness, not the take's
      const seeded = Math.random;
      Math.random = realRandom;
      try {
        for (let i = 0; i < 150; i++) view.step(DT);
        view.paint();
      } finally {
        Math.random = seeded;
      }
      const url = view.canvas.toDataURL("image/png");
      stills.set(name, url);
      return url;
    } finally {
      unmount(stillHost);
    }
  });
  stillQueue = job.catch(() => "");
  return job;
}
// the popover open now, which clip it's for (by its title, set when it opened)
function popover(): { el: HTMLElement; i: number } | null {
  const el = document.querySelector<HTMLElement>(".dialkit-timeline-popover");
  if (!el) return null;
  if (el.dataset.clip === undefined) {
    const title = el.querySelector(".dialkit-timeline-popover-title")?.textContent ?? "";
    const i = labels().indexOf(title);
    if (i < 0) return null;
    el.dataset.clip = String(i);
  }
  return { el, i: Number(el.dataset.clip) };
}
// the box: the clip's model
async function showStill() {
  const p = popover();
  if (!p || p.i >= seq.length) return;
  const body = p.el.querySelector(".dialkit-timeline-popover-body");
  if (!body) return;
  let box = body.querySelector<HTMLElement>(".clip-still");
  if (!box) {
    box = document.createElement("div");
    box.className = "clip-still";
    box.innerHTML = "<img alt='' />";
    // under the dropdown: its list opens upwards, over what's above it
    body.append(box);
    // every model it could be, drawn in the background, the clip's first
    const f = family();
    for (const m of [seq[p.i], ...MODELS.filter((m) => familyOf(m) === f).map((m) => m.name)]) stillOf(m);
  }
  const title = p.el.querySelector(".dialkit-timeline-popover-title");
  if (title) title.textContent = labels()[p.i];
  const name = seq[p.i];
  if (box.dataset.model === name) return;
  box.dataset.model = name;
  const gen = ++stillGen;
  box.classList.toggle("loading", !stills.has(name));
  const url = await stillOf(name);
  if (gen !== stillGen) return;
  box.querySelector("img")!.src = url;
  box.classList.remove("loading");
}
new MutationObserver(() => {
  if (document.querySelector(".dialkit-timeline-popover:not([data-clip])")) showStill();
  // the dropdown closed: its preview goes
  else if (!document.querySelector(".dialkit-select-option")) peek.hidden = true;
}).observe(document.body, { childList: true, subtree: true });
// browsing a clip's dropdown: a preview of the model under the pointer (or
// the keyboard's) beside the list, where the list can't cover it
const peek = document.createElement("div");
peek.id = "peek";
peek.hidden = true;
peek.innerHTML = "<img alt='' /><span></span>";
document.body.append(peek);
let peekGen = 0;
for (const type of ["pointerover", "focusin"]) {
  document.addEventListener(type, async (e) => {
    const opt = e.target instanceof Element ? e.target.closest<HTMLElement>(".dialkit-select-option") : null;
    const name = opt?.textContent?.trim();
    if (!opt || !name || !known(name) || !document.querySelector(".dialkit-timeline-popover")) return;
    const list = opt.parentElement!.getBoundingClientRect();
    const size = 260;
    const left = list.left - size - 12 >= 8 ? list.left - size - 12 : list.right + 12;
    const top = Math.max(8, Math.min(innerHeight - size - 8, list.top));
    Object.assign(peek.style, { left: `${left}px`, top: `${top}px`, width: `${size}px`, height: `${size}px` });
    peek.querySelector("span")!.textContent = name;
    peek.hidden = false;
    const gen = ++peekGen;
    peek.classList.toggle("loading", !stills.has(name));
    const url = await stillOf(name);
    if (gen !== peekGen) return;
    peek.querySelector("img")!.src = url;
    peek.classList.remove("loading");
  });
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
  record();
}
function renderRail() {
  seqList.textContent = "";
  const ks = labels();
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
    record();
  },
  take: () => {
    take.seed = (take.seed * 9301 + 49297) % 233280;
    invalidate();
  },
  copy: () => copyPng(),
  copySvg: () => copySvg(),
  record: () => recordVideo(),
};
for (const b of document.querySelectorAll<HTMLElement>("#rail [data-act]")) b.onclick = () => actions[b.dataset.act!]();

let last = { size: out().size, w: out().w, h: out().h, light: out().light, scale: out().scale, loop: v().timing.loop, morph: v().timing.morph };
kit.subscribe((nv) => {
  const o = nv.output;
  if (!restoring && o.size !== last.size && SIZES[o.size]) {
    const [w, h] = SIZES[o.size];
    last = { ...last, size: o.size, w, h };
    kit.setValues({ output: { w, h } });
    return;
  }
  if (!restoring && (o.w !== last.w || o.h !== last.h) && SIZES[o.size] && (SIZES[o.size][0] !== o.w || SIZES[o.size][1] !== o.h)) {
    last = { ...last, size: "Custom", w: o.w, h: o.h };
    kit.setValues({ output: { size: "Custom" } });
    return;
  }
  if (!restoring && o.light !== last.light) {
    last = { ...last, light: o.light };
    kit.setValues({ output: { colour: o.light ? "#f4f7fa" : "#060709" } });
    return;
  }
  // the Length dial dragged: every clip scaled to it
  if (!restoring && !evening && timeline && Math.abs(nv.timing.length - clipsEnd()) > 0.05) honest(nv.timing.length);
  // Loop or Morph: another ending (and the dock's length)
  const rescale = o.scale !== last.scale || nv.timing.loop !== last.loop || nv.timing.morph !== last.morph;
  // Loop adds or takes away the morph back's clip
  if (nv.timing.loop !== last.loop) buildTimeline();
  else if (nv.timing.morph !== last.morph) honest();
  last = { size: o.size, w: o.w, h: o.h, light: o.light, scale: o.scale, loop: nv.timing.loop, morph: nv.timing.morph };
  layout();
  if (rescale) invalidate();
  record();
}, false);
window.addEventListener("resize", layout);

// --- undo / redo: a step per settled change (a drag is one step). A step
// holds the sequence, how its clips are timed and every dial ---
type Snap = { seq: string[]; spacing: number; clips: Record<string, { at: number; duration: number; look?: Partial<Look> }>; main: unknown; look: unknown };
const plain = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, x]) => typeof x !== "object" || (x !== null && "x" in x)));
function snap(): string {
  const tv = (timeline?.values ?? {}) as unknown as Record<string, { at: number; duration: number }>;
  const val = v();
  const s: Snap = {
    seq,
    spacing,
    clips: Object.fromEntries(keys().map((k) => [k, { at: tv[k]?.at ?? 0, duration: tv[k]?.duration ?? 0, look: pick(tv[k]?.to) }])),
    main: { output: plain(val.output), placement: plain(val.placement), timing: plain(val.timing) },
    look: stylePanel?.kit.values ?? null,
  };
  return JSON.stringify(s);
}
const undos: string[] = [];
let redos: string[] = [];
let committed = "";
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
  if (restoring || !committed) return;
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
  const p = JSON.parse(s) as Snap;
  // another sequence (or spacing): its timeline first
  // another count, family or spacing: its timeline first; else the models
  if (p.seq.length !== seq.length || p.spacing !== spacing || familyOf(modelByName(p.seq[0] ?? "")) !== family()) {
    seq = p.seq;
    spacing = p.spacing;
    store.set(SEQ_KEY, JSON.stringify(seq));
    store.set("clarify-morph-lab-spacing", String(spacing));
    buildTimeline();
  } else if (JSON.stringify(p.seq) !== JSON.stringify(seq)) {
    seq = p.seq;
    store.set(SEQ_KEY, JSON.stringify(seq));
    showModels();
  }
  if (timeline) {
    // all of them before tidying (one at a time, they read as drags)
    evening = true;
    for (const [k, c] of Object.entries(p.clips)) {
      DialStore.updateValue(timeline.id, `${k}.at`, c.at);
      DialStore.updateValue(timeline.id, `${k}.duration`, c.duration);
      for (const [n, x] of Object.entries(c.look ?? {})) DialStore.updateValue(timeline.id, `${k}.to.${n}`, x);
    }
    evening = false;
    honest();
  }
  kit.setValues(p.main as never);
  if (p.look && stylePanel) stylePanel.kit.setValues(p.look as never);
  renderRail();
  invalidate();
  // the panels answer a moment later: let them, then listen again
  setTimeout(() => {
    restoring = false;
    committed = snap();
  }, 50);
}
window.addEventListener("keydown", (e) => {
  if (typing(e.target) || recording) return;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    if (e.shiftKey) travel(redos, undos);
    else travel(undos, redos);
  } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
    e.preventDefault();
    travel(redos, undos);
  }
});

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

// Export video: the whole timeline, from 0 s, at 60 fps, as a file. The lab
// steps and draws each frame and hands it to the browser's recorder in time,
// so it takes as long as the timeline (MP4 where the browser records it, else
// WebM). Always on the background colour.
let recording = false;
async function recordVideo() {
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
      if (i % 30 === 0) hud.textContent = `exporting video ${Math.round((i / frames) * 100)}% · it plays through once, ${Math.ceil(dur - i * DT)} s left`;
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
  flash(`video exported to your downloads (${dur.toFixed(1)} s, ${c.width} × ${c.height})`);
  timeline.seek(playT);
  if (wasPlaying) timeline.play();
}

buildTimeline();
committed = snap();
(window as unknown as { lab: unknown }).lab = { store: DialStore, kit, seek, clips, timeline: () => timeline, setSeq, record: recordVideo, copySvg: svgText, undo: () => travel(undos, redos), redo: () => travel(redos, undos) };

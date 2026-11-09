// The morph embed: one field of dots (or of blocks and lines) that morphs
// into whichever shape is picked, live. Made for an iframe on another page
// (the brand guidelines, a case study): no rail, any frame from 16:9 to a
// phone's 4:5. Until someone touches it, it tours the shapes on its own.
// The morph lab (morph.ts) is untouched; this plays the same scenes freely,
// not on a timeline.
// URL: ?family=dots|blocks, ?ground=light, ?ui=0 (no controls), ?label=0 (no "Interactive" tag),
// ?tour=<s> (seconds per shape on the tour; 0: no tour),
// In a narrow frame (max-width 560px, a phone) the controls become one bottom bar (family tabs,
// previous / next shape): still interactive, taps only, swipes scroll the page.
// ?wheel=parent (forward the wheel to the host page, see below),
// ?watch (no input at all): no controls, no tag, no input at all; it tours on its own
// and never catches a touch, so the page scrolls through it. The host page also sets
// pointer-events: none on the iframe (the Parasail ?watch pattern).
import { getView, mount, setPaused, unmount } from "../src/runtime/engine";
import { MODELS, crispDots, fitDots, specFor, type Model } from "./models";

// the shapes each family offers, in the order the tour plays them: clear
// silhouettes that read well one after another
const FAMILIES = {
  dots: { title: "Dots", names: ["Dot sphere", "Meridians", "Dot spiral", "Dot burst", "Dot icosahedron", "Dot octahedron", "Dot gem", "Dot cone"] },
  blocks: { title: "Blocks & lines", names: ["Block cube", "Block cross", "Block diamond", "Block hub", "Block sphere", "Block pyramid", "Line globe", "Line torus", "Line icosahedron", "Line tesseract"] },
} as const;
type Family = keyof typeof FAMILIES;

const split = (s: unknown) =>
  String(s ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
const shapeOf = (m: Model) => (m.style === "dots" ? String(m.config.sequence || m.config.shape) : split(m.config.shapes)[0]);

const q = new URLSearchParams(location.search);
const frame = document.getElementById("frame")!;
const effect = document.getElementById("effect")!;
const tabs = document.getElementById("tabs")!;
const chips = document.getElementById("chips")!;
const pause = document.getElementById("pause") as HTMLButtonElement;
const ground = document.getElementById("ground") as HTMLButtonElement;
const mBar = document.querySelector<HTMLElement>(".m-bar")!;
const mModes = document.getElementById("m-modes")!;
const mName = document.getElementById("m-name")!;
const mCount = document.getElementById("m-count")!;
const phone = matchMedia("(max-width: 560px)");
if (q.get("ui") === "0") document.body.classList.add("bare");
if (q.get("label") === "0") document.body.classList.add("untagged");
const watch = q.has("watch");
if (watch) document.body.classList.add("bare", "watch");

let family: Family = q.get("family") === "blocks" ? "blocks" : "dots";
let models: Model[] = [];
let shapes: string[] = [];
// blocks: the scene's shape slots, as model indexes (slots get swapped so the
// picked shape is always the next one the scene morphs to)
let slots: number[] = [];
let on = 0;
let paused = false;

type Blocks = { morphing: boolean; shape: number; places: Float32Array[]; real: Float32Array[]; lines: { in: Float32Array }[] };
const view = () => getView(effect) as unknown as { cfg: Record<string, unknown>; blocks?: Blocks | null } | undefined;

function place() {
  const bare = document.body.classList.contains("bare");
  const m = !bare && phone.matches ? mBar.offsetHeight : 0;
  frame.style.setProperty("--m-bar", `${m}px`);
  const r = frame.getBoundingClientRect();
  const bars = bare ? 0 : m ? m + 16 : [...document.querySelectorAll<HTMLElement>(".bar")].reduce((h, b) => h + b.offsetHeight + 16, 0);
  const w = Math.round(Math.min(r.width * 0.86, (r.height - bars) * 0.94));
  Object.assign(effect.style, { width: `${w}px`, height: `${w}px` });
  return w;
}

// Switching family: the field goes soft and fades (blur 6px, scale 0.97), the
// other family comes up out of the same haze. The site's reveal curve
// (cubic-bezier(0.2, 0.7, 0.2, 1)): strong ease-out, no bounce.
const EASE = "cubic-bezier(0.2, 0.7, 0.2, 1)";
const look = (blur: number) => `${light ? "invert(1) " : ""}blur(${blur}px)`;
let switching = false;
async function switchTo(f: Family) {
  if (switching || f === family) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return start(f);
  switching = true;
  markTabs(f);
  // the shape menu (desktop chips, phone name) fades out with the field, and back in once it holds
  // the other family's shapes; the chips' glass eases to its new width instead of jumping
  const menu = [chips, mName.parentElement!];
  const was = chips.offsetWidth;
  const soft = { duration: 380, easing: EASE, fill: "forwards" as const };
  const menuOut = menu.map((m) => m.animate([{ opacity: 1, filter: "blur(0px)" }, { opacity: 0, filter: "blur(4px)" }], soft));
  const out = effect.animate(
    [{ opacity: 1, filter: look(0), transform: "scale(1)" }, { opacity: 0, filter: look(6), transform: "scale(0.97)" }],
    { duration: 380, easing: EASE, fill: "forwards" },
  );
  await out.finished;
  start(f);
  const now = chips.offsetWidth;
  if (was && now && was !== now) chips.animate([{ width: `${was}px` }, { width: `${now}px` }], { duration: 600, easing: EASE });
  menu.forEach((m) =>
    m.animate([{ opacity: 0, filter: "blur(4px)" }, { opacity: 1, filter: "blur(0px)" }], { duration: 700, delay: 200, easing: EASE, fill: "backwards" }),
  );
  menuOut.forEach((a) => a.cancel());
  // a beat for the new scene's first frames (blocks load their own chunk the first time)
  await new Promise((r) => setTimeout(r, 120));
  const back = effect.animate(
    [{ opacity: 0, filter: look(6), transform: "scale(0.97)" }, { opacity: 1, filter: look(0), transform: "scale(1)" }],
    { duration: 900, easing: EASE, fill: "forwards" },
  );
  out.cancel();
  await back.finished;
  back.cancel(); // back to the stylesheet's own filter (the light ground's invert)
  switching = false;
}

// the family tabs show the pick at once (the pill starts sliding on the tap, not after the fade)
function markTabs(f: Family) {
  for (const b of [...tabs.querySelectorAll("button"), ...mModes.querySelectorAll("button")]) {
    const sel = b.dataset.family === f;
    b.classList.toggle("on", sel);
    b.setAttribute("aria-selected", String(sel));
  }
  slide();
}

// On a phone the fine, faint dots fade away (the site also shows the frame scaled down, ~0.64),
// so they get fewer, bigger and brighter there, to read as clearly as the blocks and lines.
const SMALL_DOTS = { density: 0.7, size: 1.7, opacity: 2 };
const small = () => phone.matches || matchMedia("(pointer: coarse)").matches;

function start(f: Family) {
  family = f;
  models = FAMILIES[f].names.map((n) => MODELS.find((m) => m.name === n)).filter((m): m is Model => !!m);
  shapes = models.map(shapeOf);
  slots = models.map((_, i) => i);
  on = 0;
  unmount(effect);
  const w = place();
  const extra =
    f === "dots"
      ? { sequence: "", shape: shapes[0], holdShape: shapes[0], gather: false, ...(small() ? crispDots(models[0], SMALL_DOTS) : {}) }
      : { shapes: shapes.join(","), holdTime: 1e9 };
  // watch: no pointer reactions, no drag-to-spin, a lighter pixel ratio
  // otherwise: drag to spin, mouse and finger (sideways drags only on touch, so up/down still scrolls the page)
  const still = watch
    ? { interactive: false, touchSpin: false, touchHover: false, mouseSpin: false, mobileDpr: 1.5 }
    : { interactive: true, mouseSpin: true, touchSpin: true, touchHold: 0, touchHover: false }; // blocks default to interactive: false, which turns spin off
  mount(effect, specFor(effect, models[0], { ...extra, ...still }), { root: effect });
  fitDots(effect, w);
  markTabs(f);
  chips.replaceChildren(
    ...models.map((m, i) => {
      const b = document.createElement("button");
      b.textContent = m.name.replace(/^(Dot|Block|Line) /, "").replace(/^./, (c) => c.toUpperCase());
      b.onclick = () => (touched(), go(i));
      return b;
    }),
  );
  mark();
}

function mark() {
  [...chips.children].forEach((b, i) => b.classList.toggle("on", i === on));
  mName.textContent = chips.children[on]?.textContent ?? "";
  mCount.textContent = `${String(on + 1).padStart(2, "0")} / ${String(models.length).padStart(2, "0")}`;
}

// morph into model i
function go(i: number) {
  const v = view();
  if (!v || i === on) return;
  if (family === "dots") {
    v.cfg.morphTime = 1.6;
    v.cfg.holdShape = shapes[i];
  } else {
    const b = v.blocks;
    if (!b || b.morphing) return; // one morph at a time
    const n = b.places.length;
    const next = (b.shape + 1) % n;
    const at = slots.indexOf(i);
    if (at !== next) {
      // put the picked shape in the next slot: its places, its inside lines
      const swap = <T,>(a: T[]) => ([a[next], a[at]] = [a[at], a[next]]);
      swap(b.places);
      swap(b.real);
      for (const l of b.lines) [l.in[next], l.in[at]] = [l.in[at], l.in[next]];
      swap(slots);
    }
    v.cfg.holdTime = 0; // morph now
    requestAnimationFrame(function hold() {
      if (view()?.blocks?.morphing) v.cfg.holdTime = 1e9;
      else requestAnimationFrame(hold);
    });
  }
  on = i;
  mark();
}

for (const [f, { title }] of Object.entries(FAMILIES)) {
  const b = document.createElement("button");
  b.dataset.family = f;
  b.textContent = title;
  b.onclick = () => (touched(), switchTo(f as Family));
  tabs.append(b);
  const m = b.cloneNode(true) as HTMLButtonElement;
  m.setAttribute("role", "tab");
  m.onclick = b.onclick;
  mModes.append(m);
}
// the pill under the picked family tab, in each tab list; `still` = no slide (first paint, resize)
function slide(still = false) {
  for (const list of [tabs, mModes]) {
    let pill = list.querySelector<HTMLElement>(".pill");
    if (!pill) {
      pill = document.createElement("span");
      pill.className = "pill";
      list.prepend(pill);
      still = true;
    }
    const on = list.querySelector<HTMLElement>("button.on");
    if (!on || !on.offsetWidth) continue;
    pill.classList.toggle("still", still);
    Object.assign(pill.style, { width: `${on.offsetWidth}px`, height: `${on.offsetHeight}px`, transform: `translate(${on.offsetLeft}px, ${on.offsetTop}px)` });
    if (still) void pill.offsetWidth;
    pill.classList.remove("still");
  }
}
document.getElementById("m-prev")!.onclick = () => (touched(), go((on - 1 + models.length) % models.length));
document.getElementById("m-next")!.onclick = () => (touched(), go((on + 1) % models.length));
phone.addEventListener("change", () => (family === "dots" && !switching ? start(family) : fitDots(effect, place()), slide(true)));
document.fonts?.ready.then(() => slide(true));

function setGround(l: boolean) {
  document.body.classList.toggle("light", l);
  ground.textContent = l ? "Dark" : "Light";
}
let light = q.get("ground") === "light";
// off screen (the iframe scrolled out of the host page's view) nothing runs: no frames, no tour
let inView = true;
const rest = () => setPaused(paused || !inView || document.hidden);
new IntersectionObserver(([e]) => ((inView = e.isIntersecting), rest())).observe(frame);
function setPause(p: boolean) {
  paused = p;
  rest();
  pause.textContent = p ? "Play" : "Pause";
}

// the tour: the next shape every few seconds, until the first touch
const every = q.has("tour") ? Number(q.get("tour")) : 4.5;
let tour = every > 0 ? window.setInterval(() => !paused && inView && !document.hidden && go((on + 1) % models.length), every * 1000) : 0;
function touched() {
  if (watch) return; // watch tours forever
  if (tour) clearInterval(tour);
  tour = 0;
}

pause.onclick = () => (touched(), setPause(!paused));
ground.onclick = () => (touched(), setGround((light = !light)));
if (!watch) addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") touched(), go((on + 1) % models.length);
  else if (e.key === "ArrowLeft") touched(), go((on - 1 + models.length) % models.length);
  else if (e.key === " ") e.preventDefault(), touched(), setPause(!paused);
});
// ?wheel=parent: a host page with its own smooth scroll (Lenis on ish.studio) never gets the wheel
// that happens over this iframe, so hand vertical wheel turns to the parent as
// { type: "ish:wheel", deltaY } (px). Opt-in: other hosts (the brand book) keep the browser's own
// scroll chaining. Sideways turns over the shape chips and pinch-zoom (ctrlKey) stay here.
if (q.get("wheel") === "parent" && window.parent !== window) {
  addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && (e.target as Element).closest?.("#chips, #tabs")) return;
      e.preventDefault();
      const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1;
      window.parent.postMessage({ type: "ish:wheel", deltaY: e.deltaY * k }, "*");
    },
    { passive: false },
  );
}
// a drag (or a tap) on the field counts as a touch: the tour stops. pointerup, not down: a finger
// that scrolls the page ends in pointercancel instead, and leaves the tour running
frame.addEventListener("pointerup", (e) => {
  if (e.target === frame || effect.contains(e.target as Node)) touched();
});
document.addEventListener("visibilitychange", rest);
let resizing = 0;
addEventListener("resize", () => {
  cancelAnimationFrame(resizing);
  resizing = requestAnimationFrame(() => (fitDots(effect, place()), slide(true)));
});

setGround(light);
start(family);

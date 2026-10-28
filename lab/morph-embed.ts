// The morph embed: one field of dots (or of blocks and lines) that morphs
// into whichever shape is picked, live. Made for an iframe on another page
// (the brand guidelines, a case study): no rail, any frame from 16:9 to a
// phone's 4:5. Until someone touches it, it tours the shapes on its own.
// The morph lab (morph.ts) is untouched; this plays the same scenes freely,
// not on a timeline.
// URL: ?family=dots|blocks, ?ground=light, ?ui=0 (no controls), ?label=0 (no "Interactive" tag),
// ?tour=<s> (seconds per shape on the tour; 0: no tour).
import { getView, mount, setPaused, unmount } from "../src/runtime/engine";
import { MODELS, fitDots, specFor, type Model } from "./models";

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
if (q.get("ui") === "0") document.body.classList.add("bare");
if (q.get("label") === "0") document.body.classList.add("untagged");

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
  const r = frame.getBoundingClientRect();
  const bars = document.body.classList.contains("bare") ? 0 : [...document.querySelectorAll<HTMLElement>(".bar")].reduce((h, b) => h + b.offsetHeight + 16, 0);
  const w = Math.round(Math.min(r.width * 0.86, (r.height - bars) * 0.94));
  Object.assign(effect.style, { width: `${w}px`, height: `${w}px` });
  return w;
}

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
      ? { sequence: "", shape: shapes[0], holdShape: shapes[0], gather: false }
      : { shapes: shapes.join(","), holdTime: 1e9 };
  mount(effect, specFor(effect, models[0], extra), { root: effect });
  fitDots(effect, w);
  for (const b of tabs.children) b.classList.toggle("on", (b as HTMLElement).dataset.family === f);
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
  b.onclick = () => (touched(), f !== family && start(f as Family));
  tabs.append(b);
}

function setGround(l: boolean) {
  document.body.classList.toggle("light", l);
  ground.textContent = l ? "Dark" : "Light";
}
let light = q.get("ground") === "light";
function setPause(p: boolean) {
  paused = p;
  setPaused(p);
  pause.textContent = p ? "Play" : "Pause";
}

// the tour: the next shape every few seconds, until the first touch
const every = q.has("tour") ? Number(q.get("tour")) : 4.5;
let tour = every > 0 ? window.setInterval(() => !paused && go((on + 1) % models.length), every * 1000) : 0;
function touched() {
  if (tour) clearInterval(tour);
  tour = 0;
}

pause.onclick = () => (touched(), setPause(!paused));
ground.onclick = () => (touched(), setGround((light = !light)));
addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") touched(), go((on + 1) % models.length);
  else if (e.key === "ArrowLeft") touched(), go((on - 1 + models.length) % models.length);
  else if (e.key === " ") e.preventDefault(), touched(), setPause(!paused);
});
document.addEventListener("visibilitychange", () => setPaused(document.hidden || paused));
let resizing = 0;
addEventListener("resize", () => {
  cancelAnimationFrame(resizing);
  resizing = requestAnimationFrame(() => fitDots(effect, place()));
});

setGround(light);
start(family);

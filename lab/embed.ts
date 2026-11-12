// The embed: one model at a time, large and live, with a few controls laid
// over it (style, model, pause, ground). Made to sit in an iframe on another
// page (the brand guidelines, a case study), so it has no rail and fits any
// frame from 16:9 down to a phone's 4:5. The other labs are untouched.
// URL: ?model=<name> (start on it), ?style=<style>, ?ground=light,
// ?ui=0 (no controls), ?label=0 (no "Interactive" tag), ?auto=<s> (step to
// the next model every s seconds until someone touches it).
import { mount, setPaused, unmount } from "../src/runtime/engine";
import { MODELS, STYLES, fitDots, mainDots, modelByName, specFor, type Model } from "./models";

const q = new URLSearchParams(location.search);
const frame = document.getElementById("frame")!;
const effect = document.getElementById("effect")!;
const tabs = document.getElementById("tabs")!;
const name = document.getElementById("name")!;
const count = document.getElementById("count")!;
const pause = document.getElementById("pause") as HTMLButtonElement;
const ground = document.getElementById("ground") as HTMLButtonElement;
const open = document.getElementById("open") as HTMLAnchorElement;

if (q.get("ui") === "0") document.body.classList.add("bare");
if (q.get("label") === "0") document.body.classList.add("untagged");

let model: Model = q.get("model") ? modelByName(q.get("model")!) : (MODELS.find((m) => m.style === q.get("style")) ?? MODELS[0]);
let paused = false;
let light = q.get("ground") === "light";

const inStyle = () => MODELS.filter((m) => m.style === model.style);

// the model's box: the largest square that fits between the control bars
function place() {
  const r = frame.getBoundingClientRect();
  const bars = document.body.classList.contains("bare") ? 0 : [...document.querySelectorAll<HTMLElement>(".bar")].reduce((h, b) => h + b.offsetHeight + 16, 0);
  const w = Math.round(Math.min(r.width * 0.86, (r.height - bars) * 0.94));
  Object.assign(effect.style, { width: `${w}px`, height: `${w}px` });
  fitDots(effect, w);
}

function show(m: Model) {
  model = m;
  unmount(effect);
  place();
  mount(effect, specFor(effect, m, mainDots(m)), { root: effect });
  fitDots(effect, effect.clientWidth);
  const list = inStyle();
  name.textContent = m.name;
  count.textContent = `${String(list.indexOf(m) + 1).padStart(2, "0")} / ${String(list.length).padStart(2, "0")}`;
  for (const b of tabs.children) b.classList.toggle("on", (b as HTMLElement).dataset.style === m.style);
  open.href = `./export.html?model=${encodeURIComponent(m.name)}`;
}

const step = (d: number) => {
  const list = inStyle();
  show(list[(list.indexOf(model) + d + list.length) % list.length]);
};

for (const [style, title] of STYLES) {
  if (!MODELS.some((m) => m.style === style)) continue;
  const b = document.createElement("button");
  b.dataset.style = style;
  b.textContent = title;
  b.onclick = () => (touched(), show(MODELS.find((m) => m.style === style)!));
  tabs.append(b);
}

function setGround(l: boolean) {
  light = l;
  document.body.classList.toggle("light", l);
  ground.textContent = l ? "Dark" : "Light";
}

function setPause(p: boolean) {
  paused = p;
  setPaused(p);
  pause.textContent = p ? "Play" : "Pause";
}

// ?auto: a slow tour until the first touch
let auto = Number(q.get("auto")) > 0 ? window.setInterval(() => step(1), Number(q.get("auto")) * 1000) : 0;
function touched() {
  if (auto) clearInterval(auto);
  auto = 0;
}

document.getElementById("prev")!.onclick = () => (touched(), step(-1));
document.getElementById("next")!.onclick = () => (touched(), step(1));
pause.onclick = () => (touched(), setPause(!paused));
ground.onclick = () => (touched(), setGround(!light));
addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") touched(), step(1);
  else if (e.key === "ArrowLeft") touched(), step(-1);
  else if (e.key === " ") e.preventDefault(), touched(), setPause(!paused);
});

// a swipe across the frame steps through the models (phones)
let x0: number | null = null;
frame.addEventListener("pointerdown", (e) => (x0 = e.clientX));
frame.addEventListener("pointerup", (e) => {
  if (x0 !== null && Math.abs(e.clientX - x0) > 40) touched(), step(e.clientX < x0 ? 1 : -1);
  x0 = null;
});

// out of sight (a hidden tab), it stops drawing; back, it goes on as it was
document.addEventListener("visibilitychange", () => setPaused(document.hidden || paused));

let resizing = 0;
addEventListener("resize", () => {
  cancelAnimationFrame(resizing);
  resizing = requestAnimationFrame(() => show(model));
});

setGround(light);
show(model);

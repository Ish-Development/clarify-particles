// Shift held while dragging a slider: it snaps to round steps, each slider
// its own (about a sixteenth of its range, rounded to 1, 2, 2.5 or 5 of a
// power of ten, and a whole number of its own steps), e.g. 25 on 0-400 %.
type Kit = { values: Record<string, unknown>; subscribe: (fn: (v: Record<string, unknown>) => void, now?: boolean) => unknown; setValues: (v: Record<string, unknown>) => void };
type Slider = [number, number, number, number?];

let shift = false;
let dragging = false;
addEventListener("keydown", (e) => e.key === "Shift" && (shift = true));
addEventListener("keyup", (e) => e.key === "Shift" && (shift = false));
addEventListener("blur", () => (shift = false));
addEventListener("pointerdown", (e) => (dragging = e.target instanceof Element && !!e.target.closest(".dialkit-slider-wrapper, .dialkit-slider")), true);
addEventListener("pointerup", () => (dragging = false), true);

function niceStep(range: number, own = 0) {
  const raw = range / 16;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const nice = ([1, 2, 2.5, 5, 10].find((m) => m * pow >= raw) ?? 10) * pow;
  return own > 0 ? Math.max(own, Math.round(nice / own) * own) : nice;
}
// the panel's sliders, by path: their snap step and limits
function sliders(config: Record<string, unknown>, path: string[] = [], out: { path: string[]; step: number; min: number; max: number }[] = []) {
  for (const [k, x] of Object.entries(config)) {
    if (Array.isArray(x) && x.length >= 3 && x.every((n) => typeof n === "number")) {
      const [, min, max, own] = x as Slider;
      out.push({ path: [...path, k], step: niceStep(max - min, own), min, max });
    } else if (x && typeof x === "object" && !("type" in x)) sliders(x as Record<string, unknown>, [...path, k], out);
  }
  return out;
}
const at = (o: unknown, path: string[]) => path.reduce<unknown>((x, k) => (x as Record<string, unknown> | undefined)?.[k], o);
const patch = (path: string[], v: number): Record<string, unknown> => path.reduceRight<unknown>((x, k) => ({ [k]: x }), v) as Record<string, unknown>;

export function shiftSnap(kit: Kit, config: Record<string, unknown>) {
  const list = sliders(config);
  kit.subscribe((v) => {
    if (!shift || !dragging) return;
    for (const s of list) {
      const now = at(v, s.path);
      if (typeof now !== "number") continue;
      const to = Math.min(s.max, Math.max(s.min, Math.round(now / s.step) * s.step));
      // (rounded: 0.1 × 3 is 0.30000000000000004)
      const clean = Math.round(to * 1e6) / 1e6;
      if (Math.abs(clean - now) > 1e-9) kit.setValues(patch(s.path, clean));
    }
  }, false);
}

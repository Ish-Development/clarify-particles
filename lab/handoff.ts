// From the export lab to the morph lab: the look the model had there (the
// frame and ground, the model's colour, its place, its own dials), kept for
// the morph lab to pick up as it opens, once.
const KEY = "clarify-lab-handoff";
export type HandOff = { output?: unknown; placement?: unknown; style?: unknown };

export function handOff(look: HandOff) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(look));
  } catch {
    /* no storage: the morph lab opens as it was */
  }
}
export function takeHandOff(): HandOff | null {
  try {
    const look = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
    sessionStorage.removeItem(KEY);
    return look;
  } catch {
    return null;
  }
}
// what of `values` a panel has (the same names; actions and anything else
// left out), so one panel's values can be set on another
export function fit(config: unknown, values: unknown): unknown {
  if (!config || typeof config !== "object" || !values || typeof values !== "object") return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, c] of Object.entries(config as Record<string, unknown>)) {
    const x = (values as Record<string, unknown>)[k];
    if (x === undefined) continue;
    const kind = c && typeof c === "object" && !Array.isArray(c) ? (c as { type?: string }).type : undefined;
    if (kind === "action") continue;
    if (Array.isArray(c) || kind) out[k] = x;
    else {
      const inner = fit(c, x);
      if (inner && Object.keys(inner).length) out[k] = inner;
    }
  }
  return out;
}

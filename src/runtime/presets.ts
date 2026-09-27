import type { ParticleConfig } from "../core/config";
import type { GraphConfig } from "../core/graph";
import type { RuntimeOptions } from "./defaults";
import presets from "./presets.json";

// Named looks the Webflow dev references with data-preset="<name>" — one per
// site section (hero, services, …). presets.json is written by the
// playground's "Save preset" action; each config only lists values that
// differ from the runtime defaults (spec.ts), so defaults can evolve.
export type Preset =
  | { type: "points"; config: Partial<ParticleConfig & RuntimeOptions> }
  | { type: "graph"; config: Partial<GraphConfig & RuntimeOptions> };

export const PRESETS = presets as Record<string, Preset>;

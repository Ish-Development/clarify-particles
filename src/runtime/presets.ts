import type { ParticleConfig } from "../core/config";
import type { GraphConfig } from "../core/graph";
import type { MapConfig, RuntimeOptions } from "./defaults";
import presets from "./presets.json";

// Named looks the Webflow dev references with data-preset="<name>" — one per
// site section (hero, services, …). presets.json is written by the
// playground's "Save preset" action; each config only lists values that
// differ from the runtime defaults (spec.ts), so defaults can evolve.
// `breakpoints` (optional): overrides for smaller screens, like CSS
// max-width media queries: every tier whose maxWidth the screen is at or
// under applies on top of `config`, widest first, so narrower tiers win.
type Tier<C> = { maxWidth: number; config: Partial<C> };
export type Preset =
  | { type: "points"; config: Partial<ParticleConfig & RuntimeOptions>; breakpoints?: Tier<ParticleConfig & RuntimeOptions>[] }
  | { type: "graph"; config: Partial<GraphConfig & RuntimeOptions>; breakpoints?: Tier<GraphConfig & RuntimeOptions>[] }
  | { type: "map"; config: Partial<MapConfig & RuntimeOptions>; breakpoints?: Tier<MapConfig & RuntimeOptions>[] };

// the width under which countMobile / sizeScaleMobile apply (engine.ts)
export const MOBILE_QUERY = "(max-width: 767px)";
export const maxWidthQuery = (px: number) => `(max-width: ${px}px)`;

export const PRESETS = presets as Record<string, Preset>;

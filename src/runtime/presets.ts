import type { ParticleConfig } from "../core/config";
import type { GraphConfig } from "../core/graph";

// Named looks the Webflow dev can reference with data-preset="<name>".
// Placeholders until the client signs off on final designs: replace/extend
// these with the approved looks (the playground's "Copy Webflow attributes"
// output can be pasted in as a preset's config).
export type Preset =
  | { type: "points"; config: Partial<ParticleConfig> & { blend?: "additive" | "normal" } }
  | { type: "graph"; config: Partial<GraphConfig> & { blend?: "additive" | "normal" } };

export const PRESETS: Record<string, Preset> = {
  rings: {
    type: "points",
    config: { shape: "concentricRings", chaos: 0, ease: 0.06, count: 6000 },
  },
  sphere: {
    type: "points",
    config: { shape: "sphere", chaos: 0, ease: 0.06, count: 5000, colorMode: "gradient", color1: "#ffffff", color2: "#33aaff" },
  },
  nebula: {
    type: "points",
    config: { shape: "nebula", chaos: 0, ease: 0.04, count: 7000, colorMode: "hueRange", hueMin: 190, hueMax: 260, opacityMax: 0.7 },
  },
  "graph-hub": {
    type: "graph",
    config: { mode: "hubBurst" },
  },
  "graph-morph": {
    type: "graph",
    config: { mode: "coneTorusMorph" },
  },
};

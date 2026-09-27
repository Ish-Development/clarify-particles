import { defaultConfig, type ParticleConfig } from "../core/config";
import { defaultGraphConfig, type GraphConfig } from "../core/graphConfig";

// Runtime-only options layered on top of the simulation configs.
export interface RuntimeOptions {
  // particle count used on small screens; 0 = auto (half of `count`)
  countMobile: number;
  // "additive" = glowing "lighter" look, "normal" = plain alpha blending
  // (needed on light backgrounds, where additive washes out)
  blend: "additive" | "normal";
  // hover/click reactions on or off
  interactive: boolean;
  // dot edge: 1 = soft glow, 0 = crisp disc
  softness: number;
  // opaque dots: brightness comes from dimming the color instead of
  // transparency, so lines and dots behind don't show through
  solid: boolean;
  // CSS inset of the canvas within the element, e.g. "0 0 0 50%" = right
  // half only ("0" = the whole element)
  canvasInset: string;
  // px of soft fade on inset canvas edges (hides the clip line)
  edgeFade: number;
}

export type PointsConfig = ParticleConfig & RuntimeOptions;
export type GraphViewConfig = GraphConfig & RuntimeOptions;

const runtimeDefaults: RuntimeOptions = { countMobile: 0, blend: "additive", interactive: true, softness: 1, solid: false, canvasInset: "0", edgeFade: 0 };

// What an element gets with no attributes at all. Kept free of presets.json
// so the playground can import it without hot-reloading on every preset save.
// On the site the section's own Webflow background shows through, so the
// canvas is transparent unless data-background is set.
export const pointsDefaults: PointsConfig = { ...defaultConfig, ...runtimeDefaults, background: "transparent" };
export const graphDefaults: GraphViewConfig = {
  ...defaultGraphConfig,
  ...runtimeDefaults,
  blend: "normal",
  background: "transparent",
};

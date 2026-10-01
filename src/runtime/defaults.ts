import { defaultConfig, type ParticleConfig } from "../core/config";
import { defaultGraphConfig, type GraphConfig } from "../core/graphConfig";

// Runtime-only options layered on top of the simulation configs.
export interface RuntimeOptions {
  // particle count used on small screens; 0 = auto (half of `count`)
  countMobile: number;
  // dot size multiplier on small screens (points only); 1 = same as desktop
  sizeScaleMobile: number;
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
  // resolution cap on small screens (device-pixel ratio); desktop is 2
  mobileDpr: number;
  // the canvas covers the whole component; .u-particles-threejs only places
  // and sizes the effect, so nothing is cut at its edges (only by the
  // component's own clipping)
  bleed: boolean;
}

export type PointsConfig = ParticleConfig & RuntimeOptions;
export type GraphViewConfig = GraphConfig & RuntimeOptions;

const runtimeDefaults: RuntimeOptions = { countMobile: 0, sizeScaleMobile: 1, blend: "additive", interactive: true, softness: 1, solid: false, mobileDpr: 1.5, bleed: false };

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

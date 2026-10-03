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
  // a finger drives the hover reactions (glow, push, parallax, excite on
  // touch); false = touch only taps and spins, as phones have no hover
  touchHover: boolean;
  // touch "drag to spin": a sideways drag on the effect turns it (graph
  // only); up/down swipes still scroll the page
  touchSpin: boolean;
  // with touchSpin: a finger held still this long (ms) grabs the effect, so
  // up/down drags turn it too instead of scrolling (0 = off)
  touchHold: number;
}

export type PointsConfig = ParticleConfig & RuntimeOptions;
export type GraphViewConfig = GraphConfig & RuntimeOptions;

// The spatial map ("What Clarify does"): a 3D scene with tabs driving its
// camera (map-scene.ts). Colors are the spatial map's dark template.
export interface MapConfig {
  // the box frame, level grids and extract edge
  frameColor: string;
  gridOpacity: number;
  // the terrain wireframe at the floor
  wireColor: string;
  wireOpacity: number;
  // relief spikes: base color -> tip color by brightness; cells darker than
  // reliefThreshold (0..1 luminance) get none
  reliefPale: string;
  reliefDeep: string;
  reliefOpacity: number;
  reliefThreshold: number;
  // the extracted coastline; hatching; region edges; anomaly ring + specks;
  // dashed trace
  coastColor: string;
  formColor: string;
  formStrongColor: string;
  accentColor: string;
  traceColor: string;
  // in-scene text
  labelColor: string;
  calloutColor: string;
  fontSans: string;
  fontMono: string;
  // the four level names, bottom to top, comma separated
  labels: string;
  extractStat: string;
  extractCaption: string;
  refineStat: string;
  refineCaption: string;
  signalTitle: string;
  signalStat: string;
  signalCaption: string;
  // camera: step-flight smoothing (s); distance multiplier; panels narrower
  // than fitAspect (w/h) move the camera back so the box fits across
  smoothTime: number;
  zoom: number;
  fitAspect: number;
  // mouse drag orbits within a step (desktop; touch never does)
  drag: boolean;
  // tabs: seconds per tab before moving on by itself (0 = only on click)
  autoplay: number;
}
export type MapViewConfig = MapConfig &
  RuntimeOptions & { hoverRadius: number; hoverStrength: number; clickBehavior: "none"; background: string };

const runtimeDefaults: RuntimeOptions = { countMobile: 0, sizeScaleMobile: 1, blend: "additive", interactive: true, softness: 1, solid: false, mobileDpr: 1.5, bleed: false, touchHover: true, touchSpin: false, touchHold: 0 };

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

export const mapDefaults: MapViewConfig = {
  ...runtimeDefaults,
  // the map's pointer handling is its own (drag), not the dots' hover/click
  interactive: false,
  touchHover: false,
  hoverRadius: 0,
  hoverStrength: 0,
  clickBehavior: "none",
  mobileDpr: 2,
  background: "transparent",
  frameColor: "#3E4143",
  gridOpacity: 0.28,
  wireColor: "#7B7E81",
  wireOpacity: 0.5,
  reliefPale: "#FFFFFF",
  reliefDeep: "#7B7E81",
  reliefOpacity: 0.7,
  reliefThreshold: 0.11,
  coastColor: "#D7D9DA",
  formColor: "#3E4143",
  formStrongColor: "#7B7E81",
  accentColor: "#D7D9DA",
  traceColor: "#7B7E81",
  labelColor: "#D7D9DA",
  calloutColor: "#D7D9DA",
  fontSans: '"Geist", system-ui, sans-serif',
  fontMono: '"Geist Mono", ui-monospace, monospace',
  labels: "The Operation, Extracted, Refined, The Signal",
  extractStat: "45M",
  extractCaption: "Sensor signals / day",
  refineStat: "162",
  refineCaption: "Active sites monitored",
  signalTitle: "The Signal",
  signalStat: "3",
  signalCaption: "Actions this week",
  smoothTime: 0.6,
  zoom: 1.09,
  fitAspect: 1,
  drag: true,
  autoplay: 7,
};

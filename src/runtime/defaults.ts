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
  // mouse "drag to spin" (desktop): pressing on the effect's zone and
  // dragging turns it, and it coasts on after release (graph and points)
  mouseSpin: boolean;
}

export type PointsConfig = ParticleConfig & RuntimeOptions;
export type GraphViewConfig = GraphConfig & RuntimeOptions;

// The spatial map ("What Clarify does"): a 3D scene with tabs driving its
// camera (map-scene.ts). Colors are the spatial map's dark template.
export interface MapConfig {
  // the box frame, level grids and extract edge
  frameColor: string;
  gridOpacity: number;
  // the box's edges (the "walls"); off leaves the level grids floating
  walls: boolean;
  // the first tab shows only the floor (raw data): everything above it
  // fades out there and back in on the other tabs
  stagedLayers: boolean;
  // the original map's forms: coastline, regions, anomaly ring, specks,
  // dashed trace (off for the staged video story)
  mapForms: boolean;
  // staged: how fast the scan plane rises when a tab builds its levels
  // (world units/s; a level is 6)
  buildSpeed: number;
  // staged: the story's speed (1 = as designed); scales the tab timelines,
  // the scan and the camera flights
  tempo: number;
  // the terrain wireframe at the floor
  wireColor: string;
  wireOpacity: number;
  // relief spikes: base color -> tip color by brightness; cells darker than
  // reliefThreshold (0..1 luminance) get none
  reliefPale: string;
  reliefDeep: string;
  reliefOpacity: number;
  reliefThreshold: number;
  // "columns" (a box per cell) or "dots": a soft point cloud at the column
  // tops, `reliefDotsPerCell` per cell, jittered; `reliefDotRise` 0..1 of
  // the column height; `reliefDotSize` in world units
  // "needles": a regular grid of hair-thin lines whose heights keep moving
  // (reliefNeedleGrid per side; reliefDriftSpeed/Scale drive the swell,
  // reliefTwinkle is the share of each needle's own flicker)
  reliefStyle: "columns" | "dots" | "needles";
  reliefNeedleGrid: number;
  // staged needles: the even height they settle to when the floor orders
  // (world units), and how long the sweep takes (s)
  reliefOrderHeight: number;
  // staged needles: how much the settled field still breathes (0 = still)
  reliefSettleSwell: number;
  // staged needles: a pulse rolling out from the floor's centre through the
  // settled field (0 = none: its strength), and seconds between pulses
  reliefPulse: number;
  reliefPulseEvery: number;
  // staged: the first tab ends on the anomaly needle and its card; off, the
  // first tab stays grey (only the floor's pulse) and the anomaly needle
  // rises on the middle tab, as the pink cluster gathers over it
  storyAnomaly: boolean;
  sweepTime: number;
  // staged: the sweep line's colour; the anomaly's (the alert) colour
  sweepColor: string;
  alertColor: string;
  // staged: the story's UI copy (HTML over the map; empty hides a line).
  // storyLevels: the level labels bottom to top, comma separated (empty
  // entries are skipped); tileLabels: the three Reasoning tiles; the
  // anomaly's card; the routing card (title, line, two actors with their
  // detail, the closing row)
  storyLevels: string;
  tileLabels: string;
  alertTag: string;
  alertTitle: string;
  alertText: string;
  routeTitle: string;
  routeText: string;
  actor1: string;
  actor1Text: string;
  actor2: string;
  actor2Text: string;
  closingLabel: string;
  closingValue: string;
  reliefDotSize: number;
  reliefDotRise: number;
  reliefDotsPerCell: number;
  // dots: how far each one sweeps along the current over its few-second
  // life (world units; 0 = still) and twinkle (0..1); either on keeps the
  // map redrawing every frame while it's on screen
  reliefDrift: number;
  reliefTwinkle: number;
  // dots: how fast they live and sweep (1 = a life every ~5-8 s)
  reliefDriftSpeed: number;
  // dots: noise frequency of the currents (smaller = bigger, smoother patches)
  reliefDriftScale: number;
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
  // the four level names, bottom to top, comma separated; their size
  // (world units)
  labels: string;
  labelSize: number;
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

const runtimeDefaults: RuntimeOptions = { countMobile: 0, sizeScaleMobile: 1, blend: "additive", interactive: true, softness: 1, solid: false, mobileDpr: 1.5, bleed: false, touchHover: true, touchSpin: false, touchHold: 0, mouseSpin: false };

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
  walls: true,
  stagedLayers: false,
  mapForms: true,
  buildSpeed: 2.2,
  tempo: 1,
  wireColor: "#7B7E81",
  wireOpacity: 0.5,
  reliefPale: "#FFFFFF",
  reliefDeep: "#7B7E81",
  reliefOpacity: 0.7,
  reliefThreshold: 0.11,
  reliefStyle: "columns",
  reliefNeedleGrid: 32,
  reliefOrderHeight: 0.9,
  reliefSettleSwell: 0,
  reliefPulse: 0,
  reliefPulseEvery: 3.5,
  storyAnomaly: true,
  sweepTime: 0.9,
  sweepColor: "#a2d0c1",
  alertColor: "#e0607e",
  storyLevels: ", Signals, Reasoning, Actions",
  tileLabels: "Asset health, Maintenance risk, Energy use",
  alertTag: "EVT-2291",
  alertTitle: "Pump 14",
  alertText: "Vibration above baseline",
  routeTitle: "Routed to",
  routeText: "EVT-2291 · Pump 14 maintenance risk",
  actor1: "Operations lead",
  actor1Text: "Person",
  actor2: "Maintenance planner",
  actor2Text: "Work order drafted",
  closingLabel: "Caught before failure",
  closingValue: "18 h",
  reliefDotSize: 0.35,
  reliefDotRise: 1,
  reliefDotsPerCell: 2,
  reliefDrift: 0,
  reliefTwinkle: 0,
  reliefDriftSpeed: 1,
  reliefDriftScale: 0.22,
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
  labelSize: 0.42,
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

// --- the integrations network (type "blocks", blocks-scene.ts): boxes
// packed together, drawn as nodes and lines (a node on every corner, a line
// along every edge, the inside ones fainter), morphing from one shape to
// the next: the nodes travel, the lines stay on them.
export interface BlocksConfig {
  shapes: string; // in turn, from: cube, cross, diamond, frame, skyline, checker, hub
  color: string;
  lineOpacity: number;
  lineWidth: number; // CSS px
  nodeSize: number; // CSS px
  nodeOpacity: number;
  backDim: number; // the far side's brightness, a share of the near side's
  inner: number; // the inside lines' and nodes' brightness, a share of the outside's (0: none)
  turnSpeed: number; // radians per s about the vertical
  holdTime: number; // s each shape holds
  morphTime: number; // s one node takes to its new place
  stagger: number; // s from the first node setting off to the last
  burst: number; // how far the nodes swing out on the way (share of their distance)
  swirl: number; // radians they swing round on the way
  overshoot: number; // 0 = plain ease, 1 = a clear pull back and settle past the mark
  spinKick: number; // how much faster the turn gets mid-morph
  boltStep: number; // s the bolt takes per line, on average
  boltFade: number; // s the light takes to fade behind it
  boltGain: number; // the bolt's brightness
  blur: number; // CSS px a node or line spreads (softens) at full speed
  blurSpeed: number; // CSS px per s on screen at which the blur is full
  streak: number; // s a moving node's streak trails behind it (0: none)
  streakGain: number; // the streak's brightness
  zoom: number; // share of the canvas the network fills
}
export type BlocksViewConfig = BlocksConfig &
  RuntimeOptions & { hoverRadius: number; hoverStrength: number; clickBehavior: "none"; background: string };

export const blocksDefaults: BlocksViewConfig = {
  ...runtimeDefaults,
  interactive: false,
  touchHover: false,
  hoverRadius: 0,
  hoverStrength: 0,
  clickBehavior: "none",
  mobileDpr: 2,
  background: "transparent",
  shapes: "cube,cross,diamond,frame,skyline,checker,hub",
  color: "#ffffff",
  lineOpacity: 0.4,
  lineWidth: 1.5,
  nodeSize: 4,
  nodeOpacity: 0.9,
  backDim: 0.3,
  inner: 0.22,
  turnSpeed: 0.12,
  holdTime: 6,
  morphTime: 1.1,
  stagger: 0.45,
  burst: 0,
  swirl: 1.6,
  overshoot: 1,
  spinKick: 5,
  boltStep: 0.07,
  boltFade: 0.45,
  boltGain: 1,
  blur: 8,
  blurSpeed: 1000,
  streak: 0.045,
  streakGain: 0.45,
  zoom: 0.92,
};

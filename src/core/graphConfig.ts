import type { ClickBehavior } from "./config";

// Graph config types, defaults and mode names — kept separate from the
// layout builders in graph.ts so the site loader can validate attributes
// without pulling the builders into its (eagerly loaded) chunk.

export const GRAPH_MODES = ["hubBurst", "geoSphere", "burstSphereMorph", "coneTorusMorph", "sequence"] as const;
export type GraphMode = (typeof GRAPH_MODES)[number];

export interface GraphConfig {
  seed: number;
  count: number;
  sizeMin: number;
  sizeMax: number;
  // node brightness range across weights (tiers)
  opacityMin: number;
  opacityMax: number;
  mode: GraphMode;
  morphSpeed: number;
  // morph position (0 = first layout, 1 = second) held when morphSpeed = 0
  morphHold: number;
  idleRotationSpeed: number;
  idleTiltAmount: number;
  hoverRadius: number;
  hoverStrength: number;
  clickBehavior: ClickBehavior;
  background: string;
  color: string;
  lineColor: string;
  lineOpacity: number;
  // edge thickness in CSS px
  lineWidth: number;
  // placement in the container: center as a fraction of width/height, and
  // a size multiplier (1 = fits comfortably; >1 overflows, cropped by the box)
  centerX: number;
  centerY: number;
  scale: number;
  // base orientation in degrees, added to the idle rotation/tilt
  rotX: number;
  rotY: number;
  // in-plane rotation of the projected graph (swings e.g. the burst hub
  // toward a corner)
  rotZ: number;
  // quantize node weights into N size/brightness steps (0 = continuous)
  tiers: number;
  // "sequence" mode: comma-separated shapes (see SHAPES below) visited in a
  // loop — hold on each for holdTime s, then morph for morphTime s. stagger
  // (0..1) offsets nodes so they don't all move in lockstep.
  sequence: string;
  holdTime: number;
  morphTime: number;
  stagger: number;
  // hover highlight: nodes near the pointer grow and brighten and their
  // edges light up (0 = off)
  hoverGlow: number;
  // fit: size every shape to stay fully inside the canvas (scale becomes a
  // multiplier capped at 1); fitPadding = extra px kept clear of the edges
  fit: boolean;
  fitPadding: number;
  // morph drama (sequence mode): mid-morph, nodes pull toward the core by
  // up to morphImplode (0..1) and swirl around the vertical axis by up to
  // morphSwirl radians — both keep nodes inside the fitted radius
  morphImplode: number;
  morphSwirl: number;
  // scatter & reform: mid-morph, nodes burst outward on screen by up to
  // this many shape radii — rightward/up/down only, never to the left
  morphScatter: number;
  // keep the shape's left edge inside the canvas (fitPadding clear) while
  // letting it bleed off the top, right and bottom — for effects that sit
  // to the right of text
  anchorLeft: boolean;
  // traveling data pulses: how many in flight, speed (px/s), color, head size
  pulses: number;
  pulseSpeed: number;
  pulseColor: string;
  pulseSize: number;
  // 3D depth cues: far nodes smaller/dimmer + perspective (0..1)
  depth: number;
  // tilt toward the pointer over the section (radians at the edge)
  parallax: number;
  // hovering near a node traces its route through the mesh to the hub
  hoverPath: boolean;
  // entrance: seconds for the nodes to fly in once the section is in view
  // (0 = off)
  intro: number;
  // excite beat: breaths per second while a data-particles-excite element
  // is hovered (0 = steady: the network just lights up)
  exciteRate: number;
}

export const defaultGraphConfig: GraphConfig = {
  seed: 4321,
  count: 140,
  sizeMin: 4,
  sizeMax: 14,
  opacityMin: 0.45,
  opacityMax: 1,
  mode: "hubBurst",
  morphSpeed: 0.4,
  morphHold: 0.5,
  idleRotationSpeed: 0.08,
  idleTiltAmount: 0.35,
  hoverRadius: 140,
  hoverStrength: 1,
  clickBehavior: "burst",
  background: "#050505",
  color: "#e8e8e8",
  lineColor: "#e8e8e8",
  lineOpacity: 0.25,
  lineWidth: 1,
  centerX: 0.5,
  centerY: 0.5,
  scale: 1,
  rotX: 0,
  rotY: 0,
  rotZ: 0,
  tiers: 0,
  sequence: "constellation,torus,helix,galaxy",
  holdTime: 4,
  morphTime: 2.5,
  stagger: 0.35,
  hoverGlow: 0,
  fit: false,
  fitPadding: 16,
  morphImplode: 0,
  morphSwirl: 0,
  morphScatter: 0,
  anchorLeft: false,
  pulses: 0,
  pulseSpeed: 180,
  pulseColor: "#a4c9e9",
  pulseSize: 3,
  depth: 0,
  parallax: 0,
  hoverPath: false,
  intro: 0,
  exciteRate: 0.35,
};

export const SHAPE_NAMES = [
  "chaosField",
  "noiseLines",
  "straightLines",
  "terrain",
  "waterfall",
  "nebula",
  "veins",
  "concentricRings",
  "square",
  "triangle",
  "sphere",
  "cube",
  "torus",
  "torusKnot",
  "hexCone",
  "octahedron",
  "icosahedron",
  "dodecahedron",
  "stellated",
  "gem",
  "cubesIntersect",
  "crossCubes",
  "interlock",
  "sacredGeometry",
  "meridians",
  "spiral",
  "burst",
] as const;
export type ShapeName = (typeof SHAPE_NAMES)[number];
export type ColorMode = "single" | "gradient" | "hueRange";
// "ripple" = a light wave spreading through the graph's connections
// (graph views; points views treat it as "none")
export type ClickBehavior = "burst" | "reshuffle" | "ripple" | "none";

export interface ParticleConfig {
  seed: number;
  count: number;
  sizeMin: number;
  sizeMax: number;
  opacityMin: number;
  opacityMax: number;
  colorMode: ColorMode;
  color1: string;
  color2: string;
  hueMin: number;
  hueMax: number;
  shape: ShapeName;
  // comma-separated shapes looped in order ("" = just `shape`): each held
  // for holdTime s, then a morph of morphTime s to the next
  sequence: string;
  holdTime: number;
  // morph to this shape and stay there ("" = the sequence or `shape`); can
  // be set live via ClarifyParticles.set()
  holdShape: string;
  // that morph: seconds, and how spread out the dots' start times are (0..0.9)
  morphTime: number;
  stagger: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  autoRotate: boolean;
  // the shape turns toward the pointer over the whole section (radians, as
  // the graph's parallax); 0 = off
  parallax: number;
  // on load the dots fly in from a scatter; false = they start formed
  gather: boolean;
  innerCopies: number;
  // size multiplier around the canvas center (1 = the shape's own size)
  scale: number;
  // size from the canvas width instead of its shorter side (full-width bands)
  scaleByWidth: boolean;
  // keep the shape inside its zone: shrink it (never grow) so the outer
  // radius stops fitPadding px inside every edge
  fit: boolean;
  fitPadding: number;
  idleMotion: boolean;
  chaos: number;
  speed: number;
  ease: number;
  hoverRadius: number;
  hoverStrength: number;
  // dots near the pointer light up (brighter, up to 60% bigger) within
  // 1.3 x hoverRadius, as the graph's hoverGlow; 0 = off
  hoverGlow: number;
  clickBehavior: ClickBehavior;
  background: string;
}

export const defaultConfig: ParticleConfig = {
  seed: 1234,
  count: 6000,
  sizeMin: 1,
  sizeMax: 2.5,
  opacityMin: 0.15,
  opacityMax: 1,
  colorMode: "single",
  color1: "#ffffff",
  color2: "#33aaff",
  hueMin: 180,
  hueMax: 220,
  shape: "concentricRings",
  sequence: "",
  holdTime: 6,
  holdShape: "",
  morphTime: 2,
  stagger: 0.4,
  rotX: 0,
  rotY: 0,
  rotZ: 0,
  autoRotate: true,
  parallax: 0,
  gather: true,
  innerCopies: 1,
  scale: 1,
  scaleByWidth: false,
  fit: false,
  fitPadding: 8,
  idleMotion: true,
  chaos: 0,
  speed: 0,
  ease: 0.06,
  hoverRadius: 120,
  hoverStrength: 1.2,
  hoverGlow: 0,
  clickBehavior: "burst",
  background: "#000000",
};

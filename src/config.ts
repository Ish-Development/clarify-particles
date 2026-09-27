export type ShapeName =
  | "chaosField"
  | "noiseLines"
  | "straightLines"
  | "terrain"
  | "waterfall"
  | "nebula"
  | "veins"
  | "concentricRings"
  | "square"
  | "triangle"
  | "sphere"
  | "cube"
  | "torus"
  | "torusKnot"
  | "hexCone"
  | "octahedron"
  | "icosahedron"
  | "dodecahedron"
  | "stellated"
  | "gem"
  | "cubesIntersect"
  | "crossCubes"
  | "interlock"
  | "sacredGeometry";
export type ColorMode = "single" | "gradient" | "hueRange";
export type ClickBehavior = "burst" | "reshuffle" | "none";

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
  rotX: number;
  rotY: number;
  rotZ: number;
  autoRotate: boolean;
  innerCopies: number;
  idleMotion: boolean;
  chaos: number;
  speed: number;
  ease: number;
  hoverRadius: number;
  hoverStrength: number;
  clickBehavior: ClickBehavior;
  background: string;
  pngFps: number;
  pngDuration: number;
  videoDuration: number;
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
  rotX: 0,
  rotY: 0,
  rotZ: 0,
  autoRotate: true,
  innerCopies: 1,
  idleMotion: true,
  chaos: 1,
  speed: 0,
  ease: 0,
  hoverRadius: 120,
  hoverStrength: 1.2,
  clickBehavior: "burst",
  background: "#000000",
  pngFps: 30,
  pngDuration: 4,
  videoDuration: 6,
};

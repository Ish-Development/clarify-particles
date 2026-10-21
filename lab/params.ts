// The export lab's procedural dials, read by the line models (lines.ts) and
// the meshes (drawings.ts) as they're built: density, a multiplier on their
// counts of lines, rings, spokes, levels and cells; dots, 1 as designed,
// above it dots appear along the lines too, below it fewer.
export const SHAPE = { density: 1, dots: 1 };

// a count, scaled by the density
export const N = (base: number, min = 2) => Math.max(min, Math.round(base * SHAPE.density));

// whether node i shows a dot, given whether it would as designed: a fixed
// hash per node, so more dots only add and fewer only take away
export function dotShown(i: number, designed: boolean) {
  const x = Math.sin(i * 12.9898 + 4.1414) * 43758.5453;
  const h = x - Math.floor(x);
  const d = SHAPE.dots;
  return designed ? d >= 1 || h < d : d > 1 && h < d - 1;
}

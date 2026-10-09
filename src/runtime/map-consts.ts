// The spatial map's shared constants: the world's size, the four levels'
// heights, and the staged story's anchors. Its own module so map-scene.ts
// and map-signals.ts (which map-scene imports) can both read them without a
// circular import.
import { MAP_DATA } from "./map-data";

export const WORLD = MAP_DATA.world; // 16
export const LEVEL_H = 6;
export const LEVEL = { floor: 0, extract: LEVEL_H, refine: LEVEL_H * 2, signal: LEVEL_H * 3 };
export const LEVELS = [LEVEL.floor, LEVEL.extract, LEVEL.refine, LEVEL.signal];
// staged: the anomaly (floor x, z), under the pink cluster, tile and ring
export const ANOMALY_XZ: [number, number] = [(13.5 / 32 - 0.5) * WORLD, (17.5 / 32 - 0.5) * WORLD];
// staged middle tab: when the scan goes on to build Reasoning (s of story
// time), after the clusters have formed; the tiles drop in then
export const REASONING_AT = 1.9;

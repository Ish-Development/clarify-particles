// More block shapes for brand assets, in the Integrations network's language
// (blocks-scene.ts): filled cells of a grid (i across, j up, k deep), a node
// on every box corner, a line along every box edge, each shape about 3
// units across. Registered with the blocks scene so `shapes` names them;
// lab only, nothing here ships.
import { fill, pick, registerBlockShape, type Cells } from "../src/runtime/blocks-scene";

const cells = (list: [number, number, number][], size: number, height = size): Cells => ({ cells: list, size, height });

export const BLOCK_SHAPES: [string, string, () => Cells][] = [
  // a stepped pyramid, four tiers
  ["pyramid", "Block pyramid", () => fill(7, 7, (i, k) => 4 - Math.max(Math.abs(i - 3), Math.abs(k - 3)), 3 / 7, 0.45)],
  // a corner of three solid tiers stepping down (i + j + k inside a bound)
  ["tetra", "Block corner", () => pick(6, (i, j, k) => i + j + k <= 5, 0.5)],
  // a staircase climbing from front to back
  ["stairs", "Block stairs", () => fill(6, 4, (i) => i + 1, 0.5, 0.5)],
  // three walls meeting at a corner, like an open box
  ["walls", "Block walls", () => pick(6, (i, j, k) => i === 0 || j === 0 || k === 0, 0.5)],
  // a voxel sphere
  ["sphere", "Block sphere", () => pick(7, (i, j, k) => (i - 3) ** 2 + (j - 3) ** 2 + (k - 3) ** 2 <= 10, 3 / 7)],
  // a flat square ring
  ["ring", "Block ring", () => pick(7, (i, j, k) => j < 2 && (i < 2 || i > 4 || k < 2 || k > 4), 3 / 7)],
  // a gateway: two pillars and a lintel
  ["arch", "Block arch", () => pick(7, (i, j, k) => k >= 2 && k <= 4 && (j >= 5 || i <= 1 || i >= 5), 3 / 7)],
  // two blocks joined by a bar: a connection
  ["bridge", "Block bridge", () => pick(9, (i, j, k) => ((i <= 2 || i >= 6) && j >= 3 && j <= 5 && k >= 3 && k <= 5) || (j === 4 && k === 4), 1 / 3)],
  // separate modules, scattered on two levels
  [
    "modules",
    "Block modules",
    () => {
      const list: [number, number, number][] = [];
      const box = (x: number, y: number, z: number) => {
        for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) list.push([x + i, y + j, z + k]);
      };
      for (const [x, y, z] of [[0, 0, 0], [3, 0, 0], [6, 0, 0], [0, 0, 3], [6, 0, 3], [3, 3, 3], [0, 0, 6], [3, 0, 6], [6, 0, 6]] as const) box(x, y, z);
      return cells(list, 3 / 8);
    },
  ],
  // slabs crossing layer by layer, like a stack of beams
  ["stack", "Block stack", () => pick(7, (i, j, k) => j < 5 && (j % 2 ? i % 3 === 0 : k % 3 === 0), 3 / 7)],
  // a field of columns rising and falling in a wave
  ["wave", "Block wave", () => fill(8, 8, (i, k) => Math.max(1, Math.round(2.5 + 1.5 * Math.sin(i * 0.8) + 1.5 * Math.cos(k * 0.8))), 3 / 8, 0.3)],
];

for (const [name, , make] of BLOCK_SHAPES) registerBlockShape(name, make);

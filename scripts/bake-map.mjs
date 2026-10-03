// Bakes the "What Clarify does" spatial map into src/runtime/map-data.ts.
//
// Source: the Clarify Spatial Data Map repo's baked terrain (a real fjord at
// Indre Harøy: 1024² elevation + satellite luminance). That repo derives the
// scene from them in the browser on every load (5 MB of assets, d3-contour);
// here the same derivation runs once, and the browser gets only the finished
// geometry: floor heights, relief cells, coastline and region outlines,
// signal specks and hatch offsets (~tens of kB).
//
//   node scripts/bake-map.mjs [--src <dir with heightmap.bin, satellite.png, meta.json>]
//
// The derivation is a port of that repo's src/scene/terrain/derive.ts,
// layers/generators.ts and layers/floor.tsx (iteration 005, dark template).

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { contours } from "d3-contour";
import { PNG } from "pngjs";

const here = dirname(fileURLToPath(import.meta.url));
const argSrc = process.argv.indexOf("--src");
const SRC =
  argSrc > -1
    ? resolve(process.argv[argSrc + 1])
    : resolve(here, "../../Clarify - Spatial Data Map/src/scene/assets/indre-haroy");
const OUT = resolve(here, "../src/runtime/map-data.ts");

// --- settings (the spatial map's dark template, as exported to Figma) ---
const WORLD = 16; // MAP_WORLD_SIZE
const THRESHOLD = 0.11; // land/water luminance split
const FLOOR_SEGMENTS = 160;
const RELIEF_RES = 64;
const SPECKS = 12;
const HATCH = 48;
const SEED = 1;
const VERTICAL_SALT = 0x11; // aquaculture

// --- inputs ---
const meta = JSON.parse(readFileSync(resolve(SRC, "meta.json"), "utf8"));
const size = meta.size;
const hBuf = readFileSync(resolve(SRC, "heightmap.bin"));
const heights = new Float32Array(hBuf.buffer.slice(hBuf.byteOffset, hBuf.byteOffset + hBuf.byteLength));
if (heights.length !== size * size) throw new Error(`heightmap: ${heights.length} values, expected ${size * size}`);
const png = PNG.sync.read(readFileSync(resolve(SRC, "satellite.png")));
if (png.width !== size || png.height !== size) throw new Error(`satellite.png is ${png.width}x${png.height}, expected ${size}`);
const luma = new Float32Array(size * size);
for (let i = 0; i < luma.length; i++) luma[i] = png.data[i * 4] / 255; // grayscale: R carries it

// --- seeded PRNG (the spatial map's seed.ts) ---
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- floor: elevation at each wireframe vertex, 0..1 of the relief range ---
// (floor.tsx buildTerrainGeometry: nearest heightmap sample per vertex)
const fn = FLOOR_SEGMENTS + 1;
const floor = new Uint8Array(fn * fn);
const range = Math.max(1, meta.elevation.max - meta.elevation.min);
for (let iy = 0; iy < fn; iy++) {
  for (let ix = 0; ix < fn; ix++) {
    const gx = Math.min(size - 1, Math.max(0, Math.round((ix / FLOOR_SEGMENTS) * (size - 1))));
    const gy = Math.min(size - 1, Math.max(0, Math.round((iy / FLOOR_SEGMENTS) * (size - 1))));
    const h = (heights[gy * size + gx] - meta.elevation.min) / range;
    floor[iy * fn + ix] = Math.round(Math.max(0, Math.min(1, h)) * 255);
  }
}

// --- relief: mean luminance under each spike cell (hanging-relief.tsx) ---
const relief = new Uint16Array(RELIEF_RES * RELIEF_RES);
{
  const stride = size / RELIEF_RES;
  const sampleStep = Math.max(1, Math.floor(stride / 4));
  for (let gy = 0; gy < RELIEF_RES; gy++) {
    for (let gx = 0; gx < RELIEF_RES; gx++) {
      let sum = 0;
      let n = 0;
      const y0 = Math.floor(gy * stride);
      const x0 = Math.floor(gx * stride);
      for (let y = y0; y < Math.min(size, y0 + stride); y += sampleStep) {
        for (let x = x0; x < Math.min(size, x0 + stride); x += sampleStep) {
          sum += luma[y * size + x];
          n++;
        }
      }
      relief[gy * RELIEF_RES + gx] = Math.round((n ? sum / n : 0) * 65535);
    }
  }
}

// --- outlines (derive.ts) ---
function shoelace(ring) {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}
function centroid(ring) {
  let cx = 0;
  let cy = 0;
  for (const [x, y] of ring) {
    cx += x;
    cy += y;
  }
  return [cx / ring.length, cy / ring.length];
}
// Ramer–Douglas–Peucker, as derive.ts simplifyRing
function simplify(ring, eps) {
  if (ring.length <= 4 || eps <= 0) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    if (e - s < 2) continue;
    const [sx, sy] = ring[s];
    const [ex, ey] = ring[e];
    const dx = ex - sx;
    const dy = ey - sy;
    const norm = Math.hypot(dx, dy);
    const degenerate = norm < 1e-9;
    let maxD = -1;
    let maxI = -1;
    for (let i = s + 1; i < e; i++) {
      const [px, py] = ring[i];
      const d = degenerate ? Math.hypot(px - sx, py - sy) : Math.abs(dy * px - dx * py + ex * sy - ey * sx) / norm;
      if (d > maxD) {
        maxD = d;
        maxI = i;
      }
    }
    if (maxD > eps && maxI > -1) {
      keep[maxI] = 1;
      stack.push([s, maxI], [maxI, e]);
    }
  }
  return ring.filter((_, i) => keep[i]);
}
const toWorld = ([gx, gy]) => [(gx / size - 0.5) * WORLD, (gy / size - 0.5) * WORLD];
function features(threshold, topK, eps = 1.5, minArea = 24) {
  const bands = contours().size([size, size]).thresholds([threshold])(Array.from(luma));
  const out = [];
  for (const band of bands) {
    for (const polygon of band.coordinates) {
      const outer = polygon[0];
      if (!outer || outer.length < 4) continue;
      const area = shoelace(outer);
      if (area < minArea) continue;
      const s = simplify(outer, eps);
      if (s.length < 4) continue;
      out.push({ ring: s.map(toWorld), area, centroid: toWorld(centroid(s)) });
    }
  }
  out.sort((a, b) => b.area - a.area);
  return out.slice(0, topK);
}
const coast = features(THRESHOLD, 1)[0];
const regions = features(Math.min(0.95, THRESHOLD + 0.18), 3);
if (!coast) throw new Error("no coastline at this threshold");

// --- specks + hatch + callout numbers (generators.ts, derive.ts) ---
const specks = [];
{
  const rng = mulberry32((SEED ^ VERTICAL_SALT ^ 0x2c) >>> 0);
  for (let i = 0; i < SPECKS; i++) {
    const r = (WORLD / 2) * 0.55 * Math.sqrt(rng());
    const theta = rng() * Math.PI * 2;
    specks.push([Math.cos(theta) * r, Math.sin(theta) * r]);
  }
}
const hatch = (() => {
  const rng = mulberry32((SEED ^ 0x47c1) >>> 0);
  return Array.from({ length: HATCH }, (_, i) => (i + (rng() - 0.5) * 0.15 * 2) / HATCH);
})();
const stats = (() => {
  const rng = mulberry32((SEED ^ VERTICAL_SALT ^ 0x5e) >>> 0);
  return {
    perDay: 38 + Math.floor(rng() * 14),
    sites: 120 + Math.floor(rng() * 140),
    actions: 2 + Math.floor(rng() * 4),
  };
})();

// --- pack ---
// rings as int16 pairs (world units x 2048: ±8 fits, 0.0005 precision)
const RING_SCALE = 2048;
function packRing(ring) {
  const a = new Int16Array(ring.length * 2);
  ring.forEach(([x, z], i) => {
    a[i * 2] = Math.round(x * RING_SCALE);
    a[i * 2 + 1] = Math.round(z * RING_SCALE);
  });
  return a;
}
const b64 = (typed) => Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength).toString("base64");
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const feature = (f) => ({ ring: b64(packRing(f.ring)), centroid: f.centroid.map(r4), area: Math.round(f.area) });

const data = {
  world: WORLD,
  threshold: THRESHOLD,
  floor: { segments: FLOOR_SEGMENTS, heights: b64(floor) },
  relief: { res: RELIEF_RES, cells: b64(relief) },
  ringScale: RING_SCALE,
  coast: feature(coast),
  regions: regions.map(feature),
  specks: specks.map((p) => p.map(r4)),
  hatch: hatch.map(r4),
};

const src = `// GENERATED by scripts/bake-map.mjs — do not edit. Re-run the script to rebake.
// The "What Clarify does" spatial map (Indre Harøy fjord), precomputed from
// the Clarify Spatial Data Map repo's baked terrain.
// Elevation: Terrain Tiles (AWS Open Data / Mapzen Terrarium). Imagery:
// Sentinel-2 cloudless by EOX IT Services GmbH (Contains modified Copernicus
// Sentinel data 2020), CC-BY 4.0 — the credit must appear near the map.
//
// floor.heights: uint8 per wireframe vertex ((segments+1)², row-major from
//   the far edge), 0..1 of the elevation range
// relief.cells: uint16 mean luminance per spike cell (res², row-major)
// rings: int16 x,z pairs in world units x ringScale
export const MAP_DATA = ${JSON.stringify(data)};
`;
writeFileSync(OUT, src);
const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
console.log(`map-data.ts written: ${kb(src.length)}`);
console.log(`  coast ${coast.ring.length} pts (area ${Math.round(coast.area)}), regions ${regions.map((r) => r.ring.length).join("/")} pts`);
console.log(`  callout numbers (seeded): ${stats.perDay}M per day, ${stats.sites} sites, ${stats.actions} actions`);

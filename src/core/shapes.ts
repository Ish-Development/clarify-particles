import type { ShapeName } from "./config";
import type { Noise2D } from "./noise";

export interface Point {
  x: number;
  y: number;
}

// Per-frame 3D params for sphere/cube: manual rotation (from the GUI) plus
// the auto-rotate tumble, with trig precomputed once per frame so the
// per-particle path stays mult/add only. `copies` nests scaled-down
// duplicates of the shape inside itself (sphere-in-sphere, cube-in-cube).
export interface Shape3D {
  cosX: number;
  sinX: number;
  cosY: number;
  sinY: number;
  cosZ: number;
  sinZ: number;
  copies: number;
}

export function makeShape3D(
  rotXDeg: number,
  rotYDeg: number,
  rotZDeg: number,
  autoT: number,
  copies: number,
): Shape3D {
  const rx = (rotXDeg * Math.PI) / 180 + autoT * 0.18;
  const ry = (rotYDeg * Math.PI) / 180 + autoT * 0.3;
  const rz = (rotZDeg * Math.PI) / 180;
  return {
    cosX: Math.cos(rx),
    sinX: Math.sin(rx),
    cosY: Math.cos(ry),
    sinY: Math.sin(ry),
    cosZ: Math.cos(rz),
    sinZ: Math.sin(rz),
    copies: Math.max(1, Math.round(copies)),
  };
}

// Rotate a unit-space 3D point (X, then Y, then Z axis) and project it
// orthographically. Depth is discarded and nothing is culled — back-facing
// points stay visible, which is the intended see-through dot look.
function project3D(x: number, y: number, z: number, r: Shape3D, cx: number, cy: number, scale: number, out: Point) {
  const y1 = y * r.cosX - z * r.sinX;
  const z1 = y * r.sinX + z * r.cosX;
  const x2 = x * r.cosY + z1 * r.sinY;
  const x3 = x2 * r.cosZ - y1 * r.sinZ;
  const y3 = x2 * r.sinZ + y1 * r.cosZ;
  out.x = cx + x3 * scale;
  out.y = cy + y3 * scale;
}

// Splits n particles across `copies` nested shells (outermost first, shell g
// scaled by (copies-g)/copies). Every shell gets the SAME particle count, so
// inner copies pack denser and read tighter/more defined than the parent.
const shell = { scale: 1, idx: 0, count: 1 };
function shellFor(i: number, n: number, copies: number) {
  if (copies <= 1) {
    shell.scale = 1;
    shell.idx = i;
    shell.count = n;
    return;
  }
  const per = Math.max(1, Math.floor(n / copies));
  const g = Math.min(copies - 1, Math.floor(i / per));
  const c = g === copies - 1 ? Math.max(1, n - per * (copies - 1)) : per;
  shell.scale = (copies - g) / copies;
  shell.idx = Math.min(i - g * per, c - 1);
  shell.count = c;
}

// Each shape function maps a deterministic particle index (0..n-1) to a
// point in pixel space, plus a small time-driven wobble so the shape stays
// alive even at chaos = 0. Writes into `out` to avoid per-frame allocation.

function chaosFieldPoint(i: number, n: number, w: number, h: number, t: number, noise: Noise2D, out: Point) {
  const cols = Math.max(1, Math.ceil(Math.sqrt((n * w) / h)));
  const rows = Math.max(1, Math.ceil(n / cols));
  const col = i % cols;
  const row = Math.floor(i / cols);
  const cellW = w / cols;
  const cellH = h / rows;
  const baseX = (col + 0.5) * cellW;
  const baseY = (row + 0.5) * cellH;
  const nx = noise.noise(col * 0.15, row * 0.15 + t * 0.3);
  const ny = noise.noise(col * 0.15 + 50, row * 0.15 + t * 0.3);
  const jitter = Math.min(cellW, cellH) * 0.9;
  out.x = baseX + nx * jitter;
  out.y = baseY + ny * jitter;
}

function noiseLinesPoint(i: number, n: number, w: number, h: number, t: number, noise: Noise2D, out: Point) {
  const rowCount = Math.max(8, Math.round(Math.sqrt(n / 3)));
  const perRow = Math.max(1, Math.ceil(n / rowCount));
  const row = Math.floor(i / perRow);
  const col = i % perRow;
  const rowY = (row + 0.5) * (h / rowCount);
  const x = (col + 0.5) * (w / perRow);
  const wobble = noise.noise(x * 0.01, row * 0.5 + t * 0.5) * (h / rowCount) * 1.5;
  const microJitter = noise.noise(x * 0.2 + 100, row * 2 + t) * 4;
  out.x = x;
  out.y = rowY + wobble + microJitter;
}

function straightLinesPoint(i: number, n: number, w: number, h: number, t: number, noise: Noise2D, out: Point) {
  const rowCount = Math.max(8, Math.round(Math.sqrt(n / 3)));
  const perRow = Math.max(1, Math.ceil(n / rowCount));
  const row = Math.floor(i / perRow);
  const col = i % perRow;
  const rowY = (row + 0.5) * (h / rowCount);
  const x = (col + 0.5) * (w / perRow);
  const microJitter = noise.noise(x * 0.2 + 100, row * 2 + t) * 1.5;
  out.x = x;
  out.y = rowY + microJitter;
}

// Undulating dot sea in true perspective: a world-space grid (log-spaced in
// depth so screen row spacing stays even), wave height from two noise
// octaves, projected through a pinhole camera. Foreground rows roll off the
// bottom edge and the frustum widens with depth, so the surface covers the
// whole frame. Scrolls toward the viewer as t advances.
function terrainPoint(i: number, n: number, w: number, h: number, t: number, noise: Noise2D, out: Point) {
  const rows = Math.max(16, Math.round(Math.sqrt(n / 3)));
  const perRow = Math.max(1, Math.ceil(n / rows));
  const row = Math.min(rows - 1, Math.floor(i / perRow));
  const col = i - row * perRow;
  const v = (row + 0.5) / rows;
  const u = (col + 0.5) / perRow;
  const fl = Math.max(w, h) * 0.55;
  const camH = 2.8;
  // depth range derived from the projection itself, so at ANY aspect ratio
  // the nearest row's baseline lands just past the bottom edge and the
  // farthest just above the top — surface fills the whole frame, no sky
  const zNear = (camH * fl) / (h * 1.31);
  const zFar = (camH * fl) / (h * 0.18);
  const z = zNear * Math.pow(zFar / zNear, v);
  // world x chosen so every row projects to exactly full frame width — world
  // spacing still widens with depth, which is what gives the perspective
  const x = (u - 0.5) * z * ((w * 1.04) / fl);
  const e1 = noise.noise(x * 0.32 + 5, z * 0.32 - t * 0.45);
  const e2 = noise.noise(x * 0.85 + 40, z * 0.85 - t * 0.45) * 0.5;
  const y = (e1 + e2) * 1.15;
  out.x = w / 2 + (x / z) * fl;
  out.y = -h * 0.16 + ((camH - y) / z) * fl;
}

// Falling streams across the full frame width: each particle owns a stream
// position and a loop phase; vertical position accelerates downward
// (pow > 1) and the horizontal noise wiggle widens toward the bottom.
function waterfallPoint(i: number, _n: number, w: number, h: number, t: number, noise: Noise2D, out: Point) {
  const u = (i * R2_A) % 1;
  const phase = (i * R2_B) % 1;
  const fall = (phase + t * 0.12) % 1;
  const spread = 4 + fall * fall * w * 0.1;
  const wiggle = noise.noise(u * 12 + 3, fall * 5 + t * 0.3) * spread;
  // wrap so streams pushed past an edge re-enter on the other side — the
  // frame edges never go thin
  out.x = ((((u * w + wiggle) % w) + w) % w);
  out.y = Math.pow(fall, 1.35) * h;
}

// Smoke / nebula: a stable quasi-random scatter pushed through two rounds of
// domain warping. The warp makes the density non-uniform — particles bunch
// into soft filaments and voids like drifting smoke. Morphs slowly with t.
function nebulaPoint(i: number, _n: number, w: number, h: number, t: number, noise: Noise2D, out: Point) {
  const px = (i * R2_A) % 1;
  const py = (i * R2_B) % 1;
  const wx1 = noise.noise(px * 1.6 + 13, py * 1.6 + t * 0.05);
  const wy1 = noise.noise(px * 1.6 + 71, py * 1.6 - t * 0.05);
  const qx = px + wx1 * 0.5;
  const qy = py + wy1 * 0.5;
  const wx2 = noise.noise(qx * 3.4 + 23, qy * 3.4 + t * 0.08);
  const wy2 = noise.noise(qx * 3.4 + 91, qy * 3.4 + 47);
  // wrap the warped position back into the frame (torus topology): a dot
  // pushed off one edge re-enters on the opposite side, so no side of the
  // screen ever thins out
  const fx = px + wx1 * 0.22 + wx2 * 0.1;
  const fy = py + wy1 * 0.22 + wy2 * 0.1;
  out.x = (((fx % 1) + 1) % 1) * w;
  out.y = (((fy % 1) + 1) % 1) * h;
}

// Lightning-vein web: particles start on a quasi-random scatter and take a
// few gradient-ascent steps up a noise field. Ascent paths converge onto the
// field's ridge lines long before its peaks, so the dots pile into a
// branching full-screen web. Gradient via forward differences.
function veinsPoint(i: number, _n: number, w: number, h: number, t: number, noise: Noise2D, out: Point) {
  let px = (i * R2_A) % 1;
  let py = (i * R2_B) % 1;
  const f = 3.2;
  const eps = 0.02;
  const tt = t * 0.06;
  for (let k = 0; k < 3; k++) {
    const c = noise.noise(px * f + 7, py * f - tt);
    const gx = (noise.noise((px + eps) * f + 7, py * f - tt) - c) / eps;
    const gy = (noise.noise(px * f + 7, (py + eps) * f - tt) - c) / eps;
    px += gx * 0.004;
    py += gy * 0.004;
  }
  out.x = px * w;
  out.y = py * h;
}

// Shared by concentricRings / square / triangle: particles are assigned to
// concentric "ring" layers (contiguous index blocks sized so dot density
// per layer stays even), evenly spaced by angle within a layer. `sides`
// bends the circle into a regular polygon via the standard "polygon radius
// as a function of angle" formula (sides < 3 keeps it a true circle).
function polygonRingsPoint(
  i: number,
  n: number,
  w: number,
  h: number,
  t: number,
  noise: Noise2D,
  out: Point,
  sides: number,
  rotationOffset: number,
) {
  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.min(w, h) * 0.42;
  const ringCount = Math.max(6, Math.round(Math.sqrt(n) / 2));
  const total = (ringCount * (ringCount + 1)) / 2;

  let ring = ringCount - 1;
  let countInRing = 1;
  let startIdx = 0;
  let cum = 0;
  for (let r = 1; r <= ringCount; r++) {
    const c = Math.max(1, Math.round((n * r) / total));
    if (i < cum + c || r === ringCount) {
      ring = r - 1;
      countInRing = c;
      startIdx = cum;
      break;
    }
    cum += c;
  }

  const baseRadius = ((ring + 1) / ringCount) * maxR;
  const within = i - startIdx;
  // shapeAngle defines the polygon's radius profile (unrotated); rotation
  // (ring de-correlation, time drift, the static rotationOffset) is applied
  // only to the final placement angle. Folding rotationOffset into
  // shapeAngle would be a no-op — it sweeps the full 0..2π range per ring
  // either way, so a constant shift there doesn't change the point set.
  const shapeAngle = (within / countInRing) * Math.PI * 2;
  // de-correlating each ring's phase avoids a visible radial spoke for the
  // circle, but for polygons it must be skipped — it would rotate each
  // ring's vertices out of alignment and blur the crisp edges.
  const ringPhase = sides < 3 ? ring * 0.37 : 0;
  const angle = shapeAngle + ringPhase + t * 0.05 + rotationOffset;

  let radius = baseRadius;
  if (sides >= 3) {
    const a = (Math.PI * 2) / sides;
    const theta2 = (((shapeAngle % a) + a) % a) - a / 2;
    radius = (baseRadius * Math.cos(a / 2)) / Math.cos(theta2);
  }

  const jitterR = noise.noise(Math.cos(angle) * 3 + ring, Math.sin(angle) * 3 + t * 0.2) * (maxR / ringCount) * 0.25;
  out.x = cx + Math.cos(angle) * (radius + jitterR);
  out.y = cy + Math.sin(angle) * (radius + jitterR);
}

const GOLDEN_ANGLE = 2.39996322972865332;

// Fibonacci sphere lattice, rotated by the shared 3D params and projected
// orthographically — classic technique for an evenly dotted sphere.
function spherePoint(i: number, n: number, w: number, h: number, _t: number, _noise: Noise2D, out: Point, three: Shape3D) {
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) * 0.38;
  shellFor(i, n, three.copies);
  const y = 1 - (shell.idx / Math.max(1, shell.count - 1)) * 2;
  const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = shell.idx * GOLDEN_ANGLE;
  project3D(Math.cos(theta) * radiusAtY, y, Math.sin(theta) * radiusAtY, three, cx, cy, R * shell.scale, out);
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}
const v3: Vec3 = { x: 0, y: 0, z: 0 };

// j-th of m particles on the surface of a unit cube (grid layout per face),
// written into `vec` — shared by the cube shape and the intersecting-cubes
// experiment.
function cubeSurface(j: number, m: number, vec: Vec3) {
  const perFace = Math.max(1, Math.ceil(m / 6));
  const faceIdx = Math.min(5, Math.floor(j / perFace));
  const within = j - faceIdx * perFace;
  const cols = Math.max(1, Math.ceil(Math.sqrt(perFace)));
  const rows = Math.max(1, Math.ceil(perFace / cols));
  const col = within % cols;
  const row = Math.floor(within / cols);
  const u = ((col + 0.5) / cols) * 2 - 1;
  const v = ((row + 0.5) / rows) * 2 - 1;

  switch (faceIdx) {
    case 0:
      vec.x = u; vec.y = v; vec.z = 1;
      break;
    case 1:
      vec.x = u; vec.y = v; vec.z = -1;
      break;
    case 2:
      vec.x = 1; vec.y = v; vec.z = u;
      break;
    case 3:
      vec.x = -1; vec.y = v; vec.z = u;
      break;
    case 4:
      vec.x = u; vec.y = 1; vec.z = v;
      break;
    default:
      vec.x = u; vec.y = -1; vec.z = v;
      break;
  }
}

// Particles assigned to the 6 faces of a cube (grid layout per face), then
// rotated in 3D and projected orthographically (z discarded, no occlusion —
// additive blending makes the overlap read fine for a dot-cube look).
function cubePoint(i: number, n: number, w: number, h: number, _t: number, _noise: Noise2D, out: Point, three: Shape3D) {
  const cx = w / 2;
  const cy = h / 2;
  const half = Math.min(w, h) * 0.28;
  shellFor(i, n, three.copies);
  cubeSurface(shell.idx, shell.count, v3);
  project3D(v3.x, v3.y, v3.z, three, cx, cy, half * shell.scale, out);
}

// Two unit cubes sharing a center, the second pre-rotated 45° about Y then
// ~35.26° about X (the classic two-cube star compound) before the shared
// user/auto rotation is applied.
const CUBE2_C = Math.SQRT1_2;
const CUBE2_TILT = Math.atan(Math.SQRT1_2);
const CUBE2_COS = Math.cos(CUBE2_TILT);
const CUBE2_SIN = Math.sin(CUBE2_TILT);
function cubesIntersectPoint(i: number, n: number, w: number, h: number, _t: number, _noise: Noise2D, out: Point, three: Shape3D) {
  const cx = w / 2;
  const cy = h / 2;
  const half = Math.min(w, h) * 0.26;
  shellFor(i, n, three.copies);
  const firstCount = Math.max(1, Math.ceil(shell.count / 2));
  const second = shell.idx >= firstCount;
  const j = second ? shell.idx - firstCount : shell.idx;
  const m = second ? Math.max(1, shell.count - firstCount) : firstCount;
  cubeSurface(j, m, v3);
  if (second) {
    const x1 = v3.x * CUBE2_C + v3.z * CUBE2_C;
    const z1 = -v3.x * CUBE2_C + v3.z * CUBE2_C;
    const y1 = v3.y * CUBE2_COS - z1 * CUBE2_SIN;
    v3.z = v3.y * CUBE2_SIN + z1 * CUBE2_COS;
    v3.x = x1;
    v3.y = y1;
  }
  project3D(v3.x, v3.y, v3.z, three, cx, cy, half * shell.scale, out);
}

// Quasi-random torus surface: golden-angle steps around the main ring and an
// incommensurate step around the tube keep the dots evenly spread without
// visible seams. Face-on by default (ring in the screen plane).
const TUBE_STEP = Math.PI * 2 * (Math.SQRT2 - 1);
function torusPoint(i: number, n: number, w: number, h: number, _t: number, _noise: Noise2D, out: Point, three: Shape3D) {
  const cx = w / 2;
  const cy = h / 2;
  const S = Math.min(w, h) * 0.42;
  shellFor(i, n, three.copies);
  const R0 = 0.72;
  const r0 = 0.28;
  const theta = shell.idx * GOLDEN_ANGLE;
  const phi = shell.idx * TUBE_STEP;
  const ring = R0 + r0 * Math.cos(phi);
  project3D(Math.cos(theta) * ring, Math.sin(theta) * ring, r0 * Math.sin(phi), three, cx, cy, S * shell.scale, out);
}

// (p=2, q=3) trefoil torus knot: particles walk the center curve, offset by
// a tube radius in the plane perpendicular to the curve tangent (frame built
// from a numerical tangent + a fixed up vector).
function knotAt(s: number, vec: Vec3) {
  const ring = 2 + Math.cos(3 * s);
  vec.x = ring * Math.cos(2 * s);
  vec.y = ring * Math.sin(2 * s);
  vec.z = Math.sin(3 * s);
}
const knotP: Vec3 = { x: 0, y: 0, z: 0 };
const knotQ: Vec3 = { x: 0, y: 0, z: 0 };
function torusKnotPoint(i: number, n: number, w: number, h: number, _t: number, _noise: Noise2D, out: Point, three: Shape3D) {
  const cx = w / 2;
  const cy = h / 2;
  const S = (Math.min(w, h) * 0.42) / 3.2;
  shellFor(i, n, three.copies);
  const s = (shell.idx / shell.count) * Math.PI * 2;
  knotAt(s, knotP);
  knotAt(s + 0.01, knotQ);
  let tx = knotQ.x - knotP.x;
  let ty = knotQ.y - knotP.y;
  let tz = knotQ.z - knotP.z;
  const tl = Math.hypot(tx, ty, tz) || 1;
  tx /= tl; ty /= tl; tz /= tl;
  // B = normalize(T × up), N = T × B, with up = (0, 0, 1) — the knot's own
  // axis, so the tangent never degenerates against it on this curve
  let bx = ty;
  let by = -tx;
  const bl = Math.hypot(bx, by) || 1;
  bx /= bl; by /= bl;
  const nx = ty * 0 - tz * by;
  const ny = tz * bx - tx * 0;
  const nz = tx * by - ty * bx;
  const phi = shell.idx * GOLDEN_ANGLE;
  const tube = 0.38;
  const ox = (Math.cos(phi) * bx + Math.sin(phi) * nx) * tube;
  const oy = (Math.cos(phi) * by + Math.sin(phi) * ny) * tube;
  const oz = Math.sin(phi) * nz * tube;
  project3D(knotP.x + ox, knotP.y + oy, knotP.z + oz, three, cx, cy, S * shell.scale, out);
}

// Hexagonal cone: stacked hexagon rings shrinking to an apex, counts per
// ring proportional to perimeter so density stays even; vertex phases stay
// aligned across rings so the cone edges read crisp.
function hexConePoint(i: number, n: number, w: number, h: number, _t: number, _noise: Noise2D, out: Point, three: Shape3D) {
  const cx = w / 2;
  const cy = h / 2;
  const S = Math.min(w, h) * 0.36;
  shellFor(i, n, three.copies);
  const m = shell.count;
  const levels = Math.max(5, Math.round(Math.sqrt(m) / 1.5));
  const total = (levels * (levels + 1)) / 2;
  let level = levels - 1;
  let countInLevel = 1;
  let startIdx = 0;
  let cum = 0;
  for (let l = 1; l <= levels; l++) {
    const c = Math.max(1, Math.round((m * l) / total));
    if (shell.idx < cum + c || l === levels) {
      level = l - 1;
      countInLevel = c;
      startIdx = cum;
      break;
    }
    cum += c;
  }
  const f = (level + 1) / levels;
  const within = shell.idx - startIdx;
  const angle = (within / countInLevel) * Math.PI * 2;
  const a = (Math.PI * 2) / 6;
  const theta2 = (((angle % a) + a) % a) - a / 2;
  const rad = ((f * 0.85 * Math.cos(a / 2)) / Math.cos(theta2)) * 1.0;
  project3D(Math.cos(angle) * rad, f * 2 - 1, Math.sin(angle) * rad, three, cx, cy, S * shell.scale, out);
}

// --- polyhedron triangle tables (built once at module load) ---
// Triangles are stored flat as [x0,y0,z0, x1,y1,z1, x2,y2,z2] in unit space.
// Each table holds mutually congruent triangles, so even dot density only
// needs an equal particle count per triangle.

const PHI = (1 + Math.sqrt(5)) / 2;

const ICO_VERTS: number[][] = (() => {
  const t = PHI;
  const raw = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];
  const len = Math.hypot(1, t);
  return raw.map((v) => [v[0] / len, v[1] / len, v[2] / len]);
})();

const ICO_FACES = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];

const ICO_TRIS: number[][] = ICO_FACES.map((f) => [
  ...ICO_VERTS[f[0]], ...ICO_VERTS[f[1]], ...ICO_VERTS[f[2]],
]);

// Stellation: a pyramid spike raised over every icosahedron face — the
// 20-point star of the old polyhedra plates.
const STAR_TRIS: number[][] = (() => {
  const tris: number[][] = [];
  const spike = 1.9;
  for (const f of ICO_FACES) {
    const A = ICO_VERTS[f[0]];
    const B = ICO_VERTS[f[1]];
    const C = ICO_VERTS[f[2]];
    let mx = (A[0] + B[0] + C[0]) / 3;
    let my = (A[1] + B[1] + C[1]) / 3;
    let mz = (A[2] + B[2] + C[2]) / 3;
    const ml = Math.hypot(mx, my, mz) || 1;
    mx = (mx / ml) * spike;
    my = (my / ml) * spike;
    mz = (mz / ml) * spike;
    tris.push([...A, ...B, mx, my, mz], [...B, ...C, mx, my, mz], [...C, ...A, mx, my, mz]);
  }
  return tris;
})();

// Dodecahedron faces are found via duality: each of the 12 pentagon faces
// centers on an icosahedron vertex direction, and its 5 corners are the 5
// dodecahedron vertices closest to that direction, ordered by angle in the
// face plane and fanned into triangles around the face center.
const DODECA_TRIS: number[][] = (() => {
  const iv = 1 / PHI;
  const verts: number[][] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) verts.push([sx, sy, sz]);
  for (const s1 of [-1, 1]) {
    for (const s2 of [-1, 1]) {
      verts.push([0, s1 * iv, s2 * PHI], [s1 * iv, s2 * PHI, 0], [s1 * PHI, 0, s2 * iv]);
    }
  }
  const s3 = Math.sqrt(3);
  for (const v of verts) {
    v[0] /= s3; v[1] /= s3; v[2] /= s3;
  }
  const tris: number[][] = [];
  for (const nrm of ICO_VERTS) {
    const ring = verts
      .map((v) => ({ v, d: v[0] * nrm[0] + v[1] * nrm[1] + v[2] * nrm[2] }))
      .sort((p, q) => q.d - p.d)
      .slice(0, 5)
      .map((p) => p.v);
    const c = [0, 0, 0];
    for (const v of ring) {
      c[0] += v[0] / 5; c[1] += v[1] / 5; c[2] += v[2] / 5;
    }
    let ux = ring[0][0] - c[0];
    let uy = ring[0][1] - c[1];
    let uz = ring[0][2] - c[2];
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul; uy /= ul; uz /= ul;
    const wx = nrm[1] * uz - nrm[2] * uy;
    const wy = nrm[2] * ux - nrm[0] * uz;
    const wz = nrm[0] * uy - nrm[1] * ux;
    const angleOf = (v: number[]) =>
      Math.atan2(
        (v[0] - c[0]) * wx + (v[1] - c[1]) * wy + (v[2] - c[2]) * wz,
        (v[0] - c[0]) * ux + (v[1] - c[1]) * uy + (v[2] - c[2]) * uz,
      );
    ring.sort((p, q) => angleOf(p) - angleOf(q));
    for (let k = 0; k < 5; k++) {
      tris.push([...c, ...ring[k], ...ring[(k + 1) % 5]]);
    }
  }
  return tris;
})();

// Octahedron: 8 triangular faces (one per octant), each sampled with the R2
// low-discrepancy sequence folded into barycentric coordinates.
const R2_A = 0.7548776662466927;
const R2_B = 0.5698402909980532;

// Even sampling over a congruent-triangle list: equal particle block per
// triangle, R2 barycentric within it.
function triListPoint(
  tris: number[][],
  i: number,
  n: number,
  w: number,
  h: number,
  out: Point,
  three: Shape3D,
  S: number,
) {
  const cx = w / 2;
  const cy = h / 2;
  shellFor(i, n, three.copies);
  const perTri = Math.max(1, Math.ceil(shell.count / tris.length));
  const tIdx = Math.min(tris.length - 1, Math.floor(shell.idx / perTri));
  const within = shell.idx - tIdx * perTri;
  let a = (within * R2_A) % 1;
  let b = (within * R2_B) % 1;
  if (a + b > 1) {
    a = 1 - a;
    b = 1 - b;
  }
  const c = 1 - a - b;
  const T = tris[tIdx];
  project3D(
    T[0] * a + T[3] * b + T[6] * c,
    T[1] * a + T[4] * b + T[7] * c,
    T[2] * a + T[5] * b + T[8] * c,
    three,
    cx,
    cy,
    S * shell.scale,
    out,
  );
}

// Hexagonal bipyramid — the elongated "gem" solid from the plates. Stacked
// crisp hexagon rings whose radius peaks at the equator and tapers to both
// apexes; ring counts follow the radius so density stays even.
function gemPoint(i: number, n: number, w: number, h: number, _t: number, _noise: Noise2D, out: Point, three: Shape3D) {
  const cx = w / 2;
  const cy = h / 2;
  const S = Math.min(w, h) * 0.4;
  shellFor(i, n, three.copies);
  const m = shell.count;
  const levels = Math.max(7, Math.round(Math.sqrt(m) / 1.5)) | 1;
  let total = 0;
  for (let l = 0; l < levels; l++) {
    total += Math.max(0.08, 1 - Math.abs((2 * l) / (levels - 1) - 1));
  }
  let level = levels - 1;
  let countInLevel = 1;
  let startIdx = 0;
  let cum = 0;
  for (let l = 0; l < levels; l++) {
    const wt = Math.max(0.08, 1 - Math.abs((2 * l) / (levels - 1) - 1));
    const c = Math.max(1, Math.round((m * wt) / total));
    if (shell.idx < cum + c || l === levels - 1) {
      level = l;
      countInLevel = c;
      startIdx = cum;
      break;
    }
    cum += c;
  }
  const rProfile = (1 - Math.abs((2 * level) / (levels - 1) - 1)) * 0.62;
  const within = shell.idx - startIdx;
  const angle = (within / countInLevel) * Math.PI * 2;
  const a = (Math.PI * 2) / 6;
  const theta2 = (((angle % a) + a) % a) - a / 2;
  const rad = (rProfile * Math.cos(a / 2)) / Math.cos(theta2);
  project3D(Math.cos(angle) * rad, (level / (levels - 1)) * 2 - 1, Math.sin(angle) * rad, three, cx, cy, S * shell.scale, out);
}

// Three orthogonal elongated boxes through a common center — the 3D plus /
// cross solid from the plates.
function crossCubesPoint(i: number, n: number, w: number, h: number, _t: number, _noise: Noise2D, out: Point, three: Shape3D) {
  const cx = w / 2;
  const cy = h / 2;
  const half = Math.min(w, h) * 0.3;
  shellFor(i, n, three.copies);
  const m = shell.count;
  const per = Math.max(1, Math.ceil(m / 3));
  const box = Math.min(2, Math.floor(shell.idx / per));
  const j = shell.idx - box * per;
  const mj = box === 2 ? Math.max(1, m - 2 * per) : per;
  cubeSurface(j, mj, v3);
  const A = 0.38;
  if (box === 0) {
    v3.y *= A; v3.z *= A;
  } else if (box === 1) {
    v3.x *= A; v3.z *= A;
  } else {
    v3.x *= A; v3.y *= A;
  }
  project3D(v3.x, v3.y, v3.z, three, cx, cy, half * shell.scale, out);
}

// Burr-knot interlock ("Intersect" poster): three orthogonal square-section
// beams, each offset sideways in a cycle (X beam up, Y beam forward, Z beam
// right) so they wrap around one another instead of meeting at the center.
// The D/3 shift re-centers the compound's centroid on the origin.
function interlockPoint(i: number, n: number, w: number, h: number, _t: number, _noise: Noise2D, out: Point, three: Shape3D) {
  const cx = w / 2;
  const cy = h / 2;
  const half = Math.min(w, h) * 0.28;
  shellFor(i, n, three.copies);
  const m = shell.count;
  const per = Math.max(1, Math.ceil(m / 3));
  const box = Math.min(2, Math.floor(shell.idx / per));
  const j = shell.idx - box * per;
  const mj = box === 2 ? Math.max(1, m - 2 * per) : per;
  cubeSurface(j, mj, v3);
  const A = 0.3;
  const D = 0.32;
  if (box === 0) {
    v3.y = v3.y * A + D; v3.z *= A;
  } else if (box === 1) {
    v3.x *= A; v3.z = v3.z * A + D;
  } else {
    v3.x = v3.x * A + D; v3.y *= A;
  }
  project3D(v3.x - D / 3, v3.y - D / 3, v3.z - D / 3, three, cx, cy, half * shell.scale, out);
}
function octahedronPoint(i: number, n: number, w: number, h: number, _t: number, _noise: Noise2D, out: Point, three: Shape3D) {
  const cx = w / 2;
  const cy = h / 2;
  const S = Math.min(w, h) * 0.38;
  shellFor(i, n, three.copies);
  const perFace = Math.max(1, Math.ceil(shell.count / 8));
  const face = Math.min(7, Math.floor(shell.idx / perFace));
  const within = shell.idx - face * perFace;
  let a = (within * R2_A) % 1;
  let b = (within * R2_B) % 1;
  if (a + b > 1) {
    a = 1 - a;
    b = 1 - b;
  }
  const c = 1 - a - b;
  const sx = face & 1 ? 1 : -1;
  const sy = face & 2 ? 1 : -1;
  const sz = face & 4 ? 1 : -1;
  project3D(sx * a, sy * b, sz * c, three, cx, cy, S * shell.scale, out);
}

// "Seed of Life": one center circle + 6 surrounding circles on a hex
// lattice, all the same radius — the classic sacred-geometry starting motif.
function sacredGeometryPoint(i: number, n: number, w: number, h: number, t: number, noise: Noise2D, out: Point) {
  const cx = w / 2;
  const cy = h / 2;
  const overallR = Math.min(w, h) * 0.42;
  const circleR = overallR * 0.5;
  const centerDist = circleR;
  const numCircles = 7;
  const perCircle = Math.max(1, Math.ceil(n / numCircles));
  const circleIdx = Math.min(numCircles - 1, Math.floor(i / perCircle));
  const within = i - circleIdx * perCircle;
  const countInThisCircle = Math.min(perCircle, n - circleIdx * perCircle) || 1;

  let centerX = cx;
  let centerY = cy;
  if (circleIdx > 0) {
    const hexAngle = (circleIdx - 1) * (Math.PI / 3);
    centerX = cx + Math.cos(hexAngle) * centerDist;
    centerY = cy + Math.sin(hexAngle) * centerDist;
  }

  const angle = (within / countInThisCircle) * Math.PI * 2 + t * 0.05;
  const jitter = noise.noise(Math.cos(angle) * 3 + circleIdx, Math.sin(angle) * 3 + t * 0.2) * circleR * 0.03;
  out.x = centerX + Math.cos(angle) * (circleR + jitter);
  out.y = centerY + Math.sin(angle) * (circleR + jitter);
}

export function shapePoint(
  shape: ShapeName,
  i: number,
  n: number,
  w: number,
  h: number,
  t: number,
  noise: Noise2D,
  out: Point,
  three: Shape3D,
  // chaos shapes get their own clock: speed-driven time plus the idle drift,
  // so they keep moving at speed = 0 when idleMotion is on
  tChaos: number = t,
) {
  switch (shape) {
    case "chaosField":
      chaosFieldPoint(i, n, w, h, tChaos, noise, out);
      break;
    case "noiseLines":
      noiseLinesPoint(i, n, w, h, t, noise, out);
      break;
    case "straightLines":
      straightLinesPoint(i, n, w, h, t, noise, out);
      break;
    case "terrain":
      terrainPoint(i, n, w, h, tChaos, noise, out);
      break;
    case "waterfall":
      waterfallPoint(i, n, w, h, tChaos, noise, out);
      break;
    case "nebula":
      nebulaPoint(i, n, w, h, tChaos, noise, out);
      break;
    case "veins":
      veinsPoint(i, n, w, h, tChaos, noise, out);
      break;
    case "concentricRings":
      polygonRingsPoint(i, n, w, h, t, noise, out, 0, 0);
      break;
    case "square":
      polygonRingsPoint(i, n, w, h, t, noise, out, 4, Math.PI / 4);
      break;
    case "triangle":
      polygonRingsPoint(i, n, w, h, t, noise, out, 3, -Math.PI / 2);
      break;
    case "sphere":
      spherePoint(i, n, w, h, t, noise, out, three);
      break;
    case "cube":
      cubePoint(i, n, w, h, t, noise, out, three);
      break;
    case "torus":
      torusPoint(i, n, w, h, t, noise, out, three);
      break;
    case "torusKnot":
      torusKnotPoint(i, n, w, h, t, noise, out, three);
      break;
    case "hexCone":
      hexConePoint(i, n, w, h, t, noise, out, three);
      break;
    case "octahedron":
      octahedronPoint(i, n, w, h, t, noise, out, three);
      break;
    case "icosahedron":
      triListPoint(ICO_TRIS, i, n, w, h, out, three, Math.min(w, h) * 0.4);
      break;
    case "dodecahedron":
      triListPoint(DODECA_TRIS, i, n, w, h, out, three, Math.min(w, h) * 0.4);
      break;
    case "stellated":
      triListPoint(STAR_TRIS, i, n, w, h, out, three, Math.min(w, h) * 0.22);
      break;
    case "gem":
      gemPoint(i, n, w, h, t, noise, out, three);
      break;
    case "cubesIntersect":
      cubesIntersectPoint(i, n, w, h, t, noise, out, three);
      break;
    case "crossCubes":
      crossCubesPoint(i, n, w, h, t, noise, out, three);
      break;
    case "interlock":
      interlockPoint(i, n, w, h, t, noise, out, three);
      break;
    case "sacredGeometry":
      sacredGeometryPoint(i, n, w, h, t, noise, out);
      break;
  }
}

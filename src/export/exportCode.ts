import type { ParticleConfig } from "../config";
import { downloadBlob } from "./shared";

// Produces a single self-contained HTML file: the current config baked in,
// plus a plain-JS reimplementation of the engine (no build step, no
// dependencies) so it can be dropped anywhere and opened directly.
export function exportStandaloneHtml(cfg: ParticleConfig) {
  const html = buildHtml(cfg);
  const blob = new Blob([html], { type: "text/html" });
  downloadBlob(blob, `particle-system-${Date.now()}.html`);
}

function buildHtml(cfg: ParticleConfig): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Particle System (exported)</title>
<style>
  html, body { margin: 0; padding: 0; background: #0a0a0a; overflow: hidden; height: 100%; }
  canvas { display: block; }
</style>
</head>
<body>
<canvas id="canvas"></canvas>
<script>
"use strict";
var CONFIG = ${JSON.stringify(cfg, null, 2)};

function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeRng(seed) {
  var next = mulberry32(seed);
  return { next: next, range: function (min, max) { return min + next() * (max - min); } };
}

function Noise2D(seed) {
  var rand = mulberry32(seed);
  var p = new Uint8Array(256);
  for (var i = 0; i < 256; i++) p[i] = i;
  for (var i = 255; i > 0; i--) {
    var j = Math.floor(rand() * (i + 1));
    var tmp = p[i]; p[i] = p[j]; p[j] = tmp;
  }
  this.perm = new Uint8Array(512);
  for (var i = 0; i < 512; i++) this.perm[i] = p[i & 255];
}
Noise2D.prototype.grad = function (hash, x, y) {
  var h = hash & 7;
  var u = h < 4 ? x : y;
  var v = h < 4 ? y : x;
  return (h & 1 ? -u : u) + (h & 2 ? -2 * v : 2 * v);
};
Noise2D.prototype.fade = function (t) { return t * t * t * (t * (t * 6 - 15) + 10); };
Noise2D.prototype.lerp = function (a, b, t) { return a + t * (b - a); };
Noise2D.prototype.noise = function (x, y) {
  var X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
  var xf = x - Math.floor(x), yf = y - Math.floor(y);
  var u = this.fade(xf), v = this.fade(yf);
  var perm = this.perm;
  var aa = perm[X + perm[Y]], ab = perm[X + perm[Y + 1]];
  var ba = perm[X + 1 + perm[Y]], bb = perm[X + 1 + perm[Y + 1]];
  var x1 = this.lerp(this.grad(aa, xf, yf), this.grad(ba, xf - 1, yf), u);
  var x2 = this.lerp(this.grad(ab, xf, yf - 1), this.grad(bb, xf - 1, yf - 1), u);
  return this.lerp(x1, x2, v) / 2;
};

function polygonRingsPoint(i, n, w, h, t, noise, out, sides, rotationOffset) {
  var cx = w / 2, cy = h / 2;
  var maxR = Math.min(w, h) * 0.42;
  var ringCount = Math.max(6, Math.round(Math.sqrt(n) / 2));
  var total = (ringCount * (ringCount + 1)) / 2;
  var ring = ringCount - 1, countInRing = 1, startIdx = 0, cum = 0;
  for (var r = 1; r <= ringCount; r++) {
    var c = Math.max(1, Math.round((n * r) / total));
    if (i < cum + c || r === ringCount) { ring = r - 1; countInRing = c; startIdx = cum; break; }
    cum += c;
  }
  var baseRadius = ((ring + 1) / ringCount) * maxR;
  var within = i - startIdx;
  var shapeAngle = (within / countInRing) * Math.PI * 2;
  var ringPhase = sides < 3 ? ring * 0.37 : 0;
  var angle = shapeAngle + ringPhase + t * 0.05 + rotationOffset;
  var radius = baseRadius;
  if (sides >= 3) {
    var a = (Math.PI * 2) / sides;
    var theta2 = (((shapeAngle % a) + a) % a) - a / 2;
    radius = (baseRadius * Math.cos(a / 2)) / Math.cos(theta2);
  }
  var jitterR = noise.noise(Math.cos(angle) * 3 + ring, Math.sin(angle) * 3 + t * 0.2) * (maxR / ringCount) * 0.25;
  out.x = cx + Math.cos(angle) * (radius + jitterR);
  out.y = cy + Math.sin(angle) * (radius + jitterR);
}

var GOLDEN_ANGLE = 2.39996322972865332;

function makeShape3D(rotXDeg, rotYDeg, rotZDeg, autoT, copies) {
  var rx = (rotXDeg * Math.PI) / 180 + autoT * 0.18;
  var ry = (rotYDeg * Math.PI) / 180 + autoT * 0.3;
  var rz = (rotZDeg * Math.PI) / 180;
  return {
    cosX: Math.cos(rx), sinX: Math.sin(rx),
    cosY: Math.cos(ry), sinY: Math.sin(ry),
    cosZ: Math.cos(rz), sinZ: Math.sin(rz),
    copies: Math.max(1, Math.round(copies || 1))
  };
}

// orthographic projection, no backface culling — every point stays visible
function project3D(x, y, z, r, cx, cy, scale, out) {
  var y1 = y * r.cosX - z * r.sinX;
  var z1 = y * r.sinX + z * r.cosX;
  var x2 = x * r.cosY + z1 * r.sinY;
  var x3 = x2 * r.cosZ - y1 * r.sinZ;
  var y3 = x2 * r.sinZ + y1 * r.cosZ;
  out.x = cx + x3 * scale;
  out.y = cy + y3 * scale;
}

var shell = { scale: 1, idx: 0, count: 1 };
function shellFor(i, n, copies) {
  if (copies <= 1) { shell.scale = 1; shell.idx = i; shell.count = n; return; }
  var per = Math.max(1, Math.floor(n / copies));
  var g = Math.min(copies - 1, Math.floor(i / per));
  var c = g === copies - 1 ? Math.max(1, n - per * (copies - 1)) : per;
  shell.scale = (copies - g) / copies;
  shell.idx = Math.min(i - g * per, c - 1);
  shell.count = c;
}

function spherePoint(i, n, w, h, t, noise, out, three) {
  var cx = w / 2, cy = h / 2;
  var R = Math.min(w, h) * 0.38;
  shellFor(i, n, three.copies);
  var y = 1 - (shell.idx / Math.max(1, shell.count - 1)) * 2;
  var radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
  var theta = shell.idx * GOLDEN_ANGLE;
  project3D(Math.cos(theta) * radiusAtY, y, Math.sin(theta) * radiusAtY, three, cx, cy, R * shell.scale, out);
}

var v3 = { x: 0, y: 0, z: 0 };
function cubeSurface(j, m, vec) {
  var perFace = Math.max(1, Math.ceil(m / 6));
  var faceIdx = Math.min(5, Math.floor(j / perFace));
  var within = j - faceIdx * perFace;
  var cols = Math.max(1, Math.ceil(Math.sqrt(perFace)));
  var rows = Math.max(1, Math.ceil(perFace / cols));
  var col = within % cols, row = Math.floor(within / cols);
  var u = ((col + 0.5) / cols) * 2 - 1;
  var v = ((row + 0.5) / rows) * 2 - 1;
  switch (faceIdx) {
    case 0: vec.x = u; vec.y = v; vec.z = 1; break;
    case 1: vec.x = u; vec.y = v; vec.z = -1; break;
    case 2: vec.x = 1; vec.y = v; vec.z = u; break;
    case 3: vec.x = -1; vec.y = v; vec.z = u; break;
    case 4: vec.x = u; vec.y = 1; vec.z = v; break;
    default: vec.x = u; vec.y = -1; vec.z = v; break;
  }
}

function cubePoint(i, n, w, h, t, noise, out, three) {
  var cx = w / 2, cy = h / 2;
  var half = Math.min(w, h) * 0.28;
  shellFor(i, n, three.copies);
  cubeSurface(shell.idx, shell.count, v3);
  project3D(v3.x, v3.y, v3.z, three, cx, cy, half * shell.scale, out);
}

var CUBE2_C = Math.SQRT1_2;
var CUBE2_TILT = Math.atan(Math.SQRT1_2);
var CUBE2_COS = Math.cos(CUBE2_TILT), CUBE2_SIN = Math.sin(CUBE2_TILT);
function cubesIntersectPoint(i, n, w, h, t, noise, out, three) {
  var cx = w / 2, cy = h / 2;
  var half = Math.min(w, h) * 0.26;
  shellFor(i, n, three.copies);
  var firstCount = Math.max(1, Math.ceil(shell.count / 2));
  var second = shell.idx >= firstCount;
  var j = second ? shell.idx - firstCount : shell.idx;
  var m = second ? Math.max(1, shell.count - firstCount) : firstCount;
  cubeSurface(j, m, v3);
  if (second) {
    var x1 = v3.x * CUBE2_C + v3.z * CUBE2_C;
    var z1 = -v3.x * CUBE2_C + v3.z * CUBE2_C;
    var y1 = v3.y * CUBE2_COS - z1 * CUBE2_SIN;
    v3.z = v3.y * CUBE2_SIN + z1 * CUBE2_COS;
    v3.x = x1;
    v3.y = y1;
  }
  project3D(v3.x, v3.y, v3.z, three, cx, cy, half * shell.scale, out);
}

var TUBE_STEP = Math.PI * 2 * (Math.SQRT2 - 1);
function torusPoint(i, n, w, h, t, noise, out, three) {
  var cx = w / 2, cy = h / 2;
  var S = Math.min(w, h) * 0.42;
  shellFor(i, n, three.copies);
  var R0 = 0.72, r0 = 0.28;
  var theta = shell.idx * GOLDEN_ANGLE;
  var phi = shell.idx * TUBE_STEP;
  var ring = R0 + r0 * Math.cos(phi);
  project3D(Math.cos(theta) * ring, Math.sin(theta) * ring, r0 * Math.sin(phi), three, cx, cy, S * shell.scale, out);
}

function knotAt(s, vec) {
  var ring = 2 + Math.cos(3 * s);
  vec.x = ring * Math.cos(2 * s);
  vec.y = ring * Math.sin(2 * s);
  vec.z = Math.sin(3 * s);
}
var knotP = { x: 0, y: 0, z: 0 }, knotQ = { x: 0, y: 0, z: 0 };
function torusKnotPoint(i, n, w, h, t, noise, out, three) {
  var cx = w / 2, cy = h / 2;
  var S = (Math.min(w, h) * 0.42) / 3.2;
  shellFor(i, n, three.copies);
  var s = (shell.idx / shell.count) * Math.PI * 2;
  knotAt(s, knotP);
  knotAt(s + 0.01, knotQ);
  var tx = knotQ.x - knotP.x, ty = knotQ.y - knotP.y, tz = knotQ.z - knotP.z;
  var tl = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
  tx /= tl; ty /= tl; tz /= tl;
  var bx = ty, by = -tx;
  var bl = Math.sqrt(bx * bx + by * by) || 1;
  bx /= bl; by /= bl;
  var nx = -tz * by;
  var ny = tz * bx;
  var nz = tx * by - ty * bx;
  var phi = shell.idx * GOLDEN_ANGLE;
  var tube = 0.38;
  var ox = (Math.cos(phi) * bx + Math.sin(phi) * nx) * tube;
  var oy = (Math.cos(phi) * by + Math.sin(phi) * ny) * tube;
  var oz = Math.sin(phi) * nz * tube;
  project3D(knotP.x + ox, knotP.y + oy, knotP.z + oz, three, cx, cy, S * shell.scale, out);
}

function hexConePoint(i, n, w, h, t, noise, out, three) {
  var cx = w / 2, cy = h / 2;
  var S = Math.min(w, h) * 0.36;
  shellFor(i, n, three.copies);
  var m = shell.count;
  var levels = Math.max(5, Math.round(Math.sqrt(m) / 1.5));
  var total = (levels * (levels + 1)) / 2;
  var level = levels - 1, countInLevel = 1, startIdx = 0, cum = 0;
  for (var l = 1; l <= levels; l++) {
    var c = Math.max(1, Math.round((m * l) / total));
    if (shell.idx < cum + c || l === levels) { level = l - 1; countInLevel = c; startIdx = cum; break; }
    cum += c;
  }
  var f = (level + 1) / levels;
  var within = shell.idx - startIdx;
  var angle = (within / countInLevel) * Math.PI * 2;
  var a = (Math.PI * 2) / 6;
  var theta2 = (((angle % a) + a) % a) - a / 2;
  var rad = (f * 0.85 * Math.cos(a / 2)) / Math.cos(theta2);
  project3D(Math.cos(angle) * rad, f * 2 - 1, Math.sin(angle) * rad, three, cx, cy, S * shell.scale, out);
}

var PHI = (1 + Math.sqrt(5)) / 2;
var ICO_VERTS = (function () {
  var t = PHI;
  var raw = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
  ];
  var len = Math.sqrt(1 + t * t);
  return raw.map(function (v) { return [v[0] / len, v[1] / len, v[2] / len]; });
})();
var ICO_FACES = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
];
var ICO_TRIS = ICO_FACES.map(function (f) {
  return ICO_VERTS[f[0]].concat(ICO_VERTS[f[1]], ICO_VERTS[f[2]]);
});
var STAR_TRIS = (function () {
  var tris = [], spike = 1.9;
  for (var fi = 0; fi < ICO_FACES.length; fi++) {
    var f = ICO_FACES[fi];
    var A = ICO_VERTS[f[0]], B = ICO_VERTS[f[1]], C = ICO_VERTS[f[2]];
    var mx = (A[0] + B[0] + C[0]) / 3, my = (A[1] + B[1] + C[1]) / 3, mz = (A[2] + B[2] + C[2]) / 3;
    var ml = Math.sqrt(mx * mx + my * my + mz * mz) || 1;
    mx = (mx / ml) * spike; my = (my / ml) * spike; mz = (mz / ml) * spike;
    tris.push(A.concat(B, [mx, my, mz]), B.concat(C, [mx, my, mz]), C.concat(A, [mx, my, mz]));
  }
  return tris;
})();
var DODECA_TRIS = (function () {
  var iv = 1 / PHI;
  var verts = [];
  [-1, 1].forEach(function (sx) { [-1, 1].forEach(function (sy) { [-1, 1].forEach(function (sz) { verts.push([sx, sy, sz]); }); }); });
  [-1, 1].forEach(function (s1) {
    [-1, 1].forEach(function (s2) {
      verts.push([0, s1 * iv, s2 * PHI], [s1 * iv, s2 * PHI, 0], [s1 * PHI, 0, s2 * iv]);
    });
  });
  var s3 = Math.sqrt(3);
  verts.forEach(function (v) { v[0] /= s3; v[1] /= s3; v[2] /= s3; });
  var tris = [];
  ICO_VERTS.forEach(function (nrm) {
    var ring = verts
      .map(function (v) { return { v: v, d: v[0] * nrm[0] + v[1] * nrm[1] + v[2] * nrm[2] }; })
      .sort(function (p, q) { return q.d - p.d; })
      .slice(0, 5)
      .map(function (p) { return p.v; });
    var c = [0, 0, 0];
    ring.forEach(function (v) { c[0] += v[0] / 5; c[1] += v[1] / 5; c[2] += v[2] / 5; });
    var ux = ring[0][0] - c[0], uy = ring[0][1] - c[1], uz = ring[0][2] - c[2];
    var ul = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
    ux /= ul; uy /= ul; uz /= ul;
    var wx = nrm[1] * uz - nrm[2] * uy;
    var wy = nrm[2] * ux - nrm[0] * uz;
    var wz = nrm[0] * uy - nrm[1] * ux;
    function angleOf(v) {
      return Math.atan2(
        (v[0] - c[0]) * wx + (v[1] - c[1]) * wy + (v[2] - c[2]) * wz,
        (v[0] - c[0]) * ux + (v[1] - c[1]) * uy + (v[2] - c[2]) * uz
      );
    }
    ring.sort(function (p, q) { return angleOf(p) - angleOf(q); });
    for (var k = 0; k < 5; k++) tris.push(c.concat(ring[k], ring[(k + 1) % 5]));
  });
  return tris;
})();

function triListPoint(tris, i, n, w, h, out, three, S) {
  var cx = w / 2, cy = h / 2;
  shellFor(i, n, three.copies);
  var perTri = Math.max(1, Math.ceil(shell.count / tris.length));
  var tIdx = Math.min(tris.length - 1, Math.floor(shell.idx / perTri));
  var within = shell.idx - tIdx * perTri;
  var a = (within * R2_A) % 1;
  var b = (within * R2_B) % 1;
  if (a + b > 1) { a = 1 - a; b = 1 - b; }
  var c = 1 - a - b;
  var T = tris[tIdx];
  project3D(
    T[0] * a + T[3] * b + T[6] * c,
    T[1] * a + T[4] * b + T[7] * c,
    T[2] * a + T[5] * b + T[8] * c,
    three, cx, cy, S * shell.scale, out
  );
}

function gemPoint(i, n, w, h, t, noise, out, three) {
  var cx = w / 2, cy = h / 2;
  var S = Math.min(w, h) * 0.4;
  shellFor(i, n, three.copies);
  var m = shell.count;
  var levels = Math.max(7, Math.round(Math.sqrt(m) / 1.5)) | 1;
  var total = 0;
  for (var l = 0; l < levels; l++) total += Math.max(0.08, 1 - Math.abs((2 * l) / (levels - 1) - 1));
  var level = levels - 1, countInLevel = 1, startIdx = 0, cum = 0;
  for (var l2 = 0; l2 < levels; l2++) {
    var wt = Math.max(0.08, 1 - Math.abs((2 * l2) / (levels - 1) - 1));
    var c = Math.max(1, Math.round((m * wt) / total));
    if (shell.idx < cum + c || l2 === levels - 1) { level = l2; countInLevel = c; startIdx = cum; break; }
    cum += c;
  }
  var rProfile = (1 - Math.abs((2 * level) / (levels - 1) - 1)) * 0.62;
  var within = shell.idx - startIdx;
  var angle = (within / countInLevel) * Math.PI * 2;
  var a = (Math.PI * 2) / 6;
  var theta2 = (((angle % a) + a) % a) - a / 2;
  var rad = (rProfile * Math.cos(a / 2)) / Math.cos(theta2);
  project3D(Math.cos(angle) * rad, (level / (levels - 1)) * 2 - 1, Math.sin(angle) * rad, three, cx, cy, S * shell.scale, out);
}

function crossCubesPoint(i, n, w, h, t, noise, out, three) {
  var cx = w / 2, cy = h / 2;
  var half = Math.min(w, h) * 0.3;
  shellFor(i, n, three.copies);
  var m = shell.count;
  var per = Math.max(1, Math.ceil(m / 3));
  var box = Math.min(2, Math.floor(shell.idx / per));
  var j = shell.idx - box * per;
  var mj = box === 2 ? Math.max(1, m - 2 * per) : per;
  cubeSurface(j, mj, v3);
  var A = 0.38;
  if (box === 0) { v3.y *= A; v3.z *= A; }
  else if (box === 1) { v3.x *= A; v3.z *= A; }
  else { v3.x *= A; v3.y *= A; }
  project3D(v3.x, v3.y, v3.z, three, cx, cy, half * shell.scale, out);
}

function terrainPoint(i, n, w, h, t, noise, out) {
  var rows = Math.max(16, Math.round(Math.sqrt(n / 3)));
  var perRow = Math.max(1, Math.ceil(n / rows));
  var row = Math.min(rows - 1, Math.floor(i / perRow));
  var col = i - row * perRow;
  var v = (row + 0.5) / rows;
  var u = (col + 0.5) / perRow;
  var fl = Math.max(w, h) * 0.55;
  var camH = 2.8;
  var zNear = (camH * fl) / (h * 1.31);
  var zFar = (camH * fl) / (h * 0.18);
  var z = zNear * Math.pow(zFar / zNear, v);
  var x = (u - 0.5) * z * ((w * 1.04) / fl);
  var e1 = noise.noise(x * 0.32 + 5, z * 0.32 - t * 0.45);
  var e2 = noise.noise(x * 0.85 + 40, z * 0.85 - t * 0.45) * 0.5;
  var y = (e1 + e2) * 1.15;
  out.x = w / 2 + (x / z) * fl;
  out.y = -h * 0.16 + ((camH - y) / z) * fl;
}

function waterfallPoint(i, n, w, h, t, noise, out) {
  var u = (i * R2_A) % 1;
  var phase = (i * R2_B) % 1;
  var fall = (phase + t * 0.12) % 1;
  var spread = 4 + fall * fall * w * 0.1;
  var wiggle = noise.noise(u * 12 + 3, fall * 5 + t * 0.3) * spread;
  out.x = ((((u * w + wiggle) % w) + w) % w);
  out.y = Math.pow(fall, 1.35) * h;
}

function nebulaPoint(i, n, w, h, t, noise, out) {
  var px = (i * R2_A) % 1;
  var py = (i * R2_B) % 1;
  var wx1 = noise.noise(px * 1.6 + 13, py * 1.6 + t * 0.05);
  var wy1 = noise.noise(px * 1.6 + 71, py * 1.6 - t * 0.05);
  var qx = px + wx1 * 0.5;
  var qy = py + wy1 * 0.5;
  var wx2 = noise.noise(qx * 3.4 + 23, qy * 3.4 + t * 0.08);
  var wy2 = noise.noise(qx * 3.4 + 91, qy * 3.4 + 47);
  var fx = px + wx1 * 0.22 + wx2 * 0.1;
  var fy = py + wy1 * 0.22 + wy2 * 0.1;
  out.x = (((fx % 1) + 1) % 1) * w;
  out.y = (((fy % 1) + 1) % 1) * h;
}

function veinsPoint(i, n, w, h, t, noise, out) {
  var px = (i * R2_A) % 1;
  var py = (i * R2_B) % 1;
  var f = 3.2, eps = 0.02;
  var tt = t * 0.06;
  for (var k = 0; k < 3; k++) {
    var c = noise.noise(px * f + 7, py * f - tt);
    var gx = (noise.noise((px + eps) * f + 7, py * f - tt) - c) / eps;
    var gy = (noise.noise(px * f + 7, (py + eps) * f - tt) - c) / eps;
    px += gx * 0.004;
    py += gy * 0.004;
  }
  out.x = px * w;
  out.y = py * h;
}

function interlockPoint(i, n, w, h, t, noise, out, three) {
  var cx = w / 2, cy = h / 2;
  var half = Math.min(w, h) * 0.28;
  shellFor(i, n, three.copies);
  var m = shell.count;
  var per = Math.max(1, Math.ceil(m / 3));
  var box = Math.min(2, Math.floor(shell.idx / per));
  var j = shell.idx - box * per;
  var mj = box === 2 ? Math.max(1, m - 2 * per) : per;
  cubeSurface(j, mj, v3);
  var A = 0.3, D = 0.32;
  if (box === 0) { v3.y = v3.y * A + D; v3.z *= A; }
  else if (box === 1) { v3.x *= A; v3.z = v3.z * A + D; }
  else { v3.x = v3.x * A + D; v3.y *= A; }
  project3D(v3.x - D / 3, v3.y - D / 3, v3.z - D / 3, three, cx, cy, half * shell.scale, out);
}

var R2_A = 0.7548776662466927, R2_B = 0.5698402909980532;
function octahedronPoint(i, n, w, h, t, noise, out, three) {
  var cx = w / 2, cy = h / 2;
  var S = Math.min(w, h) * 0.38;
  shellFor(i, n, three.copies);
  var perFace = Math.max(1, Math.ceil(shell.count / 8));
  var face = Math.min(7, Math.floor(shell.idx / perFace));
  var within = shell.idx - face * perFace;
  var a = (within * R2_A) % 1;
  var b = (within * R2_B) % 1;
  if (a + b > 1) { a = 1 - a; b = 1 - b; }
  var c = 1 - a - b;
  var sx = face & 1 ? 1 : -1, sy = face & 2 ? 1 : -1, sz = face & 4 ? 1 : -1;
  project3D(sx * a, sy * b, sz * c, three, cx, cy, S * shell.scale, out);
}

function sacredGeometryPoint(i, n, w, h, t, noise, out) {
  var cx = w / 2, cy = h / 2;
  var overallR = Math.min(w, h) * 0.42;
  var circleR = overallR * 0.5;
  var centerDist = circleR;
  var numCircles = 7;
  var perCircle = Math.max(1, Math.ceil(n / numCircles));
  var circleIdx = Math.min(numCircles - 1, Math.floor(i / perCircle));
  var within = i - circleIdx * perCircle;
  var countInThisCircle = Math.min(perCircle, n - circleIdx * perCircle) || 1;
  var centerX = cx, centerY = cy;
  if (circleIdx > 0) {
    var hexAngle = (circleIdx - 1) * (Math.PI / 3);
    centerX = cx + Math.cos(hexAngle) * centerDist;
    centerY = cy + Math.sin(hexAngle) * centerDist;
  }
  var angle = (within / countInThisCircle) * Math.PI * 2 + t * 0.05;
  var jitter = noise.noise(Math.cos(angle) * 3 + circleIdx, Math.sin(angle) * 3 + t * 0.2) * circleR * 0.03;
  out.x = centerX + Math.cos(angle) * (circleR + jitter);
  out.y = centerY + Math.sin(angle) * (circleR + jitter);
}

function shapePoint(shape, i, n, w, h, t, noise, out, three, tChaos) {
  if (tChaos === undefined) tChaos = t;
  if (shape === "chaosField") {
    t = tChaos;
    var cols = Math.max(1, Math.ceil(Math.sqrt((n * w) / h)));
    var rows = Math.max(1, Math.ceil(n / cols));
    var col = i % cols, row = Math.floor(i / cols);
    var cellW = w / cols, cellH = h / rows;
    var baseX = (col + 0.5) * cellW, baseY = (row + 0.5) * cellH;
    var nx = noise.noise(col * 0.15, row * 0.15 + t * 0.3);
    var ny = noise.noise(col * 0.15 + 50, row * 0.15 + t * 0.3);
    var jitter = Math.min(cellW, cellH) * 0.9;
    out.x = baseX + nx * jitter;
    out.y = baseY + ny * jitter;
  } else if (shape === "noiseLines") {
    var rowCount = Math.max(8, Math.round(Math.sqrt(n / 3)));
    var perRow = Math.max(1, Math.ceil(n / rowCount));
    var row2 = Math.floor(i / perRow), col2 = i % perRow;
    var rowY = (row2 + 0.5) * (h / rowCount);
    var x = (col2 + 0.5) * (w / perRow);
    var wobble = noise.noise(x * 0.01, row2 * 0.5 + t * 0.5) * (h / rowCount) * 1.5;
    var microJitter = noise.noise(x * 0.2 + 100, row2 * 2 + t) * 4;
    out.x = x;
    out.y = rowY + wobble + microJitter;
  } else if (shape === "straightLines") {
    var rowCount2 = Math.max(8, Math.round(Math.sqrt(n / 3)));
    var perRow2 = Math.max(1, Math.ceil(n / rowCount2));
    var row3 = Math.floor(i / perRow2), col3 = i % perRow2;
    var rowY2 = (row3 + 0.5) * (h / rowCount2);
    var x2 = (col3 + 0.5) * (w / perRow2);
    var microJitter2 = noise.noise(x2 * 0.2 + 100, row3 * 2 + t) * 1.5;
    out.x = x2;
    out.y = rowY2 + microJitter2;
  } else if (shape === "terrain") {
    terrainPoint(i, n, w, h, tChaos, noise, out);
  } else if (shape === "waterfall") {
    waterfallPoint(i, n, w, h, tChaos, noise, out);
  } else if (shape === "nebula") {
    nebulaPoint(i, n, w, h, tChaos, noise, out);
  } else if (shape === "veins") {
    veinsPoint(i, n, w, h, tChaos, noise, out);
  } else if (shape === "concentricRings") {
    polygonRingsPoint(i, n, w, h, t, noise, out, 0, 0);
  } else if (shape === "square") {
    polygonRingsPoint(i, n, w, h, t, noise, out, 4, Math.PI / 4);
  } else if (shape === "triangle") {
    polygonRingsPoint(i, n, w, h, t, noise, out, 3, -Math.PI / 2);
  } else if (shape === "sphere") {
    spherePoint(i, n, w, h, t, noise, out, three);
  } else if (shape === "cube") {
    cubePoint(i, n, w, h, t, noise, out, three);
  } else if (shape === "torus") {
    torusPoint(i, n, w, h, t, noise, out, three);
  } else if (shape === "torusKnot") {
    torusKnotPoint(i, n, w, h, t, noise, out, three);
  } else if (shape === "hexCone") {
    hexConePoint(i, n, w, h, t, noise, out, three);
  } else if (shape === "octahedron") {
    octahedronPoint(i, n, w, h, t, noise, out, three);
  } else if (shape === "icosahedron") {
    triListPoint(ICO_TRIS, i, n, w, h, out, three, Math.min(w, h) * 0.4);
  } else if (shape === "dodecahedron") {
    triListPoint(DODECA_TRIS, i, n, w, h, out, three, Math.min(w, h) * 0.4);
  } else if (shape === "stellated") {
    triListPoint(STAR_TRIS, i, n, w, h, out, three, Math.min(w, h) * 0.22);
  } else if (shape === "gem") {
    gemPoint(i, n, w, h, t, noise, out, three);
  } else if (shape === "crossCubes") {
    crossCubesPoint(i, n, w, h, t, noise, out, three);
  } else if (shape === "interlock") {
    interlockPoint(i, n, w, h, t, noise, out, three);
  } else if (shape === "cubesIntersect") {
    cubesIntersectPoint(i, n, w, h, t, noise, out, three);
  } else if (shape === "sacredGeometry") {
    sacredGeometryPoint(i, n, w, h, t, noise, out);
  }
}

function ParticleSystem(cfg, w, h) {
  this.cfg = cfg;
  this.scratch = { x: 0, y: 0 };
  this.lastW = w;
  this.lastH = h;
  this.rotTime = 0;
  this.idleTime = 0;
  this.rebuild(w, h);
}
ParticleSystem.prototype.rebuild = function (w, h) {
  if (w === undefined) w = this.lastW;
  if (h === undefined) h = this.lastH;
  this.lastW = w;
  this.lastH = h;
  var cfg = this.cfg, n = cfg.count;
  this.count = n;
  this.time = 0;
  this.noise = new Noise2D(cfg.seed);
  var rng = makeRng((cfg.seed ^ 0x9e3779b9) >>> 0);
  this.baseX = new Float32Array(n); this.baseY = new Float32Array(n);
  this.offX = new Float32Array(n); this.offY = new Float32Array(n);
  this.offVX = new Float32Array(n); this.offVY = new Float32Array(n);
  this.size = new Float32Array(n); this.opacity = new Float32Array(n);
  this.colorT = new Float32Array(n);
  this.scatterBaseX = new Float32Array(n); this.scatterBaseY = new Float32Array(n);
  this.scatterSeed = new Float32Array(n);
  for (var i = 0; i < n; i++) {
    this.size[i] = rng.range(cfg.sizeMin, cfg.sizeMax);
    this.opacity[i] = rng.range(cfg.opacityMin, cfg.opacityMax);
    this.colorT[i] = rng.next();
    this.scatterBaseX[i] = rng.next();
    this.scatterBaseY[i] = rng.next();
    this.scatterSeed[i] = rng.next() * 1000;
    this.baseX[i] = this.scatterBaseX[i] * w;
    this.baseY[i] = this.scatterBaseY[i] * h;
  }
};
ParticleSystem.prototype.update = function (dt, w, h) {
  var cfg = this.cfg;
  this.time += dt * cfg.speed;
  var t = this.time, n = this.count, chaos = cfg.chaos;
  var easeFactor = 1 - Math.pow(1 - cfg.ease, dt * 60);
  if (cfg.autoRotate) this.rotTime += dt;
  if (cfg.idleMotion) this.idleTime += dt * 0.35;
  var tChaos = t + this.idleTime;
  var three = makeShape3D(cfg.rotX || 0, cfg.rotY || 0, cfg.rotZ || 0, this.rotTime, cfg.innerCopies || 1);
  var out = this.scratch, k = 60, damp = 8;
  for (var i = 0; i < n; i++) {
    shapePoint(cfg.shape, i, n, w, h, t, this.noise, out, three, tChaos);
    var driftX = this.noise.noise(this.scatterSeed[i], tChaos * 0.15) * 0.5 + 0.5;
    var driftY = this.noise.noise(this.scatterSeed[i] + 500, tChaos * 0.15) * 0.5 + 0.5;
    var scatterX = ((this.scatterBaseX[i] + driftX * 0.15) % 1) * w;
    var scatterY = ((this.scatterBaseY[i] + driftY * 0.15) % 1) * h;
    var tx = out.x + (scatterX - out.x) * chaos;
    var ty = out.y + (scatterY - out.y) * chaos;
    this.baseX[i] += (tx - this.baseX[i]) * easeFactor;
    this.baseY[i] += (ty - this.baseY[i]) * easeFactor;
    var ax = -k * this.offX[i] - damp * this.offVX[i];
    var ay = -k * this.offY[i] - damp * this.offVY[i];
    this.offVX[i] += ax * dt; this.offVY[i] += ay * dt;
    this.offX[i] += this.offVX[i] * dt; this.offY[i] += this.offVY[i] * dt;
  }
};

var SPRITE_BUCKETS = 32, SPRITE_SIZE = 64;
function hexToRgb(hex) {
  var h = hex.replace("#", "");
  return { r: parseInt(h.substring(0, 2), 16), g: parseInt(h.substring(2, 4), 16), b: parseInt(h.substring(4, 6), 16) };
}
function lerpHexColor(c1, c2, t) {
  var a = hexToRgb(c1), b = hexToRgb(c2);
  return "rgb(" + Math.round(a.r + (b.r - a.r) * t) + ", " + Math.round(a.g + (b.g - a.g) * t) + ", " + Math.round(a.b + (b.b - a.b) * t) + ")";
}
function bucketColor(cfg, t) {
  if (cfg.colorMode === "single") return cfg.color1;
  if (cfg.colorMode === "gradient") return lerpHexColor(cfg.color1, cfg.color2, t);
  var hue = cfg.hueMin + (cfg.hueMax - cfg.hueMin) * t;
  return "hsl(" + hue + ", 85%, 65%)";
}
function buildSpriteCache(cfg) {
  var sprites = [];
  for (var b = 0; b < SPRITE_BUCKETS; b++) {
    var c = document.createElement("canvas");
    c.width = SPRITE_SIZE; c.height = SPRITE_SIZE;
    var ctx = c.getContext("2d");
    var color = bucketColor(cfg, b / (SPRITE_BUCKETS - 1));
    var grad = ctx.createRadialGradient(SPRITE_SIZE / 2, SPRITE_SIZE / 2, 0, SPRITE_SIZE / 2, SPRITE_SIZE / 2, SPRITE_SIZE / 2);
    grad.addColorStop(0, color);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
    sprites.push(c);
  }
  return sprites;
}
function render(ctx, w, h, system, sprites, background) {
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "lighter";
  var n = system.count, bucketCount = sprites.length;
  for (var i = 0; i < n; i++) {
    var x = system.baseX[i] + system.offX[i];
    var y = system.baseY[i] + system.offY[i];
    var s = system.size[i] * 6;
    var bucket = Math.min(bucketCount - 1, Math.floor(system.colorT[i] * bucketCount));
    ctx.globalAlpha = system.opacity[i];
    ctx.drawImage(sprites[bucket], x - s / 2, y - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

// --- bootstrap ---
var canvas = document.getElementById("canvas");
var ctx = canvas.getContext("2d");
var w = window.innerWidth, h = window.innerHeight;
var dpr = window.devicePixelRatio || 1;
var system = new ParticleSystem(CONFIG, w, h);
var sprites = buildSpriteCache(CONFIG);

function resize() {
  w = window.innerWidth; h = window.innerHeight;
  dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  system.rebuild(w, h);
}
window.addEventListener("resize", resize);
resize();

var mouseX = -9999, mouseY = -9999, hoverActive = false;
canvas.addEventListener("pointermove", function (e) {
  var rect = canvas.getBoundingClientRect();
  mouseX = e.clientX - rect.left; mouseY = e.clientY - rect.top;
  hoverActive = true;
});
canvas.addEventListener("pointerleave", function () { hoverActive = false; });
canvas.addEventListener("pointerdown", function (e) {
  var rect = canvas.getBoundingClientRect();
  var px = e.clientX - rect.left, py = e.clientY - rect.top;
  if (CONFIG.clickBehavior === "none") return;
  if (CONFIG.clickBehavior === "reshuffle") {
    for (var i = 0; i < system.count; i++) {
      system.scatterBaseX[i] = Math.random();
      system.scatterBaseY[i] = Math.random();
    }
    return;
  }
  var radius = 220, r2 = radius * radius;
  for (var i = 0; i < system.count; i++) {
    var dx = system.baseX[i] - px, dy = system.baseY[i] - py;
    var d2 = dx * dx + dy * dy;
    if (d2 < r2) {
      var d = Math.max(8, Math.sqrt(d2));
      var falloff = 1 - d / radius;
      system.offVX[i] += (dx / d) * falloff * 900;
      system.offVY[i] += (dy / d) * falloff * 900;
    }
  }
});

function applyHover(dt) {
  if (!hoverActive) return;
  var r = CONFIG.hoverRadius, r2 = r * r, strength = CONFIG.hoverStrength * 4000;
  for (var i = 0; i < system.count; i++) {
    var dx = system.baseX[i] + system.offX[i] - mouseX;
    var dy = system.baseY[i] + system.offY[i] - mouseY;
    var d2 = dx * dx + dy * dy;
    if (d2 < r2 && d2 > 1) {
      var d = Math.sqrt(d2);
      var falloff = 1 - d / r;
      system.offVX[i] += (dx / d) * falloff * strength * dt;
      system.offVY[i] += (dy / d) * falloff * strength * dt;
    }
  }
}

var lastT = performance.now();
function loop(now) {
  var dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  applyHover(dt);
  system.update(dt, w, h);
  render(ctx, w, h, system, sprites, CONFIG.background);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
</script>
</body>
</html>
`;
}

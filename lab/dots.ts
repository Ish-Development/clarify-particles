// More dot shapes for brand assets, round ones (globes, wheels, rings), in
// the hero's look: registered with the engine's shapes so `sequence` names
// them; they turn and tumble like the built-in 3D shapes. Lab only, nothing
// here ships.
// Each is a list of primitives (arcs, straight strokes, sphere shells, flat
// discs) in unit space; the dots are spread over them by length (area for
// shells and discs), each nudged a hair off its line so a stroke reads as a
// fine ribbon of dots, as the hero's do.
import { registerDotShape, type Vec3 } from "../src/core/shapes";

const TAU = Math.PI * 2;
const GOLDEN = 2.39996322972865332;
type V = [number, number, number];

type Prim =
  | { kind: "arc"; c: V; u: V; v: V; r: number; a0: number; a1: number; spin?: number }
  | { kind: "seg"; a: V; b: V; spin?: number }
  | { kind: "shell"; c: V; r: number; sy?: number }
  | { kind: "disc"; c: V; r: number };
// a 2D primitive's dots per unit of area, against a line's per unit of length
const AREA = 2.4;
const weight = (p: Prim) =>
  p.kind === "arc" ? p.r * Math.abs(p.a1 - p.a0) : p.kind === "seg" ? Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1], p.b[2] - p.a[2]) : p.kind === "shell" ? 4 * Math.PI * p.r * p.r * AREA * 0.5 : Math.PI * p.r * p.r * AREA;

// a deterministic jitter in -1..1 for dot j
const hash = (j: number, k: number) => {
  const x = Math.sin(j * 12.9898 + k * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
};
const JITTER = 0.012;

const X: V = [1, 0, 0];
const Y: V = [0, 1, 0];
const Z: V = [0, 0, 1];
const O: V = [0, 0, 0];
const add = (a: V, b: V, k = 1): V => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
// a unit vector turned about the x axis
const tiltX = (a: V, t: number): V => [a[0], a[1] * Math.cos(t) - a[2] * Math.sin(t), a[1] * Math.sin(t) + a[2] * Math.cos(t)];
const circle = (r: number, c: V = O, u: V = X, v: V = Z, spin?: number): Prim => ({ kind: "arc", c, u, v, r, a0: 0, a1: TAU, spin });

function shape(prims: Prim[]) {
  const total = prims.reduce((s, p) => s + weight(p), 0);
  const cum: number[] = [];
  let s = 0;
  for (const p of prims) cum.push((s += weight(p) / total));
  return (j: number, m: number, t: number, out: Vec3) => {
    const q = (j + 0.5) / m;
    let k = 0;
    while (k < prims.length - 1 && q > cum[k]) k++;
    const lo = k ? cum[k - 1] : 0;
    // this primitive's own dots: its share of the m
    const first = Math.ceil(lo * m - 0.5);
    const count = Math.max(1, Math.ceil(cum[k] * m - 0.5) - first);
    const idx = Math.min(count - 1, Math.max(0, j - first));
    const f = (idx + 0.5) / count;
    const p = prims[k];
    let x: V;
    if (p.kind === "arc") {
      const a = p.a0 + (p.a1 - p.a0) * f + (p.spin ?? 0) * t;
      x = add(add(p.c, p.u, Math.cos(a) * p.r), p.v, Math.sin(a) * p.r);
    } else if (p.kind === "seg") {
      x = [p.a[0] + (p.b[0] - p.a[0]) * f, p.a[1] + (p.b[1] - p.a[1]) * f, p.a[2] + (p.b[2] - p.a[2]) * f];
      if (p.spin) {
        const a = p.spin * t;
        x = [x[0] * Math.cos(a) - x[1] * Math.sin(a), x[0] * Math.sin(a) + x[1] * Math.cos(a), x[2]];
      }
    } else if (p.kind === "shell") {
      const y = 1 - f * 2;
      const ry = Math.sqrt(Math.max(0, 1 - y * y));
      const th = idx * GOLDEN;
      x = [p.c[0] + Math.cos(th) * ry * p.r, p.c[1] + y * p.r * (p.sy ?? 1), p.c[2] + Math.sin(th) * ry * p.r];
    } else {
      // a sunflower: the golden angle, radius by the square root
      const r = Math.sqrt(f) * p.r;
      const th = idx * GOLDEN + 0.05 * t;
      x = [p.c[0] + Math.cos(th) * r, p.c[1] + Math.sin(th) * r, p.c[2]];
    }
    out.x = x[0] + hash(j, 1) * JITTER;
    out.y = x[1] + hash(j, 2) * JITTER;
    out.z = x[2] + hash(j, 3) * JITTER;
  };
}

const range = (n: number, f: (i: number) => Prim | Prim[]) => Array.from({ length: n }, (_, i) => f(i)).flat();
// a great circle whose plane holds the y axis, turned `a` about it
const meridian = (a: number, r = 1): Prim => circle(r, O, [Math.cos(a), 0, Math.sin(a)], Y);
// a latitude ring at height y on the unit sphere
const parallel = (y: number, r = 1): Prim => circle(Math.sqrt(Math.max(0, 1 - y * y)) * r, [0, y * r, 0]);

export const DOT_SHAPES: [string, string, Prim[], number?][] = [
  // the globe's lines of latitude
  ["parallels", "Dot parallels", range(13, (i) => parallel(-0.92 + (i * 1.84) / 12))],
  // a graticule: latitude and longitude
  ["graticule", "Dot graticule", [...range(7, (i) => parallel(-0.75 + (i * 1.5) / 6)), ...range(8, (i) => meridian((i * Math.PI) / 8))]],
  // a planet: a sphere and its ring, tilted
  [
    "planet",
    "Dot planet",
    [{ kind: "shell", c: O, r: 0.52 }, ...range(7, (i) => circle(0.72 + i * 0.045, O, X, tiltX(Z, -0.42)))],
    0.42,
  ],
  // a gyroscope: three rings at right angles and two between, a small core
  [
    "gyroscope",
    "Dot gyroscope",
    [circle(1), circle(1, O, X, Y), circle(1, O, Y, Z), circle(0.86, O, [Math.SQRT1_2, Math.SQRT1_2, 0], Z), circle(0.86, O, [Math.SQRT1_2, -Math.SQRT1_2, 0], Z), { kind: "shell", c: O, r: 0.16 }],
  ],
  // orbits: three tilted rings round a nucleus
  // (each ring's plane: a horizontal direction and one 56° up from the
  // horizontal, square to it)
  [
    "orbitals",
    "Dot orbits",
    [
      ...range(3, (i) => {
        const a = (i * TAU) / 3;
        return circle(1, O, [Math.cos(a), 0, Math.sin(a)], [-Math.sin(a) * 0.55, 0.83, Math.cos(a) * 0.55]);
      }),
      { kind: "shell", c: O, r: 0.2 },
    ],
  ],
  // a wheel: a double rim, a hub and spokes, face on, turning
  [
    "wheel",
    "Dot wheel",
    [
      circle(1, O, X, Y, 0.15),
      circle(0.9, O, X, Y, 0.15),
      circle(0.2, O, X, Y, 0.15),
      circle(0.1, O, X, Y, 0.15),
      ...range(16, (i): Prim => {
        const a = (i * TAU) / 16;
        return { kind: "seg", a: [Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0], b: [Math.cos(a) * 0.9, Math.sin(a) * 0.9, 0], spin: 0.15 };
      }),
    ],
  ],
  // a gear: toothed rim front and back, an inner ring and the axle
  [
    "gear",
    "Dot gear",
    (() => {
      const teeth = 16;
      const outline = (z: number): Prim[] =>
        range(teeth, (i): Prim[] => {
          const a = (i * TAU) / teeth;
          const w = TAU / teeth;
          const p = (r: number, b: number): V => [Math.cos(b) * r, Math.sin(b) * r, z];
          // up the tooth, across its top, down, along the root
          return [
            { kind: "seg", a: p(0.82, a), b: p(1, a + w * 0.12), spin: 0.1 },
            { kind: "arc", c: [0, 0, z], u: X, v: Y, r: 1, a0: a + w * 0.12, a1: a + w * 0.38, spin: 0.1 },
            { kind: "seg", a: p(1, a + w * 0.38), b: p(0.82, a + w * 0.5), spin: 0.1 },
            { kind: "arc", c: [0, 0, z], u: X, v: Y, r: 0.82, a0: a + w * 0.5, a1: a + w, spin: 0.1 },
          ];
        });
      return [...outline(0.1), ...outline(-0.1), circle(0.5, O, X, Y, 0.1), circle(0.16, [0, 0, 0.1], X, Y, 0.1), circle(0.16, [0, 0, -0.1], X, Y, 0.1)];
    })(),
  ],
  // a torus drawn as rings round its tube
  [
    "ringTorus",
    "Dot ring torus",
    range(30, (i): Prim => {
      const a = (i * TAU) / 30;
      const radial: V = [Math.cos(a), Math.sin(a), 0];
      return circle(0.3, [radial[0] * 0.7, radial[1] * 0.7, 0], radial, Z);
    }),
    0.44,
  ],
  // a hyperboloid: straight strokes from a top ring to a bottom one, twisted
  [
    "hyperboloid",
    "Dot hyperboloid",
    [
      circle(0.7, [0, 0.9, 0]),
      circle(0.7, [0, -0.9, 0]),
      ...range(36, (i): Prim => {
        const a = (i * TAU) / 36;
        const b = a + (TAU * 2) / 5;
        return { kind: "seg", a: [Math.cos(a) * 0.7, 0.9, Math.sin(a) * 0.7], b: [Math.cos(b) * 0.7, -0.9, Math.sin(b) * 0.7] };
      }),
    ],
  ],
  // a cylinder: rings up it and lines along it
  [
    "cylinder",
    "Dot cylinder",
    [
      ...range(9, (i) => circle(0.6, [0, -0.85 + (i * 1.7) / 8, 0])),
      ...range(18, (i): Prim => {
        const a = (i * TAU) / 18;
        return { kind: "seg", a: [Math.cos(a) * 0.6, -0.85, Math.sin(a) * 0.6], b: [Math.cos(a) * 0.6, 0.85, Math.sin(a) * 0.6] };
      }),
    ],
  ],
  // a dome: the upper half's latitudes and longitudes on a base ring
  [
    "dome",
    "Dot dome",
    [
      ...range(6, (i) => parallel((i * 0.9) / 5)),
      ...range(8, (i): Prim => ({ kind: "arc", c: O, u: [Math.cos((i * Math.PI) / 8), 0, Math.sin((i * Math.PI) / 8)], v: Y, r: 1, a0: 0, a1: Math.PI })),
      circle(1.12),
    ],
  ],
  // a sunflower: a disc of seeds in the golden angle, ringed
  ["sunflower", "Dot sunflower", [{ kind: "disc", c: O, r: 0.86 }, circle(1, O, X, Y)]],
  // a vortex: three spiral arms in a disc, turning
  [
    "vortex",
    "Dot vortex",
    range(3, (arm) =>
      range(60, (s): Prim => {
        const at = (k: number): V => {
          const r = 0.08 + (k / 60) * 0.92;
          const a = (arm * TAU) / 3 + (k / 60) * 4.2;
          return [Math.cos(a) * r, Math.sin(a) * r, 0];
        };
        return { kind: "seg", a: at(s), b: at(s + 1), spin: 0.12 };
      }),
    ),
  ],
];

for (const [name, , prims, size] of DOT_SHAPES) registerDotShape(name, shape(prims), size ?? 0.4);

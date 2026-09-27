import type { ParticleConfig } from "./config";

export type Rgb = [number, number, number];

// "#rrggbb" (or "#rgb") -> 0..1 sRGB components.
export function hexToRgb01(hex: string): Rgb {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return [1, 1, 1];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function hslToRgb01(hDeg: number, s: number, l: number): Rgb {
  const h = (((hDeg % 360) + 360) % 360) / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

// Per-particle color for a colorT in 0..1 — same mapping as the playground's
// sprite buckets (render.ts bucketColor), but continuous and numeric.
export function particleColor(cfg: ParticleConfig, t: number): Rgb {
  if (cfg.colorMode === "single") return hexToRgb01(cfg.color1);
  if (cfg.colorMode === "gradient") {
    const a = hexToRgb01(cfg.color1);
    const b = hexToRgb01(cfg.color2);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  return hslToRgb01(cfg.hueMin + (cfg.hueMax - cfg.hueMin) * t, 0.85, 0.65);
}

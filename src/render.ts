import type { ParticleConfig } from "./config";
import type { ParticleSystem } from "./particles";

export const SPRITE_BUCKETS = 32;
export const SPRITE_SIZE = 64;

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

function lerpHexColor(c1: string, c2: string, t: number): string {
  const a = hexToRgb(c1);
  const b = hexToRgb(c2);
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

export function bucketColor(cfg: ParticleConfig, t: number): string {
  if (cfg.colorMode === "single") return cfg.color1;
  if (cfg.colorMode === "gradient") return lerpHexColor(cfg.color1, cfg.color2, t);
  const hue = cfg.hueMin + (cfg.hueMax - cfg.hueMin) * t;
  return `hsl(${hue}, 85%, 65%)`;
}

// Particles are drawn as a pre-rendered soft-circle sprite (one per color
// bucket) blitted via drawImage, instead of calling ctx.arc() per particle —
// keeps 10k particles at 60fps on plain Canvas2D.
export function buildSpriteCache(cfg: ParticleConfig): HTMLCanvasElement[] {
  const sprites: HTMLCanvasElement[] = [];
  for (let b = 0; b < SPRITE_BUCKETS; b++) {
    const c = document.createElement("canvas");
    c.width = SPRITE_SIZE;
    c.height = SPRITE_SIZE;
    const ctx = c.getContext("2d")!;
    const color = bucketColor(cfg, b / (SPRITE_BUCKETS - 1));
    const grad = ctx.createRadialGradient(
      SPRITE_SIZE / 2,
      SPRITE_SIZE / 2,
      0,
      SPRITE_SIZE / 2,
      SPRITE_SIZE / 2,
      SPRITE_SIZE / 2,
    );
    grad.addColorStop(0, color);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
    sprites.push(c);
  }
  return sprites;
}

export function render(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  system: ParticleSystem,
  sprites: HTMLCanvasElement[],
  background: string,
) {
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "lighter";
  const n = system.count;
  const bucketCount = sprites.length;
  for (let i = 0; i < n; i++) {
    const x = system.baseX[i] + system.offX[i];
    const y = system.baseY[i] + system.offY[i];
    const s = system.size[i] * 6;
    const bucket = Math.min(bucketCount - 1, Math.floor(system.colorT[i] * bucketCount));
    ctx.globalAlpha = system.opacity[i];
    ctx.drawImage(sprites[bucket], x - s / 2, y - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

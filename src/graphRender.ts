import type { GraphSystem } from "./core/graph";

// Monochrome: one soft-circle sprite (no per-color buckets needed like v1's
// gradient/hue modes) — size variation is done per-node via drawImage scale.
export function buildMonoSprite(color: string): HTMLCanvasElement {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, color);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return c;
}

export function renderGraph(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  system: GraphSystem,
  sprite: HTMLCanvasElement,
  background: string,
  lineColor: string,
) {
  // plain alpha blending, not "lighter" (additive) — additive clamps to
  // white against a light background regardless of line/node color, which
  // is exactly what made v2 invisible on a white bg.
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, w, h);

  const drawEdges = (edges: [number, number][], alpha: number) => {
    if (alpha <= 0.002) return;
    ctx.strokeStyle = lineColor;
    ctx.globalAlpha = alpha * 0.25;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const [a, b] of edges) {
      ctx.moveTo(system.screenX[a] + system.offX[a], system.screenY[a] + system.offY[a]);
      ctx.lineTo(system.screenX[b] + system.offX[b], system.screenY[b] + system.offY[b]);
    }
    ctx.stroke();
  };
  drawEdges(system.edgesA, system.edgeAlphaA);
  drawEdges(system.edgesB, system.edgeAlphaB);

  const n = system.count;
  for (let i = 0; i < n; i++) {
    const x = system.screenX[i] + system.offX[i];
    const y = system.screenY[i] + system.offY[i];
    const s = system.size[i] * 2;
    ctx.globalAlpha = system.opacity[i];
    ctx.drawImage(sprite, x - s / 2, y - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

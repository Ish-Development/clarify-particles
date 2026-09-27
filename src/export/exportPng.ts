import JSZip from "jszip";
import type { ParticleConfig } from "../config";
import type { ParticleSystem } from "../particles";
import { render } from "../render";
import { downloadBlob } from "./shared";

export interface PngExportContext {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  system: ParticleSystem;
  sprites: HTMLCanvasElement[];
  cfg: ParticleConfig;
  w: number;
  h: number;
}

// Steps the simulation deterministically at a fixed dt (independent of real
// time/frame rate) so the exported sequence is frame-accurate, then restores
// the live system state afterwards so resuming the preview doesn't jump.
export async function exportPngSequence(
  info: PngExportContext,
  onProgress?: (done: number, total: number) => void,
) {
  const { canvas, ctx, system, sprites, cfg, w, h } = info;
  const fps = cfg.pngFps;
  const frameCount = Math.round(fps * cfg.pngDuration);
  const dt = 1 / fps;

  const snapshot = {
    time: system.time,
    baseX: system.baseX.slice(),
    baseY: system.baseY.slice(),
    offX: system.offX.slice(),
    offY: system.offY.slice(),
    offVX: system.offVX.slice(),
    offVY: system.offVY.slice(),
  };

  const zip = new JSZip();
  const pad = String(frameCount).length;

  for (let f = 0; f < frameCount; f++) {
    system.update(dt, w, h);
    render(ctx, w, h, system, sprites, cfg.background);
    const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
    zip.file(`frame_${String(f + 1).padStart(pad, "0")}.png`, blob);
    onProgress?.(f + 1, frameCount);
  }

  system.time = snapshot.time;
  system.baseX.set(snapshot.baseX);
  system.baseY.set(snapshot.baseY);
  system.offX.set(snapshot.offX);
  system.offY.set(snapshot.offY);
  system.offVX.set(snapshot.offVX);
  system.offVY.set(snapshot.offVY);

  const zipBlob = await zip.generateAsync({ type: "blob" });
  downloadBlob(zipBlob, `particle-sequence-${Date.now()}.zip`);
}

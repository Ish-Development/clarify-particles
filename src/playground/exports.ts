import JSZip from "jszip";
import { particleColor } from "../core/color";
import type { GraphSystem } from "../core/graph";
import type { ParticleSystem } from "../core/particles";
import type { GraphViewConfig, PointsConfig } from "../runtime/defaults";
import { setPaused, type View } from "../runtime/engine";

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Frame-accurate PNG sequence: the live loop is paused and the simulation is
// stepped at a fixed dt through the real engine, then restored so the
// preview doesn't jump. Frames are exactly what the site draws.
export async function exportPngSequence(view: View, fps: number, seconds: number) {
  const frames = Math.round(fps * seconds);
  const dt = 1 / fps;
  const sys = view.system as Partial<ParticleSystem> & View["system"];
  const keys = ["baseX", "baseY", "offX", "offY", "offVX", "offVY"] as const;
  const snapshot = keys.map((k) => sys[k].slice());
  const time = sys.time;

  setPaused(true);
  try {
    const zip = new JSZip();
    const pad = String(frames).length;
    for (let f = 0; f < frames; f++) {
      view.step(dt);
      view.paint();
      const blob: Blob = await new Promise((resolve) => view.canvas.toBlob((b) => resolve(b!), "image/png"));
      zip.file(`frame_${String(f + 1).padStart(pad, "0")}.png`, blob);
    }
    downloadBlob(await zip.generateAsync({ type: "blob" }), `particles-${Date.now()}.zip`);
  } finally {
    keys.forEach((k, i) => sys[k].set(snapshot[i]));
    if (time !== undefined) sys.time = time;
    setPaused(false);
  }
}

// Realtime capture of the view's canvas via MediaRecorder (instant, not
// frame-accurate). Transparent backgrounds record as black.
export function exportVideo(view: View, seconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = view.canvas.captureStream(60);
    let mimeType = "video/webm;codecs=vp9";
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    recorder.onstop = () => {
      downloadBlob(new Blob(chunks, { type: "video/webm" }), `particles-${Date.now()}.webm`);
      resolve();
    };
    recorder.onerror = reject;
    recorder.start();
    setTimeout(() => recorder.stop(), seconds * 1000);
  });
}

const rgb = (c: [number, number, number]) => `rgb(${c.map((v) => Math.round(v * 255)).join(",")})`;

function svgOpen(w: number, h: number, background: string) {
  const bg = background === "transparent" ? "" : `<rect width="${w}" height="${h}" fill="${background}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bg}`;
}

// Vector snapshot of the current frame — one <circle> per particle.
export function buildPointsSvg(view: View, cfg: PointsConfig): string {
  const s = view.system as ParticleSystem;
  const parts = [svgOpen(view.w, view.h, cfg.background)];
  for (let i = 0; i < s.count; i++) {
    const x = s.baseX[i] + s.offX[i];
    const y = s.baseY[i] + s.offY[i];
    parts.push(
      `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${(s.size[i] * 3).toFixed(2)}" fill="${rgb(particleColor(cfg, s.colorT[i]))}" fill-opacity="${s.opacity[i].toFixed(3)}"/>`,
    );
  }
  parts.push("</svg>");
  return parts.join("\n");
}

// Graph: edges first (nodes draw on top), using the current morph cross-fade.
export function buildGraphSvg(view: View, cfg: GraphViewConfig): string {
  const s = view.system as GraphSystem;
  const parts = [svgOpen(view.w, view.h, cfg.background)];
  const px = (i: number) => (s.screenX[i] + s.offX[i]).toFixed(2);
  const py = (i: number) => (s.screenY[i] + s.offY[i]).toFixed(2);
  const addEdges = (edges: [number, number][], alpha: number) => {
    if (alpha <= 0.002) return;
    const op = (alpha * 0.25).toFixed(3);
    for (const [a, b] of edges) {
      parts.push(`<line x1="${px(a)}" y1="${py(a)}" x2="${px(b)}" y2="${py(b)}" stroke="${cfg.lineColor}" stroke-opacity="${op}"/>`);
    }
  };
  addEdges(s.edgesA, s.edgeAlphaA);
  addEdges(s.edgesB, s.edgeAlphaB);
  for (let i = 0; i < s.count; i++) {
    parts.push(
      `<circle cx="${px(i)}" cy="${py(i)}" r="${s.size[i].toFixed(2)}" fill="${cfg.color}" fill-opacity="${s.opacity[i].toFixed(3)}"/>`,
    );
  }
  parts.push("</svg>");
  return parts.join("\n");
}

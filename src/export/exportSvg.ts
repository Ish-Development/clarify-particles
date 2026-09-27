import type { ParticleConfig } from "../config";
import type { ParticleSystem } from "../particles";
import { bucketColor } from "../render";
import type { GraphConfig, GraphSystem } from "../graph";
import { downloadBlob } from "./shared";

// Vector snapshot of the current frame — one <circle> per particle, colored
// per-particle (no bucket quantizing needed since there's no sprite cache
// to reuse here).
function buildParticleSvg(system: ParticleSystem, cfg: ParticleConfig, w: number, h: number): string {
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<rect width="${w}" height="${h}" fill="${cfg.background}"/>`,
  ];
  const n = system.count;
  for (let i = 0; i < n; i++) {
    const x = system.baseX[i] + system.offX[i];
    const y = system.baseY[i] + system.offY[i];
    const r = system.size[i] * 3;
    const color = bucketColor(cfg, system.colorT[i]);
    parts.push(
      `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}" fill="${color}" fill-opacity="${system.opacity[i].toFixed(3)}"/>`,
    );
  }
  parts.push("</svg>");
  return parts.join("\n");
}

export function exportParticleSvg(system: ParticleSystem, cfg: ParticleConfig, w: number, h: number) {
  downloadBlob(
    new Blob([buildParticleSvg(system, cfg, w, h)], { type: "image/svg+xml" }),
    `particle-system-${Date.now()}.svg`,
  );
}

export function copyParticleSvg(system: ParticleSystem, cfg: ParticleConfig, w: number, h: number) {
  return navigator.clipboard.writeText(buildParticleSvg(system, cfg, w, h));
}

// Same idea for the v2 node graph: edges first (so nodes draw on top), then
// nodes, using whichever edge sets/alphas are active this frame (mirrors
// graphRender.ts's crossfade for morph modes).
function buildGraphSvg(system: GraphSystem, cfg: GraphConfig, w: number, h: number): string {
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<rect width="${w}" height="${h}" fill="${cfg.background}"/>`,
  ];

  const addEdges = (edges: [number, number][], alpha: number) => {
    if (alpha <= 0.002) return;
    const op = (alpha * 0.25).toFixed(3);
    for (const [a, b] of edges) {
      const x1 = system.screenX[a] + system.offX[a];
      const y1 = system.screenY[a] + system.offY[a];
      const x2 = system.screenX[b] + system.offX[b];
      const y2 = system.screenY[b] + system.offY[b];
      parts.push(
        `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${cfg.lineColor}" stroke-opacity="${op}"/>`,
      );
    }
  };
  addEdges(system.edgesA, system.edgeAlphaA);
  addEdges(system.edgesB, system.edgeAlphaB);

  const n = system.count;
  for (let i = 0; i < n; i++) {
    const x = system.screenX[i] + system.offX[i];
    const y = system.screenY[i] + system.offY[i];
    const r = system.size[i];
    parts.push(
      `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}" fill="${cfg.color}" fill-opacity="${system.opacity[i].toFixed(3)}"/>`,
    );
  }
  parts.push("</svg>");
  return parts.join("\n");
}

export function exportGraphSvg(system: GraphSystem, cfg: GraphConfig, w: number, h: number) {
  downloadBlob(
    new Blob([buildGraphSvg(system, cfg, w, h)], { type: "image/svg+xml" }),
    `particle-graph-${Date.now()}.svg`,
  );
}

export function copyGraphSvg(system: GraphSystem, cfg: GraphConfig, w: number, h: number) {
  return navigator.clipboard.writeText(buildGraphSvg(system, cfg, w, h));
}

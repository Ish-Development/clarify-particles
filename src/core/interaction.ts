import type { ClickBehavior } from "./config";

// Structural configs/systems so both v1 (ParticleConfig/ParticleSystem) and
// v2 (GraphConfig/GraphSystem) can drive the same interaction handling.
export interface InteractionConfig {
  hoverRadius: number;
  hoverStrength: number;
  clickBehavior: ClickBehavior;
}

export interface Steerable {
  count: number;
  baseX: Float32Array;
  baseY: Float32Array;
  offX: Float32Array;
  offY: Float32Array;
  offVX: Float32Array;
  offVY: Float32Array;
  scatterBaseX?: Float32Array;
  scatterBaseY?: Float32Array;
}

// Hover = continuous repel force applied every frame while the pointer is
// over the canvas. Click = one-shot impulse (burst) or a target reshuffle,
// depending on the configured click behavior.
export class Interaction {
  mouseX = -9999;
  mouseY = -9999;
  active = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private cfg: InteractionConfig,
    private system: Steerable,
  ) {
    canvas.addEventListener("pointermove", (e) => this.onMove(e));
    canvas.addEventListener("pointerleave", () => {
      this.active = false;
    });
    canvas.addEventListener("pointerdown", (e) => this.onClick(e));
  }

  // called on version switch — listeners bound above read `this.cfg` /
  // `this.system` each time, so swapping these in place avoids
  // re-registering DOM listeners.
  setContext(cfg: InteractionConfig, system: Steerable) {
    this.cfg = cfg;
    this.system = system;
  }

  private toLocal(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private onMove(e: PointerEvent) {
    const p = this.toLocal(e);
    this.mouseX = p.x;
    this.mouseY = p.y;
    this.active = true;
  }

  private onClick(e: PointerEvent) {
    const p = this.toLocal(e);
    applyClick(this.system, this.cfg, p.x, p.y);
  }

  update(dt: number) {
    if (!this.active) return;
    applyHover(this.system, this.cfg, this.mouseX, this.mouseY, dt);
  }
}

// Pure force functions — shared by the playground's Interaction class and
// the production runtime, which routes pointer events differently (one
// window-level listener feeding every mounted section).

// One-shot click response: radial velocity burst, or a scatter reshuffle.
export function applyClick(sys: Steerable, cfg: InteractionConfig, px: number, py: number) {
  if (cfg.clickBehavior === "none") return;
  if (cfg.clickBehavior === "reshuffle") {
    if (!sys.scatterBaseX || !sys.scatterBaseY) return;
    for (let i = 0; i < sys.count; i++) {
      sys.scatterBaseX[i] = Math.random();
      sys.scatterBaseY[i] = Math.random();
    }
    return;
  }
  const radius = 220;
  const r2 = radius * radius;
  for (let i = 0; i < sys.count; i++) {
    const dx = sys.baseX[i] - px;
    const dy = sys.baseY[i] - py;
    const d2 = dx * dx + dy * dy;
    if (d2 < r2) {
      const d = Math.max(8, Math.sqrt(d2));
      const falloff = 1 - d / radius;
      sys.offVX[i] += (dx / d) * falloff * 900;
      sys.offVY[i] += (dy / d) * falloff * 900;
    }
  }
}

// Continuous hover repel, applied every frame while the pointer is over.
export function applyHover(sys: Steerable, cfg: InteractionConfig, mx: number, my: number, dt: number) {
  const r = cfg.hoverRadius;
  const r2 = r * r;
  const strength = cfg.hoverStrength * 4000;
  for (let i = 0; i < sys.count; i++) {
    const dx = sys.baseX[i] + sys.offX[i] - mx;
    const dy = sys.baseY[i] + sys.offY[i] - my;
    const d2 = dx * dx + dy * dy;
    if (d2 < r2 && d2 > 1) {
      const d = Math.sqrt(d2);
      const falloff = 1 - d / r;
      sys.offVX[i] += (dx / d) * falloff * strength * dt;
      sys.offVY[i] += (dy / d) * falloff * strength * dt;
    }
  }
}

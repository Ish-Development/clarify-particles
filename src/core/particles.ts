import type { ParticleConfig } from "./config";
import { Noise2D } from "./noise";
import { makeRng } from "./rng";
import { makeShape3D, shapePoint, type Point } from "./shapes";

// All particle state lives in flat typed arrays (no per-particle objects) so
// updating thousands of particles every frame stays allocation-free.
export class ParticleSystem {
  count = 0;
  baseX!: Float32Array;
  baseY!: Float32Array;
  offX!: Float32Array;
  offY!: Float32Array;
  offVX!: Float32Array;
  offVY!: Float32Array;
  size!: Float32Array;
  opacity!: Float32Array;
  colorT!: Float32Array;
  scatterBaseX!: Float32Array;
  scatterBaseY!: Float32Array;
  scatterSeed!: Float32Array;
  noise: Noise2D;
  time = 0;
  // separate clock for auto-rotate so 3D shapes can spin even at speed = 0
  rotTime = 0;
  // separate slow clock so chaos shapes keep drifting even at speed = 0
  idleTime = 0;

  private scratch: Point = { x: 0, y: 0 };
  private lastW: number;
  private lastH: number;

  constructor(private cfg: ParticleConfig, w: number, h: number) {
    this.noise = new Noise2D(cfg.seed);
    this.lastW = w;
    this.lastH = h;
    this.rebuild(w, h);
  }

  // w/h default to the last known canvas size so callers that don't have
  // fresh dimensions handy (reroll, particle-count rebuild) don't need to
  // pass them — and so the initial scatter position always matches the
  // real canvas instead of a hardcoded box (which left particles confined
  // to a fixed-size square when `ease` is low/0 and they never get a
  // chance to migrate to the full-canvas position).
  rebuild(w: number = this.lastW, h: number = this.lastH) {
    this.lastW = w;
    this.lastH = h;
    const cfg = this.cfg;
    const n = cfg.count;
    this.count = n;
    this.time = 0;
    this.noise = new Noise2D(cfg.seed);
    const rng = makeRng((cfg.seed ^ 0x9e3779b9) >>> 0);
    this.baseX = new Float32Array(n);
    this.baseY = new Float32Array(n);
    this.offX = new Float32Array(n);
    this.offY = new Float32Array(n);
    this.offVX = new Float32Array(n);
    this.offVY = new Float32Array(n);
    this.size = new Float32Array(n);
    this.opacity = new Float32Array(n);
    this.colorT = new Float32Array(n);
    this.scatterBaseX = new Float32Array(n);
    this.scatterBaseY = new Float32Array(n);
    this.scatterSeed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.size[i] = rng.range(cfg.sizeMin, cfg.sizeMax);
      this.opacity[i] = rng.range(cfg.opacityMin, cfg.opacityMax);
      this.colorT[i] = rng.next();
      this.scatterBaseX[i] = rng.next();
      this.scatterBaseY[i] = rng.next();
      this.scatterSeed[i] = rng.next() * 1000;
      this.baseX[i] = this.scatterBaseX[i] * w;
      this.baseY[i] = this.scatterBaseY[i] * h;
    }
  }

  update(dt: number, w: number, h: number) {
    const cfg = this.cfg;
    this.time += dt * cfg.speed;
    const t = this.time;
    const n = this.count;
    const chaos = cfg.chaos;
    // ease is calibrated as a per-frame fraction at 60fps; convert to a
    // framerate-independent exponential factor so convergence speed (and
    // thus how cleanly tight shapes like the rings resolve) doesn't depend
    // on the actual frame rate.
    const easeFactor = 1 - Math.pow(1 - cfg.ease, dt * 60);
    if (cfg.autoRotate) this.rotTime += dt;
    if (cfg.idleMotion) this.idleTime += dt * 0.35;
    const tChaos = t + this.idleTime;
    const three = makeShape3D(cfg.rotX, cfg.rotY, cfg.rotZ, this.rotTime, cfg.innerCopies);
    const out = this.scratch;
    const k = 60;
    const damp = 8;
    for (let i = 0; i < n; i++) {
      shapePoint(cfg.shape, i, n, w, h, t, this.noise, out, three, tChaos);
      const driftX = this.noise.noise(this.scatterSeed[i], tChaos * 0.15) * 0.5 + 0.5;
      const driftY = this.noise.noise(this.scatterSeed[i] + 500, tChaos * 0.15) * 0.5 + 0.5;
      const scatterX = ((this.scatterBaseX[i] + driftX * 0.15) % 1) * w;
      const scatterY = ((this.scatterBaseY[i] + driftY * 0.15) % 1) * h;
      const tx = out.x + (scatterX - out.x) * chaos;
      const ty = out.y + (scatterY - out.y) * chaos;
      this.baseX[i] += (tx - this.baseX[i]) * easeFactor;
      this.baseY[i] += (ty - this.baseY[i]) * easeFactor;

      const ax = -k * this.offX[i] - damp * this.offVX[i];
      const ay = -k * this.offY[i] - damp * this.offVY[i];
      this.offVX[i] += ax * dt;
      this.offVY[i] += ay * dt;
      this.offX[i] += this.offVX[i] * dt;
      this.offY[i] += this.offVY[i] * dt;
    }
  }

  // Re-anchor to a new canvas size WITHOUT resetting the simulation: rest
  // positions are scaled proportionally, so a resize (e.g. the mobile
  // address bar showing/hiding) never snaps particles back to scatter.
  // Shape targets are recomputed from w/h every frame anyway.
  resize(w: number, h: number) {
    if (w === this.lastW && h === this.lastH) return;
    const sx = w / (this.lastW || w);
    const sy = h / (this.lastH || h);
    for (let i = 0; i < this.count; i++) {
      this.baseX[i] *= sx;
      this.baseY[i] *= sy;
    }
    this.lastW = w;
    this.lastH = h;
  }

  reroll() {
    this.cfg.seed = Math.floor(Math.random() * 1e9);
    this.rebuild();
  }
}

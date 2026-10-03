import { SHAPE_NAMES, type ParticleConfig, type ShapeName } from "./config";
import { Noise2D } from "./noise";
import { makeRng } from "./rng";
import { makeShape3D, shapePoint, type Point } from "./shapes";

// touch spin: how far the finger can tip the shape toward/away (radians)
const SPIN_TILT_MAX = 1;

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
  private scratchB: Point = { x: 0, y: 0 };
  // parallax: pointer over the section, -1..1, eased toward the target
  private par = { x: 0, y: 0, tx: 0, ty: 0 };
  // touch "drag to spin" (as the graph): extra yaw/tilt from the finger
  // (radians), their speeds for the coast after release, and whether a
  // finger is holding it
  private spin = { yaw: 0, tilt: 0, vYaw: 0, vTilt: 0, held: false };
  // gather off: the first frame snaps every dot to the shape
  private snap = false;
  // holdShape: the shape on screen, and the morph from it to the held one
  private shown: ShapeName | null = null;
  private morphFrom: ShapeName | null = null;
  private morphTo: ShapeName | null = null;
  private morphT = 0;
  // sequence: its clock and the parsed list (re-parsed when it changes)
  private seqTime = 0;
  private seqSrc = "";
  private seqShapes: ShapeName[] = [];
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
    this.snap = !cfg.gather;
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
    // sequence: hold each shape for holdTime, then morph (morphTime) to the
    // next, in a loop; holdShape (set live) overrides it and stays put
    if (cfg.sequence !== this.seqSrc) {
      this.seqSrc = cfg.sequence;
      this.seqShapes = cfg.sequence
        .split(",")
        .map((x) => x.trim())
        .filter((x): x is ShapeName => (SHAPE_NAMES as readonly string[]).includes(x));
      this.seqTime = 0;
    }
    let target: ShapeName = cfg.shape;
    if ((SHAPE_NAMES as readonly string[]).includes(cfg.holdShape)) {
      target = cfg.holdShape as ShapeName;
    } else if (this.seqShapes.length > 0) {
      const L = this.seqShapes.length;
      const hold = Math.max(0, cfg.holdTime);
      const period = hold + Math.max(0.05, cfg.morphTime);
      this.seqTime += dt;
      const cycle = Math.floor(this.seqTime / period);
      const local = this.seqTime - cycle * period;
      // the morph to the next shape starts when the hold ends (below)
      target = this.seqShapes[(local < hold ? cycle : cycle + 1) % L];
    }
    // morph from the shape on screen to the target, then stay
    if (target !== this.morphTo) {
      this.morphFrom = this.shown ?? target;
      this.morphTo = target;
      this.morphT = 0;
    }
    this.morphT += dt;
    const from = this.morphFrom ?? target;
    const mt = Math.min(1, this.morphT / Math.max(0.05, cfg.morphTime));
    const blending = mt < 1 && from !== target;
    this.shown = mt < 0.5 ? from : target;
    // stagger: dot i starts delay[i] * st into the morph, all finish on time
    const st = Math.min(0.9, Math.max(0, cfg.stagger));
    const outB = this.scratchB;
    const easeK = (rate: number) => 1 - Math.exp(-dt * rate);
    this.par.x += (this.par.tx - this.par.x) * easeK(2.5);
    this.par.y += (this.par.ty - this.par.y) * easeK(2.5);
    const sp = this.spin;
    if (sp.held) {
      // a finger resting still: no coast left when it lifts
      sp.vYaw *= 1 - easeK(12);
      sp.vTilt *= 1 - easeK(12);
    } else {
      sp.yaw += sp.vYaw * dt;
      sp.tilt = Math.max(-SPIN_TILT_MAX, Math.min(SPIN_TILT_MAX, sp.tilt + sp.vTilt * dt));
      sp.vYaw *= 1 - easeK(2.5);
      sp.vTilt *= 1 - easeK(6);
      sp.tilt *= 1 - easeK(1.5);
    }
    // finger spin and parallax on top of the designed rotation
    const three = makeShape3D(
      cfg.rotX,
      cfg.rotY,
      cfg.rotZ,
      this.rotTime,
      cfg.innerCopies,
      sp.yaw + this.par.x * cfg.parallax,
      sp.tilt - this.par.y * cfg.parallax,
    );
    const ease = this.snap ? 1 : easeFactor;
    this.snap = false;
    const out = this.scratch;
    // shapes size themselves from min(w, h): scaleByWidth re-bases on w
    let s = cfg.scale * (cfg.scaleByWidth ? w / Math.min(w, h) : 1);
    // fit: no bigger than the zone allows (the outer radius, 0.38 of the
    // shorter side at scale 1, stops fitPadding px inside every edge)
    if (cfg.fit) s = Math.min(s, (Math.min(w, h) / 2 - cfg.fitPadding) / (Math.min(w, h) * 0.38));
    const k = 60;
    const damp = 8;
    for (let i = 0; i < n; i++) {
      shapePoint(blending ? from : target, i, n, w, h, t, this.noise, out, three, tChaos);
      if (blending) {
        shapePoint(target, i, n, w, h, t, this.noise, outB, three, tChaos);
        let ti = Math.min(1, Math.max(0, (mt - (this.scatterSeed[i] / 1000) * st) / (1 - st)));
        ti = ti < 0.5 ? 4 * ti * ti * ti : 1 - Math.pow(-2 * ti + 2, 3) / 2;
        out.x += (outB.x - out.x) * ti;
        out.y += (outB.y - out.y) * ti;
      }
      if (s !== 1) {
        out.x = w / 2 + (out.x - w / 2) * s;
        out.y = h / 2 + (out.y - h / 2) * s;
      }
      const driftX = this.noise.noise(this.scatterSeed[i], tChaos * 0.15) * 0.5 + 0.5;
      const driftY = this.noise.noise(this.scatterSeed[i] + 500, tChaos * 0.15) * 0.5 + 0.5;
      const scatterX = ((this.scatterBaseX[i] + driftX * 0.15) % 1) * w;
      const scatterY = ((this.scatterBaseY[i] + driftY * 0.15) % 1) * h;
      const tx = out.x + (scatterX - out.x) * chaos;
      const ty = out.y + (scatterY - out.y) * chaos;
      this.baseX[i] += (tx - this.baseX[i]) * ease;
      this.baseY[i] += (ty - this.baseY[i]) * ease;

      const ax = -k * this.offX[i] - damp * this.offVX[i];
      const ay = -k * this.offY[i] - damp * this.offVY[i];
      this.offVX[i] += ax * dt;
      this.offVY[i] += ay * dt;
      this.offX[i] += this.offVX[i] * dt;
      this.offY[i] += this.offVY[i] * dt;
    }
  }

  // pointer over the whole section, -1..1 (null = away): drives parallax
  setSectionPointer(p: { x: number; y: number } | null) {
    this.par.tx = p ? p.x : 0;
    this.par.ty = p ? p.y : 0;
  }
  // touch "drag to spin" (as the graph): a finger grabs (true) or lets go
  // (false); while held, spinBy turns it (radians) and tracks the speed so it
  // coasts on after release. The tilt eases back to the designed view.
  grab(on: boolean) {
    this.spin.held = on;
    if (on) this.spin.vYaw = this.spin.vTilt = 0;
  }
  spinBy(dYaw: number, dTilt: number, dt: number) {
    const s = this.spin;
    s.yaw += dYaw;
    s.tilt = Math.max(-SPIN_TILT_MAX, Math.min(SPIN_TILT_MAX, s.tilt + dTilt));
    if (dt > 0) {
      // smoothed, so one jittery move doesn't set the coast speed
      s.vYaw += (dYaw / dt - s.vYaw) * 0.5;
      s.vTilt += (dTilt / dt - s.vTilt) * 0.5;
    }
  }

  // live numbers for the engine's debug state
  debug() {
    return { spin: this.spin.held ? "held" : +this.spin.vYaw.toFixed(2), yaw: +this.spin.yaw.toFixed(2), tilt: +this.spin.tilt.toFixed(2), parallax: [+this.par.x.toFixed(2), +this.par.y.toFixed(2)] };
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

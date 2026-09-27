import { defaultConfig, type ParticleConfig } from "./config";
import { ParticleSystem } from "./particles";
import { buildSpriteCache, render } from "./render";
import { Interaction } from "./interaction";
import { buildGui, type GuiCallbacks } from "./gui";
import { exportPngSequence } from "./export/exportPng";
import { exportVideo } from "./export/exportVideo";
import { exportStandaloneHtml } from "./export/exportCode";
import { exportParticleSvg, exportGraphSvg, copyParticleSvg, copyGraphSvg } from "./export/exportSvg";

import { defaultGraphConfig, GraphSystem, type GraphConfig, type GraphMode } from "./graph";
import { buildMonoSprite, renderGraph } from "./graphRender";
import { buildGraphGui, type GraphGuiCallbacks } from "./graphGui";

type VersionName = "v1" | "v2";

const cfgV1: ParticleConfig = { ...defaultConfig };
const cfgV2: GraphConfig = { ...defaultGraphConfig };

let version: VersionName = "v1";

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const v1Btn = document.getElementById("v1-btn") as HTMLButtonElement;
const v2Btn = document.getElementById("v2-btn") as HTMLButtonElement;

let w = window.innerWidth;
let h = window.innerHeight;

const systemV1 = new ParticleSystem(cfgV1, w, h);
let spritesV1 = buildSpriteCache(cfgV1);

const systemV2 = new GraphSystem(cfgV2, w, h);
let spriteV2 = buildMonoSprite(cfgV2.color);

const interaction = new Interaction(canvas, cfgV1, systemV1);

function resize() {
  w = window.innerWidth;
  h = window.innerHeight;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // re-anchor positions to the new size for both systems, whichever is
  // active or not — cheap, and avoids a stale layout if the user switches
  // versions right after a resize
  systemV1.rebuild(w, h);
  systemV2.rebuild(w, h);
}
window.addEventListener("resize", resize);
resize();

let running = true;
let lastT = performance.now();

function frame(now: number) {
  if (running) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    interaction.update(dt);
    if (version === "v1") {
      systemV1.update(dt, w, h);
      render(ctx, w, h, systemV1, spritesV1, cfgV1.background);
    } else {
      systemV2.update(dt, w, h);
      renderGraph(ctx, w, h, systemV2, spriteV2, cfgV2.background, cfgV2.lineColor);
    }
  } else {
    lastT = now;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// --- v1 (unchanged point-cloud shape system) ---

function rebuildSystemV1() {
  systemV1.rebuild();
  spritesV1 = buildSpriteCache(cfgV1);
}

function recolorV1() {
  spritesV1 = buildSpriteCache(cfgV1);
}

function rerollSeedV1() {
  systemV1.reroll();
  spritesV1 = buildSpriteCache(cfgV1);
}

// at ease=0 particles never move at all (the static "frozen" look) — clicking
// an end-shape button or scatter needs to "wake" the animation, otherwise the
// chaos -> structure transition has nothing to visibly animate with.
function wakeAnimationV1() {
  if (cfgV1.ease <= 0) cfgV1.ease = 0.08;
}

const callbacksV1: GuiCallbacks = {
  onRebuild: rebuildSystemV1,
  onRecolor: recolorV1,
  onReroll: rerollSeedV1,
  onShapeButton: (shape) => {
    cfgV1.shape = shape;
    cfgV1.chaos = 0;
    wakeAnimationV1();
  },
  onScatter: () => {
    cfgV1.chaos = 1;
    wakeAnimationV1();
  },
  onWake: wakeAnimationV1,
  onExportCode: () => exportStandaloneHtml(cfgV1),
  onExportPng: () => {
    running = false;
    exportPngSequence({ canvas, ctx, system: systemV1, sprites: spritesV1, cfg: cfgV1, w, h }).finally(() => {
      running = true;
      lastT = performance.now();
    });
  },
  onExportVideo: () => {
    exportVideo(canvas, cfgV1);
  },
  onExportSvg: () => exportParticleSvg(systemV1, cfgV1, w, h),
  onCopySvg: () => copyParticleSvg(systemV1, cfgV1, w, h),
};

// --- v2 (node-graph modes) ---

function rebuildSystemV2() {
  systemV2.rebuild();
}

function recolorV2() {
  spriteV2 = buildMonoSprite(cfgV2.color);
}

function rerollSeedV2() {
  systemV2.reroll();
}

const callbacksV2: GraphGuiCallbacks = {
  onRebuild: rebuildSystemV2,
  onRecolor: recolorV2,
  onReroll: rerollSeedV2,
  onModeButton: (mode: GraphMode) => {
    cfgV2.mode = mode;
    systemV2.rebuild();
  },
  onExportVideo: () => {
    exportVideo(canvas, cfgV2);
  },
  onExportSvg: () => exportGraphSvg(systemV2, cfgV2, w, h),
  onCopySvg: () => copyGraphSvg(systemV2, cfgV2, w, h),
};

// --- version switch ---

let guiV1 = buildGui(cfgV1, callbacksV1);
let guiV2: ReturnType<typeof buildGraphGui> | null = null;

function updateVersionButtons() {
  v1Btn.classList.toggle("active", version === "v1");
  v2Btn.classList.toggle("active", version === "v2");
}

function switchVersion(v: VersionName) {
  if (v === version) return;
  version = v;
  if (v === "v1") {
    guiV2?.destroy();
    guiV2 = null;
    guiV1 = buildGui(cfgV1, callbacksV1);
    interaction.setContext(cfgV1, systemV1);
  } else {
    guiV1.destroy();
    guiV2 = buildGraphGui(cfgV2, callbacksV2);
    interaction.setContext(cfgV2, systemV2);
  }
  updateVersionButtons();
}

v1Btn.addEventListener("click", () => switchVersion("v1"));
v2Btn.addEventListener("click", () => switchVersion("v2"));

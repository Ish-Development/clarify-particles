import GUI from "lil-gui";
import type { GraphConfig, GraphMode } from "./graph";

export interface GraphGuiCallbacks {
  onRebuild: () => void;
  onRecolor: () => void;
  onReroll: () => void;
  onModeButton: (mode: GraphMode) => void;
  onExportVideo: () => void;
  onExportSvg: () => void;
  onCopySvg: () => void;
}

export function buildGraphGui(cfg: GraphConfig, callbacks: GraphGuiCallbacks): GUI {
  const gui = new GUI({ title: "Particle System — v2" });

  const nodes = gui.addFolder("Nodes");
  nodes.add(cfg, "count", 20, 400, 5).onFinishChange(callbacks.onRebuild);
  nodes.add(cfg, "sizeMin", 1, 20, 0.5).onFinishChange(callbacks.onRebuild);
  nodes.add(cfg, "sizeMax", 1, 30, 0.5).onFinishChange(callbacks.onRebuild);
  nodes.add(cfg, "seed").listen().disable();
  nodes.add({ reroll: callbacks.onReroll }, "reroll").name("Reroll seed");

  const modes = gui.addFolder("Modes");
  modes.add({ fn: () => callbacks.onModeButton("hubBurst") }, "fn").name("1. Hub burst");
  modes.add({ fn: () => callbacks.onModeButton("geoSphere") }, "fn").name("2. Geo sphere");
  modes.add({ fn: () => callbacks.onModeButton("burstSphereMorph") }, "fn").name("3. Burst ↔ Sphere");
  modes.add({ fn: () => callbacks.onModeButton("coneTorusMorph") }, "fn").name("4. Cone ↔ Torus");

  const motion = gui.addFolder("Motion");
  motion.add(cfg, "idleRotationSpeed", 0, 0.5, 0.01).name("idle rotation");
  motion.add(cfg, "idleTiltAmount", 0, 1.2, 0.01).name("idle tilt");
  motion.add(cfg, "morphSpeed", 0.05, 2, 0.01).name("morph speed");

  const interaction = gui.addFolder("Interaction");
  interaction.add(cfg, "hoverRadius", 20, 400, 1);
  interaction.add(cfg, "hoverStrength", 0, 5, 0.1);

  const look = gui.addFolder("Look");
  look.addColor(cfg, "background");
  look.addColor(cfg, "color").name("node color").onChange(callbacks.onRecolor);
  look.addColor(cfg, "lineColor").name("line color");

  const exportFolder = gui.addFolder("Export");
  exportFolder.add(cfg, "videoDuration", 1, 30, 1);
  exportFolder.add({ fn: callbacks.onExportVideo }, "fn").name("Export video (webm)");
  exportFolder.add({ fn: callbacks.onExportSvg }, "fn").name("Export as SVG");
  exportFolder.add({ fn: callbacks.onCopySvg }, "fn").name("Copy as SVG");

  return gui;
}

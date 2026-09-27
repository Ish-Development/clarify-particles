import GUI from "lil-gui";
import type { ParticleConfig, ShapeName } from "./core/config";

export interface GuiCallbacks {
  onRebuild: () => void;
  onRecolor: () => void;
  onReroll: () => void;
  onShapeButton: (shape: ShapeName) => void;
  onScatter: () => void;
  onWake: () => void;
  onExportCode: () => void;
  onExportPng: () => void;
  onExportVideo: () => void;
  onExportSvg: () => void;
  onCopySvg: () => void;
}

export function buildGui(cfg: ParticleConfig, callbacks: GuiCallbacks): GUI {
  const gui = new GUI({ title: "Particle System" });

  const particles = gui.addFolder("Particles");
  particles.add(cfg, "count", 200, 10000, 100).onFinishChange(callbacks.onRebuild);
  particles.add(cfg, "sizeMin", 0.5, 10, 0.1).onFinishChange(callbacks.onRebuild);
  particles.add(cfg, "sizeMax", 0.5, 20, 0.1).onFinishChange(callbacks.onRebuild);
  particles.add(cfg, "opacityMin", 0, 1, 0.01).onFinishChange(callbacks.onRebuild);
  particles.add(cfg, "opacityMax", 0, 1, 0.01).onFinishChange(callbacks.onRebuild);
  particles.add(cfg, "seed").listen().disable();
  particles.add({ reroll: callbacks.onReroll }, "reroll").name("Reroll seed");

  const color = gui.addFolder("Color");
  color.add(cfg, "colorMode", ["single", "gradient", "hueRange"]).onChange(callbacks.onRecolor);
  color.addColor(cfg, "color1").onChange(callbacks.onRecolor);
  color.addColor(cfg, "color2").onChange(callbacks.onRecolor);
  color.add(cfg, "hueMin", 0, 360, 1).onChange(callbacks.onRecolor);
  color.add(cfg, "hueMax", 0, 360, 1).onChange(callbacks.onRecolor);

  const shape = gui.addFolder("Shape");
  shape.add(cfg, "chaos", 0, 1, 0.01).listen().name("chaos amount");
  shape.add(cfg, "speed", 0, 2, 0.01).listen();
  shape.add(cfg, "ease", 0, 0.3, 0.01).listen().name("ease (0 = frozen)");

  const endShapes = gui.addFolder("End shapes (click to assemble)");
  endShapes.add({ fn: callbacks.onScatter }, "fn").name("Scatter (full chaos)");

  const flat = endShapes.addFolder("Flat");
  flat.add({ fn: () => callbacks.onShapeButton("noiseLines") }, "fn").name("Lines (wavy)");
  flat.add({ fn: () => callbacks.onShapeButton("straightLines") }, "fn").name("Lines (straight)");
  flat.add({ fn: () => callbacks.onShapeButton("concentricRings") }, "fn").name("Circle");
  flat.add({ fn: () => callbacks.onShapeButton("square") }, "fn").name("Square");
  flat.add({ fn: () => callbacks.onShapeButton("triangle") }, "fn").name("Triangle");

  const chaosShapes = endShapes.addFolder("Chaos");
  chaosShapes.add({ fn: () => callbacks.onShapeButton("chaosField") }, "fn").name("Grid (chaotic)");
  chaosShapes.add({ fn: () => callbacks.onShapeButton("terrain") }, "fn").name("Terrain (dot sea)");
  chaosShapes.add({ fn: () => callbacks.onShapeButton("waterfall") }, "fn").name("Waterfall");
  chaosShapes.add({ fn: () => callbacks.onShapeButton("nebula") }, "fn").name("Nebula (smoke)");
  chaosShapes.add({ fn: () => callbacks.onShapeButton("veins") }, "fn").name("Veins (ridges)");
  chaosShapes.add(cfg, "idleMotion").name("idle motion").onChange(callbacks.onWake);

  const threeD = endShapes.addFolder("3D");
  threeD.add({ fn: () => callbacks.onShapeButton("sphere") }, "fn").name("Sphere");
  threeD.add({ fn: () => callbacks.onShapeButton("cube") }, "fn").name("Cube");
  threeD.add({ fn: () => callbacks.onShapeButton("torus") }, "fn").name("Torus");
  threeD.add({ fn: () => callbacks.onShapeButton("torusKnot") }, "fn").name("Torus knot");
  threeD.add({ fn: () => callbacks.onShapeButton("hexCone") }, "fn").name("Hex cone");
  threeD.add({ fn: () => callbacks.onShapeButton("octahedron") }, "fn").name("Octahedron");
  threeD.add({ fn: () => callbacks.onShapeButton("icosahedron") }, "fn").name("Icosahedron");
  threeD.add({ fn: () => callbacks.onShapeButton("dodecahedron") }, "fn").name("Dodecahedron");
  threeD.add({ fn: () => callbacks.onShapeButton("stellated") }, "fn").name("Star (stellated)");
  threeD.add({ fn: () => callbacks.onShapeButton("gem") }, "fn").name("Gem (bipyramid)");
  threeD.add(cfg, "rotX", -180, 180, 1).name("rotate X").onChange(callbacks.onWake);
  threeD.add(cfg, "rotY", -180, 180, 1).name("rotate Y").onChange(callbacks.onWake);
  threeD.add(cfg, "rotZ", -180, 180, 1).name("rotate Z").onChange(callbacks.onWake);
  threeD.add(cfg, "autoRotate").name("auto rotate").onChange(callbacks.onWake);
  threeD.add(cfg, "innerCopies", 1, 6, 1).name("inner copies").onChange(callbacks.onWake);

  const patterns = endShapes.addFolder("Patterns");
  patterns.add({ fn: () => callbacks.onShapeButton("sacredGeometry") }, "fn").name("Sacred geometry");

  const experiments = endShapes.addFolder("Experiments");
  experiments.add({ fn: () => callbacks.onShapeButton("cubesIntersect") }, "fn").name("Intersecting cubes");
  experiments.add({ fn: () => callbacks.onShapeButton("crossCubes") }, "fn").name("Cross cubes");
  experiments.add({ fn: () => callbacks.onShapeButton("interlock") }, "fn").name("Interlock (burr)");

  const interaction = gui.addFolder("Interaction");
  interaction.add(cfg, "hoverRadius", 20, 400, 1);
  interaction.add(cfg, "hoverStrength", 0, 5, 0.1);
  interaction.add(cfg, "clickBehavior", ["burst", "reshuffle", "none"]);

  const bg = gui.addFolder("Background");
  bg.addColor(cfg, "background");

  const exportFolder = gui.addFolder("Export");
  exportFolder.add(cfg, "pngFps", 12, 60, 1);
  exportFolder.add(cfg, "pngDuration", 1, 20, 1);
  exportFolder.add(cfg, "videoDuration", 1, 30, 1);
  exportFolder.add({ fn: callbacks.onExportPng }, "fn").name("Export PNG sequence");
  exportFolder.add({ fn: callbacks.onExportVideo }, "fn").name("Export video (webm)");
  exportFolder.add({ fn: callbacks.onExportSvg }, "fn").name("Export as SVG");
  exportFolder.add({ fn: callbacks.onCopySvg }, "fn").name("Copy as SVG");
  exportFolder.add({ fn: callbacks.onExportCode }, "fn").name("Export as code");

  return gui;
}

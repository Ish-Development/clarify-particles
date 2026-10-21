// SVG export for the export lab: walks a view's scene and writes what its
// shaders would draw as plain SVG, one <line> per edge and one <circle> or
// <rect> per dot, so a still stays sharp at any size and is editable in
// Figma. It reads the GPU buffers the engine fills each frame:
//   - dots and networks (engine.ts): positions already in CSS px, shifted
//     by uOffset; edges are instanced quads (aEnds), dots Points (aSize ×
//     uSizeScale, aColor, aShape for square nodes, a uGap ring)
//   - blocks and drawings (blocks-scene.ts, glyph-scene.ts): world
//     positions (aA/aB, position) projected through the view's camera
// Approximations: blending is plain "over" (additive overlaps glow a little
// on the canvas), soft dot falloff and the backdrop (grid, glow) are left
// out, and a pulse trail's taper is drawn as a full line.
import { Color, Vector3, type BufferAttribute, type BufferGeometry, type InstancedBufferGeometry, type Mesh, type Object3D, type Points, type ShaderMaterial } from "three";
import type { View } from "../src/runtime/engine";

type Rgb = number[] | Color;
// light mode: every colour inverted, as the preview and the PNG are
let invert = false;
const hex = (c: Rgb) => {
  const v = c instanceof Color ? [c.r, c.g, c.b] : c;
  return "#" + v.map((x) => Math.round((invert ? 1 - Math.min(1, Math.max(0, x)) : Math.min(1, Math.max(0, x))) * 255).toString(16).padStart(2, "0")).join("");
};
const n = (x: number) => String(Math.round(x * 100) / 100);
const op = (a: number) => (a >= 0.999 ? "" : ` opacity="${n(a)}"`);

export function viewToSvg(view: View, frame: { w: number; h: number; left: number; top: number; background: string | null; invert?: boolean }): string {
  invert = !!frame.invert;
  const { scene, camera, cw, ch, dpr } = view;
  scene.updateMatrixWorld();
  camera?.updateMatrixWorld();
  const objs: Object3D[] = [];
  scene.traverseVisible((o) => {
    if ((o as Mesh).isMesh || (o as Points).isPoints) objs.push(o);
  });
  // the renderer's order: renderOrder, then scene order (stable sort)
  objs.sort((a, b) => a.renderOrder - b.renderOrder);

  const v = new Vector3();
  const groups: string[] = [];
  let lineGroups = 0;
  let dotGroups = 0;
  for (const o of objs) {
    const mat = (o as Mesh).material as ShaderMaterial;
    const u = mat.uniforms;
    if (!u) continue;
    const geo = (o as Mesh).geometry as BufferGeometry;
    const at = (name: string) => geo.getAttribute(name) as BufferAttribute | undefined;
    // 2D layers carry uOffset; the rest are 3D, through the camera
    const flat = !!u.uOffset;
    const off = flat ? (u.uOffset.value as number[]) : [0, 0];
    const place = (x: number, y: number, z = 0): [number, number] => {
      if (flat || !camera) return [x + off[0] + frame.left, y + off[1] + frame.top];
      v.set(x, y, z).applyMatrix4(o.matrixWorld).project(camera);
      return [((v.x + 1) / 2) * cw + frame.left, ((1 - v.y) / 2) * ch + frame.top];
    };
    const out: string[] = [];
    const runs: { pts: [number, number][]; a: number }[] = [];

    if ((o as Mesh).isMesh && (at("aEnds") || at("aA"))) {
      // edges: instanced quads
      const count = Math.min((geo as InstancedBufferGeometry).instanceCount, (at("aEnds") ?? at("aA"))!.count);
      const color = hex(u.uColor.value as Rgb);
      const width = u.uWidth.value as number;
      const ends = at("aEnds");
      const A = at("aA");
      const B = at("aB");
      const alpha = at("aAlpha");
      const weight = at("aWeight");
      const blur = at("aBlur");
      const bolt = at("aBolt");
      for (let i = 0; i < count; i++) {
        let p: [number, number];
        let q: [number, number];
        let a: number;
        if (ends) {
          p = place(ends.getX(i), ends.getY(i));
          q = place(ends.getZ(i), ends.getW(i));
          a = Math.min(1, (u.uAlpha.value as number) * (weight ? weight.getX(i) : 1));
        } else {
          const z3 = A!.itemSize === 3;
          p = place(A!.getX(i), A!.getY(i), z3 ? A!.getZ(i) : 0);
          q = place(B!.getX(i), B!.getY(i), z3 ? B!.getZ(i) : 0);
          a = alpha ? alpha.getX(i) / (1 + 1.5 * (blur ? blur.getX(i) : 0)) : 1;
          // a bolt lighting the line (blocks), at its brightest
          if (bolt) a = Math.min(1, a + bolt.getY(i));
        }
        if (a < 0.004 || (p[0] === q[0] && p[1] === q[1])) continue;
        // a segment that carries on from the last one, at the same opacity,
        // joins it: a curve comes out as one polyline, not a run of pieces
        // overlapping at every joint
        const last = runs[runs.length - 1];
        const end = last?.pts[last.pts.length - 1];
        if (last && end && Math.abs(end[0] - p[0]) < 0.05 && Math.abs(end[1] - p[1]) < 0.05 && Math.abs(last.a - a) < 0.02) last.pts.push(q);
        else runs.push({ pts: [p, q], a });
      }
      for (const r of runs) {
        const closed = r.pts.length > 3 && Math.hypot(r.pts[0][0] - r.pts[r.pts.length - 1][0], r.pts[0][1] - r.pts[r.pts.length - 1][1]) < 0.05;
        const pts = (closed ? r.pts.slice(0, -1) : r.pts).map(([x, y]) => `${n(x)},${n(y)}`).join(" ");
        if (r.pts.length === 2) out.push(`<line x1="${n(r.pts[0][0])}" y1="${n(r.pts[0][1])}" x2="${n(r.pts[1][0])}" y2="${n(r.pts[1][1])}"${op(r.a)}/>`);
        else out.push(`<${closed ? "polygon" : "polyline"} points="${pts}"${op(r.a)}/>`);
      }
      if (out.length) groups.push(`<g id="lines-${++lineGroups}" stroke="${color}" stroke-width="${n(width)}" stroke-linecap="butt" stroke-linejoin="round" fill="none">\n${out.join("\n")}\n</g>`);
      continue;
    }

    if ((o as Points).isPoints) {
      const pos = at("position");
      if (!pos) continue;
      const count = Math.min(pos.count, geo.drawRange.count);
      const size = at("aSize");
      const alpha = at("aAlpha");
      const col = at("aColor");
      const shape = at("aShape");
      const flash = at("aFlash");
      const uColor = u.uColor ? hex(u.uColor.value as Rgb) : "#ffffff";
      const solid = flat && (u.uSolid?.value as number) > 0.5;
      const gap = flat ? ((u.uGap?.value as number) ?? 0) : 0;
      const gapColor = gap > 0 ? hex(u.uGapColor.value as Rgb) : "";
      const square = !!u.uSquare && (u.uSquare.value as number) > 0.5;
      for (let i = 0; i < count; i++) {
        const [x, y] = place(pos.getX(i), pos.getY(i), pos.itemSize === 3 ? pos.getZ(i) : 0);
        let d: number;
        let a = alpha ? alpha.getX(i) : 1;
        let fill = uColor;
        if (flat) {
          // dots and network nodes: CSS px
          d = (size ? size.getX(i) : 1) * (u.uSizeScale.value as number);
          if (col) fill = hex([col.getX(i), col.getY(i), col.getZ(i)]);
        } else if (flash) {
          // blocks nodes: uSize is in device px
          const f = flash.getX(i);
          d = ((u.uSize.value as number) / dpr) * (1 + 0.9 * f);
          a = Math.min(1, a + f);
        } else {
          // drawings: design units × uUnit device px
          d = Math.max(1 / dpr, ((size ? size.getX(i) : 1) * (u.uUnit.value as number)) / dpr);
        }
        if (d <= 0 || a < 0.004) continue;
        const sq = square || (!!shape && shape.getX(i) > 0.5);
        const shapeAt = (r: number, attrs: string) =>
          sq ? `<rect x="${n(x - r)}" y="${n(y - r)}" width="${n(2 * r)}" height="${n(2 * r)}"${attrs}/>` : `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}"${attrs}/>`;
        // the gap ring: the card's colour round the node, under it
        if (gap > 0) out.push(shapeAt(d / 2 + gap, ` fill="${gapColor}"`));
        // solid: an opaque dot, dimmed toward black by its alpha
        // (on the raw sRGB values, as the shader does)
        if (solid) {
          // (from the source colour: fill is already inverted in light mode)
          const c = [1, 3, 5].map((k) => parseInt(fill.slice(k, k + 2), 16) / 255).map((x) => (invert ? 1 - x : x));
          out.push(shapeAt(d / 2, ` fill="${hex(c.map((x) => x * a))}"`));
        } else out.push(shapeAt(d / 2, ` fill="${fill}"${op(a)}`));
      }
      if (out.length) groups.push(`<g id="dots-${++dotGroups}" stroke="none">\n${out.join("\n")}\n</g>`);
    }
  }

  const bg = frame.background ? `<rect id="background" width="${frame.w}" height="${frame.h}" fill="${frame.background}"/>\n` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.w}" height="${frame.h}" viewBox="0 0 ${frame.w} ${frame.h}">\n` +
    `<defs><clipPath id="frame"><rect width="${frame.w}" height="${frame.h}"/></clipPath></defs>\n` +
    bg +
    `<g id="model" clip-path="url(#frame)">\n${groups.join("\n")}\n</g>\n</svg>\n`
  );
}

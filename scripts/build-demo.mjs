// Composes dist-runtime/demo.html — every built site section on one page,
// running the built runtime from the same folder — from the shared section
// templates (src/sections), so the reference page can't drift from them.
// Run by `npm run build:runtime`.
import { readFileSync, writeFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// section template -> preset name (add new sections here)
const SECTIONS = [["src/sections/cta.html", "cta"]];

const css = read("src/sections/tokens.css") + "\n" + read("src/sections/sections.css").replace(/@import[^;]+;/, "");
// swap the template's mount marker attribute (inside a tag — not any
// mention of it in a comment) for the site attributes
const body = SECTIONS.map(([file, preset]) => {
  const html = read(file);
  const out = html.replace(/(<[a-z][^>]*?\s)data-particles-target(?=[\s>])/i, `$1data-particles data-preset="${preset}"`);
  if (out === html) throw new Error(`${file}: no data-particles-target attribute found`);
  return out;
}).join("\n");

writeFileSync(
  new URL("../dist-runtime/demo.html", import.meta.url),
  `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Clarify particles: section reference</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500&family=Geist+Mono:wght@500&display=swap" rel="stylesheet" />
<style>
html, body { margin: 0; background: #060709; }
${css}
</style>
</head>
<body>
<!-- Reference build of the Figma sections with the production script.
     In Webflow, only the data-* attributes and the script tag matter. -->
${body}
<script type="module" src="./particles.js"></script>
</body>
</html>
`,
);
console.log("dist-runtime/demo.html written");

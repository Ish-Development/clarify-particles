// Composes dist-runtime/demo.html: the reference site for the Webflow devs.
// One tab per built section (the live section running the built runtime
// from the same folder, plus its implementation guide) and a Setup tab.
// Built from the shared section templates (src/sections) and the guide data
// (src/sections/guide.js), so the page can't drift from them: the markup
// and the .u-particles-threejs CSS shown are read from the template and
// sections.css. Run by `npm run build:runtime`.
//
//   demo.html#hero          opens a tab
//   demo.html?hero=<preset> previews another preset in a section
//   demo.html?only=hero     the bare section (used by the mobile preview)
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { SECTIONS } from "../src/sections/guide.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const out = (p) => new URL(`../dist-runtime/${p}`, import.meta.url);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const { version } = JSON.parse(read("package.json"));
const REPO = "https://github.com/Ish-Development/clarify-particles";
const SCRIPT_URL = `https://cdn.jsdelivr.net/gh/Ish-Development/clarify-particles@${version}/dist-runtime/particles.js`;
const FIGMA = "https://www.figma.com/design/Z2um6nL77J4AOzXI1PC35c/?node-id=";

const sectionsCss = read("src/sections/sections.css").replace(/@import[^;]+;/, "");
const css = read("src/sections/tokens.css") + "\n" + sectionsCss;

// every `.<cls> .u-particles-threejs { … }` rule in sections.css, with the
// @media it sits in (one level deep, as written there)
function effectRules(cls) {
  const src = sectionsCss.replace(/\/\*[\s\S]*?\*\//g, "");
  const re = /@media([^{]+)\{|([^{}]+)\{([^{}]*)\}|\}/g;
  const rules = [];
  let media = null;
  let m;
  while ((m = re.exec(src))) {
    if (m[1] !== undefined) media = m[1].trim();
    else if (m[2] !== undefined) {
      if (m[2].trim() === `.${cls} .u-particles-threejs`) rules.push({ media, decls: m[3].split(";").map((d) => d.trim()).filter(Boolean) });
    } else media = null;
  }
  if (!rules.length) throw new Error(`sections.css: no .${cls} .u-particles-threejs rule`);
  return rules;
}

function cssSnippet(cls) {
  return effectRules(cls)
    .map(({ media, decls }) => {
      const pad = media ? "    " : "  ";
      const rule = `${media ? "  " : ""}.${cls} .u-particles-threejs {\n${decls.map((d) => `${pad}${d};`).join("\n")}\n${media ? "  " : ""}}`;
      return media ? `@media ${media} {\n${rule}\n}` : rule;
    })
    .join("\n");
}

// skeleton of the component markup: its opening tag, the div + canvas the
// script creates, and any excite triggers
function markupSnippet(template) {
  const html = template.replace(/<!--[\s\S]*?-->/g, "");
  const comp = html.match(/<([a-z][a-z0-9]*)(\s[^>]*?\sdata-particles-component[\s>=][^>]*)>/i);
  const tag = comp[1];
  const open = `<${tag}${comp[2]}>`.replace(/\s+/g, " ");
  const excites = [...html.matchAll(/<([a-z][a-z0-9]*)\s[^>]*data-particles-excite[^>]*>([^<]*)<\/\1>/gi)].map((m) =>
    m[0].replace(/\s+/g, " "),
  );
  const dim = (s) => `<span class="dim">${esc(s)}</span>`;
  return [
    esc(open),
    `  ${dim('<div class="u-particles-threejs">   ← created by the script')}`,
    `    ${dim("<canvas></canvas>")}`,
    `  ${dim("</div>")}`,
    `  ${dim("… section content …")}`,
    ...excites.map((e) => `  ${esc(e)}`),
    esc(`</${tag}>`),
  ].join("\n");
}

// viewer screens by device class: [width, height, is a Figma frame].
// 991/767/479 are Webflow's breakpoints. The height is the screen's, so
// vh/svh in the sections resolve like on that device; the section scrolls
// inside the screen when it's taller.
const BREAKPOINTS = [
  ["Desktop", [[1920, 1080], [1512, 982, true], [1280, 800]]],
  ["Tablet", [[991, 1024]]],
  ["Mobile", [[767, 1024], [479, 900], [393, 852, true], [320, 568]]],
];
const FIGMA_DOT = `<i class="ref-dot" aria-hidden="true"></i>`;
const bpGroups = BREAKPOINTS.map(
  ([label, widths]) =>
    `<div class="ref-bps__group"><span class="ref-bps__label">${label}</span><div class="ref-seg">${widths
      .map(([w, h, figma]) => `<button type="button" data-w="${w}" data-h="${h}" title="${w} × ${h}${figma ? " (Figma frame)" : ""}">${w}${figma ? FIGMA_DOT : ""}</button>`)
      .join("")}</div></div>`,
).join("");

// the CDN script tag and the window.libs alternative: in every section's
// guide and on the Setup tab, so each handover is complete on its own
const SCRIPT_TAG = `<script type="module" src="${SCRIPT_URL}"></script>`;
const LIBS_JS = `window.loadParticles = () => {
  if (!document.querySelector("[data-particles-component], [data-particles]")) return Promise.resolve();
  return window.libs.load("particles", () =>
    import("${SCRIPT_URL}")
  );
};`;

const code = (lang, html) =>
  `<div class="ref-code"><div class="ref-code__bar"><span>${lang}</span><button class="ref-copy" type="button">Copy</button></div><pre><code>${html}</code></pre></div>`;
const list = (items) => `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
const scriptSteps = () => `
    <p><b>Site settings → Custom code → Footer code</b> (once for the whole site; skip if it's already there):</p>
    ${code("HTML · jsDelivr CDN", esc(SCRIPT_TAG))}
    <p>Always pin the version (<code>@${version}</code>), never <code>@latest</code> or a branch. A new look or fix ships as a new version number, and you only update this line.</p>
    <p><b>Or</b> through the site's <code>window.libs</code> loader. It must use <code>import()</code>: the file is an ES module that loads its engine relative to its own URL.</p>
    ${code("JS", esc(LIBS_JS))}`;

const panels = SECTIONS.map((s) => {
  const html = read(s.template);
  const comp = html.replace(/<!--[\s\S]*?-->/g, "").match(/<[a-z][^>]*\sdata-particles-component[\s>=][^>]*>/i);
  if (!comp) throw new Error(`${s.template}: no data-particles-component element`);
  const cls = comp[0].match(/class="([^"\s]+)/)[1];
  const preset = comp[0].match(/data-preset="([^"]+)"/)[1];
  const figma = s.figma.map(([label, node]) => `<a href="${FIGMA}${node}" target="_blank" rel="noopener">Figma: ${label}</a>`).join("");
  const attrs = s.attributes
    .map(([el, as]) => `<tr><td>${el}</td><td>${as.map((a) => `<code>${esc(a)}</code>`).join("<br>")}</td></tr>`)
    .join("");
  return `
<section class="ref-panel" data-panel="${s.id}" hidden>
  <div class="ref-live">
${html}
  </div>
  <div class="ref-stage">
    <div class="ref-frame">
      <iframe title="${esc(s.label)} section" data-src="demo.html?only=${s.id}"></iframe>
      <div class="ref-handle" title="Drag to resize"></div>
    </div>
  </div>
  <div class="ref-guide">
    <header class="ref-guide__head">
      <h2>${s.title}</h2>
      <div class="ref-meta"><span class="ref-pill">preset <code>${preset}</code></span>${figma}</div>
    </header>
    <div class="ref-guide__main">
        <h3><span>1</span>Add the script</h3>
        ${scriptSteps()}
        <h3><span>2</span>Attributes</h3>
        <table class="ref-table"><thead><tr><th>Element</th><th>Attributes</th></tr></thead><tbody>${attrs}</tbody></table>
        <h3><span>3</span>Style <code>.u-particles-threejs</code></h3>
        <p>The script creates this div inside the component and draws the canvas at 100% × 100% of it. It adds no size or position, so this CSS decides where the effect sits (<code>767px</code> = Webflow's mobile landscape breakpoint).</p>
        ${code("CSS", esc(cssSnippet(cls)))}
        <h3><span>4</span>Resulting markup</h3>
        ${code("HTML", markupSnippet(html))}
        <h3>Requirements</h3>
        ${list(s.requirements)}
        <h3>Behaviour to expect</h3>
        ${list(s.behaviour)}
    </div>
  </div>
</section>`;
}).join("\n");

const setup = `
<section class="ref-panel" data-panel="setup" hidden>
  <div class="ref-guide ref-guide--setup">
    <header class="ref-guide__head">
      <h2>Setup</h2>
      <div class="ref-meta"><span class="ref-pill">v${version}</span><a href="${REPO}/blob/main/runtime/README.md" target="_blank" rel="noopener">Full handover README</a><a href="${REPO}/blob/main/docs/CONFIG.md" target="_blank" rel="noopener">All settings</a></div>
    </header>
    <h3><span>1</span>Add the script, once, site-wide</h3>
    ${scriptSteps()}
    <h3><span>2</span>Mark up each section</h3>
    <p>Each effect is a <b>component</b>. Every section tab lists its exact attributes.</p>
    ${code(
      "Structure",
      [
        `[data-particles-component]   <span class="dim">the component: its preset, and the scope for its buttons</span>`,
        `  [data-particles-wrap]      <span class="dim">where the effect goes (optional: defaults to the component)</span>`,
        `    div.u-particles-threejs  <span class="dim">CREATED BY THE SCRIPT: style this class in Webflow</span>`,
        `      &lt;canvas&gt;               <span class="dim">created by the script, 100% × 100% of that div</span>`,
      ].join("\n"),
    )}
    ${list([
      "<code>data-preset</code> goes on the component (or the wrap, which wins). The look lives in the preset, so no design settings go into Webflow.",
      "<code>data-particles-excite</code> on a button inside a component lights up <b>that</b> component's effect when hovered or focused.",
      "If the div ends up with no size, the console warns you.",
    ])}
    <h3>Site-wide typography</h3>
    <p>From the design: headings balance their lines and paragraphs avoid one-word last lines. Add once (site CSS or Head custom code):</p>
    ${code("CSS", esc(`h1, h2, h3, h4, h5, h6 { text-wrap: balance; }
p { text-wrap: pretty; }`))}
    <h3><span>3</span>Check it</h3>
    ${list([
      "Custom code doesn't run in the Webflow <b>Designer</b>. Check in <b>Preview</b> or on the published staging site.",
      "Console warnings start with <code>[particles]</code> and name the element and the bad attribute or preset.",
      "<code>ClarifyParticles.debug()</code> in the console shows the live state.",
    ])}
    <h3>Built in</h3>
    ${list([
      "The engine (~147 kB gzipped, Three.js included) loads after the page's <code>load</code> event, once a particle section is within half a screen. All sections share one WebGL context.",
      "Stops completely when no particle section is on screen. <code>prefers-reduced-motion</code> gets a still frame. Without WebGL, the section shows its normal design.",
      "No restart on resize, including the mobile address bar.",
    ])}
    <h3>JavaScript API (optional)</h3>
    ${code(
      "JS",
      esc(`ClarifyParticles.init(container?)   // mount new components (after CMS load / page transition)
ClarifyParticles.destroy(element?)  // tear down one component, or all
ClarifyParticles.refresh(element?)  // re-read attributes after changing them
ClarifyParticles.debug()            // live state

// fires (bubbling) on each component's first frame, as the effect fades in
el.addEventListener("particles:ready", () => { /* … */ });`),
    )}
  </div>
</section>`;

const tabs = [...SECTIONS.map((s) => [s.id, s.label]), ["setup", "Setup"]]
  .map(([id, label]) => `<a class="ref-tab${id === "setup" ? " ref-tab--end" : ""}" href="#${id}" data-tab="${id}">${label}</a>`)
  .join("");

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Clarify particles: reference</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500&family=Geist+Mono:wght@500&display=swap" rel="stylesheet" />
<style>
html, body { margin: 0; background: #060709; }
${css}
/* --- reference page chrome (not part of the site) --- */
body { color: var(--text-text-secondary); font: 400 15px/1.55 var(--family-text-primary); -webkit-font-smoothing: antialiased; }
.ref-bar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 32px; padding: 0 24px; height: 52px; background: rgba(6, 7, 9, 0.92); backdrop-filter: blur(8px); border-bottom: 1px solid var(--navigation-navbar-border); }
.ref-bar__brand { color: var(--text-text-primary); font-weight: 500; white-space: nowrap; }
.ref-bar__brand span { margin-left: 8px; color: var(--navigation-navlinks-text); font: 500 12px var(--family-text-secondary); }
.ref-tabs { display: flex; flex: 1; align-self: stretch; overflow-x: auto; }
.ref-tab { display: flex; align-items: center; padding: 0 14px; color: var(--navigation-navlinks-text); font-weight: 500; font-size: 14px; text-decoration: none; border-bottom: 2px solid transparent; white-space: nowrap; }
.ref-tab:hover { color: var(--text-text-primary); }
.ref-tab[aria-selected="true"] { color: var(--text-text-primary); border-bottom-color: var(--mist-600); }
.ref-tab--end { margin-left: auto; }
.ref-guide { box-sizing: border-box; max-width: 1512px; margin: 0 auto; padding: 64px 80px 120px; }
.ref-guide--setup { max-width: 920px; }
.ref-guide__head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 12px 32px; padding-bottom: 24px; margin-bottom: 8px; border-bottom: 1px solid var(--navigation-navbar-border); }
.ref-guide h2 { margin: 0; color: var(--text-text-primary); font: 500 28px/1.2 var(--family-heading-primary); letter-spacing: -0.5px; }
.ref-guide h3 { display: flex; align-items: center; gap: 10px; margin: 40px 0 12px; color: var(--text-text-primary); font: 500 17px/1.3 var(--family-heading-primary); }
.ref-guide h3 > span:not(.dim) { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: #14171a; color: var(--mist-600); font: 500 12px var(--family-text-secondary); }
.ref-guide p { margin: 0 0 12px; max-width: 72ch; }
.ref-guide ul { margin: 0; padding-left: 20px; max-width: 80ch; }
.ref-guide li { margin: 6px 0; }
.ref-guide b { color: var(--text-text-primary); font-weight: 500; }
.ref-guide code { color: var(--text-text-primary); font: 500 0.88em var(--family-text-secondary); }
.ref-guide a { color: var(--mist-600); }
.ref-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; font-size: 14px; }
.ref-pill { padding: 3px 10px; border: 1px solid var(--button-secondary-border); border-radius: 999px; }
.dim { color: var(--navigation-navlinks-text); font-weight: 400; }
.ref-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.ref-table th { text-align: left; font-weight: 500; color: var(--navigation-navlinks-text); }
.ref-table th, .ref-table td { padding: 10px 12px 10px 0; border-bottom: 1px solid var(--navigation-navbar-border); vertical-align: top; }
.ref-table td code { line-height: 1.8; }
.ref-code { margin: 12px 0 16px; border: 1px solid var(--navigation-navbar-border); border-radius: 10px; background: #0b0d10; overflow: hidden; }
.ref-code__bar { display: flex; justify-content: space-between; align-items: center; padding: 6px 8px 6px 14px; border-bottom: 1px solid var(--navigation-navbar-border); color: var(--navigation-navlinks-text); font: 500 12px var(--family-text-secondary); }
.ref-copy { padding: 4px 10px; border: 1px solid var(--button-secondary-border); border-radius: 6px; background: none; color: var(--text-text-secondary); font: 500 12px var(--family-text-primary); cursor: pointer; }
.ref-copy:hover { color: var(--text-text-primary); }
.ref-code pre { margin: 0; padding: 14px; overflow-x: auto; }
.ref-code pre code { font-size: 13px; line-height: 1.6; color: var(--text-text-primary); white-space: pre; }

/* viewer: the section in an iframe at a real screen width, scaled to fit */
.ref-toolbar { position: sticky; top: 52px; z-index: 9; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 32px; padding: 12px 24px; background: rgba(6, 7, 9, 0.92); backdrop-filter: blur(8px); border-bottom: 1px solid var(--navigation-navbar-border); }
.ref-toolbar[hidden] { display: none; }
.ref-toolbar__end { display: flex; align-items: center; gap: 20px; }
.ref-bps { display: flex; align-items: center; gap: 20px; overflow-x: auto; }
.ref-bps__group { display: flex; align-items: center; gap: 10px; }
.ref-bps__label { color: var(--navigation-navlinks-text); font: 500 11px var(--family-text-secondary); text-transform: uppercase; letter-spacing: 0.06em; }
.ref-seg { display: flex; gap: 2px; padding: 3px; border: 1px solid var(--navigation-navbar-border); border-radius: 10px; background: #0b0d10; }
.ref-seg button { position: relative; display: flex; align-items: center; justify-content: center; height: 30px; min-width: 56px; padding: 0 14px; border: 0; border-radius: 7px; background: none; color: var(--navigation-navlinks-text); font: 500 13px/1 var(--family-text-primary); font-variant-numeric: tabular-nums; cursor: pointer; white-space: nowrap; }
.ref-seg button:hover { color: var(--text-text-primary); }
.ref-seg button[aria-pressed="true"] { background: #1a1d21; color: var(--text-text-primary); }
.ref-dot { display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: var(--mist-600); }
.ref-seg .ref-dot { position: absolute; top: 6px; right: 6px; }
.ref-legend { display: flex; align-items: center; gap: 6px; color: var(--navigation-navlinks-text); font-size: 12px; white-space: nowrap; }
.ref-readout { color: var(--navigation-navlinks-text); font: 500 12px var(--family-text-secondary); white-space: nowrap; }
.ref-stage { padding: 32px 24px; overflow-x: auto; background: #040506; border-bottom: 1px solid var(--navigation-navbar-border); }
.ref-frame { position: relative; margin: 0 auto; overflow: hidden; outline: 1px solid var(--button-secondary-border); background: var(--background-bg-primary); }
.ref-frame iframe { position: absolute; top: 0; left: 0; display: block; border: 0; transform-origin: 0 0; }
.ref-handle { position: absolute; right: 0; bottom: 0; z-index: 1; width: 18px; height: 18px; cursor: ew-resize; touch-action: none; background: linear-gradient(135deg, transparent 50%, var(--mist-600) 50%); opacity: 0.7; }
.ref-handle:hover { opacity: 1; }
html.dragging, html.dragging * { cursor: ew-resize !important; user-select: none; }
html.dragging iframe { pointer-events: none; }

@media (max-width: 767px) {
  .ref-bar { gap: 16px; padding: 0 12px; }
  .ref-bar__brand span { display: none; }
  .ref-toolbar { padding: 10px 12px; }
  .ref-bps__label, .ref-legend { display: none; }
  .ref-stage { padding: 16px 12px; }
  .ref-guide { padding: 40px 16px 80px; }
}
/* the section itself only renders in ?only=<section> mode (inside the
   viewer's iframe); the page around it shows the viewer */
html:not(.only) .ref-live { display: none; }
html.only .ref-bar, html.only .ref-toolbar, html.only .ref-stage, html.only .ref-guide { display: none; }
/* scrolls like a phone screen: no scrollbar (it would also eat ~15px of the
   width and shift the breakpoints) */
html.only { overflow-x: hidden; scrollbar-width: none; color-scheme: dark; }
html.only::-webkit-scrollbar { display: none; }
</style>
</head>
<body>
<!-- Reference build of the Figma sections with the production script, plus
     the Webflow implementation guide. In Webflow, only the data-* attributes,
     the .u-particles-threejs styles and the script tag matter. -->
<header class="ref-bar">
  <div class="ref-bar__brand">Clarify particles<span>v${version}</span></div>
  <nav class="ref-tabs">${tabs}</nav>
</header>
<div class="ref-toolbar" id="ref-toolbar" hidden>
  <div class="ref-bps" role="group" aria-label="Screen width">${bpGroups}</div>
  <div class="ref-toolbar__end">
    <span class="ref-legend">${FIGMA_DOT}Figma frame</span>
    <span class="ref-readout" id="ref-readout"></span>
    <div class="ref-seg" role="group" aria-label="Scale"><button type="button" data-scale="fit">Fit</button><button type="button" data-scale="1">100%</button></div>
  </div>
</div>
<main>
${panels}
${setup}
</main>
<script>
  (() => {
    const params = new URLSearchParams(location.search);
    const panels = [...document.querySelectorAll("[data-panel]")];
    const ids = panels.map((p) => p.dataset.panel);
    // ?<section>=<preset>: preview another preset in that section
    for (const p of panels) {
      const variant = params.get(p.dataset.panel);
      const component = p.querySelector("[data-particles-component]");
      if (variant && component) component.setAttribute("data-preset", variant);
    }
    const only = params.get("only");
    if (only) document.documentElement.classList.add("only");

    // --- viewer: screen width (breakpoint buttons or drag), scale (fit / 100%) ---
    const store = {
      get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
      set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
    };
    const MIN = 320, MAX = 2560;
    let width = Math.min(MAX, Math.max(MIN, +store.get("ref-width") || 1512));
    let height = Math.min(1600, Math.max(480, +store.get("ref-height") || 982));
    let scaleMode = store.get("ref-scale") === "1" ? "1" : "fit";
    let current = null; // the open section panel
    let dragK = 0; // scale frozen while dragging, so the corner follows the cursor
    const toolbar = document.getElementById("ref-toolbar");
    const readout = document.getElementById("ref-readout");
    const webflow = (w) => (w >= 992 ? "desktop" : w >= 768 ? "tablet" : w >= 480 ? "mobile landscape" : "mobile portrait");

    function layout() {
      if (!current) return;
      const stage = current.querySelector(".ref-stage");
      const frame = stage.querySelector(".ref-frame");
      const iframe = frame.querySelector("iframe");
      const avail = stage.clientWidth - parseFloat(getComputedStyle(stage).paddingLeft) * 2;
      const k = dragK || (scaleMode === "fit" ? Math.min(1, avail / width) : 1);
      const h = height;
      iframe.style.width = width + "px";
      iframe.style.height = h + "px";
      iframe.style.transform = "scale(" + k + ")";
      frame.style.width = width * k + "px";
      frame.style.height = h * k + "px";
      readout.textContent = width + " × " + h + " · Webflow " + webflow(width) + " · " + Math.round(k * 100) + "%";
      for (const b of toolbar.querySelectorAll("[data-w]")) b.setAttribute("aria-pressed", String(+b.dataset.w === width));
      for (const b of toolbar.querySelectorAll("[data-scale]")) b.setAttribute("aria-pressed", String(b.dataset.scale === scaleMode));
    }
    function setWidth(w, save) {
      width = Math.round(Math.min(MAX, Math.max(MIN, w)));
      if (save) store.set("ref-width", width);
      layout();
    }
    toolbar.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.w) {
        height = +b.dataset.h;
        store.set("ref-height", height);
        setWidth(+b.dataset.w, true);
      }
      if (b.dataset.scale) { scaleMode = b.dataset.scale; store.set("ref-scale", scaleMode); layout(); }
    });
    addEventListener("resize", layout);

    // drag the frame's corner: any width in between
    document.addEventListener("pointerdown", (e) => {
      const handle = e.target.closest(".ref-handle");
      if (!handle) return;
      e.preventDefault();
      const frame = handle.parentElement;
      const stage = frame.parentElement;
      const k0 = frame.getBoundingClientRect().width / width;
      // a centered frame grows both ways, so the corner moves half as far
      const centered = frame.offsetWidth < stage.clientWidth - 1 ? 2 : 1;
      const x0 = e.clientX, w0 = width;
      dragK = k0;
      document.documentElement.classList.add("dragging");
      handle.setPointerCapture(e.pointerId);
      const move = (ev) => setWidth(w0 + ((ev.clientX - x0) * centered) / k0);
      const up = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", up);
        document.documentElement.classList.remove("dragging");
        dragK = 0;
        setWidth(width, true);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
    });

    // the viewer's iframe (this page, ?only=<section>) loads after this
    // page's load event
    function loadFrame(panel) {
      const iframe = panel.querySelector("iframe[data-src]");
      if (!iframe || iframe.src) return;
      const go = () => (iframe.src = iframe.dataset.src + location.search.replace(/^\\?/, "&"));
      if (document.readyState === "complete") go();
      else addEventListener("load", go, { once: true });
    }

    // hidden panels have no size, so their effects never mount (or stop)
    // until their tab opens
    function show() {
      const id = only || (ids.includes(location.hash.slice(1)) ? location.hash.slice(1) : ids[0]);
      current = null;
      for (const p of panels) {
        const on = p.dataset.panel === id;
        p.hidden = !on;
        if (on && !only && p.querySelector(".ref-stage")) {
          current = p;
          loadFrame(p);
        }
      }
      toolbar.hidden = !current;
      for (const t of document.querySelectorAll("[data-tab]")) t.setAttribute("aria-selected", String(t.dataset.tab === id));
      layout();
    }
    addEventListener("hashchange", () => (show(), scrollTo(0, 0)));
    show();

    document.addEventListener("click", async (e) => {
      const btn = e.target.closest(".ref-copy");
      if (!btn) return;
      await navigator.clipboard.writeText(btn.closest(".ref-code").querySelector("code").textContent.replace(/ *← created by the script/, ""));
      btn.textContent = "Copied";
      setTimeout(() => (btn.textContent = "Copy"), 1500);
    });
  })();
</script>
<script type="module" src="./particles.js"></script>
</body>
</html>
`;

writeFileSync(out("demo.html"), page);

// the templates' images (navbar logo, icons) next to the page
mkdirSync(out("assets"), { recursive: true });
for (const f of readdirSync(new URL("../public/assets", import.meta.url))) copyFileSync(new URL(`../public/assets/${f}`, import.meta.url), out(`assets/${f}`));

console.log("dist-runtime/demo.html written");

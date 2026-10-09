// The staged map's UI: crisp HTML over the canvas, pinned to points in the
// 3D scene (projected each drawn frame). In the site's card language (the
// Figma "Vertical Tab component": double-bezel glass cards, icon tile, mono
// eyebrow) and its motion language (clarify-ui-animations-handoff:
// settle / slide / pill / pop-glyph / toggle-bloom / wipe):
// - the level labels down the left (hidden where they don't fit),
// - the first tab's anomaly: brackets round its tip, a leader line, a card,
// - the middle tab's tile chips (kept apart and inside the panel),
// - the top tab's routing card: routes from the ring, switches that flip on.
// Text only comes in once the camera has landed. Classes are fj- prefixed
// (the site's own classes can't collide); the CSS is injected once.
import { Vector3 } from "three";
import { LEVELS, WORLD } from "./map-consts";
import type { MapConfig } from "./defaults";
import type { MapScene } from "./map-scene";

const CSS = /* css */ `
.fj-ov{position:absolute;inset:0;pointer-events:none;overflow:hidden;font-family:"Geist",system-ui,sans-serif;-webkit-font-smoothing:antialiased;
  --fj-alert:#e0607e;--fj-sage:#a2d0c1;--fj-text:#f8fbfd;--fj-muted:#b7bec5;--fj-line:rgba(139,139,139,.2);
  --fj-settle:cubic-bezier(.16,1,.3,1);--fj-spring:cubic-bezier(.34,1.56,.64,1);--fj-io:cubic-bezier(.65,0,.35,1);
  --fj-glow-sage:#a2d0c18c;--fj-glow-alert:color-mix(in srgb,var(--fj-alert) 60%,transparent)}
.fj-ov *{box-sizing:border-box}
.fj-ov svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.fj-level,.fj-brackets,.fj-card-pos,.fj-chip,.fj-route{position:absolute;left:0;top:0;will-change:transform}
.fj-level{font:10px/1 "Geist Mono",ui-monospace,monospace;letter-spacing:.18em;text-transform:uppercase;color:#8e949a;white-space:nowrap;transform-origin:100% 50%;transition:opacity .3s}
.fj-bz{padding:4px;background:rgba(20,20,20,.5);border:1px solid var(--fj-line);border-radius:16px;-webkit-backdrop-filter:blur(24px);backdrop-filter:blur(24px)}
.fj-in{display:block;background:rgba(20,20,20,.2);border:1px solid var(--fj-line);border-radius:12px}
.fj-ic{display:inline-grid;place-items:center;flex:none;width:28px;height:28px;border-radius:8px;background:rgba(249,250,252,.1);font:500 13px/14px "Geist",system-ui,sans-serif;color:var(--fj-text)}
.fj-ic.is-alert{color:var(--fj-alert)}
.fj-ic.is-mono{font:500 10px/14px "Geist Mono",ui-monospace,monospace}
.fj-ey{font:10px/12px "Geist Mono",ui-monospace,monospace;letter-spacing:.8px;text-transform:uppercase;color:var(--fj-muted);white-space:nowrap}
.fj-sb{font:11px/14px "Geist",system-ui,sans-serif;color:var(--fj-muted);white-space:nowrap}
.fj-tt{font:500 13px/16px "Geist",system-ui,sans-serif;color:var(--fj-text);white-space:nowrap}
.fj-tx{display:grid;gap:2px}
/* the anomaly: brackets, leader, card */
.fj-lead line,.fj-routes line{stroke:var(--fj-alert);stroke-width:1;stroke-dasharray:1;stroke-dashoffset:1;transition:stroke-dashoffset .25s ease-out}
.fj-lead line{stroke-opacity:.55}
.fj-brackets{width:0;height:0;transform-origin:0 0}
.fj-brackets i{position:absolute;width:7px;height:7px;border:0 solid var(--fj-alert);opacity:0;transition:opacity .2s ease-out,transform .25s ease-out}
.fj-brackets i:nth-child(1){left:-14px;top:-14px;border-width:1.5px 0 0 1.5px;transform:translate(-6px,-6px)}
.fj-brackets i:nth-child(2){right:-14px;top:-14px;border-width:1.5px 1.5px 0 0;transform:translate(6px,-6px)}
.fj-brackets i:nth-child(3){left:-14px;bottom:-14px;border-width:0 0 1.5px 1.5px;transform:translate(-6px,6px)}
.fj-brackets i:nth-child(4){right:-14px;bottom:-14px;border-width:0 1.5px 1.5px 0;transform:translate(6px,6px)}
.fj-card-pos{transform-origin:0 0}
.fj-row{display:flex;align-items:center;gap:10px;padding:10px 12px}
/* chips (tile labels) */
.fj-chip{margin-top:-10px;padding:3px;border-radius:12px;white-space:nowrap;transform-origin:0 100%;opacity:0;transition:opacity .25s ease-out}
.fj-chip .fj-in{display:flex;align-items:center;gap:8px;padding:6px 10px 6px 9px;border-radius:9px;transform:scale(.9);filter:blur(4px);transition:transform .25s ease-out,filter .25s ease-out}
.fj-chip i{width:6px;height:6px;border-radius:50%}
.fj-chip b{font:500 12px/16px "Geist",system-ui,sans-serif;color:var(--fj-text)}
.fj-chip b,.fj-chip i{opacity:0;transform:translateX(-10px);filter:blur(6px);transition:opacity .25s ease-out,transform .25s ease-out,filter .25s ease-out}
/* the routing card */
.fj-routes circle{fill:var(--fj-alert);opacity:0;transition:opacity .3s ease-out}
.fj-routes line{stroke-opacity:.6}
.fj-route{width:344px;border-radius:20px;transform-origin:0 0}
.fj-panel{display:grid;padding:16px 16px 12px;border-radius:16px}
.fj-hd{display:grid;gap:4px;padding-bottom:10px}
.fj-hd b{font:600 15px/20px "Geist",system-ui,sans-serif;color:var(--fj-text)}
.fj-hd span{font:11px/14px "Geist",system-ui,sans-serif;color:var(--fj-muted)}
.fj-rt{display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--fj-line)}
.fj-rt .fj-ic{width:24px;height:24px}
.fj-rt b{font:500 12px/16px "Geist",system-ui,sans-serif;color:var(--fj-text);white-space:nowrap}
.fj-rt .fj-ds{flex:1;font:12px/16px "Geist",system-ui,sans-serif;color:var(--fj-muted);white-space:nowrap;text-align:right}
.fj-tg{position:relative;flex:none;width:28px;height:16px;border-radius:8px;background:rgba(249,250,252,.12);transition:background .3s ease-out}
.fj-tg:after{content:"";position:absolute;left:2px;top:2px;width:12px;height:12px;border-radius:50%;background:#8e949a;transition:transform .3s ease-out,background .3s ease-out}
.fj-close{flex-wrap:wrap;justify-content:space-between}
.fj-num{font:500 11px/12px "Geist Mono",ui-monospace,monospace;color:var(--fj-text)}
.fj-bar{display:block;flex-basis:100%;height:3px;background:rgba(249,250,252,.1);border-radius:2px;overflow:hidden}
.fj-bar i{display:block;height:100%;width:0;background:var(--fj-sage);border-radius:2px;transition:width .3s ease-out}
/* cards out: quick and plain; in: settle (rise out of a blur) */
.fj-card,.fj-route>*{opacity:0;transform:translateY(16px) scale(.97);filter:blur(10px);transform-origin:50% 100%;transition:opacity .25s ease-out,transform .25s ease-out,filter .25s ease-out}
.fj-card .fj-row>*,.fj-panel>*{opacity:0;transform:translateX(-10px);filter:blur(6px);transition:opacity .25s ease-out,transform .25s ease-out,filter .25s ease-out}
.fj-card .fj-ic,.fj-route .fj-ic{transform:scale(0);opacity:0}
.fj-ov.is-alert .fj-brackets i{opacity:1;transform:none;transition:opacity .3s ease-out,transform .5s var(--fj-settle)}
.fj-ov.is-alert .fj-lead line{stroke-dashoffset:0;transition:stroke-dashoffset .45s var(--fj-io) .12s}
.fj-ov.is-alert .fj-card,.fj-ov.is-routed .fj-route>*{opacity:1;transform:none;filter:none;transition:opacity .9s var(--fj-settle),transform .9s var(--fj-settle),filter .9s var(--fj-settle)}
.fj-ov.is-alert .fj-card{transition-delay:.15s}
.fj-ov.is-routed .fj-route>*{transition-delay:.35s}
.fj-ov.is-alert .fj-card .fj-row>*,.fj-ov.is-routed .fj-panel>*{opacity:1;transform:none;filter:none;transition:opacity .7s var(--fj-settle),transform .7s var(--fj-settle),filter .7s var(--fj-settle)}
.fj-ov.is-alert .fj-card .fj-row>:nth-child(2){transition-delay:.45s}
.fj-ov.is-routed .fj-panel>:nth-child(1){transition-delay:.6s}
.fj-ov.is-routed .fj-panel>:nth-child(2){transition-delay:.68s}
.fj-ov.is-routed .fj-panel>:nth-child(3){transition-delay:.76s}
.fj-ov.is-routed .fj-panel>:nth-child(4){transition-delay:.84s}
/* icons pop with a soft glow */
.fj-ov.is-alert .fj-card .fj-ic,.fj-ov.is-routed .fj-route .fj-ic{transform:none;opacity:1;animation:fj-glow .9s ease-out backwards;transition:transform .55s var(--fj-spring),opacity .3s ease-out}
.fj-ov.is-alert .fj-card .fj-ic{transition-delay:.4s;animation-delay:.4s}
.fj-ov.is-routed .fj-rt:nth-child(2) .fj-ic{transition-delay:.75s;animation-delay:.75s}
.fj-ov.is-routed .fj-rt:nth-child(3) .fj-ic{transition-delay:.83s;animation-delay:.83s}
@keyframes fj-glow{0%{text-shadow:0 0 10px var(--fj-glow-alert)}100%{text-shadow:none}}
/* chips: pill on a spring, then their text */
.fj-chip.is-in{opacity:1;transition:opacity .4s ease-out}
.fj-chip.is-in .fj-in{transform:none;filter:none;transition:transform .55s var(--fj-spring),filter .55s var(--fj-settle)}
.fj-chip.is-in b,.fj-chip.is-in i{opacity:1;transform:none;filter:none;transition:opacity .7s var(--fj-settle) .15s,transform .7s var(--fj-settle) .15s,filter .7s var(--fj-settle) .15s}
/* routes draw, dots travel; switches flip on one by one with a bloom */
.fj-ov.is-routed .fj-routes line{stroke-dashoffset:0;transition:stroke-dashoffset .7s var(--fj-settle)}
.fj-ov.is-routed .fj-routes line:nth-of-type(2){transition-delay:.12s}
.fj-ov.is-routed .fj-routes circle{opacity:1;transition:opacity .4s ease-out .7s}
.fj-ov.is-routed .fj-tg{background:var(--fj-sage);animation:fj-bloom .9s ease-out backwards;transition:background .3s ease-out}
.fj-ov.is-routed .fj-tg:after{transform:translateX(12px);background:#19352d;transition:transform .45s var(--fj-spring),background .3s ease-out}
.fj-ov.is-routed .fj-rt:nth-child(2) .fj-tg,.fj-ov.is-routed .fj-rt:nth-child(2) .fj-tg:after{transition-delay:1.2s;animation-delay:1.2s}
.fj-ov.is-routed .fj-rt:nth-child(3) .fj-tg,.fj-ov.is-routed .fj-rt:nth-child(3) .fj-tg:after{transition-delay:1.5s;animation-delay:1.5s}
@keyframes fj-bloom{0%{box-shadow:0 0 0 0 var(--fj-glow-sage)}100%{box-shadow:0 0 0 8px transparent}}
.fj-ov.is-routed .fj-bar i{width:100%;transition:width .9s var(--fj-io) 1.85s}
@media (prefers-reduced-motion:reduce){.fj-ov *,.fj-ov *:after{transition-duration:0s!important;transition-delay:0s!important;animation:none!important}}
`;

let injected = false;
function injectCss() {
  if (injected) return;
  injected = true;
  const style = document.createElement("style");
  style.dataset.particles = "map-overlay";
  style.textContent = CSS;
  document.head.appendChild(style);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot" }[c]};`);

export class MapOverlay {
  private readonly root = document.createElement("div");
  private readonly levels: HTMLElement[] = [];
  private readonly chips: HTMLElement[] = [];
  private readonly brackets: HTMLElement;
  private readonly cardPos: HTMLElement;
  private readonly card: HTMLElement;
  private readonly lead: SVGLineElement;
  private readonly route: HTMLElement;
  private readonly rows: HTMLElement[];
  private readonly routeLines: SVGLineElement[];
  private readonly routeDots: SVGCircleElement[];
  // element sizes (unscaled CSS px), measured on change, not per frame
  private readonly size = new Map<Element, { w: number; h: number; top: number }>();
  private readonly ro: ResizeObserver;
  private alertOn = false;
  private routedOn = false;
  private readonly v = new Vector3();

  constructor(host: HTMLElement, cfg: MapConfig) {
    injectCss();
    const r = this.root;
    r.className = "fj-ov";
    r.setAttribute("aria-hidden", "true");
    r.style.setProperty("--fj-alert", cfg.alertColor);
    const levels = cfg.storyLevels.split(",").map((t) => t.trim());
    const tiles = cfg.tileLabels.split(",").map((t) => t.trim());
    r.innerHTML = `
      ${levels.map((t) => `<span class="fj-level">${esc(t)}</span>`).join("")}
      ${tiles.map((t, i) => `<span class="fj-chip fj-bz"><span class="fj-in"><i style="background:${["#5fc4a8", "var(--fj-alert)", "#f4f7fa"][i] ?? "#f4f7fa"}"></i><b>${esc(t)}</b></span></span>`).join("")}
      <svg class="fj-lead"><line pathLength="1" /></svg>
      <svg class="fj-routes"><line pathLength="1" /><line pathLength="1" /><circle r="2.5" /><circle r="2.5" /></svg>
      <div class="fj-brackets"><i></i><i></i><i></i><i></i></div>
      <div class="fj-card-pos"><div class="fj-card fj-bz"><div class="fj-in fj-row">
        <span class="fj-ic is-alert">✱</span>
        <span class="fj-tx"><span class="fj-ey">${esc(cfg.alertTag)}</span><b class="fj-tt">${esc(cfg.alertTitle)}</b><span class="fj-sb">${esc(cfg.alertText)}</span></span>
      </div></div></div>
      <div class="fj-route"><div class="fj-bz"><div class="fj-in fj-panel">
        <div class="fj-hd"><b>${esc(cfg.routeTitle)}</b><span>${esc(cfg.routeText)}</span></div>
        <div class="fj-rt"><span class="fj-ic is-alert">✱</span><b>${esc(cfg.actor1)}</b><span class="fj-ds">${esc(cfg.actor1Text)}</span><i class="fj-tg"></i></div>
        <div class="fj-rt"><span class="fj-ic is-mono">AI</span><b>${esc(cfg.actor2)}</b><span class="fj-ds">${esc(cfg.actor2Text)}</span><i class="fj-tg"></i></div>
        <div class="fj-rt fj-close"><span class="fj-ey">${esc(cfg.closingLabel)}</span><span class="fj-num">${esc(cfg.closingValue)}</span><span class="fj-bar"><i></i></span></div>
      </div></div></div>`;
    this.levels.push(...r.querySelectorAll<HTMLElement>(".fj-level"));
    this.chips.push(...r.querySelectorAll<HTMLElement>(".fj-chip"));
    this.brackets = r.querySelector(".fj-brackets")!;
    this.cardPos = r.querySelector(".fj-card-pos")!;
    this.card = r.querySelector(".fj-card")!;
    this.lead = r.querySelector(".fj-lead line")!;
    this.route = r.querySelector(".fj-route")!;
    this.rows = [...r.querySelectorAll<HTMLElement>(".fj-rt")];
    this.routeLines = [...r.querySelectorAll<SVGLineElement>(".fj-routes line")];
    this.routeDots = [...r.querySelectorAll<SVGCircleElement>(".fj-routes circle")];
    host.appendChild(r);
    // layout-free sizes: offsetWidth/offsetTop ignore transforms; read when
    // an element resizes (fonts landing, copy), never in the frame loop
    const measure = (el: HTMLElement) => this.size.set(el, { w: el.offsetWidth, h: el.offsetHeight, top: el.offsetTop });
    const watched = [...this.levels, ...this.chips, this.card, this.route, ...this.rows];
    this.ro = new ResizeObserver(() => watched.forEach(measure));
    watched.forEach((el) => this.ro.observe(el));
    watched.forEach(measure);
  }

  private sz(el: Element) {
    return this.size.get(el) ?? { w: 0, h: 0, top: 0 };
  }

  private toScreen(map: MapScene, x: number, y: number, z: number, w: number, h: number) {
    const v = this.v.set(x, y, z).project(map.camera);
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, behind: v.z > 1 };
  }

  // w, h: the panel in CSS px; time in s (the route dots travel on it)
  update(map: MapScene, w: number, h: number, time: number) {
    // the UI scales with the panel: 1 at the desktop panel (894 x 552), down
    // to 0.72 on a phone; everything stays inside the panel (M px margin)
    const k = Math.min(1, Math.max(0.72, Math.min(w / 894, h / 552) * 1.12));
    const M = 10;
    const small = w < 560;
    const landed = map.landed;
    const lv = map.levels;
    const step = map.step;

    // level labels: right-aligned against the planes' front-left corner;
    // hidden where they don't fit, on the top tab, and from steeply above
    map.camera.getWorldDirection(this.v);
    const steep = Math.min(1, Math.max(0, (0.88 - Math.abs(this.v.y)) / 0.18));
    const show = [1, lv[0], lv[1], lv[2]];
    this.levels.forEach((el, i) => {
      const p = this.toScreen(map, -WORLD / 2, LEVELS[i], WORLD / 2, w, h);
      const fits = p.x - 18 * k - this.sz(el).w * k >= M;
      const on = !p.behind && fits && landed && step !== 2 && el.textContent !== "";
      el.style.opacity = String(on ? show[i] * steep : 0);
      el.style.transform = `translate(${p.x - 18 * k}px,${p.y}px) translate(-100%,-50%) scale(${k})`;
    });

    // routed: the ring has formed and the camera has landed
    const ring = map.signals?.ringInfo;
    const routed = !!ring && ring.formed > 0.5 && landed;
    if (routed !== this.routedOn) {
      this.routedOn = routed;
      this.root.classList.toggle("is-routed", routed);
    }

    // tile chips: over their tiles once landed, on the middle tab only; kept
    // apart and inside the panel
    const tiles = map.signals?.tileLabels ?? [];
    const placed = this.chips.map((el, i) => {
      const t = tiles[i];
      const p = t ? this.toScreen(map, t.x, t.y, t.z, w, h) : { x: 0, y: 0, behind: true };
      // (not on the top tab: the routing card has the stage there)
      el.classList.toggle("is-in", !!t && t.show > 0.3 && !p.behind && landed && step === 1);
      const cw = this.sz(el).w * k;
      return { el, x: p.x - cw / 2, y: p.y, w: cw };
    });
    const order = [...placed].sort((a, b) => a.x - b.x);
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 1; i < order.length; i++) {
        const over = order[i - 1].x + order[i - 1].w + 8 * k - order[i].x;
        if (over > 0) {
          order[i - 1].x -= over / 2;
          order[i].x += over / 2;
        }
      }
    }
    if (order.length) {
      const left = order[0].x;
      const right = order[order.length - 1].x + order[order.length - 1].w;
      const shift = left < M ? M - left : right > w - M ? w - M - right : 0;
      for (const c of order) c.x += shift;
    }
    for (const c of placed) c.el.style.transform = `translate(${c.x}px,${c.y}px) translateY(-100%) scale(${k})`;

    // the routing card: right of the ring (phones: below it), routes from
    // the ring to the actor rows, a dot travelling each
    if (ring) {
      const rp = this.toScreen(map, ring.x, ring.y, ring.z, w, h);
      const rs = this.sz(this.route);
      const aw = rs.w * k;
      const ah = rs.h * k;
      const ax = small ? (w - aw) / 2 : w - aw - 24 * k;
      const ay = small ? h - ah - M : Math.min(Math.max(M + 6, rp.y - 90 * k), h - ah - M);
      this.route.style.transform = `translate(${ax}px,${ay}px) scale(${k})`;
      this.routeLines.forEach((ln, i) => {
        const row = this.sz(this.rows[i]);
        // offsetTop is from the card's own box (.fj-route is the offset parent)
        const tx = small ? ax + (30 + i * 26) * k : ax;
        const ty = ay + (small ? row.top : row.top + row.h / 2) * k;
        ln.setAttribute("x1", String(rp.x));
        ln.setAttribute("y1", String(rp.y));
        ln.setAttribute("x2", String(tx));
        ln.setAttribute("y2", String(ty));
        const f = (time * 0.45 + i * 0.5) % 1;
        this.routeDots[i].setAttribute("cx", String(rp.x + (tx - rp.x) * f));
        this.routeDots[i].setAttribute("cy", String(rp.y + (ty - rp.y) * f));
      });
    }

    // the anomaly: brackets round its tip, the card beside it (flipped to
    // the left if it would leave the panel), the leader between
    const a = map.alertTip;
    const alert = !!a && a.card > 0 && landed;
    if (alert !== this.alertOn) {
      this.alertOn = alert;
      this.root.classList.toggle("is-alert", alert);
    }
    if (a) {
      const p = this.toScreen(map, a.x, a.y, a.z, w, h);
      this.brackets.style.transform = `translate(${p.x}px,${p.y}px) scale(${k})`;
      const cs = this.sz(this.card);
      const cw = cs.w * k;
      const ch = cs.h * k;
      const right = p.x + 56 * k + cw <= w - M;
      let cx = right ? p.x + 56 * k : p.x - 56 * k - cw;
      cx = Math.min(Math.max(M, cx), w - M - cw);
      const cy = Math.max(M, p.y - 38 * k);
      this.cardPos.style.transform = `translate(${cx}px,${cy}px) scale(${k})`;
      this.lead.setAttribute("x1", String(p.x + (right ? 14 : -14) * k));
      this.lead.setAttribute("y1", String(p.y));
      this.lead.setAttribute("x2", String(right ? cx : cx + cw));
      this.lead.setAttribute("y2", String(cy + ch / 2));
    }
  }

  dispose() {
    this.ro.disconnect();
    this.root.remove();
  }
}

// Entry point loaded by the site. Deliberately tiny: it only finds
// [data-particles] elements and waits until one approaches the viewport
// before downloading the WebGL engine chunk (Three.js). A page whose
// particle sections sit below the fold pays nothing for them up front.
import { COMPONENT, createHost, removeHost, type Host } from "./host";
import { maxWidthQuery, MOBILE_QUERY, PRESETS } from "./presets";
import { parseSpec } from "./spec";

type Engine = typeof import("./engine");

// Two ways to mark up an effect:
//   component markup (preferred): [data-particles-component] > [data-particles-wrap];
//     the script creates div.u-particles-threejs in the wrap (see host.ts)
//   legacy: a [data-particles] element the canvas goes straight into
const LEGACY = "[data-particles]";

let engine: Engine | null = null;
// load timeline (ms since navigation) for debug()
const timeline: Record<string, number> = {};
const mark = (k: string) => (timeline[k] ??= Math.round(performance.now()));
let enginePromise: Promise<Engine> | null = null;
// tracked component / legacy element -> its created host (null for legacy)
const tracked = new Map<HTMLElement, Host | null>();

// Resolves once the page has fully loaded (images, fonts, other scripts)
// and the main thread has a moment to spare — the engine never competes
// with the site's own loading.
const pageReady = new Promise<void>((resolve) => {
  const idle = () =>
    "requestIdleCallback" in window ? requestIdleCallback(() => resolve(), { timeout: 300 }) : setTimeout(resolve, 50);
  if (document.readyState === "complete") idle();
  else window.addEventListener("load", idle, { once: true });
}).then(() => {
  mark("pageReady");
});

// One engine per page, however many sections use it: the import is cached,
// and all sections share its single WebGL context.
function loadEngine(): Promise<Engine> {
  enginePromise ??= pageReady
    .then(() => import("./engine"))
    .then((m) => {
      mark("engineLoaded");
      return (engine = m);
    });
  return enginePromise;
}

function mountTracked(key: HTMLElement, m: Engine) {
  if (key.matches(COMPONENT)) {
    const host = createHost(key);
    tracked.set(key, host);
    const sources = host.wrap === key ? [key] : [key, host.wrap];
    m.mount(host.el, parseSpec(sources), { root: key });
    requestAnimationFrame(() => {
      if (!host.el.clientWidth || !host.el.clientHeight) {
        console.warn(
          "[particles] .u-particles-threejs has no size — give that class a position and size in Webflow (e.g. absolute, filling the wrap)",
          host.el,
        );
      }
    });
  } else {
    m.mount(key, parseSpec(key), { root: key });
  }
}

// Start loading/mounting half a screen before the element scrolls into view,
// so the effect is already running by the time it's visible.
const approachObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      mark("sectionNear");
      const key = entry.target as HTMLElement;
      approachObserver.unobserve(key);
      loadEngine().then((m) => {
        // destroy() may have been called while the chunk was downloading
        if (tracked.has(key)) mountTracked(key, m);
      });
    }
  },
  { rootMargin: "50% 0px" },
);

// Track every not-yet-tracked component (and legacy [data-particles]
// element) under `root`. Safe to call repeatedly — e.g. after CMS content
// or a page transition adds sections.
function init(root: ParentNode = document) {
  for (const key of tracked.keys()) if (!key.isConnected) destroy(key);
  const found = [
    ...root.querySelectorAll<HTMLElement>(COMPONENT),
    // legacy elements, unless they're part of a component
    ...[...root.querySelectorAll<HTMLElement>(LEGACY)].filter((el) => !el.closest(COMPONENT)),
  ];
  if (root instanceof HTMLElement && root.matches(COMPONENT)) found.push(root);
  for (const key of found) {
    if (tracked.has(key)) continue;
    tracked.set(key, null);
    approachObserver.observe(key);
  }
}

// The tracked key for an element passed to destroy()/refresh(): the
// component it belongs to, or the legacy element itself.
function keyOf(el: HTMLElement): HTMLElement {
  return (el.closest(COMPONENT) as HTMLElement | null) ?? el;
}

// Tear down one component/element, or everything (e.g. before a page
// transition).
function destroy(el?: HTMLElement) {
  const keys = el ? [keyOf(el)] : [...tracked.keys()];
  for (const key of keys) {
    const host = tracked.get(key);
    tracked.delete(key);
    approachObserver.unobserve(key);
    if (host) {
      engine?.unmount(host.el);
      removeHost(host);
    } else {
      engine?.unmount(key);
    }
  }
}

// Re-read attributes after they were changed at runtime.
function refresh(el?: HTMLElement) {
  const keys = el ? [keyOf(el)] : [...tracked.keys()];
  destroy(el);
  for (const key of keys) {
    tracked.set(key, null);
    approachObserver.observe(key);
  }
}

// Snapshot of the engine's live state (null until the engine has loaded).
function debug() {
  return { timeline, tracked: tracked.size, engine: engine?.debugState() ?? "not loaded" };
}

const api = { init, destroy, refresh, debug };
declare global {
  interface Window {
    ClarifyParticles: typeof api;
  }
}
window.ClarifyParticles = api;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => init());
} else {
  init();
}

// Crossing a breakpoint (window resize, rotation) re-mounts everything:
// presets' breakpoint tiers and mobile counts/sizes apply at mount.
const tierQueries = Object.values(PRESETS).flatMap((p) => (p.breakpoints ?? []).map((t) => maxWidthQuery(t.maxWidth)));
for (const q of new Set([MOBILE_QUERY, ...tierQueries])) {
  matchMedia(q).addEventListener("change", () => refresh());
}

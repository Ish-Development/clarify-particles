// Entry point loaded by the site. Deliberately tiny: it only finds
// [data-particles] elements and waits until one approaches the viewport
// before downloading the WebGL engine chunk (Three.js). A page whose
// particle sections sit below the fold pays nothing for them up front.
import { parseSpec } from "./spec";

type Engine = typeof import("./engine");

const SELECTOR = "[data-particles]";

let engine: Engine | null = null;
let enginePromise: Promise<Engine> | null = null;
const tracked = new Set<HTMLElement>();

// Resolves once the page has fully loaded (images, fonts, other scripts)
// and the main thread has a moment to spare — the engine never competes
// with the site's own loading.
const pageReady = new Promise<void>((resolve) => {
  const idle = () =>
    "requestIdleCallback" in window ? requestIdleCallback(() => resolve(), { timeout: 300 }) : setTimeout(resolve, 50);
  if (document.readyState === "complete") idle();
  else window.addEventListener("load", idle, { once: true });
});

// One engine per page, however many sections use it: the import is cached,
// and all sections share its single WebGL context.
function loadEngine(): Promise<Engine> {
  enginePromise ??= pageReady.then(() => import("./engine")).then((m) => (engine = m));
  return enginePromise;
}

// Start loading/mounting half a screen before the element scrolls into view,
// so the effect is already running by the time it's visible.
const approachObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const el = entry.target as HTMLElement;
      approachObserver.unobserve(el);
      loadEngine().then((m) => {
        // destroy() may have been called while the chunk was downloading
        if (tracked.has(el)) m.mount(el, parseSpec(el));
      });
    }
  },
  { rootMargin: "50% 0px" },
);

// Mount every not-yet-tracked [data-particles] element under `root`. Safe to
// call repeatedly — e.g. after CMS content or a page transition adds sections.
function init(root: ParentNode = document) {
  for (const el of tracked) if (!el.isConnected) destroy(el);
  root.querySelectorAll<HTMLElement>(SELECTOR).forEach((el) => {
    if (tracked.has(el)) return;
    tracked.add(el);
    approachObserver.observe(el);
  });
}

// Tear down one element, or everything (e.g. before a page transition).
function destroy(el?: HTMLElement) {
  const targets = el ? [el] : [...tracked];
  for (const t of targets) {
    tracked.delete(t);
    approachObserver.unobserve(t);
    engine?.unmount(t);
  }
}

// Re-read attributes after they were changed at runtime.
function refresh(el?: HTMLElement) {
  const targets = el ? [el] : [...tracked];
  destroy(el);
  targets.forEach((t) => {
    tracked.add(t);
    approachObserver.observe(t);
  });
}

const api = { init, destroy, refresh };
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

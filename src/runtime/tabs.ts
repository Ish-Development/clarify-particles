// Tabs that drive an effect's steps (the spatial map's camera). Part of the
// loader, not the engine: the tabs switch their text from page load, even
// before the 3D chunk arrives or without WebGL.
//
// Inside a component:
//   [data-fjord-tab="0|1|2"]    a tab (desktop list item, mobile tab button…);
//                               several elements may share an index
//   [data-fjord-panel="0|1|2"]  optional text shown for that tab
// The active tab's and panel's elements get the class `is-active` (style it
// in Webflow); the component gets data-fjord-active="<index>" and a
// `particles:step` event the effect follows. With `autoplay` (seconds per
// tab), the tabs move on by themselves while the section is on screen; the
// active tab's `--tab-progress` (0 → 1) runs the timer line. A click jumps
// to that tab (clicking the active one re-frames it) and the timer restarts
// from there. The timer waits while the mouse is over the effect (exploring
// it) and never runs with reduced motion.
const TAB = "[data-fjord-tab]";
const PANEL = "[data-fjord-panel]";
const ACTIVE = "is-active";

const reduced = matchMedia("(prefers-reduced-motion: reduce)");

export function hasTabs(component: HTMLElement) {
  return !!component.querySelector(TAB);
}

// Sets up the tabs; returns the teardown.
export function setupTabs(component: HTMLElement, opts: { autoplay: number; zone: () => Element | null }) {
  const all = <T extends Element>(sel: string) => [...component.querySelectorAll<T & HTMLElement>(sel)];
  const indexOf = (el: Element, attr: string) => Number(el.getAttribute(attr)) || 0;
  const count = Math.max(...all(TAB).map((t) => indexOf(t, "data-fjord-tab"))) + 1;

  const start = component.getAttribute("data-fjord-active") ?? all(TAB).find((t) => t.classList.contains(ACTIVE))?.getAttribute("data-fjord-tab");
  let active = Number(start) || 0;
  let progress = 0;
  let visible = false;
  let overZone = false;
  let raf = 0;
  let last = 0;

  function paintProgress() {
    const p = opts.autoplay > 0 && !reduced.matches ? progress : 1;
    for (const t of all(TAB)) t.style.setProperty("--tab-progress", indexOf(t, "data-fjord-tab") === active ? p.toFixed(4) : "0");
  }

  function activate(i: number) {
    active = ((i % count) + count) % count;
    progress = 0;
    for (const t of all(TAB)) {
      const on = indexOf(t, "data-fjord-tab") === active;
      t.classList.toggle(ACTIVE, on);
      if (t.getAttribute("role") === "tab") t.setAttribute("aria-selected", String(on));
    }
    for (const p of all(PANEL)) p.classList.toggle(ACTIVE, indexOf(p, "data-fjord-panel") === active);
    component.setAttribute("data-fjord-active", String(active));
    component.dispatchEvent(new CustomEvent("particles:step", { detail: { step: active } }));
    paintProgress();
  }

  const running = () => opts.autoplay > 0 && visible && !overZone && !reduced.matches && !document.hidden;

  function tick(now: number) {
    raf = 0;
    if (!running()) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    progress += dt / opts.autoplay;
    if (progress >= 1) activate(active + 1);
    else paintProgress();
    raf = requestAnimationFrame(tick);
  }
  function wake() {
    if (raf || !running()) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  const onClick = (e: Event) => {
    const t = e.target instanceof Element ? e.target.closest(TAB) : null;
    if (!t || !component.contains(t)) return;
    activate(indexOf(t, "data-fjord-tab"));
    wake();
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const zone = opts.zone();
    const r = zone?.getBoundingClientRect();
    const over = !!r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (over === overZone) return;
    overZone = over;
    wake();
  };
  const onLeave = () => {
    overZone = false;
    wake();
  };
  const onVisibility = () => wake();
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    wake();
  });

  component.addEventListener("click", onClick);
  component.addEventListener("pointermove", onMove);
  component.addEventListener("pointerleave", onLeave);
  document.addEventListener("visibilitychange", onVisibility);
  reduced.addEventListener("change", paintProgress);
  io.observe(component);
  activate(active);

  return () => {
    cancelAnimationFrame(raf);
    io.disconnect();
    component.removeEventListener("click", onClick);
    component.removeEventListener("pointermove", onMove);
    component.removeEventListener("pointerleave", onLeave);
    document.removeEventListener("visibilitychange", onVisibility);
    reduced.removeEventListener("change", paintProgress);
  };
}

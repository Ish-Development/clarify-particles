// Component markup (v1.2+), as agreed with the Webflow dev:
//
//   [data-particles-component]        the scope: settings (data-preset …) and
//     [data-particles-wrap]           its data-particles-excite buttons
//       div.u-particles-threejs       created here, styled in Webflow
//         <canvas>                    created by the engine, 100% x 100%
//
// The wrap is optional (defaults to the component itself). Settings may sit
// on the component or the wrap; the wrap's win.
//
// data-how-component / data-how-wrap (the hero, v1.5.1) and
// data-fjord-component / data-fjord-wrap (the spatial map) are the same
// thing under the names the Webflow dev uses for those sections.

export const COMPONENT = "[data-particles-component], [data-how-component], [data-fjord-component]";
export const WRAP = "[data-particles-wrap], [data-how-wrap], [data-fjord-wrap]";
export const HOST_CLASS = "u-particles-threejs";

export interface Host {
  component: HTMLElement;
  wrap: HTMLElement;
  // the created div the canvas lives in
  el: HTMLElement;
}

export function wrapOf(component: HTMLElement): HTMLElement {
  if (component.matches(WRAP)) return component;
  return component.querySelector<HTMLElement>(WRAP) ?? component;
}

// Create (or reuse, if one was left behind) the host div inside the wrap.
export function createHost(component: HTMLElement): Host {
  const wrap = wrapOf(component);
  let el = wrap.querySelector<HTMLElement>(`:scope > .${HOST_CLASS}[data-particles-host]`);
  if (!el) {
    el = document.createElement("div");
    el.className = HOST_CLASS;
    el.setAttribute("data-particles-host", "");
    el.setAttribute("aria-hidden", "true");
    wrap.prepend(el);
  }
  return { component, wrap, el };
}

export function removeHost(host: Host) {
  host.el.remove();
}

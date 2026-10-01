// Webflow implementation notes per section, for the tabbed reference page
// (dist-runtime/demo.html, built by scripts/build-demo.mjs). The markup and
// the .u-particles-threejs CSS shown there are read from the section's
// template and sections.css, so only what can't be derived lives here.
// Page order = tab order. Strings may contain inline HTML.
export const SECTIONS = [
  {
    id: "hero",
    label: "Hero",
    template: "src/sections/hero.html",
    title: "Hero: “Learn from the past and predict the future”",
    figma: [
      ["Desktop", "12735-86263"],
      ["Mobile", "13651-45904"],
    ],
    attributes: [
      ["The hero section", ["data-particles-component", 'data-preset="hero"', "data-particles-wrap"]],
    ],
    requirements: [
      "The section needs <code>position: relative</code> and <code>overflow: clip</code> (or <code>hidden</code>). The outer sphere bleeds off the right edge on desktop, and the section crops it.",
      "<b>Desktop:</b> the spheres are drawn at the center of <code>.u-particles-threejs</code>, with the outer shell's radius at 38% of the div's side. To move or resize the spheres, move or resize the div.",
      "<b>Tablet and mobile</b> (991 px and below): the hero stacks. The div is a full-width band, 50% of the screen height (<code>50svh</code>), right under the navbar (<code>--navbar-h</code>: 71 px on tablet, 63 px on mobile; use your navbar's real height). The spheres are centered in it and sized from its width, so they fill it at every width and get cropped top and bottom. The hero's top padding reserves navbar + band + 36 px, and the text follows.",
      "Keep the hero content above the effect: <code>position: relative; z-index: 1</code> on the content wrapper.",
      "The navbar is not part of the effect, and needs no attributes.",
    ],
    behaviour: [
      "Three nested dotted spheres, slowly turning.",
      "On load, the dots gather from a scatter into the spheres.",
      "<b>Hover:</b> dots near the cursor are pushed aside.",
      "<b>Click:</b> the dots burst outward, then reform.",
      "<b>991 px and below:</b> the spheres centered in the band, filling its width. Under 768 px: 4,500 dots at 60% size, instead of 7,000.",
      "<b>Resizing</b> across 992 px or 768 px swaps the layouts.",
    ],
  },
  {
    id: "cta",
    label: "CTA",
    template: "src/sections/cta.html",
    title: "CTA: “See how Clarify solves yours”",
    figma: [
      ["Desktop", "13311-5898"],
      ["Mobile", "13647-37427"],
    ],
    attributes: [
      ["The card (Figma <code>13311:5899</code>)", ["data-particles-component", 'data-preset="cta"', "data-particles-wrap"]],
      ["The <b>“Get started”</b> button", ["data-particles-excite"]],
    ],
    requirements: [
      "The card keeps <code>position: relative</code>, <code>overflow: clip</code> (or <code>hidden</code>) and its 24 px radius. The network bleeds off the card's edges, and the card crops it.",
      "<b>The canvas covers the whole card</b> (the preset has <code>bleed</code> on). <code>.u-particles-threejs</code> only decides where the network sits and how big it is, so nodes that drift past it spill softly instead of being cut. The card's content needs <code>position: relative; z-index: 1</code> to stay above it.",
      "<b>Desktop:</b> the network sits in the right 55%, and its left edge always stays inside that area, so it never reaches the text. The card follows the site container, which stops at 1512 px.",
      "<b>Tablet</b> (768–991 px): same horizontal layout, tightened: 64 px / 48 px card padding, the network in the right half, the text in the left half (<code>max-width: calc(50% - 24px)</code>).",
      "<b>Mobile</b> (767 px and below) stacks: the zone is a full-width band at the top of the card, 50% of the screen height (<code>50svh</code>). The card's top padding reserves it (band + 36 px gap). The text is centered below in the phone design's 313 px column and the button goes full width. The network recenters itself for this (the preset has settings per breakpoint), so only the CSS above is needed.",
    ],
    behaviour: [
      "Three round network shapes (constellation → clusters → spiral). Each holds for 6 s, then glides into the next over 2 s.",
      "<b>Depth:</b> far nodes are smaller and dimmer, and the network tilts gently toward the cursor.",
      "<b>Hover:</b> the nodes nearest the cursor softly brighten and are pushed aside.",
      "<b>Click:</b> a slow ripple of light through the connections.",
      "<b>Button:</b> hovering “Get started” lights the whole network up.",
      "<b>Mobile:</b> the same network as a dome filling the band's width, its bottom kept in the band, cropped at the top.",
      "<b>Resizing</b> across 768 px (or rotating a tablet) swaps between the compositions.",
    ],
  },
];

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
      ["The hero section", ["data-how-component", 'data-preset="hero"', "data-how-wrap"]],
      ["The <b>“Book a demo”</b> and <b>“Talk to an engineer”</b> buttons", ["data-particles-excite"]],
    ],
    requirements: [
      "The section needs <code>position: relative</code> and <code>overflow: clip</code> (or <code>hidden</code>). The outer sphere bleeds off the right edge on desktop, and the section crops it.",
      "<b>The canvas is exactly <code>.u-particles-threejs</code></b>: the spheres are drawn inside that div, with room around them, so they're never cut at its edges.",
      "<b>Desktop:</b> the spheres are drawn at the center of <code>.u-particles-threejs</code>, with the outer shell's radius at 38% of the div's side. To move or resize the spheres, move or resize the div.",
      "<b>Tablet</b> (768–991 px): same horizontal layout as desktop. The div keeps desktop's proportions (<code>width: 70.3%</code> of the hero, same center), so the spheres scale with the screen; the text stays in the left half (<code>max-width: calc(50% - 24px)</code>).",
      "<b>Mobile</b> (767 px and below): the hero stacks. The div is a full-width band, 50% of the screen height (<code>50svh</code>), right under the navbar (<code>--navbar-h</code>: 63 px; use your navbar's real height). The spheres are centered in it and fitted inside it (the preset has settings per breakpoint): as big as the band allows, 8 px inside its edges, so they never reach under the navbar or into the text. The hero's top padding reserves navbar + band + 36 px, and the text follows.",
      "Keep the hero content above the effect: <code>position: relative; z-index: 1</code> on the content wrapper.",
      "The navbar is not part of the effect, and needs no attributes.",
    ],
    behaviour: [
      "Four dotted shapes in a loop: three nested spheres → meridians → a spiral → a burst. Each holds for 7 s, then morphs into the next over 2.2 s: halfway through, the dots burst outward and swirl, then pull into the next shape. The spheres turn slowly. They're there from the first frame (no entrance), as the CTA.",
      "<b>Depth:</b> the spheres turn gently toward the cursor.",
      "<b>Hover:</b> dots near the cursor are pushed aside, opening a soft hole about 220 px wide.",
      "<b>Buttons:</b> hovering “Book a demo” or “Talk to an engineer” lights all the dots up (mouse only), as “Get started” does on the CTA.",
      "<b>Click:</b> no reaction.",
      "<b>Touch</b> (phones, tablets): no reaction to a finger (no hover, no tap, no spin), so swipes always scroll the page.",
      "<b>Tablet</b> (768–991 px): the spheres are smaller, so they use fewer, smaller dots (6,500; 4,800 at 879 px and below) to keep desktop's look.",
      "<b>767 px and below:</b> the spheres centered in the band and fitted inside it, with 6,500 dots at 60% size instead of 10,000, rendered at the phone's full resolution.",
      "<b>Resizing</b> across 768 px swaps the layouts.",
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
      ["An empty div inside the card, covering it (the background)", ["data-particles-bg"]],
      ["The <b>“Get started”</b> button", ["data-particles-excite"]],
    ],
    requirements: [
      "The card keeps <code>position: relative</code>, <code>overflow: clip</code> (or <code>hidden</code>) and its 24 px radius. The network bleeds off the card's edges, and the card crops it.",
      "<b>Two canvases:</b> the background (the grid and its lights) is drawn into the <code>data-particles-bg</code> div, at 100% × 100% of it; give it <code>position: absolute; inset: 0</code> so it covers the card. The network is drawn into <code>.u-particles-threejs</code>, which the script creates right after the background div, so the network sits on top with no z-index.",
      "<b>The network's canvas covers the whole card</b> too (the preset has <code>bleed</code> on). <code>.u-particles-threejs</code> only decides where the network sits and how big it is, so nodes that drift past it spill softly instead of being cut. The card's content needs <code>position: relative; z-index: 1</code> to stay above both.",
      "<b>Optional:</b> without a <code>data-particles-bg</code> div (the markup before v1.12.0), the background is drawn on the network's canvas instead. It looks the same.",
      "<b>Desktop:</b> the network sits in the right 55%, and its left edge always stays inside that area, so it never reaches the text. The card follows the site container, which stops at 1512 px.",
      "<b>Tablet</b> (768–991 px): same horizontal layout, tightened: 64 px / 48 px card padding, the network in the right half, the text in the left half (<code>max-width: calc(50% - 24px)</code>).",
      "<b>Mobile</b> (767 px and below) stacks: the zone is a full-width band at the top of the card, 50% of the screen height (<code>50svh</code>). The card's top padding reserves it (band + 36 px gap). The text is centered below in the phone design's 313 px column and the button goes full width. The network recenters itself for this (the preset has settings per breakpoint), so only the CSS above is needed.",
    ],
    behaviour: [
      "Three round network shapes (constellation → clusters → spiral). Each holds for 6 s, then glides into the next over 2 s.",
      "<b>Background:</b> a fine grid of squares across the card, lit only by two soft lights that glide slowly between two places (upper right behind the network, lower left under the text) on slightly different paths each time. Drawn by the script into the <code>data-particles-bg</code> div; nothing else to build.",
      "<b>Depth:</b> far nodes are smaller and dimmer, and the network tilts gently toward the cursor.",
      "<b>Hover:</b> the nodes nearest the cursor are pushed aside.",
      "<b>Click:</b> a slow ripple of light through the connections.",
      "<b>Button:</b> hovering “Get started” lights the whole network up (mouse only).",
      "<b>Touch</b> (phones, tablets): drag sideways on the network to spin it; hold a finger still for a moment to grab it, then it turns up and down too. A normal swipe still scrolls the page.",
      "<b>Mobile:</b> the same network as a dome filling the band's width, its bottom kept in the band, cropped at the top.",
      "<b>Resizing</b> across 768 px (or rotating a tablet) swaps between the compositions.",
    ],
  },
  {
    id: "fjord",
    label: "What Clarify does",
    template: "src/sections/fjord.html",
    title: "What Clarify does: “How Clarify helps you earn more, and cut cost”",
    figma: [
      ["Desktop", "13311-5140"],
      ["Mobile", "13645-31185"],
    ],
    attributes: [
      ["The section (the observer)", ["data-fjord-component", 'data-preset="fjord"']],
      ["The map panel (the target: the map is drawn here)", ["data-fjord-wrap"]],
      ["Each tab: the three desktop items and the three mobile tabs (<b>Own</b>, <b>Refine</b>, <b>Deliver</b>)", ['data-fjord-tab="0"', 'data-fjord-tab="1"', 'data-fjord-tab="2"']],
    ],
    requirements: [
      "<b>The tabs are run by the script:</b> it adds <code>is-active</code> to the active tab (style that combo class in Webflow) and sets <code>--tab-progress</code> (0 → 1) on it for the timer line. No Webflow Tabs component or interactions needed.",
      "<b>Desktop:</b> the three items on the left (458 px), the map panel on the right (552 px tall). The timer line is the active item's right edge, filling top to bottom.",
      "<b>Tablet and mobile</b> (991 px and below): stacked. The map panel on top (16:10 on tablet, square on mobile), the Own / Refine / Deliver row under it, then only the active item's text. The timer line runs under the active tab.",
      "<b>Credit line:</b> the map is built from open satellite and elevation data (CC BY 4.0), so the small credit inside the map panel has to stay.",
      "<b>The map panel's size is yours:</b> set it per breakpoint in Webflow (height or aspect ratio on the <code>data-fjord-wrap</code> element). The map, its camera and its cards fit whatever box they get, no script change needed. The story is framed for roughly 16:10 to square; avoid very wide, short strips. Tell us the sizes you pick and we'll match this page.",
    ],
    behaviour: [
      "<b>A story in three steps, one per tab.</b> <b>Own:</b> raw data churns on the floor, a line sweeps it into order and it keeps pulsing while the camera moves in. <b>Refine:</b> signals lift and gather into three clusters (one reading rises pink as the anomaly), and three tiles assemble on the reasoning level, with their labels. <b>Deliver:</b> straight down onto the stack; the maintenance risk forms a ring and is routed to a person and an AI agent, whose switches flip on.",
      "Each tab plays its part the first time it opens; going back shows it finished. Clicking the active tab does nothing.",
      "<b>Autoplay:</b> each tab stays 7 s, then the next one opens. A click jumps to that tab and the timer restarts from there. The timer waits while the mouse is over the map, so the cards can be read.",
      "<b>The cards and labels</b> are drawn by the script (HTML over the map, in the site's card style); nothing to build in Webflow. Their text can be changed per section with attributes (see the handover).",
      "<b>No drag, no touch reaction:</b> the camera tells the story; swipes scroll the page.",
      "<b>Reduced motion:</b> no autoplay; each tab shows its finished frame, with no animation.",
    ],
  },
  {
    id: "extend",
    label: "Built to extend",
    template: "src/sections/extend.html",
    title: "Built to extend: the globe",
    figma: [
      ["Desktop", "13311-5236"],
      ["Mobile", "13646-33349"],
    ],
    attributes: [["The globe's cell (Figma <code>13311:5245</code>)", ["data-particles-component", 'data-preset="globe"', "data-particles-wrap"]]],
    requirements: [
      "The globe's cell needs <code>position: relative</code>. The script creates <code>.u-particles-threejs</code> inside it; give that div <code>position: absolute; inset: 0</code> so it covers the cell. The globe is drawn centered in it.",
      "<b>Desktop:</b> the cell is half the row, 507 px tall, the globe about 360 px across.",
      "<b>Tablet</b> (768–991 px): same two columns, the cell square.",
      "<b>Mobile</b> (767 px and below): stacked, as Figma <code>13646:33349</code>. The cell is full width at 359 : 269 (<code>aspect-ratio: 359 / 269</code>), the globe about 72% of its height; the text under it.",
    ],
    behaviour: [
      "A network globe: dots joined to their nearest neighbours, turning slowly. Far dots are dimmer.",
      "<b>Light:</b> every 4.5 s a soft band of light crosses the globe diagonally; the dots it passes grow and brighten, and their lines light up.",
      "<b>Drag to spin</b>, on desktop (mouse) and touch: it coasts on after release and the tilt eases back. On touch, a sideways drag spins it and an up/down swipe still scrolls the page.",
      "No hover or click reactions.",
      "<b>Reduced motion:</b> it stands still and doesn't spin.",
    ],
  },
];

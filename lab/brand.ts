// The brand's colours for the labs, from the brand guidelines
// (Clarify - Brandguidelines, brand/tokens.ts): Carbon and Bone lead, the
// support ramps (Slate, Mist, Sage, Mauve) colour illustration. Legacy green
// is the logo's alone, so it isn't here.

// grounds: what a frame can sit on
export const GROUNDS: Record<string, string> = {
  "Carbon 950": "#030304",
  "Carbon 900": "#060709",
  "Carbon 800": "#080a0c",
  "Carbon 700": "#14171a",
  "Bone 50": "#f8fbfd",
  "Bone 100": "#f4f7fa",
  "Bone 200": "#ebeff3",
};

// the model's colour (Auto: the site's own, Bone on dark, Carbon on light)
export const INKS: Record<string, string> = {
  "Bone 50": "#f8fbfd",
  "Bone 300": "#dee2e8",
  "Bone 500": "#b7bec5",
  "Carbon 900": "#060709",
  "Carbon 700": "#14171a",
  "Slate 400": "#bbc6ce",
  "Slate 600": "#596872",
  "Mist 300": "#c4dcf2",
  "Mist 500": "#5f8db4",
  "Sage 300": "#c2e1d6",
  "Sage 500": "#5b9685",
  "Mauve 300": "#e9d0e6",
  "Mauve 500": "#a2789d",
};

// a light ground: the model is drawn dark on it (the labs draw it light on
// black and invert the frame, as light added to light can't show dark)
export function isLight(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140;
}
const invert = (hex: string) => "#" + (0xffffff ^ parseInt(hex.replace("#", ""), 16)).toString(16).padStart(6, "0");

// the settings that colour a model of this style (light: the frame is
// inverted, so it's drawn in the colour's opposite to come out right)
export function inkOf(style: string, name: string, light: boolean): Record<string, unknown> {
  const hex = INKS[name];
  if (!hex) return {};
  const c = light ? invert(hex) : hex;
  if (style === "dots") return { colorMode: "single", color1: c };
  if (style === "network") return { color: c, lineColor: c };
  return { color: c };
}

// the ground's colour (a name saved before the swatches: Carbon 900)
export const groundOf = (o: { background: string }) => GROUNDS[o.background] ?? GROUNDS["Carbon 900"];

// a light ground: the model drawn dark on it
export const lightOf = (o: { background: string }) => isLight(groundOf(o));

// A swatch beside every brand colour in the panel's dropdowns (the value
// shown, and each option in the list), drawn by lab.css from --swatch
const SWATCHES: Record<string, string> = { ...INKS, ...GROUNDS };
function swatch() {
  for (const el of document.querySelectorAll<HTMLElement>(".dialkit-select-value, .dialkit-select-option")) {
    const hex = SWATCHES[el.textContent?.trim() ?? ""];
    if (hex) {
      if (el.style.getPropertyValue("--swatch") !== hex) el.style.setProperty("--swatch", hex);
      el.classList.add("swatched");
    } else if (el.classList.contains("swatched")) {
      el.classList.remove("swatched");
      el.style.removeProperty("--swatch");
    }
  }
}
new MutationObserver(swatch).observe(document.documentElement, { childList: true, subtree: true, characterData: true });

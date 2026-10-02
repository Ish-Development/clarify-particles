// Color scales from the Figma file "Clarify — Website Design Foundation"
// (collection "Color Modes", Dark mode: what the site uses), read with the
// Figma plugin API on 2026-10-02. Variable names are "<scale>/<step>"
// (Bone and Carbon sit under "Neutrals/" in Figma).
export interface ColorScale {
  name: string;
  steps: [step: number, hex: string][];
}

export const FIGMA_SCALES: ColorScale[] = [
  {
    name: "Slate",
    steps: [[50, "#0f1317"], [100, "#191f24"], [200, "#273037"], [300, "#3d4952"], [400, "#596872"], [500, "#7b8a96"], [600, "#bbc6ce"], [700, "#d3dadf"], [800, "#e4e9ec"], [900, "#eff2f4"], [950, "#f7f8f9"]],
  },
  {
    name: "Mist",
    steps: [[50, "#0b141b"], [100, "#11202c"], [200, "#1a3145"], [300, "#2a4a65"], [400, "#3f6a8d"], [500, "#5f8db4"], [600, "#a4c9e9"], [700, "#c4dcf2"], [800, "#dbeaf7"], [900, "#ebf3fa"], [950, "#f5f8fc"]],
  },
  {
    name: "Sage",
    steps: [[50, "#0a1512"], [100, "#10221d"], [200, "#19352d"], [300, "#285045"], [400, "#3d7162"], [500, "#5b9685"], [600, "#a2d0c1"], [700, "#c2e1d6"], [800, "#daede6"], [900, "#eaf5f1"], [950, "#f4f9f7"]],
  },
  {
    name: "Mauve",
    steps: [[50, "#180f17"], [100, "#261925"], [200, "#3b2739"], [300, "#583c56"], [400, "#7c5779"], [500, "#a2789d"], [600, "#dab7d6"], [700, "#e9d0e6"], [800, "#f1e3ef"], [900, "#f7eff6"], [950, "#faf6fa"]],
  },
  {
    name: "Bone",
    steps: [[50, "#f8fbfd"], [100, "#f4f7fa"], [200, "#ebeff3"], [300, "#dee2e8"], [400, "#cdd2d8"], [500, "#b7bec5"], [600, "#a4aab1"], [700, "#8e949a"], [800, "#757a7f"], [900, "#575b5f"], [950, "#3a3d41"]],
  },
  {
    name: "Carbon",
    steps: [[50, "#6f7174"], [100, "#5c5f62"], [200, "#4b4e52"], [300, "#3c3f43"], [400, "#2f3236"], [500, "#23262a"], [600, "#1c1e22"], [700, "#14171a"], [800, "#080a0c"], [900, "#060709"], [950, "#030304"]],
  },
];

// "Mist/500" for a hex, if it's one of the scales' colors
export function colorName(hex: string): string | null {
  const h = hex.toLowerCase();
  for (const s of FIGMA_SCALES) for (const [step, c] of s.steps) if (c === h) return `${s.name}/${step}`;
  return null;
}

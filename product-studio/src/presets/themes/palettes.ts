import type { ColorPalette, ColorTokens } from "../../types/tokens";

/**
 * Dove Expressions brand colors — defined independently inside Product Studio
 * (source: Dove Expressions brand system). Exact HEX only; never approximated.
 */
export const DOVE_BRAND = {
  burgundy: "#630000",
  charcoal: "#1B1717",
  softWhite: "#FDFDFD",
  gold: "#E6A742",
  coral: "#D96248",
  palePink: "#F2DFD8",
} as const;

/** Charcoal at reduced opacity — muted text without inventing a new hex. */
const CHARCOAL_MUTED = "rgba(27, 23, 23, 0.68)";

const brandBase: ColorTokens = {
  primary: DOVE_BRAND.burgundy,
  secondary: DOVE_BRAND.charcoal,
  accent: DOVE_BRAND.gold,
  background: DOVE_BRAND.softWhite,
  text: DOVE_BRAND.charcoal,
  mutedText: CHARCOAL_MUTED,
  // Functional writing lines: charcoal drawn at `lineOpacity`.
  line: DOVE_BRAND.charcoal,
  border: DOVE_BRAND.burgundy,
  decorativeAccent: DOVE_BRAND.gold,
  lineOpacity: 0.32,
};

export const PALETTES: ColorPalette[] = [
  { id: "dove-signature", label: "Dove Signature — Burgundy / Soft White / Gold", brandPalette: true, colors: brandBase },
  {
    id: "dove-blush",
    label: "Dove Blush — Burgundy / Pale Pink",
    brandPalette: true,
    colors: { ...brandBase, accent: DOVE_BRAND.coral, secondary: DOVE_BRAND.palePink, decorativeAccent: DOVE_BRAND.palePink },
  },
  {
    id: "dove-coral",
    label: "Dove Warmth — Burgundy / Coral / Gold",
    brandPalette: true,
    colors: { ...brandBase, accent: DOVE_BRAND.coral, decorativeAccent: DOVE_BRAND.coral },
  },
  {
    id: "dove-charcoal",
    label: "Dove Charcoal — Charcoal / Gold",
    brandPalette: true,
    colors: { ...brandBase, primary: DOVE_BRAND.charcoal, border: DOVE_BRAND.charcoal },
  },
  // ── Variant palettes requested for product variants. These use colors
  //    OUTSIDE the approved brand palette and require designer approval. ──
  {
    id: "variant-sage",
    label: "Sage (variant — pending approval)",
    brandPalette: false,
    colors: { ...brandBase, primary: "#56644F", border: "#56644F", decorativeAccent: "#A9B8A0" },
    note: "Non-brand hex values — pending designer approval.",
  },
  {
    id: "variant-purple",
    label: "Purple (variant — pending approval)",
    brandPalette: false,
    colors: { ...brandBase, primary: "#4A2C5E", border: "#4A2C5E", decorativeAccent: "#B9A3C9" },
    note: "Non-brand hex values — pending designer approval.",
  },
  {
    id: "variant-blue",
    label: "Blue (variant — pending approval)",
    brandPalette: false,
    colors: { ...brandBase, primary: "#1E3A5C", border: "#1E3A5C", decorativeAccent: "#9FB6CE" },
    note: "Non-brand hex values — pending designer approval.",
  },
];

export function findPalette(id: string): ColorPalette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

export function resolveColors(paletteId: string, overrides: Partial<ColorTokens> = {}): ColorTokens {
  return { ...findPalette(paletteId).colors, ...overrides };
}

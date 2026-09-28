import type { ColorPalette, ColorTokens } from "../../types/tokens";
import { JCS_PALETTES_ADAPTED } from "../../design-library/palettes";

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
  decorBase: DOVE_BRAND.burgundy,
  decorHighlight: DOVE_BRAND.palePink,
  lineArt: DOVE_BRAND.gold,
  patternGround: DOVE_BRAND.softWhite,
  patternInk: DOVE_BRAND.burgundy,
  lineOpacity: 0.32,
};

/**
 * Product Studio's own palettes derive the newer roles from their existing
 * ones: line art takes the decoration accent, patterns print the decoration
 * base on the paper. (Snapshotted JCS palettes carry JCS's own values.)
 */
type DerivedRoles = "lineArt" | "patternGround" | "patternInk";
export const NEUTRAL_LUXE_ID = "neutral-cheetah-luxe";
const derived = (c: Omit<ColorTokens, DerivedRoles> & Partial<Pick<ColorTokens, DerivedRoles>>): ColorTokens => ({ ...c, lineArt: c.decorativeAccent, patternGround: c.background, patternInk: c.decorBase });

export const PALETTES: ColorPalette[] = [
  { id: "dove-signature", label: "Dove Signature — Burgundy / Soft White / Gold", brandPalette: true, colors: brandBase },
  {
    id: "dove-blush",
    label: "Dove Blush — Burgundy / Pale Pink",
    brandPalette: true,
    // Brand system: Pale Pink for "interior journal pages / feminine variants".
    colors: { ...brandBase, background: DOVE_BRAND.palePink, accent: DOVE_BRAND.coral, secondary: DOVE_BRAND.palePink, decorativeAccent: DOVE_BRAND.gold, decorBase: DOVE_BRAND.burgundy, decorHighlight: DOVE_BRAND.softWhite },
  },
  {
    id: "dove-coral",
    label: "Dove Warmth — Burgundy / Coral / Gold",
    brandPalette: true,
    // Brand system: Coral for "warmth accents / supporting highlights" — rules and boxes.
    colors: { ...brandBase, accent: DOVE_BRAND.coral, border: DOVE_BRAND.coral, decorativeAccent: DOVE_BRAND.coral },
  },
  {
    id: "dove-charcoal",
    label: "Dove Charcoal — Charcoal / Gold",
    brandPalette: true,
    colors: { ...brandBase, primary: DOVE_BRAND.charcoal, border: DOVE_BRAND.charcoal, decorBase: DOVE_BRAND.charcoal },
  },
  // Cover & divider design preset (after the brand palettes, so Dove Signature stays the default).
  // Sampled from the reference cover: burgundy, tan, terracotta, slate blue and blush
  // circles, gold rings and rule, cheetah print, black script on white paper.
  {
    id: NEUTRAL_LUXE_ID,
    label: "Neutral Cheetah Luxe",
    brandPalette: false,
    colors: {
      primary: "#5b0610", secondary: "#e9d3c0", accent: "#c5674a", background: "#ffffff", text: "#121212", mutedText: "#5e5148",
      line: "#121212", border: "#121212", decorativeAccent: "#718496", decorBase: "#5b0610", decorHighlight: "#f2d8cd", lineOpacity: 0.3,
      lineArt: "#c8974d", patternGround: "#d39a6e", patternInk: "#22140f",
    },
  },
  // ── Variant palettes requested for product variants. These use colors
  //    OUTSIDE the approved brand palette and require designer approval. ──
  {
    id: "variant-sage",
    label: "Sage (draft — pending approval)",
    brandPalette: false,
    colors: { ...brandBase, primary: "#56644F", border: "#56644F", decorBase: "#56644F", decorativeAccent: "#A9B8A0" },
    note: "Non-brand hex values — pending designer approval.",
  },
  {
    id: "variant-purple",
    label: "Purple (draft — pending approval)",
    brandPalette: false,
    colors: { ...brandBase, primary: "#4A2C5E", border: "#4A2C5E", decorBase: "#4A2C5E", decorativeAccent: "#B9A3C9" },
    note: "Non-brand hex values — pending designer approval.",
  },
  {
    id: "variant-blue",
    label: "Blue (draft — pending approval)",
    brandPalette: false,
    colors: { ...brandBase, primary: "#1E3A5C", border: "#1E3A5C", decorBase: "#1E3A5C", decorativeAccent: "#9FB6CE" },
    note: "Non-brand hex values — pending designer approval.",
  },
  // Neutral Cheetah Luxe sets its own line-art (gold) and cheetah-print colors.
].map((p) => ({ ...p, colors: p.id === NEUTRAL_LUXE_ID ? (p.colors as ColorTokens) : derived(p.colors) }));
PALETTES.push(
  // Approved Journal Color Studio palettes and color families (one-way snapshot).
  ...JCS_PALETTES_ADAPTED,
);

export function findPalette(id: string): ColorPalette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

export function resolveColors(paletteId: string, overrides: Partial<ColorTokens> = {}): ColorTokens {
  return { ...findPalette(paletteId).colors, ...overrides };
}

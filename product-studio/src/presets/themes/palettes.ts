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

/** How the palette's colors are used on the page: an arrangement and the paper. */
export type ColorLook = { arrangement?: number; paper?: "palette" | "white" };

export const WHITE_PAPER = "#FFFFFF";

/** The roles an arrangement moves the palette's colors between (titles and headings, rules, line art). */
const ARRANGED = ["primary", "accent", "decorativeAccent"] as const;
/** Headings and titles keep at least this contrast against the paper (WCAG large-text minimum). */
export const HEADING_CONTRAST = 3;

function luminance(hex: string): number | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const lin = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
export function contrast(a: string, b: string): number {
  const x = luminance(a), y = luminance(b);
  if (x === null || y === null) return Infinity;
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * The palette's arrangements: its colors rotated through titles / headings,
 * rules and line art. The first is always the palette as designed; the rest
 * keep headings readable on the paper. Colors only move between roles — no new
 * colors appear.
 */
export function arrangementsOf(base: ColorTokens, paper: string = base.background): ColorTokens[] {
  const colors = [...new Set([...ARRANGED.map((r) => base[r]), base.secondary].filter((h) => luminance(h) !== null && h.toLowerCase() !== base.background.toLowerCase()))];
  const out: ColorTokens[] = [];
  for (let k = 0; k < Math.max(1, colors.length); k++) {
    const next = { ...base };
    if (k > 0) {
      ARRANGED.forEach((r, i) => (next[r] = colors[(i + k) % colors.length]));
      // Line art follows its color when the palette derived it that way.
      if (base.lineArt === base.decorativeAccent) next.lineArt = next.decorativeAccent;
      if (contrast(next.primary, paper) < HEADING_CONTRAST) continue;
      if (out.some((o) => ARRANGED.every((r) => o[r] === next[r]))) continue;
    }
    out.push(next);
  }
  return out;
}

export function resolveColors(paletteId: string, overrides: Partial<ColorTokens> = {}, look: ColorLook = {}): ColorTokens {
  const base = findPalette(paletteId).colors;
  const paper = look.paper === "white" ? WHITE_PAPER : base.background;
  const options = arrangementsOf(base, paper);
  const arranged = options[Math.abs(Math.round(look.arrangement ?? 0)) % options.length];
  const out = { ...arranged, background: paper, ...overrides };
  return { ...out, goldInk: overrides.goldInk ?? printGold(out.lineArt), goldPaper: overrides.goldPaper ?? paperGold(out.lineArt) };
}

/**
 * A gold that prints as gold: inks shift warm golds toward orange (more
 * magenta than the screen shows), so an orange-leaning gold (hue 15°–50°) is
 * turned toward yellow (at least 42°) and made slightly less saturated.
 * Any other color is returned unchanged.
 */
type Hsl = { h: number; s: number; l: number };
function toHsl(hex: string): Hsl | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}
function fromHsl({ h, s, l }: Hsl): string {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m0 = l - c / 2;
  const [R, G, B] = h < 60 ? [c, x, 0] : [x, c, 0];
  return `#${[R, G, B].map((v) => Math.round((v + m0) * 255).toString(16).padStart(2, "0")).join("")}`;
}
/** A gold (warm yellow-orange), as opposed to a red, brown-grey or green line color. */
const isGold = (c: Hsl | null): c is Hsl => !!c && c.h >= 15 && c.h <= 55 && c.s >= 0.2;

/** Gold lines and step numbers on screen: a touch yellower than the palette's line art, so they read gold, not orange. */
export function printGold(hex: string): string {
  const c = toHsl(hex);
  if (!isGold(c) || c.h > 50) return hex;
  return fromHsl({ h: Math.min(48, Math.max(42, c.h + 6)), s: c.s * 0.88, l: c.l * 0.97 });
}

/**
 * The same gold as sent to the printer. A home inkjet adds warmth (gold → peach / orange), so the gold sent is
 * yellower (44°), calmer and deeper, and lands on gold on paper. Chosen from a printed gold-match sheet: the Dove
 * gold #E6A742 → #AB8A30 (the sheet's C3, #AB9230 at 48°, printed a little green, so the hue moved to 44°, the hue of D2/D3). Not a gold → unchanged.
 */
export function paperGold(hex: string): string {
  const c = toHsl(hex);
  if (!isGold(c)) return hex;
  return fromHsl({ h: 44, s: Math.min(c.s, 0.56), l: Math.min(c.l * 0.74, 0.45) });
}

import againstUrl from "../../design-library/assets/fonts/against.otf?url";
import type {
  FontCategory,
  FontGroup,
  FontSelection,
  TypographyRole,
  TypographyRoleStyle,
  TypographySettings,
} from "../../types/tokens";

export type FontDefinition = {
  family: string;
  category: FontCategory;
  /** Google Fonts axis spec, e.g. "ital,wght@0,400;0,700;1,400". */
  googleSpec: string;
  fallback: string;
  /**
   * Average advance width as a fraction of the em (lowercase text).
   * Used ONLY by the pure text-fit estimator when a canvas is unavailable
   * (tests, SSR). The browser uses canvas measurement of the loaded font.
   */
  avgCharEm: number;
  /** Self-hosted brand face (not on Google Fonts): served from the design-library snapshot. */
  localUrl?: string;
};

/** Curated catalog. Brand faces (Dove Expressions brand system) listed first per category. */
export const FONT_CATALOG: FontDefinition[] = [
  // Serif
  { family: "Playfair Display", category: "serif", googleSpec: "ital,wght@0,400;0,600;0,700;1,400", fallback: "Georgia, serif", avgCharEm: 0.52 },
  { family: "Lora", category: "serif", googleSpec: "ital,wght@0,400;0,600;0,700;1,400", fallback: "Georgia, serif", avgCharEm: 0.52 },
  { family: "Cormorant Garamond", category: "serif", googleSpec: "ital,wght@0,400;0,600;0,700;1,400", fallback: "Georgia, serif", avgCharEm: 0.45 },
  { family: "EB Garamond", category: "serif", googleSpec: "ital,wght@0,400;0,600;0,700;1,400", fallback: "Georgia, serif", avgCharEm: 0.47 },
  { family: "Libre Baskerville", category: "serif", googleSpec: "ital,wght@0,400;0,700;1,400", fallback: "Georgia, serif", avgCharEm: 0.56 },
  // Journal Color Studio typography faces (FONT_STYLESHEETS, main ba916ad): Radley is the floral design's body face.
  { family: "Radley", category: "serif", googleSpec: "ital@0;1", fallback: "Georgia, serif", avgCharEm: 0.52 },
  { family: "Cardo", category: "serif", googleSpec: "ital,wght@0,400;0,700;1,400", fallback: "Georgia, serif", avgCharEm: 0.48 },
  // Sans serif
  { family: "Lato", category: "sans-serif", googleSpec: "ital,wght@0,400;0,700;1,400", fallback: "Helvetica, Arial, sans-serif", avgCharEm: 0.5 },
  { family: "Raleway", category: "sans-serif", googleSpec: "ital,wght@0,400;0,600;0,700;1,400", fallback: "Helvetica, Arial, sans-serif", avgCharEm: 0.53 },
  { family: "Montserrat", category: "sans-serif", googleSpec: "ital,wght@0,400;0,600;0,700;1,400", fallback: "Helvetica, Arial, sans-serif", avgCharEm: 0.58 },
  { family: "Josefin Sans", category: "sans-serif", googleSpec: "ital,wght@0,400;0,600;0,700;1,400", fallback: "Helvetica, Arial, sans-serif", avgCharEm: 0.5 },
  { family: "Inter", category: "sans-serif", googleSpec: "wght@400;600;700", fallback: "Helvetica, Arial, sans-serif", avgCharEm: 0.54 },
  // Script
  { family: "Birthstone Bounce", category: "script", googleSpec: "wght@400;500", fallback: "cursive", avgCharEm: 0.4 },
  { family: "The Nautigal", category: "script", googleSpec: "wght@400;700", fallback: "cursive", avgCharEm: 0.4 },
  { family: "Dancing Script", category: "script", googleSpec: "wght@400;700", fallback: "cursive", avgCharEm: 0.5 },
  { family: "Great Vibes", category: "script", googleSpec: "wght@400", fallback: "cursive", avgCharEm: 0.42 },
  { family: "Parisienne", category: "script", googleSpec: "wght@400", fallback: "cursive", avgCharEm: 0.45 },
  { family: "Pinyon Script", category: "script", googleSpec: "wght@400", fallback: "cursive", avgCharEm: 0.5 },
  // Handwritten
  { family: "Caveat", category: "handwritten", googleSpec: "wght@400;600;700", fallback: "cursive", avgCharEm: 0.42 },
  { family: "Kalam", category: "handwritten", googleSpec: "wght@400;700", fallback: "cursive", avgCharEm: 0.5 },
  { family: "Homemade Apple", category: "handwritten", googleSpec: "wght@400", fallback: "cursive", avgCharEm: 0.7 },
  // Display
  // Dove Expressions brand display face (JCS brand/against.otf, snapshot 14e4e75). avgCharEm measured from the font file.
  { family: "Against", category: "display", googleSpec: "", fallback: "Georgia, serif", avgCharEm: 0.7, localUrl: againstUrl },
  { family: "Cinzel", category: "display", googleSpec: "wght@400;600;700", fallback: "Georgia, serif", avgCharEm: 0.66 },
  { family: "Abril Fatface", category: "display", googleSpec: "wght@400", fallback: "Georgia, serif", avgCharEm: 0.58 },
  { family: "Bodoni Moda", category: "display", googleSpec: "ital,wght@0,400;0,700;1,400", fallback: "Georgia, serif", avgCharEm: 0.52 },
  // More Google Fonts (each checked against fonts.googleapis.com, 2026-10-01): classic serifs, elegant
  // capitals for covers, clean sans, and formal / flowing scripts.
  { family: "Cormorant", category: "serif", googleSpec: "ital,wght@0,400;0,600;0,700;1,400", fallback: "Georgia, serif", avgCharEm: 0.45 },
  { family: "Prata", category: "serif", googleSpec: "wght@400", fallback: "Georgia, serif", avgCharEm: 0.55 },
  { family: "Marcellus", category: "serif", googleSpec: "wght@400", fallback: "Georgia, serif", avgCharEm: 0.56 },
  { family: "Gilda Display", category: "serif", googleSpec: "wght@400", fallback: "Georgia, serif", avgCharEm: 0.52 },
  { family: "Crimson Pro", category: "serif", googleSpec: "ital,wght@0,400;0,600;0,700;1,400", fallback: "Georgia, serif", avgCharEm: 0.46 },
  { family: "Spectral", category: "serif", googleSpec: "ital,wght@0,400;0,600;0,700;1,400", fallback: "Georgia, serif", avgCharEm: 0.5 },
  { family: "DM Serif Display", category: "display", googleSpec: "ital@0;1", fallback: "Georgia, serif", avgCharEm: 0.54 },
  { family: "Italiana", category: "display", googleSpec: "wght@400", fallback: "Georgia, serif", avgCharEm: 0.5 },
  { family: "Cinzel Decorative", category: "display", googleSpec: "wght@400;700", fallback: "Georgia, serif", avgCharEm: 0.72 },
  { family: "Forum", category: "display", googleSpec: "wght@400", fallback: "Georgia, serif", avgCharEm: 0.48 },
  { family: "Yeseva One", category: "display", googleSpec: "wght@400", fallback: "Georgia, serif", avgCharEm: 0.6 },
  { family: "Playfair Display SC", category: "display", googleSpec: "ital,wght@0,400;0,700;1,400", fallback: "Georgia, serif", avgCharEm: 0.66 },
  { family: "Bebas Neue", category: "display", googleSpec: "wght@400", fallback: "Georgia, serif", avgCharEm: 0.4 },
  { family: "Marcellus SC", category: "display", googleSpec: "wght@400", fallback: "Georgia, serif", avgCharEm: 0.62 },
  { family: "Poppins", category: "sans-serif", googleSpec: "ital,wght@0,400;0,600;0,700;1,400", fallback: "Helvetica, Arial, sans-serif", avgCharEm: 0.58 },
  { family: "Jost", category: "sans-serif", googleSpec: "ital,wght@0,400;0,600;0,700;1,400", fallback: "Helvetica, Arial, sans-serif", avgCharEm: 0.5 },
  { family: "Work Sans", category: "sans-serif", googleSpec: "ital,wght@0,400;0,600;0,700;1,400", fallback: "Helvetica, Arial, sans-serif", avgCharEm: 0.55 },
  { family: "Nunito Sans", category: "sans-serif", googleSpec: "ital,wght@0,400;0,600;0,700;1,400", fallback: "Helvetica, Arial, sans-serif", avgCharEm: 0.53 },
  { family: "Quicksand", category: "sans-serif", googleSpec: "wght@400;600;700", fallback: "Helvetica, Arial, sans-serif", avgCharEm: 0.52 },
  { family: "Tenor Sans", category: "sans-serif", googleSpec: "wght@400", fallback: "Helvetica, Arial, sans-serif", avgCharEm: 0.56 },
  { family: "Allura", category: "script", googleSpec: "wght@400", fallback: "cursive", avgCharEm: 0.38 },
  { family: "Alex Brush", category: "script", googleSpec: "wght@400", fallback: "cursive", avgCharEm: 0.42 },
  { family: "Sacramento", category: "script", googleSpec: "wght@400", fallback: "cursive", avgCharEm: 0.36 },
  { family: "Tangerine", category: "script", googleSpec: "wght@400;700", fallback: "cursive", avgCharEm: 0.3 },
  { family: "Mrs Saint Delafield", category: "script", googleSpec: "wght@400", fallback: "cursive", avgCharEm: 0.4 },
  { family: "Italianno", category: "script", googleSpec: "wght@400", fallback: "cursive", avgCharEm: 0.33 },
  { family: "Monsieur La Doulaise", category: "script", googleSpec: "wght@400", fallback: "cursive", avgCharEm: 0.42 },
  { family: "Petit Formal Script", category: "script", googleSpec: "wght@400", fallback: "cursive", avgCharEm: 0.55 },
  { family: "Ephesis", category: "script", googleSpec: "wght@400", fallback: "cursive", avgCharEm: 0.36 },
  { family: "Corinthia", category: "script", googleSpec: "wght@400;700", fallback: "cursive", avgCharEm: 0.33 },
  { family: "Meow Script", category: "script", googleSpec: "wght@400", fallback: "cursive", avgCharEm: 0.42 },
  { family: "WindSong", category: "script", googleSpec: "wght@400;500", fallback: "cursive", avgCharEm: 0.55 },
  { family: "Satisfy", category: "handwritten", googleSpec: "wght@400", fallback: "cursive", avgCharEm: 0.45 },
  { family: "Amatic SC", category: "handwritten", googleSpec: "wght@400;700", fallback: "cursive", avgCharEm: 0.32 },
  { family: "Shadows Into Light", category: "handwritten", googleSpec: "wght@400", fallback: "cursive", avgCharEm: 0.42 },
  { family: "La Belle Aurore", category: "handwritten", googleSpec: "wght@400", fallback: "cursive", avgCharEm: 0.5 },
];

export const FONT_CATEGORY_LABEL: Record<FontCategory, string> = {
  serif: "Serif",
  "sans-serif": "Sans Serif",
  script: "Script",
  handwritten: "Handwritten",
  display: "Display",
};

export function findFont(family: string): FontDefinition {
  return FONT_CATALOG.find((f) => f.family === family) ?? FONT_CATALOG[0];
}

export function fontStack(family: string): string {
  const f = findFont(family);
  return `"${f.family}", ${f.fallback}`;
}

/**
 * Default font selection — Dove Expressions brand typography (independently
 * defined here): Cinzel for covers, Playfair Display for headings, Lato for
 * labels/body. Three families maximum per design (brand rule).
 */
/**
 * Type pairings that belong to a Journal Color Studio design (DESIGN_PRESETS,
 * main ba916ad). Only the pairings — cover lettering and title-plate styles are
 * cover-specific and stay in Journal Color Studio.
 */
export const DESIGN_TYPE_PAIRINGS: { id: string; label: string; short?: string; fonts: Partial<FontSelection> }[] = [
  { id: "classic", label: "Classic — Playfair Display headings, Lato text", short: "Classic serif", fonts: { cover: "Cinzel", headings: "Playfair Display", subheadings: "Lato", body: "Lato", accent: "Playfair Display" } },
  { id: "script-serif", label: "Script + serif — Great Vibes titles, Playfair Display headings, Lato text", short: "Script + serif", fonts: { cover: "Great Vibes", headings: "Playfair Display", subheadings: "Lato", body: "Lato", accent: "Great Vibes" } },
  { id: "modern", label: "Modern — Josefin Sans headings, Lato text", short: "Modern sans", fonts: { cover: "Josefin Sans", headings: "Josefin Sans", subheadings: "Josefin Sans", body: "Lato", accent: "Josefin Sans" } },
  { id: "jcs-floral", label: "Floral design — Cormorant Garamond headings, Radley text", short: "Elegant serif (Floral design)", fonts: { headings: "Cormorant Garamond", subheadings: "Cormorant Garamond", body: "Radley", accent: "Cormorant Garamond" } },
  { id: "jcs-abstract", label: "Abstract watercolor — Playfair Display", short: "Playfair throughout (Abstract watercolor)", fonts: { cover: "Playfair Display", headings: "Playfair Display", accent: "Playfair Display" } },
];

export const DEFAULT_FONTS: FontSelection = {
  cover: "Cinzel",
  headings: "Playfair Display",
  subheadings: "Lato",
  body: "Lato",
  accent: "Playfair Display",
};

const role = (
  group: FontGroup,
  sizePt: number,
  extra: Partial<TypographyRoleStyle> = {},
): TypographyRoleStyle => ({
  group,
  sizePt,
  weight: 400,
  style: "normal",
  color: "text",
  trackingEm: 0,
  lineHeight: 1.2,
  align: "left",
  transform: "none",
  ...extra,
});

/**
 * Role defaults. Sizes follow research 2.4 typography defaults (month 22,
 * weekday 9 uppercase, dates 12, section heads 11 bold, body 9, tiny labels 7,
 * footers 7) and stay inside the A7 observed ranges.
 */
export const DEFAULT_ROLES: Record<TypographyRole, TypographyRoleStyle> = {
  coverTitle: role("cover", 30, { color: "primary", align: "center", trackingEm: 0.08, transform: "uppercase" }),
  coverSubtitle: role("subheadings", 12, { color: "text", align: "center", trackingEm: 0.2, transform: "uppercase" }),
  productTitle: role("headings", 22, { color: "primary", align: "center" }),
  monthTitle: role("headings", 22, { color: "primary" }),
  weekTitle: role("headings", 18, { color: "primary" }),
  pageTitle: role("headings", 16, { color: "primary" }),
  sectionHeading: role("subheadings", 9, { weight: 700, color: "primary", trackingEm: 0.12, transform: "uppercase" }),
  subheading: role("subheadings", 9, { weight: 700, color: "text", trackingEm: 0.1, transform: "uppercase" }),
  body: role("body", 9),
  prompt: role("accent", 11, { style: "italic", lineHeight: 1.35 }),
  label: role("subheadings", 7, { color: "mutedText", trackingEm: 0.12, transform: "uppercase" }),
  accent: role("accent", 12, { style: "italic", color: "accent" }),
  date: role("subheadings", 12, { weight: 700, color: "text" }),
  number: role("subheadings", 9, { color: "mutedText" }),
  time: role("subheadings", 7.5, { color: "mutedText", align: "right" }),
  footer: role("subheadings", 7, { color: "mutedText", align: "center", trackingEm: 0.1 }),
};

export const ROLE_LABELS: Record<TypographyRole, string> = {
  coverTitle: "Cover Title",
  coverSubtitle: "Cover Subtitle",
  productTitle: "Product Title",
  monthTitle: "Month Title",
  weekTitle: "Week Title",
  pageTitle: "Page Title",
  sectionHeading: "Section Heading",
  subheading: "Subheading",
  body: "Body",
  prompt: "Prompt",
  label: "Label",
  accent: "Accent",
  date: "Date",
  number: "Number",
  time: "Time",
  footer: "Footer",
};

/** Research A7: never below 6 pt for print. */
export const MIN_PRINT_FONT_PT = 6;

export function resolveTypography(
  fonts: FontSelection,
  overrides: Partial<Record<TypographyRole, Partial<TypographyRoleStyle>>> = {},
): TypographySettings {
  const roles = {} as Record<TypographyRole, TypographyRoleStyle>;
  (Object.keys(DEFAULT_ROLES) as TypographyRole[]).forEach((r) => {
    roles[r] = { ...DEFAULT_ROLES[r], ...(overrides[r] ?? {}) };
  });
  return { fonts, roles };
}

export function googleFontsHref(families: string[]): string {
  const unique = [...new Set(families)].map(findFont).filter((f) => !f.localUrl);
  const params = unique.map((f) => `family=${encodeURIComponent(f.family).replace(/%20/g, "+")}:${f.googleSpec}`).join("&");
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}

/** @font-face rules for self-hosted faces among `families`. */
export function localFontFaces(families: string[]): string {
  return [...new Set(families)]
    .map(findFont)
    .filter((f) => f.localUrl)
    .map((f) => `@font-face{font-family:"${f.family}";src:url("${f.localUrl}") format("opentype");font-display:swap;}`)
    .join("\n");
}

/**
 * DESIGN PRESETS — a complete look in one choice: palette, typography,
 * background and decorations. Applying one sets those four; each stays
 * individually editable afterwards (nothing is locked to the preset).
 */
import type { ProductProject } from "../types/project";
import type { FontSelection, TypographyRoleStyle } from "../types/tokens";
import { LUXE_SUBTITLE_STYLE, LUXE_TITLE_FONT, luxeTitleStyle, NEUTRAL_LUXE_ID } from "./coverLuxe";
import { DESIGN_TYPE_PAIRINGS } from "./typography/typography";

export type DesignPreset = {
  id: string;
  name: string;
  description: string;
  paletteId: string;
  fonts: Partial<FontSelection>;
  roles?: Partial<Record<"coverTitle" | "coverSubtitle", Partial<TypographyRoleStyle>>>;
  /** Plain descriptions shown on the card. */
  typography: string;
  background: string;
  decorations: string;
  /** The preset's background and decorations: none = plain paper / no artwork (covers keep their own artwork). */
  clearBackground: boolean;
  clearDecorations: boolean;
};

const pairing = (id: string) => DESIGN_TYPE_PAIRINGS.find((t) => t.id === id)!.fonts;

export const DESIGN_PRESETS: DesignPreset[] = [
  {
    id: "neutral-cheetah-luxe",
    name: "Neutral Cheetah Luxe",
    description: "Burgundy, blush and tan with a brush-script title; cheetah and gold-ring circles on covers and dividers.",
    paletteId: NEUTRAL_LUXE_ID,
    fonts: { ...pairing("classic"), cover: LUXE_TITLE_FONT },
    roles: { coverTitle: luxeTitleStyle(LUXE_TITLE_FONT), coverSubtitle: LUXE_SUBTITLE_STYLE },
    typography: "Script + serif",
    background: "Soft white paper",
    decorations: "Cheetah + circles (covers and dividers)",
    clearBackground: true,
    clearDecorations: true,
  },
  {
    id: "dove-signature",
    name: "Dove Signature",
    description: "The Dove Expressions burgundy, soft white and gold, with classic serif headings.",
    paletteId: "dove-signature",
    fonts: pairing("classic"),
    typography: "Classic serif",
    background: "Soft white paper",
    decorations: "None",
    clearBackground: true,
    clearDecorations: true,
  },
  {
    id: "dove-blush-script",
    name: "Dove Blush Script",
    description: "Burgundy and pale pink with a flowing script title and serif headings.",
    paletteId: "dove-blush",
    fonts: pairing("script-serif"),
    typography: "Script + serif",
    background: "Soft white paper",
    decorations: "None",
    clearBackground: true,
    clearDecorations: true,
  },
];

/** The project with a preset's look applied (pages, layout and content untouched). */
export function applyDesignPreset(p: ProductProject, d: DesignPreset): ProductProject {
  return {
    ...p,
    colors: { paletteId: d.paletteId, overrides: {} },
    typography: {
      ...p.typography,
      fonts: { ...p.typography.fonts, ...d.fonts },
      roleOverrides: {
        ...p.typography.roleOverrides,
        ...(d.roles?.coverTitle ? { coverTitle: { ...p.typography.roleOverrides.coverTitle, ...d.roles.coverTitle } } : {}),
        ...(d.roles?.coverSubtitle ? { coverSubtitle: { ...p.typography.roleOverrides.coverSubtitle, ...d.roles.coverSubtitle } } : {}),
      },
    },
    ...(d.clearBackground && p.backgroundTheme ? { backgroundTheme: { ...p.backgroundTheme, style: "none" as const } } : {}),
    ...(d.clearDecorations ? { decorativeTheme: { ...p.decorativeTheme, style: "none" as const } } : {}),
  };
}

/** Whether the project currently wears a preset's look. */
export const wearsPreset = (p: ProductProject, d: DesignPreset) =>
  p.colors.paletteId === d.paletteId && Object.entries(d.fonts).every(([g, f]) => p.typography.fonts[g as keyof FontSelection] === f);

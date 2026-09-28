/**
 * NEUTRAL CHEETAH LUXE — the type half of the cover & divider design (the
 * shapes live in layouts/book/coverDivider.ts, the colors in the palette of the
 * same name). Applied by "Use matching palette & script title".
 */
import type { TypographyRoleStyle, TypographySettings } from "../types/tokens";
import { NEUTRAL_LUXE_ID } from "./themes/palettes";
import { findFont } from "./typography/typography";

export { NEUTRAL_LUXE_ID };
/** Modern brush calligraphy, the closest open font to the reference cover's "Plan". */
export const LUXE_TITLE_FONT = "Birthstone Bounce";

/** The weight each offered script face is set in: bold for the bold faces, regular for the brush calligraphy (its stroke matches the reference). */
export const coverTitleWeight = (font: string) => (font === "The Nautigal" || font === "Dancing Script" ? 700 : 400);

/**
 * Cover title: one line as wide as the design allows — the size is only a
 * ceiling. The tight leading makes the title's box the height of its lettering,
 * so the subtitle can sit under the title's last letters, as in the reference.
 */
export const luxeTitleStyle = (font: string): Partial<TypographyRoleStyle> => ({ sizePt: 400, weight: coverTitleWeight(font), color: "text", transform: "none", trackingEm: 0, lineHeight: 0.7 });

/** Cover subtitle: small, very widely spaced capitals, stacked ("WITH / PURPOSE"). */
export const LUXE_SUBTITLE_STYLE: Partial<TypographyRoleStyle> = { sizePt: 15, color: "text", transform: "uppercase", trackingEm: 0.48, weight: 400 };

/** Whether a family reads as a script title (script or handwritten). */
export const isScriptFont = (family: string) => {
  const f = findFont(family);
  return f.family === family && (f.category === "script" || f.category === "handwritten");
};

/**
 * The type a Neutral Cheetah Luxe cover or divider is designed with: its script
 * title and spaced subtitle. The project's cover font is kept when it is
 * already a script; otherwise the design's own script is used for the title
 * alone (headings and the rest of the book keep their fonts). The project's
 * own cover-title and subtitle settings still apply on top.
 */
export function withLuxeCoverType(
  t: TypographySettings,
  overrides: Partial<Record<"coverTitle" | "coverSubtitle", Partial<TypographyRoleStyle>>> = {},
): TypographySettings {
  const font = isScriptFont(t.fonts.cover) ? t.fonts.cover : LUXE_TITLE_FONT;
  const family = font === t.fonts.cover ? undefined : font;
  return {
    ...t,
    roles: {
      ...t.roles,
      coverTitle: { ...t.roles.coverTitle, ...luxeTitleStyle(font), ...(overrides.coverTitle ?? {}), family, transform: "none" },
      coverSubtitle: { ...t.roles.coverSubtitle, ...LUXE_SUBTITLE_STYLE, ...(overrides.coverSubtitle ?? {}) },
    },
  };
}

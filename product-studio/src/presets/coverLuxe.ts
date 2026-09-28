/**
 * NEUTRAL CHEETAH LUXE — the type half of the cover & divider design (the
 * shapes live in layouts/book/coverDivider.ts, the colors in the palette of the
 * same name). Applied by "Use matching palette & script title".
 */
import type { TypographyRoleStyle } from "../types/tokens";
import { NEUTRAL_LUXE_ID } from "./themes/palettes";

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

/**
 * Text measurement. Fonts do NOT occupy equal space; layouts are checked
 * against measured text so collisions and clipping are reported instead of
 * silently shrinking type.
 *
 * - canvasMeasurer: real glyph metrics of the loaded web font (browser).
 * - heuristicMeasurer: per-font average advance width (tests / no canvas).
 */
import { findFont, fontStack } from "../../presets/typography/typography";
import type { TypographyRoleStyle, TypographySettings } from "../../types/tokens";
import { CSS_PX_PER_IN, PT_PER_IN } from "../units/units";

export type TextStyle = Pick<TypographyRoleStyle, "sizePt" | "weight" | "style" | "trackingEm" | "transform"> & { family: string };

/** Returns the rendered advance width in inches. */
export type TextMeasurer = (text: string, style: TextStyle) => number;

export function styleForRole(typography: TypographySettings, role: keyof TypographySettings["roles"]): TextStyle {
  const r = typography.roles[role];
  return { family: typography.fonts[r.group], sizePt: r.sizePt, weight: r.weight, style: r.style, trackingEm: r.trackingEm, transform: r.transform };
}

export function applyTransform(text: string, transform: TextStyle["transform"]): string {
  switch (transform) {
    case "uppercase":
    case "small-caps":
      return text.toUpperCase();
    case "lowercase":
      return text.toLowerCase();
    case "capitalize":
      return text.replace(/\b\w/g, (c) => c.toUpperCase());
    default:
      return text;
  }
}

/** Uppercase glyphs are wider than the lowercase average. */
const UPPERCASE_FACTOR = 1.25;
/** Small caps render capitals at roughly x-height scale. */
const SMALL_CAPS_FACTOR = 0.82;
const BOLD_FACTOR = 1.06;

export const heuristicMeasurer: TextMeasurer = (raw, style) => {
  const t = applyTransform(raw, style.transform);
  const em = style.sizePt / PT_PER_IN;
  const avg = findFont(style.family).avgCharEm;
  let width = 0;
  for (const ch of t) {
    const isUpper = ch !== ch.toLowerCase();
    const isSpace = ch === " ";
    width += em * (isSpace ? avg * 0.55 : avg * (isUpper ? UPPERCASE_FACTOR : 1));
  }
  if (style.transform === "small-caps") width *= SMALL_CAPS_FACTOR;
  if (style.weight >= 600) width *= BOLD_FACTOR;
  width += Math.max(0, t.length - 1) * style.trackingEm * em;
  return width;
};

export function createCanvasMeasurer(): TextMeasurer | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  const c2d = canvas.getContext("2d");
  if (!c2d) return null;
  const cache = new Map<string, number>();
  return (raw, style) => {
    const t = applyTransform(raw, style.transform);
    const key = `${style.family}|${style.sizePt}|${style.weight}|${style.style}|${style.trackingEm}|${style.transform}|${t}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const px = (style.sizePt / PT_PER_IN) * CSS_PX_PER_IN;
    c2d.font = `${style.style} ${style.weight} ${px}px ${fontStack(style.family)}`;
    let widthPx = c2d.measureText(t).width;
    if (style.transform === "small-caps") widthPx *= SMALL_CAPS_FACTOR;
    widthPx += Math.max(0, t.length - 1) * style.trackingEm * px;
    const w = widthPx / CSS_PX_PER_IN;
    cache.set(key, w);
    return w;
  };
}

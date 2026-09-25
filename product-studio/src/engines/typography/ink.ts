/**
 * Ink box: where a single text node's glyphs actually sit (measured advance
 * width × line box), as opposed to the node's layout rect. Used by
 * composition (protected content), validation and semantic text placement.
 */
import type { Rect } from "../../types/geometry";
import type { TextNode } from "../../types/layout";
import type { TypographySettings } from "../../types/tokens";
import { ptToIn } from "../units/units";
import { styleForRole, type TextMeasurer } from "./textMeasure";

const EPS = 1e-9;

export function inkBoxFor(node: TextNode, typography: TypographySettings, measure: TextMeasurer): Rect {
  const role = typography.roles[node.role];
  const lineH = ptToIn(role.sizePt * role.lineHeight);
  const advance = measure(node.text, styleForRole(typography, node.role));
  const width = Math.min(advance, node.wrap ? node.rect.w : Infinity);
  const align = node.align ?? role.align;
  const x = align === "left" ? node.rect.x : align === "right" ? node.rect.x + node.rect.w - width : node.rect.x + (node.rect.w - width) / 2;
  const lines = node.wrap ? Math.max(1, Math.ceil(advance / Math.max(node.rect.w, EPS))) : 1;
  const h = lineH * lines;
  const y = node.vAlign === "top" ? node.rect.y : node.vAlign === "bottom" ? node.rect.y + node.rect.h - h : node.rect.y + (node.rect.h - h) / 2;
  return { x, y, w: width, h };
}

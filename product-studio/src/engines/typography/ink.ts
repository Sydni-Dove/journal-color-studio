/**
 * Ink box: where a single text node's glyphs actually sit (measured advance
 * width × line box), as opposed to the node's layout rect. Used by
 * composition (protected content), validation and semantic text placement.
 */
import type { Rect } from "../../types/geometry";
import type { TextNode } from "../../types/layout";
import type { TypographySettings } from "../../types/tokens";
import { ptToIn } from "../units/units";
import { styleForNode, styleForRole, type TextMeasurer } from "./textMeasure";

const EPS = 1e-9;

export function inkBoxFor(node: TextNode, typography: TypographySettings, measure: TextMeasurer): Rect {
  const role = typography.roles[node.role];
  if (node.fit) {
    // Fitted heading: explicit lines at the fitted size and leading.
    const st = styleForNode(typography, node);
    const w = Math.max(...node.fit.lines.map((l) => measure(l, st)));
    const hh = ptToIn(node.fit.sizePt * node.fit.lineHeight) * node.fit.lines.length;
    const al = node.align ?? role.align;
    const fx = al === "left" ? node.rect.x : al === "right" ? node.rect.x + node.rect.w - w : node.rect.x + (node.rect.w - w) / 2;
    const fy = node.vAlign === "top" ? node.rect.y : node.vAlign === "bottom" ? node.rect.y + node.rect.h - hh : node.rect.y + (node.rect.h - hh) / 2;
    return { x: fx, y: fy, w, h: hh };
  }
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

/**
 * CARD SHEET — cards to print and cut apart (types/recipe.ts CardSheetContent).
 *
 *   4, 6 or 8 cards to a page in two columns, filling the page's safe area edge to edge, so one cut
 *   between two cards separates both.
 *   Fronts: the card's title, an optional subtitle, a framed picture space (to draw in or attach art
 *   to), and an optional short line at the foot.
 *   Backs: the card's title, then each labelled part (Meaning, Scripture, Example, Ask, Try it…).
 *   Double-sided: each page of fronts is followed by its page of backs, each back placed where it
 *   prints behind its own front: columns swap when the paper turns on its long edge (the usual duplex
 *   setting for an upright page), rows swap when it turns on its short edge.
 *   Cutting guides: a dashed line around every card, and short solid trim marks in the margin where
 *   each cut meets the page edge, so the cuts can be lined up even after the dashes are cut away.
 *
 * Text that doesn't fit a card is never drawn past it: the back's type steps down to a smaller size,
 * and a part that still doesn't fit is left out and reported, so the maker can shorten it.
 */
import { getLayoutMeasurer, styleForRole } from "../../engines/typography/textMeasure";
import { ptToIn } from "../../engines/units/units";
import { STUDIO_STROKES } from "../../presets/studioDefaults";
import type { Rect } from "../../types/geometry";
import type { LayoutDiagnostic, LayoutNode, RuleNode, TextNode } from "../../types/layout";
import type { CardContent, CardSheetContent } from "../../types/recipe";
import type { TypographyRole } from "../../types/tokens";
import { fitHeading } from "../shared/components";
import { box, group, rule, text } from "../shared/nodes";
import { minimumAreaFit, type LayoutContext, type LayoutDefinition } from "../shared/types";

/** Inside padding of a card (inches). */
export const CARD_PAD_IN = 0.22;
/** Dashed cutting guide: dash and gap (inches), and the trim marks' length and their gap from the cards. */
export const CUT_DASH_IN: [number, number] = [0.08, 0.06];
const TRIM_MARK_IN = 0.22;
const TRIM_GAP_IN = 0.06;
/** The smallest the back's text may step down to before a part is left out (points). */
export const CARD_MIN_TEXT_PT = 8;

export const cardsPerSheet = (c: CardSheetContent | undefined) => c?.perSheet ?? 4;
const sidesOf = (c: CardSheetContent | undefined) => (c?.doubleSided === false ? 1 : 2);

/** Pages a card sheet prints: a page of fronts (and one of backs) for every `perSheet` cards; at least one. */
export function cardSheetPages(c: CardSheetContent | undefined): number {
  const n = c?.cards.length ?? 0;
  return Math.max(1, Math.ceil(n / cardsPerSheet(c))) * sidesOf(c);
}

/** Which card a slot shows: the slot's own card on a front; on a back, the card whose front it prints behind. */
export function cardAt(c: CardSheetContent, pageIndex: number, row: number, col: number): number {
  const per = cardsPerSheet(c), cols = 2, rows = per / cols, sides = sidesOf(c);
  const sheet = Math.floor(pageIndex / sides);
  const back = sides === 2 && pageIndex % sides === 1;
  const r = back && c.flip === "short-edge" ? rows - 1 - row : row;
  const k = back && c.flip !== "short-edge" ? cols - 1 - col : col;
  return sheet * per + r * cols + k;
}

/** Card text, wrapped to a width at a size, keeping the maker's line breaks. */
function wrapAt(value: string, width: number, role: TypographyRole, sizePt: number, ctx: LayoutContext): string[] {
  const m = getLayoutMeasurer().measure, st = { ...styleForRole(ctx.typography, role), sizePt };
  const out: string[] = [];
  for (const para of value.split("\n")) {
    let cur = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = cur ? `${cur} ${word}` : word;
      if (cur && m(next, st) > width) { out.push(cur); cur = word; } else cur = next;
    }
    out.push(cur);
  }
  return out;
}

const lineIn = (ctx: LayoutContext, role: TypographyRole, sizePt: number) => ptToIn(sizePt * ctx.typography.roles[role].lineHeight);

/** A block of wrapped text at a set size (the renderer, measuring and checks all read its fit). */
function textBlock(id: string, rect: Rect, lines: string[], role: TypographyRole, sizePt: number, ctx: LayoutContext, align?: "left" | "center"): TextNode {
  const t = text(id, rect, lines.join(" "), role, { component: "Text", vAlign: "top", wrap: true, ...(align ? { align } : {}) });
  t.fit = { sizePt, lineHeight: ctx.typography.roles[role].lineHeight, lines };
  return t;
}

function drawFront(id: string, cell: Rect, card: CardContent, c: CardSheetContent, ctx: LayoutContext): LayoutNode[] {
  const pad = CARD_PAD_IN;
  const inner = { x: cell.x + pad, y: cell.y + pad, w: cell.w - 2 * pad, h: cell.h - 2 * pad };
  const nodes: LayoutNode[] = [];
  const gap = ctx.spacing.block;
  // The foot line first (it sets how much room the picture keeps).
  const footSize = ctx.typography.roles.prompt.sizePt;
  const foot = card.front?.trim() ? wrapAt(card.front.trim(), inner.w, "prompt", footSize, ctx).slice(0, 3) : [];
  const footH = foot.length * lineIn(ctx, "prompt", footSize);
  // Title: the largest that fits the card's width on up to two lines.
  const titleArea = { w: inner.w, h: Math.min(inner.h * 0.3, 1.1) };
  const f = fitHeading(card.title || " ", "pageTitle", titleArea, ctx);
  const titleH = Math.min(titleArea.h, f.heightIn);
  const t = text(`${id}-title`, { x: inner.x, y: inner.y, w: inner.w, h: titleH }, card.title, "pageTitle", { component: "Text", align: "center", vAlign: "top", wrap: true });
  t.fit = { sizePt: f.sizePt, lineHeight: f.lineHeight, lines: f.lines, ...(f.trackingEm !== undefined ? { trackingEm: f.trackingEm } : {}) };
  nodes.push(t);
  let y = inner.y + titleH;
  if (card.subtitle?.trim()) {
    const sh = lineIn(ctx, "label", ctx.typography.roles.label.sizePt);
    nodes.push(text(`${id}-subtitle`, { x: inner.x, y: y + gap / 2, w: inner.w, h: sh }, card.subtitle.trim(), "label", { component: "Text", align: "center", vAlign: "top" }));
    y += sh + gap / 2;
  }
  const footY = inner.y + inner.h - footH;
  if (c.frontArt !== "none") {
    // The picture space: everything between the title and the foot line.
    const art = { x: inner.x, y: y + gap, w: inner.w, h: Math.max(0, footY - gap - (y + gap)) };
    if (art.h > 0.3) {
      nodes.push(box(`${id}-art`, art, { component: "Section", strokePt: STUDIO_STROKES.boxRulePt, radiusIn: 0.08 }));
      // The label keeps the studio's distance from the box's border.
      const ins = Math.max(0.1, ctx.spacing.labelToBorderInset);
      if (c.artLabel?.trim()) nodes.push(text(`${id}-art-label`, { x: art.x + ins, y: art.y + ins, w: art.w - 2 * ins, h: lineIn(ctx, "label", ctx.typography.roles.label.sizePt) }, c.artLabel.trim(), "label", { component: "Text", vAlign: "top" }));
    }
  }
  if (foot.length) nodes.push(textBlock(`${id}-foot`, { x: inner.x, y: footY, w: inner.w, h: footH }, foot, "prompt", footSize, ctx, "center"));
  return nodes;
}

/** The back's parts at one size: each label line then its wrapped text, and the total height. */
function backAt(card: CardContent, width: number, sizePt: number, ctx: LayoutContext) {
  const labelH = lineIn(ctx, "label", ctx.typography.roles.label.sizePt);
  const bodyLine = lineIn(ctx, "body", sizePt);
  const gap = ctx.spacing.block * 0.75;
  const parts = card.back.filter((p) => p.label.trim() || p.text.trim()).map((p) => {
    const lines = p.text.trim() ? wrapAt(p.text.trim(), width, "body", sizePt, ctx) : [];
    return { label: p.label.trim(), lines, h: (p.label.trim() ? labelH : 0) + lines.length * bodyLine };
  });
  return { parts, labelH, bodyLine, gap, total: parts.reduce((n, p) => n + p.h, 0) + gap * Math.max(0, parts.length - 1) };
}

function drawBack(id: string, cell: Rect, card: CardContent, cardNo: number, ctx: LayoutContext, diagnostics: LayoutDiagnostic[]): LayoutNode[] {
  const pad = CARD_PAD_IN;
  const inner = { x: cell.x + pad, y: cell.y + pad, w: cell.w - 2 * pad, h: cell.h - 2 * pad };
  const nodes: LayoutNode[] = [];
  // The card's name at the top, a rule under it.
  const f = fitHeading(card.title || " ", "sectionHeading", { w: inner.w, h: 0.6 }, ctx);
  const t = text(`${id}-title`, { x: inner.x, y: inner.y, w: inner.w, h: f.heightIn }, card.title, "sectionHeading", { component: "Text", vAlign: "top", wrap: true });
  t.fit = { sizePt: f.sizePt, lineHeight: f.lineHeight, lines: f.lines, ...(f.trackingEm !== undefined ? { trackingEm: f.trackingEm } : {}) };
  nodes.push(t);
  const ruleY = inner.y + f.heightIn + Math.max(0.1, ctx.spacing.labelToBorderInset, ctx.spacing.block / 2);
  nodes.push(rule(`${id}-title-rule`, inner.x, ruleY, inner.x + inner.w, ruleY, { strokePt: STUDIO_STROKES.boxRulePt }));
  const top = ruleY + Math.max(0.1, ctx.spacing.labelToBorderInset, ctx.spacing.block);
  const room = inner.y + inner.h - top;
  // The body size: the product's, stepped down to fit (never below CARD_MIN_TEXT_PT).
  let size = ctx.typography.roles.body.sizePt;
  let lay = backAt(card, inner.w, size, ctx);
  while (lay.total > room && size > CARD_MIN_TEXT_PT) {
    size = Math.max(CARD_MIN_TEXT_PT, size - 0.5);
    lay = backAt(card, inner.w, size, ctx);
  }
  let y = top;
  lay.parts.forEach((p, i) => {
    if (y + p.h > inner.y + inner.h + 1e-6) {
      diagnostics.push({ severity: "warning", rule: "card-back-fit", componentId: id, message: `Card ${cardNo} (“${card.title}”): “${p.label || p.lines[0]}” doesn't fit on the back and is left out. Shorten the back or use fewer cards per page.` });
      y = Infinity;
      return;
    }
    if (p.label) {
      nodes.push(text(`${id}-b${i}-label`, { x: inner.x, y, w: inner.w, h: lay.labelH }, p.label, "label", { component: "SectionHeader", vAlign: "top" }));
      y += lay.labelH;
    }
    if (p.lines.length) {
      nodes.push(textBlock(`${id}-b${i}`, { x: inner.x, y, w: inner.w, h: p.lines.length * lay.bodyLine }, p.lines, "body", size, ctx));
      y += p.lines.length * lay.bodyLine;
    }
    y += lay.gap;
  });
  return nodes;
}

/** Dashed guides around a card, and the page's trim marks where the cuts meet its edges. */
function cuttingGuides(id: string, area: Rect, cells: Rect[], cols: number[], rows: number[], pageW: number, pageH: number): LayoutNode[] {
  const out: LayoutNode[] = [];
  const guide = (gid: string, x1: number, y1: number, x2: number, y2: number, dashed: boolean): RuleNode => ({
    ...rule(gid, x1, y1, x2, y2, { strokePt: STUDIO_STROKES.boxRulePt, component: "Divider" }),
    // Guides are for the scissors, not content: they run along the card edges and into the margins.
    functional: false,
    ...(dashed ? { dashIn: CUT_DASH_IN } : {}),
  });
  cells.forEach((c, k) => {
    out.push(guide(`${id}-c${k}-top`, c.x, c.y, c.x + c.w, c.y, true), guide(`${id}-c${k}-bottom`, c.x, c.y + c.h, c.x + c.w, c.y + c.h, true));
    out.push(guide(`${id}-c${k}-left`, c.x, c.y, c.x, c.y + c.h, true), guide(`${id}-c${k}-right`, c.x + c.w, c.y, c.x + c.w, c.y + c.h, true));
  });
  // Trim marks: short solid lines in the margins, in line with every cut.
  const top = area.y - TRIM_GAP_IN, bottom = area.y + area.h + TRIM_GAP_IN, left = area.x - TRIM_GAP_IN, right = area.x + area.w + TRIM_GAP_IN;
  cols.forEach((x, i) => {
    out.push(guide(`${id}-mark-x${i}-top`, x, Math.max(0, top - TRIM_MARK_IN), x, top, false));
    out.push(guide(`${id}-mark-x${i}-bottom`, x, bottom, x, Math.min(pageH, bottom + TRIM_MARK_IN), false));
  });
  rows.forEach((y, i) => {
    out.push(guide(`${id}-mark-y${i}-left`, Math.max(0, left - TRIM_MARK_IN), y, left, y, false));
    out.push(guide(`${id}-mark-y${i}-right`, right, y, Math.min(pageW, right + TRIM_MARK_IN), y, false));
  });
  return out;
}

export function solveCardSheet(ctx: LayoutContext) {
  const c: CardSheetContent = ctx.module?.cards ?? { cards: [] };
  const per = cardsPerSheet(c), cols = 2, rows = per / cols, sides = sidesOf(c);
  return ctx.pages.map((g, pageIndex) => {
    const diagnostics: LayoutDiagnostic[] = [];
    const area = g.safeRect;
    const w = area.w / cols, h = area.h / rows;
    const back = sides === 2 && pageIndex % sides === 1;
    const nodes: LayoutNode[] = [group(`cs${pageIndex}`, "Section", area)];
    const cells: Rect[] = [];
    for (let r = 0; r < rows; r++)
      for (let k = 0; k < cols; k++) {
        const n = cardAt(c, pageIndex, r, k);
        const card = c.cards[n];
        if (!card) continue;
        const cell = { x: area.x + k * w, y: area.y + r * h, w, h };
        cells.push(cell);
        const id = `cs${pageIndex}-card${n + 1}`;
        nodes.push(group(id, "Section", cell));
        nodes.push(...(back ? drawBack(id, cell, card, n + 1, ctx, diagnostics) : drawFront(id, cell, card, c, ctx)));
      }
    if (!c.cards.length && pageIndex === 0)
      diagnostics.push({ severity: "info", rule: "card-sheet-empty", componentId: "cs0", message: "This card sheet has no cards yet. Add cards under Pages → this page." });
    // The cuts: every column and row line that borders a card on this page.
    const xs = [...new Set(cells.flatMap((q) => [q.x, q.x + q.w]).map((v) => +v.toFixed(4)))];
    const ys = [...new Set(cells.flatMap((q) => [q.y, q.y + q.h]).map((v) => +v.toFixed(4)))];
    if (cells.length) nodes.push(...cuttingGuides(`cs${pageIndex}`, area, cells, xs, ys, g.trimWidthIn, g.trimHeightIn));
    return { nodes, diagnostics, metrics: [] };
  });
}

export const cardSheet: LayoutDefinition = {
  id: "card-sheet",
  label: "Card sheet (cards to cut apart)",
  family: "shared",
  description: "4, 6 or 8 cards to a page with cutting guides; each page of fronts followed by its page of backs for double-sided printing.",
  pages: 1,
  period: "none",
  capability: {
    supportedProductTypes: ["journal", "notebook", "planner", "insert", "worksheet", "devotional", "tracker", "custom"],
    supportsPatterns: [],
    supportsLineStyle: false,
    supportsSidebar: false,
    supportsDatePlacement: false,
    supportsSectionsPerDay: false,
    supportsWritingRows: false,
    supportsPageNumbers: false,
    supportsFooter: false,
    requiresCalendar: false,
    usesWeekStart: false,
    wordingKeys: [],
    repeats: ["once"],
    defaultRepeat: "once",
  },
  fit: minimumAreaFit(3, 3, "Card sheet"),
  solve: (ctx) => solveCardSheet(ctx),
  flowPages: (f) => cardSheetPages(f.module?.cards),
};

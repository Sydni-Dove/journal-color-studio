import type { CircleNode, LayoutNode, SolvedPage, TextFit } from "../../types/layout";
import type { PageGeometry, Rect } from "../../types/geometry";
import type { CoverDividerSettings } from "../../types/recipe";
import type { ColorToken } from "../../types/tokens";
import { getLayoutMeasurer, styleForRole } from "../../engines/typography/textMeasure";
import { text, box, rule } from "../shared/nodes";
import { fitHeading, HEADING_MIN_PT } from "../shared/components";
import { guidedPage } from "./guidedPage";
import { minimumAreaFit, type LayoutContext, type LayoutDefinition } from "../shared/types";

/**
 * The edge a tab prints on: the outer (fore) edge, away from the binding — the
 * left edge of a page bound on its right (a left-hand page), otherwise the right.
 */
export const tabEdge = (g: PageGeometry): "left" | "right" => (g.boundEdge === "right" ? "left" : "right");

/** Interior printed tabs: fixed physical width, on the outer edge, all edges inside the resolved live area. */
export function tabGeometry(g: PageGeometry, tab: NonNullable<CoverDividerSettings["tab"]>): Rect | null {
  const count = tab.count ?? 9, order = tab.order ?? 1;
  if (!Number.isInteger(count) || count < 1 || count > 24 || !Number.isInteger(order) || order < 1 || order > count) return null;
  const s = g.safeRect, slot = s.h / count;
  const h = tab.style === "rounded" ? Math.min(0.6, slot - 0.04) : slot - 0.04;
  if (h < 0.24 || s.w < 1.5) return null;
  const w = tab.style === "staggered" ? 0.52 : 0.9;
  return { x: tabEdge(g) === "left" ? s.x : s.x + s.w - w, y: s.y + (order - 1) * slot + (slot - h) / 2, w, h };
}

/**
 * NEUTRAL CHEETAH LUXE — measured from the reference cover (Letter, "Plan / WITH
 * PURPOSE"). Every shape is a fraction of the trim: x of its width, y of its
 * height, r of the page's Letter-proportioned size, so each trim gets the same
 * composition. Circles run off the trim edge (decoration, never content).
 * Drawn in order: color circles, cheetah circles, then the thin rings over them.
 */
type LuxeCircle = { id: string; x: number; y: number; r: number; fill?: ColorToken };
export const LUXE_CIRCLES: LuxeCircle[] = [
  { id: "luxe-burgundy", x: 0.269, y: 0.108, r: 0.248, fill: "primary" },
  { id: "luxe-blush", x: 0.655, y: 0.37, r: 0.184, fill: "decorHighlight" },
  { id: "luxe-terracotta", x: 1.013, y: 0.536, r: 0.17, fill: "accent" },
  { id: "luxe-tan", x: 0.109, y: 0.722, r: 0.132, fill: "secondary" },
  { id: "luxe-slate", x: 0.24, y: 0.989, r: 0.222, fill: "decorativeAccent" },
];
export const LUXE_CHEETAH: LuxeCircle[] = [
  { id: "luxe-cheetah-top", x: 0.88, y: 0.232, r: 0.132 },
  { id: "luxe-cheetah-bottom", x: 0.858, y: 0.895, r: 0.116 },
];
export const LUXE_RINGS: LuxeCircle[] = [
  { id: "luxe-ring-top", x: 0.384, y: 0.046, r: 0.349 },
  { id: "luxe-ring-left", x: 0.188, y: 0.942, r: 0.308 },
  { id: "luxe-ring-right", x: 1.13, y: 0.942, r: 0.35 },
  { id: "luxe-ring-low", x: 0.779, y: 1.057, r: 0.236 },
];
/**
 * Title, subtitle and gold rule anchors (fractions of the trim). Cover and
 * divider have their own zones:
 *   COVER    the title is the page's focal point — as wide as the design
 *            allows, its lettering between the burgundy circle and the lower
 *            shapes, the subtitle stacked under its last letters (reference:
 *            "Plan / WITH PURPOSE")
 *   DIVIDER  a section label — a smaller, centred title a little above the
 *            middle, the subtitle on one centred line, a short centred rule
 * titleBase: where the title's box ends — its baseline with the design's tight
 * leading (the lettering's loops and descenders draw past the box, as the
 * reference's P does beside the subtitle). titleH caps the title's height.
 */
type TextZone = { titleX: number; titleBase: number; titleW: number; titleH: number; subX: number; subY: number; subW: number; subLineGap: number; stack: boolean; ruleGap: number; ruleW: number; ruleX: number };
export const COVER_TEXT: TextZone = { titleX: 0.52, titleBase: 0.68, titleW: 0.9, titleH: 0.45, subX: 0.593, subY: 0.706, subW: 0.26, subLineGap: 0.043, stack: true, ruleGap: 0.036, ruleW: 0.173, ruleX: 0.593 };
/**
 * The cover title hangs from the burgundy circle, not from a fixed share of the
 * page height: its box starts this far below the circle, and the subtitle sits
 * this far below the title's baseline — both in the design's scale (R), so a
 * taller trim keeps the title with its anchor shape instead of drifting down
 * (measured from the Letter reference: the box top 1.24" under the circle, the
 * subtitle's first line centred 0.29" under the baseline).
 */
export const COVER_TITLE_GAP_R = 0.146, COVER_SUB_BELOW_R = 0.0336;
export const DIVIDER_TEXT: TextZone = { titleX: 0.5, titleBase: 0.56, titleW: 0.74, titleH: 0.24, subX: 0.5, subY: 0.6, subW: 0.6, subLineGap: 0.04, stack: false, ruleGap: 0.036, ruleW: 0.12, ruleX: 0.5 };
const RING_PT = 1.9, RULE_PT = 1.8;

/** One line of the title, as large as the width allows (the role's size is the ceiling). */
function fillTitle(value: string, rect: Rect, ctx: LayoutContext): TextFit & { ok: boolean } {
  const r = ctx.typography.roles.coverTitle;
  const perPt = getLayoutMeasurer().measure(value, { ...styleForRole(ctx.typography, "coverTitle"), sizePt: 100 }) / 100;
  // 98.5 % of the width: glyph widths scale almost, not exactly, linearly with size.
  const sizePt = Math.max(HEADING_MIN_PT, Math.min(r.sizePt, perPt > 0 ? (rect.w * 0.985) / perPt : r.sizePt, (rect.h * 72) / r.lineHeight));
  return { sizePt, lineHeight: r.lineHeight, lines: [value], ok: perPt * sizePt <= rect.w + 1e-6 };
}

/** The subtitle stacked on two lines, as in the reference ("WITH / PURPOSE"); one line for a single word. */
function stackSubtitle(value: string, w: number, lineGapIn: number, ctx: LayoutContext, stack = true): TextFit & { ok: boolean } {
  const r = ctx.typography.roles.coverSubtitle, base = styleForRole(ctx.typography, "coverSubtitle");
  const words = value.trim().split(/\s+/).filter(Boolean);
  const measure = (t: string, pt: number) => getLayoutMeasurer().measure(t, { ...base, sizePt: pt });
  let lines = [value];
  if (stack && words.length > 1) {
    let best = Infinity;
    for (let k = 1; k < words.length; k++) {
      const pair = [words.slice(0, k).join(" "), words.slice(k).join(" ")];
      const widest = Math.max(...pair.map((l) => measure(l, 10)));
      if (widest < best) (best = widest), (lines = pair);
    }
  }
  const widestAt10 = Math.max(...lines.map((l) => measure(l, 10)));
  const sizePt = Math.max(HEADING_MIN_PT, Math.min(r.sizePt, widestAt10 > 0 ? (w / widestAt10) * 10 : r.sizePt));
  return { sizePt, lineHeight: Math.max(1.3, (lineGapIn * 72) / sizePt), lines, ok: (widestAt10 * sizePt) / 10 <= w + 1e-6 };
}

/** How far a script tail (g j p q y) reaches below the baseline, in ems. */
const DESCENDER_EM = 0.3;
/** Whether a lowercase letter with a tail sits above the subtitle's column. */
function descenderOver(title: string, rect: Rect, sizePt: number, left: boolean, col: { x: number; w: number }, ctx: LayoutContext): boolean {
  const measure = getLayoutMeasurer().measure, style = { ...styleForRole(ctx.typography, "coverTitle"), sizePt };
  const total = measure(title, style), x0 = left ? rect.x : rect.x + (rect.w - total) / 2;
  return [...title].some((ch, i) => {
    if (!/[gjpqy]/.test(ch)) return false;
    const a = x0 + measure(title.slice(0, i), style), b = x0 + measure(title.slice(0, i + 1), style);
    return b > col.x && a < col.x + col.w;
  });
}

function solve(ctx: LayoutContext, divider: boolean): SolvedPage[] {
  const g = ctx.pages[0], s = g.safeRect, opt = ctx.module?.cover ?? {};
  const nodes: LayoutNode[] = [], diagnostics: SolvedPage["diagnostics"] = [];
  const title = ctx.module?.title ?? (divider ? "Prayer" : "Plan");
  const tab = opt.tab?.show ? tabGeometry(g, opt.tab) : null;
  if (opt.tab?.show && !tab) diagnostics.push({ severity: "error", rule: "tab-fit", componentId: "tab", message: "These tabs do not fit comfortably. Use fewer tabs or a larger page." });
  const tabRoom = tab ? tab.w + 0.16 : 0;
  const content = { ...s, x: tab && tabEdge(g) === "left" ? s.x + tabRoom : s.x, w: s.w - tabRoom };
  const W = g.trimWidthIn, H = g.trimHeightIn;
  // Circles keep the reference's proportions on any trim: sized from the page's Letter-proportioned width.
  const R = Math.min(W, (H * 8.5) / 11);
  const circle = (c: LuxeCircle, extra: Partial<CircleNode>) =>
    nodes.push({ id: c.id, type: "circle", component: "Section", rect: { x: c.x * W - c.r * R, y: c.y * H - c.r * R, w: 2 * c.r * R, h: 2 * c.r * R }, functional: false, fill: c.fill ?? null, ...extra });
  if (opt.preset !== "plain") {
    if (opt.circles !== false) LUXE_CIRCLES.forEach((c) => circle(c, {}));
    if (opt.leopard !== false) LUXE_CHEETAH.forEach((c) => circle(c, { leopard: true }));
    if (opt.outlines !== false) LUXE_RINGS.forEach((c) => circle(c, { outline: true, stroke: "lineArt", strokePt: RING_PT }));
  }
  // Text anchors: the reference's, kept inside the live area (and clear of a tab).
  const shift = opt.position === "upper" ? -0.09 : opt.position === "lower" ? 0.07 : 0;
  const left = opt.alignment === "left";
  const clampX = (cx: number, w: number) => {
    const ww = Math.min(w, content.w);
    const x = left ? content.x : Math.max(content.x, Math.min(cx - ww / 2, content.x + content.w - ww));
    return { x, w: ww };
  };
  const clampY = (y: number, h: number) => Math.max(content.y, Math.min(y, content.y + content.h - h));
  const push = (id: string, value: string, rect: Rect, role: "coverTitle" | "coverSubtitle" | "body", fitted: TextFit & { ok: boolean }) => {
    const node = text(id, rect, value, role, { align: left ? "left" : "center", wrap: true });
    node.fit = { ...fitted, failed: !fitted.ok };
    if (!fitted.ok) diagnostics.push({ severity: "error", rule: "heading-fit", componentId: id, message: "This wording is too long. Shorten it or choose a larger page." });
    nodes.push(node);
  };
  const Z = divider ? DIVIDER_TEXT : COVER_TEXT;
  // Title: one line of script, as wide as the zone allows (the cover's the widest, a divider's smaller).
  const tx = clampX(Z.titleX * W, Z.titleW * W);
  const titleFit = fillTitle(title, { ...tx, y: 0, h: Math.min(content.h, H * Z.titleH) }, ctx);
  const titleH = (titleFit.sizePt * titleFit.lineHeight) / 72;
  const burgundy = LUXE_CIRCLES[0];
  const titleTop = divider ? (Z.titleBase + shift) * H - titleH : burgundy.y * H + burgundy.r * R + COVER_TITLE_GAP_R * R + shift * H;
  const titleRect = { ...tx, y: clampY(titleTop, titleH), h: titleH };
  push("cover-title", title, titleRect, "coverTitle", titleFit);
  // Subtitle: stacked, widely spaced, right of centre under the title.
  const subtitle = opt.subtitle ?? (divider ? "" : "WITH PURPOSE");
  let below = titleRect.y + titleRect.h;
  if (subtitle.trim()) {
    const sx = clampX(Z.subX * W, Z.subW * W);
    const subFit = stackSubtitle(subtitle, sx.w, Z.subLineGap * H, ctx, Z.stack);
    const subH = (subFit.sizePt * subFit.lineHeight * subFit.lines.length) / 72;
    // The subtitle tucks under the title's last letters ("an" in the reference). A letter with a tail
    // (g j p q y) above it would run into it, so the subtitle drops below the tail instead.
    const tail = descenderOver(title, titleRect, titleFit.sizePt, left, sx, ctx) ? DESCENDER_EM * (titleFit.sizePt / 72) : 0;
    const firstLine = divider ? (Z.subY + shift) * H : titleRect.y + titleRect.h + COVER_SUB_BELOW_R * R;
    // Never above the title's box: on a small trim the design-scale gap is less than half a subtitle line.
    const top = Math.max(firstLine - (subFit.sizePt * subFit.lineHeight) / 72 / 2, titleRect.y + titleRect.h) + tail;
    const subRect = { ...sx, y: clampY(top, subH), h: subH };
    push("cover-subtitle", subtitle, subRect, "coverSubtitle", subFit);
    below = subRect.y + subRect.h;
  }
  if (opt.smallLine !== false) {
    const rx = clampX(Z.ruleX * W, Z.ruleW * W), ry = Math.min(below + Z.ruleGap * H * 0.5, content.y + content.h);
    nodes.push(rule("cover-line", rx.x, ry, rx.x + rx.w, ry, { color: "lineArt", strokePt: RULE_PT }));
    below = ry;
  }
  if (opt.quote) {
    const qx = clampX(Z.subX * W, 0.6 * W), qy = below + 0.2;
    const qRect = { ...qx, y: qy, h: Math.max(0.2, content.y + content.h - qy) };
    push("cover-quote", opt.quote, qRect, "body", { ...fitHeading(opt.quote, "body", qRect, ctx) });
  }
  if (tab && opt.tab) {
    // A thin paper-colored edge keeps the tab distinct where it crosses the artwork.
    nodes.push(box("tab", tab, { stroke: "background", strokePt: 1.5, fill: opt.tab.color ?? "secondary", radiusIn: opt.tab.style === "rounded" ? 0.12 : 0 }));
    if (opt.tab.leopard) nodes.push({ id: "tab-leopard", type: "circle", component: "Section", rect: tab, functional: false, fill: "secondary", leopard: true });
    const dark = opt.tab.leopard || (["primary", "text", "accent", "decorativeAccent"] as (ColorToken | undefined)[]).includes(opt.tab.color);
    const label = text("tab-label", { x: tab.x + 0.04, y: tab.y + 0.03, w: tab.w - 0.08, h: tab.h - 0.06 }, opt.tab.label ?? title, "label", { wrap: true, align: "center", color: dark ? "background" : "text" });
    const fitted = fitHeading(label.text, "label", label.rect, ctx);
    label.fit = { ...fitted, failed: !fitted.ok }; nodes.push(label);
    if (!fitted.ok) diagnostics.push({ severity: "error", rule: "tab-label-fit", componentId: label.id, message: "This tab label is too long. Use a short label or fewer tabs." });
  }
  // A designed page is its own artwork: the project's background band or frame would cut across it.
  return [{ nodes, diagnostics, metrics: [], regions: { mainContent: content }, ownArtwork: opt.preset !== "plain" }];
}
const capability = { ...guidedPage.capability, supportsPatterns: [], supportsLineStyle: false, supportsPageNumbers: false, supportsFooter: false, wordingKeys: [] };
/**
 * END COVER (back of the book): the same design turned half a turn, so the
 * back frames the book as the front does — every shape at (1 − x, 1 − y) of
 * the trim. No title; an optional small line of text (the step's subtitle:
 * a brand, a verse, a website) sits centred in the space the shapes leave.
 */
function solveBack(ctx: LayoutContext): SolvedPage[] {
  const g = ctx.pages[0], s = g.safeRect, opt = ctx.module?.cover ?? {};
  const nodes: LayoutNode[] = [], diagnostics: SolvedPage["diagnostics"] = [];
  const W = g.trimWidthIn, H = g.trimHeightIn, R = Math.min(W, (H * 8.5) / 11);
  const circle = (c: LuxeCircle, extra: Partial<CircleNode>) =>
    nodes.push({ id: `${c.id}-back`, type: "circle", component: "Section", rect: { x: (1 - c.x) * W - c.r * R, y: (1 - c.y) * H - c.r * R, w: 2 * c.r * R, h: 2 * c.r * R }, functional: false, fill: c.fill ?? null, ...extra });
  if (opt.preset !== "plain") {
    if (opt.circles !== false) LUXE_CIRCLES.forEach((c) => circle(c, {}));
    if (opt.leopard !== false) LUXE_CHEETAH.forEach((c) => circle(c, { leopard: true }));
    if (opt.outlines !== false) LUXE_RINGS.forEach((c) => circle(c, { outline: true, stroke: "lineArt", strokePt: RING_PT }));
  }
  const line = (opt.subtitle ?? "").trim();
  if (line) {
    const w = Math.min(s.w, 0.6 * W);
    const fit = stackSubtitle(line, w, 0.04 * H, ctx, false);
    const h = (fit.sizePt * fit.lineHeight) / 72;
    const rect = { x: (W - w) / 2, y: Math.max(s.y, Math.min(0.45 * H - h / 2, s.y + s.h - h)), w, h };
    const node = text("back-line", rect, line, "coverSubtitle", { align: "center", wrap: true });
    node.fit = { ...fit, failed: !fit.ok };
    if (!fit.ok) diagnostics.push({ severity: "error", rule: "heading-fit", componentId: "back-line", message: "This wording is too long. Shorten it or choose a larger page." });
    nodes.push(node);
    if (opt.smallLine !== false) {
      const rw = 0.12 * W, ry = Math.min(rect.y + rect.h + 0.018 * H, s.y + s.h);
      nodes.push(rule("back-rule", (W - rw) / 2, ry, (W + rw) / 2, ry, { color: "lineArt", strokePt: RULE_PT }));
    }
  }
  return [{ nodes, diagnostics, metrics: [], regions: { mainContent: s }, ownArtwork: opt.preset !== "plain" }];
}

export const coverPage: LayoutDefinition = { id: "cover-page", label: "Cover page", description: "Reusable front cover, section cover or title page.", family: "shared", pages: 1, period: "none", capability, fit: minimumAreaFit(1.5, 2.5), solve: (ctx) => solve(ctx, false) };
export const dividerPage: LayoutDefinition = { ...coverPage, id: "divider-page", label: "Divider / tab page", description: "Section opener with optional interior printed tab.", solve: (ctx) => solve(ctx, true) };
export const backCoverPage: LayoutDefinition = { ...coverPage, id: "back-cover-page", label: "End cover (back)", description: "The back of the book: the cover design turned half a turn, with an optional line of text.", solve: solveBack };

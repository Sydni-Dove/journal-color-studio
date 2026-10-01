import type { CircleNode, LayoutNode, SolvedPage, TextFit } from "../../types/layout";
import type { PageGeometry, Rect } from "../../types/geometry";
import type { CoverDividerSettings, CoverPanel } from "../../types/recipe";
import type { ColorToken } from "../../types/tokens";
import { getLayoutMeasurer, styleForRole } from "../../engines/typography/textMeasure";
import { text, box, rule } from "../shared/nodes";
import { fitHeading, HEADING_MIN_PT } from "../shared/components";
import { guidedPage } from "./guidedPage";
import { minimumAreaFit, type LayoutContext, type LayoutDefinition } from "../shared/types";
import { classifyComposition, fitSubtitle, fitTitle, placeDecoration, SCRIPT_ASCENT_EM, SCRIPT_DESCENT_EM, SCRIPT_DESCENT_SHORT_EM, type MeasureText, type ProtectedZone } from "./composition";
import { COMPOSITION_PRESETS, LUXE_DECORATION } from "./luxeComposition";
import { findCoverSurface } from "../../design-library/coverSurfaces";
import { isScriptFont } from "../../presets/coverLuxe";

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
// The reference positions live with the responsive design (luxeComposition.ts); these views keep their draw groups.
const luxeGroup = (style: string): LuxeCircle[] => LUXE_DECORATION.filter((d) => d.style === style).map(({ id, x, y, r, fill }) => ({ id, x, y, r, ...(fill ? { fill } : {}) }));
export const LUXE_CIRCLES: LuxeCircle[] = luxeGroup("fill");
export const LUXE_CHEETAH: LuxeCircle[] = luxeGroup("leopard");
export const LUXE_RINGS: LuxeCircle[] = luxeGroup("outline");
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

/**
 * The reference layout at every size ("Fit design to page" off): the Letter
 * composition placed by fractions of the trim, text anchored to the burgundy
 * circle. Kept exactly as it was before responsive composition.
 */
function solveReference(ctx: LayoutContext, divider: boolean): SolvedPage[] {
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
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * SOLID AND DESIGN-LIBRARY COVERS — one palette color, or one Journal Color
 * Studio marble / watercolor (design-library/coverSurfaces.ts), from bleed edge
 * to bleed edge, with optional editable wording. They do not borrow the Luxe
 * shapes or typography; they use the project's cover typography. A library
 * surface is this page's own (`SolvedPage.surface`): the product's background
 * and interior pages never receive it.
 */
function surfaceOf(opt: CoverDividerSettings): SolvedPage["surface"] {
  return opt.preset === "surface" && findCoverSurface(opt.surfaceId) ? { assetId: opt.surfaceId!, ownColors: opt.surfaceColors !== "palette" } : undefined;
}
export function wordingColor(opt: CoverDividerSettings): ColorToken {
  if (opt.solidTextColor) return opt.solidTextColor;
  if (opt.preset !== "surface") return "background";
  // On a panel: ink on a light panel, paper-colored on a dark one.
  if (opt.textPanel) return (["primary", "text", "decorBase", "accent", "decorativeAccent"] as ColorToken[]).includes(opt.panel?.fill ?? "background") ? "background" : "text";
  return findCoverSurface(opt.surfaceId)?.wording ?? "text";
}
/** The full-media field (solid) or nothing (the surface is drawn by the decoration renderer). */
function field(g: PageGeometry, opt: CoverDividerSettings, surface: SolvedPage["surface"]): LayoutNode[] {
  if (surface) return [];
  const media = { x: -g.trimOffset.x, y: -g.trimOffset.y, w: g.mediaWidthIn, h: g.mediaHeightIn };
  // Artwork, not content: it is meant to run through the bleed and the binding edge.
  return [{ ...box("cover-solid-bg", media, { fill: opt.solidColor ?? "primary" }), functional: false }];
}
/**
 * The panel behind the wording on a library surface (Journal Color Studio's
 * title plate): its shape, fill, opacity, outline and inner trim line are the
 * user's; its size comes from the printed words — the longest line plus
 * padding that grows with the title size, so the edge never touches a letter.
 * An oval or circle is drawn around that box. Kept inside the trim.
 */
export const PANEL_DEFAULTS = { shape: "rounded", fill: "background", opacity: 0.86, outline: "none", outlinePt: 1, trim: false, width: "auto" } as const;
/** A fitted panel wider than this share of the trim reads as "almost the page": it becomes a band (auto width). */
export const PANEL_BAND_AT = 0.78;
function wordingPanel(words: LayoutNode[], g: PageGeometry, ctx: LayoutContext, left: boolean, look: CoverPanel = {}): LayoutNode[] {
  const texts = words.filter((n): n is Extract<LayoutNode, { type: "text" }> => n.type === "text");
  if (!texts.length) return [];
  const o = { ...PANEL_DEFAULTS, ...look };
  const shape0 = (id: string, r: Rect, fill: ColorToken | null, opacity: number, stroke: ColorToken | null, pt: number, radiusIn: number): LayoutNode =>
    ({ ...box(id, r, { fill, fillOpacity: opacity, stroke, strokePt: stroke ? pt : 0, radiusIn }), functional: false });
  const measure = getLayoutMeasurer().measure;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, em = 0;
  for (const n of [...texts, ...words.filter((w) => w.type === "rule")]) {
    if (n.type !== "text") {
      y0 = Math.min(y0, n.rect.y);
      y1 = Math.max(y1, n.rect.y + n.rect.h);
      continue;
    }
    const style = { ...styleForRole(ctx.typography, n.role), ...(n.fit ? { sizePt: n.fit.sizePt } : {}) };
    const lines = n.fit?.lines ?? [n.text];
    const lineH = (style.sizePt * (n.fit?.lineHeight ?? ctx.typography.roles[n.role].lineHeight)) / 72;
    const w = Math.min(n.rect.w, Math.max(...lines.map((l) => measure(l, style))));
    const a = left ? n.rect.x : n.rect.x + (n.rect.w - w) / 2;
    x0 = Math.min(x0, a);
    x1 = Math.max(x1, a + w);
    y0 = Math.min(y0, n.rect.y);
    y1 = Math.max(y1, n.rect.y + Math.min(n.rect.h, lineH * lines.length));
    em = Math.max(em, style.sizePt / 72);
  }
  // Room around the words: at least ¼", and more for large display type (its capitals and accents).
  const padX = Math.max(0.3, em * 0.55), padY = Math.max(0.28, em * 0.5);
  let rect = { x: x0 - padX, y: y0 - padY, w: x1 - x0 + 2 * padX, h: y1 - y0 + 2 * padY };
  if (o.shape === "oval" || o.shape === "circle") {
    // Around the box: an ellipse of the same proportions (√2 larger), or the circle through its corners.
    const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
    const [w, h] = o.shape === "circle" ? [Math.hypot(rect.w, rect.h), Math.hypot(rect.w, rect.h)] : [rect.w * Math.SQRT2, rect.h * Math.SQRT2];
    rect = { x: cx - w / 2, y: cy - h / 2, w, h };
  }
  const W = g.trimWidthIn, H = g.trimHeightIn;
  // Never almost-the-width: a rectangle either hugs the words or runs off both sides of the page.
  const straight = o.shape === "rectangle" || o.shape === "rounded";
  const band = straight && (o.width === "band" || (o.width === "auto" && rect.w > PANEL_BAND_AT * W));
  if (band) {
    const r = { x: -g.trimOffset.x, y: Math.max(0, rect.y), w: g.mediaWidthIn, h: Math.min(H, rect.y + rect.h) - Math.max(0, rect.y) };
    const out = [shape0("cover-panel", r, o.fill, o.opacity, o.outline !== "none" ? o.outline : null, o.outlinePt, 0)];
    if (o.trim) {
      const inset = Math.max(0.06, o.outlinePt / 72 + 0.05);
      out.push(shape0("cover-panel-trim", { x: r.x, y: r.y + inset, w: r.w, h: r.h - 2 * inset }, null, 0, "lineArt", 0.6, 0));
    }
    return out;
  }
  // Inside the trim (a circle stays round: it shrinks evenly).
  if (o.shape === "circle" && (rect.w > W || rect.h > H)) {
    const d = Math.min(W, H), cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
    rect = { x: cx - d / 2, y: cy - d / 2, w: d, h: d };
  }
  const x = Math.max(0, rect.x), y = Math.max(0, rect.y);
  rect = { x, y, w: Math.min(W, rect.x + rect.w) - x, h: Math.min(H, rect.y + rect.h) - y };
  const outline = o.outline !== "none" ? o.outline : null;
  const radius = o.shape === "rounded" ? Math.min(0.18, Math.min(rect.w, rect.h) * 0.12) : 0;
  const shape = (id: string, r: Rect, fill: ColorToken | null, opacity: number, stroke: ColorToken | null, pt: number): LayoutNode =>
    o.shape === "oval" || o.shape === "circle"
      ? { id, type: "circle", component: "Section", rect: r, functional: false, fill, fillOpacity: opacity, ...(stroke ? { outline: true, stroke, strokePt: pt } : {}) }
      : shape0(id, r, fill, opacity, stroke, pt, radius);
  const out = [shape("cover-panel", rect, o.fill, o.opacity, outline, o.outlinePt)];
  if (o.trim) {
    const inset = Math.max(0.06, o.outlinePt / 72 + 0.05);
    out.push(shape("cover-panel-trim", { x: rect.x + inset, y: rect.y + inset, w: rect.w - 2 * inset, h: rect.h - 2 * inset }, null, 0, "lineArt", 0.6));
  }
  return out;
}

function solveFlat(ctx: LayoutContext, divider: boolean): SolvedPage[] {
  const g = ctx.pages[0], s = g.safeRect, opt = ctx.module?.cover ?? {};
  const nodes: LayoutNode[] = [], diagnostics: SolvedPage["diagnostics"] = [];
  const surface = surfaceOf(opt);
  nodes.push(...field(g, opt, surface));

  const tab = opt.tab?.show ? tabGeometry(g, opt.tab) : null;
  if (opt.tab?.show && !tab) diagnostics.push({ severity: "error", rule: "tab-fit", componentId: "tab", message: "These tabs do not fit comfortably. Use fewer tabs or a larger page." });
  const tabRoom = tab ? tab.w + 0.26 : 0;
  const content = { ...s, x: tab && tabEdge(g) === "left" ? s.x + tabRoom : s.x, w: s.w - tabRoom };
  const left = opt.alignment === "left";
  const color = wordingColor(opt);
  const showText = opt.showText !== false;
  const title = (ctx.module?.title ?? (divider ? "Section" : "")).trim();
  const subtitle = opt.titleOnly ? "" : (opt.subtitle ?? "").trim();
  const quote = (opt.quote ?? "").trim();
  const words: LayoutNode[] = [];

  if (showText) {
    const anchor = opt.position === "upper" ? 0.26 : opt.position === "lower" ? 0.66 : 0.46;
    let below = Math.max(content.y, anchor * g.trimHeightIn - 0.7);

    if (title) {
      // The title is the cover's focal point whatever the font: as large as ~86 % of the width allows, on one
      // line or two, up to ~30 % of the page's height — not the interior's heading size.
      const role = ctx.typography.roles.coverTitle;
      const script = isScriptFont(role.family ?? ctx.typography.fonts.cover);
      const lh = Math.max(role.lineHeight, script ? 0.95 : 1.05);
      const box = { w: content.w * 0.86, h: content.h * 0.3 };
      const tctx = { typography: { ...ctx.typography, roles: { ...ctx.typography.roles, coverTitle: { ...role, sizePt: Math.min(240, (box.h * 72) / lh), lineHeight: lh } } } };
      const fit = fitHeading(title, "coverTitle", box, tctx);
      const h = (fit.sizePt * fit.lineHeight * fit.lines.length) / 72;
      const y = Math.max(content.y, Math.min(anchor * g.trimHeightIn - h / 2, content.y + content.h - h));
      const titleRect = { x: content.x, y, w: content.w, h };
      const n = text("cover-title", titleRect, title, "coverTitle", { align: left ? "left" : "center", color, wrap: fit.lines.length > 1 });
      n.fit = { ...fit, failed: !fit.ok };
      if (!fit.ok) diagnostics.push({ severity: "error", rule: "heading-fit", componentId: n.id, message: "This cover title is too long. Shorten it or choose a larger page." });
      words.push(n);
      // A script's tails (g, j, p, q, y) hang below its line: the subtitle starts under them.
      below = titleRect.y + titleRect.h + (script ? (fit.sizePt / 72) * 0.28 : 0);
    }

    if (subtitle) {
      const r = { x: content.x, y: below + ctx.spacing.block, w: content.w, h: Math.min(0.8, Math.max(0.35, content.y + content.h - below - ctx.spacing.block)) };
      const fit = fitHeading(subtitle, "coverSubtitle", r, ctx);
      // The box ends with its printed lines, so what follows sits under the words, not under empty space.
      const used = { ...r, h: Math.min(r.h, (fit.sizePt * fit.lineHeight * fit.lines.length) / 72) };
      const n = text("cover-subtitle", used, subtitle, "coverSubtitle", { align: left ? "left" : "center", color, wrap: fit.lines.length > 1 });
      n.fit = { ...fit, failed: !fit.ok };
      if (!fit.ok) diagnostics.push({ severity: "error", rule: "heading-fit", componentId: n.id, message: "This cover subtitle is too long. Shorten it or choose a larger page." });
      words.push(n);
      below = used.y + used.h;
    }

    if (opt.smallLine !== false && (title || subtitle)) {
      const rw = Math.min(1.3, content.w * 0.2), x = left ? content.x : content.x + (content.w - rw) / 2, y = Math.min(content.y + content.h, below + ctx.spacing.block);
      words.push(rule("cover-line", x, y, x + rw, y, { color, strokePt: RULE_PT }));
      below = y;
    }

    if (quote) {
      const r = { x: content.x, y: below + ctx.spacing.section, w: content.w, h: Math.max(0.45, content.y + content.h - below - ctx.spacing.section) };
      const fit = fitHeading(quote, "body", r, ctx);
      const used = surface ? { ...r, h: Math.min(r.h, (fit.sizePt * fit.lineHeight * fit.lines.length) / 72) } : r;
      const n = text("cover-quote", used, quote, "body", { align: left ? "left" : "center", color, wrap: true });
      n.fit = { ...fit, failed: !fit.ok };
      if (!fit.ok) diagnostics.push({ severity: "warning", rule: "heading-fit", componentId: n.id, message: "This cover quote is too long for the available space." });
      words.push(n);
    }
  }
  if (surface && opt.textPanel) nodes.push(...wordingPanel(words, g, ctx, left, opt.panel));
  nodes.push(...words);

  if (tab && opt.tab) {
    nodes.push(box("tab", tab, { stroke: "background", strokePt: 1.5, fill: opt.tab.color ?? "secondary", radiusIn: opt.tab.style === "rounded" ? 0.12 : 0 }));
    const dark = opt.tab.leopard || (["primary", "text", "accent", "decorativeAccent"] as (ColorToken | undefined)[]).includes(opt.tab.color);
    const label = text("tab-label", { x: tab.x + 0.04, y: tab.y + 0.03, w: tab.w - 0.08, h: tab.h - 0.06 }, opt.tab.label ?? title, "label", { wrap: true, align: "center", color: dark ? "background" : "text" });
    const fitted = fitHeading(label.text, "label", label.rect, ctx);
    label.fit = { ...fitted, failed: !fitted.ok };
    nodes.push(label);
  }

  return [{ nodes, diagnostics, metrics: [], regions: { mainContent: content }, ownArtwork: true, ...(surface ? { surface } : {}) }];
}

function solveFlatBack(ctx: LayoutContext): SolvedPage[] {
  const g = ctx.pages[0], s = g.safeRect, opt = ctx.module?.cover ?? {};
  const nodes: LayoutNode[] = [], diagnostics: SolvedPage["diagnostics"] = [];
  const surface = surfaceOf(opt);
  nodes.push(...field(g, opt, surface));
  const line = opt.showText === false ? "" : (opt.subtitle ?? "").trim();
  if (line) {
    const r = { x: s.x, y: Math.max(s.y, s.y + s.h * 0.44), w: s.w, h: Math.min(0.8, s.h * 0.16) };
    const fit = fitHeading(line, "coverSubtitle", r, ctx);
    const n = text("back-line", r, line, "coverSubtitle", { align: "center", color: wordingColor(opt), wrap: true });
    n.fit = { ...fit, failed: !fit.ok };
    if (!fit.ok) diagnostics.push({ severity: "error", rule: "heading-fit", componentId: n.id, message: "This wording is too long. Shorten it or choose a larger page." });
    if (surface && opt.textPanel) nodes.push(...wordingPanel([n], g, ctx, false, opt.panel));
    nodes.push(n);
  }
  return [{ nodes, diagnostics, metrics: [], regions: { mainContent: s }, ownArtwork: true, ...(surface ? { surface } : {}) }];
}

/**
 * Wording choices on the Luxe design: "No wording" prints the artwork only; "Title only" drops the subtitle.
 * The page's name is kept (Pages, tabs) — it just isn't printed.
 */
const WORDS = /^(cover-(title|subtitle|quote|line)|back-(line|rule))$/;
function withWording(pages: SolvedPage[], opt: CoverDividerSettings): SolvedPage[] {
  if (opt.showText !== false && !opt.titleOnly) return pages;
  const drop = (id: string) => (opt.showText === false ? WORDS.test(id) : id === "cover-subtitle");
  return pages.map((p) => ({ ...p, nodes: p.nodes.filter((n) => !drop(n.id)), diagnostics: p.diagnostics.filter((d) => !d.componentId || !drop(d.componentId)) }));
}

/**
 * The design fitted to this page (default): layouts/book/composition.ts picks
 * the size class from the live area, fits the title and subtitle into their
 * protected zones, and moves the decoration around them.
 */
function solveResponsive(ctx: LayoutContext, divider: boolean): SolvedPage[] {
  const g = ctx.pages[0], s = g.safeRect, opt = ctx.module?.cover ?? {};
  const nodes: LayoutNode[] = [], text$: LayoutNode[] = [], diagnostics: SolvedPage["diagnostics"] = [];
  const title = ctx.module?.title ?? (divider ? "Prayer" : "Plan");
  const tab = opt.tab?.show ? tabGeometry(g, opt.tab) : null;
  if (opt.tab?.show && !tab) diagnostics.push({ severity: "error", rule: "tab-fit", componentId: "tab", message: "These tabs do not fit comfortably. Use fewer tabs or a larger page." });
  // Text keeps a label's clear space (0.1") beyond the tab's own gap.
  const tabRoom = tab ? tab.w + 0.26 : 0;
  const content = { ...s, x: tab && tabEdge(g) === "left" ? s.x + tabRoom : s.x, w: s.w - tabRoom };
  const W = g.trimWidthIn, H = g.trimHeightIn;
  const R = Math.min(W, (H * 8.5) / 11);
  const comp = classifyComposition(content);
  const preset = COMPOSITION_PRESETS[opt.preset === "plain" ? "plain" : "neutral-cheetah-luxe"];
  const variant = (divider ? preset.divider : preset.cover)[comp.sizeClass];
  const left = opt.alignment === "left";

  // Measuring with the same metrics the validator uses (the canvas once fonts load).
  const measure = getLayoutMeasurer().measure;
  const titleStyle = styleForRole(ctx.typography, "coverTitle"), subStyle = styleForRole(ctx.typography, "coverSubtitle");
  const mTitle: MeasureText = (t, sizePt, trackingEm) => measure(t, { ...titleStyle, sizePt, trackingEm });
  const mSub: MeasureText = (t, sizePt, trackingEm) => measure(t, { ...subStyle, sizePt, trackingEm });

  // ── Title: the preferred size for this class (× the user's size), shrunk only as far as its zone needs.
  const scale = clamp((opt.titleScale ?? 100) / 100, 0.6, 1.3);
  const narrow = comp.narrow ? 0.85 : 1;
  // Aspect ratio, not only area: a relatively narrow portrait page (6 × 9, 5.5 × 8.5) gets a narrower title zone,
  // so the script doesn't run edge to edge where a squarer page of the same class has room around it.
  const aspectW = comp.landscape ? 1 : comp.aspect < 0.5 ? 0.85 : comp.aspect < 0.62 ? 0.92 : 1;
  let zone = { w: Math.min(content.w, variant.title.maxW * aspectW * content.w), h: variant.title.maxH * content.h };
  // The role's size is a ceiling (a size set in Typography still caps the design).
  const preferredPt = Math.min(variant.title.preferredPt * scale * narrow, titleStyle.sizePt);
  const titleSpec = { preferredPt, minPt: Math.min(variant.title.minPt, preferredPt) };
  let tf = fitTitle(title, mTitle, titleSpec, zone, titleStyle.trackingEm);
  // The narrower zone is a preference for the look: a title that can't fit it at its minimum takes the full
  // content width (clear of the tab) before anything is reported.
  if (!tf.ok && zone.w < content.w) {
    zone = { ...zone, w: content.w };
    tf = fitTitle(title, mTitle, titleSpec, zone, titleStyle.trackingEm);
  }
  const em = tf.sizePt / 72, lineH = ctx.typography.roles.coverTitle.lineHeight;
  const inkAbove = SCRIPT_ASCENT_EM * em, inkBelow = (/[gjpqy]/.test(title) ? SCRIPT_DESCENT_EM : SCRIPT_DESCENT_SHORT_EM) * em;
  const tOff = opt.titleOffset ?? { x: 0, y: 0 }, sOff = opt.subtitleOffset ?? { x: 0, y: 0 };
  const shift = opt.position === "upper" ? -0.09 : opt.position === "lower" ? 0.07 : 0;
  const rectX = left ? content.x : clamp((variant.title.centerX + tOff.x) * W - zone.w / 2, content.x, content.x + content.w - zone.w);
  const cx = left ? content.x + tf.widthIn / 2 : rectX + zone.w / 2;
  let baseline = (variant.title.centerY + shift + tOff.y) * H + (inkAbove - inkBelow) / 2;

  // ── Subtitle: its own fitting (spacing → size → width), centred under the title.
  const subtitle = (opt.subtitle ?? (divider ? "" : "WITH PURPOSE")).trim();
  const sf = subtitle ? fitSubtitle(subtitle, mSub, { ...variant.subtitle, preferredPt: Math.min(variant.subtitle.preferredPt, subStyle.sizePt) }, subStyle.trackingEm, variant.subtitle.width * content.w, variant.subtitle.maxWidth * content.w) : null;
  const subW = sf ? Math.min(content.w, sf.widthIn) : 0;
  const subLine = sf ? (sf.sizePt * variant.subtitle.lineHeight) / 72 : 0, subH = sf ? subLine * sf.lines.length : 0;
  const subCx = left ? content.x + subW / 2 : cx + sOff.x * W;
  const subX = clamp(subCx - subW / 2, content.x, content.x + content.w - subW);
  // A script tail (g j p q y) above the subtitle's column pushes it below the tail.
  const tail = sf && descenderOver(title, { x: rectX, y: 0, w: zone.w, h: 0 }, tf.sizePt, left, { x: subX, w: subW }, ctx);
  const subGap = (tail ? SCRIPT_DESCENT_EM : 0.14) * em + 0.35 * subLine;
  // The rule keeps a label's clear space (0.1") from the subtitle.
  const ruleW = variant.rule.width * content.w, ruleGap = sf ? Math.max(0.12, (variant.rule.gapEm * sf.sizePt) / 72) : inkBelow + 0.12;

  // The text block (title box → subtitle → rule) kept inside the live area: moved as a whole, never squeezed.
  const layoutBlock = (b: number) => {
    const titleTop = b - lineH * em, subTop = b + subGap + sOff.y * H;
    const subBottom = sf ? subTop + subH : b;
    const ruleY = opt.smallLine !== false ? (sf ? subBottom : b) + ruleGap : null;
    return { titleTop, subTop, ruleY, bottom: Math.max(b, subBottom, ruleY ?? 0) };
  };
  let blk = layoutBlock(baseline);
  if (blk.bottom > content.y + content.h) baseline -= blk.bottom - (content.y + content.h);
  blk = layoutBlock(baseline);
  if (blk.titleTop < content.y) baseline += content.y - blk.titleTop;
  blk = layoutBlock(baseline);

  const titleRect = { x: rectX, y: blk.titleTop, w: zone.w, h: lineH * em };
  const zones: ProtectedZone[] = [{ rect: { x: cx - tf.widthIn / 2 - 0.06 * em, y: baseline - inkAbove, w: tf.widthIn + 0.12 * em, h: inkAbove + inkBelow }, soft: true }];
  // On a small page a wide printed tab can leave too little room: say which setting gives it back.
  const roomHint = tab && opt.tab?.style !== "staggered" ? ", switch to the narrower tall staggered tabs" : "";
  const addText = (id: string, value: string, rect: Rect, role: "coverTitle" | "coverSubtitle" | "body", fit: TextFit & { ok: boolean }, message: string) => {
    const node = text(id, rect, value, role, { align: left ? "left" : "center", wrap: true });
    node.fit = { ...fit, failed: !fit.ok };
    if (!fit.ok) diagnostics.push({ severity: "error", rule: "heading-fit", componentId: id, message });
    text$.push(node);
  };
  addText("cover-title", title, titleRect, "coverTitle", { sizePt: tf.sizePt, lineHeight: lineH, lines: [title], ok: tf.ok },
    `“${title}” is too long for this ${divider ? "divider" : "cover"} even at the smallest readable script size (${tf.sizePt} pt). Shorten it${roomHint} or choose a larger page.`);
  if (sf) {
    const subRect = { x: subX, y: clamp(blk.subTop, content.y, content.y + content.h - subH), w: subW, h: subH };
    addText("cover-subtitle", subtitle, subRect, "coverSubtitle", { sizePt: sf.sizePt, lineHeight: variant.subtitle.lineHeight, lines: sf.lines, trackingEm: sf.trackingEm, ok: sf.ok },
      `The subtitle “${subtitle}” does not fit this page even with tighter spacing, smaller type and the widest safe space. Shorten it${roomHint} or choose a larger page.`);
    zones.push({ rect: subRect, soft: false });
  }
  let below = blk.bottom;
  if (blk.ruleY !== null) {
    const rcx = sf ? subX + subW / 2 : cx, rx = clamp(rcx - ruleW / 2, content.x, content.x + content.w - ruleW), ry = Math.min(blk.ruleY, content.y + content.h);
    text$.push(rule("cover-line", rx, ry, rx + ruleW, ry, { color: "lineArt", strokePt: RULE_PT }));
    zones.push({ rect: { x: rx, y: ry - 0.04, w: ruleW, h: 0.08 }, soft: false });
    below = ry;
  }
  if (opt.quote) {
    const qw = Math.min(content.w, 0.7 * content.w), qx = clamp(cx - qw / 2, content.x, content.x + content.w - qw), qy = below + 0.2;
    const qRect = { x: qx, y: qy, w: qw, h: Math.max(0.2, content.y + content.h - qy) };
    const qFit = fitHeading(opt.quote, "body", qRect, ctx);
    addText("cover-quote", opt.quote, qRect, "body", qFit, "This scripture or quote is too long for the space under the title. Shorten it or choose a larger page.");
    zones.push({ rect: qRect, soft: false });
  }
  if (tab) zones.push({ rect: tab, soft: false });

  // ── Decoration: the design's shapes, moved clear of the text (text wins).
  const placed = placeDecoration(preset.decoration, variant, { W, H, R }, zones, { enabled: (t) => opt[t] !== false, shift: opt.decorOffset, strokeIn: RING_PT / 72 });
  for (const d of placed) {
    if (d.hidden) continue;
    const rect = { x: d.cx - d.r, y: d.cy - d.r, w: 2 * d.r, h: 2 * d.r };
    const it = d.item;
    nodes.push({ id: it.id, type: "circle", component: "Section", rect, functional: false,
      ...(it.style === "outline" ? { fill: null, outline: true, stroke: "lineArt" as ColorToken, strokePt: RING_PT } : it.style === "leopard" ? { fill: null, leopard: true } : { fill: it.fill ?? null }) });
    if (d.overlapsText) diagnostics.push({ severity: "warning", rule: "decor-collision", componentId: it.id, message: `The ${it.anchor} shape still touches the text at this size. Nudge the decoration or the title.` });
  }
  nodes.push(...text$);

  if (tab && opt.tab) {
    nodes.push(box("tab", tab, { stroke: "background", strokePt: 1.5, fill: opt.tab.color ?? "secondary", radiusIn: opt.tab.style === "rounded" ? 0.12 : 0 }));
    if (opt.tab.leopard) nodes.push({ id: "tab-leopard", type: "circle", component: "Section", rect: tab, functional: false, fill: "secondary", leopard: true });
    const dark = opt.tab.leopard || (["primary", "text", "accent", "decorativeAccent"] as (ColorToken | undefined)[]).includes(opt.tab.color);
    const label = text("tab-label", { x: tab.x + 0.04, y: tab.y + 0.03, w: tab.w - 0.08, h: tab.h - 0.06 }, opt.tab.label ?? title, "label", { wrap: true, align: "center", color: dark ? "background" : "text" });
    const fitted = fitHeading(label.text, "label", label.rect, ctx);
    label.fit = { ...fitted, failed: !fitted.ok }; nodes.push(label);
    if (!fitted.ok) diagnostics.push({ severity: "error", rule: "tab-label-fit", componentId: label.id, message: "This tab label is too long. Use a short label or fewer tabs." });
  }
  const basis = `${preset.label} ${divider ? "divider" : "cover"} · ${comp.sizeClass} composition`;
  const metric = (label: string, value: number, unit: "in" | "pt" | "count") => ({ label, value, unit, provenance: { geometryClass: "user-design" as const, basis } });
  const metrics = [
    metric(`Composition class: ${comp.sizeClass} (usable ${content.w.toFixed(2)} × ${content.h.toFixed(2)} in)`, content.w, "in"),
    metric(`Title size (${tf.limitedBy})`, tf.sizePt, "pt"),
    ...(sf ? [metric(`Subtitle size (${sf.steps.join(" → ") || "preferred"})`, sf.sizePt, "pt"), metric("Subtitle letter spacing (em × 100)", Math.round(sf.trackingEm * 100), "count")] : []),
    metric("Decorative shapes shown", placed.filter((d) => !d.hidden).length, "count"),
  ];
  return [{ nodes, diagnostics, metrics, regions: { mainContent: content }, ownArtwork: opt.preset !== "plain" }];
}

const flat = (opt?: CoverDividerSettings) => opt?.preset === "solid" || opt?.preset === "surface";
const solve = (ctx: LayoutContext, divider: boolean) =>
  flat(ctx.module?.cover)
    ? solveFlat(ctx, divider)
    : withWording(ctx.module?.cover?.autoFit === false ? solveReference(ctx, divider) : solveResponsive(ctx, divider), ctx.module?.cover ?? {});
const capability = { ...guidedPage.capability, supportsPatterns: [], supportsLineStyle: false, supportsPageNumbers: false, supportsFooter: false, wordingKeys: [] };
/**
 * END COVER (back of the book): the same design turned half a turn, so the
 * back frames the book as the front does — every shape at (1 − x, 1 − y) of
 * the trim. No title; an optional small line of text (the step's subtitle:
 * a brand, a verse, a website) sits centred in the space the shapes leave.
 */
function solveBackReference(ctx: LayoutContext): SolvedPage[] {
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

/**
 * END COVER, fitted to the page (default): the front design turned half a turn
 * through the same composition engine — the page's size class sets the shapes'
 * size and which pieces stay, and they step clear of the optional line of text.
 */
function solveBackResponsive(ctx: LayoutContext): SolvedPage[] {
  const g = ctx.pages[0], s = g.safeRect, opt = ctx.module?.cover ?? {};
  const nodes: LayoutNode[] = [], diagnostics: SolvedPage["diagnostics"] = [];
  const W = g.trimWidthIn, H = g.trimHeightIn, R = Math.min(W, (H * 8.5) / 11);
  const comp = classifyComposition(s);
  const preset = COMPOSITION_PRESETS[opt.preset === "plain" ? "plain" : "neutral-cheetah-luxe"];
  const variant = preset.cover[comp.sizeClass];
  const zones: ProtectedZone[] = [], text$: LayoutNode[] = [];
  const line = (opt.subtitle ?? "").trim();
  if (line) {
    const subStyle = styleForRole(ctx.typography, "coverSubtitle"), measure = getLayoutMeasurer().measure;
    const mSub: MeasureText = (t, sizePt, trackingEm) => measure(t, { ...subStyle, sizePt, trackingEm });
    const spec = { ...variant.subtitle, stack: false, preferredPt: Math.min(variant.subtitle.preferredPt, subStyle.sizePt) };
    const sf = fitSubtitle(line, mSub, spec, subStyle.trackingEm, Math.min(s.w, 0.6 * W), s.w);
    const w = Math.min(s.w, sf.widthIn), h = (sf.sizePt * spec.lineHeight * sf.lines.length) / 72;
    const rect = { x: clamp((W - w) / 2, s.x, s.x + s.w - w), y: clamp(0.45 * H - h / 2, s.y, s.y + s.h - h), w, h };
    const node = text("back-line", rect, line, "coverSubtitle", { align: "center", wrap: true });
    node.fit = { sizePt: sf.sizePt, lineHeight: spec.lineHeight, lines: sf.lines, trackingEm: sf.trackingEm, failed: !sf.ok };
    if (!sf.ok) diagnostics.push({ severity: "error", rule: "heading-fit", componentId: "back-line", message: `“${line}” does not fit the end cover even with tighter spacing, smaller type and the widest safe space. Shorten it or choose a larger page.` });
    text$.push(node);
    zones.push({ rect, soft: false });
    if (opt.smallLine !== false) {
      const rw = variant.rule.width * s.w, ry = Math.min(rect.y + rect.h + Math.max(0.12, 0.018 * H), s.y + s.h);
      text$.push(rule("back-rule", (W - rw) / 2, ry, (W + rw) / 2, ry, { color: "lineArt", strokePt: RULE_PT }));
      zones.push({ rect: { x: (W - rw) / 2, y: ry - 0.04, w: rw, h: 0.08 }, soft: false });
    }
  }
  // Half a turn: every anchor at (1 − x, 1 − y), each piece escaping towards its own (turned) corner.
  const turned = preset.decoration.map((d) => ({ ...d, id: `${d.id}-back`, x: 1 - d.x, y: 1 - d.y, push: [-d.push[0], -d.push[1]] as [number, number] }));
  const adjust = Object.fromEntries(Object.entries(variant.adjust ?? {}).map(([k, v]) => [`${k}-back`, v]));
  const placed = placeDecoration(turned, { ...variant, adjust }, { W, H, R }, zones, { enabled: (t) => opt[t] !== false, shift: opt.decorOffset, strokeIn: RING_PT / 72 });
  for (const d of placed) {
    if (d.hidden) continue;
    const it = d.item;
    nodes.push({ id: it.id, type: "circle", component: "Section", rect: { x: d.cx - d.r, y: d.cy - d.r, w: 2 * d.r, h: 2 * d.r }, functional: false,
      ...(it.style === "outline" ? { fill: null, outline: true, stroke: "lineArt" as ColorToken, strokePt: RING_PT } : it.style === "leopard" ? { fill: null, leopard: true } : { fill: it.fill ?? null }) });
  }
  nodes.push(...text$);
  return [{ nodes, diagnostics, metrics: [], regions: { mainContent: s }, ownArtwork: opt.preset !== "plain" }];
}
const solveBack = (ctx: LayoutContext) =>
  flat(ctx.module?.cover)
    ? solveFlatBack(ctx)
    : withWording(ctx.module?.cover?.autoFit === false ? solveBackReference(ctx) : solveBackResponsive(ctx), ctx.module?.cover ?? {});

export const coverPage: LayoutDefinition = { id: "cover-page", label: "Cover page", description: "Reusable front cover, section cover or title page.", family: "shared", pages: 1, period: "none", capability, fit: minimumAreaFit(1.5, 2.5), solve: (ctx) => solve(ctx, false) };
export const dividerPage: LayoutDefinition = { ...coverPage, id: "divider-page", label: "Divider / tab page", description: "Section opener with optional interior printed tab.", solve: (ctx) => solve(ctx, true) };
export const backCoverPage: LayoutDefinition = { ...coverPage, id: "back-cover-page", label: "End cover (back)", description: "The back of the book: the cover design turned half a turn, with an optional line of text.", solve: solveBack };

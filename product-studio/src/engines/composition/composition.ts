/**
 * COMPOSITION RESOLVER — pure. Solved page + geometry → physical composition
 * regions (anchors) and the protected functional content decoration must
 * respect. All rects are TRIM coordinates, like layout nodes.
 *
 * Regions come from three places:
 *   geometry   page, safeArea, the four accent quadrants
 *   frame      header, footer (group nodes emitted by pageFrame)
 *   layout     title (ink of the page's title text), calendar, notes, sidebar,
 *              writingArea, mainContent (declared in SolvedPage.regions, with
 *              node-derived fallbacks)
 */
import type { Composition, CompositionAnchor, Corner, CornerRegion, LayoutRegions, ProtectedKind, ProtectedRect } from "../../types/composition";
import type { PageGeometry, Rect } from "../../types/geometry";
import type { LayoutNode, SolvedPage, TextNode } from "../../types/layout";
import type { SpacingTokens, TypographySettings } from "../../types/tokens";
import { inkBoxFor } from "../typography/ink";
import { heuristicMeasurer, type TextMeasurer } from "../typography/textMeasure";
import { ptToIn } from "../units/units";

/** Page-title semantics in priority order (first present = the page's title). */
const TITLE_SEMANTICS = ["pageTitle", "monthYear", "weekOf"] as const;

export const inflate = (r: Rect, d: number): Rect => ({ x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d });

export function union(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Strict overlap (touching edges do not count). */
export const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.h - 1e-6 && b.y < a.y + a.h - 1e-6;

/** Footprint a functional node occupies on paper (text = its ink). */
export function footprint(n: LayoutNode, typography: TypographySettings, measure: TextMeasurer): { kind: ProtectedKind; rect: Rect } | null {
  if (!n.functional) return null;
  switch (n.type) {
    case "group":
      return null;
    case "text":
      return n.text ? { kind: "text", rect: inkBoxFor(n, typography, measure) } : null;
    case "rule": {
      const t = ptToIn(n.strokePt) / 2;
      return { kind: "rule", rect: { x: n.rect.x - t, y: n.rect.y - t, w: n.rect.w + 2 * t, h: n.rect.h + 2 * t } };
    }
    case "box":
      return { kind: "box", rect: n.rect };
    case "checkbox":
      return { kind: "mark", rect: n.rect };
    default:
      return { kind: "surface", rect: n.rect };
  }
}

export function titleNode(nodes: LayoutNode[], titleId?: string): TextNode | undefined {
  if (titleId) {
    const t = nodes.find((n): n is TextNode => n.type === "text" && n.id === titleId && !!n.text);
    if (t) return t;
  }
  for (const key of TITLE_SEMANTICS) {
    const t = nodes.find((n): n is TextNode => n.type === "text" && n.semantic === key && !!n.text);
    if (t) return t;
  }
  return undefined;
}

export type DecorationSpacingKey = "decorationToContentGap" | "decorationToTitleGap" | "decorationToRuleGap" | "titleAccentGap" | "cornerInset" | "edgeBleedAmount";

/** Contained corner regions: each page quadrant, inset from the trim edges by `inset`. */
export function cornerRegions(W: number, H: number, inset: number, clearance: number): Record<Corner, CornerRegion> {
  const q = (corner: Corner): CornerRegion => {
    const left = corner === "tl" || corner === "bl", top = corner === "tl" || corner === "tr";
    return {
      corner,
      x: left ? inset : W / 2,
      y: top ? inset : H / 2,
      width: W / 2 - inset,
      height: H / 2 - inset,
      insetFromTrimIn: inset,
      clearanceFromContentIn: clearance,
    };
  };
  return { tl: q("tl"), tr: q("tr"), bl: q("bl"), br: q("br") };
}

export function resolveComposition(
  g: PageGeometry,
  solved: SolvedPage,
  typography: TypographySettings,
  spacing: Pick<SpacingTokens, DecorationSpacingKey>,
  measure: TextMeasurer = heuristicMeasurer,
): Composition {
  const W = g.trimWidthIn, H = g.trimHeightIn;
  const clearance = spacing.decorationToContentGap;
  const inset = spacing.cornerInset;
  const regions: LayoutRegions = {
    page: { x: 0, y: 0, w: W, h: H },
    safeArea: g.safeRect,
    topLeftAccent: { x: 0, y: 0, w: W / 2, h: H / 2 },
    topRightAccent: { x: W / 2, y: 0, w: W / 2, h: H / 2 },
    bottomLeftAccent: { x: 0, y: H / 2, w: W / 2, h: H / 2 },
    bottomRightAccent: { x: W / 2, y: H / 2, w: W / 2, h: H / 2 },
  };
  const nodes = solved.nodes;
  const header = nodes.find((n) => n.type === "group" && n.component === "PageHeader");
  const footer = nodes.find((n) => n.type === "group" && n.component === "PageFooter");
  if (header && header.rect.h > 0) regions.header = header.rect;
  if (footer) regions.footer = footer.rect;

  const title = titleNode(nodes, solved.titleId);
  let titleEmIn = ptToIn(typography.roles.pageTitle.sizePt);
  if (title) {
    regions.title = inkBoxFor(title, typography, measure);
    titleEmIn = ptToIn(typography.roles[title.role].sizePt);
  }

  const prot: ProtectedRect[] = [];
  const raw: Rect[] = [];
  const body: Rect[] = [];
  for (const n of nodes) {
    const f = footprint(n, typography, measure);
    if (!f) continue;
    raw.push(f.rect);
    prot.push({ id: n.id, kind: f.kind, rect: inflate(f.rect, clearance) });
    if (n.component !== "PageHeader" && n.component !== "PageFooter") body.push(f.rect);
  }
  // Binding / glue keep-outs: art there is punched or glued over.
  for (const k of g.keepOuts) prot.push({ id: `keepout-${k.id}`, kind: "keepout", rect: k.rect });
  const writing = nodes.filter((n) => n.type === "lines" || n.type === "dots").map((n) => n.rect);

  // Layout-declared regions win; node-derived fallbacks fill the rest.
  const declared = solved.regions ?? {};
  const fallback: LayoutRegions = {};
  const mc = union(body);
  if (mc) fallback.mainContent = mc;
  const wa = union(writing);
  if (wa) fallback.writingArea = wa;
  Object.assign(regions, fallback, declared);

  const rule = nodes.find((n) => n.type === "rule" && n.component === "PageHeader" && n.id.endsWith("-rule"));
  if (rule) regions.titleRule = rule.rect;
  const align = title ? (title.align ?? typography.roles[title.role].align) : "left";
  return {
    regions,
    protected: prot,
    content: union(raw),
    headerRule: rule ? rule.rect : null,
    headerRuleId: rule ? rule.id : null,
    titleId: title?.id ?? null,
    titleAlign: align === "center" ? "center" : align === "right" ? "end" : "start",
    corners: cornerRegions(W, H, inset, clearance),
    gaps: {
      toContent: clearance,
      toTitle: spacing.decorationToTitleGap,
      toRule: spacing.decorationToRuleGap,
      titleAccent: spacing.titleAccentGap,
      cornerInset: inset,
      edgeBleed: spacing.edgeBleedAmount,
    },
    titleEmIn,
    clearanceIn: clearance,
    trim: { w: W, h: H },
    bleedIn: { x: g.trimOffset.x, y: g.trimOffset.y },
  };
}

export function hasAnchor(c: Composition, a: CompositionAnchor): boolean {
  return !!c.regions[a];
}

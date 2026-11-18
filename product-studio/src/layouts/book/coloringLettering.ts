/**
 * COLORING LETTERING — a coloring page whose words are part of the picture to color (the "Bubble letters" lettering
 * style). Everything sits at the bottom, under the picture:
 *   the title, very large, in chunky rounded letters drawn as black outlines (white inside), an outlined heart each side;
 *   the verse in the same outlined letters, smaller, centred on 2–4 lines, with little burst strokes at each side;
 *   the reference, smaller, centred, a short line each side ending in a small outlined heart.
 * The picture area runs down to just above the lettering and tucks slightly behind the title, like a hand-drawn page.
 * Black outlines only: no fills, no grays, no colors.
 *
 * The page's words come from its module's blocks: "title", "verse" (the words only) and "ref" (the reference), with
 * the title and verse sizes on their blocks (headingSizePt).
 */
import { getLayoutMeasurer, styleForRole } from "../../engines/typography/textMeasure";
import type { LayoutMetric, LayoutNode, SolvedPage, TextNode } from "../../types/layout";
import type { Rect } from "../../types/geometry";
import { pageFrame } from "../shared/components";
import { group, rule } from "../shared/nodes";
import { minimumAreaFit, type LayoutContext, type LayoutDefinition } from "../shared/types";

/** The lettering's font: chunky, rounded, easy to color inside. */
export const BUBBLE_FONT = "Fredoka";
const WEIGHT = 700;
/** Sizes a page uses when the maker sets one; "Auto" (the default) makes the lettering fill about the bottom quarter. */
export const BUBBLE_TITLE_PT = 64;
export const BUBBLE_VERSE_PT = 28;
/** Auto: the largest sizes up to these, with the title within ~11% and the verse within ~15% of the page height. */
const AUTO_TITLE_MAX_PT = 110, AUTO_TITLE_SHARE = 0.11;
const AUTO_VERSE_MAX_PT = 54, AUTO_VERSE_SHARE = 0.15;
/** "Move the words up": at most this far (inches). */
export const MAX_RAISE_IN = 2;
/** The verse never goes below this to fit; longer verses get a note to use a short excerpt. */
const MIN_VERSE_PT = 18;
const MAX_VERSE_LINES = 4;
/** How far the picture tucks behind the top of the title (inches). */
const ART_TUCK_IN = 0.18;
const LINE_HEIGHT = 1.08;
/** Outline weight the strokes share with the letters (points). */
const STROKE_PT = 1.6;

type Words = { title: string; verse: string; ref: string; titlePt?: number; versePt?: number; raiseIn: number };

function wordsOf(ctx: LayoutContext): Words {
  const blocks = ctx.module?.promptSet?.blocks ?? [];
  const get = (id: string) => blocks.find((b) => b.id === id);
  return {
    title: get("title")?.label.trim() ?? "",
    verse: get("verse")?.label.trim() ?? "",
    ref: get("ref")?.label.trim() ?? "",
    // A size set by the maker, or none (Auto).
    titlePt: get("title")?.headingSizePt,
    versePt: get("verse")?.headingSizePt,
    // "Move the words up" travels on a block of its own (its weight, in inches).
    raiseIn: Math.max(0, Math.min(MAX_RAISE_IN, get("raise")?.weight ?? 0)),
  };
}

const style = (ctx: LayoutContext, sizePt: number) => ({ ...styleForRole(ctx.typography, "pageTitle"), family: BUBBLE_FONT, weight: WEIGHT, sizePt, trackingEm: 0.01, transform: "none" as const, style: "normal" as const });

/** Greedy word wrap at a size; the lines. */
function wrap(ctx: LayoutContext, value: string, width: number, sizePt: number): string[] {
  const m = getLayoutMeasurer().measure, st = style(ctx, sizePt);
  const lines: string[] = [];
  let cur = "";
  for (const word of value.split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${word}` : word;
    if (cur && m(next, st) > width) {
      lines.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

const lineH = (pt: number, lines = 1) => (pt * LINE_HEIGHT * lines) / 72;

function lettering(id: string, rect: Rect, value: string, lines: string[], sizePt: number, outline: boolean): TextNode {
  return {
    type: "text", id, component: "SectionHeader", rect, functional: true, text: value, role: "pageTitle", align: "center", vAlign: "middle", wrap: false,
    family: BUBBLE_FONT, weight: WEIGHT, color: "text", ...(outline ? { outline: true } : {}),
    fit: { sizePt, lineHeight: LINE_HEIGHT, lines },
  };
}

/** An outlined heart (a heart glyph drawn as an outline, white inside), centred at (cx, cy). */
function heart(id: string, cx: number, cy: number, sizePt: number): TextNode {
  const w = (sizePt * 0.9) / 72, h = w * (22 / 24);
  return { type: "text", id, component: "Text", rect: { x: cx - w / 2, y: cy - h / 2, w, h }, functional: false, text: "♥", role: "pageTitle", align: "center", vAlign: "middle", wrap: false, family: BUBBLE_FONT, weight: WEIGHT, color: "text", glyph: "heart", fit: { sizePt, lineHeight: LINE_HEIGHT, lines: ["♥"] } };
}

/** Little burst strokes beside the verse: three short lines fanning out from (x, cy), toward the page edge. */
function burst(id: string, x: number, cy: number, dir: -1 | 1, len: number): LayoutNode[] {
  return [-35, 0, 35].map((deg, k) => {
    const a = (deg * Math.PI) / 180;
    const x1 = x + dir * len * 0.4 * Math.cos(a), y1 = cy - len * 0.4 * Math.sin(a);
    const x2 = x + dir * len * Math.cos(a), y2 = cy - len * Math.sin(a);
    return { ...rule(`${id}-${k}`, x1, y1, x2, y2, { strokePt: STROKE_PT, color: "text", component: "Divider" }), functional: false };
  });
}

export function solveColoringLettering(ctx: LayoutContext): SolvedPage {
  const frame = pageFrame(ctx, 0, { headerH: 0, headerRule: false });
  const body = frame.body;
  const w = wordsOf(ctx);
  const m = getLayoutMeasurer().measure;
  const nodes: LayoutNode[] = [...frame.nodes];
  const diagnostics = [...frame.diagnostics];
  const gap = 0.08;
  const cx = body.x + body.w / 2;
  // "Move the words up": the lettering sits that much higher, closer to the picture.
  let bottom = body.y + body.h - w.raiseIn;

  // Verse size: the maker's, or Auto — the largest (up to AUTO_VERSE_MAX_PT) on at most four lines within ~15% of the page.
  const burstRoom = 0.55;
  const verseW = body.w - 2 * burstRoom;
  let versePt = w.versePt ?? AUTO_VERSE_MAX_PT;
  let verseLines = w.verse ? wrap(ctx, w.verse, verseW, versePt) : [];
  const verseFits = (pt: number, lines: string[]) => lines.length <= MAX_VERSE_LINES && (w.versePt !== undefined || lineH(pt, lines.length) <= body.h * AUTO_VERSE_SHARE);
  while (w.verse && !verseFits(versePt, verseLines) && versePt > MIN_VERSE_PT) {
    versePt = Math.max(MIN_VERSE_PT, versePt - 2);
    verseLines = wrap(ctx, w.verse, verseW, versePt);
  }

  // Reference: one line at the very bottom, a short line each side ending in a small heart.
  const refPt = Math.min(22, Math.max(13, Math.round(versePt * 0.45)));
  if (w.ref) {
    const h = lineH(refPt);
    const y = bottom - h;
    const tw = Math.min(body.w * 0.6, m(w.ref, style(ctx, refPt)) + 0.1);
    nodes.push(lettering("cl-ref", { x: cx - tw / 2, y, w: tw, h }, w.ref, [w.ref], refPt, false));
    const lineLen = Math.min(0.75, (body.w - tw) / 2 - 0.35);
    const mid = y + h / 2;
    for (const side of [-1, 1] as const) {
      const x0 = cx + side * (tw / 2 + 0.1), x1 = x0 + side * lineLen;
      nodes.push({ ...rule(`cl-ref-line-${side < 0 ? "l" : "r"}`, x0, mid, x1, mid, { strokePt: STROKE_PT, color: "text", component: "Divider" }), functional: false });
      nodes.push(heart(`cl-ref-heart-${side < 0 ? "l" : "r"}`, x1 + side * 0.14, mid, refPt * 0.9));
    }
    bottom = y - gap;
  }

  // Verse: outlined, centred, on at most four lines (never under MIN_VERSE_PT).
  if (w.verse) {
    const pt = versePt, lines = verseLines;
    if (lines.length > MAX_VERSE_LINES) diagnostics.push({ severity: "warning", rule: "min-writing-area", componentId: "cl-verse", message: `This verse is long for bubble letters (${lines.length} lines at ${pt} pt). Choose “Short excerpt” and type the part to show.` });
    const h = lineH(pt, lines.length);
    const y = bottom - h;
    nodes.push({ ...lettering("cl-verse-prompt", { x: body.x + burstRoom, y, w: verseW, h }, w.verse, lines, pt, true), component: "Text" });
    const widest = Math.max(...lines.map((l) => m(l, style(ctx, pt))));
    const len = Math.min(0.42, burstRoom - 0.06);
    nodes.push(...burst("cl-burst-l", cx - widest / 2 - 0.1, y + h / 2, -1, len), ...burst("cl-burst-r", cx + widest / 2 + 0.1, y + h / 2, 1, len));
    bottom = y - gap;
  }

  // Title: one line, as large as fits beside its two hearts.
  let titleTop = bottom;
  if (w.title) {
    // The maker's size, or Auto: the largest (up to AUTO_TITLE_MAX_PT) within ~11% of the page; never wider than the page.
    let pt = w.titlePt ?? Math.min(AUTO_TITLE_MAX_PT, Math.floor((body.h * AUTO_TITLE_SHARE * 72) / LINE_HEIGHT));
    const heartAt = (p: number) => Math.min(36, Math.round(p * 0.4));
    const roomAt = (p: number) => body.w - 2 * ((heartAt(p) * 0.9) / 72 + 0.25);
    while (pt > 24 && m(w.title, style(ctx, pt)) > roomAt(pt)) pt -= 2;
    // Auto, a long title: on two balanced lines when that lets it stay bigger than the verse.
    let titleLines = [w.title];
    const words = w.title.split(/\s+/);
    if (w.titlePt === undefined && words.length > 1 && pt < versePt * 1.3) {
      const splits = words.slice(1).map((_, k) => [words.slice(0, k + 1).join(" "), words.slice(k + 1).join(" ")]);
      const widest = (ls: string[], p: number) => Math.max(...ls.map((l) => m(l, style(ctx, p))));
      const best = splits.sort((x, y) => widest(x, 40) - widest(y, 40))[0];
      let p2 = Math.min(AUTO_TITLE_MAX_PT, Math.floor((body.h * AUTO_TITLE_SHARE * 1.6 * 72) / (LINE_HEIGHT * 2)));
      while (p2 > 24 && widest(best, p2) > roomAt(p2)) p2 -= 2;
      if (p2 > pt) {
        pt = p2;
        titleLines = best;
      }
    }
    const heartPt = heartAt(pt);
    const room = roomAt(pt);
    const h = lineH(pt, titleLines.length);
    const y = bottom - h;
    const tw = Math.min(room, Math.max(...titleLines.map((l) => m(l, style(ctx, pt)))) + 0.1);
    nodes.push(lettering("cl-title-title", { x: cx - tw / 2, y, w: tw, h }, w.title, titleLines, pt, true));
    for (const side of [-1, 1] as const) nodes.push(heart(`cl-title-heart-${side < 0 ? "l" : "r"}`, cx + side * (tw / 2 + (heartPt * 0.45) / 72 + 0.1), y + h / 2, heartPt));
    titleTop = y;
  }

  // The picture: from the top of the page down to just above the lettering, tucking slightly behind the title.
  const artBottom = w.title || w.verse || w.ref ? Math.min(body.y + body.h, titleTop + ART_TUCK_IN) : body.y + body.h;
  const art = { x: body.x, y: body.y, w: body.w, h: Math.max(0, artBottom - body.y) };
  nodes.unshift(group("cl-art", "Section", art));
  if (art.h < body.h * 0.45) diagnostics.push({ severity: "warning", rule: "min-writing-area", componentId: "cl-art", message: "The lettering leaves less than half the page for the picture. Use a shorter excerpt or smaller lettering." });

  const metrics: LayoutMetric[] = [
    { label: "Picture area height", value: +art.h.toFixed(3), unit: "in", provenance: { geometryClass: "user-design", basis: "page body above the lettering" } },
  ];
  return { nodes, diagnostics, metrics, regions: { mainContent: body, writingArea: art } };
}

export const coloringLettering: LayoutDefinition = {
  id: "coloring-lettering",
  label: "Coloring page with bubble lettering",
  family: "journal",
  description: "A picture to color, with the title, verse and reference in outlined bubble letters to color too.",
  pages: 1,
  period: "none",
  capability: {
    supportedProductTypes: ["custom", "journal", "worksheet", "insert"],
    supportsPatterns: ["blank"],
    supportsLineStyle: false,
    supportsSidebar: false,
    supportsDatePlacement: false,
    supportsSectionsPerDay: false,
    supportsWritingRows: false,
    supportsPageNumbers: true,
    supportsFooter: true,
    requiresCalendar: false,
    usesWeekStart: false,
    wordingKeys: [],
    repeats: ["once", "count"],
    defaultRepeat: "once",
  },
  fit: minimumAreaFit(4, 5, "Coloring page"),
  solve: (ctx) => [solveColoringLettering(ctx)],
};

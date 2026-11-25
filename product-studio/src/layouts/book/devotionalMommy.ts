/**
 * DEVOTIONAL SPREAD — THE MOMMY PAGE (the right-hand page of a Devotional Spread, engines/coloringBook/spread.ts).
 *
 *   column (default)  the uploaded art fills the inner side of the page (the split, about 65% of the width, next to the
 *                     binding), and a stationery-style activity column runs down the outer side
 *   band              the art across the top (the split of the height), the activities in two columns across the bottom
 *
 * The activities, in order, each under a small spaced label with a delicate botanical sprig between them:
 *   Read the Word      2–3 Scripture excerpts, each in a soft outlined panel with its reference (a paraphrase is labelled)
 *   Fill in the Blank  3 statements, each with a write-on line and its reference (the answers are never printed)
 *   Listen & Reflect   one question and 3–4 writing lines
 *   Heart to Heart     one question
 * and, when chosen, a reserved, labelled box for a QR code added later (nothing is generated).
 *
 * Inner and outer follow the page's side, so the binding margin and the art mirror correctly on a left or right page.
 * The page's words come from its module's blocks (ids below); sizes, split and line spacing from
 * LayoutOptions.devotionalSpread. Black and soft gray outlines only, like the art.
 */
import { getLayoutMeasurer, styleForRole } from "../../engines/typography/textMeasure";
import type { BoxNode, LayoutDiagnostic, LayoutNode, RuleNode, SolvedPage, TextNode } from "../../types/layout";
import type { Rect } from "../../types/geometry";
import { pageFrame } from "../shared/components";
import { group, rule } from "../shared/nodes";
import { minimumAreaFit, type LayoutContext, type LayoutDefinition } from "../shared/types";
import { BUBBLE_FONT } from "./coloringLettering";

/** The elegant script the declaration is set in (when the page shows it). */
export const MOMMY_SCRIPT_FONT = "Great Vibes";
export const SPREAD_DEFAULTS = { split: 0.65, headingPt: 10.5, bodyPt: 9.5, lineSpacingIn: 0.3 };
/** Soft gray for panels, sprigs and writing lines (the words stay black). */
export const SOFT = "#9A9A9A";
const LINE_HEIGHT = 1.28;
const GAP_X = 0.2;
const PAD = 0.09;

export type MommyWords = {
  title: string;
  bubble: boolean;
  band: boolean;
  qr: boolean;
  read: { text: string; ref: string; label: string }[];
  blanks: { text: string; ref: string }[];
  reflect: { question: string; lines: number };
  heart: string;
};

function wordsOf(ctx: LayoutContext): MommyWords {
  const blocks = ctx.module?.promptSet?.blocks ?? [];
  const get = (id: string) => blocks.find((b) => b.id === id);
  const label = (id: string) => get(id)?.label.trim() ?? "";
  const read: MommyWords["read"] = [];
  const blanks: MommyWords["blanks"] = [];
  for (let i = 1; i <= 6; i++) {
    if (label(`read-${i}`)) read.push({ text: label(`read-${i}`), ref: label(`read-${i}-ref`), label: label(`read-${i}-kind`) });
    if (label(`blank-${i}`)) blanks.push({ text: label(`blank-${i}`), ref: label(`blank-${i}-ref`) });
  }
  return {
    title: label("title"),
    bubble: !!get("style-bubble"),
    band: !!get("band"),
    qr: !!get("qr"),
    read,
    blanks,
    reflect: { question: label("reflect"), lines: Math.max(0, Math.min(8, Math.round(get("reflect")?.weight ?? 4))) },
    heart: label("heart"),
  };
}

type Style = ReturnType<typeof styleForRole>;

/** Greedy word wrap (explicit line breaks kept). */
function wrap(value: string, width: number, st: Style): string[] {
  const m = getLayoutMeasurer().measure;
  const out: string[] = [];
  for (const para of value.split(/\n/)) {
    let cur = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = cur ? `${cur} ${word}` : word;
      if (cur && m(next, st) > width) {
        out.push(cur);
        cur = word;
      } else cur = next;
    }
    out.push(cur);
  }
  return out;
}

/**
 * One block of the column, measured: the column is built as a list of these, then placed top to bottom
 * (or, when it can't all fit, the overflow reported).
 */
type Piece = { h: number; draw: (x: number, y: number, w: number) => LayoutNode[] };

export function solveDevotionalMommy(ctx: LayoutContext): SolvedPage {
  const frame = pageFrame(ctx, 0, { headerH: 0, headerRule: false });
  const body = frame.body;
  const set = { ...SPREAD_DEFAULTS, ...(ctx.options.devotionalSpread ?? {}) };
  const split = Math.max(0.5, Math.min(0.8, set.split));
  const w = wordsOf(ctx);
  const m = getLayoutMeasurer().measure;
  const nodes: LayoutNode[] = [...frame.nodes];
  const diagnostics: LayoutDiagnostic[] = [...frame.diagnostics];
  // Inner = the binding side: on the left of a right-hand page, on the right of a left-hand one.
  const innerLeft = ctx.pages[0].side !== "verso";

  const bodyRole = styleForRole(ctx.typography, "body");
  const serif = ctx.typography.fonts.body;
  const display = ctx.typography.fonts.headings;
  const st = (family: string, sizePt: number, weight = 400, trackingEm = bodyRole.trackingEm): Style => ({ ...bodyRole, family, sizePt, weight, trackingEm, transform: "none", style: "normal" });
  const textNode = (id: string, rect: Rect, value: string, lines: string[], s: Style, align: "left" | "center" | "right" = "left", extra: Partial<TextNode> = {}): TextNode => ({
    type: "text", id, component: "Text", rect, functional: true, text: value, role: "body", align, vAlign: "top", wrap: false,
    family: s.family, weight: s.weight, color: "text", fit: { sizePt: s.sizePt, lineHeight: LINE_HEIGHT, lines, trackingEm: s.trackingEm }, ...extra,
  });
  const lh = (pt: number, n = 1) => (pt * LINE_HEIGHT * n) / 72;
  const soft = (r: RuleNode): RuleNode => ({ ...r, hex: SOFT, functional: false });
  const panel = (id: string, rect: Rect): BoxNode => ({ type: "box", id, component: "Section", rect, functional: false, stroke: "border", strokePt: 0.6, fill: null, fillOpacity: 0, radiusIn: 0.1, strokeHex: SOFT });

  const bodySt = st(serif, set.bodyPt);
  const refSt = st(serif, Math.max(7, set.bodyPt - 1.5), 600);
  const labelSt = st(display, set.headingPt, 600, 0.14);

  // ---- The pieces, in order
  const label = (id: string, value: string): Piece => {
    const v = value.toUpperCase();
    const h = lh(set.headingPt);
    return { h: h + 0.06, draw: (x, y, cw) => [textNode(id, { x, y, w: cw, h }, v, [v], labelSt, "center", { component: "SectionHeader" })] };
  };
  const sprig = (id: string): Piece => ({
    h: 0.26,
    draw: (x, y, cw) => {
      const sw = Math.min(1.5, cw * 0.7);
      return [{ type: "text", id, component: "Text", rect: { x: x + (cw - sw) / 2, y: y + 0.05, w: sw, h: 0.16 }, functional: false, text: "~", role: "body", align: "center", vAlign: "middle", wrap: false, color: "text", glyph: "sprig", fit: { sizePt: 8, lineHeight: 1, lines: ["~"] } } as TextNode];
    },
  });
  /** A piece of the column whose height depends on the column's width. */
  type Flex = { measure: (cw: number) => number; render: (x: number, y: number, cw: number) => LayoutNode[] };
  const fixed = (p: Piece): Flex => ({ measure: () => p.h, render: (x, y, cw) => p.draw(x, y, cw) });
  const space = (h: number): Flex => ({ measure: () => h, render: () => [] });
  const flexPara = (id: string, value: string, s: Style, align: "left" | "center" | "right" = "left"): Flex => ({
    measure: (cw) => lh(s.sizePt, wrap(value, cw, s).length),
    render: (x, y, cw) => {
      const lines = wrap(value, cw, s);
      return [textNode(id, { x, y, w: cw, h: lh(s.sizePt, lines.length) }, value, lines, s, align)];
    },
  });

  /** A Read the Word panel: the excerpt, then its reference (and "paraphrase" when it is one). */
  const readPanel = (i: number, r: MommyWords["read"][number]): Flex => {
    const refText = r.label ? `${r.ref} · ${r.label}` : r.ref;
    const inner = (cw: number) => cw - 2 * PAD;
    const layout = (cw: number) => {
      const lines = wrap(r.text, inner(cw), bodySt);
      const refLines = refText ? wrap(refText, inner(cw), refSt) : [];
      return { lines, refLines, h: PAD + lh(set.bodyPt, lines.length) + (refLines.length ? 0.03 + lh(refSt.sizePt, refLines.length) : 0) + PAD };
    };
    return {
      measure: (cw) => layout(cw).h,
      render: (x, y, cw) => {
        const l = layout(cw);
        const out: LayoutNode[] = [panel(`dm-read-${i}-panel`, { x, y, w: cw, h: l.h })];
        const th = lh(set.bodyPt, l.lines.length);
        out.push(textNode(`dm-read-${i}`, { x: x + PAD, y: y + PAD, w: inner(cw), h: th }, r.text, l.lines, bodySt, "left"));
        if (l.refLines.length) out.push(textNode(`dm-read-${i}-ref`, { x: x + PAD, y: y + PAD + th + 0.03, w: inner(cw), h: lh(refSt.sizePt, l.refLines.length) }, refText, l.refLines, refSt, "right"));
        return out;
      },
    };
  };

  /** A Fill in the Blank statement: numbered, the blank as a write-on line, the reference under it. */
  const blankItem = (i: number, b: MommyWords["blanks"][number]): Flex => {
    const value = `${i}. ${b.text}`;
    const layout = (cw: number) => {
      const lines = wrap(value, cw, bodySt);
      const refLines = b.ref ? wrap(b.ref, cw, refSt) : [];
      return { lines, refLines, h: lh(set.bodyPt, lines.length) + (refLines.length ? 0.02 + lh(refSt.sizePt, refLines.length) : 0) };
    };
    return {
      measure: (cw) => layout(cw).h,
      render: (x, y, cw) => {
        const l = layout(cw);
        const th = lh(set.bodyPt, l.lines.length);
        const out: LayoutNode[] = [textNode(`dm-blank-${i}`, { x, y, w: cw, h: th }, value, l.lines, bodySt, "left")];
        if (l.refLines.length) out.push(textNode(`dm-blank-${i}-ref`, { x, y: y + th + 0.02, w: cw, h: lh(refSt.sizePt, l.refLines.length) }, b.ref, l.refLines, refSt, "right"));
        return out;
      },
    };
  };

  const writingLines = (id: string, n: number): Flex => ({
    measure: () => n * set.lineSpacingIn,
    render: (x, y, cw) => Array.from({ length: n }, (_, k) => soft(rule(`${id}-${k + 1}`, x, y + (k + 1) * set.lineSpacingIn, x + cw, y + (k + 1) * set.lineSpacingIn, { strokePt: 0.5, color: "line" }))),
  });

  const sections: { id: string; items: Flex[] }[] = [];
  if (w.read.length) sections.push({ id: "read", items: [fixed(label("dm-h-read", "Read the Word")), ...w.read.flatMap((r, i) => [readPanel(i + 1, r), space(0.08)]).slice(0, -1)] });
  if (w.blanks.length) sections.push({ id: "blank", items: [fixed(label("dm-h-blank", "Fill in the Blank")), ...w.blanks.flatMap((b, i) => [blankItem(i + 1, b), space(0.1)]).slice(0, -1)] });
  if (w.reflect.question || w.reflect.lines) sections.push({ id: "reflect", items: [fixed(label("dm-h-reflect", "Listen & Reflect")), ...(w.reflect.question ? [flexPara("dm-reflect", w.reflect.question, bodySt)] : []), writingLines("dm-reflect-line", w.reflect.lines)] });
  if (w.heart) sections.push({ id: "heart", items: [fixed(label("dm-h-heart", "Heart to Heart")), flexPara("dm-heart", w.heart, bodySt, "center")] });

  /** Stack sections into a column: label, items, a sprig between sections. Returns the nodes and how far it reached. */
  const stack = (secs: typeof sections, col: Rect, reserveBottom: number, tag: string) => {
    const out: LayoutNode[] = [];
    let y = col.y;
    secs.forEach((s, k) => {
      if (k > 0) {
        y += 0.06;
        const sp = sprig(`dm-sprig-${tag}-${k}`);
        out.push(...sp.draw(col.x, y, col.w));
        y += sp.h;
      }
      for (const it of s.items) {
        out.push(...it.render(col.x, y, col.w));
        y += it.measure(col.w);
      }
    });
    const limit = col.y + col.h - reserveBottom;
    return { nodes: out, bottom: y, over: y - limit };
  };

  /** The QR placeholder: a soft outlined square with its label, at the bottom of a column. */
  const qrBox = (col: Rect): { nodes: LayoutNode[]; h: number } => {
    if (!w.qr) return { nodes: [], h: 0 };
    const size = Math.min(1.0, col.w * 0.6);
    const capH = lh(refSt.sizePt);
    const h = size + 0.04 + capH;
    const x = col.x + (col.w - size) / 2, y = col.y + col.h - h;
    const box = { ...panel("dm-qr", { x, y, w: size, h: size }), radiusIn: 0.04, strokeHex: "#7A7A7A", strokePt: 0.75 };
    const cap = "QR code here";
    return { nodes: [box, textNode("dm-qr-label", { x: col.x, y: y + size + 0.04, w: col.w, h: capH }, cap, [cap], refSt, "center")], h: h + 0.12 };
  };

  // ---- The declaration (app text): elegant script, or bubble letters to color, across the top of the art side.
  const placeTitle = (area: Rect): number => {
    if (!w.title) return 0;
    const family = w.bubble ? BUBBLE_FONT : MOMMY_SCRIPT_FONT;
    let pt = w.bubble ? 40 : 44;
    const s = (p: number) => st(family, p, w.bubble ? 700 : 400, 0);
    let lines = wrap(w.title, area.w, s(pt));
    while (pt > 18 && (lines.length > 2 || Math.max(...lines.map((l) => m(l, s(pt)))) > area.w)) {
      pt -= 2;
      lines = wrap(w.title, area.w, s(pt));
    }
    const h = (pt * 1.15 * lines.length) / 72;
    nodes.push({ ...textNode("dm-title-title", { x: area.x, y: area.y, w: area.w, h }, w.title, lines, s(pt), "center", { component: "SectionHeader", role: "pageTitle" }), fit: { sizePt: pt, lineHeight: 1.15, lines, trackingEm: 0 }, ...(w.bubble ? { outline: true } : {}) });
    return h + 0.12;
  };

  let art: Rect;
  if (!w.band) {
    const artW = body.w * split;
    const colW = body.w - artW - GAP_X;
    const artX = innerLeft ? body.x : body.x + body.w - artW;
    const colX = innerLeft ? body.x + artW + GAP_X : body.x;
    const titleH = placeTitle({ x: artX, y: body.y, w: artW, h: body.h });
    art = { x: artX, y: body.y + titleH, w: artW, h: body.h - titleH };
    const col = { x: colX, y: body.y, w: colW, h: body.h };
    const qr = qrBox(col);
    const r = stack(sections, col, qr.h, "c");
    nodes.push(...r.nodes, ...qr.nodes);
    if (r.over > 0.01) diagnostics.push({ severity: "warning", rule: "min-writing-area", componentId: "dm-column", message: `The activity column runs ${r.over.toFixed(2)} in past the page. Shorten the activities, use smaller text or tighter writing lines, widen the column, or use the bottom band.`, measurement: { actualIn: +(r.bottom - col.y).toFixed(3), limitIn: +(col.h - qr.h).toFixed(3) } });
  } else {
    // Band: the art across the top, the activities in two columns underneath (the outer one holds the QR box).
    const titleH = placeTitle({ x: body.x, y: body.y, w: body.w, h: body.h });
    const artH = Math.max(1, body.h * split - titleH);
    art = { x: body.x, y: body.y + titleH, w: body.w, h: artH };
    const bandTop = art.y + art.h + 0.08;
    const sp = sprig("dm-sprig-band");
    nodes.push(...sp.draw(body.x, bandTop, body.w));
    const top = bandTop + sp.h;
    const colW = (body.w - GAP_X) / 2;
    const innerX = innerLeft ? body.x : body.x + colW + GAP_X;
    const outerX = innerLeft ? body.x + colW + GAP_X : body.x;
    const inner = { x: innerX, y: top, w: colW, h: body.y + body.h - top };
    const outer = { x: outerX, y: top, w: colW, h: body.y + body.h - top };
    const first = sections.filter((s) => s.id === "read" || s.id === "blank");
    const second = sections.filter((s) => s.id === "reflect" || s.id === "heart");
    const qr = qrBox(outer);
    const a = stack(first, inner, 0, "i");
    const b = stack(second, outer, qr.h, "o");
    nodes.push(...a.nodes, ...b.nodes, ...qr.nodes);
    const over = Math.max(a.over, b.over);
    if (over > 0.01) diagnostics.push({ severity: "warning", rule: "min-writing-area", componentId: "dm-column", message: `The activities run ${over.toFixed(2)} in past the page. Shorten them, use smaller text or tighter writing lines, or give the art less of the page.` });
  }
  nodes.unshift(group("dm-art", "Section", art));
  const metrics = [{ label: "Art area", value: +art.w.toFixed(3), unit: "in" as const, provenance: { geometryClass: "user-design" as const, basis: "inner side of the Mommy page" } }];
  return { nodes, diagnostics, metrics, regions: { mainContent: body, writingArea: art } };
}

export const devotionalMommy: LayoutDefinition = {
  id: "devotional-mommy",
  label: "Devotional Spread: Mommy page",
  family: "journal",
  description: "Art on the inner side, with Read the Word, Fill in the Blank, Listen & Reflect and Heart to Heart down the outer side (or across the bottom).",
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
  fit: minimumAreaFit(4, 5, "Mommy page"),
  solve: (ctx) => [solveDevotionalMommy(ctx)],
};

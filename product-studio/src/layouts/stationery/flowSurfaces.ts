/**
 * PRINTED LISTS and REPEATING RECORDS — the two surfaces whose content is a
 * sequence of whole units (list items, records) that may continue across
 * pages. Each is measured unit by unit (for the paginator) and drawn for the
 * range of units its piece holds; markers and numbers always come from the
 * WHOLE section, so a list's numbering and a record's number run on across a
 * page break unchanged.
 */
import type { Rect } from "../../types/geometry";
import type { LayoutNode } from "../../types/layout";
import type { ListItem, ListMarker } from "../../types/prompts";
import type { StationeryZone } from "../../types/stationery";
import { getLayoutMeasurer, styleForRole } from "../../engines/typography/textMeasure";
import { box, group, lineBoxIn, text } from "../shared/nodes";
import type { LayoutContext } from "../shared/types";
import { fillInRows, SURFACES } from "./surfaces";

// ─── Lists ───────────────────────────────────────────────────────────────────

/** Indent per nesting level. */
const LEVEL_INDENT_IN = 0.25;
const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii", "xiii", "xiv", "xv", "xvi", "xvii", "xviii", "xix", "xx"];
const alpha = (n: number) => { let s = ""; for (let k = n; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(97 + ((k - 1) % 26)) + s; return s; };

/** Each item's marker, numbered per level over the whole list ("1." · "a." · "i."); a deeper level restarts under each parent. */
export function listMarkers(items: ListItem[], marker: ListMarker): string[] {
  const counters: number[] = [];
  return items.map((it) => {
    const level = Math.max(0, it.level ?? 0);
    counters.length = level + 1;
    counters[level] = (counters[level] ?? 0) + 1;
    if (marker === "bullet") return level % 2 ? "◦" : "•";
    if (marker === "checkbox") return "";
    const n = counters[level];
    return level % 3 === 0 ? `${n}.` : level % 3 === 1 ? `${alpha(n)}.` : `${ROMAN[n - 1] ?? n}.`;
  });
}

export type ListLayout = { items: { lines: string[]; marker: string; indentIn: number; markerIn: number; heightIn: number }[] };

/** Every item measured at this width: its wrapped lines (whole words, never cut), marker and height. */
export function measureList(zone: StationeryZone, width: number, ctx: LayoutContext): ListLayout {
  const items = zone.listItems ?? [];
  const marker = zone.listMarker ?? "bullet";
  const markers = listMarkers(items, marker);
  const m = getLayoutMeasurer().measure, st = styleForRole(ctx.typography, "body");
  const line = lineBoxIn(ctx.typography, "body");
  const box = Math.min(line * 0.8, 0.16);
  const markerIn = marker === "checkbox" ? box + ctx.spacing.checkboxGap : Math.max(...markers.map((x) => m(x, st)), m("99.", st)) + ctx.spacing.checkboxGap;
  const gap = ctx.spacing.block / 2;
  return {
    items: items.map((it, i) => {
      const indentIn = Math.max(0, it.level ?? 0) * LEVEL_INDENT_IN;
      const avail = Math.max(0.5, width - indentIn - markerIn);
      const lines: string[] = [];
      for (const para of it.text.split("\n")) {
        let cur = "";
        for (const word of para.split(/\s+/).filter(Boolean)) {
          const next = cur ? `${cur} ${word}` : word;
          if (cur && m(next, st) > avail) { lines.push(cur); cur = word; } else cur = next;
        }
        if (cur || !lines.length) lines.push(cur);
      }
      return { lines, marker: markers[i], indentIn, markerIn, heightIn: lines.length * line + gap };
    }),
  };
}

/** The list items in the zone's range (all of them when it is not split), each with its own marker. */
export function drawList(id: string, rect: Rect, zone: StationeryZone, ctx: LayoutContext): LayoutNode[] {
  const lay = measureList(zone, rect.w, ctx);
  const from = zone.range?.from ?? 0, to = zone.range?.to ?? lay.items.length;
  const line = lineBoxIn(ctx.typography, "body");
  const nodes: LayoutNode[] = [group(id, "Section", rect)];
  let y = rect.y;
  for (let i = from; i < to; i++) {
    const it = lay.items[i];
    const x = rect.x + it.indentIn;
    if ((zone.listMarker ?? "bullet") === "checkbox") {
      const s = Math.min(line * 0.8, 0.16);
      nodes.push(box(`${id}-i${i}-box`, { x, y: y + (line - s) / 2, w: s, h: s }, { component: "Checkbox", strokePt: Math.max(0.5, ctx.pattern.lineWeightPt) }));
    } else {
      nodes.push(text(`${id}-i${i}-marker`, { x, y, w: it.markerIn, h: line }, it.marker, "body", { component: "Text", vAlign: "top" }));
    }
    const t = text(`${id}-i${i}`, { x: x + it.markerIn, y, w: Math.max(0, rect.x + rect.w - x - it.markerIn), h: it.lines.length * line }, it.lines.join(" "), "body", { component: "Text", vAlign: "top", wrap: true });
    t.fit = { sizePt: ctx.typography.roles.body.sizePt, lineHeight: ctx.typography.roles.body.lineHeight, lines: it.lines };
    nodes.push(t);
    y += it.heightIn;
  }
  return nodes;
}

// ─── Repeating records ───────────────────────────────────────────────────────

/** One record's height at this width: its number line, its rows of blanks, padding, and the gap to the next record. */
export function recordHeightIn(zone: StationeryZone, width: number, ctx: LayoutContext): { recordIn: number; gapIn: number; padIn: number; numberIn: number } {
  const padIn = Math.max(ctx.spacing.boxPadding, ctx.spacing.labelToBorderInset);
  const numberIn = lineBoxIn(ctx.typography, "label");
  const rows = fillInRows(zone.recordFields?.length ? zone.recordFields : ["Entry"], Math.max(0.5, width - 2 * padIn), ctx).heightIn;
  return { recordIn: 2 * padIn + numberIn + ctx.spacing.block + rows, gapIn: ctx.spacing.block, padIn, numberIn };
}

/** The records in the zone's range, each in a light outline with its number ("No. 12") and its labelled blanks. */
export function drawRecords(id: string, rect: Rect, zone: StationeryZone, ctx: LayoutContext): LayoutNode[] {
  const { recordIn, gapIn, padIn, numberIn } = recordHeightIn(zone, rect.w, ctx);
  const count = zone.recordCount ?? 1;
  const from = zone.range?.from ?? 0, to = zone.range?.to ?? count;
  const fields = zone.recordFields?.length ? zone.recordFields : ["Entry"];
  const nodes: LayoutNode[] = [group(id, "Section", rect)];
  let y = rect.y;
  for (let i = from; i < to; i++) {
    const n = (zone.recordStart ?? 1) + i;
    const r = { x: rect.x, y, w: rect.w, h: recordIn };
    nodes.push(box(`${id}-r${n}`, r, { component: "Section", stroke: "border", strokePt: Math.max(0.5, ctx.pattern.lineWeightPt), radiusIn: 0.04 }));
    nodes.push(text(`${id}-r${n}-number`, { x: r.x + padIn, y: r.y + padIn, w: r.w - 2 * padIn, h: numberIn }, `${zone.recordPrefix ?? "No."} ${n}`, "label", { component: "SectionHeader", vAlign: "top" }));
    const inner = { x: r.x + padIn, y: r.y + padIn + numberIn + ctx.spacing.block, w: r.w - 2 * padIn, h: recordIn - 2 * padIn - numberIn - ctx.spacing.block };
    nodes.push(...SURFACES["fill-in"](`${id}-r${n}-fields`, inner, { ...zone, surface: "fill-in", fields }, ctx).nodes);
    y += recordIn + gapIn;
  }
  return nodes;
}

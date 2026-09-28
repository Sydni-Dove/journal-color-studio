/**
 * STATIONERY GEOMETRY — converts a recipe's semantic structure into physical
 * rectangles for the page body the frame already solved from the trim,
 * binding and printer (engines/geometry → layouts/shared pageFrame).
 *
 * Pure arithmetic. Inputs: the recipe's zones (order, weight, surface), the
 * creator's semantic choices (space, balance, hidden, order) and the text
 * overheads the typography layer measured. Output: zone rectangles and table
 * column widths — never colors, fonts or decoration.
 *
 * Nothing here is per-trim: research table widths are REFERENCE values,
 * scaled to the usable width of whatever page they land on.
 */
import type { Rect } from "../../types/geometry";
import type { SectionSpace, StationeryCustomization, StationeryPageSpec, StationeryZone, TableColumn } from "../../types/stationery";

/** Semantic space → weight multiplier. */
export const SPACE_FACTOR: Record<SectionSpace, number> = { less: 0.65, standard: 1, more: 1.5 };

/**
 * Smallest writing area a section may be given (inches): two writing lines
 * at the widest standard ruling (wide rule 0.34″ → 0.68″, rounded down).
 */
export const MIN_RESPONSE_IN = 0.6;

/**
 * Share `total` by `weights`, never giving an item less than its minimum: an
 * item whose weighted share falls below its minimum is pinned to it, and the
 * rest is re-shared among the others by weight. Used for section heights and
 * table columns alike. Returns null when the minimums alone exceed the total.
 */
export function shareWithMinimums(total: number, weights: number[], mins: number[]): number[] | null {
  const pinned = new Set<number>();
  let out = weights.map(() => 0);
  for (let pass = 0; pass <= weights.length; pass++) {
    const pinnedTotal = [...pinned].reduce((a, i) => a + mins[i], 0);
    const freeW = weights.reduce((a, w, i) => a + (pinned.has(i) ? 0 : w), 0);
    const k = freeW > 0 ? (total - pinnedTotal) / freeW : 0;
    out = weights.map((w, i) => (pinned.has(i) ? mins[i] : w * k));
    const under = out.findIndex((v, i) => !pinned.has(i) && v + 1e-6 < mins[i]);
    if (under < 0) break;
    pinned.add(under);
  }
  return mins.reduce((a, b) => a + b, 0) > total + 1e-6 ? null : out;
}

/** The zones of one page after the creator's customization (the recipe is never mutated). */
export function effectiveZones(page: StationeryPageSpec, pageIndex: number, c: StationeryCustomization = {}): StationeryZone[] {
  const hidden = new Set(c.hidden ?? []);
  // Only optional sections can be removed.
  const kept = page.zones.filter((z) => !(z.optional && hidden.has(z.key)));
  const order = c.order?.[pageIndex] ?? [];
  const rank = (z: StationeryZone) => {
    const i = order.indexOf(z.key);
    return i < 0 ? order.length + page.zones.indexOf(z) : i;
  };
  // Fill-in rows (dates) stay where the recipe put them: they are page furniture, not reorderable writing sections.
  const fixed = kept.filter((z) => z.surface === "fill-in");
  const flow = kept.filter((z) => z.surface !== "fill-in").sort((a, b) => rank(a) - rank(b));
  const out: StationeryZone[] = [];
  let fi = 0, wi = 0;
  for (const z of kept) out.push(z.surface === "fill-in" ? fixed[fi++] : flow[wi++]);
  return out.map((z) => ({
    ...z,
    label: c.rename?.[z.key] ?? z.label,
    prompt: c.prompts?.[z.key] ?? z.prompt,
    weight: z.surface === "fill-in" ? 0 : (c.balance === "equal" ? 1 : z.weight) * SPACE_FACTOR[c.space?.[z.key] ?? "standard"],
  }));
}

export type ZoneRequest = {
  zone: StationeryZone;
  /** Heading + prompt block (text plus its gap to the writing) the typography layer measured (0 = none). */
  overheadIn: number;
  /** The heading + prompt TEXT alone (the "prompt" side of the prompt : response ratio). Defaults to overheadIn. */
  promptTextIn?: number;
  /** Fixed-height surfaces (fill-in rows): their total height. */
  fixedIn?: number;
  /** Prompt blocks: writing lines requested (fixed); undefined = share the free space. */
  lines?: number;
  /** Prompt blocks: the fewest lines this zone may get (undefined = MIN_RESPONSE_IN of writing). */
  minLines?: number;
  /** Height of one line of this zone's answer area when it differs from the page's writing lines (checklist rows). */
  rowIn?: number;
};

export type ZoneOptions = {
  /** Line-snapped composition: shared zones hold whole lines and the remainder is spread between sections. */
  snapPitch?: number;
  /** The page's writing-line spacing (needed for fixed line counts and minLines). */
  linePitch?: number;
  /** Pages saved before prompt blocks: shared space follows the weights of whole sections (heading included). */
  legacyWeights?: boolean;
};

/** The least height a zone can take (fixed rows, requested lines, or its minimum writing). */
export function minZoneHeight(r: ZoneRequest, linePitch: number): number {
  const row = r.rowIn ?? linePitch;
  if (r.fixedIn !== undefined) return r.fixedIn;
  if (r.lines !== undefined) return r.overheadIn + r.lines * row;
  return r.overheadIn + (r.minLines !== undefined ? r.minLines * row : MIN_RESPONSE_IN);
}

/**
 * Split zones across pages in order: each page takes the zones that fit at
 * their minimum height; the next zone starts a new page (prompts continue on
 * another page rather than getting cramped). With `fewerLines`, a zone with
 * more lines than its minimum first gives up lines to stay on the page. With
 * `flow` off, everything stays on one page and the overflow is reported.
 */
export function paginateZones(reqs: ZoneRequest[], pageHeights: (i: number) => number, gapIn: number, linePitch: number, opts: { flow: boolean; fewerLines?: boolean; maxPages?: number }): { pages: ZoneRequest[][]; overflow: boolean } {
  const pages: ZoneRequest[][] = [[]];
  let used = 0;
  let overflow = false;
  for (const r0 of reqs) {
    let r = r0;
    const cur = pages[pages.length - 1];
    const room = () => pageHeights(pages.length - 1) - used - (cur.length ? gapIn : 0);
    let need = minZoneHeight(r, linePitch);
    if (need > room() + 1e-6 && opts.fewerLines && r.lines !== undefined) {
      const floor = r.minLines ?? DEFAULT_MIN_LINES_GEOMETRY;
      const fit = Math.floor((room() - r.overheadIn) / (r.rowIn ?? linePitch) + 1e-6);
      if (fit >= floor && fit < r.lines) {
        r = { ...r, lines: fit };
        need = minZoneHeight(r, linePitch);
      }
    }
    if (need > room() + 1e-6 && cur.length && opts.flow && pages.length < (opts.maxPages ?? Infinity)) {
      pages.push([r]);
      used = need;
      continue;
    }
    if (need > room() + 1e-6) overflow = true;
    used += need + (cur.length ? gapIn : 0);
    cur.push(r);
  }
  return { pages, overflow };
}
const DEFAULT_MIN_LINES_GEOMETRY = 2;

export type ResolvedZone = {
  zone: StationeryZone;
  rect: Rect;
  /** Heading + prompt area (null when the zone has none). */
  head: Rect | null;
  /** The writable surface. */
  response: Rect;
};

export type ZoneResolution = { zones: ResolvedZone[]; problems: string[] };

/**
 * Stack zones down the body. Fixed rows (fill-ins) and each section's heading
 * + prompt take their measured height first; the gaps between sections are
 * subtracted; the remaining WRITING space is shared by weight (the recipe's
 * proportions, the creator's space choices, or equal shares).
 *
 * Checks (the trim is reported too small, never squeezed):
 *   - every writing area keeps at least MIN_RESPONSE_IN;
 *   - with a ratio (research: prompt : response ≈ 1 : 5) the page's writing
 *     space is at least `ratio` × the space its headings and prompts take.
 */
/** Line-snapped pages: the fewest writing lines a section may hold. */
export const MIN_SNAPPED_LINES = 2;

/**
 * Whole writing lines per section: each section's share floored to whole
 * lines at `pitch` (never below MIN_SNAPPED_LINES), then the spare whole lines
 * handed back one at a time to the section furthest below its weighted share.
 * Line counts therefore shrink proportionally on smaller trims while the line
 * spacing itself never changes. Returns null when the minimums do not fit.
 */
export function snapToLines(total: number, shares: number[], pitch: number): number[] | null {
  const lines = shares.map((s) => Math.max(MIN_SNAPPED_LINES, Math.floor(s / pitch + 1e-6)));
  let spare = Math.floor((total - lines.reduce((a, n) => a + n * pitch, 0)) / pitch + 1e-6);
  if (spare < 0) return null;
  while (spare-- > 0) {
    let best = 0;
    shares.forEach((s, i) => {
      if (s - lines[i] * pitch > shares[best] - lines[best] * pitch) best = i;
    });
    lines[best]++;
  }
  return lines;
}

export function resolveZones(reqs: ZoneRequest[], body: Rect, gapIn: number, ratio = 0, snapPitchOrOpts: number | ZoneOptions = 0): ZoneResolution {
  const opts: ZoneOptions = typeof snapPitchOrOpts === "number" ? { snapPitch: snapPitchOrOpts } : snapPitchOrOpts;
  const snapPitch = opts.snapPitch ?? 0;
  const pitch = opts.linePitch ?? snapPitch;
  const problems: string[] = [];
  // Fixed rows and fixed line counts are set; the rest of the writing is shared.
  const isShared = (r: ZoneRequest) => r.fixedIn === undefined && r.lines === undefined;
  const rowOf = (r: ZoneRequest) => r.rowIn ?? pitch;
  const fixedH = (r: ZoneRequest) => (r.fixedIn !== undefined ? r.fixedIn : r.lines !== undefined ? r.overheadIn + r.lines * rowOf(r) : 0);
  const fixed = reqs.reduce((a, r) => a + fixedH(r), 0);
  const overhead = reqs.reduce((a, r) => a + (isShared(r) ? r.overheadIn : 0), 0);
  const promptText = reqs.reduce((a, r) => a + (r.fixedIn === undefined ? (r.promptTextIn ?? r.overheadIn) : 0), 0);
  const fixedWriting = reqs.reduce((a, r) => a + (r.fixedIn === undefined && r.lines !== undefined ? r.lines * rowOf(r) : 0), 0);
  const gaps = gapIn * Math.max(0, reqs.length - 1);
  const writing = body.h - fixed - gaps - overhead;
  const flexIdx = reqs.map((r, i) => (isShared(r) ? i : -1)).filter((i) => i >= 0);
  const minOf = (r: ZoneRequest) => (r.minLines !== undefined ? r.minLines * rowOf(r) : MIN_RESPONSE_IN);
  let shareOf: Map<number, number>;
  if (opts.legacyWeights) {
    // As before prompt blocks: each whole section (heading included) gets its weighted share of the free height.
    const free = Math.max(0, writing + overhead);
    const totalW = flexIdx.reduce((a, i) => a + reqs[i].zone.weight, 0) || 1;
    shareOf = new Map(flexIdx.map((i) => [i, Math.max(0, (free * reqs[i].zone.weight) / totalW - reqs[i].overheadIn)]));
  } else {
    // Every writing area gets at least its minimum; the rest follows the weights.
    const shares = shareWithMinimums(Math.max(0, writing), flexIdx.map((i) => reqs[i].zone.weight), flexIdx.map((i) => minOf(reqs[i])));
    shareOf = new Map(flexIdx.map((i, k) => [i, shares ? shares[k] : (Math.max(0, writing) * reqs[i].zone.weight) / (flexIdx.reduce((a, j) => a + reqs[j].zone.weight, 0) || 1)]));
  }
  // Line-snapped composition: whole lines per section; the part-line remainder is spread evenly between sections.
  let gap = gapIn;
  if (snapPitch > 0 && writing >= 0) {
    const lines = flexIdx.length ? snapToLines(writing, flexIdx.map((i) => shareOf.get(i)!), snapPitch) : [];
    if (!lines) problems.push(`The sections need at least ${MIN_SNAPPED_LINES} writing lines each; this page has room for ${Math.floor(writing / snapPitch)} lines in all.`);
    else {
      flexIdx.forEach((i, k) => shareOf.set(i, lines[k] * snapPitch));
      const residual = writing - lines.reduce((a, n) => a + n * snapPitch, 0);
      if (reqs.length > 1) gap = gapIn + residual / (reqs.length - 1);
    }
  }
  // Equal share: every "equal" section gets the same whole number of lines — from the whole free space, or
  // (when some sections fill) from the equal sections' own share; the "fill" sections take the rest.
  const eq = flexIdx.filter((i) => reqs[i].zone.equal);
  if (eq.length && !opts.legacyWeights && pitch > 0 && writing >= 0) {
    const fill = flexIdx.filter((i) => !reqs[i].zone.equal);
    const pool = fill.length ? eq.reduce((a, i) => a + (shareOf.get(i) ?? 0), 0) : Math.max(0, writing);
    const perRound = eq.reduce((a, i) => a + rowOf(reqs[i]), 0);
    const n = Math.max(0, Math.floor(pool / perRound + 1e-6));
    eq.forEach((i) => shareOf.set(i, n * rowOf(reqs[i])));
    // Only equal sections: the part-line left over is spread between the sections, not pooled at the bottom.
    if (!fill.length && reqs.length > 1) gap += (Math.max(0, writing) - n * perRound) / (reqs.length - 1);
    if (fill.length) {
      const rest = Math.max(0, writing - n * perRound);
      const totalW = fill.reduce((a, i) => a + reqs[i].zone.weight, 0) || 1;
      fill.forEach((i) => shareOf.set(i, (rest * reqs[i].zone.weight) / totalW));
    }
  }
  let y = body.y;
  const zones = reqs.map((r, idx): ResolvedZone => {
    if (r.fixedIn !== undefined) {
      const rect = { x: body.x, y, w: body.w, h: r.fixedIn };
      y += r.fixedIn + gap;
      return { zone: r.zone, rect, head: null, response: rect };
    }
    const responseH = r.lines !== undefined ? r.lines * rowOf(r) : shareOf.get(idx) ?? 0;
    const rect = { x: body.x, y, w: body.w, h: r.overheadIn + responseH };
    y += rect.h + gap;
    const head = r.overheadIn > 0 ? { x: rect.x, y: rect.y, w: rect.w, h: r.overheadIn } : null;
    const response = { x: rect.x, y: rect.y + r.overheadIn, w: rect.w, h: responseH };
    if (isShared(r) && !snapPitch && !opts.legacyWeights && responseH + 1e-6 < minOf(r)) problems.push(`"${r.zone.label || r.zone.key}" gets ${responseH.toFixed(2)}" of writing space; it needs at least ${minOf(r).toFixed(2)}".`);
    return { zone: r.zone, rect, head, response };
  });
  if (writing < -1e-6) problems.push(`Headings, fixed rows and requested lines need ${(fixed + gaps + overhead).toFixed(2)}" but the page body is ${body.h.toFixed(2)}".`);
  else if (ratio > 0 && promptText > 0 && Math.max(0, writing) + fixedWriting + 1e-6 < ratio * promptText) {
    const w = Math.max(0, writing) + fixedWriting;
    problems.push(`Writing space is ${(w / promptText).toFixed(1)}× the prompt space; this structure needs at least ${ratio}× (prompt : response 1 : ${ratio}).`);
  }
  return { zones, problems };
}

export type ResolvedColumn = { column: TableColumn; x: number; w: number };

/**
 * Table columns: research reference widths scaled to the available width.
 * Every column keeps the research proportions unless that would make it
 * narrower than its heading (`minWidthOf`); such a column gets exactly its
 * minimum and the difference comes proportionally from the others. If the
 * minimums alone exceed the width, the trim is too narrow for the table.
 */
export function resolveColumns(columns: TableColumn[], x: number, width: number, minWidthOf: (c: TableColumn) => number): { columns: ResolvedColumn[]; scale: number; problems: string[] } {
  const mins = columns.map(minWidthOf);
  const scale = width / columns.reduce((a, c) => a + c.referenceWidthIn, 0);
  const shared = shareWithMinimums(width, columns.map((c) => c.referenceWidthIn), mins);
  const widths = shared ?? columns.map((c) => c.referenceWidthIn * scale);
  const problems = shared ? [] : [`The table's column headings need ${mins.reduce((a, b) => a + b, 0).toFixed(2)}" but the page is ${width.toFixed(2)}" wide.`];
  let cx = x;
  const out = columns.map((column, i) => {
    const r = { column, x: cx, w: widths[i] };
    cx += widths[i];
    return r;
  });
  return { columns: out, scale, problems };
}

/** Whole table rows that fit under the header row. */
export function tableRows(heightIn: number, headerIn: number, rowIn: number): number {
  return Math.max(0, Math.floor((heightIn - headerIn + 1e-6) / rowIn));
}

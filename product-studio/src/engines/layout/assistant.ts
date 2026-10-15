/**
 * SMART LAYOUT ASSISTANT — when content doesn't fit comfortably, measure why and
 * which professional alternatives would fit better. Deterministic: the same
 * product always gives the same findings and suggestions.
 *
 * Nothing here lays out or draws anything of its own. A product is measured by
 * resolving it and solving its pages with the studio's own engines (the same
 * pages preview and print draw); an alternative is a transform of the product
 * (never of its content), measured the same way, and kept only when its
 * measurements are better.
 *
 *   detects       crowded table columns (headings set smaller or failing), headings
 *                 squeezed or wrapping too much, mostly empty pages, content that
 *                 can't fit (the layout's own errors), a wide table on a portrait page
 *   alternatives  the other orientation; columns sized to what they hold; a taller
 *                 heading row; a wide table split across facing pages; record cards
 *                 instead of a very wide table; rows / records that fill each page;
 *                 for a devotional, its other designs
 *
 * Every alternative keeps all content: no words, fields, columns, entries or
 * records are removed; deliberate choices (set column widths, typed row counts)
 * are never changed without the maker choosing the alternative.
 */
import { resolveDocument, solvePage, geometryFor, type ResolvedDocument } from "../document/resolve";
import { refitPageFilling } from "../recipe/fitRows";
import { DEVOTIONAL_STRUCTURES, matchRoles, withDevotionalStructure } from "../../presets/devotionalStructures";
import { sectionName, type PromptBlock } from "../../types/prompts";
import type { ValueType } from "../../types/document";
import type { BookNode, BookStep } from "../../types/recipe";
import type { ProductProject } from "../../types/project";
import type { LayoutNode, SolvedPage } from "../../types/layout";

// ─── Measuring ──────────────────────────────────────────────────────────────

export type LayoutMeasures = {
  /** Physical pages, and the labelled filler pages among them. */
  pages: number;
  fillerPages: number;
  /** Errors the layout itself reports (content that can't fit, columns that can't fit…). */
  errors: number;
  /** Table columns whose heading had to be set smaller than the label size (or still doesn't fit). */
  crowdedColumns: number;
  /** The narrowest table column that holds writing (not the "No." column), in inches. */
  narrowestColumnIn: number | null;
  /** Headings set noticeably smaller than their style, or wrapping onto more than two lines. */
  squeezedHeadings: number;
  /** Content pages that are mostly empty (under a quarter of the page used). */
  emptyPages: number;
  /** Share of the content area left unused, averaged over the measured pages (0–1). */
  unusedShare: number;
};

/** Where a finding is, for the maker: a page number and the section's name. */
export type Finding = { kind: "crowded-columns" | "squeezed-heading" | "empty-page" | "cannot-fit" | "orientation"; message: string; page?: number };

type Sample = { doc: ResolvedDocument; pages: { i: number; s: SolvedPage }[] };

/** The pages to measure: every page of the first two occurrences of each page in the book (all of it when short). */
function sample(doc: ResolvedDocument): number[] {
  const pages = doc.recipe.pages;
  if (pages.length <= 60) return pages.map((_, i) => i);
  const seen = new Map<string, Set<string>>();
  const out: number[] = [];
  pages.forEach((p, i) => {
    if (p.filler) return;
    const base = p.key.replace(/~\d+$/, "").replace(/:\d$/, "");
    const bases = seen.get(p.recipeItemId) ?? new Set<string>();
    if (!bases.has(base) && bases.size >= 2) return;
    bases.add(base);
    seen.set(p.recipeItemId, bases);
    out.push(i);
  });
  return out;
}

const HEADING_ROLES = new Set(["coverTitle", "productTitle", "monthTitle", "weekTitle", "pageTitle", "sectionHeading", "subheading"]);
const textNodes = (s: SolvedPage) => s.nodes.filter((n): n is Extract<LayoutNode, { type: "text" }> => n.type === "text");
const isTableHead = (id: string) => /-h-(no|c\d+)$/.test(id);

function measureSample(doc: ResolvedDocument): { measures: LayoutMeasures; findings: Finding[]; sample: Sample } {
  const idx = sample(doc);
  const pages = idx.map((i) => ({ i, s: solvePage(doc, i) }));
  const findings: Finding[] = [];
  const roles = doc.typography.roles;
  const inset = doc.spacing.labelToBorderInset;
  const crowded = new Set<string>();
  const squeezed = new Set<string>();
  let narrowest: number | null = null;
  let errors = doc.recipe.diagnostics.filter((d) => d.severity === "error").length;
  let empty = 0, unusedSum = 0, unusedN = 0;
  for (const { i, s } of pages) {
    const pg = doc.recipe.pages[i];
    if (pg.filler) continue;
    const where = pg.pageNumber;
    for (const d of s.diagnostics) if (d.severity === "error") {
      errors++;
      // Once per problem (the same page design repeats it on every copy), the first page it happens on.
      if (!findings.some((f) => f.kind === "cannot-fit" && f.message === d.message) && findings.filter((f) => f.kind === "cannot-fit").length < 3) findings.push({ kind: "cannot-fit", message: d.message, page: where });
    }
    for (const n of textNodes(s)) {
      const key = `${pg.recipeItemId}:${n.id.replace(/^[a-z]+\d+-/, "")}`;
      if (isTableHead(n.id)) {
        if (!/-h-no$/.test(n.id)) narrowest = Math.min(narrowest ?? Infinity, n.rect.w + 2 * inset);
        if (n.fit && (n.fit.failed || n.fit.sizePt < roles.label.sizePt - 0.01) && !crowded.has(key)) {
          crowded.add(key);
          findings.push({ kind: "crowded-columns", message: `The column “${n.text}” is too narrow for its heading on page ${where}, so the heading is set smaller.`, page: where });
        }
        continue;
      }
      // Headings only (titles and section headings) — body text and prompts wrap by design.
      if (!HEADING_ROLES.has(n.role)) continue;
      const role = roles[n.role];
      if (n.fit && role && (n.fit.failed || n.fit.sizePt < role.sizePt * 0.9 || n.fit.lines.length > 2) && !/-n\d+$/.test(n.id) && !squeezed.has(key)) {
        squeezed.add(key);
        findings.push({ kind: "squeezed-heading", message: `“${n.text.slice(0, 60)}” on page ${where} is ${n.fit.failed ? "too long for its space" : n.fit.lines.length > 2 ? `wrapping onto ${n.fit.lines.length} lines` : "set smaller than its style"}.`, page: where });
      }
    }
    // How much of the content area holds something (a writing area counts as used: that space is the point).
    const body = s.regions?.mainContent ?? geometryFor(doc, pg, i).safeRect;
    const bottom = Math.max(body.y, ...s.nodes.filter((n) => n.rect.h < body.h * 0.98 && n.rect.y >= body.y - 1e-6 && n.rect.y < body.y + body.h).map((n) => n.rect.y + n.rect.h));
    const used = Math.min(1, Math.max(0, (bottom - body.y) / Math.max(1e-6, body.h)));
    unusedSum += 1 - used;
    unusedN++;
    const last = i === doc.recipe.pages.length - 1;
    if (used < 0.25 && !last) {
      empty++;
      if (findings.filter((f) => f.kind === "empty-page").length < 3) findings.push({ kind: "empty-page", message: `Page ${where} is mostly empty (${Math.round((1 - used) * 100)}% unused).`, page: where });
    }
  }
  return {
    measures: {
      pages: doc.recipe.pageCount,
      fillerPages: doc.recipe.pages.filter((p) => p.filler).length,
      errors,
      crowdedColumns: crowded.size,
      narrowestColumnIn: narrowest === null || !Number.isFinite(narrowest) ? null : narrowest,
      squeezedHeadings: squeezed.size,
      emptyPages: empty,
      unusedShare: unusedN ? unusedSum / unusedN : 0,
    },
    findings,
    sample: { doc, pages },
  };
}

/** A product's layout measurements (and what is wrong with it), from its own solved pages. */
export function measureLayout(project: ProductProject): { measures: LayoutMeasures; findings: Finding[] } {
  const { measures, findings } = measureSample(resolveDocument(project));
  return { measures, findings };
}

/** Lower is better. Errors outweigh everything; then crowding, squeezed headings, empty pages, fillers, pages. */
export const layoutScore = (m: LayoutMeasures) =>
  m.errors * 1000 + m.crowdedColumns * 60 + m.squeezedHeadings * 25 + m.emptyPages * 30 + m.fillerPages * 4 + m.pages + m.unusedShare * 10;

// ─── Alternatives ───────────────────────────────────────────────────────────

export type Alternative = {
  id: string;
  title: string;
  /** Why it is suggested, in plain words. */
  reason: string;
  /** What changes, measured: "Crowded columns: 3 → 0", "Pages: 28 → 24". */
  outcome: string[];
  before: LayoutMeasures;
  after: LayoutMeasures;
  /** The page to compare (before / after). */
  previewBefore: number;
  previewAfter: number;
  /** The product with the alternative applied (content unchanged). */
  apply: (p: ProductProject) => ProductProject;
};

type Candidate = { id: string; title: string; reason: string; apply: (p: ProductProject) => ProductProject; focus?: (doc: ResolvedDocument) => number };

const stepsOf = (nodes: BookNode[]): BookStep[] => nodes.flatMap((n) => (n.kind === "group" ? stepsOf(n.children) : [n]));
const isTable = (b: PromptBlock) => b.responseStyle === "table" && (b.kind ?? "prompt") === "prompt";
const mapSteps = (nodes: BookNode[], fn: (s: BookStep) => BookStep | BookStep[]): BookNode[] =>
  nodes.flatMap((n) => (n.kind === "group" ? [{ ...n, children: mapSteps(n.children, fn) }] : ([] as BookNode[]).concat(fn(n))));
const withStructure = (p: ProductProject, structure: BookNode[]): ProductProject => ({ ...p, recipe: { ...p.recipe, structure } });
const firstPageOf = (doc: ResolvedDocument, stepId: string) => Math.max(0, doc.recipe.pages.findIndex((x) => x.recipeItemId === stepId && !x.filler));

/** What a column holds, guessed from its heading (for "size columns to what they hold"). */
export function guessColumnType(label: string): ValueType {
  const l = label.toLowerCase();
  if (/\b(notes?|comments?|description|details|remarks)\b/.test(l)) return "longText";
  if (/\b(cost|price|amount|total|value|paid|\$)/.test(l)) return "currency";
  if (/\b(qty|quantity|count|units?|on hand|in stock)\b/.test(l)) return "quantity";
  if (/\b(date|due|when|counted|expires?)\b/.test(l)) return "date";
  if (/\b(time|hour|start|end)\b/.test(l)) return "time";
  if (/^(no\.?|#|num|number|reorder( point| at)?|min|max|level)$/.test(l.trim()) || /\breorder\b/.test(l)) return "number";
  if (/\b(done|check|ok|yes|✓)\b/.test(l)) return "boolean";
  if (/\b(sign|signature|initials)\b/.test(l)) return "signature";
  return "text";
}

function candidates(p: ProductProject, base: { measures: LayoutMeasures; findings: Finding[] }, doc: ResolvedDocument): Candidate[] {
  const out: Candidate[] = [];
  const structure = p.recipe.structure ?? [];
  const steps = stepsOf(structure);
  const tables = steps.flatMap((s) => (s.promptSet?.blocks ?? []).filter(isTable).map((b) => ({ s, b })));
  const portrait = p.dimensions.orientation !== "landscape";
  const wide = tables.filter(({ b }) => (b.table?.columns.length ?? 0) >= 6);

  // The other orientation (page-filling sections refit to it).
  if (base.measures.crowdedColumns || base.measures.errors || base.findings.some((f) => f.kind === "orientation") || (portrait && wide.length) || (!portrait && !tables.length)) {
    const to = portrait ? "landscape" : "portrait";
    out.push({
      id: `orientation-${to}`,
      title: to === "landscape" ? "Turn the pages sideways (landscape)" : "Turn the pages upright (portrait)",
      reason: to === "landscape" ? "A wide table gets more room across the page." : "Text-led pages read better on an upright page.",
      apply: (q) => refitPageFilling({ ...q, dimensions: { ...q.dimensions, orientation: to } }),
    });
  }

  for (const { s, b } of tables) {
    const t = b.table!;
    const name = sectionName(b);
    // Columns sized to what they hold — only for a table that doesn't say yet (the maker's own choices stay).
    if (!t.columnTypes?.some(Boolean) && t.columns.length >= 3) {
      const types = t.columns.map(guessColumnType);
      if (types.some((x) => x !== "text"))
        out.push({
          id: `size-columns:${s.id}:${b.id}`,
          title: `Size the columns of “${name}” to what they hold`,
          reason: "Numbers, dates and amounts need little room; names and notes need more. Equal columns waste space in some and crowd others.",
          apply: (q) => withStructure(q, mapSteps(q.recipe.structure ?? [], (x) => (x.id !== s.id ? x : { ...x, promptSet: { ...x.promptSet!, blocks: x.promptSet!.blocks.map((y) => (y.id === b.id ? { ...y, table: { ...y.table!, columnTypes: types } } : y)) } }))),
          focus: (doc) => firstPageOf(doc, s.id),
        });
    }
    // A taller heading row: headings wrap onto three lines instead of being set smaller.
    if (t.headerLines !== 3 && base.measures.crowdedColumns)
      out.push({
        id: `heading-row:${s.id}:${b.id}`,
        title: `Let the column headings of “${name}” wrap onto three lines`,
        reason: "Long headings keep their size and wrap, instead of being set smaller.",
        apply: (q) => withStructure(q, mapSteps(q.recipe.structure ?? [], (x) => (x.id !== s.id ? x : { ...x, promptSet: { ...x.promptSet!, blocks: x.promptSet!.blocks.map((y) => (y.id === b.id ? { ...y, table: { ...y.table!, headerLines: 3 as const } } : y)) } }))),
        focus: (doc) => firstPageOf(doc, s.id),
      });
    // A wide table split across facing pages: the first columns on the left page, the rest on the right — same rows, same numbers.
    // Only when each half fits on one page (or follows the page): halves that ran onto more pages wouldn't face each other.
    const onePage = b.fillPage || doc.recipe.pages.filter((x) => x.recipeItemId === s.id).every((x) => (x.flowCount ?? 1) === 1);
    if (t.columns.length >= 6 && !t.columnWidths?.some((w) => w) && onePage && doc.recipe.pages.some((x) => x.side !== "single"))
      out.push({ id: `split:${s.id}:${b.id}`, title: `Split “${name}” across facing pages`, reason: `${t.columns.length} columns are a lot for one page: the first ${Math.ceil(t.columns.length / 2)} go on the left page and the rest on the right, with the same rows${t.numbering ? " and numbers" : ""} on both.`, apply: (q) => refitPageFilling(splitAcrossSpread(q, s.id, b.id)), focus: (doc) => firstPageOf(doc, s.id) });
    // Record cards instead of a very wide table (every column becomes a labelled blank).
    if (t.columns.length >= 8 && t.numbering)
      out.push({
        id: `records:${s.id}:${b.id}`,
        title: `Use record cards instead of the table “${name}”`,
        reason: "With this many columns, a card per item — every column a labelled blank — gives each one room to write.",
        apply: (q) => refitPageFilling(withStructure(q, mapSteps(q.recipe.structure ?? [], (x) => (x.id !== s.id ? x : { ...x, promptSet: { ...x.promptSet!, blocks: x.promptSet!.blocks.map((y) => (y.id === b.id ? tableAsRecords(y) : y)) } })))),
        focus: (doc) => firstPageOf(doc, s.id),
      });
    // Rows that fill each page (a numbered table with a typed count, when pages are left mostly empty).
    if (t.numbering && !b.fillPage && base.measures.emptyPages)
      out.push({
        id: `fill-rows:${s.id}:${b.id}`,
        title: `Let the rows of “${name}” fill each page`,
        reason: "The table's rows spill onto a mostly empty page; filling each page uses every page fully (the numbering continues as before).",
        apply: (q) => refitPageFilling(withStructure(q, mapSteps(q.recipe.structure ?? [], (x) => (x.id !== s.id ? x : { ...x, promptSet: { ...x.promptSet!, blocks: x.promptSet!.blocks.map((y) => (y.id === b.id ? { ...y, fillPage: true } : y)) } })))),
        focus: (doc) => firstPageOf(doc, s.id),
      });
  }
  for (const s of steps)
    for (const b of (s.promptSet?.blocks ?? []).filter((x) => x.kind === "record" && !x.fillPage))
      if (base.measures.emptyPages)
        out.push({
          id: `fill-records:${s.id}:${b.id}`,
          title: `Let “${sectionName(b)}” fill each page`,
          reason: "As many whole records as fit on each page, so no page is left mostly empty.",
          apply: (q) => refitPageFilling(withStructure(q, mapSteps(q.recipe.structure ?? [], (x) => (x.id !== s.id ? x : { ...x, promptSet: { ...x.promptSet!, blocks: x.promptSet!.blocks.map((y) => (y.id === b.id ? { ...y, fillPage: true } : y)) } })))),
          focus: (doc) => firstPageOf(doc, s.id),
        });

  // A devotional's other designs (the entries are never touched) — only for a list that reads as
  // devotional days (Scripture, or a teaching with questions or a prayer), not any list of entries.
  const entries = structure.find((n): n is Extract<BookNode, { kind: "group" }> => n.kind === "group" && !!n.entries);
  const list = entries && p.data?.collections.find((c) => c.id === entries.entries!.collectionId);
  const roles = list ? matchRoles(list).map : {};
  if (list && (roles.scripture || (roles.teaching && (roles.questions || roles.prayer)))) {
    const current = DEVOTIONAL_STRUCTURES.find((d) => JSON.stringify(withDevotionalStructure(structure, d.id, list)) === JSON.stringify(structure))?.id;
    for (const d of DEVOTIONAL_STRUCTURES)
      if (d.id !== current) out.push({ id: `devotional:${d.id}`, title: `Devotional design: ${d.label}`, reason: d.description, apply: (q) => withStructure(q, withDevotionalStructure(q.recipe.structure, d.id, list)) });
  }
  return out;
}

/** A table as numbered record cards: every column a labelled blank, one card per row. */
function tableAsRecords(b: PromptBlock): PromptBlock {
  const t = b.table!;
  return { id: b.id, kind: "record", label: b.label, ...(b.prompt ? { prompt: b.prompt } : {}), recordFields: [...t.columns], recordCount: Math.max(1, t.rows ?? 1), fillPage: true, ...(t.numbering ? { numbering: { ...t.numbering, prefix: t.numbering.prefix ?? "No." } } : {}) };
}

/**
 * A wide table across a two-page spread: the page keeps the first half of the columns; a page after
 * every copy of it holds the rest, with the same rows and (separately counted, so equal) numbers.
 */
export function splitAcrossSpread(p: ProductProject, stepId: string, blockId: string): ProductProject {
  return withStructure(
    p,
    mapSteps(p.recipe.structure ?? [], (s) => {
      if (s.id !== stepId) return s;
      const blocks = s.promptSet!.blocks;
      const b = blocks.find((x) => x.id === blockId)!;
      const t = b.table!;
      const half = Math.ceil(t.columns.length / 2);
      const part = (from: number, to: number, n: 1 | 2): PromptBlock => ({
        ...b,
        id: n === 1 ? b.id : `${b.id}-2`,
        label: `${b.label.trim() || "Table"} (${n} of 2: ${t.columns[from]} – ${t.columns[to - 1]})`,
        fillPage: b.fillPage,
        // Both halves print the same rows (the smallest count that fits either page).
        ...(b.fillPage ? { fillGroup: `${b.id}-spread` } : {}),
        table: {
          ...t,
          columns: t.columns.slice(from, to),
          ...(t.columnTypes ? { columnTypes: t.columnTypes.slice(from, to) } : {}),
          ...(t.columnWidths ? { columnWidths: t.columnWidths.slice(from, to) } : {}),
          // Both halves keep a full-height heading row, so their rows stay level across the spread.
          headerFull: true,
          ...(t.numbering ? { numbering: { ...t.numbering, sequence: `${t.numbering.sequence ?? b.id}${n === 2 ? "-2" : ""}` } } : {}),
        },
      });
      const left: BookStep = { ...s, start: "verso", promptSet: { ...s.promptSet!, blocks: blocks.map((x) => (x.id === blockId ? part(0, half, 1) : x)) } };
      // The facing page: the rest of the columns, with the same sections around them (a copy of the page's other
      // sections, e.g. its Location / Date row), so both halves have the same room — the same rows, the same numbers.
      const right: BookStep = {
        ...s, id: `${s.id}-cols2`, title: `${s.title ?? "Table"} (continued)`, cadence: { type: "after-module", moduleId: s.id }, copies: 1, start: "any",
        promptSet: { ...s.promptSet!, blocks: blocks.map((x) => (x.id === blockId ? part(half, t.columns.length, 2) : { ...x, id: `${x.id}-2` })) },
      };
      return [left, right];
    }),
  );
}

/** Every copy of a split table: its left half on a left page, its right half on the facing right page, each on one page. */
function spreadHolds(doc: ResolvedDocument, stepId: string): boolean {
  const pages = doc.recipe.pages.filter((x) => !x.filler && (x.recipeItemId === stepId || x.recipeItemId === `${stepId}-cols2`));
  if (pages.some((x) => (x.flowCount ?? 1) > 1) || pages.length % 2) return false;
  for (let k = 0; k < pages.length; k += 2)
    if (pages[k].recipeItemId !== stepId || pages[k + 1].recipeItemId !== `${stepId}-cols2` || pages[k].side !== "verso" || pages[k + 1].pageNumber !== pages[k].pageNumber + 1) return false;
  return true;
}

/** What changed, measured, in plain words. */
function outcome(a: LayoutMeasures, b: LayoutMeasures): string[] {
  const out: string[] = [];
  const row = (label: string, x: number, y: number, fmt = (v: number) => String(v)) => x !== y && out.push(`${label}: ${fmt(x)} → ${fmt(y)}`);
  row("Layout problems", a.errors, b.errors);
  row("Crowded columns", a.crowdedColumns, b.crowdedColumns);
  if (a.narrowestColumnIn !== null && b.narrowestColumnIn !== null && Math.abs(a.narrowestColumnIn - b.narrowestColumnIn) > 0.01) row("Narrowest column", a.narrowestColumnIn, b.narrowestColumnIn, (v) => `${v.toFixed(2)}"`);
  row("Squeezed headings", a.squeezedHeadings, b.squeezedHeadings);
  row("Mostly empty pages", a.emptyPages, b.emptyPages);
  row("Pages", a.pages, b.pages);
  row("Filler pages", a.fillerPages, b.fillerPages);
  if (Math.abs(a.unusedShare - b.unusedShare) >= 0.05) row("Unused space", a.unusedShare, b.unusedShare, (v) => `${Math.round(v * 100)}%`);
  return out;
}

export type LayoutReview = { measures: LayoutMeasures; findings: Finding[]; alternatives: Alternative[] };

/**
 * Review a product's layout: its measurements, what is wrong, and the alternatives that measure
 * better (best first). Each alternative is measured on its own solved pages.
 */
export function reviewLayout(project: ProductProject, opts: { max?: number } = {}): LayoutReview {
  const doc = resolveDocument(project);
  const base = measureSample(doc);
  const findings = [...base.findings];
  const tables = stepsOf(project.recipe.structure ?? []).flatMap((s) => (s.promptSet?.blocks ?? []).filter(isTable).map((b) => ({ s, b })));
  const widest = tables.reduce((m, { b }) => Math.max(m, b.table?.columns.length ?? 0), 0);
  if (project.dimensions.orientation !== "landscape" && (widest >= 7 || base.measures.crowdedColumns))
    findings.push({ kind: "orientation", message: `A table with ${widest} columns on an upright (portrait) page.` });
  const score = layoutScore(base.measures);
  const alts: Alternative[] = [];
  for (const c of candidates(project, base, doc)) {
    let next: ProductProject;
    try {
      next = c.apply(project);
    } catch {
      continue;
    }
    const after = measureSample(resolveDocument(next));
    if (layoutScore(after.measures) >= score - 1e-6) continue;
    // A split table must face itself: every page of both halves on one page, the halves on a left / right pair.
    if (c.id.startsWith("split:") && !spreadHolds(after.sample.doc, c.id.split(":")[1])) continue;
    const doc2 = after.sample.doc;
    alts.push({
      id: c.id, title: c.title, reason: c.reason, outcome: outcome(base.measures, after.measures),
      before: base.measures, after: after.measures,
      previewBefore: c.focus?.(doc) ?? Math.max(0, doc.recipe.pages.findIndex((x) => !x.filler)),
      previewAfter: c.focus?.(doc2) ?? Math.max(0, doc2.recipe.pages.findIndex((x) => !x.filler)),
      apply: c.apply,
    });
  }
  alts.sort((a, b) => layoutScore(a.after) - layoutScore(b.after) || a.id.localeCompare(b.id));
  return { measures: base.measures, findings, alternatives: alts.slice(0, opts.max ?? 6) };
}

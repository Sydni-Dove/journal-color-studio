/**
 * PROPOSAL → PRODUCT — a checked document specification becomes an ordinary
 * product, made only of what the studio already has: guided pages (their
 * titles print), the universal sections (headings, body text, info rows,
 * writing space, checklists, tables, lists, records), the book recipe's
 * repetition (copies, or once per entry of a content list), page-filling
 * tables and records, and the product's page setup. Nothing here measures or
 * draws: the shared engines lay it out, and the product is fully editable.
 */
import { addCollection, addRecord, fieldKeyFor, setValue } from "../data/data";
import { createProject } from "../../presets/products/projectFactory";
import { PRODUCT_TYPES } from "../../presets/products/productTypes";
import { PRINT_PROFILES } from "../../presets/printProfiles/printProfiles";
import { refitPageFilling } from "../recipe/fitRows";
import { resolveDocument } from "../document/resolve";
import type { BindingType } from "../../types/binding";
import type { ProjectData } from "../../types/document";
import type { PromptBlock, PromptSet } from "../../types/prompts";
import type { BookNode, BookStep } from "../../types/recipe";
import type { ProductProject } from "../../types/project";
import { cardWords, normWords, type CheckedSpec, type DocSpec, type SpecComponent, type SpecSection } from "./spec";
import { NIV_NOTICE, quotesNiv } from "../../presets/scripture";

const BINDING: Record<DocSpec["page"]["binding"], { type: BindingType; product: "notebook" | "worksheet" }> = {
  book: { type: "perfect-bound", product: "notebook" },
  spiral: { type: "coil", product: "notebook" },
  stapled: { type: "saddle-stitch", product: "notebook" },
  loose: { type: "none", product: "worksheet" },
};

/** The maker's lines with paragraph space between them (a single line break prints lines run together). */
const spaced = (t: string) => t.split("\n").map((l) => l.trim()).filter(Boolean).join("\n\n");
/** A line with a typed blank ("Saying: ___") is a place to write: its words become a prompt over writing lines. */
const BLANK = /_{3,}/;
const unblank = (l: string) => l.replace(/\s*_{3,}\s*/g, " ").trim();

/** Wording that holds typed blanks: each blank line gets writing lines; the lines between print as text. */
function withBlanks(id: string, label: string | null, text: string): PromptBlock[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const out: PromptBlock[] = label?.trim() ? [{ id: `${id}-heading`, kind: "heading", label }] : [];
  lines.forEach((l, i) => {
    const bid = i ? `${id}-${i + 1}` : id;
    out.push(BLANK.test(l) ? { id: bid, label: "", prompt: unblank(l), space: "fixed", lineCount: 2, minLines: 1 } : { id: bid, kind: "heading", textStyle: "body", label: "", prompt: l });
  });
  return out;
}

/** One component as page sections (a field row of more than three blanks becomes several rows). */
function blocksOf(c: SpecComponent, keyOf: (field: string) => string | undefined): PromptBlock[] {
  const id = c.id;
  const bound = c.fromEntryField ? keyOf(c.fromEntryField) : undefined;
  const content = bound ? { content: { mode: "field" as const, key: bound } } : {};
  switch (c.kind) {
    case "heading": {
      if (bound) return [{ id, kind: "heading", label: "", ...content }];
      // A heading of several lines (a title page's lines): the first is the heading, the rest print as lines under it.
      const [first, ...rest] = (c.text ?? c.label ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
      return [{ id, kind: "heading", label: first ?? "" }, ...(rest.length ? [{ id: `${id}-lines`, kind: "heading" as const, textStyle: "body" as const, label: "", prompt: rest.join("\n") }] : [])];
    }
    case "text":
      // Text from an entry: the binding prints its heading and text. Its own text: a heading kept with body text that flows.
      if (bound) return [{ id, kind: "heading", textStyle: "body", label: c.label ?? "", ...content }];
      if (c.text && BLANK.test(c.text)) return withBlanks(id, c.label, c.text);
      return [...(c.label?.trim() ? [{ id: `${id}-heading`, kind: "heading" as const, label: c.label }] : []), { id, kind: "heading", textStyle: "body", label: "", prompt: spaced(c.text ?? "") }];
    case "fields": {
      const out: PromptBlock[] = [];
      for (let i = 0; i < c.fields.length; i += 3) out.push({ id: i ? `${id}-${i / 3 + 1}` : id, kind: "info", label: "", fields: c.fields.slice(i, i + 3).map((f) => f.label) });
      return out;
    }
    case "writing":
      if (c.text && !bound && BLANK.test(c.text)) return withBlanks(id, c.label, c.text);
      return [{ id, label: c.label ?? "", ...(c.text && !bound ? { prompt: spaced(c.text) } : {}), ...(c.lines ? { space: "fixed" as const, lineCount: c.lines, minLines: Math.min(2, c.lines) } : { space: "fill" as const, minLines: bound ? 2 : 3 }), ...content }];
    case "checklist":
      // Items to print go in a checkbox list; an empty checklist is rows of boxes to fill in.
      return c.items.length
        ? [{ id, kind: "list", label: c.label ?? "", listMarker: "checkbox", items: c.items.map((text) => ({ text })) }]
        : [{ id, label: c.label ?? "", responseStyle: "checkboxes", space: "fixed", lineCount: c.lines ?? 8 }];
    case "table": {
      const rows = c.rows ?? 10;
      const table = { columns: c.fields.map((f) => f.label), columnTypes: c.fields.map((f) => f.valueType), rows, showHeader: true, borders: "grid" as const, ...(c.numbered ? { numbering: { prefix: "No.", sequence: id } } : {}) };
      // A numbered table fills each page with whole rows when asked; an unnumbered one stretches to the space left.
      if (!c.numbered && c.fillPage) return [{ id, label: c.label ?? "", responseStyle: "table", space: "fill", table }];
      return [{ id, label: c.label ?? "", responseStyle: "table", space: "fixed", lineCount: rows, table, ...(c.numbered && c.fillPage ? { fillPage: true } : {}) }];
    }
    case "list":
      return [{ id, kind: "list", label: c.label ?? "", listMarker: c.marker ?? "bullet", items: c.items.map((text) => ({ text })), ...content }];
    case "records":
      return [{ id, kind: "record", label: c.label ?? "", recordFields: c.fields.map((f) => f.label), recordCount: c.rows ?? 3, ...(c.numbered ? { numbering: { prefix: "No.", sequence: id } } : {}), ...(c.fillPage ? { fillPage: true } : {}) }];
    case "divider":
      return [{ id, kind: "divider", label: "" }];
    case "spacer":
      return [{ id, kind: "spacer", label: "", spacer: c.size ?? "medium" }];
    case "drawing":
      // A drawing box: an outlined blank space under its heading and prompt, a set height or the rest of the page.
      return [{ id, label: c.label ?? "", ...(c.text && !bound ? { prompt: spaced(c.text) } : {}), responseStyle: "blank", frame: "outline", ...(c.lines ? { space: "fixed" as const, lineCount: c.lines, minLines: Math.min(2, c.lines) } : { space: "fill" as const }) }];
    case "cards":
      // Cards print on card sheet pages of their own (projectFromSpec).
      return [];
  }
}

/** A cards part as a card sheet page: 4, 6 or 8 to a page, each page of fronts then its page of backs. */
function cardStep(s: SpecSection, c: SpecComponent): BookStep {
  const perSheet = c.rows === 6 || c.rows === 8 ? c.rows : 4;
  const artLabel = c.text?.trim() && c.text.trim().length <= 40 ? c.text.trim() : undefined;
  return {
    kind: "step",
    id: `gen-${s.id}-${c.id}`,
    module: "custom",
    layoutId: "card-sheet",
    cadence: { type: "once" },
    title: c.label?.trim() || s.title,
    // In a double-sided or bound product, fronts on a right-hand page put each page of backs behind them.
    start: "recto",
    cards: {
      cards: c.cards.map((k) => ({ title: k.title, ...(k.subtitle ? { subtitle: k.subtitle } : {}), ...(k.front ? { front: k.front } : {}), back: k.back.map((p) => ({ ...p })) })),
      ...(perSheet !== 4 ? { perSheet } : {}),
      ...(artLabel ? { artLabel } : {}),
    },
  };
}

const pageStep = (s: SpecSection, set: PromptSet, cadence: BookStep["cadence"], title = s.title): BookStep => ({
  kind: "step",
  id: `gen-${s.id}`,
  // A worksheet page prints its title (a "custom" page never does).
  module: "worksheet",
  layoutId: "guided-page",
  cadence,
  title,
  ...(s.startOnRightPage ? { start: "recto" as const } : s.startSpread ? { start: "spread" as const } : {}),
  promptSet: set,
});

/** The entries as a content list: fields by key, values read by their type (unreadable ones kept as typed). */
function entriesData(spec: DocSpec): { data?: ProjectData; collectionId?: string; keyOf: (k: string) => string | undefined } {
  const e = spec.entries;
  if (!e) return { keyOf: () => undefined };
  const keys = new Map<string, string>();
  const fields = e.fields.map((f) => {
    const key = fieldKeyFor(f.key || f.label, [...keys.values()].map((k) => ({ key: k, label: k, valueType: "text" as const })));
    keys.set(f.key, key);
    return { key, label: f.label, valueType: f.valueType };
  });
  let { data, id } = addCollection(undefined, e.name, fields);
  for (const r of e.records) {
    const a = addRecord(data, id);
    data = a.data;
    for (const v of r.values) {
      const k = keys.get(v.key);
      if (k) data = setValue(data, id, a.recordId, k, v.value);
    }
  }
  return { data, collectionId: id, keyOf: (k) => keys.get(k) };
}

/** Whether a proposal quotes the NIV and doesn't already carry Biblica's notice. */
function needsNivNotice(spec: DocSpec): boolean {
  const allText = spec.sections.flatMap((s) => [s.title, ...s.components.flatMap((c) => [c.label, c.text, ...c.items, ...cardWords(c.cards)])]).filter(Boolean).join("\n");
  const entryText = spec.entries?.records.flatMap((r) => r.values.map((v) => v.value)).join("\n") ?? "";
  return quotesNiv(`${allText}\n${entryText}`) && !normWords(allText).includes(normWords(NIV_NOTICE));
}

/**
 * The product a checked proposal describes — every part editable in the studio. Scripture quoted from
 * the NIV gets Biblica's notice: at the foot of the first page when it fits there, otherwise on a short
 * page of its own at the front (it never pushes the first page onto another page).
 */
export function projectFromSpec(checked: CheckedSpec): ProductProject {
  if (!needsNivNotice(checked.spec)) return build(checked, "none").project;
  const onFirst = build(checked, "first-page");
  if (!onFirst.noticeStep) return build(checked, "own-page").project;
  const pagesOf = (p: ProductProject) => resolveDocument(p).recipe.pages.filter((x) => x.recipeItemId === onFirst.noticeStep).length;
  return pagesOf(onFirst.project) === pagesOf(build(checked, "none").project) ? onFirst.project : build(checked, "own-page").project;
}

function build(checked: CheckedSpec, mode: "none" | "first-page" | "own-page"): { project: ProductProject; noticeStep?: string } {
  const { spec } = checked;
  const { data, collectionId, keyOf } = entriesData(spec);
  const structure: BookNode[] = [];
  let notice = mode === "first-page";
  let noticeStep: string | undefined;
  for (const s of spec.sections) {
    const pageParts = s.components.filter((c) => c.kind !== "cards");
    const blocks = pageParts.flatMap((c) => blocksOf(c, keyOf));
    if (notice && blocks.length) {
      blocks.push({ id: `${s.id}-niv-notice`, kind: "heading", textStyle: "body", label: "", prompt: NIV_NOTICE });
      notice = false;
      noticeStep = `gen-${s.id}`;
    }
    const set: PromptSet = { blocks };
    const cards = s.components.filter((c) => c.kind === "cards" && c.cards.length);
    if (!blocks.length) {
      // A section of cards only: its card sheets, nothing else.
      for (const c of cards) structure.push(cardStep(s, c));
      continue;
    }
    if (s.repeat.mode === "per-entry" && collectionId) {
      // Once per entry, in the list's order: the section reads each entry's fields (and `{field}` in its title).
      // A day's next page (a manuscript's own page break) prints right after its first, for each day in turn.
      const prev = structure[structure.length - 1];
      if (s.withPrevious && prev?.kind === "group" && prev.entries?.collectionId === collectionId) prev.children.push(pageStep(s, set, { type: "once" }));
      else structure.push({ kind: "group", id: `gen-${s.id}-each`, label: s.title, entries: { collectionId }, children: [pageStep(s, set, { type: "once" })] });
    } else structure.push(pageStep(s, set, s.repeat.mode === "copies" && s.repeat.count > 1 ? { type: "copies", count: s.repeat.count } : { type: "once" }));
    for (const c of cards) structure.push(cardStep(s, c));
  }
  // The notice on a page of its own at the front (it didn't fit the first page, or there is no page but cards).
  if (mode === "own-page" || notice)
    structure.unshift({ kind: "step", id: "gen-niv-notice", module: "worksheet", layoutId: "guided-page", cadence: { type: "once" }, title: "Scripture Quotations", promptSet: { blocks: [{ id: "gen-niv-notice-text", kind: "heading", textStyle: "body", label: "", prompt: NIV_NOTICE }] } });
  // The maker's own content the proposal didn't place is kept, word for word, on a page of its own.
  if (checked.unplaced.length)
    structure.push({
      kind: "step", id: "gen-your-content", module: "worksheet", layoutId: "guided-page", cadence: { type: "once" }, title: "Your content",
      promptSet: { blocks: [{ id: "gen-your-content-text", kind: "heading", textStyle: "body", label: "", prompt: spaced(checked.unplaced.join("\n")) }] },
    });
  const b = BINDING[spec.page.binding];
  const def = PRODUCT_TYPES[b.product];
  const profile = PRINT_PROFILES.find((pp) => pp.id === def.defaultPrintProfile && pp.bindingRules.supported.includes(b.type)) ?? PRINT_PROFILES.find((pp) => pp.bindingRules.supported.includes(b.type))!;
  const project = createProject(b.product, {
    name: spec.title,
    dimensions: { sizePresetId: spec.page.size, orientation: spec.page.orientation },
    production: { bindingType: b.type, printProfileId: profile.id, includeBleed: false, duplex: b.type !== "none" },
    recipe: { items: [], ordering: "sequential", structure },
    layoutOptions: { showPageNumbers: b.type !== "none" },
  });
  return { project: refitPageFilling(data ? { ...project, data } : project), noticeStep };
}

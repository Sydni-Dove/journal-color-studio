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
import type { BindingType } from "../../types/binding";
import type { ProjectData } from "../../types/document";
import type { PromptBlock, PromptSet } from "../../types/prompts";
import type { BookNode, BookStep } from "../../types/recipe";
import type { ProductProject } from "../../types/project";
import type { CheckedSpec, DocSpec, SpecComponent, SpecSection } from "./spec";

const BINDING: Record<DocSpec["page"]["binding"], { type: BindingType; product: "notebook" | "worksheet" }> = {
  book: { type: "perfect-bound", product: "notebook" },
  spiral: { type: "coil", product: "notebook" },
  stapled: { type: "saddle-stitch", product: "notebook" },
  loose: { type: "none", product: "worksheet" },
};

/** One component as page sections (a field row of more than three blanks becomes several rows). */
function blocksOf(c: SpecComponent, keyOf: (field: string) => string | undefined): PromptBlock[] {
  const id = c.id;
  const bound = c.fromEntryField ? keyOf(c.fromEntryField) : undefined;
  const content = bound ? { content: { mode: "field" as const, key: bound } } : {};
  switch (c.kind) {
    case "heading":
      return [{ id, kind: "heading", label: bound ? "" : (c.text ?? c.label ?? ""), ...content }];
    case "text":
      // Text from an entry: the binding prints its heading and text. Its own text: a heading kept with body text that flows.
      if (bound) return [{ id, kind: "heading", textStyle: "body", label: c.label ?? "", ...content }];
      return [...(c.label?.trim() ? [{ id: `${id}-heading`, kind: "heading" as const, label: c.label }] : []), { id, kind: "heading", textStyle: "body", label: "", prompt: c.text ?? "" }];
    case "fields": {
      const out: PromptBlock[] = [];
      for (let i = 0; i < c.fields.length; i += 3) out.push({ id: i ? `${id}-${i / 3 + 1}` : id, kind: "info", label: "", fields: c.fields.slice(i, i + 3).map((f) => f.label) });
      return out;
    }
    case "writing":
      return [{ id, label: c.label ?? "", ...(c.text && !bound ? { prompt: c.text } : {}), ...(c.lines ? { space: "fixed" as const, lineCount: c.lines, minLines: Math.min(2, c.lines) } : { space: "fill" as const, minLines: 3 }), ...content }];
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
  }
}

const pageStep = (s: SpecSection, set: PromptSet, cadence: BookStep["cadence"], title = s.title): BookStep => ({
  kind: "step",
  id: `gen-${s.id}`,
  // A worksheet page prints its title (a "custom" page never does).
  module: "worksheet",
  layoutId: "guided-page",
  cadence,
  title,
  ...(s.startOnRightPage ? { start: "recto" as const } : {}),
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

/** The product a checked proposal describes — every part editable in the studio. */
export function projectFromSpec(checked: CheckedSpec): ProductProject {
  const { spec } = checked;
  const { data, collectionId, keyOf } = entriesData(spec);
  const structure: BookNode[] = [];
  for (const s of spec.sections) {
    const set: PromptSet = { blocks: s.components.flatMap((c) => blocksOf(c, keyOf)) };
    if (s.repeat.mode === "per-entry" && collectionId) {
      // Once per entry, in the list's order: the section reads each entry's fields (and `{field}` in its title).
      structure.push({ kind: "group", id: `gen-${s.id}-each`, label: s.title, entries: { collectionId }, children: [pageStep(s, set, { type: "once" })] });
    } else structure.push(pageStep(s, set, s.repeat.mode === "copies" && s.repeat.count > 1 ? { type: "copies", count: s.repeat.count } : { type: "once" }));
  }
  // The maker's own content the proposal didn't place is kept, word for word, on a page of its own.
  if (checked.unplaced.length)
    structure.push({
      kind: "step", id: "gen-your-content", module: "worksheet", layoutId: "guided-page", cadence: { type: "once" }, title: "Your content",
      promptSet: { blocks: [{ id: "gen-your-content-text", kind: "heading", textStyle: "body", label: "", prompt: checked.unplaced.join("\n") }] },
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
  return refitPageFilling(data ? { ...project, data } : project);
}

/**
 * SECTIONS — the one editor for prompt + response content (types/prompts.ts),
 * used by Guided Lined Pages and other guided book pages (Meeting With God,
 * reviews, custom…), devotional recipes and worksheets.
 *
 * Each section is a compact row ("My Response · 8 lines", "Prayer · Fills
 * space · 14 lines") that opens to edit: heading, prompt, writing space (a
 * fixed number of lines, fill the remaining space, or an equal share), writing
 * area, and move / duplicate / remove. Line counts are real: fixed sections
 * show what was asked for, sections that share the space show the lines they
 * get at this page size. The layout engine decides whether the page fits.
 */
import type { ValueType } from "../../types/document";
import { useEffect, useRef, useState } from "react";
import {
  amountOf, canSitBeside, HEADER_META_CHOICES, TABLE_ROW_SCALE, DEFAULT_MIN_LINES, kindOf, MAX_INFO_FIELDS, newPromptId, PROMPT_STARTERS, spaceOf, WRITING_AMOUNTS,
  type GuidedHeader, type HeadingTextStyle, type InfoFieldStyle, type TableRowSpace, type PromptBlockKind, type SectionFrame, type SpacerSize, type PromptBlock, type PromptSet, type PromptSpacing, type ResponseStyle, type SpaceMode, type TaskMarker, type TaskMarkerPosition, type WritingAmount,
} from "../../types/prompts";
import { Check, Field, LabeledNumeric, NumberField, Segmented, Select } from "./ui";
import { FONT_CATALOG, FONT_CATEGORY_LABEL } from "../../presets/typography/typography";

/** Every studio font, by kind, for a heading's own font ("" = the Style font). */
export const fontOptions = (sameLabel: string) => [
  { value: "", label: sameLabel },
  ...(["serif", "display", "sans-serif", "script", "handwritten"] as const).flatMap((k) => FONT_CATALOG.filter((f) => f.category === k).map((f) => ({ value: f.family, label: `${f.family} — ${FONT_CATEGORY_LABEL[k].toLowerCase()}` }))),
];

/** A section heading's look: where it sits, a line under it, its own font and size. */
function HeadingLook({ b, putBlock, defaultSize }: { b: PromptBlock; putBlock: (id: string, patch: Partial<PromptBlock>) => void; defaultSize?: (b: PromptBlock) => number }) {
  // The style's size shown until one is chosen (default type: section heading 9 pt, page title 16 pt).
  const sizeOf = defaultSize ?? ((x: PromptBlock) => (x.textStyle === "title" ? 16 : 9));
  return (
    <>
      <Segmented
        label="Heading position"
        value={b.headingAlign ?? "left"}
        options={[{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }]}
        onChange={(v) => putBlock(b.id, { headingAlign: v === "left" ? undefined : v })}
      />
      <Check label="Line under the heading" checked={!!b.headingRule} onChange={(on) => putBlock(b.id, { headingRule: on || undefined })} />
      <Select label="Heading font" value={b.headingFont ?? ""} options={fontOptions("Same as Style (section headings)")} onChange={(v) => putBlock(b.id, { headingFont: v || undefined })} />
      <div className="row">
        <NumberField label="Heading size" suffix="points" step={1} min={6} max={72} value={b.headingSizePt ?? sizeOf(b)} onChange={(v) => putBlock(b.id, { headingSizePt: Math.max(6, Math.min(72, Math.round(v * 2) / 2)) })} />
        {b.headingSizePt !== undefined && <button type="button" className="btn btn--ghost" onClick={() => putBlock(b.id, { headingSizePt: undefined })}>Use the style's size</button>}
      </div>
    </>
  );
}

const MAX_PROMPTS = 20;
const STYLE_LABEL: Record<ResponseStyle | "own", string> = {
  own: "As designed",
  ruled: "Ruled lines",
  blank: "Blank",
  "dot-grid": "Dotted",
  "graph-grid": "Grid",
  checkboxes: "Checklist",
  table: "Table",
};
const AMOUNT_LABEL: Record<WritingAmount, string> = { compact: "Compact", standard: "Standard", spacious: "Spacious" };
const TEXT_STYLE_LABEL: Record<HeadingTextStyle, string> = { title: "Page title", heading: "Section heading", body: "Body text" };
const ROW_SPACE_LABEL: Record<TableRowSpace, string> = { compact: "Compact", standard: "Standard", spacious: "Spacious" };
const FRAME_LABEL: Record<SectionFrame, string> = { open: "Open (no border)", divider: "Line below", outline: "Soft outline", panel: "Filled panel", rounded: "Rounded panel", rule: "Line at left" };

/** How the current sections fit: pages each time, a plain problem when they can't, and the lines each section gets. */
export type PromptFit = { pages: number; problem?: string; lines?: Record<string, number>; pageOf?: Record<string, number> };

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** The row's one-line summary of a section's writing space. */
function spaceSummary(set: PromptSet, b: PromptBlock, got: number | undefined): string {
  const unit = b.responseStyle === "checkboxes" ? "item" : b.responseStyle === "table" ? "row" : "line";
  if (set.sameLines !== undefined) return plural(set.sameLines, unit);
  const mode = spaceOf(b);
  if (mode === "fixed") {
    const a = unit === "line" ? amountOf(b.lineCount) : undefined;
    return a ? `${AMOUNT_LABEL[a]} · ${plural(b.lineCount ?? 0, unit)}` : plural(b.lineCount ?? 0, unit);
  }
  const n = got !== undefined ? ` · ${plural(got, unit)}` : "";
  return mode === "equal" ? `Equal share${n}` : `Fills space${n}`;
}

/** A non-writing section's one-line summary in its row. */
const KIND_SUMMARY: Record<Exclude<PromptBlockKind, "prompt">, (b: PromptBlock) => string> = {
  heading: (b) => `${TEXT_STYLE_LABEL[b.textStyle ?? "heading"]}${b.textStyle !== "body" && b.prompt?.trim() ? " + text" : ""}`,
  info: (b) => `Info row · ${plural(Math.min(MAX_INFO_FIELDS, (b.fields ?? []).filter((f) => f.trim()).length) || 1, "blank")}`,
  divider: () => "Line",
  list: (b) => `List · ${plural((b.items ?? []).length, "item")}`,
  record: (b) => `Records · ${plural(b.recordCount ?? 1, "record")} of ${plural((b.recordFields ?? []).length, "blank")}`,
  spacer: (b) => `${(b.spacer ?? "medium")[0].toUpperCase()}${(b.spacer ?? "medium").slice(1)} space`,
};

function HeaderEditor({ header, onChange, open }: { header: GuidedHeader | undefined; onChange: (h: GuidedHeader | undefined) => void; open?: boolean }) {
  const h = header ?? {};
  const put = (patch: Partial<GuidedHeader>) => {
    const next = { ...h, ...patch };
    const empty = !next.eyebrow && !next.number && !next.subtitle && !next.reference && !next.rule && !next.fields?.length && !next.overline && !next.title && !next.meta?.length && !next.tagline && !next.mark;
    onChange(empty ? undefined : next);
  };
  const fields = (v: string) => {
    const list = v.split(",").map((f) => f.trim());
    return list.some(Boolean) ? list : undefined;
  };
  const meta = h.meta ?? [];
  const preset = new Set<string>(HEADER_META_CHOICES);
  const others = meta.filter((m) => !preset.has(m));
  const toggle = (m: string, on: boolean) => {
    // Keep the ready choices in their usual order, then the maker's own.
    const chosen = HEADER_META_CHOICES.filter((c) => (c === m ? on : meta.includes(c)));
    put({ meta: [...chosen, ...others].length ? [...chosen, ...others] : undefined });
  };
  return (
    <details className="subsection prompt-header-editor" data-testid="page-header" open={open}>
      <summary>Page header (optional)</summary>
      <p className="hint">
        One compact header at the top of the page: the step at the left, the titles in the centre, the right-side text at the right, and details to fill in under it. Leave everything empty for no header. The writing space starts below it.
      </p>
      <div className="row">
        <Field label="Step label">
          <input type="text" value={h.eyebrow ?? ""} placeholder="e.g. STEP ONE" onChange={(e) => put({ eyebrow: e.target.value || undefined })} />
        </Field>
        <Field label="Step number">
          <input type="text" value={h.number ?? ""} placeholder="e.g. 01" onChange={(e) => put({ number: e.target.value || undefined })} />
        </Field>
      </div>
      <Field label="Overline (small text above the title)">
        <input type="text" value={h.overline ?? ""} placeholder="e.g. PROPHETIC WORD" onChange={(e) => put({ overline: e.target.value || undefined })} />
      </Field>
      <Field label="Main title">
        <input type="text" value={h.title ?? ""} placeholder="e.g. RECEIVE" onChange={(e) => put({ title: e.target.value || undefined })} />
      </Field>
      <Field label="Subtitle">
        <input type="text" value={h.subtitle ?? ""} placeholder="e.g. THE WORD" onChange={(e) => put({ subtitle: e.target.value || undefined })} />
      </Field>
      <Field label="Line under the subtitle (small, spaced)">
        <input type="text" value={h.tagline ?? ""} placeholder="e.g. SEEK UNDERSTANDING • CONFIRM WITH SCRIPTURE" onChange={(e) => put({ tagline: e.target.value || undefined })} />
      </Field>
      <Field label="Scripture or reference">
        <input type="text" value={h.reference ?? ""} placeholder="e.g. Habakkuk 2:2" onChange={(e) => put({ reference: e.target.value || undefined })} />
      </Field>
      <Field label="Right side text (between two short lines — a new line per line)">
        <textarea rows={3} value={h.mark ?? ""} placeholder={"e.g. FROM\nREVELATION TO\nEXECUTION"} onChange={(e) => put({ mark: e.target.value || undefined })} />
      </Field>
      <div className="field-label">Details to fill in (under the titles)</div>
      <div className="header-meta-choices">
        {HEADER_META_CHOICES.map((m) => (
          <Check key={m} label={m} checked={meta.includes(m)} onChange={(on) => toggle(m, on)} />
        ))}
      </div>
      <Field label="Other details (comma separated)">
        <input
          type="text"
          value={others.join(", ")}
          placeholder="e.g. Speaker, Place"
          onChange={(e) => {
            const own = e.target.value.split(",").map((x) => x.trimStart()).filter((x, i, a) => x || i === a.length - 1);
            const chosen = HEADER_META_CHOICES.filter((c) => meta.includes(c));
            const all = [...chosen, ...own];
            put({ meta: all.some((x) => x.trim()) ? all : undefined });
          }}
        />
      </Field>
      {!!meta.length && <Check label="Put the details at the right of the titles instead" checked={h.metaPlace === "right"} onChange={(on) => put({ metaPlace: on ? "right" : undefined })} />}
      <Check label="Thin lines between the step, the titles and the right side" checked={h.dividers !== false} onChange={(on) => put({ dividers: on ? undefined : false })} />
      <Check label="Short decorative rule under the header" checked={!!h.rule} onChange={(rule) => put({ rule: rule || undefined })} />
      <Segmented
        label="Show this header"
        value={h.repeat === "every" ? "every" : "first"}
        options={[{ value: "first", label: "First page only" }, { value: "every", label: "Every page" }]}
        onChange={(v) => put({ repeat: v === "every" ? "every" : undefined })}
      />
      <p className="hint">For a page whose sections continue onto more pages.</p>
      {!!h.fields?.length && (
        <Field label="A row of blanks above the sections (comma separated)">
          <input type="text" value={(h.fields ?? []).join(", ")} placeholder="e.g. Date, Source" onChange={(e) => put({ fields: fields(e.target.value) })} />
        </Field>
      )}
    </details>
  );
}

/** The pieces a page is built from, grouped as a page maker thinks of them. */
const ADD_GROUPS: { title: string; items: { label: string; block: Omit<PromptBlock, "id"> }[] }[] = [
  {
    title: "Writing",
    items: [
      { label: "Writing lines", block: { label: "Writing", space: "fill", responseStyle: "ruled" } },
      { label: "Blank writing area", block: { label: "Notes", space: "fill", responseStyle: "blank" } },
      { label: "Dot grid", block: { label: "Notes", space: "fill", responseStyle: "dot-grid" } },
    ],
  },
  {
    title: "Planning",
    items: [
      { label: "Task list", block: { label: "Tasks", space: "fixed", lineCount: 10, responseStyle: "checkboxes", taskMarker: "circle", taskMarkerPosition: "left" } },
      { label: "Checklist", block: { label: "To Do", space: "fixed", lineCount: 8, responseStyle: "checkboxes", taskMarker: "square", taskMarkerPosition: "left" } },
      { label: "Table", block: { label: "Table", space: "fixed", lineCount: 6, responseStyle: "table", table: { columns: ["Task", "Due", "Done"], rows: 6, showHeader: true, borders: "grid" } } },
      { label: "Tracker", block: { label: "Tracker", space: "fixed", lineCount: 6, responseStyle: "table", table: { columns: ["Habit", "M", "T", "W", "T", "F", "S", "S"], rows: 6, showHeader: true, borders: "grid" } } },
    ],
  },
  {
    title: "Prompts",
    items: [
      { label: "Prompt + response", block: { label: "Prompt", prompt: "Write your prompt here.", space: "fixed", lineCount: 6, responseStyle: "ruled" } },
      { label: "Scripture", block: { label: "Scripture", space: "fixed", lineCount: 3, responseStyle: "ruled" } },
      { label: "Reflection", block: { label: "Reflection", prompt: "What is God saying to me?", space: "fixed", lineCount: 8, responseStyle: "ruled" } },
      { label: "Prayer", block: { label: "Prayer", space: "fixed", lineCount: 6, responseStyle: "ruled" } },
      { label: "Journal space", block: { label: "Journal", space: "fill", responseStyle: "ruled" } },
    ],
  },
  {
    title: "Organization",
    items: [
      { label: "Heading / text", block: { kind: "heading", label: "Heading" } },
      { label: "Info row", block: { kind: "info", label: "", fields: ["Project", "Date"] } },
      { label: "Divider line", block: { kind: "divider", label: "" } },
      { label: "Spacer / open space", block: { kind: "spacer", label: "", spacer: "medium" } },
      { label: "Notes", block: { label: "Notes", space: "fill", responseStyle: "ruled" } },
    ],
  },
];

/** The pieces, as buttons: tap one and it is added to the page. */
function Pieces({ disabled, onAdd }: { disabled: boolean; onAdd: (label: string, block: Omit<PromptBlock, "id">) => void }) {
  return (
    <>
      {ADD_GROUPS.map((g) => (
        <div key={g.title} className="add-group">
          <div className="field-label">{g.title}</div>
          <div className="card-actions add-section-grid">
            {g.items.map((it) => (
              <button key={it.label} type="button" className="btn" disabled={disabled} onClick={() => onAdd(it.label, it.block)}>{it.label}</button>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

/** Info row: up to three labelled blanks, each a writing line or an open box. */
function InfoFields({ b, putBlock }: { b: PromptBlock; putBlock: (id: string, patch: Partial<PromptBlock>) => void }) {
  const fields = (b.fields ?? []).slice(0, MAX_INFO_FIELDS);
  const styles = fields.map((_, i) => b.fieldStyles?.[i] ?? "line");
  const put = (f: string[], st: InfoFieldStyle[]) => putBlock(b.id, { fields: f, fieldStyles: st.some((x) => x === "box") ? st : undefined });
  return (
    <div className="info-fields">
      {fields.map((f, i) => (
        <div key={i} className="info-field">
          <Field label={`Blank ${i + 1} label`}>
            <input type="text" value={f} placeholder={["e.g. Project", "e.g. Date", "e.g. Status"][i]} onChange={(e) => put(fields.map((x, k) => (k === i ? e.target.value : x)), styles)} />
          </Field>
          <Segmented<InfoFieldStyle>
            label={`Blank ${i + 1} is`}
            value={styles[i]}
            options={[{ value: "line", label: "A line" }, { value: "box", label: "A box" }]}
            onChange={(v) => put(fields, styles.map((x, k) => (k === i ? v : x)))}
          />
          {fields.length > 1 && (
            <button type="button" className="btn btn--ghost" onClick={() => put(fields.filter((_, k) => k !== i), styles.filter((_, k) => k !== i))}>Remove blank {i + 1}</button>
          )}
        </div>
      ))}
      {fields.length < MAX_INFO_FIELDS && (
        <button type="button" className="btn" onClick={() => put([...fields, ""], [...styles, "line"])}>+ Add a blank</button>
      )}
      <p className="hint">Up to three blanks on one row. On a narrow page they wrap to a second row instead of getting squeezed.</p>
    </div>
  );
}

/** A repeating record: what each record asks for, how many, and how they're numbered. */
function RecordFields({ b, putBlock, rowsForPage }: { b: PromptBlock; putBlock: (id: string, patch: Partial<PromptBlock>) => void; rowsForPage?: (blockId: string) => number | null }) {
  const fields = b.recordFields?.length ? b.recordFields : [""];
  const put = (recordFields: string[]) => putBlock(b.id, { recordFields });
  return (
    <div className="table-columns">
      {fields.map((f, i) => (
        <div key={i} className="table-column">
          <Field label={`Blank ${i + 1}`}>
            <input type="text" value={f} placeholder="e.g. Item" onChange={(e) => put(fields.map((x, k) => (k === i ? e.target.value : x)))} />
          </Field>
          {fields.length > 1 && <button type="button" className="btn btn--ghost" aria-label={`Remove blank ${i + 1}`} onClick={() => put(fields.filter((_, k) => k !== i))}>Remove</button>}
        </div>
      ))}
      {fields.length < 12 && <button type="button" className="btn" onClick={() => put([...fields, ""])}>+ Add a blank</button>}
      <div className="row">
        <NumberField label="Records on this page" step={1} min={1} max={60} value={b.recordCount ?? 1} onChange={(n) => putBlock(b.id, { recordCount: Math.max(1, Math.min(60, Math.round(n))) })} />
        <Field label="Each record is called">
          <input type="text" value={b.numbering?.prefix ?? "No."} placeholder="No." onChange={(e) => putBlock(b.id, { numbering: { ...b.numbering, prefix: e.target.value } })} />
        </Field>
        <NumberField label="First number" step={1} min={1} value={b.numbering?.start ?? 1} onChange={(n) => putBlock(b.id, { numbering: { ...b.numbering, start: Math.max(1, Math.round(n)) } })} />
      </div>
      {rowsForPage && (
        <button type="button" className="btn" onClick={() => { const n = rowsForPage(b.id); if (n) putBlock(b.id, { recordCount: n }); }}>
          Fit records to one page
        </button>
      )}
      <p className="hint">Records are numbered straight through every copy of this page; a record is never split across two pages.</p>
    </div>
  );
}

/** What a column can hold — its width follows from it (narrow numbers and dates, wide notes). */
const COLUMN_HOLDS: { value: ValueType | ""; label: string }[] = [
  { value: "", label: "Anything (equal width)" },
  { value: "text", label: "Words (a name, an item)" },
  { value: "longText", label: "Notes (longer writing)" },
  { value: "number", label: "Number" },
  { value: "quantity", label: "Quantity" },
  { value: "currency", label: "Amount ($)" },
  { value: "date", label: "Date" },
  { value: "time", label: "Time" },
  { value: "boolean", label: "Check mark (yes / no)" },
  { value: "reference", label: "Reference (Scripture, code)" },
  { value: "signature", label: "Signature" },
];

/** A table's columns: each one's label and what it holds; add, remove or reorder columns; number the rows. */
function TableColumns({ b, putBlock }: { b: PromptBlock; putBlock: (id: string, patch: Partial<PromptBlock>) => void }) {
  const table = b.table ?? { columns: ["Task", "Due", "Done"], rows: b.lineCount ?? 6 };
  const cols = table.columns.length ? table.columns : ["Column 1"];
  const types = cols.map((_, i) => table.columnTypes?.[i] ?? null);
  const put = (columns: string[], columnTypes: (ValueType | null)[] = types) =>
    putBlock(b.id, { table: { ...table, columns, columnTypes: columnTypes.some(Boolean) ? columnTypes : undefined } });
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    const c = [...cols], t = [...types];
    [c[i], c[j]] = [c[j], c[i]];
    [t[i], t[j]] = [t[j], t[i]];
    put(c, t);
  };
  const rows = table.rows ?? b.lineCount ?? 6;
  return (
    <div className="table-columns" data-testid="table-columns">
      {cols.map((c, i) => (
        <div key={i} className="table-column">
          <Field label={`Column ${i + 1}`}>
            <input type="text" value={c} placeholder={`Column ${i + 1}`} onChange={(e) => put(cols.map((x, k) => (k === i ? e.target.value : x)))} />
          </Field>
          <Field label="Holds">
            <select value={types[i] ?? ""} aria-label={`Column ${i + 1} holds`} onChange={(e) => put(cols, types.map((x, k) => (k === i ? ((e.target.value || null) as ValueType | null) : x)))}>
              {COLUMN_HOLDS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <span className="row">
            <button type="button" className="btn btn--ghost" disabled={i === 0} aria-label={`Move column ${i + 1} left`} onClick={() => move(i, -1)}>←</button>
            <button type="button" className="btn btn--ghost" disabled={i === cols.length - 1} aria-label={`Move column ${i + 1} right`} onClick={() => move(i, 1)}>→</button>
            {cols.length > 1 && (
              <button type="button" className="btn btn--ghost" aria-label={`Remove column ${i + 1}`} onClick={() => put(cols.filter((_, k) => k !== i), types.filter((_, k) => k !== i))}>Remove</button>
            )}
          </span>
        </div>
      ))}
      {cols.length < MAX_TABLE_COLUMNS && (
        <button type="button" className="btn" onClick={() => put([...cols, ""], [...types, null])}>+ Add column</button>
      )}
      {types.some(Boolean) && <p className="hint">Columns are sized to what they hold — a date or amount stays narrow, notes get room — and never narrower than their label.</p>}
      <Check
        label="Number the rows (No. 1, 2, 3… straight through every copy of this page)"
        checked={!!table.numbering}
        onChange={(on) =>
          putBlock(b.id, on ? { space: "fixed", lineCount: rows, table: { ...table, columns: cols, rows, numbering: { prefix: "No." } } } : { table: { ...table, numbering: undefined } })
        }
      />
      {table.numbering && <p className="hint">A numbered table prints exactly its rows; a long one continues on the next page, and the numbers carry on.</p>}
    </div>
  );
}
const MAX_TABLE_COLUMNS = 10;

export function PromptEditor({
  set,
  onChange,
  ownStyleLabel = "As designed",
  allowInstructions = false,
  allowHeader = false,
  allowStarters = false,
  composer = false,
  fit,
  rowsForPage,
}: {
  set: PromptSet;
  onChange: (next: PromptSet) => void;
  /** What "the page's own style" means here (a recipe's design, or the product's writing lines). */
  ownStyleLabel?: string;
  allowInstructions?: boolean;
  /** Guided pages: the optional designed header (step label and number, subtitle, reference, rule, fields). */
  allowHeader?: boolean;
  /** Guided pages: offer the starter structures (Full Page Prompt, Two / Three / Four prompts). */
  allowStarters?: boolean;
  /**
   * A page built from pieces (Custom Page, saved designs): "Build your page"
   * comes first, then the sections, then the page's secondary options.
   */
  composer?: boolean;
  /** How the current sections fit: pages each time, a plain problem when they can't, lines per section. */
  fit?: PromptFit;
  /** Numbered tables: how many rows of a table fill its page at the product's size (engines/recipe/fitRows). */
  rowsForPage?: (blockId: string) => number | null;
}) {
  const blocks = set.blocks;
  const [added, setAdded] = useState<{ id: string; label: string } | null>(null);
  const put = (patch: Partial<PromptSet>) => onChange({ ...set, ...patch });
  // Choosing writing space makes the proportions the creator's own: an older page's legacy proportions stop applying.
  const putSpace = (patch: Partial<PromptSet>) => onChange({ ...set, ...patch, legacyWeights: undefined });
  const putBlock = (id: string, patch: Partial<PromptBlock>) => {
    const next = { blocks: blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) };
    return "space" in patch || "lineCount" in patch || "minLines" in patch ? putSpace(next) : put(next);
  };
  const addBlock = (label: string, block: Omit<PromptBlock, "id">) => {
    const id = newPromptId();
    // A heading that opens the page is its title; later ones head sections.
    const piece = block.kind === "heading" && !block.textStyle ? { ...block, textStyle: (blocks.length ? "heading" : "title") as HeadingTextStyle } : block;
    putSpace({ blocks: [...blocks, { id, ...piece }] });
    setAdded({ id, label });
  };
  // The piece just added opens, in view, ready to name; the others close so the list stays short.
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!added || !root.current) return;
    root.current.querySelectorAll<HTMLDetailsElement>("details.prompt-block").forEach((d) => (d.open = d.dataset.prompt === added.id));
    root.current.querySelector(`details.prompt-block[data-prompt="${added.id}"]`)?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [added]);
  // Removing a section never leaves the one below sitting beside nothing.
  const remove = (id: string) => {
    const i = blocks.findIndex((b) => b.id === id);
    put({ blocks: blocks.filter((b) => b.id !== id).map((b, k) => (k === i && b.beside && !canSitBeside(blocks.filter((x) => x.id !== id), k) ? { ...b, beside: undefined } : b)) });
  };
  const duplicate = (i: number) => putSpace({ blocks: [...blocks.slice(0, i + 1), { ...blocks[i], id: newPromptId(), beside: undefined }, ...blocks.slice(i + 1)] });
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    // Moving breaks a side-by-side pair that no longer holds.
    put({ blocks: next.map((b, k) => (b.beside && !canSitBeside(next, k) ? { ...b, beside: undefined } : b)) });
  };
  /** Close a section and bring the list of sections back into view. */
  const closeSection = (el: HTMLElement) => {
    const d = el.closest("details.prompt-block") as HTMLDetailsElement | null;
    if (!d) return;
    d.open = false;
    d.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  };
  const toBuild = () => root.current?.querySelector('[data-testid="build-your-page"]')?.scrollIntoView?.({ block: "start", behavior: "smooth" });
  const setSpace = (b: PromptBlock, space: SpaceMode) => putBlock(b.id, space === "fixed" ? { space, lineCount: b.lineCount ?? fit?.lines?.[b.id] ?? 6 } : { space });
  const same = set.sameLines !== undefined;
  const fewerLines = () => {
    if (same) return put({ sameLines: Math.max(DEFAULT_MIN_LINES, (set.sameLines ?? DEFAULT_MIN_LINES) - 1) });
    put({ blocks: blocks.map((b) => (spaceOf(b) === "fixed" && b.lineCount !== undefined ? { ...b, lineCount: Math.max(b.minLines ?? DEFAULT_MIN_LINES, b.lineCount - 1) } : b)) });
  };
  const styleOptions = (["own", "ruled", "blank", "dot-grid", "graph-grid", "checkboxes", "table"] as const).map((v) => ({ value: v, label: v === "own" ? ownStyleLabel : STYLE_LABEL[v] }));
  const frameOptions = [{ value: "page", label: `Same as the page (${FRAME_LABEL[set.frame ?? "open"]})` }, ...(Object.keys(FRAME_LABEL) as SectionFrame[]).map((v) => ({ value: v, label: FRAME_LABEL[v] }))];

  const starters = allowStarters && (
    <Select
      label="Start from a structure (replaces the sections)"
      value="__none"
      options={[{ value: "__none", label: "Choose…" }, ...PROMPT_STARTERS.map((st) => ({ value: st.id, label: st.label }))]}
      onChange={(v) => {
        const starter = PROMPT_STARTERS.find((st) => st.id === v);
        if (starter) onChange({ ...starter.set(), header: set.header, instructions: set.instructions, whenFull: set.whenFull, spacing: set.spacing, frame: set.frame });
      }}
    />
  );
  const header = allowHeader && <HeaderEditor header={set.header} onChange={(h) => put({ header: h })} />;
  const instructions = allowInstructions && (
    <Field label="Instructions (optional)">
      <textarea rows={2} value={set.instructions ?? ""} placeholder="A sentence or two under the title" onChange={(e) => put({ instructions: e.target.value || undefined })} />
    </Field>
  );
  const sectionOptions = (
    <>
      <Select<string> label="Section style for the whole page" value={set.frame ?? "open"} options={(Object.keys(FRAME_LABEL) as SectionFrame[]).map((v) => ({ value: v, label: FRAME_LABEL[v] }))} onChange={(v) => put({ frame: v === "open" ? undefined : (v as SectionFrame) })} />
      <Check label="Use the same number of lines for every section" checked={same} onChange={(on) => put({ sameLines: on ? blocks.find((b) => b.lineCount !== undefined)?.lineCount ?? 4 : undefined })} />
      {same && <NumberField label="Lines per section" step={1} min={0} max={60} value={set.sameLines ?? 4} onChange={(v) => put({ sameLines: Math.max(0, Math.round(v)) })} />}
      <Segmented<PromptSpacing>
        label="Space between sections"
        value={set.spacing ?? "standard"}
        options={[{ value: "tight", label: "Less" }, { value: "standard", label: "Standard" }, { value: "roomy", label: "More" }]}
        onChange={(spacing) => put({ spacing: spacing === "standard" ? undefined : spacing })}
      />
    </>
  );
  const whenFull = (
    <Select
      label="When the sections don't fit on the page"
      value={set.whenFull ?? "continue"}
      options={[
        { value: "continue", label: "Continue on another page" },
        { value: "fewer-lines", label: "Use fewer lines first, then continue" },
        { value: "stop", label: "Keep one page and tell me" },
      ]}
      onChange={(v) => put({ whenFull: v === "continue" ? undefined : (v as "fewer-lines" | "stop") })}
    />
  );
  const fitIssues = (
    <>
      {fit && fit.pages > 1 && !fit.problem && (
        <div className="issue" data-testid="prompt-continues">
          <div className="issue-title">These sections continue on another page ({fit.pages} pages each time).</div>
          <div className="card-actions">
            <button type="button" className="btn" onClick={fewerLines}>Use fewer lines</button>
            <button type="button" className="btn" onClick={() => put({ blocks: blocks.slice(0, -1) })} disabled={!blocks.length}>Remove a section</button>
          </div>
        </div>
      )}
      {fit?.problem && (
        <div className="issue issue--error" data-testid="prompt-fit">
          <div className="issue-title">{fit.problem}</div>
          <div className="card-actions">
            <button type="button" className="btn" onClick={fewerLines}>Use fewer lines</button>
            <button type="button" className="btn" onClick={() => put({ whenFull: undefined })}>Continue on another page</button>
            <button type="button" className="btn" onClick={() => put({ blocks: blocks.slice(0, -1) })} disabled={!blocks.length}>Remove a section</button>
          </div>
        </div>
      )}
    </>
  );

  const list = (
    <ol className="prompt-list">
      {blocks.map((b, i) => {
        const mode = spaceOf(b);
        const k = kindOf(b);
        const name = k === "divider" ? "Divider line" : k === "spacer" ? "Open space" : k === "info" ? (b.fields ?? []).filter((f) => f.trim()).join(" · ") || "Info row" : b.label.trim() || b.prompt?.trim() || `Section ${i + 1}`;
        const got = fit?.lines?.[b.id];
        const writing = b.responseStyle !== "checkboxes" && b.responseStyle !== "table";
        const amount: WritingAmount | "fill" | "exact" = mode === "fill" ? "fill" : mode === "fixed" ? amountOf(b.lineCount) ?? "exact" : "exact";
        const besideOk = canSitBeside(blocks, i);
        return (
          <li key={b.id} className={b.beside && besideOk ? "prompt-item prompt-item--beside" : "prompt-item"}>
            <details className="prompt-block" data-prompt={b.id}>
              <summary>
                <span className="prompt-block__name">{b.beside && besideOk ? "⇥ " : ""}{name}</span>
                <span className="prompt-block__space" data-testid="section-space">
                  {k === "prompt" ? spaceSummary(set, b, got) : KIND_SUMMARY[k](b)}
                  {b.beside && besideOk ? " · beside the section above" : ""}
                  {fit && fit.pages > 1 && fit.pageOf?.[b.id] !== undefined ? ` · page ${fit.pageOf[b.id] + 1}` : ""}
                </span>
              </summary>
              <div className="prompt-block__body">
                {k === "heading" && (
                  <>
                    <Segmented<HeadingTextStyle>
                      label="Text style"
                      value={b.textStyle ?? "heading"}
                      options={(["title", "heading", "body"] as const).map((v) => ({ value: v, label: TEXT_STYLE_LABEL[v] }))}
                      onChange={(textStyle) => putBlock(b.id, { textStyle })}
                    />
                    <Field label={b.textStyle === "body" ? "Text" : "Heading"}>
                      <input type="text" value={b.label} placeholder="e.g. Master Dashboard" onChange={(e) => putBlock(b.id, { label: e.target.value })} />
                    </Field>
                    {b.textStyle !== "body" && (
                      <Field label="Text under it (optional)">
                        <textarea rows={2} value={b.prompt ?? ""} placeholder="A short line of text" onChange={(e) => putBlock(b.id, { prompt: e.target.value || undefined })} />
                      </Field>
                    )}
                    {b.textStyle !== "body" && <HeadingLook b={b} putBlock={putBlock} />}
                  </>
                )}
                {k === "info" && <InfoFields b={b} putBlock={putBlock} />}
                {k === "record" && <RecordFields b={b} putBlock={putBlock} rowsForPage={rowsForPage} />}
                {k === "divider" && <p className="hint">A thin line across the page between the sections above and below it.</p>}
                {k === "spacer" && (
                  <Segmented<SpacerSize> label="Open space" value={b.spacer ?? "medium"} options={(["small", "medium", "large"] as const).map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))} onChange={(spacer) => putBlock(b.id, { spacer })} />
                )}
                {k === "prompt" && (
                  <>
                    <Field label="Heading">
                      <input type="text" value={b.label} placeholder="e.g. MY RESPONSE (optional)" onChange={(e) => putBlock(b.id, { label: e.target.value })} />
                    </Field>
                    <Field label="Prompt (optional)">
                      <textarea rows={2} value={b.prompt ?? ""} placeholder="e.g. What obedience, action, or posture does this word call for?" onChange={(e) => putBlock(b.id, { prompt: e.target.value || undefined })} />
                    </Field>
                    <Field label="Number in a circle (optional)">
                      <input type="text" value={b.badge ?? ""} maxLength={3} placeholder="e.g. 1" onChange={(e) => putBlock(b.id, { badge: e.target.value || undefined })} />
                    </Field>
                    {b.label.trim() && <HeadingLook b={b} putBlock={putBlock} />}
                    <Select
                      label="Writing area"
                      value={b.responseStyle ?? "own"}
                      options={styleOptions}
                      onChange={(v) => {
                        const responseStyle = v === "own" ? undefined : (v as ResponseStyle);
                        if (responseStyle === "table") {
                          const rows = b.table?.rows ?? b.lineCount ?? 6;
                          putBlock(b.id, { responseStyle, space: "fixed", lineCount: rows, table: b.table ?? { columns: ["Task", "Due", "Done"], rows, showHeader: true, borders: "grid" } });
                        } else if (responseStyle === "checkboxes") {
                          putBlock(b.id, { responseStyle, space: "fixed", lineCount: b.lineCount ?? 5 });
                        } else {
                          putBlock(b.id, { responseStyle });
                        }
                      }}
                    />
                    {!same && writing && (
                      <Segmented<string>
                        label="Writing space"
                        value={amount}
                        options={[
                          ...(Object.keys(WRITING_AMOUNTS) as WritingAmount[]).map((a) => ({ value: a, label: AMOUNT_LABEL[a] })),
                          { value: "fill", label: "Fill remaining space" },
                        ]}
                        onChange={(v) => putBlock(b.id, v === "fill" ? { space: "fill" } : { space: "fixed", lineCount: WRITING_AMOUNTS[v as WritingAmount] })}
                      />
                    )}
                    {!same && writing && amount === "exact" && (
                      <p className="hint">{mode === "equal" ? `Equal share${got !== undefined ? ` · ${plural(got, "line")} at this size` : ""}.` : `${plural(b.lineCount ?? 0, "line")} (set under More).`}</p>
                    )}
                    {!same && writing && mode === "fill" && got !== undefined && <p className="hint">Gets {plural(got, "line")} at this page size.</p>}
                    {b.responseStyle === "checkboxes" && (
                      <>
                        <div className="stepper">
                          <button type="button" className="btn btn--icon" aria-label="One row fewer" onClick={() => putBlock(b.id, { space: "fixed", lineCount: Math.max(1, (b.lineCount ?? 1) - 1) })}>−</button>
                          <LabeledNumeric label="Rows" step={1} rules={{ min: 1, max: 60, integer: true }} value={b.lineCount ?? got ?? 5} onCommit={(v) => v !== null && putBlock(b.id, { space: "fixed", lineCount: Math.max(1, Math.round(v)) })} />
                          <button type="button" className="btn btn--icon" aria-label="One row more" onClick={() => putBlock(b.id, { space: "fixed", lineCount: Math.min(60, (b.lineCount ?? 0) + 1) })}>+</button>
                        </div>
                        <Segmented<TaskMarker>
                          label="Marker"
                          value={b.taskMarker ?? "square"}
                          options={[{ value: "circle", label: "Circle" }, { value: "square", label: "Square" }, { value: "none", label: "None" }]}
                          onChange={(v) => putBlock(b.id, { taskMarker: v })}
                        />
                        <Segmented<TaskMarkerPosition>
                          label="Marker position"
                          value={b.taskMarkerPosition ?? "left"}
                          options={[{ value: "left", label: "Left" }, { value: "right", label: "Right" }]}
                          onChange={(v) => putBlock(b.id, { taskMarkerPosition: v })}
                        />
                        <Segmented<"on" | "off">
                          label="Writing line"
                          value={b.taskLines === false ? "off" : "on"}
                          options={[{ value: "on", label: "On" }, { value: "off", label: "Off" }]}
                          onChange={(v) => putBlock(b.id, { taskLines: v === "off" ? false : undefined })}
                        />
                      </>
                    )}
                    {b.responseStyle === "table" && (
                      <div className="subsection custom-table-controls">
                        <TableColumns b={b} putBlock={putBlock} />
                        {b.table?.numbering && rowsForPage && (
                          <button
                            type="button"
                            className="btn"
                            onClick={() => {
                              const n = rowsForPage(b.id);
                              if (n) putBlock(b.id, { space: "fixed", lineCount: n, table: { ...(b.table ?? { columns: ["Task", "Due", "Done"] }), rows: n } });
                            }}
                          >
                            Fit rows to one page
                          </button>
                        )}
                        <div className="row">
                          <NumberField
                            label={mode === "fill" ? "Rows (at least)" : "Rows"}
                            step={1}
                            min={1}
                            max={200}
                            value={b.table?.rows ?? b.lineCount ?? 6}
                            onChange={(rows) => {
                              const n = Math.max(1, Math.min(200, Math.round(rows)));
                              putBlock(b.id, { ...(mode === "fill" ? {} : { space: "fixed" as const, lineCount: n }), table: { ...(b.table ?? { columns: ["Task", "Due", "Done"] }), rows: n } });
                            }}
                          />
                          <Select
                            label="Lines"
                            value={b.table?.borders ?? "grid"}
                            options={[
                              { value: "grid", label: "Grid" },
                              { value: "horizontal", label: "Horizontal lines" },
                              { value: "minimal", label: "Minimal" },
                              { value: "none", label: "None" },
                            ]}
                            onChange={(v) => putBlock(b.id, { table: { ...(b.table ?? { columns: ["Task", "Due", "Done"], rows: b.lineCount ?? 6 }), borders: v as "grid" | "horizontal" | "minimal" | "none" } })}
                          />
                        </div>
                        {!same && (
                          <Segmented<string>
                            label="Table space"
                            value={mode === "fill" ? "fill" : b.table?.rowSpace ?? "standard"}
                            options={[...(Object.keys(TABLE_ROW_SCALE) as TableRowSpace[]).map((v) => ({ value: v, label: ROW_SPACE_LABEL[v] })), { value: "fill", label: "Fill remaining space" }]}
                            onChange={(v) => {
                              const t = b.table ?? { columns: ["Task", "Due", "Done"], rows: b.lineCount ?? 6 };
                              const rows = t.rows ?? b.lineCount ?? 6;
                              if (v === "fill") putBlock(b.id, { space: "fill", table: { ...t, rows, rowSpace: undefined } });
                              else putBlock(b.id, { space: "fixed", lineCount: rows, table: { ...t, rows, rowSpace: v === "standard" ? undefined : (v as TableRowSpace) } });
                            }}
                          />
                        )}
                        {mode === "fill" && <p className="hint">The rows stretch evenly down to the next section or the bottom of the page. If they would get very tall, a few more rows are drawn so each stays a comfortable height.</p>}
                        <Check
                          label="Header row with the column labels"
                          checked={b.table?.showHeader !== false}
                          onChange={(showHeader) => putBlock(b.id, { table: { ...(b.table ?? { columns: ["Task", "Due", "Done"], rows: b.lineCount ?? 6 }), showHeader } })}
                        />
                      </div>
                    )}
                    {(besideOk || b.beside) && (
                      <Check label="Beside the section above (two columns)" checked={!!b.beside && besideOk} onChange={(on) => putBlock(b.id, { beside: on || undefined })} />
                    )}
                  </>
                )}
                {k !== "divider" && k !== "spacer" && (
                  <Select<string> label="Section style" value={b.frame ?? "page"} options={frameOptions} onChange={(v) => putBlock(b.id, { frame: v === "page" ? undefined : (v as SectionFrame) })} />
                )}
                {/* Only writing areas have finer settings; a table's or checklist's are all shown above. */}
                {k === "prompt" && writing && !same && (
                  <details className="subsection">
                    <summary>More writing-space options</summary>
                    <div className="stepper">
                      <button type="button" className="btn btn--icon" aria-label="One line fewer" onClick={() => putBlock(b.id, { space: "fixed", lineCount: Math.max(0, (b.lineCount ?? got ?? 0) - 1) })}>−</button>
                      <LabeledNumeric label="Exact number of lines" step={1} rules={{ min: 0, max: 80, integer: true }} value={mode === "fixed" ? b.lineCount ?? 0 : got ?? b.lineCount ?? 0} onCommit={(v) => v !== null && putBlock(b.id, { space: "fixed", lineCount: Math.round(v) })} />
                      <button type="button" className="btn btn--icon" aria-label="One line more" onClick={() => putBlock(b.id, { space: "fixed", lineCount: Math.min(80, (b.lineCount ?? got ?? 0) + 1) })}>+</button>
                    </div>
                    <p className="hint">Any number of lines, not just Compact, Standard or Spacious.</p>
                    {mode !== "fixed" && (
                      <>
                        <Check
                          label="Give it the same number of lines as the other sections that fill the space"
                          checked={mode === "equal"}
                          onChange={(on) => setSpace(b, on ? "equal" : "fill")}
                        />
                        <NumberField label="When space is tight, never fewer than (lines)" step={1} min={0} max={40} value={b.minLines ?? DEFAULT_MIN_LINES} onChange={(v) => putBlock(b.id, { minLines: Math.max(0, Math.round(v)) })} />
                      </>
                    )}
                  </details>
                )}
                <div className="card-actions">
                  <button type="button" className="btn" aria-label={`Move section ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>Move up</button>
                  <button type="button" className="btn" aria-label={`Move section ${i + 1} down`} disabled={i === blocks.length - 1} onClick={() => move(i, 1)}>Move down</button>
                  <button type="button" className="btn" disabled={blocks.length >= MAX_PROMPTS} onClick={() => duplicate(i)}>Duplicate</button>
                  <button type="button" className="btn btn--danger" onClick={() => remove(b.id)}>Remove</button>
                </div>
                <div className="card-actions section-done">
                  <button type="button" className="btn btn--primary" onClick={(e) => closeSection(e.currentTarget)} aria-label={`Done with ${name}`}>Done</button>
                  {composer && <button type="button" className="btn" onClick={(e) => { closeSection(e.currentTarget); toBuild(); }}>Add another piece</button>}
                </div>
              </div>
            </details>
          </li>
        );
      })}
    </ol>
  );
  const count = (
    <p className="field-label prompt-count">
      {composer ? "Your page · " : ""}
      {plural(blocks.length, "section")}
      {fit && fit.pages > 1 ? ` · ${fit.pages} pages` : ""}
    </p>
  );
  const addedNote = added && blocks.some((b) => b.id === added.id) && (
    <p className="hint composer-added" role="status">Added “{added.label}” — section {blocks.findIndex((b) => b.id === added.id) + 1}, open below.</p>
  );

  if (composer) {
    return (
      <div ref={root} className="prompt-editor prompt-editor--composer" data-testid="prompt-editor">
        <div className="composer-build" data-testid="build-your-page">
          <h3 className="composer-build__title">Build your page</h3>
          <p className="hint">Tap a piece to add it. Product Studio keeps everything aligned and inside the printable area.</p>
          <Pieces disabled={blocks.length >= MAX_PROMPTS} onAdd={addBlock} />
          {addedNote}
        </div>
        {count}
        {!blocks.length && <p className="hint">Nothing on the page yet — tap a piece above.</p>}
        {list}
        {fitIssues}
        {allowHeader && <HeaderEditor header={set.header} onChange={(h) => put({ header: h })} open={!!set.header} />}
        <details className="subsection page-options" data-testid="page-options">
          <summary>Page options</summary>
          {starters}
          {instructions}
          {sectionOptions}
          {whenFull}
        </details>
      </div>
    );
  }
  return (
    <div ref={root} className="prompt-editor" data-testid="prompt-editor">
      {starters}
      {header}
      {instructions}
      {count}
      {list}
      <details className="subsection add-section-menu" open>
        <summary>+ Add a section</summary>
        <p className="hint">Choose what you want to add. Product Studio keeps it aligned, printable, and inside the page.</p>
        <Pieces disabled={blocks.length >= MAX_PROMPTS} onAdd={addBlock} />
        {addedNote}
      </details>
      <details className="subsection">
        <summary>More section options</summary>
        {sectionOptions}
      </details>
      {whenFull}
      {fitIssues}
    </div>
  );
}

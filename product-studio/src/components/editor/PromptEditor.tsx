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
import { useEffect, useRef, useState } from "react";
import {
  amountOf, canSitBeside, contentOf, DEFAULT_MIN_LINES, kindOf, MAX_INFO_FIELDS, newPromptId, PROMPT_STARTERS, spaceOf, WRITING_AMOUNTS,
  type GuidedHeader, type InfoFieldStyle, type PromptBlockKind, type SectionFrame, type SpacerSize, type PromptBlock, type PromptSet, type PromptSpacing, type ResponseStyle, type SpaceMode, type TaskMarker, type TaskMarkerPosition, type WritingAmount,
} from "../../types/prompts";
import { Check, Field, LabeledNumeric, NumberField, Segmented, Select } from "./ui";

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
const SPACE_LABEL: Record<SpaceMode, string> = { fixed: "Exact number of lines", fill: "Fill remaining space", equal: "Equal share with the other “Equal share” sections" };
const AMOUNT_LABEL: Record<WritingAmount, string> = { compact: "Compact", standard: "Standard", spacious: "Spacious" };
const FRAME_LABEL: Record<SectionFrame, string> = { open: "Open (no border)", divider: "Line below", outline: "Soft outline", panel: "Filled panel", rounded: "Rounded panel" };

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
  heading: (b) => (b.prompt?.trim() ? "Heading + text" : "Heading"),
  info: (b) => `Info row · ${plural(Math.min(MAX_INFO_FIELDS, (b.fields ?? []).filter((f) => f.trim()).length) || 1, "blank")}`,
  divider: () => "Line",
  spacer: (b) => `${(b.spacer ?? "medium")[0].toUpperCase()}${(b.spacer ?? "medium").slice(1)} space`,
};

function HeaderEditor({ header, onChange }: { header: GuidedHeader | undefined; onChange: (h: GuidedHeader | undefined) => void }) {
  const h = header ?? {};
  const put = (patch: Partial<GuidedHeader>) => {
    const next = { ...h, ...patch };
    const empty = !next.eyebrow && !next.number && !next.subtitle && !next.reference && !next.rule && !next.fields?.length;
    onChange(empty ? undefined : next);
  };
  const fields = (v: string) => {
    const list = v.split(",").map((f) => f.trim());
    return list.some(Boolean) ? list : undefined;
  };
  return (
    <details className="subsection prompt-header-editor">
      <summary>Page header (optional)</summary>
      <p className="hint">Shown above the sections on the page's first side. The writing space is measured below it.</p>
      <div className="row">
        <Field label="Step label">
          <input type="text" value={h.eyebrow ?? ""} placeholder="e.g. STEP TWO" onChange={(e) => put({ eyebrow: e.target.value || undefined })} />
        </Field>
        <Field label="Step number">
          <input type="text" value={h.number ?? ""} placeholder="e.g. 02" onChange={(e) => put({ number: e.target.value || undefined })} />
        </Field>
      </div>
      <Field label="Subtitle">
        <input type="text" value={h.subtitle ?? ""} placeholder="e.g. The Word" onChange={(e) => put({ subtitle: e.target.value || undefined })} />
      </Field>
      <Field label="Scripture or reference">
        <input type="text" value={h.reference ?? ""} placeholder="e.g. Habakkuk 2:2" onChange={(e) => put({ reference: e.target.value || undefined })} />
      </Field>
      <Check label="Short decorative rule under the header" checked={!!h.rule} onChange={(rule) => put({ rule: rule || undefined })} />
      <Field label="Small fields (comma separated)">
        <input type="text" value={(h.fields ?? []).join(", ")} placeholder="e.g. Date, Source" onChange={(e) => put({ fields: fields(e.target.value) })} />
      </Field>
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

export function PromptEditor({
  set,
  onChange,
  ownStyleLabel = "As designed",
  allowInstructions = false,
  allowHeader = false,
  allowStarters = false,
  composer = false,
  fit,
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
    putSpace({ blocks: [...blocks, { id, ...block }] });
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
                    <Field label="Heading">
                      <input type="text" value={b.label} placeholder="e.g. Master Dashboard" onChange={(e) => putBlock(b.id, { label: e.target.value })} />
                    </Field>
                    <Field label="Text under it (optional)">
                      <textarea rows={2} value={b.prompt ?? ""} placeholder="A short line of text" onChange={(e) => putBlock(b.id, { prompt: e.target.value || undefined })} />
                    </Field>
                  </>
                )}
                {k === "info" && <InfoFields b={b} putBlock={putBlock} />}
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
                        <Field label="Column labels (comma separated)">
                          <input
                            type="text"
                            value={(b.table?.columns ?? ["Task", "Due", "Done"]).join(", ")}
                            onChange={(e) => {
                              const columns = e.target.value.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 8);
                              putBlock(b.id, { table: { ...(b.table ?? { rows: b.lineCount ?? 6 }), columns: columns.length ? columns : ["Column 1", "Column 2"] } });
                            }}
                          />
                        </Field>
                        <div className="row">
                          <NumberField
                            label="Rows"
                            step={1}
                            min={1}
                            max={30}
                            value={b.table?.rows ?? b.lineCount ?? 6}
                            onChange={(rows) => {
                              const n = Math.max(1, Math.min(30, Math.round(rows)));
                              putBlock(b.id, { space: "fixed", lineCount: n, table: { ...(b.table ?? { columns: ["Task", "Due", "Done"] }), rows: n } });
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
                {k === "prompt" && (
                  <details className="subsection">
                    <summary>More</summary>
                    {!same && (
                      <Segmented<SpaceMode> label="Writing space, exactly" value={mode} options={(["fixed", "fill", "equal"] as const).map((v) => ({ value: v, label: SPACE_LABEL[v] }))} onChange={(v) => setSpace(b, v)} />
                    )}
                    {!same && mode === "fixed" && b.responseStyle !== "table" && (
                      <div className="stepper">
                        <button type="button" className="btn btn--icon" aria-label="One line fewer" onClick={() => putBlock(b.id, { lineCount: Math.max(0, (b.lineCount ?? 0) - 1) })}>−</button>
                        <LabeledNumeric label="Writing lines" step={1} rules={{ min: 0, max: 80, integer: true }} value={b.lineCount ?? 0} onCommit={(v) => v !== null && putBlock(b.id, { lineCount: Math.round(v) })} />
                        <button type="button" className="btn btn--icon" aria-label="One line more" onClick={() => putBlock(b.id, { lineCount: Math.min(80, (b.lineCount ?? 0) + 1) })}>+</button>
                      </div>
                    )}
                    {!same && mode !== "fixed" && (
                      <NumberField label="Never fewer than (lines)" step={1} min={0} max={40} value={b.minLines ?? DEFAULT_MIN_LINES} onChange={(v) => putBlock(b.id, { minLines: Math.max(0, Math.round(v)) })} />
                    )}
                    <Segmented<"field" | "list">
                      label="Holds"
                      value={contentOf(b).mode}
                      options={[{ value: "field", label: "One answer" }, { value: "list", label: "A list of entries" }]}
                      onChange={(m) => putBlock(b.id, { content: { ...b.content, mode: m } })}
                    />
                  </details>
                )}
                <div className="card-actions">
                  <button type="button" className="btn" aria-label={`Move section ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>Move up</button>
                  <button type="button" className="btn" aria-label={`Move section ${i + 1} down`} disabled={i === blocks.length - 1} onClick={() => move(i, 1)}>Move down</button>
                  <button type="button" className="btn" disabled={blocks.length >= MAX_PROMPTS} onClick={() => duplicate(i)}>Duplicate</button>
                  <button type="button" className="btn btn--danger" onClick={() => remove(b.id)}>Remove</button>
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
        <details className="subsection page-options" data-testid="page-options">
          <summary>Page options</summary>
          {starters}
          {header}
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

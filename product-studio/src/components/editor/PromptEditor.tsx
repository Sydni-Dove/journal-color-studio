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
import { DEFAULT_MIN_LINES, newPromptId, PROMPT_STARTERS, spaceOf, type GuidedHeader, type PromptBlock, type PromptSet, type PromptSpacing, type ResponseStyle, type SpaceMode, type TaskMarker, type TaskMarkerPosition } from "../../types/prompts";
import { Check, Field, LabeledNumeric, NumberField, Segmented, Select } from "./ui";

const MAX_PROMPTS = 20;
const STYLE_LABEL: Record<ResponseStyle | "own", string> = {
  own: "As designed",
  ruled: "Ruled lines",
  blank: "Blank space",
  "dot-grid": "Dot grid",
  checkboxes: "Checklist",
  table: "Table",
};
const SPACE_LABEL: Record<SpaceMode, string> = { fixed: "Fixed lines", fill: "Fill remaining space", equal: "Equal share" };

/** How the current sections fit: pages each time, a plain problem when they can't, and the lines each section gets. */
export type PromptFit = { pages: number; problem?: string; lines?: Record<string, number>; pageOf?: Record<string, number> };

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** The row's one-line summary of a section's writing space. */
function spaceSummary(set: PromptSet, b: PromptBlock, got: number | undefined): string {
  const unit = b.responseStyle === "checkboxes" ? "item" : b.responseStyle === "table" ? "row" : "line";
  if (set.sameLines !== undefined) return plural(set.sameLines, unit);
  const mode = spaceOf(b);
  if (mode === "fixed") return plural(b.lineCount ?? 0, unit);
  const n = got !== undefined ? ` · ${plural(got, unit)}` : "";
  return mode === "equal" ? `Equal share${n}` : `Fills space${n}`;
}

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

export function PromptEditor({
  set,
  onChange,
  ownStyleLabel = "As designed",
  allowInstructions = false,
  allowHeader = false,
  allowStarters = false,
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
  /** How the current sections fit: pages each time, a plain problem when they can't, lines per section. */
  fit?: PromptFit;
}) {
  const blocks = set.blocks;
  const put = (patch: Partial<PromptSet>) => onChange({ ...set, ...patch });
  // Choosing writing space makes the proportions the creator's own: an older page's legacy proportions stop applying.
  const putSpace = (patch: Partial<PromptSet>) => onChange({ ...set, ...patch, legacyWeights: undefined });
  const putBlock = (id: string, patch: Partial<PromptBlock>) => {
    const next = { blocks: blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) };
    return "space" in patch || "lineCount" in patch || "minLines" in patch ? putSpace(next) : put(next);
  };
  const addBlock = (block: Omit<PromptBlock, "id">) => putSpace({ blocks: [...blocks, { id: newPromptId(), ...block }] });
  const remove = (id: string) => put({ blocks: blocks.filter((b) => b.id !== id) });
  const duplicate = (i: number) => putSpace({ blocks: [...blocks.slice(0, i + 1), { ...blocks[i], id: newPromptId() }, ...blocks.slice(i + 1)] });
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    put({ blocks: next });
  };
  const setSpace = (b: PromptBlock, space: SpaceMode) => putBlock(b.id, space === "fixed" ? { space, lineCount: b.lineCount ?? fit?.lines?.[b.id] ?? 6 } : { space });
  const same = set.sameLines !== undefined;
  const fewerLines = () => {
    if (same) return put({ sameLines: Math.max(DEFAULT_MIN_LINES, (set.sameLines ?? DEFAULT_MIN_LINES) - 1) });
    put({ blocks: blocks.map((b) => (spaceOf(b) === "fixed" && b.lineCount !== undefined ? { ...b, lineCount: Math.max(b.minLines ?? DEFAULT_MIN_LINES, b.lineCount - 1) } : b)) });
  };
  const styleOptions = (["own", "ruled", "blank", "dot-grid", "checkboxes", "table"] as const).map((v) => ({ value: v, label: v === "own" ? ownStyleLabel : STYLE_LABEL[v] }));

  return (
    <div className="prompt-editor" data-testid="prompt-editor">
      {allowStarters && (
        <Select
          label="Start from a structure (replaces the sections)"
          value="__none"
          options={[{ value: "__none", label: "Choose…" }, ...PROMPT_STARTERS.map((s) => ({ value: s.id, label: s.label }))]}
          onChange={(v) => {
            const starter = PROMPT_STARTERS.find((s) => s.id === v);
            if (starter) onChange({ ...starter.set(), header: set.header, instructions: set.instructions, whenFull: set.whenFull, spacing: set.spacing });
          }}
        />
      )}
      {allowHeader && <HeaderEditor header={set.header} onChange={(header) => put({ header })} />}
      {allowInstructions && (
        <Field label="Instructions (optional)">
          <textarea rows={2} value={set.instructions ?? ""} placeholder="A sentence or two under the title" onChange={(e) => put({ instructions: e.target.value || undefined })} />
        </Field>
      )}
      <p className="field-label prompt-count">
        {plural(blocks.length, "section")}
        {fit && fit.pages > 1 ? ` · ${fit.pages} pages` : ""}
      </p>
      <ol className="prompt-list">
        {blocks.map((b, i) => {
          const mode = spaceOf(b);
          const name = b.label.trim() || b.prompt?.trim() || `Section ${i + 1}`;
          const got = fit?.lines?.[b.id];
          return (
            <li key={b.id}>
              <details className="prompt-block" data-prompt={b.id}>
                <summary>
                  <span className="prompt-block__name">{name}</span>
                  <span className="prompt-block__space" data-testid="section-space">
                    {spaceSummary(set, b, got)}
                    {fit && fit.pages > 1 && fit.pageOf?.[b.id] !== undefined ? ` · page ${fit.pageOf[b.id] + 1}` : ""}
                  </span>
                </summary>
                <div className="prompt-block__body">
                  <Field label="Heading">
                    <input type="text" value={b.label} placeholder="e.g. MY RESPONSE (optional)" onChange={(e) => putBlock(b.id, { label: e.target.value })} />
                  </Field>
                  <Field label="Prompt (optional)">
                    <textarea rows={2} value={b.prompt ?? ""} placeholder="e.g. What obedience, action, or posture does this word call for?" onChange={(e) => putBlock(b.id, { prompt: e.target.value || undefined })} />
                  </Field>
                  {!same && (
                    <Segmented<SpaceMode> label="Writing space" value={mode} options={(["fixed", "fill", "equal"] as const).map((v) => ({ value: v, label: SPACE_LABEL[v] }))} onChange={(v) => setSpace(b, v)} />
                  )}
                  {!same && mode === "fixed" && b.responseStyle !== "table" && (
                    <div className="stepper">
                      <button type="button" className="btn btn--icon" aria-label="One line fewer" onClick={() => putBlock(b.id, { lineCount: Math.max(0, (b.lineCount ?? 0) - 1) })}>−</button>
                      <LabeledNumeric label="Writing lines" step={1} rules={{ min: 0, max: 80, integer: true }} value={b.lineCount ?? 0} onCommit={(v) => v !== null && putBlock(b.id, { lineCount: Math.round(v) })} />
                      <button type="button" className="btn btn--icon" aria-label="One line more" onClick={() => putBlock(b.id, { lineCount: Math.min(80, (b.lineCount ?? 0) + 1) })}>+</button>
                    </div>
                  )}
                  {!same && mode !== "fixed" && (
                    <>
                      <p className="hint">
                        {got !== undefined ? `Gets ${plural(got, "line")} on this page size. ` : ""}
                        {mode === "fill" ? "Takes the space the other sections leave." : "Every “Equal share” section gets the same number of lines."}
                      </p>
                      <NumberField label="Never fewer than (lines)" step={1} min={0} max={40} value={b.minLines ?? DEFAULT_MIN_LINES} onChange={(v) => putBlock(b.id, { minLines: Math.max(0, Math.round(v)) })} />
                    </>
                  )}
                  <Select
                    label="Writing area"
                    value={b.responseStyle ?? "own"}
                    options={styleOptions}
                    onChange={(v) => {
                      const responseStyle = v === "own" ? undefined : (v as ResponseStyle);
                      if (responseStyle === "table") {
                        const rows = b.table?.rows ?? b.lineCount ?? 6;
                        putBlock(b.id, {
                          responseStyle,
                          space: "fixed",
                          lineCount: rows,
                          table: b.table ?? { columns: ["Task", "Due", "Done"], rows, showHeader: true, borders: "grid" },
                        });
                      } else {
                        putBlock(b.id, { responseStyle });
                      }
                    }}
                  />
                  {b.responseStyle === "checkboxes" && (
                    <div className="row">
                      <Select
                        label="Task marker"
                        value={b.taskMarker ?? "square"}
                        options={[
                          { value: "square", label: "Square" },
                          { value: "circle", label: "Circle" },
                          { value: "none", label: "None" },
                        ]}
                        onChange={(v) => putBlock(b.id, { taskMarker: v as TaskMarker })}
                      />
                      <Select
                        label="Marker position"
                        value={b.taskMarkerPosition ?? "left"}
                        options={[
                          { value: "left", label: "Left" },
                          { value: "right", label: "Right" },
                        ]}
                        onChange={(v) => putBlock(b.id, { taskMarkerPosition: v as TaskMarkerPosition })}
                      />
                    </div>
                  )}
                  {b.responseStyle === "table" && (
                    <div className="subsection custom-table-controls">
                      <Field label="Column headings (comma separated)">
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
                          label="Borders"
                          value={b.table?.borders ?? "grid"}
                          options={[
                            { value: "grid", label: "Full grid" },
                            { value: "horizontal", label: "Horizontal lines only" },
                            { value: "minimal", label: "Minimal" },
                            { value: "none", label: "None" },
                          ]}
                          onChange={(v) => putBlock(b.id, { table: { ...(b.table ?? { columns: ["Task", "Due", "Done"], rows: b.lineCount ?? 6 }), borders: v as "grid" | "horizontal" | "minimal" | "none" } })}
                        />
                      </div>
                      <Check
                        label="Show header row"
                        checked={b.table?.showHeader !== false}
                        onChange={(showHeader) => putBlock(b.id, { table: { ...(b.table ?? { columns: ["Task", "Due", "Done"], rows: b.lineCount ?? 6 }), showHeader } })}
                      />
                    </div>
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
      <details className="subsection add-section-menu">
        <summary>+ Add section</summary>
        <p className="hint">Choose what you want to add. Product Studio keeps it aligned, printable, and inside the page.</p>
        <div className="card-actions add-section-grid">
          <button type="button" className="btn" disabled={blocks.length >= MAX_PROMPTS} onClick={() => addBlock({ label: "Writing", space: "fill", responseStyle: "ruled" })}>Writing lines</button>
          <button type="button" className="btn" disabled={blocks.length >= MAX_PROMPTS} onClick={() => addBlock({ label: "Notes", space: "fill", responseStyle: "blank" })}>Blank writing area</button>
          <button type="button" className="btn" disabled={blocks.length >= MAX_PROMPTS} onClick={() => addBlock({ label: "Notes", space: "fill", responseStyle: "dot-grid" })}>Dot grid</button>
          <button type="button" className="btn" disabled={blocks.length >= MAX_PROMPTS} onClick={() => addBlock({ label: "To Do", space: "fixed", lineCount: 8, responseStyle: "checkboxes", taskMarker: "square", taskMarkerPosition: "left" })}>Checklist</button>
          <button type="button" className="btn" disabled={blocks.length >= MAX_PROMPTS} onClick={() => addBlock({ label: "Table", space: "fixed", lineCount: 6, responseStyle: "table", table: { columns: ["Task", "Due", "Done"], rows: 6, showHeader: true, borders: "grid" } })}>Table</button>
          <button type="button" className="btn" disabled={blocks.length >= MAX_PROMPTS} onClick={() => addBlock({ label: "Prompt", prompt: "Write your prompt here.", space: "fixed", lineCount: 6, responseStyle: "ruled" })}>Prompt + response</button>
        </div>
      </details>
      <details className="subsection">
        <summary>More section options</summary>
        <Check label="Use the same number of lines for every section" checked={same} onChange={(on) => put({ sameLines: on ? blocks.find((b) => b.lineCount !== undefined)?.lineCount ?? 4 : undefined })} />
        {same && <NumberField label="Lines per section" step={1} min={0} max={60} value={set.sameLines ?? 4} onChange={(v) => put({ sameLines: Math.max(0, Math.round(v)) })} />}
        <Segmented<PromptSpacing>
          label="Space between sections"
          value={set.spacing ?? "standard"}
          options={[{ value: "tight", label: "Less" }, { value: "standard", label: "Standard" }, { value: "roomy", label: "More" }]}
          onChange={(spacing) => put({ spacing: spacing === "standard" ? undefined : spacing })}
        />
      </details>
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
    </div>
  );
}

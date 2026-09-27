/**
 * PROMPTS — the one editor for prompt + response content (types/prompts.ts),
 * used by guided book pages (Meeting With God, reviews, custom…), devotional
 * recipes and worksheets. Plain choices only: how many prompts, their
 * wording, writing lines, answer style, space between prompts, and what to do
 * when they don't fit. The layout engine decides the measurements.
 */
import { DEFAULT_MIN_LINES, newPromptId, type PromptBlock, type PromptSet, type PromptSpacing, type ResponseStyle } from "../../types/prompts";
import { Check, Field, LabeledNumeric, NumberField, Segmented, Select } from "./ui";

const MAX_PROMPTS = 20;
const STYLE_LABEL: Record<ResponseStyle | "own", string> = {
  own: "As designed",
  ruled: "Writing lines",
  blank: "Blank space",
  "dot-grid": "Dot grid",
  checkboxes: "Checklist",
};

export type PromptFit = { pages: number; problem?: string };

export function PromptEditor({
  set,
  onChange,
  ownStyleLabel = "As designed",
  allowInstructions = false,
  fit,
}: {
  set: PromptSet;
  onChange: (next: PromptSet) => void;
  /** What "the page's own style" means here (a recipe's design, or the product's writing lines). */
  ownStyleLabel?: string;
  allowInstructions?: boolean;
  /** How the current prompts fit: pages each time, and a plain problem when they can't. */
  fit?: PromptFit;
}) {
  const blocks = set.blocks;
  const put = (patch: Partial<PromptSet>) => onChange({ ...set, ...patch });
  const putBlock = (id: string, patch: Partial<PromptBlock>) => put({ blocks: blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) });
  const add = () => put({ blocks: [...blocks, { id: newPromptId(), label: `Prompt ${blocks.length + 1}` }] });
  const remove = (id: string) => put({ blocks: blocks.filter((b) => b.id !== id) });
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    put({ blocks: next });
  };
  const setCount = (n: number) => {
    const count = Math.max(0, Math.min(MAX_PROMPTS, Math.round(n)));
    if (count < blocks.length) put({ blocks: blocks.slice(0, count) });
    else put({ blocks: [...blocks, ...Array.from({ length: count - blocks.length }, (_, k) => ({ id: newPromptId(), label: `Prompt ${blocks.length + k + 1}` }))] });
  };
  const same = set.sameLines !== undefined;
  const fewerLines = () => {
    if (same) return put({ sameLines: Math.max(DEFAULT_MIN_LINES, (set.sameLines ?? DEFAULT_MIN_LINES) - 1) });
    put({ blocks: blocks.map((b) => (b.lineCount !== undefined ? { ...b, lineCount: Math.max(b.minLines ?? DEFAULT_MIN_LINES, b.lineCount - 1) } : b)) });
  };
  const styleOptions = (["own", "ruled", "blank", "dot-grid", "checkboxes"] as const).map((v) => ({ value: v, label: v === "own" ? ownStyleLabel : STYLE_LABEL[v] }));

  return (
    <div className="prompt-editor" data-testid="prompt-editor">
      {allowInstructions && (
        <Field label="Instructions (optional)">
          <textarea rows={2} value={set.instructions ?? ""} placeholder="A sentence or two under the title" onChange={(e) => put({ instructions: e.target.value || undefined })} />
        </Field>
      )}
      <NumberField label="Number of prompts" step={1} min={0} max={MAX_PROMPTS} value={blocks.length} onChange={setCount} />
      <Check
        label="Use the same number of lines for every prompt"
        checked={same}
        onChange={(on) => put({ sameLines: on ? blocks.find((b) => b.lineCount !== undefined)?.lineCount ?? 4 : undefined })}
      />
      {same && <NumberField label="Lines per prompt" step={1} min={0} max={60} value={set.sameLines ?? 4} onChange={(v) => put({ sameLines: Math.max(0, Math.round(v)) })} />}
      <ol className="prompt-list">
        {blocks.map((b, i) => (
          <li key={b.id} className="prompt-block" data-prompt={b.id}>
            <Field label={`Prompt ${i + 1}`}>
              <input type="text" value={b.label} placeholder="e.g. What did God say?" onChange={(e) => putBlock(b.id, { label: e.target.value })} />
            </Field>
            <div className="row">
              {!same && (
                <LabeledNumeric
                  label="Writing lines"
                  step={1}
                  placeholder="fill the space"
                  rules={{ min: 0, max: 60, integer: true, allowEmpty: true }}
                  value={b.lineCount}
                  onCommit={(v) => putBlock(b.id, { lineCount: v === null ? undefined : Math.round(v) })}
                />
              )}
              <Select label="Answer area" value={b.responseStyle ?? "own"} options={styleOptions} onChange={(v) => putBlock(b.id, { responseStyle: v === "own" ? undefined : (v as ResponseStyle) })} />
            </div>
            <div className="card-actions">
              <button type="button" className="btn btn--icon" aria-label={`Move prompt ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button type="button" className="btn btn--icon" aria-label={`Move prompt ${i + 1} down`} disabled={i === blocks.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button type="button" className="btn btn--danger" onClick={() => remove(b.id)}>Remove prompt</button>
            </div>
          </li>
        ))}
      </ol>
      {!same && blocks.length > 0 && <p className="hint">Leave “Writing lines” blank to let a prompt fill the space left on the page.</p>}
      <button type="button" className="btn" onClick={add} disabled={blocks.length >= MAX_PROMPTS}>Add prompt</button>
      <Segmented<PromptSpacing>
        label="Space between prompts"
        value={set.spacing ?? "standard"}
        options={[{ value: "tight", label: "Less" }, { value: "standard", label: "Standard" }, { value: "roomy", label: "More" }]}
        onChange={(spacing) => put({ spacing: spacing === "standard" ? undefined : spacing })}
      />
      <Select
        label="When the prompts don't fit on the page"
        value={set.whenFull ?? "continue"}
        options={[{ value: "continue", label: "Continue on another page" }, { value: "fewer-lines", label: "Use fewer lines first, then continue" }]}
        onChange={(v) => put({ whenFull: v === "continue" ? undefined : (v as "fewer-lines") })}
      />
      {fit && fit.pages > 1 && !fit.problem && <p className="hint" data-testid="prompt-continues">These prompts continue on another page ({fit.pages} pages each time).</p>}
      {fit?.problem && (
        <div className="issue issue--error" data-testid="prompt-fit">
          <div className="issue-title">{fit.problem}</div>
          <div className="card-actions">
            <button type="button" className="btn" onClick={() => put({ blocks: blocks.slice(0, -1) })} disabled={!blocks.length}>Use fewer prompts</button>
            <button type="button" className="btn" onClick={fewerLines}>Use fewer lines</button>
            {set.whenFull === "fewer-lines" && <button type="button" className="btn" onClick={() => put({ whenFull: undefined })}>Continue prompts on another page</button>}
          </div>
        </div>
      )}
    </div>
  );
}

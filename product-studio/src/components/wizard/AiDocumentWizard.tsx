/**
 * GENERATE WITH AI — describe a printable document; Product Studio proposes an
 * outline (sections, fields, tables, writing space, repetition, page setup);
 * the maker reviews and edits it; the studio builds an ordinary, editable
 * product with its own engines and opens the editor. One path for every kind
 * of document (engines/generate/pipeline.ts).
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { buildFromOutline, checkProposal, requestSpec } from "../../engines/generate/pipeline";
import { appendBatch, batchRequest, MAX_DEVELOPED_ENTRIES, MAX_DOCUMENT_PAGES, PageLimitError, quantityChoices, reduceToFit, requestedOverLimit, SIZES, splitToFit, type CheckedSpec, type DocSpec, type Flag, type GenerationMode, type PageSize, type SpecComponent, type SpecEntries, type SpecSection } from "../../engines/generate/spec";
import type { ProductProject } from "../../types/project";
import { PageThumb } from "../preview/PageThumb";
import { resolveDocument } from "../../engines/document/resolve";

const SIZE_LABEL: Record<PageSize, string> = { "5.5x8.5": "5.5 × 8.5 in", "6x9": "6 × 9 in", "7x9": "7 × 9 in", "8x10": "8 × 10 in", "8.5x11": "8.5 × 11 in (Letter)", a5: "A5", a4: "A4" };
const BINDING_LABEL: Record<DocSpec["page"]["binding"], string> = { book: "Bound book", spiral: "Spiral", stapled: "Stapled booklet", loose: "Loose pages" };
const KIND_LABEL: Record<SpecComponent["kind"], string> = {
  heading: "Heading", text: "Text", fields: "Fill-in blanks", writing: "Writing space", checklist: "Checklist", table: "Table", list: "List", records: "Record cards", divider: "Divider", spacer: "Space",
};
const EXAMPLES = [
  "A 30-day prayer journal: each day has a Scripture to copy out, what I sense God saying, and a prayer.",
  "An inventory notebook for a small bakery: numbered stock count sheets and reorder logs, landscape.",
  "A client intake form for a hair salon: contact details, hair history, allergies, and a consent signature.",
  "A vehicle maintenance log: service records with date, mileage, work done, cost and shop.",
  "A homeschool reading log for kids: book, pages read, a favourite part, and a parent check-off.",
];

const move = <T,>(xs: T[], i: number, d: -1 | 1) => {
  const j = i + d;
  if (j < 0 || j >= xs.length) return xs;
  const out = [...xs];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
};

/** Who wrote a part, as the review shows it: the maker's own words; in a developed document, AI-written content; otherwise a suggestion. */
const sourceBadge = (source: SpecComponent["source"], develop: boolean) =>
  source === "user"
    ? <span className="badge badge--ok" title="Your own wording, used exactly as you wrote it">Your words</span>
    : develop
      ? <span className="badge badge--ai" title="Written by the AI — read it and edit it before creating">AI-written</span>
      : <span className="badge badge--neutral" title="Written by the AI — check it">Suggested</span>;

/** A part whose wording the AI wrote (marked AI-written once created) — not blanks, tables, rules or a plain writing space. */
const writesWording = (c: SpecComponent) =>
  !c.fromEntryField && (c.kind === "heading" ? !!(c.text || c.label) : c.kind === "text" || c.kind === "writing" ? !!c.text?.trim() : c.kind === "list" || c.kind === "checklist" ? c.items.length > 0 : false);

function Part({ c, i, n, set, remove, shift, develop }: { c: SpecComponent; i: number; n: number; set: (c: SpecComponent) => void; remove: () => void; shift: (d: -1 | 1) => void; develop: boolean }) {
  const hasColumns = c.kind === "table" || c.kind === "fields" || c.kind === "records";
  return (
    <li className="ai-part" data-part={c.id}>
      <div className="row">
        <strong>{KIND_LABEL[c.kind]}</strong>
        {sourceBadge(c.source, develop && writesWording(c))}
        {c.fromEntryField && <span className="hint">prints each entry's “{c.fromEntryField}”</span>}
        <span className="spacer" />
        <button type="button" className="btn btn--ghost" disabled={i === 0} aria-label="Move part up" onClick={() => shift(-1)}>↑</button>
        <button type="button" className="btn btn--ghost" disabled={i === n - 1} aria-label="Move part down" onClick={() => shift(1)}>↓</button>
        <button type="button" className="btn btn--ghost" onClick={remove}>Remove</button>
      </div>
      {c.kind !== "divider" && c.kind !== "spacer" && (c.kind !== "heading" || !c.fromEntryField) && (
        <label className="field">
          <span>{c.kind === "heading" ? "Heading" : "Heading (optional)"}</span>
          <input type="text" value={c.kind === "heading" ? (c.text ?? c.label ?? "") : (c.label ?? "")} onChange={(e) => set(c.kind === "heading" ? { ...c, text: e.target.value, label: null } : { ...c, label: e.target.value || null })} />
        </label>
      )}
      {(c.kind === "text" || c.kind === "writing") && !c.fromEntryField && (
        <label className="field">
          <span>{c.kind === "text" ? "Text" : "Prompt (optional)"}</span>
          <textarea className="data-textarea" rows={c.kind === "text" ? 4 : 2} value={c.text ?? ""} onChange={(e) => set({ ...c, text: e.target.value || null })} />
        </label>
      )}
      {hasColumns && (
        <label className="field">
          <span>{c.kind === "table" ? "Columns" : "Blanks"} (one per line)</span>
          <textarea
            className="data-textarea"
            rows={Math.min(8, Math.max(2, c.fields.length))}
            value={c.fields.map((f) => f.label).join("\n")}
            onChange={(e) => set({ ...c, fields: e.target.value.split("\n").map((label, k) => ({ label, valueType: c.fields[k]?.valueType ?? "text" })) })}
          />
        </label>
      )}
      {(c.kind === "list" || (c.kind === "checklist" && c.items.length > 0)) && !c.fromEntryField && (
        <label className="field">
          <span>Items (one per line)</span>
          <textarea className="data-textarea" rows={Math.min(8, Math.max(2, c.items.length))} value={c.items.join("\n")} onChange={(e) => set({ ...c, items: e.target.value.split("\n") })} />
        </label>
      )}
      {(c.kind === "table" || c.kind === "records") && (
        <div className="row">
          <label className="check"><input type="checkbox" checked={c.numbered} onChange={(e) => set({ ...c, numbered: e.target.checked })} /> Numbered</label>
          <label className="check"><input type="checkbox" checked={c.fillPage} onChange={(e) => set({ ...c, fillPage: e.target.checked })} /> {c.kind === "table" ? "Rows fill each page" : "Cards fill each page"}</label>
        </div>
      )}
    </li>
  );
}

function OutlineSection({ s, i, n, spec, set, remove, shift, develop }: { s: SpecSection; i: number; n: number; spec: DocSpec; set: (s: SpecSection) => void; remove: () => void; shift: (d: -1 | 1) => void; develop: boolean }) {
  const mode = s.repeat.mode;
  return (
    <div className="ai-section" data-section={s.id}>
      <div className="ai-section-head">
        <label className="field ai-section-title">
          <span>Page {i + 1}</span>
          <input type="text" value={s.title} aria-label={`Page ${i + 1} title`} onChange={(e) => set({ ...s, title: e.target.value })} />
        </label>
        <label className="field">
          <span>Repeats</span>
          <select value={mode} aria-label={`Page ${i + 1} repeats`} onChange={(e) => set({ ...s, repeat: { mode: e.target.value as SpecSection["repeat"]["mode"], count: e.target.value === "copies" ? Math.max(2, s.repeat.count) : 1 } })}>
            <option value="once">Once</option>
            <option value="copies">Several copies</option>
            {spec.entries && <option value="per-entry">Once for each entry of “{spec.entries.name}”</option>}
          </select>
        </label>
        {mode === "copies" && (
          <label className="field">
            <span>Copies</span>
            <input type="number" inputMode="numeric" min={1} max={500} value={s.repeat.count} aria-label={`Page ${i + 1} copies`} onChange={(e) => set({ ...s, repeat: { mode, count: Math.max(1, Math.min(500, Math.round(Number(e.target.value) || 1))) } })} />
          </label>
        )}
      </div>
      {s.purpose && <p className="hint">{s.purpose}</p>}
      <ul className="ai-parts">
        {s.components.map((c, k) => (
          <Part
            key={c.id}
            c={c}
            develop={develop}
            i={k}
            n={s.components.length}
            set={(next) => set({ ...s, components: s.components.map((x, j) => (j === k ? next : x)) })}
            remove={() => set({ ...s, components: s.components.filter((_, j) => j !== k) })}
            shift={(d) => set({ ...s, components: move(s.components, k, d) })}
          />
        ))}
      </ul>
      <div className="row">
        <button
          type="button"
          className="btn"
          onClick={() => set({ ...s, components: [...s.components, { id: `${s.id}-added-${s.components.length + 1}`, kind: "writing", label: "Notes", text: null, source: "suggested", fromEntryField: null, fields: [], rows: null, numbered: false, fillPage: false, lines: 6, items: [], marker: null, size: null }] })}
        >
          + Add writing space
        </button>
        <span className="spacer" />
        <button type="button" className="btn btn--ghost" disabled={i === 0} aria-label={`Move page ${i + 1} up`} onClick={() => shift(-1)}>Move up</button>
        <button type="button" className="btn btn--ghost" disabled={i === n - 1} aria-label={`Move page ${i + 1} down`} onClick={() => shift(1)}>Move down</button>
        <button type="button" className="btn btn--ghost" disabled={n <= 1} onClick={remove}>Remove page</button>
      </div>
    </div>
  );
}

/** An entry's one-line name: its first filled value. */
const entryName = (e: SpecEntries, r: SpecEntries["records"][number], i: number) => {
  const v = e.fields.map((f) => r.values.find((x) => x.key === f.key)?.value?.trim()).find(Boolean) ?? "(empty)";
  return `${i + 1}. ${v.length > 60 ? `${v.slice(0, 59)}…` : v}`;
};

/**
 * The entries the AI wrote, each open to read and edit before anything is created (the maker's own entries are
 * listed, not edited here: they're used exactly as written). Long series continue with "Write the next batch".
 */
function EntriesReview({ e, set, develop, onBatch, busy, message }: { e: SpecEntries; set: (e: SpecEntries) => void; develop: boolean; onBatch: (count: number) => void; busy: boolean; message: string }) {
  const [count, setCount] = useState(10);
  const ai = e.source === "suggested";
  const setValue = (ri: number, key: string, value: string) =>
    set({ ...e, records: e.records.map((r, j) => (j !== ri ? r : { values: r.values.some((v) => v.key === key) ? r.values.map((v) => (v.key === key ? { key, value } : v)) : [...r.values, { key, value }] })) });
  return (
    <div className="ai-entries" data-testid="ai-entries">
      <strong>{e.name}</strong> {sourceBadge(e.source, develop)}
      <p className="hint">{e.records.length} entr{e.records.length === 1 ? "y" : "ies"} · each has {e.fields.map((f) => f.label).join(", ")}.{ai ? " Written by the AI: read each one and change anything you like. After creating they stay marked “AI-written — review” in Your content until you mark them reviewed." : " Add, edit or paste entries in Your content after creating."}</p>
      {ai && e.records.map((r, ri) => (
        <details key={ri} className="ai-entry" data-entry={ri + 1} data-source="suggested">
          <summary>{entryName(e, r, ri)} <span className="badge badge--ai">AI-written</span></summary>
          {e.fields.map((f) => {
            const v = r.values.find((x) => x.key === f.key)?.value ?? "";
            return (
              <label key={f.key} className="field">
                <span>{f.label}</span>
                {f.valueType === "longText" || v.length > 80 ? (
                  <textarea className="data-textarea" rows={Math.min(10, Math.max(3, Math.ceil(v.length / 70)))} value={v} aria-label={`Entry ${ri + 1} ${f.label}`} onChange={(ev) => setValue(ri, f.key, ev.target.value)} />
                ) : (
                  <input type="text" value={v} aria-label={`Entry ${ri + 1} ${f.label}`} onChange={(ev) => setValue(ri, f.key, ev.target.value)} />
                )}
              </label>
            );
          })}
          <div className="row"><span className="spacer" /><button type="button" className="btn btn--ghost" onClick={() => set({ ...e, records: e.records.filter((_, j) => j !== ri) })}>Remove this entry</button></div>
        </details>
      ))}
      {develop && ai && (
        <div className="ai-batch">
          <label className="field">
            <span>How many more</span>
            <input type="number" inputMode="numeric" min={1} max={MAX_DEVELOPED_ENTRIES} value={count} aria-label="How many more entries" onChange={(ev) => setCount(Math.max(1, Math.min(MAX_DEVELOPED_ENTRIES, Math.round(Number(ev.target.value) || 1))))} />
          </label>
          <button type="button" className="btn" disabled={busy} onClick={() => onBatch(count)}>{busy ? "Writing the next entries…" : "Write the next batch"}</button>
          <p className="hint" style={{ flexBasis: "100%" }}>Continues from entry {e.records.length + 1}, up to {MAX_DEVELOPED_ENTRIES} at a time. Uses one of today's proposals.</p>
          {message && <p className="hint" role="status">{message}</p>}
        </div>
      )}
    </div>
  );
}

/** A batch's flags name its own entries 1, 2…: renumbered to where they sit in the whole list. */
const shiftFlags = (flags: Flag[], by: number): Flag[] => flags.map((f) => { const m = /^Entry (\d+)$/.exec(f.where); return m ? { ...f, where: `Entry ${Number(m[1]) + by}` } : f; });

/** A clean outline: blank lines typed into column / item boxes don't become empty columns or items. */
const tidy = (spec: DocSpec): DocSpec => ({
  ...spec,
  sections: spec.sections.map((s) => ({ ...s, components: s.components.map((c) => ({ ...c, fields: c.fields.filter((f) => f.label.trim()), items: c.items.filter((x) => x.trim()) })) })),
});

/**
 * signedIn: generation runs on the server for signed-in accounts only (free accounts: a few proposals a day), so a
 * signed-out maker is asked to sign in before writing a description, not after. account: the sign-in card.
 */
export function AiDocumentWizard({ onCreate, onCreateMany, onCancel, signedIn = true, account }: { onCreate: (p: ProductProject) => void; onCreateMany?: (ps: ProductProject[]) => void; onCancel: () => void; signedIn?: boolean; account?: ReactNode }) {
  const [description, setDescriptionRaw] = useState("");
  // A quantity past the page limit, found before anything is sent; and how many documents the maker chose to split into.
  const [over, setOver] = useState<ReturnType<typeof requestedOverLimit>>(null);
  const [splitInto, setSplitInto] = useState(1);
  const [limitNote, setLimitNote] = useState("");
  const setDescription = (d: string) => { setDescriptionRaw(d); setOver(null); setSplitInto(1); setLimitNote(""); };
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checked, setChecked] = useState<CheckedSpec | null>(null);
  const [spec, setSpec] = useState<DocSpec | null>(null);
  const [alt, setAlt] = useState<string | null>(null);
  // Structure only (Phase 8) is the default; Develop original content is the maker's choice each time.
  const [mode, setMode] = useState<GenerationMode>("structure");
  const [entryCount, setEntryCount] = useState("");
  const develop = mode === "develop";
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchMessage, setBatchMessage] = useState("");

  const generate = async () => {
    if (busy) return; // one request at a time
    setError("");
    // A quantity that can't fit one document: the maker chooses what to do — nothing sent, no proposal used.
    const tooMany = requestedOverLimit(description);
    if (tooMany) {
      setOver(tooMany);
      return;
    }
    setBusy(true);
    setBatchMessage("");
    try {
      const n = Math.round(Number(entryCount));
      const raw = await requestSpec(description, content, develop ? { mode, ...(n >= 1 ? { entryCount: Math.min(MAX_DEVELOPED_ENTRIES, n) } : {}) } : {});
      const c = checkProposal(raw, description, content, mode);
      setChecked(c);
      setSpec(c.spec);
      setAlt(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Document generation failed.");
    } finally {
      setBusy(false);
    }
  };

  // The product the outline makes, measured with the studio's own engines (after edits settle).
  const [built, setBuilt] = useState<ReturnType<typeof buildFromOutline> | null>(null);
  const [buildError, setBuildError] = useState("");
  // An outline past the page limit: its page count, and the parts if the maker chose to split it.
  const [overPages, setOverPages] = useState(0);
  const [parts, setParts] = useState<DocSpec[] | null>(null);
  useEffect(() => {
    if (!spec || !checked) return;
    const t = window.setTimeout(() => {
      try {
        setBuilt(buildFromOutline(tidy(spec), content, checked));
        setBuildError("");
        setOverPages(0);
      } catch (e) {
        setBuilt(null);
        setBuildError(e instanceof Error ? e.message : "This outline can't be built yet.");
        setOverPages(e instanceof PageLimitError ? e.pages : 0);
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [spec, checked, content]);
  const chosen = built?.review.alternatives.find((a) => a.id === alt);
  const finalProject = useMemo(() => (built ? (chosen ? chosen.apply(built.project) : built.project) : null), [built, chosen]);
  const doc = useMemo(() => (finalProject ? resolveDocument(finalProject) : null), [finalProject]);
  const setSection = (i: number, s: SpecSection) => setSpec((x) => x && { ...x, sections: x.sections.map((y, j) => (j === i ? s : y)) });
  // Editing the outline after choosing to split it starts the choice again.
  useEffect(() => setParts(null), [spec]);
  /** The documents to create: one, or the parts the maker chose (each built and checked on its own). */
  const create = () => {
    if (!spec || !checked) return;
    try {
      // Split before proposing: the outline already holds one part's quantity — the same outline, once per part.
      const many = parts ?? (splitInto > 1 && !spec.entries ? Array.from({ length: splitInto }, (_, i) => ({ ...spec, title: `${spec.title} — Part ${i + 1} of ${splitInto}` })) : null);
      if (many && onCreateMany) return onCreateMany(many.map((p) => buildFromOutline(tidy(p), content, checked).project));
      if (finalProject) onCreate(finalProject);
    } catch (e) {
      setBuildError(e instanceof Error ? e.message : "This outline can't be built.");
    }
  };
  const reduce = spec && overPages ? reduceToFit(tidy(spec), overPages) : null;
  const split = spec && overPages ? splitToFit(tidy(spec), overPages) : null;
  /** The next entries of the list the AI is writing, added to the end (one of the day's proposals). */
  const nextBatch = async (count: number) => {
    if (!spec || !checked || batchBusy) return;
    const batch = batchRequest(spec, count);
    if (!batch) return;
    setBatchBusy(true);
    setBatchMessage("");
    try {
      const raw = await requestSpec(description, content, { mode: "develop", batch });
      const more = checkProposal(raw, description, content, "develop");
      const before = spec.entries?.records.length ?? 0;
      const r = appendBatch(spec, more);
      setSpec(r.spec);
      if (r.added) setChecked({ ...checked, flags: [...checked.flags, ...shiftFlags(more.flags.filter((f) => /^Entry \d+$/.test(f.where)), before)] });
      setBatchMessage(r.message);
    } catch (e) {
      setBatchMessage(e instanceof Error ? e.message : "The next batch couldn't be written.");
    } finally {
      setBatchBusy(false);
    }
  };

  if (!spec || !checked)
    return (
      <div className="page-shell ai-wizard">
        <div className="row"><h1 style={{ flex: 1 }}>Describe your document</h1><button className="btn" onClick={onCancel}>Cancel</button></div>
        <p className="lede">Say what you want to print — a journal, log, form, workbook, planner page… Product Studio proposes an outline you can change before anything is made.</p>
        {!signedIn ? (
          <div className="card ai-signin" data-testid="ai-signin">
            <p><strong>Sign in first.</strong> Generate with AI works with a free Dove Expressions account (a few proposals a day), so your description is never written for nothing. After you sign in, describe your document here.</p>
            {account}
          </div>
        ) : (
          <>
        <label className="field">
          <span>What should it be?</span>
          <textarea className="data-textarea" rows={5} value={description} aria-label="Describe your document" placeholder={EXAMPLES[0]} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div className="ai-examples">
          {EXAMPLES.map((x) => <button key={x} type="button" className="choice" onClick={() => setDescription(x)}>{x.split(":")[0]}</button>)}
        </div>
        <label className="field">
          <span>Your own wording (optional)</span>
          <textarea className="data-textarea" rows={6} value={content} aria-label="Your own wording" placeholder="Paste questions, instructions, days or entries you've already written. They're used exactly as you wrote them." onChange={(e) => setContent(e.target.value)} />
        </label>
        <fieldset className="ai-mode" data-testid="ai-mode">
          <legend>What should the AI do?</legend>
          <label className="ai-mode-option">
            <input type="radio" name="ai-mode" value="structure" checked={!develop} onChange={() => setMode("structure")} />
            <span><strong>Structure only</strong><br /><span className="hint">Pages, sections, blanks and writing space, with what you wrote placed exactly. It doesn't write the content.</span></span>
          </label>
          <label className="ai-mode-option">
            <input type="radio" name="ai-mode" value="develop" checked={develop} onChange={() => setMode("develop")} />
            <span><strong>Develop original content</strong><br /><span className="hint">It also writes the content — days, lessons, exercises, Scripture connections, activities — marked “AI-written” for you to review and edit. What you wrote yourself is never changed.</span></span>
          </label>
        </fieldset>
        {develop && (
          <div className="ai-batch">
            <label className="field">
              <span>How many entries? (optional)</span>
              <input type="number" inputMode="numeric" min={1} max={MAX_DEVELOPED_ENTRIES} value={entryCount} placeholder="e.g. 7" aria-label="How many entries" onChange={(e) => setEntryCount(e.target.value)} />
            </label>
            <p className="hint" style={{ flex: "1 1 240px" }}>Up to {MAX_DEVELOPED_ENTRIES} per request, each written in full. For a longer series, write the rest with “Write the next batch” on the next screen. Scripture is quoted only from public-domain translations (KJV, WEB); every reference and quotation is listed for you to check.</p>
          </div>
        )}
        <p className="hint">{develop ? "Everything the AI writes is original and marked AI-written until you review it; your own wording is kept word for word." : "The AI suggests structure and wording; your own wording is kept word for word."} Nothing it writes is checked against laws or regulations — verify anything that must be. Either way, each proposal uses one of today's free proposals.</p>
        <div className="row">
          <button className="btn btn--primary" disabled={busy || description.trim().length < 10} onClick={() => void generate()}>{busy ? (develop ? "Writing the content… (up to two minutes)" : "Proposing an outline…") : develop ? "Propose and write the content" : "Propose an outline"}</button>
        </div>
        {over && (() => {
          const c = quantityChoices(description, over);
          return (
            <div className="card ai-limit" data-testid="ai-page-limit" role="alert">
              <p><strong>“{over.text}” is more than one document can hold.</strong> A document can have at most {MAX_DOCUMENT_PAGES} pages. Nothing was sent and none of today's proposals was used. How would you like to continue?</p>
              <div className="row">
                <button type="button" className="btn" onClick={() => { setDescription(c.reduce.description); setLimitNote(`Changed to ${c.reduce.label.replace(/^Reduce to /, "")}. Press “Propose” when you're ready.`); }}>{c.reduce.label}</button>
                <button type="button" className="btn" onClick={() => { setDescription(c.split.description); setSplitInto(c.split.parts); setLimitNote(`Each document will have ${c.split.label.replace(/^Split into \d+ documents of /, "")}; ${c.split.parts} documents are created from one proposal. Press “Propose” when you're ready.`); }}>{c.split.label}</button>
                <button type="button" className="btn btn--ghost" onClick={() => setOver(null)}>I'll change it myself</button>
              </div>
            </div>
          );
        })()}
        {limitNote && <p className="hint" role="status" data-testid="ai-limit-note">{limitNote}</p>}
        {error && <p className="data-issue" role="alert">{error}</p>}
          </>
        )}
      </div>
    );

  const unplaced = built?.checked.unplaced ?? checked.unplaced;
  return (
    <div className="page-shell ai-wizard">
      <div className="row">
        <h1 style={{ flex: 1 }}>Review the outline</h1>
        <button className="btn" onClick={() => { setSpec(null); setChecked(null); setBuilt(null); }}>Change the description</button>
        <button className="btn" onClick={onCancel}>Cancel</button>
      </div>
      <div className="ai-review">
        <div className="ai-outline">
          <label className="field"><span>Title</span><input type="text" value={spec.title} aria-label="Document title" onChange={(e) => setSpec({ ...spec, title: e.target.value })} /></label>
          {spec.summary && <p className="hint">{spec.summary}</p>}
          {spec.notes.length > 0 && (
            <details className="section" open>
              <summary>How your request was read</summary>
              <ul className="layout-findings">{spec.notes.map((n) => <li key={n}>{n}</li>)}</ul>
            </details>
          )}
          {(checked.problems.length > 0 || checked.flags.length > 0) && (
            <div className="ai-checks" data-testid="ai-checks">
              {checked.problems.map((p, i) => <p key={i} className={p.level === "note" ? "hint" : "data-issue"}>{p.level === "left-out" ? "Left out: " : p.level === "adjusted" ? "Changed: " : ""}{p.message}</p>)}
              {(() => {
                const items = checked.flags.map((f, i) => (
                  <p key={`f${i}`} className="data-issue" data-flag={f.kind}>
                    {f.kind === "compliance" ? "Check before printing — a claim about legal or regulatory requirements (not verified): " : f.kind === "quotation" ? "Check before printing — quoted Scripture the AI supplied (wording and translation not verified): " : "Check before printing — a reference the AI supplied (not verified): "}“{f.text}” ({f.where})
                  </p>
                ));
                // A developed series can carry a reference on every entry: listed in full, folded when long.
                return items.length > 5 ? <details open={false} data-testid="ai-flags"><summary className="data-issue">{items.length} references and quotations to check before printing</summary>{items}</details> : items;
              })()}
            </div>
          )}
          <div className="row">
            <label className="field"><span>Page size</span><select aria-label="Page size" value={spec.page.size} onChange={(e) => setSpec({ ...spec, page: { ...spec.page, size: e.target.value as PageSize } })}>{SIZES.map((s) => <option key={s} value={s}>{SIZE_LABEL[s]}</option>)}</select></label>
            <label className="field"><span>Turned</span><select aria-label="Orientation" value={spec.page.orientation} onChange={(e) => setSpec({ ...spec, page: { ...spec.page, orientation: e.target.value as "portrait" | "landscape" } })}><option value="portrait">Upright (portrait)</option><option value="landscape">Sideways (landscape)</option></select></label>
            <label className="field"><span>Binding</span><select aria-label="Binding" value={spec.page.binding} onChange={(e) => setSpec({ ...spec, page: { ...spec.page, binding: e.target.value as DocSpec["page"]["binding"] } })}>{(Object.keys(BINDING_LABEL) as DocSpec["page"]["binding"][]).map((b) => <option key={b} value={b}>{BINDING_LABEL[b]}</option>)}</select></label>
          </div>
          {spec.page.why && <p className="hint">{spec.page.why}</p>}
          {spec.entries && <EntriesReview e={spec.entries} develop={checked.mode === "develop"} set={(e) => setSpec({ ...spec, entries: e })} onBatch={(n) => void nextBatch(n)} busy={batchBusy} message={batchMessage} />}
          {spec.sections.map((s, i) => (
            <OutlineSection key={s.id} develop={checked.mode === "develop"} s={s} i={i} n={spec.sections.length} spec={spec} set={(x) => setSection(i, x)} remove={() => setSpec({ ...spec, sections: spec.sections.filter((_, j) => j !== i) })} shift={(d) => setSpec({ ...spec, sections: move(spec.sections, i, d) })} />
          ))}
          {unplaced.length > 0 && (
            <p className="data-issue" role="note" data-testid="ai-unplaced">
              {unplaced.length} line{unplaced.length === 1 ? "" : "s"} of your own wording {unplaced.length === 1 ? "isn't" : "aren't"} in any section, so {unplaced.length === 1 ? "it goes" : "they go"} on a “Your content” page at the end — word for word, nothing dropped. Move {unplaced.length === 1 ? "it" : "them"} where you want after creating.
            </p>
          )}
        </div>
        <aside className="ai-fit">
          <strong>How it prints</strong>
          {buildError && <p className="data-issue">{buildError}</p>}
          {overPages > 0 && reduce && split && (
            <div className="ai-limit" data-testid="ai-limit-choices">
              <p className="hint">Nothing is changed until you choose:</p>
              {reduce.changes.length > 0 && (
                <>
                  <button type="button" className="btn" onClick={() => setSpec(reduce.spec)}>Reduce to fit one document</button>
                  <ul className="layout-findings">{reduce.changes.map((c) => <li key={c}>{c}</li>)}</ul>
                </>
              )}
              {split.length > 1 && (
                <>
                  <button type="button" className="btn" onClick={() => setParts(split)}>Split into {split.length} documents</button>
                  <p className="hint">The same pages shared between {split.length} documents{spec.entries ? " (entries in order: part 1 gets the first ones)" : ""}; pages that print once (a title, an introduction) are in each.</p>
                </>
              )}
            </div>
          )}
          {parts && (
            <p className="hint" role="status" data-testid="ai-parts">Creates {parts.length} documents: {parts.map((p) => p.title).join("; ")}.</p>
          )}
          {splitInto > 1 && !parts && !spec.entries && (
            <p className="hint" role="status" data-testid="ai-parts">Creates {splitInto} documents from this outline, “Part 1 of {splitInto}” to “Part {splitInto} of {splitInto}”.</p>
          )}
          {built && doc && (
            <>
              <p className="hint" data-testid="ai-pages">{doc.recipe.pageCount} page{doc.recipe.pageCount === 1 ? "" : "s"} · {SIZE_LABEL[spec.page.size]} {spec.page.orientation === "landscape" ? "sideways" : "upright"} · {BINDING_LABEL[spec.page.binding].toLowerCase()}</p>
              {doc.recipe.pages.length > 0 && <PageThumb doc={doc} index={Math.max(0, doc.recipe.pages.findIndex((p) => !p.filler))} heightPx={260} />}
              {built.limits.length > 0 && (
                <div className="ai-limits" data-testid="ai-limits">
                  {built.limits.map((m) => <p key={m} className="data-issue">{m}</p>)}
                  {built.bindings.length > 0 ? (
                    <div className="row">
                      {built.bindings.map((b) => (
                        <button key={b} type="button" className="btn" onClick={() => setSpec({ ...spec, page: { ...spec.page, binding: b } })}>Use {BINDING_LABEL[b].toLowerCase()}</button>
                      ))}
                    </div>
                  ) : (
                    <p className="hint">Add pages (more copies or entries), or create it and add pages in the editor.</p>
                  )}
                </div>
              )}
              {built.review.findings.length ? (
                <ul className="layout-findings">{built.review.findings.slice(0, 4).map((f, i) => <li key={i}>{f.message}</li>)}</ul>
              ) : (
                <p className="hint">Fits comfortably: nothing crowded, squeezed or left mostly empty.</p>
              )}
              {built.review.alternatives.length > 0 && (
                <>
                  <div className="group-label">Better fits, measured on these pages</div>
                  {built.review.alternatives.map((a) => (
                    <label key={a.id} className="check ai-alt">
                      <input type="radio" name="ai-alt" checked={alt === a.id} onChange={() => setAlt(a.id)} />
                      <span><strong>{a.title}</strong><br /><span className="hint">{a.outcome.join(" · ")}</span></span>
                    </label>
                  ))}
                  <label className="check"><input type="radio" name="ai-alt" checked={alt === null} onChange={() => setAlt(null)} /> Keep the outline as it is</label>
                </>
              )}
            </>
          )}
          {(() => {
            const n = parts?.length ?? (splitInto > 1 && !spec.entries ? splitInto : 1);
            return <button className="btn btn--primary" disabled={!spec.sections.length || (n === 1 && !finalProject) || (n > 1 && !onCreateMany)} onClick={create}>{n > 1 ? `Create ${n} documents` : "Create the document"}</button>;
          })()}
          <p className="hint">It opens in the editor, where everything can still be changed.</p>
        </aside>
      </div>
    </div>
  );
}

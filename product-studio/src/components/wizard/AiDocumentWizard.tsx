/**
 * GENERATE WITH AI — describe a printable document; Product Studio proposes an
 * outline (sections, fields, tables, writing space, repetition, page setup);
 * the maker reviews and edits it; the studio builds an ordinary, editable
 * product with its own engines and opens the editor. One path for every kind
 * of document (engines/generate/pipeline.ts).
 */
import { useEffect, useMemo, useState } from "react";
import { buildFromOutline, checkProposal, requestSpec } from "../../engines/generate/pipeline";
import { SIZES, type CheckedSpec, type DocSpec, type PageSize, type SpecComponent, type SpecSection } from "../../engines/generate/spec";
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

function Part({ c, i, n, set, remove, shift }: { c: SpecComponent; i: number; n: number; set: (c: SpecComponent) => void; remove: () => void; shift: (d: -1 | 1) => void }) {
  const hasColumns = c.kind === "table" || c.kind === "fields" || c.kind === "records";
  return (
    <li className="ai-part" data-part={c.id}>
      <div className="row">
        <strong>{KIND_LABEL[c.kind]}</strong>
        <span className={`badge ${c.source === "user" ? "badge--ok" : "badge--neutral"}`} title={c.source === "user" ? "Your own wording, used exactly as you wrote it" : "Written by the AI — check it"}>{c.source === "user" ? "Your words" : "Suggested"}</span>
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

function OutlineSection({ s, i, n, spec, set, remove, shift }: { s: SpecSection; i: number; n: number; spec: DocSpec; set: (s: SpecSection) => void; remove: () => void; shift: (d: -1 | 1) => void }) {
  const mode = s.repeat.mode;
  return (
    <div className="ai-section" data-section={s.id}>
      <div className="row">
        <label className="field" style={{ flex: 1 }}>
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
            <input type="number" min={1} max={500} value={s.repeat.count} onChange={(e) => set({ ...s, repeat: { mode, count: Math.max(1, Math.min(500, Math.round(Number(e.target.value) || 1))) } })} />
          </label>
        )}
      </div>
      {s.purpose && <p className="hint">{s.purpose}</p>}
      <ul className="ai-parts">
        {s.components.map((c, k) => (
          <Part
            key={c.id}
            c={c}
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

/** A clean outline: blank lines typed into column / item boxes don't become empty columns or items. */
const tidy = (spec: DocSpec): DocSpec => ({
  ...spec,
  sections: spec.sections.map((s) => ({ ...s, components: s.components.map((c) => ({ ...c, fields: c.fields.filter((f) => f.label.trim()), items: c.items.filter((x) => x.trim()) })) })),
});

export function AiDocumentWizard({ onCreate, onCancel }: { onCreate: (p: ProductProject) => void; onCancel: () => void }) {
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checked, setChecked] = useState<CheckedSpec | null>(null);
  const [spec, setSpec] = useState<DocSpec | null>(null);
  const [alt, setAlt] = useState<string | null>(null);

  const generate = async () => {
    if (busy) return; // one request at a time
    setError("");
    setBusy(true);
    try {
      const raw = await requestSpec(description, content);
      const c = checkProposal(raw, description, content);
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
  useEffect(() => {
    if (!spec || !checked) return;
    const t = window.setTimeout(() => {
      try {
        setBuilt(buildFromOutline(tidy(spec), content, checked));
        setBuildError("");
      } catch (e) {
        setBuilt(null);
        setBuildError(e instanceof Error ? e.message : "This outline can't be built yet.");
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [spec, checked, content]);
  const chosen = built?.review.alternatives.find((a) => a.id === alt);
  const finalProject = useMemo(() => (built ? (chosen ? chosen.apply(built.project) : built.project) : null), [built, chosen]);
  const doc = useMemo(() => (finalProject ? resolveDocument(finalProject) : null), [finalProject]);
  const setSection = (i: number, s: SpecSection) => setSpec((x) => x && { ...x, sections: x.sections.map((y, j) => (j === i ? s : y)) });

  if (!spec || !checked)
    return (
      <div className="page-shell ai-wizard">
        <div className="row"><h1 style={{ flex: 1 }}>Describe your document</h1><button className="btn" onClick={onCancel}>Cancel</button></div>
        <p className="lede">Say what you want to print — a journal, log, form, workbook, planner page… Product Studio proposes an outline you can change before anything is made.</p>
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
        <p className="hint">The AI suggests structure and wording; your own wording is kept word for word. Nothing it suggests is checked against laws or regulations — verify anything that must be.</p>
        <div className="row">
          <button className="btn btn--primary" disabled={busy || description.trim().length < 10} onClick={() => void generate()}>{busy ? "Proposing an outline…" : "Propose an outline"}</button>
        </div>
        {error && <p className="data-issue" role="alert">{error}</p>}
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
              {checked.flags.map((f, i) => (
                <p key={`f${i}`} className="data-issue" data-flag={f.kind}>
                  {f.kind === "compliance" ? "Check before printing — a claim about legal or regulatory requirements (not verified): " : "Check before printing — a reference the AI supplied (not verified): "}“{f.text}” ({f.where})
                </p>
              ))}
            </div>
          )}
          <div className="row">
            <label className="field"><span>Page size</span><select aria-label="Page size" value={spec.page.size} onChange={(e) => setSpec({ ...spec, page: { ...spec.page, size: e.target.value as PageSize } })}>{SIZES.map((s) => <option key={s} value={s}>{SIZE_LABEL[s]}</option>)}</select></label>
            <label className="field"><span>Turned</span><select aria-label="Orientation" value={spec.page.orientation} onChange={(e) => setSpec({ ...spec, page: { ...spec.page, orientation: e.target.value as "portrait" | "landscape" } })}><option value="portrait">Upright (portrait)</option><option value="landscape">Sideways (landscape)</option></select></label>
            <label className="field"><span>Binding</span><select aria-label="Binding" value={spec.page.binding} onChange={(e) => setSpec({ ...spec, page: { ...spec.page, binding: e.target.value as DocSpec["page"]["binding"] } })}>{(Object.keys(BINDING_LABEL) as DocSpec["page"]["binding"][]).map((b) => <option key={b} value={b}>{BINDING_LABEL[b]}</option>)}</select></label>
          </div>
          {spec.page.why && <p className="hint">{spec.page.why}</p>}
          {spec.entries && (
            <div className="ai-entries">
              <strong>{spec.entries.name}</strong> <span className={`badge ${spec.entries.source === "user" ? "badge--ok" : "badge--neutral"}`}>{spec.entries.source === "user" ? "Your words" : "Suggested"}</span>
              <p className="hint">{spec.entries.records.length} entr{spec.entries.records.length === 1 ? "y" : "ies"} · each has {spec.entries.fields.map((f) => f.label).join(", ")}. Add, edit or paste entries in Your content after creating.</p>
            </div>
          )}
          {spec.sections.map((s, i) => (
            <OutlineSection key={s.id} s={s} i={i} n={spec.sections.length} spec={spec} set={(x) => setSection(i, x)} remove={() => setSpec({ ...spec, sections: spec.sections.filter((_, j) => j !== i) })} shift={(d) => setSpec({ ...spec, sections: move(spec.sections, i, d) })} />
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
          {built && doc && (
            <>
              <p className="hint" data-testid="ai-pages">{doc.recipe.pageCount} page{doc.recipe.pageCount === 1 ? "" : "s"} · {SIZE_LABEL[spec.page.size]} {spec.page.orientation === "landscape" ? "sideways" : "upright"} · {BINDING_LABEL[spec.page.binding].toLowerCase()}</p>
              {doc.recipe.pages.length > 0 && <PageThumb doc={doc} index={Math.max(0, doc.recipe.pages.findIndex((p) => !p.filler))} heightPx={260} />}
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
          <button className="btn btn--primary" disabled={!finalProject || !spec.sections.length} onClick={() => finalProject && onCreate(finalProject)}>Create the document</button>
          <p className="hint">It opens in the editor, where everything can still be changed.</p>
        </aside>
      </div>
    </div>
  );
}

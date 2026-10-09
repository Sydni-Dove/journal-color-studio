/**
 * CONTENT DATA — the product's own lists of entries (devotional days,
 * inventory items, log entries…), edited as forms built from each list's
 * fields. Every change goes through the editor's update(), so it saves, undoes
 * and syncs with the product. Nothing here changes the printed pages yet:
 * pages will read these lists in a later step.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { DataCollection, DataRecord, FieldDef, ProjectData, ValueType } from "../../types/document";
import {
  addCollection, addField, addRecord, applyImport, COLLECTION_STARTERS, displayValue, duplicateRecord, EDITABLE_TYPES, moveField, moveRecord,
  parseDelimited, planImport, recordIssues, removeCollection, removeField, removeRecord, renameCollection, setValue, updateField, VALUE_TYPE_LABEL,
} from "../../engines/data/data";
import { Check, Field, Section } from "./ui";
import { DEVOTIONAL_STRUCTURES, matchRoles, ROLE_LABEL, usesCollection, type DevotionalRole } from "../../presets/devotionalStructures";
import type { BookNode } from "../../types/recipe";

/** What the panel needs to print a list as the product's pages. */
export type BookLink = { structure: BookNode[] | undefined; use: (structureId: string, collectionId: string) => void };

/** Print this list as a devotional: choose a structure, see which fields it prints (and which it doesn't), use it. */
function DevotionalBox({ c, book }: { c: DataCollection; book: BookLink }) {
  const [structure, setStructure] = useState(DEVOTIONAL_STRUCTURES[0].id);
  const [done, setDone] = useState<string | null>(null);
  const { map, unused } = matchRoles(c);
  const used = usesCollection(book.structure, c.id);
  const roles = Object.keys(ROLE_LABEL) as DevotionalRole[];
  const fieldLabel = (key: string) => c.fields.find((f) => f.key === key)?.label ?? key;
  const chosen = DEVOTIONAL_STRUCTURES.find((x) => x.id === structure)!;
  return (
    <Section title={`Devotional design${used ? " · in use" : ""}`} open={used}>
      <p className="hint">{used ? `Your pages are made from “${c.name}”: one day per entry, in order. Try another design any time — your words stay exactly as they are.` : `Make this product's pages from “${c.name}”: one day per entry, in order. Your words are never changed; the page size, binding and colors still come from the product.`}</p>
      <Field label="Design">
        <select value={structure} aria-label="Devotional structure" onChange={(e) => { setStructure(e.target.value); setDone(null); }}>
          {DEVOTIONAL_STRUCTURES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
      </Field>
      <p className="hint">{chosen.description}</p>
      <ul className="data-roles">
        {roles.map((r) => (
          <li key={r}>{ROLE_LABEL[r]}: {map[r] ? <strong>{fieldLabel(map[r]!)}</strong> : <span className="hint">not in your entries — left out</span>}</li>
        ))}
      </ul>
      {unused.length > 0 && <p className="data-issue" role="note">Not printed by this design: {unused.map((f) => `“${f.label}”`).join(", ")}. To print it, rename it (under “What each entry has”) to one of the names above.</p>}
      <div className="row">
        <button
          type="button"
          className="btn btn--primary"
          disabled={!map.teaching && !map.title && !map.scripture}
          onClick={() => { book.use(structure, c.id); setDone(`Your pages now use “${chosen.label}” — see the preview. Any cover, divider and back cover pages were kept; Undo goes back.`); }}
        >
          {used ? "Use this design" : "Make my devotional pages"}
        </button>
      </div>
      {done && <p className="hint" role="status">{done}</p>}
    </Section>
  );
}

const PAGE_SIZE = 20;

/** A text input that edits a draft and commits on blur or Enter (Escape reverts), so typing "1." never flags an error mid-word and each finished edit is one undo step. */
function DraftInput({ value, onCommit, multiline, label, placeholder, invalid }: { value: string; onCommit: (v: string) => void; multiline?: boolean; label: string; placeholder?: string; invalid?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
  };
  const common = {
    value: draft ?? value,
    "aria-label": label,
    "aria-invalid": invalid || undefined,
    placeholder,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === "Escape") setDraft(null);
      else if (e.key === "Enter" && !multiline) commit();
    },
  };
  return multiline ? <textarea className="data-textarea" rows={4} {...common} /> : <input type="text" {...common} />;
}

const PLACEHOLDER: Partial<Record<ValueType, string>> = { date: "2026-10-08 or 10/8/2026", time: "14:30 or 2:30 pm", currency: "0.00", reference: "John 3:16", signature: "Signed on paper" };

/** One field's input, by its type. */
function ValueInput({ field, value, onCommit, issue }: { field: FieldDef; value: DataRecord["values"][string] | undefined; onCommit: (v: string | boolean | null) => void; issue?: string }) {
  const label = field.label + (field.required ? " (required)" : "");
  let input: ReactNode;
  if (field.valueType === "boolean" && (value === undefined || value === null || typeof value === "boolean")) {
    input = <Check label={field.label} checked={value === true} onChange={(v) => onCommit(v)} />;
    return <div className="data-value">{input}{issue && <p className="data-issue">{issue}</p>}</div>;
  }
  if (field.valueType === "choice") {
    const cur = value === null || value === undefined ? "" : String(value);
    const options = field.options ?? [];
    input = (
      <select value={cur} aria-label={field.label} aria-invalid={!!issue || undefined} onChange={(e) => onCommit(e.target.value || null)}>
        <option value="">—</option>
        {/* A value that isn't one of the choices (e.g. imported) stays visible until it is changed. */}
        {cur && !options.includes(cur) && <option value={cur}>{cur} (not a choice)</option>}
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  } else if (field.valueType === "signature") {
    return <p className="hint data-value"><strong>{field.label}:</strong> signed on paper — a line is printed for it.</p>;
  } else {
    input = <DraftInput label={field.label} value={displayValue(field, value)} multiline={field.valueType === "longText"} placeholder={PLACEHOLDER[field.valueType] ?? (field.unit ? field.unit : undefined)} invalid={!!issue} onCommit={(v) => onCommit(v)} />;
  }
  return (
    <label className="field data-value">
      <span>{label}{field.unit && field.valueType === "quantity" ? ` · ${field.unit}` : ""}</span>
      {input}
      {issue && <span className="data-issue" role="note">{issue}</span>}
    </label>
  );
}

/** A record's one-line name in the list: its first filled text value (a title, an item), else its first filled value. */
function recordTitle(c: DataCollection, r: DataRecord, n: number): string {
  const texty = (f: FieldDef) => f.valueType === "text" || f.valueType === "reference" || f.valueType === "longText";
  for (const f of [...c.fields.filter(texty), ...c.fields.filter((x) => !texty(x))]) {
    const v = r.values[f.key];
    if (v !== null && v !== undefined && v !== "" && typeof v !== "boolean") {
      const s = displayValue(f, v).replace(/\s+/g, " ");
      return `${n}. ${s.length > 48 ? `${s.slice(0, 47)}…` : s}`;
    }
  }
  return `${n}. (empty)`;
}

function FieldsEditor({ c, set }: { c: DataCollection; set: (fn: (d: ProjectData | undefined) => ProjectData) => void }) {
  const [label, setLabel] = useState("");
  return (
    <Section title={`What each entry has · ${c.fields.length}`}>
      <p className="hint">Each entry is filled in with these fields. Changing a field's type keeps what was typed; anything the new type can't read is flagged, not deleted.</p>
      {c.fields.map((f, i) => (
        <div key={f.key} className="data-field-row" data-field={f.key}>
          <div className="row">
            <Field label="Label"><DraftInput label={`Field ${i + 1} label`} value={f.label} onCommit={(v) => set((d) => updateField(d, c.id, f.key, { label: v.trim() || f.label }))} /></Field>
            <Field label="Type">
              <select value={f.valueType} aria-label={`Field ${i + 1} type`} onChange={(e) => set((d) => updateField(d, c.id, f.key, { valueType: e.target.value as ValueType }))}>
                {EDITABLE_TYPES.map((t) => <option key={t} value={t}>{VALUE_TYPE_LABEL[t]}</option>)}
              </select>
            </Field>
          </div>
          {f.valueType === "quantity" && <Field label="Unit"><DraftInput label={`Field ${i + 1} unit`} value={f.unit ?? ""} placeholder="lb, hours, units" onCommit={(v) => set((d) => updateField(d, c.id, f.key, { unit: v.trim() || undefined }))} /></Field>}
          {f.valueType === "choice" && (
            <Field label="Choices (comma-separated)">
              <DraftInput label={`Field ${i + 1} choices`} value={(f.options ?? []).join(", ")} onCommit={(v) => set((d) => updateField(d, c.id, f.key, { options: v.split(",").map((s) => s.trim()).filter(Boolean) }))} />
            </Field>
          )}
          <div className="row">
            <Check label="Required" checked={!!f.required} onChange={(v) => set((d) => updateField(d, c.id, f.key, { required: v || undefined }))} />
            <span className="spacer" />
            <button type="button" className="btn btn--ghost" disabled={i === 0} aria-label={`Move ${f.label} up`} onClick={() => set((d) => moveField(d, c.id, i, i - 1))}>↑</button>
            <button type="button" className="btn btn--ghost" disabled={i === c.fields.length - 1} aria-label={`Move ${f.label} down`} onClick={() => set((d) => moveField(d, c.id, i, i + 1))}>↓</button>
            <button type="button" className="btn btn--ghost" aria-label={`Remove field ${f.label}`} onClick={() => set((d) => removeField(d, c.id, f.key))}>Remove</button>
          </div>
        </div>
      ))}
      <div className="row">
        <Field label="New field"><input type="text" value={label} placeholder="e.g. Supplier" onChange={(e) => setLabel(e.target.value)} /></Field>
        <button type="button" className="btn" disabled={!label.trim()} onClick={() => { set((d) => addField(d, c.id, label)); setLabel(""); }}>Add field</button>
      </div>
      <p className="hint">A removed field's values stay with the entries (hidden); Undo brings the field back with them.</p>
    </Section>
  );
}

function ImportBox({ c, set }: { c: DataCollection; set: (fn: (d: ProjectData | undefined) => ProjectData) => void }) {
  const [text, setText] = useState("");
  const [header, setHeader] = useState<boolean | null>(null);
  const [mapping, setMapping] = useState<(string | null)[] | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const rows = useMemo(() => (text.trim() ? parseDelimited(text) : []), [text]);
  const plan = useMemo(() => (rows.length ? planImport(c.fields, rows, { header: header ?? undefined, mapping: mapping ?? undefined }) : null), [rows, c.fields, header, mapping]);
  const reset = (t: string) => { setText(t); setHeader(null); setMapping(null); setDone(null); };
  const withIssues = plan ? plan.rows.filter((r) => r.issues.length).length : 0;
  const cols = plan ? plan.mapping.length : 0;
  return (
    <Section title="Paste or import entries" open={!c.records.length}>
      <p className="hint">Paste rows from a spreadsheet, or choose a .csv file. Nothing is added until you confirm.</p>
      <textarea className="data-textarea" rows={5} aria-label="Pasted rows" value={text} placeholder={c.fields.map((f) => f.label).join("\t")} onChange={(e) => reset(e.target.value)} />
      <input
        type="file"
        accept=".csv,.tsv,.txt,text/csv,text/plain"
        aria-label="CSV file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) file.text().then(reset);
          e.target.value = "";
        }}
      />
      {done && <p className="hint" role="status">{done}</p>}
      {plan && (
        <>
          <Check label="First row names the columns" checked={!!plan.header} onChange={(v) => { setHeader(v); setMapping(null); }} />
          <div className="data-import-scroll">
            <table className="data-import">
              <thead>
                <tr>
                  {Array.from({ length: cols }, (_, i) => (
                    <th key={i}>
                      <select
                        aria-label={`Column ${i + 1}${plan.header?.[i] ? ` (${plan.header[i]})` : ""}`}
                        value={plan.mapping[i] ?? ""}
                        onChange={(e) => { const m = [...plan.mapping]; m[i] = e.target.value || null; setMapping(m); }}
                      >
                        <option value="">Don't import</option>
                        {c.fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                      </select>
                      {plan.header && <div className="hint">{plan.header[i]}</div>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(plan.header ? 1 : 0, (plan.header ? 1 : 0) + 5).map((r, ri) => (
                  <tr key={ri}>
                    {Array.from({ length: cols }, (_, i) => {
                      const key = plan.mapping[i];
                      const bad = key && plan.rows[ri]?.issues.some((x) => x.key === key);
                      return <td key={i} className={bad ? "data-import--bad" : !key ? "data-import--skip" : undefined}>{r[i] ?? ""}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">
            {plan.rows.length} entr{plan.rows.length === 1 ? "y" : "ies"}{plan.rows.length > 5 ? " (first 5 shown)" : ""}.
            {withIssues ? ` ${withIssues} with values their field can't read — they're kept as typed and flagged so you can fix them.` : ""}
            {plan.unmatched.length ? ` Not imported: column${plan.unmatched.length === 1 ? "" : "s"} ${plan.unmatched.map((i) => (plan.header?.[i] ? `“${plan.header[i]}”` : i + 1)).join(", ")} — choose a field above to include ${plan.unmatched.length === 1 ? "it" : "them"}.` : ""}
          </p>
          <div className="row">
            <button
              type="button"
              className="btn btn--primary"
              disabled={!plan.rows.length || plan.mapping.every((k) => !k)}
              onClick={() => { set((d) => applyImport(d, c.id, plan)); reset(""); setDone(`Added ${plan.rows.length} entr${plan.rows.length === 1 ? "y" : "ies"} to ${c.name}. Undo removes them.`); }}
            >
              Add {plan.rows.length} entr{plan.rows.length === 1 ? "y" : "ies"}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => reset("")}>Cancel</button>
          </div>
        </>
      )}
    </Section>
  );
}

function RecordsEditor({ c, set }: { c: DataCollection; set: (fn: (d: ProjectData | undefined) => ProjectData) => void }) {
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const pages = Math.max(1, Math.ceil(c.records.length / PAGE_SIZE));
  const p = Math.min(page, pages - 1);
  const flagged = c.records.filter((r) => recordIssues(c.fields, r).length).length;
  const add = () => {
    let id = "";
    set((d) => { const r = addRecord(d, c.id); id = r.recordId; return r.data; });
    setOpen(id);
    setPage(Math.floor(c.records.length / PAGE_SIZE));
  };
  return (
    <Section title={`Entries · ${c.records.length}${flagged ? ` · ${flagged} to check` : ""}`} open>
      {c.records.length === 0 && <p className="hint">No entries yet. Add one, or paste rows below.</p>}
      {c.records.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE).map((r, k) => {
        const i = p * PAGE_SIZE + k;
        const issues = recordIssues(c.fields, r);
        return (
          <details key={r.id} className="data-record" data-record={r.id} open={open === r.id} onToggle={(e) => { const o = (e.target as HTMLDetailsElement).open; if (o) setOpen(r.id); else if (open === r.id) setOpen(null); }}>
            <summary>
              <span className="data-record__title">{recordTitle(c, r, i + 1)}</span>
              {issues.length > 0 && <span className="badge badge--warning">{issues.length} to check</span>}
            </summary>
            {open === r.id && (
              <div className="section-body">
                {c.fields.map((f) => (
                  <ValueInput key={f.key} field={f} value={r.values[f.key]} issue={issues.find((x) => x.key === f.key)?.message} onCommit={(v) => set((d) => setValue(d, c.id, r.id, f.key, v))} />
                ))}
                <div className="row">
                  <button type="button" className="btn btn--ghost" disabled={i === 0} aria-label="Move entry up" onClick={() => set((d) => moveRecord(d, c.id, i, i - 1))}>↑ Up</button>
                  <button type="button" className="btn btn--ghost" disabled={i === c.records.length - 1} aria-label="Move entry down" onClick={() => set((d) => moveRecord(d, c.id, i, i + 1))}>↓ Down</button>
                  <button type="button" className="btn btn--ghost" onClick={() => { let id = ""; set((d) => { const x = duplicateRecord(d, c.id, r.id); id = x.recordId; return x.data; }); setOpen(id); }}>Duplicate</button>
                  <button type="button" className="btn btn--ghost" onClick={() => set((d) => removeRecord(d, c.id, r.id))}>Delete</button>
                </div>
              </div>
            )}
          </details>
        );
      })}
      {pages > 1 && (
        <div className="row" role="group" aria-label="Entry pages">
          <button type="button" className="btn btn--ghost" disabled={p === 0} onClick={() => setPage(p - 1)}>‹ Previous</button>
          <span className="hint">Entries {p * PAGE_SIZE + 1}–{Math.min(c.records.length, (p + 1) * PAGE_SIZE)} of {c.records.length}</span>
          <button type="button" className="btn btn--ghost" disabled={p >= pages - 1} onClick={() => setPage(p + 1)}>Next ›</button>
        </div>
      )}
      <div className="row">
        <button type="button" className="btn" onClick={add}>+ Add entry</button>
      </div>
    </Section>
  );
}

/** Summary line for the area list. */
export function dataSummary(data: ProjectData | undefined): string | undefined {
  const cs = data?.collections ?? [];
  if (!cs.length) return undefined;
  const n = cs.reduce((s, c) => s + c.records.length, 0);
  return `${cs.length} list${cs.length === 1 ? "" : "s"} · ${n} entr${n === 1 ? "y" : "ies"}`;
}

export function DataPanel({ data, onChange, book }: { data: ProjectData | undefined; onChange: (fn: (d: ProjectData | undefined) => ProjectData) => void; book?: BookLink }) {
  const cs = data?.collections ?? [];
  const [selected, setSelected] = useState<string | null>(cs[0]?.id ?? null);
  const [name, setName] = useState("");
  const [starter, setStarter] = useState(COLLECTION_STARTERS[1].id);
  const c = cs.find((x) => x.id === selected) ?? cs[0];
  // Undo can remove the selected list; fall back to the first.
  useEffect(() => { if (selected && !cs.some((x) => x.id === selected)) setSelected(cs[0]?.id ?? null); }, [cs, selected]);
  const create = () => {
    const s = COLLECTION_STARTERS.find((x) => x.id === starter) ?? COLLECTION_STARTERS[0];
    let id = "";
    onChange((d) => { const r = addCollection(d, name.trim() || s.label, s.fields); id = r.id; return r.data; });
    setSelected(id);
    setName("");
  };
  return (
    <div className="data-panel">
      {!(c && usesCollection(book?.structure, c.id)) && <p className="hint">Your entries save and undo with the product. They print once your pages are made from them (Devotional design).</p>}
      {cs.length > 0 && c && (
        <>
          {cs.length > 1 && (
            <Field label="List">
              <select value={c.id} aria-label="List" onChange={(e) => setSelected(e.target.value)}>
                {cs.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.records.length})</option>)}
              </select>
            </Field>
          )}
          <RecordsEditor key={`r-${c.id}`} c={c} set={onChange} />
          <ImportBox key={`i-${c.id}`} c={c} set={onChange} />
          {book && <DevotionalBox key={`d-${c.id}`} c={c} book={book} />}
          <FieldsEditor key={`f-${c.id}`} c={c} set={onChange} />
          <Section title="Rename or delete this list">
            <div className="row">
              <Field label="List name"><DraftInput label="List name" value={c.name} onCommit={(v) => onChange((d) => renameCollection(d, c.id, v.trim() || c.name))} /></Field>
              <button type="button" className="btn btn--ghost" onClick={() => onChange((d) => removeCollection(d, c.id))}>Delete list</button>
            </div>
            <p className="hint">Undo brings a deleted list back.</p>
          </Section>
        </>
      )}
      <Section title="New list" open={cs.length === 0}>
        <Field label="Start from">
          <select value={starter} aria-label="Start from" onChange={(e) => setStarter(e.target.value)}>
            {COLLECTION_STARTERS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Name"><input type="text" value={name} placeholder={COLLECTION_STARTERS.find((s) => s.id === starter)?.label} onChange={(e) => setName(e.target.value)} /></Field>
        <p className="hint">Starting fields: {(COLLECTION_STARTERS.find((s) => s.id === starter)?.fields ?? []).map((f) => f.label).join(", ")}. You can change them any time.</p>
        <div className="row"><button type="button" className="btn btn--primary" onClick={create}>Create list</button></div>
      </Section>
    </div>
  );
}

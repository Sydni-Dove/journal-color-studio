/**
 * PRODUCT DATA — collections of typed entries a maker fills in (devotional
 * days, inventory items, journal entries…), stored inside the product
 * (ProductProject.data) so they save, undo and sync with it.
 *
 *   readValue      what a typed field makes of an input — a value it can't
 *                  read is KEPT exactly as typed and flagged, never dropped
 *   record edits   add / update / duplicate / move / remove, stable ids
 *   import         pasted or CSV text → rows → a previewed plan → records
 *
 * Pure functions, no DOM: the editor and the tests run the same code. Pages do
 * not read collections yet (a later phase binds sections to fields); nothing
 * here changes what prints.
 */
import type { DataCollection, DataRecord, FieldDef, FieldValue, ProjectData, ValueType } from "../../types/document";

// ─── Ids ─────────────────────────────────────────────────────────────────────

let seq = 0;
/** A stable id ("rec_…", "col_…", "fld_…"): unique on this device, never reused. */
export const newDataId = (prefix: "rec" | "col" | "fld") => `${prefix}_${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ─── Values ──────────────────────────────────────────────────────────────────

export type ReadValue = { value: FieldValue; issue?: string };
export const VALUE_TYPE_LABEL: Record<ValueType, string> = {
  text: "Short text", longText: "Long text", number: "Number", currency: "Amount", date: "Date", time: "Time", quantity: "Quantity",
  boolean: "Yes / no", choice: "Choice", signature: "Signature (signed on paper)", reference: "Reference (e.g. Scripture)", computed: "Calculated (later)",
};
/** Types a maker can choose for a field in this phase ("computed" is reserved). */
export const EDITABLE_TYPES: ValueType[] = ["text", "longText", "number", "currency", "quantity", "date", "time", "boolean", "choice", "reference", "signature"];

const NUMERIC = /^[-+]?(\d+(\.\d+)?|\.\d+)$/;
const GROUPED = /^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/;
function readNumber(s: string): number | null {
  const t = s.replace(/\s+/g, "");
  if (NUMERIC.test(t)) return Number(t);
  if (GROUPED.test(t)) return Number(t.replace(/,/g, ""));
  return null;
}
const pad = (n: number) => String(n).padStart(2, "0");
function isRealDate(y: number, m: number, d: number) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
/** "2026-10-08", "10/8/2026", "10/8/26" (US order) → "2026-10-08"; anything else is not read. */
function readDate(s: string): string | null {
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return isRealDate(+m[1], +m[2], +m[3]) ? `${m[1]}-${pad(+m[2])}-${pad(+m[3])}` : null;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return isRealDate(y, +m[1], +m[2]) ? `${y}-${pad(+m[1])}-${pad(+m[2])}` : null;
  }
  return null;
}
/** "14:30", "2:30 pm", "2 pm" → "14:30". */
function readTime(s: string): string | null {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/i.exec(s.replace(/\s+/g, " ").trim());
  if (!m) return null;
  let h = +m[1];
  const min = m[2] ? +m[2] : 0;
  const ap = m[3]?.toLowerCase().replace(/\./g, "");
  if (!ap && !m[2]) return null;
  if (ap) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (ap === "pm" ? 12 : 0);
  }
  return h <= 23 && min <= 59 ? `${pad(h)}:${pad(min)}` : null;
}
const YES = new Set(["yes", "y", "true", "x", "✓", "✔", "1", "done", "checked"]);
const NO = new Set(["no", "n", "false", "0", "", "not done", "unchecked"]);

/**
 * What a field makes of an input. Empty input is no value. A value the type
 * can't read is kept as the text that was typed, with an issue — so nothing a
 * maker typed or imported is lost, and the problem can be fixed in place.
 */
export function readValue(field: FieldDef, input: string | boolean | number | null | undefined): ReadValue {
  if (input === null || input === undefined) return { value: null };
  if (typeof input === "boolean") return field.valueType === "boolean" ? { value: input } : { value: input ? "yes" : "no" };
  if (typeof input === "number") return readValue(field, String(input));
  const raw = input;
  const s = raw.trim();
  if (!s) return { value: null };
  switch (field.valueType) {
    case "number":
    case "quantity": {
      const n = readNumber(field.unit ? s.replace(new RegExp(`\\s*${field.unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"), "") : s);
      return n === null ? { value: raw, issue: "Not a number" } : { value: n };
    }
    case "currency": {
      const n = readNumber(s.replace(/^[-+]?\s*[$€£¥]/, (x) => x.replace(/[$€£¥]/, "")).replace(/^([-+]?)\s*/, "$1"));
      return n === null ? { value: raw, issue: "Not an amount" } : { value: Math.round(n * 100) / 100 };
    }
    case "date": {
      const d = readDate(s);
      return d ? { value: d } : { value: raw, issue: "Not a date (use 2026-10-08 or 10/8/2026)" };
    }
    case "time": {
      const t = readTime(s);
      return t ? { value: t } : { value: raw, issue: "Not a time (use 14:30 or 2:30 pm)" };
    }
    case "boolean": {
      const k = s.toLowerCase();
      return YES.has(k) ? { value: true } : NO.has(k) ? { value: false } : { value: raw, issue: "Not yes or no" };
    }
    case "choice": {
      const hit = (field.options ?? []).find((o) => o.trim().toLowerCase() === s.toLowerCase());
      return hit ? { value: hit } : { value: raw, issue: `Not one of the choices (${(field.options ?? []).join(", ") || "none set"})` };
    }
    case "computed":
      return { value: null };
    case "longText":
      return { value: raw.replace(/\r\n?/g, "\n") };
    default:
      return { value: s };
  }
}

/** A value as text, for a form input or a preview. */
export function displayValue(field: FieldDef, v: FieldValue | undefined): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (field.valueType === "currency" && typeof v === "number") return v.toFixed(2);
  return String(v);
}

export type FieldIssue = { key: string; message: string };
/** A record's problems, field by field: a required value missing, or a value its type can't read. */
export function recordIssues(fields: FieldDef[], r: DataRecord): FieldIssue[] {
  const out: FieldIssue[] = [];
  for (const f of fields) {
    const v = r.values[f.key];
    if (v === null || v === undefined || v === "") {
      if (f.required) out.push({ key: f.key, message: "Required" });
      continue;
    }
    if (typeof v === "string" && f.valueType !== "text" && f.valueType !== "longText" && f.valueType !== "reference" && f.valueType !== "signature") {
      const issue = readValue(f, v).issue;
      if (issue) out.push({ key: f.key, message: issue });
    }
  }
  return out;
}

// ─── Collections and records (immutable edits) ───────────────────────────────

export const emptyData = (): ProjectData => ({ version: 1, collections: [] });
const withCollection = (data: ProjectData | undefined, id: string, fn: (c: DataCollection) => DataCollection): ProjectData => {
  const d = data ?? emptyData();
  return { ...d, collections: d.collections.map((c) => (c.id === id ? fn(c) : c)) };
};

export function addCollection(data: ProjectData | undefined, name: string, fields: FieldDef[]): { data: ProjectData; id: string } {
  const id = newDataId("col");
  const d = data ?? emptyData();
  return { id, data: { ...d, collections: [...d.collections, { id, name: name.trim() || "Untitled", fields: fields.map((f) => ({ ...f })), records: [] }] } };
}
export const renameCollection = (data: ProjectData | undefined, id: string, name: string) => withCollection(data, id, (c) => ({ ...c, name }));
export const removeCollection = (data: ProjectData | undefined, id: string): ProjectData => {
  const d = data ?? emptyData();
  return { ...d, collections: d.collections.filter((c) => c.id !== id) };
};

/** A new field's key: from its label, unique in the collection (keys never change once made, so values keep their field). */
export function fieldKeyFor(label: string, fields: FieldDef[]): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "field";
  let key = base, n = 2;
  while (fields.some((f) => f.key === key)) key = `${base}_${n++}`;
  return key;
}
export const addField = (data: ProjectData | undefined, id: string, label: string, valueType: ValueType = "text") =>
  withCollection(data, id, (c) => ({ ...c, fields: [...c.fields, { key: fieldKeyFor(label, c.fields), label: label.trim() || "Field", valueType }] }));
/** Change a field's label, type, options, unit or required flag. Its key stays, so existing values stay with it. */
export const updateField = (data: ProjectData | undefined, id: string, key: string, patch: Partial<Omit<FieldDef, "key">>) =>
  withCollection(data, id, (c) => ({ ...c, fields: c.fields.map((f) => (f.key === key ? { ...f, ...patch } : f)) }));
/** Remove a field from the form. Its values stay in the records (hidden), so adding it back — or undo — restores them. */
export const removeField = (data: ProjectData | undefined, id: string, key: string) => withCollection(data, id, (c) => ({ ...c, fields: c.fields.filter((f) => f.key !== key) }));
export const moveField = (data: ProjectData | undefined, id: string, from: number, to: number) => withCollection(data, id, (c) => ({ ...c, fields: move(c.fields, from, to) }));

export function addRecord(data: ProjectData | undefined, id: string, values: Record<string, FieldValue> = {}, at?: number): { data: ProjectData; recordId: string } {
  const recordId = newDataId("rec");
  return {
    recordId,
    data: withCollection(data, id, (c) => {
      const records = [...c.records];
      records.splice(at ?? records.length, 0, { id: recordId, values: { ...values } });
      return { ...c, records };
    }),
  };
}
/** Set one value from an input (read by the field's type; unreadable input is kept as typed). */
export function setValue(data: ProjectData | undefined, id: string, recordId: string, key: string, input: string | boolean | null): ProjectData {
  return withCollection(data, id, (c) => {
    const f = c.fields.find((x) => x.key === key);
    const value = f ? readValue(f, input).value : typeof input === "string" ? input : input;
    return { ...c, records: c.records.map((r) => (r.id === recordId ? { ...r, values: { ...r.values, [key]: value } } : r)) };
  });
}
export const removeRecord = (data: ProjectData | undefined, id: string, recordId: string) => withCollection(data, id, (c) => ({ ...c, records: c.records.filter((r) => r.id !== recordId) }));
export function duplicateRecord(data: ProjectData | undefined, id: string, recordId: string): { data: ProjectData; recordId: string } {
  const c = (data ?? emptyData()).collections.find((x) => x.id === id);
  const i = c?.records.findIndex((r) => r.id === recordId) ?? -1;
  if (!c || i < 0) return { data: data ?? emptyData(), recordId };
  return addRecord(data, id, c.records[i].values, i + 1);
}
export const moveRecord = (data: ProjectData | undefined, id: string, from: number, to: number) => withCollection(data, id, (c) => ({ ...c, records: move(c.records, from, to) }));
function move<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= arr.length) return arr;
  const out = [...arr];
  const [x] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(out.length, to)), 0, x);
  return out;
}

/** Ready-made field sets to start a collection from (organizational starting points — no legal or regulatory claim). */
export const COLLECTION_STARTERS: { id: string; label: string; fields: FieldDef[] }[] = [
  { id: "blank", label: "Blank", fields: [{ key: "title", label: "Title", valueType: "text" }] },
  {
    id: "devotional", label: "Devotional days",
    fields: [
      { key: "day", label: "Day", valueType: "number" }, { key: "title", label: "Title", valueType: "text", required: true },
      { key: "scripture", label: "Scripture", valueType: "reference" }, { key: "reading", label: "Devotional text", valueType: "longText", required: true },
      { key: "questions", label: "Reflection questions", valueType: "longText" }, { key: "prayer", label: "Prayer", valueType: "longText" }, { key: "action", label: "Action step", valueType: "text" },
    ],
  },
  {
    id: "inventory", label: "Inventory items",
    fields: [
      { key: "item", label: "Item", valueType: "text", required: true }, { key: "sku", label: "SKU", valueType: "text" }, { key: "supplier", label: "Supplier", valueType: "text" },
      { key: "quantity", label: "Quantity", valueType: "quantity", unit: "units" }, { key: "reorder", label: "Reorder point", valueType: "number" },
      { key: "cost", label: "Unit cost", valueType: "currency" }, { key: "location", label: "Location", valueType: "text" }, { key: "counted", label: "Last counted", valueType: "date" },
    ],
  },
  {
    id: "log", label: "Log entries",
    fields: [{ key: "date", label: "Date", valueType: "date", required: true }, { key: "time", label: "Time", valueType: "time" }, { key: "name", label: "Name", valueType: "text" }, { key: "notes", label: "Notes", valueType: "longText" }],
  },
];

// ─── Paste / CSV import ──────────────────────────────────────────────────────

/**
 * Rows from pasted or CSV / TSV text: tab-separated when the text has tabs
 * (a spreadsheet paste), otherwise comma-separated; quoted cells may hold
 * commas, quotes ("") and line breaks. Blank lines are skipped.
 */
export function parseDelimited(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = firstLine.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false, i = 0;
  const endCell = () => { row.push(cell); cell = ""; };
  const endRow = () => { endCell(); if (row.some((c) => c.trim() !== "")) rows.push(row); row = []; };
  while (i < src.length) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i += 2; continue; }
      if (ch === '"') { quoted = false; i++; continue; }
      cell += ch; i++; continue;
    }
    if (ch === '"' && cell === "") { quoted = true; i++; continue; }
    if (ch === sep) { endCell(); i++; continue; }
    if (ch === "\r" || ch === "\n") { endRow(); i += ch === "\r" && src[i + 1] === "\n" ? 2 : 1; continue; }
    cell += ch; i++;
  }
  if (cell !== "" || row.length) endRow();
  return rows;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

export type ImportPlan = {
  /** The header row, when the first row names columns. */
  header: string[] | null;
  /** Column i → field key (null = not imported). */
  mapping: (string | null)[];
  /** Each data row, read by its fields' types, with what couldn't be read (kept as typed). */
  rows: { values: Record<string, FieldValue>; issues: FieldIssue[] }[];
  /** Columns no field matched (shown, never silently dropped: map them or leave them out on purpose). */
  unmatched: number[];
};

/**
 * Plan an import into a collection. The first row is a header when any of its
 * cells names a field (by label or key, ignoring case and punctuation); its
 * columns are matched by name, otherwise by position. Nothing is added until
 * the plan is applied.
 */
export function planImport(fields: FieldDef[], rows: string[][], opts: { header?: boolean; mapping?: (string | null)[] } = {}): ImportPlan {
  const first = rows[0] ?? [];
  const named = (c: string) => fields.find((f) => norm(f.label) === norm(c) || norm(f.key) === norm(c));
  const header = opts.header ?? first.some((c) => !!named(c));
  const width = Math.max(0, ...rows.map((r) => r.length));
  const mapping = opts.mapping ?? Array.from({ length: width }, (_, i) => (header ? named(first[i] ?? "")?.key ?? null : fields[i]?.key ?? null));
  const body = header ? rows.slice(1) : rows;
  const byKey = new Map(fields.map((f) => [f.key, f]));
  return {
    header: header ? first : null,
    mapping,
    rows: body.map((cells) => {
      const values: Record<string, FieldValue> = {};
      const issues: FieldIssue[] = [];
      mapping.forEach((key, i) => {
        const f = key ? byKey.get(key) : undefined;
        if (!f) return;
        const r = readValue(f, cells[i] ?? "");
        values[f.key] = r.value;
        if (r.issue) issues.push({ key: f.key, message: r.issue });
      });
      return { values, issues };
    }),
    unmatched: mapping.map((k, i) => (k ? -1 : i)).filter((i) => i >= 0 && (header ? (first[i] ?? "").trim() !== "" : body.some((r) => (r[i] ?? "").trim() !== ""))),
  };
}

/** Add a plan's rows to the end of a collection, each a new record with a stable id. */
export function applyImport(data: ProjectData | undefined, id: string, plan: ImportPlan): ProjectData {
  return withCollection(data, id, (c) => ({ ...c, records: [...c.records, ...plan.rows.map((r) => ({ id: newDataId("rec"), values: { ...r.values } }))] }));
}

/** Repair the shape of stored data (a product saved by an older or newer studio) without dropping any value. */
export function normalizeData(d: unknown): ProjectData | undefined {
  if (!d || typeof d !== "object") return undefined;
  const x = d as Partial<ProjectData>;
  const collections = Array.isArray(x.collections) ? x.collections : [];
  return {
    version: 1,
    collections: collections
      .filter((c): c is DataCollection => !!c && typeof c === "object" && typeof (c as DataCollection).id === "string")
      .map((c) => ({
        ...c,
        name: typeof c.name === "string" ? c.name : "Untitled",
        fields: Array.isArray(c.fields) ? c.fields.filter((f) => f && typeof f.key === "string") : [],
        records: Array.isArray(c.records) ? c.records.filter((r) => r && typeof r.id === "string").map((r) => ({ ...r, values: r.values && typeof r.values === "object" ? r.values : {} })) : [],
      })),
  };
}

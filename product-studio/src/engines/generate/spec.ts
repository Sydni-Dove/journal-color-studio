/**
 * DOCUMENT SPECIFICATION — what the AI proposes for a printable document,
 * in the studio's own terms: sections (each a kind of page and how often it
 * repeats), the universal components on them, an optional list of entries
 * the repeating sections read, and the page setup. Never coordinates: the
 * studio's own engines measure, paginate and draw (engines/generate/convert).
 *
 * The AI is untrusted. Its answer is held to docSpecSchema.json by the
 * provider (structured outputs) and checked again here before anything is
 * built: unsupported components are reported and left out, impossible
 * settings are adjusted and said so, wording it claims is the maker's is
 * verified word for word, the maker's own content is placed exactly (what
 * the AI didn't place is kept, never dropped), and anything that cites a
 * source or claims legal / regulatory compliance is flagged as unverified.
 */
import type { ValueType } from "../../types/document";

export type SpecValueType = Exclude<ValueType, "computed">;
export type SpecField = { label: string; valueType: SpecValueType };
export type SpecComponentKind = "heading" | "text" | "fields" | "writing" | "checklist" | "table" | "list" | "records" | "divider" | "spacer";
/** Who wrote a piece of wording: the maker (verified to be in what they wrote) or the AI (a suggestion). */
export type Source = "user" | "suggested";
export type SpecComponent = {
  id: string;
  kind: SpecComponentKind;
  label: string | null;
  text: string | null;
  source: Source;
  /** In a section that repeats per entry: the entry field this component prints. */
  fromEntryField: string | null;
  /** Fields (an info row, a record) or columns (a table). */
  fields: SpecField[];
  rows: number | null;
  numbered: boolean;
  fillPage: boolean;
  lines: number | null;
  items: string[];
  marker: "bullet" | "number" | "checkbox" | null;
  size: "small" | "medium" | "large" | null;
};
export type SpecSection = {
  id: string;
  title: string;
  purpose: string;
  repeat: { mode: "once" | "copies" | "per-entry"; count: number };
  startOnRightPage: boolean;
  components: SpecComponent[];
};
export type SpecEntries = {
  name: string;
  fields: { key: string; label: string; valueType: SpecValueType }[];
  records: { values: { key: string; value: string }[] }[];
  source: Source;
};
export type PageSize = "5.5x8.5" | "6x9" | "7x9" | "8x10" | "8.5x11" | "a5" | "a4";
export type DocSpec = {
  title: string;
  summary: string;
  page: { size: PageSize; orientation: "portrait" | "landscape"; binding: "book" | "spiral" | "stapled" | "loose"; why: string };
  entries: SpecEntries | null;
  sections: SpecSection[];
  /** How the request was read: assumptions, conflicting instructions and how they were resolved. */
  notes: string[];
};

/** Something the check changed or wants the maker to know, in plain words. */
export type Problem = { level: "left-out" | "adjusted" | "note"; message: string };
/** Wording to verify before printing: a reference the AI supplied, or a claim about legal / regulatory compliance. */
export type Flag = { kind: "reference" | "compliance"; text: string; where: string };
export type CheckedSpec = {
  spec: DocSpec;
  problems: Problem[];
  flags: Flag[];
  /** Lines of the maker's own content the proposal didn't place: kept on a page of their own (never dropped). */
  unplaced: string[];
};

export class SpecError extends Error {}

export const SIZES: PageSize[] = ["5.5x8.5", "6x9", "7x9", "8x10", "8.5x11", "a5", "a4"];
const KINDS: SpecComponentKind[] = ["heading", "text", "fields", "writing", "checklist", "table", "list", "records", "divider", "spacer"];
const VALUE_TYPES: SpecValueType[] = ["text", "longText", "number", "currency", "date", "time", "quantity", "boolean", "choice", "signature", "reference"];
export const LIMITS = { sections: 30, components: 40, copies: 500, tableRows: 200, columns: 10, recordFields: 12, records: 60, listItems: 80, entries: 1000, entryFields: 12, lines: 60 };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const nonEmpty = (v: unknown) => typeof v === "string" && v.trim().length > 0;
const int = (v: unknown, lo: number, hi: number, dflt: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : dflt);
/** Whitespace-insensitive form, for "is this exactly what they wrote" (line breaks and spaces may differ; words may not). */
export const normWords = (s: string) => s.replace(/\s+/g, " ").trim();

// ─── Flags ──────────────────────────────────────────────────────────────────
const REFERENCE = [
  /\b(?:[1-3]\s?)?[A-Z][a-z]+\.?\s\d{1,3}:\d{1,3}(?:\s?[-–]\s?\d{1,3})?\b/, // Scripture: John 3:16, 1 Cor. 13:4–7
  /https?:\/\/\S+|www\.\S+/i,
  /§|\b\d+\s?(?:CFR|C\.F\.R\.|U\.S\.C\.|USC)\b|\b(?:Section|Article|Rule)\s\d+[\w.()-]*/,
  /\b(?:according to|as stated in|source:|cited in)\s/i,
];
const COMPLIANCE = /\b(?:compliant|compliance|complies|meets (?:all |the )?(?:legal|regulatory|state|federal|statutory)|legally (?:valid|binding|required|sufficient|compliant)|required by (?:law|regulation|statute)|(?:HIPAA|OSHA|GDPR|FERPA|ADA|IRS)[- ](?:approved|compliant|ready)|satisfies (?:the )?(?:law|regulation)s?|certified)\b/i;

/** The sentence (or line) of `text` a pattern matches, to quote in a flag. */
function sentenceWith(text: string, re: RegExp): string {
  const s = text.split(/\n+|(?<=[.!?])\s+/).map((x) => x.trim()).find((x) => re.test(x)) ?? text.trim();
  return s.length > 160 ? `${s.slice(0, 159)}…` : s;
}

function flagsIn(text: string, where: string, aiWrote: boolean): Flag[] {
  const out: Flag[] = [];
  if (!text) return out;
  // A claim of compliance is flagged whoever wrote it; a reference only when the AI supplied it (the maker's own are theirs).
  if (COMPLIANCE.test(text)) out.push({ kind: "compliance", text: sentenceWith(text, COMPLIANCE), where });
  const ref = REFERENCE.find((r) => r.test(text));
  if (aiWrote && ref) out.push({ kind: "reference", text: sentenceWith(text, ref), where });
  return out;
}

// ─── Checking ───────────────────────────────────────────────────────────────

/**
 * Check an AI proposal against the studio's rules. Throws SpecError when it isn't a document at all
 * (not JSON, no sections); everything else is repaired or reported, never silently changed.
 */
export function checkSpec(raw: unknown, input: { description: string; content?: string }): CheckedSpec {
  let r: unknown = raw;
  if (typeof r === "string") {
    try {
      r = JSON.parse(r);
    } catch {
      throw new SpecError("The AI's answer wasn't a document outline (it couldn't be read). Try again.");
    }
  }
  if (!isObj(r)) throw new SpecError("The AI's answer wasn't a document outline. Try again.");
  if (!Array.isArray(r.sections) || !r.sections.length) throw new SpecError("The AI's outline has no sections. Try describing the document again.");
  const problems: Problem[] = [];
  const flags: Flag[] = [];
  const said = normWords(`${input.description}\n${input.content ?? ""}`);
  const isTheirs = (t: string) => !!normWords(t) && said.includes(normWords(t));

  // Page setup: only sizes, orientations and bindings the studio prints.
  const p = isObj(r.page) ? r.page : {};
  const size = SIZES.includes(p.size as PageSize) ? (p.size as PageSize) : "8.5x11";
  if (!SIZES.includes(p.size as PageSize)) problems.push({ level: "adjusted", message: `The proposed page size (${str(p.size) || "none"}) isn't one the studio prints; using 8.5 × 11 (Letter). You can change it before creating.` });
  const orientation = p.orientation === "landscape" ? "landscape" : "portrait";
  const binding = (["book", "spiral", "stapled", "loose"] as const).find((b) => b === p.binding) ?? "loose";
  if (binding !== p.binding) problems.push({ level: "adjusted", message: "The proposed binding isn't one the studio prints; using loose pages." });

  // Entries (the list repeating sections read).
  let entries: SpecEntries | null = null;
  if (isObj(r.entries)) {
    const e = r.entries;
    const seen = new Set<string>();
    const fields = (Array.isArray(e.fields) ? e.fields : []).filter(isObj).slice(0, LIMITS.entryFields).flatMap((f) => {
      const key = str(f.key).trim().replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase() || str(f.label).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      if (!key || seen.has(key) || !nonEmpty(f.label)) return [];
      seen.add(key);
      return [{ key, label: str(f.label).trim(), valueType: VALUE_TYPES.includes(f.valueType as SpecValueType) ? (f.valueType as SpecValueType) : "text" }];
    });
    if (fields.length) {
      const src: Source = e.source === "user" ? "user" : "suggested";
      const recs = (Array.isArray(e.records) ? e.records : []).filter(isObj).slice(0, LIMITS.entries);
      if (Array.isArray(e.records) && e.records.length > LIMITS.entries) problems.push({ level: "adjusted", message: `Only the first ${LIMITS.entries} entries were kept; add the rest in Your content.` });
      const records = recs.map((rec) => ({
        values: (Array.isArray(rec.values) ? rec.values : []).filter(isObj).filter((v) => seen.has(str(v.key).trim().toLowerCase()) && typeof v.value === "string").map((v) => ({ key: str(v.key).trim().toLowerCase(), value: v.value as string })),
      }));
      let source = src;
      if (src === "user") {
        // Every value said to be the maker's must be in what they wrote, word for word.
        const notTheirs = records.flatMap((x) => x.values).filter((v) => v.value.trim() && !isTheirs(v.value));
        if (notTheirs.length) {
          source = "suggested";
          problems.push({ level: "note", message: `${notTheirs.length} entr${notTheirs.length === 1 ? "y value isn't" : "y values aren't"} word for word what you wrote, so the entries are shown as suggestions. Check them before printing.` });
        }
      }
      entries = { name: nonEmpty(e.name) ? str(e.name).trim().slice(0, 80) : "Entries", fields, records, source };
      if (source === "suggested") for (const [i, x] of records.entries()) for (const v of x.values) flags.push(...flagsIn(v.value, `Entry ${i + 1}`, true));
    } else problems.push({ level: "left-out", message: "The proposed list of entries had no usable fields, so it was left out." });
  }

  // Sections and their components.
  const ids = new Set<string>();
  const uid = (want: unknown, fallback: string) => {
    let id = (str(want).trim() || fallback).replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 60) || fallback;
    for (let n = 2; ids.has(id); n++) id = `${fallback}-${n}`;
    ids.add(id);
    return id;
  };
  const rawSections = r.sections.filter(isObj);
  if (r.sections.length > LIMITS.sections) problems.push({ level: "adjusted", message: `Only the first ${LIMITS.sections} sections were kept.` });
  const sections: SpecSection[] = [];
  for (const [si, s] of rawSections.slice(0, LIMITS.sections).entries()) {
    const title = nonEmpty(s.title) ? str(s.title).trim().slice(0, 120) : `Section ${si + 1}`;
    const where = `“${title}”`;
    const rep = isObj(s.repeat) ? s.repeat : {};
    let mode: SpecSection["repeat"]["mode"] = rep.mode === "copies" || rep.mode === "per-entry" ? rep.mode : "once";
    let count = int(rep.count, 1, LIMITS.copies, 1);
    if (typeof rep.count === "number" && (rep.count < 1 || rep.count > LIMITS.copies)) problems.push({ level: "adjusted", message: `${where} asked for ${rep.count} copies; set to ${count} (1–${LIMITS.copies}).` });
    if (mode === "per-entry" && !entries) {
      problems.push({ level: "adjusted", message: `${where} was to repeat for each entry, but there's no list of entries; it prints once instead.` });
      mode = "once";
      count = 1;
    }
    if (mode !== "copies") count = 1;
    const components: SpecComponent[] = [];
    const rawComps = (Array.isArray(s.components) ? s.components : []).filter(isObj);
    for (const [ci, c] of rawComps.slice(0, LIMITS.components).entries()) {
      const kind = KINDS.find((k) => k === c.kind);
      const what = `${where}, part ${ci + 1}`;
      if (!kind) {
        problems.push({ level: "left-out", message: `${what}: “${str(c.kind) || "unknown"}” isn't something the studio prints (for example an image, chart or formula), so it was left out.` });
        continue;
      }
      const fieldsIn = (Array.isArray(c.fields) ? c.fields : []).filter(isObj).filter((f) => nonEmpty(f.label)).map((f) => ({ label: str(f.label).trim().slice(0, 60), valueType: VALUE_TYPES.includes(f.valueType as SpecValueType) ? (f.valueType as SpecValueType) : ("text" as const) }));
      const items = (Array.isArray(c.items) ? c.items : []).filter(nonEmpty).map((x) => str(x)).slice(0, LIMITS.listItems);
      let from = nonEmpty(c.fromEntryField) ? str(c.fromEntryField).trim().toLowerCase() : null;
      if (from && (mode !== "per-entry" || !entries?.fields.some((f) => f.key === from))) {
        problems.push({ level: "adjusted", message: `${what} was to print the entry field “${from}”, which ${mode !== "per-entry" ? "only works in a section that repeats for each entry" : "isn't one of the entries' fields"}; it prints its own wording instead.` });
        from = null;
      }
      const comp: SpecComponent = {
        id: uid(c.id, `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}-${ci + 1}`),
        kind,
        label: nonEmpty(c.label) ? str(c.label).slice(0, 200) : null,
        text: nonEmpty(c.text) ? str(c.text).slice(0, 20000) : null,
        source: c.source === "user" ? "user" : "suggested",
        fromEntryField: from,
        fields: fieldsIn.slice(0, kind === "table" ? LIMITS.columns : LIMITS.recordFields),
        rows: typeof c.rows === "number" ? int(c.rows, 1, kind === "records" ? LIMITS.records : LIMITS.tableRows, 1) : null,
        numbered: !!c.numbered && (kind === "table" || kind === "records"),
        fillPage: !!c.fillPage && (kind === "table" || kind === "records"),
        lines: typeof c.lines === "number" ? int(c.lines, 1, LIMITS.lines, 4) : null,
        items,
        marker: c.marker === "number" || c.marker === "checkbox" ? c.marker : c.marker === "bullet" ? "bullet" : null,
        size: c.size === "small" || c.size === "large" ? c.size : c.size === "medium" ? "medium" : null,
      };
      if (kind === "table" && fieldsIn.length > LIMITS.columns) problems.push({ level: "adjusted", message: `${what}: a table has at most ${LIMITS.columns} columns here; the rest (${fieldsIn.slice(LIMITS.columns).map((f) => f.label).join(", ")}) were left out — add them as another table if you need them.` });
      // What each kind needs to print anything.
      const empty =
        (kind === "heading" && !comp.text && !comp.label && !from) ||
        (kind === "text" && !comp.text && !from) ||
        ((kind === "fields" || kind === "table" || kind === "records") && !comp.fields.length) ||
        (kind === "list" && !comp.items.length && !from);
      if (empty) {
        problems.push({ level: "left-out", message: `${what} (${kind}) had nothing to print, so it was left out.` });
        continue;
      }
      // Wording said to be the maker's must be in what they wrote, exactly.
      if (comp.source === "user") {
        const words = [comp.text, kind === "heading" ? comp.label : null, ...comp.items].filter((x): x is string => !!x);
        if (words.some((w) => !isTheirs(w))) {
          comp.source = "suggested";
          problems.push({ level: "note", message: `${what}: this was marked as your wording, but it isn't word for word what you wrote, so it's shown as a suggestion.` });
        }
      }
      const aiText = [comp.label, comp.text, ...comp.items, ...comp.fields.map((f) => f.label)].filter((x): x is string => !!x).join(" \n");
      flags.push(...flagsIn(aiText, what, comp.source === "suggested"));
      components.push(comp);
    }
    if (rawComps.length > LIMITS.components) problems.push({ level: "adjusted", message: `${where}: only the first ${LIMITS.components} parts were kept.` });
    if (!components.length) {
      problems.push({ level: "left-out", message: `${where} had nothing the studio can print, so it was left out.` });
      continue;
    }
    flags.push(...flagsIn(title, where, true));
    sections.push({ id: uid(s.id, `section-${si + 1}`), title, purpose: str(s.purpose).slice(0, 300), repeat: { mode, count }, startOnRightPage: !!s.startOnRightPage, components });
  }
  if (!sections.length) throw new SpecError("Nothing in the AI's outline is something the studio can print. Try describing the document again.");
  flags.push(...flagsIn(`${str(r.title)} ${str(r.summary)}`, "the document's title or summary", true));

  const spec: DocSpec = {
    title: nonEmpty(r.title) ? str(r.title).trim().slice(0, 120) : "New document",
    summary: str(r.summary).slice(0, 400),
    page: { size, orientation, binding, why: str(p.why).slice(0, 300) },
    entries,
    sections,
    notes: (Array.isArray(r.notes) ? r.notes : []).filter(nonEmpty).map((n) => str(n).slice(0, 300)).slice(0, 12),
  };
  return { spec, problems, flags, unplaced: unplacedContent(spec, input.content ?? "") };
}

/** Wording the maker's content holds, in everything the proposal marks as theirs (and their entries). */
function placedText(spec: DocSpec): string {
  const out: string[] = [];
  for (const s of spec.sections) for (const c of s.components) if (c.source === "user") out.push(c.label ?? "", c.text ?? "", ...c.items);
  if (spec.entries?.source === "user") {
    for (const r of spec.entries.records) for (const v of r.values) out.push(v.value);
    // A per-entry page's title prints each entry's own values ("Day {day}: {title}" → "Day 1: Morning Light").
    for (const sec of spec.sections)
      if (sec.repeat.mode === "per-entry")
        spec.entries.records.forEach((r, i) => {
          const get = (k: string) => (k === "#" ? String(i + 1) : r.values.find((v) => v.key === k)?.value ?? "");
          out.push(sec.title.replace(/\{([^{}]+)\}/g, (_m, inner: string) => inner.split("|").map((k) => get(k.trim().toLowerCase())).find((v) => v.trim()) ?? ""));
        });
  }
  return normWords(out.join("\n"));
}

/**
 * The lines of the maker's content that the proposal didn't place word for word in any of
 * their own sections or entries. They are never dropped: the product gets a page holding them.
 */
export function unplacedContent(spec: DocSpec, content: string): string[] {
  if (!content.trim()) return [];
  const placed = placedText(spec);
  return content.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !placed.includes(normWords(l)));
}

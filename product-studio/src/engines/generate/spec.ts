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

/**
 * How much the AI writes. "structure" (Structure only — Phase 8, the default): the document's pages and blanks, and
 * the maker's own wording placed exactly; it doesn't write content. "develop" (Develop original content): it also
 * writes the content — days, lessons, exercises, Scripture connections, activities — as AI-written entries the maker
 * reviews and edits. The maker's own wording is never changed in either mode.
 */
export type GenerationMode = "structure" | "develop";
/** The most entries one "develop" request writes (longer series are written in batches, never cut short). */
export const MAX_DEVELOPED_ENTRIES = 30;
/** Safety limit on the AI-written wording one proposal may hold (characters, all entries together). */
export const MAX_DEVELOPED_TEXT = 150_000;
/** What a "write the next batch" request tells the server about the list it continues. */
export type BatchRequest = { name: string; fields: { key: string; label: string; valueType: SpecValueType }[]; from: number; count: number; previous: string[] };

/** Something the check changed or wants the maker to know, in plain words. */
export type Problem = { level: "left-out" | "adjusted" | "note"; message: string };
/** Wording to verify before printing: a reference the AI supplied, or a claim about legal / regulatory compliance. */
export type Flag = { kind: "reference" | "compliance" | "quotation"; text: string; where: string };
export type CheckedSpec = {
  spec: DocSpec;
  problems: Problem[];
  flags: Flag[];
  /** Lines of the maker's own content the proposal didn't place: kept on a page of their own (never dropped). */
  unplaced: string[];
  /** The mode it was asked for (absent: Structure only). */
  mode?: GenerationMode;
};

export class SpecError extends Error {}

export const SIZES: PageSize[] = ["5.5x8.5", "6x9", "7x9", "8x10", "8.5x11", "a5", "a4"];
const KINDS: SpecComponentKind[] = ["heading", "text", "fields", "writing", "checklist", "table", "list", "records", "divider", "spacer"];
const VALUE_TYPES: SpecValueType[] = ["text", "longText", "number", "currency", "date", "time", "quantity", "boolean", "choice", "signature", "reference"];
/** Blank copies of a fill-in log the AI described as "one page per entry" but gave no entries for. */
const BLANK_COPIES = 10;
/**
 * The most pages a generated document may have — about what a print-on-demand paperback allows (KDP: 828).
 * The same number guards the server: supabase/functions/generate-document/index.ts (MAX_DOCUMENT_PAGES).
 */
export const MAX_DOCUMENT_PAGES = 800;

/** The fewest pages an outline can make: every section prints at least one page per repetition (continued pages only add). */
export function minimumPages(spec: Pick<DocSpec, "sections" | "entries">): number {
  const perEntry = Math.max(1, spec.entries?.records.length ?? 0);
  return spec.sections.reduce((n, s) => n + (s.repeat.mode === "per-entry" ? perEntry : s.repeat.mode === "copies" ? Math.max(1, s.repeat.count) : 1), 0);
}

/** The message when an outline would pass the page limit (counted before anything is built). */
export const tooManyPages = (n: number, exact = false) =>
  `This document would have ${exact ? "" : "at least "}${n.toLocaleString("en-US")} pages; a document can have at most ${MAX_DOCUMENT_PAGES}. Lower the number of copies or entries, or split it into more than one document.`;

/** An outline past the page limit: the build stops with this, and the review offers the maker's choices (reduce or split). */
export class PageLimitError extends Error {
  constructor(public pages: number, exact = false) {
    super(tooManyPages(pages, exact));
  }
}

// ─── Page limit: the maker's choices (nothing is reduced unless they choose it) ──────────────────────────────

/** Pages kept free for a title page or introduction when a quantity is reduced to fit. */
const ROOM = 10;
/** Quantities a description can ask for that each make (at least) a page. */
const QUANTITY = /\b(\d{1,3}(?:,\d{3})+|\d+)\s*(?:-\s*)?(copies|copy|pages|page|days|day|entries|entry|sheets|sheet|lessons|lesson|sessions|session|worksheets|worksheet|weeks|week|logs|log|forms|form)\b/gi;
/**
 * A quantity the maker asked for that alone passes the page limit ("900 copies", "1,000 days") — found before
 * anything is sent, so it costs nothing. Only clear, explicit numbers count; everything else is the AI's to read.
 */
export function requestedOverLimit(description: string): { n: number; unit: string; text: string } | null {
  let best: { n: number; unit: string; text: string } | null = null;
  for (const m of description.matchAll(QUANTITY)) {
    const n = Number(m[1].replace(/,/g, ""));
    if (n > MAX_DOCUMENT_PAGES && (!best || n > best.n)) best = { n, unit: m[2].toLowerCase(), text: m[0] };
  }
  return best;
}
/** The maker's two choices for a quantity past the limit, as rewritten descriptions (applied only if chosen). */
export function quantityChoices(description: string, over: { n: number; unit: string; text: string }) {
  const fit = MAX_DOCUMENT_PAGES - ROOM;
  const parts = Math.ceil(over.n / fit);
  const per = Math.ceil(over.n / parts);
  const swap = (k: number) => description.replace(over.text, over.text.replace(/\d{1,3}(?:,\d{3})+|\d+/, String(k)));
  return {
    reduce: { label: `Reduce to ${fit} ${over.unit}`, description: swap(fit) },
    split: { label: `Split into ${parts} documents of ${per} ${over.unit}`, description: swap(per), parts },
  };
}

/** What can shrink: copies sections, and the entries per-entry sections print. */
const scalable = (spec: DocSpec) => {
  const perEntry = spec.sections.filter((s) => s.repeat.mode === "per-entry").length;
  const fixed = spec.sections.filter((s) => s.repeat.mode === "once").length;
  return { perEntry, fixed };
};

/**
 * "Reduce to fit": the copies (and the entries pages repeat for) lowered in proportion until the document fits —
 * offered with every change spelled out, applied only if the maker chooses it. `pages`: the count known to be over
 * (the exact count after building, else the fewest possible).
 */
export function reduceToFit(spec: DocSpec, pages = minimumPages(spec)): { spec: DocSpec; changes: string[] } {
  const target = MAX_DOCUMENT_PAGES - ROOM;
  let f = Math.min(1, target / Math.max(1, pages));
  const { perEntry } = scalable(spec);
  for (let tries = 0; tries < 50; tries++) {
    const sections = spec.sections.map((s) => (s.repeat.mode === "copies" ? { ...s, repeat: { ...s.repeat, count: Math.max(1, Math.floor(s.repeat.count * f)) } } : s));
    const keep = spec.entries && perEntry ? Math.max(1, Math.floor(spec.entries.records.length * f)) : spec.entries?.records.length ?? 0;
    const next: DocSpec = { ...spec, sections, entries: spec.entries ? { ...spec.entries, records: spec.entries.records.slice(0, keep) } : null };
    if (minimumPages(next) <= target || f <= 0.01) {
      const changes = [
        ...spec.sections.flatMap((s, i) => (s.repeat.mode === "copies" && sections[i].repeat.count !== s.repeat.count ? [`“${s.title}”: ${s.repeat.count} → ${sections[i].repeat.count} copies`] : [])),
        ...(spec.entries && keep < spec.entries.records.length ? [`${spec.entries.name}: the first ${keep} of ${spec.entries.records.length} entries kept (the rest left out)`] : []),
      ];
      return { spec: next, changes };
    }
    f *= 0.97;
  }
  return { spec, changes: [] };
}

/**
 * "Split into documents": the same outline as several documents, each within the limit — copies shared out, the
 * entries in order (part 1 gets the first ones); pages that print once (a title, an introduction) are in every
 * part. Applied only if the maker chooses it. `pages`: as for reduceToFit.
 */
export function splitToFit(spec: DocSpec, pages = minimumPages(spec)): DocSpec[] {
  for (let parts = Math.max(2, Math.ceil(pages / (MAX_DOCUMENT_PAGES - ROOM))); parts <= 50; parts++) {
    const share = (n: number, i: number) => Math.floor(n / parts) + (i < n % parts ? 1 : 0);
    const out = Array.from({ length: parts }, (_, i): DocSpec => {
      const records = spec.entries?.records ?? [];
      const start = Array.from({ length: i }, (_, j) => share(records.length, j)).reduce((a, b) => a + b, 0);
      return {
        ...spec,
        title: `${spec.title} — Part ${i + 1} of ${parts}`,
        sections: spec.sections.map((s) => (s.repeat.mode === "copies" ? { ...s, repeat: { ...s.repeat, count: Math.max(1, share(s.repeat.count, i)) } } : s)),
        entries: spec.entries ? { ...spec.entries, records: records.slice(start, start + share(records.length, i)) } : null,
      };
    });
    if (out.every((p) => minimumPages(p) <= MAX_DOCUMENT_PAGES - ROOM)) return out;
  }
  return [spec];
}

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
/** Quoted wording (“…” or "…", four words or more) — with a reference beside it, it's presented as a verse. */
const QUOTED = /[“"][^”"]*\b\w+\s+\w+\s+\w+\s+\w+[^”"]*[”"]/;
/** Translations whose text is under copyright: quoting them needs permission (references are fine). */
const COPYRIGHTED = /\b(?:NIV|ESV|NLT|NKJV|NASB|CSB|HCSB|AMP|AMPC|MSG|TPT|NRSV|NRSVUE|RSV|NET|CEB|GNT|ICB|NIRV|NCV|TLB|CEV|ERV)\b/;
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
  if (!aiWrote || !ref) return out;
  // Quoted verse text the AI supplied: the wording and its translation must be checked (and a copyrighted translation
  // may not be quoted without permission). Otherwise the reference itself is what to check.
  if (REFERENCE[0].test(text) && QUOTED.test(text)) {
    const q = sentenceWith(text, QUOTED);
    out.push({ kind: "quotation", text: COPYRIGHTED.test(text) ? `${q} — names a copyrighted translation: use the reference only, or a public-domain translation (KJV, WEB)` : q, where });
  } else out.push({ kind: "reference", text: sentenceWith(text, ref), where });
  return out;
}

// ─── Checking ───────────────────────────────────────────────────────────────

/**
 * Check an AI proposal against the studio's rules. Throws SpecError when it isn't a document at all
 * (not JSON, no sections); everything else is repaired or reported, never silently changed.
 */
export function checkSpec(raw: unknown, input: { description: string; content?: string; mode?: GenerationMode }): CheckedSpec {
  const develop = input.mode === "develop";
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
      let records = recs.map((rec) => ({
        values: (Array.isArray(rec.values) ? rec.values : []).filter(isObj).filter((v) => seen.has(str(v.key).trim().toLowerCase()) && typeof v.value === "string").map((v) => ({ key: str(v.key).trim().toLowerCase(), value: v.value as string })),
      }));
      // Written content comes in whole entries, at most a batch at a time: an entry is kept complete or left for the
      // next batch, never cut short.
      if (develop && src === "suggested") {
        let total = 0;
        const fit = records.findIndex((x, i) => i >= MAX_DEVELOPED_ENTRIES || (total += x.values.reduce((n, v) => n + v.value.length, 0)) > MAX_DEVELOPED_TEXT);
        if (fit >= 0) {
          problems.push({ level: "adjusted", message: `The AI wrote ${records.length} entries; the first ${fit} are kept whole (at most ${MAX_DEVELOPED_ENTRIES} per request${fit < MAX_DEVELOPED_ENTRIES ? ", and a safe amount of writing" : ""}). Write the rest with “Write the next batch”.` });
          records = records.slice(0, fit);
        }
      }
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
  const notVerbatim: string[] = [];
  for (const [si, s] of rawSections.slice(0, LIMITS.sections).entries()) {
    const rep = isObj(s.repeat) ? s.repeat : {};
    let mode: SpecSection["repeat"]["mode"] = rep.mode === "copies" || rep.mode === "per-entry" ? rep.mode : "once";
    const asked = nonEmpty(s.title) ? str(s.title).trim().slice(0, 120) : `Section ${si + 1}`;
    // `{field}` in a title reads an entry; without entries to read, the placeholders go.
    const title = mode === "per-entry" && entries?.records.length ? asked : asked.replace(/\s*\{[^{}]*\}/g, "").replace(/[\s:#–—-]+$/, "").trim() || `Section ${si + 1}`;
    const where = `“${title}”`;
    let count = int(rep.count, 1, LIMITS.copies, 1);
    // The count only means something for copies (a once or per-entry section often comes with 0).
    if (mode === "copies" && typeof rep.count === "number" && (rep.count < 1 || rep.count > LIMITS.copies)) problems.push({ level: "adjusted", message: `${where} asked for ${rep.count} copies; set to ${count} (1–${LIMITS.copies}).` });
    // A list with fields but no entries is a log to fill in by hand: blank copies of the page.
    const blank = mode === "per-entry" && !!entries && !entries.records.length;
    if (blank) {
      mode = "copies";
      count = typeof rep.count === "number" && rep.count >= 1 ? count : BLANK_COPIES;
      problems.push({ level: "adjusted", message: `${where} was to repeat for each entry, but no entries were given, so it prints ${count} blank cop${count === 1 ? "y" : "ies"} to fill in by hand. Change the number of copies below.` });
    }
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
      // On a blank copy, a part that was to print an entry's value becomes a place to write it.
      const blankField = blank && from ? entries!.fields.find((f) => f.key === from) : undefined;
      if (blankField) {
        from = null;
        if (kind !== "fields") {
          components.push({ id: uid(c.id, `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}-${ci + 1}`), kind: "fields", label: null, text: null, source: "suggested", fromEntryField: null, fields: [{ label: blankField.label, valueType: blankField.valueType }], rows: null, numbered: false, fillPage: false, lines: null, items: [], marker: null, size: null });
          continue;
        }
      }
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
      // A part printing an entry's value prints the entry's words: whose they are is the entries' source.
      if (from) comp.source = entries!.source;
      // Wording said to be the maker's must be in what they wrote, exactly.
      else if (comp.source === "user") {
        // The wording it prints as its own (a text part's label is a heading over it); a blank part (writing space,
        // divider) has none to be theirs.
        const words = [comp.text, kind === "heading" ? comp.label : null, ...comp.items, ...comp.fields.map((f) => f.label)].filter((x): x is string => !!x);
        if (!words.length || words.some((w) => !isTheirs(w))) {
          comp.source = "suggested";
          notVerbatim.push(what);
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
    // Copies of a page holding the maker's own wording would print their words again on every copy.
    if (mode === "copies" && count > 1 && components.some((c) => c.source === "user" && (c.text || c.items.length || (c.kind === "heading" && c.label)))) {
      problems.push({ level: "adjusted", message: `${where} holds your own wording, so it prints once (as ${count} copies it would repeat your words ${count} times). For a page per day, put each day in Your content after creating.` });
      mode = "once";
      count = 1;
    }
    flags.push(...flagsIn(title, where, true));
    sections.push({ id: uid(s.id, `section-${si + 1}`), title, purpose: str(s.purpose).slice(0, 300), repeat: { mode, count }, startOnRightPage: !!s.startOnRightPage, components });
  }
  // One note, not one per part. With nothing of the maker's to quote, "theirs" can only be a mislabel.
  if (notVerbatim.length && normWords(input.content ?? "")) problems.push({ level: "note", message: `${notVerbatim.length === 1 ? `${notVerbatim[0]} was` : `${notVerbatim.length} parts were`} marked as your wording but ${notVerbatim.length === 1 ? "isn't" : "aren't"} word for word what you wrote, so ${notVerbatim.length === 1 ? "it's shown as a suggestion" : "they're shown as suggestions"}.` });
  // Entries with no records were only a shape for blank pages (now copies).
  if (entries && !entries.records.length) entries = null;
  // Written entries with no page that prints them (the AI wrote the content but not its page): a page per entry
  // that prints every field is added, so nothing written is lost — and said.
  if (develop && entries?.records.length && !sections.some((s) => s.repeat.mode === "per-entry" && s.components.some((c) => c.fromEntryField))) {
    const e = entries;
    const titleField = e.fields.find((f) => f.valueType === "text") ?? e.fields[0];
    const comps: SpecComponent[] = e.fields.map((f, i) => ({
      id: uid(`each-${f.key}`, `each-${i + 1}`), kind: "text", label: f.key === titleField.key ? null : f.label, text: null, source: e.source, fromEntryField: f.key,
      fields: [], rows: null, numbered: false, fillPage: false, lines: null, items: [], marker: null, size: null,
    }));
    comps.push({ id: uid("each-notes", "each-notes"), kind: "writing", label: "My thoughts", text: null, source: "suggested", fromEntryField: null, fields: [], rows: null, numbered: false, fillPage: false, lines: null, items: [], marker: null, size: null });
    sections.push({ id: uid("each-entry", "each-entry"), title: `{${titleField.key}}`, purpose: "", repeat: { mode: "per-entry", count: 1 }, startOnRightPage: false, components: comps.filter((c) => c.fromEntryField !== titleField.key) });
    problems.push({ level: "adjusted", message: `The AI wrote ${e.records.length} ${e.name.toLowerCase()} but no page to print them, so a page for each one was added (its title, then ${e.fields.filter((f) => f.key !== titleField.key).map((f) => f.label).join(", ")}, then room to write). Change it below.` });
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
  return { spec, problems, flags, unplaced: unplacedContent(spec, input.content ?? ""), ...(develop ? { mode: "develop" as const } : {}) };
}

/**
 * The next batch of AI-written entries, added to the end of the outline's list. The batch is a checked proposal for
 * the same list: only values for the list's own fields are taken (by key), so the pages that print them stay as
 * they are. Returns the outline unchanged (and why) when the batch has nothing to add.
 */
export function appendBatch(spec: DocSpec, batch: CheckedSpec): { spec: DocSpec; added: number; message: string } {
  const list = spec.entries;
  const more = batch.spec.entries;
  if (!list) return { spec, added: 0, message: "This outline has no list of entries to continue." };
  if (!more?.records.length) return { spec, added: 0, message: "The AI didn't write any new entries. Try again, or add them in Your content after creating." };
  const keys = new Set(list.fields.map((f) => f.key));
  const records = more.records.map((r) => ({ values: r.values.filter((v) => keys.has(v.key)) })).filter((r) => r.values.some((v) => v.value.trim()));
  const room = LIMITS.entries - list.records.length;
  const take = records.slice(0, Math.max(0, room));
  return {
    // Anything the AI wrote is a suggestion, whatever the list held before.
    spec: { ...spec, entries: { ...list, records: [...list.records, ...take], source: "suggested" } },
    added: take.length,
    message: take.length ? `Added ${take.length} entr${take.length === 1 ? "y" : "ies"} (now ${list.records.length + take.length}).` : "The new entries didn't match this list's fields, so nothing was added.",
  };
}

/** What the server needs to continue the outline's list: its fields, where to start, and what's already written. */
export function batchRequest(spec: DocSpec, count: number): BatchRequest | null {
  const e = spec.entries;
  if (!e) return null;
  const first = e.fields.find((f) => f.valueType === "text") ?? e.fields[0];
  return {
    name: e.name,
    fields: e.fields,
    from: e.records.length + 1,
    count: Math.max(1, Math.min(MAX_DEVELOPED_ENTRIES, Math.round(count) || 1)),
    // The last entries' names, so the next batch continues rather than repeats.
    previous: e.records.slice(-40).map((r) => (r.values.find((v) => v.key === first.key)?.value ?? "").replace(/\s+/g, " ").trim().slice(0, 100)).filter(Boolean),
  };
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
  // "Read: Exodus 3:1-6" placed as a part headed "Read" holding "Exodus 3:1-6" is placed.
  const labels = new Set(spec.sections.flatMap((s) => s.components.map((c) => normWords(c.label ?? ""))).filter(Boolean));
  const isPlaced = (l: string) => {
    if (placed.includes(normWords(l))) return true;
    const m = /^([^:]{1,60}):\s*(.+)$/.exec(l);
    return !!m && labels.has(normWords(m[1])) && placed.includes(normWords(m[2]));
  };
  return content.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !isPlaced(l));
}

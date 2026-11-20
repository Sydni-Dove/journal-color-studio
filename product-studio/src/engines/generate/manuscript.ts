/**
 * MANUSCRIPT DAYS — reads a pasted manuscript's own "Day 1 … Day 21" headings (or Session, Lesson, Week)
 * so each day becomes one entry, word for word, without relying on the AI to copy 21 days of text.
 *
 * Used by checkSpec only when the AI's outline has pages meant to print a day's parts (fromEntryField)
 * but didn't write the days into its list of entries. The day's page is then built from the manuscript's
 * own shape: the parts every day shares (a "Devotional" heading, "Scripture reading: …", a second heading
 * such as "Day 1 Reflection and Prayer") are found by repeating across the days; each day's paragraphs,
 * questions and prompts fill the same places in order. Every value is a whole line of the maker's text,
 * so it stays theirs (source "user"); questions and prompts ending in "?" or ":" get writing lines.
 */

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);

/** "Day 1", "Day 1 Begin With Surrender", "## Day 1: Surrender", "**Session 3 – Rest**". */
const DAY = /^\s*(?:#{1,6}\s*)?(?:\*\*|__)?\s*(day|session|lesson|week)\s+(\d{1,3})\b/i;
/** A line's form with its day number taken out ("Day 4 Reflection and Prayer" → "reflection and prayer"). */
const shapeOf = (line: string) => line.replace(DAY, "").replace(/^[\s:.\-–—*#_]+/, "").trim().toLowerCase();
/** A short line that names what follows ("Devotional", "Meditation Practice"): no sentence punctuation. */
const isTitleLine = (l: string) => l.split(/\s+/).length <= 6 && !/[.!?:;,]$/.test(l) && !/^[-*•\d]/.test(l);
/** "Scripture reading (KJV): Romans 12:1–2" → "scripture reading (kjv)". A label is a few words before the first colon. */
const labelOf = (l: string) => {
  const m = /^([A-Za-z][^:]{0,40}):\s*\S/.exec(l);
  return m && m[1].trim().split(/\s+/).length <= 5 && !/[.!?]/.test(m[1]) ? m[1].trim().toLowerCase() : null;
};

export type DaySlot = { key: string; kind: "heading" | "label" | "text" | "write"; label: string | null };
export type ManuscriptDays = { unit: string; slots: DaySlot[]; days: { heading: string; values: Map<string, string> }[] };

/** The days of a manuscript, or null when it doesn't have at least two numbered in order from 1. */
export function manuscriptDays(content: string): ManuscriptDays | null {
  const lines = content.split(/\r?\n/).map((l) => l.trim());
  const starts: { at: number; unit: string; n: number }[] = [];
  lines.forEach((l, i) => {
    const m = DAY.exec(l);
    if (m) starts.push({ at: i, unit: m[1].toLowerCase(), n: Number(m[2]) });
  });
  const counts = new Map<string, number>();
  for (const s of starts) counts.set(s.unit, (counts.get(s.unit) ?? 0) + 1);
  const unit = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  // The first "Day n" for each n in order; a later "Day 1 Reflection and Prayer" belongs to Day 1.
  const run: typeof starts = [];
  for (const s of starts) if (s.unit === unit && s.n === run.length + 1) run.push(s);
  if (run.length < 2) return null;
  const body = (k: number): string[] => {
    const from = run[k].at + 1;
    if (k + 1 < run.length) return lines.slice(from, run[k + 1].at).filter(Boolean);
    // The last day ends where its shape does: as many lines as the day before it (what follows is the closing pages).
    const want = body(k - 1).length;
    return lines.slice(from).filter(Boolean).slice(0, want);
  };
  const bodies = run.map((_, k) => body(k));

  // The parts every day shares: a title line or a label that appears in most days.
  const seen = new Map<string, number>();
  for (const b of bodies) {
    const here = new Set<string>();
    for (const l of b) {
      const lab = labelOf(l);
      const shape = lab ? `label:${lab}` : isTitleLine(l) ? `title:${shapeOf(l)}` : null;
      if (shape) here.add(shape);
    }
    for (const s of here) seen.set(s, (seen.get(s) ?? 0) + 1);
  }
  const shared = (s: string) => (seen.get(s) ?? 0) >= Math.max(2, Math.ceil(bodies.length * 0.6));

  // Each day's lines into places named by the shared part they follow: "devotional" → its text; "reflection and prayer"
  // → its label line, then question 1, 2, 3 and the prompt. Places keep the order they first appear in.
  const slots: DaySlot[] = [{ key: "day", kind: "heading", label: null }];
  const index = new Map<string, DaySlot>([["day", slots[0]]]);
  const keyFor = (name: string) => name.replace(/[^a-z0-9]+/g, "_").slice(0, 40).replace(/^_+|_+$/g, "") || "part";
  const days = run.map((s, k) => {
    const values = new Map<string, string>([["day", lines[s.at]]]);
    let section = "start";
    const used = new Map<string, number>();
    const place = (base: string, kind: DaySlot["kind"], label: string | null, value: string, join = false) => {
      const n = (used.get(base) ?? 0) + (join ? 0 : 1);
      used.set(base, Math.max(n, 1));
      const key = keyFor(`${section}_${base}_${Math.max(n, 1)}`);
      if (!index.has(key)) {
        const slot = { key, kind, label };
        index.set(key, slot);
        // A place first seen on a later day goes after the places before it, not at the end.
        const prev = [...values.keys()].pop();
        const at = prev ? slots.findIndex((x) => x.key === prev) + 1 : slots.length;
        slots.splice(at > 0 ? at : slots.length, 0, slot);
      }
      values.set(key, join && values.has(key) ? `${values.get(key)}\n${value}` : value);
    };
    let lastWasText = false;
    for (const l of bodies[k]) {
      const lab = labelOf(l);
      if (lab && shared(`label:${lab}`)) {
        place(lab, /[:?]$/.test(l) ? "write" : "label", null, l);
        lastWasText = false;
      } else if (!lab && isTitleLine(l) && shared(`title:${shapeOf(l)}`)) {
        section = shapeOf(l);
        // The same words every day print as they are; a day-numbered one ("Day 4 Reflection and Prayer") is the day's own.
        if (DAY.test(l)) place("heading", "heading", null, l);
        else {
          const key = keyFor(`${section}_title`);
          if (!index.has(key)) {
            const slot = { key, kind: "heading" as const, label: l };
            index.set(key, slot);
            const prev = [...values.keys()].pop();
            const at = prev ? slots.findIndex((x) => x.key === prev) + 1 : slots.length;
            slots.splice(at > 0 ? at : slots.length, 0, slot);
          }
          values.set(key, l);
        }
        lastWasText = false;
      } else if (/[?:]$/.test(l)) {
        place("write", "write", null, l);
        lastWasText = false;
      } else {
        // Paragraphs that follow one another are one passage.
        place("text", "text", null, l, lastWasText);
        lastWasText = true;
      }
    }
    return { heading: lines[s.at], values };
  });
  return { unit: unit!, slots, days };
}

/**
 * When the outline prints a day's parts but holds no days, fills its entries from the manuscript's own Day headings
 * and rebuilds the day's page from the manuscript's shape. Returns the outline to check (a copy when changed) and a
 * note for the maker; the outline comes back unchanged when the manuscript has no numbered days.
 */
export function withManuscriptDays(r: Raw, content: string): { r: Raw; note: string | null } {
  if (!content.trim() || !Array.isArray(r.sections)) return { r, note: null };
  const e = isObj(r.entries) ? r.entries : null;
  if (e && Array.isArray(e.records) && e.records.length) return { r, note: null };
  const sections = r.sections.filter(isObj);
  const comps = (s: Raw) => (Array.isArray(s.components) ? s.components.filter(isObj) : []);
  const bound = (c: Raw) => typeof c.fromEntryField === "string" && !!c.fromEntryField.trim();
  const daily = sections.filter((s) => comps(s).some(bound));
  if (!daily.length) return { r, note: null };
  const ms = manuscriptDays(content);
  if (!ms) return { r, note: null };

  // Only places some day fills (a slot with words); the shared title lines print as fixed headings.
  const filled = ms.slots.filter((s) => s.label !== null || ms.days.some((d) => d.values.get(s.key)?.trim()));
  const fixed = (s: DaySlot) => s.kind === "heading" && s.label !== null;
  const fields = filled.filter((s) => !fixed(s));
  const base = { text: null, source: "user", fields: [], rows: null, numbered: false, fillPage: false, items: [], marker: null, size: null, cards: [] };
  const [first] = daily;
  const id = String(first.id ?? "day");
  // A day-numbered heading inside the day ("Day 1 Reflection and Prayer") starts the day's next page: the manuscript's
  // own page break (a two-page spread when the day has two). Each page is titled with its heading; its questions and
  // prompts share the rest of the page as writing lines.
  const pages: { title: string; slots: DaySlot[] }[] = [{ title: "{day}", slots: [] }];
  for (const s of filled) {
    if (s.key === "day") continue;
    if (s.kind === "heading" && s.label === null) pages.push({ title: `{${s.key}}`, slots: [] });
    else pages[pages.length - 1].slots.push(s);
  }
  let n = 0;
  const partsOf = (slots: DaySlot[]) =>
    slots.map((s) => {
      const cid = `${id}-ms-${++n}`;
      if (fixed(s)) return { ...base, id: cid, kind: "heading", label: s.label, text: s.label, fromEntryField: null, lines: null };
      if (s.kind === "write") return { ...base, id: cid, kind: "writing", label: null, fromEntryField: s.key, lines: null };
      return { ...base, id: cid, kind: "text", label: null, fromEntryField: s.key, lines: null };
    });
  const kept = pages.filter((p) => p.slots.length || p.title === "{day}");
  const dayPages = kept.map((p, i) => ({ ...first, id: i ? `${id}-page-${i + 1}` : id, title: p.title, startOnRightPage: false, repeat: { mode: "per-entry", count: 1 }, components: partsOf(p.slots), ...(i ? { withPrevious: true } : kept.length === 2 ? { startSpread: true } : {}) }));
  // The day's pages replace the AI's daily page(s), where the first of them was.
  const out = sections.flatMap((s) => (s === first ? dayPages : daily.includes(s) ? [] : [s]));
  const entries = {
    name: (e && typeof e.name === "string" && e.name.trim()) || "Days",
    fields: fields.map((s) => ({ key: s.key, label: s.key === "day" ? "Day" : s.key.replace(/_\d+$/, "").replace(/_/g, " "), valueType: s.kind === "text" ? "longText" : "text" })),
    records: ms.days.map((d) => ({ values: fields.map((s) => ({ key: s.key, value: d.values.get(s.key) ?? "" })).filter((v) => v.value) })),
    source: "user",
  };
  const unit = ms.unit[0].toUpperCase() + ms.unit.slice(1);
  return { r: { ...r, entries, sections: out }, note: `Your ${ms.days.length} ${ms.unit}s were read from your manuscript's own “${unit} 1” to “${unit} ${ms.days.length}” headings, word for word: one set of pages for each ${ms.unit}.` };
}

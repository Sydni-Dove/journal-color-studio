/**
 * DATA → PAGES — fills a page's sections from one entry of a content list.
 * The page's structure (its prompt set) is a template: a section names the
 * field it prints by `content.key`; the entry supplies the words. Nothing here
 * measures, positions or paginates — the shared prompt page solver lays the
 * filled sections out and continues them across pages (Phase 3).
 *
 * Content rules: every word of a value is printed exactly as entered (no
 * shortening, rewriting or moving between sections); a value prints only in
 * the section that names its field; an empty value prints nothing (its
 * section is left out rather than printed empty).
 *
 *   body text (heading kind, body style)  the value as flowing body text; the
 *                                          section's label becomes a heading kept with it
 *   heading / title                        the value as the heading
 *   printed list                           one item per line of the value
 *   writing section                        the value as its prompt, above the writing space
 *
 * Labels, prompts, the page header and instructions may also hold `{fieldKey}`
 * (that entry's value), `{#}` (its place in the list, from 1) or `{a|b}` (a, else b).
 */
import type { DataCollection, DataRecord } from "../../types/document";
import type { PromptBlock, PromptSet } from "../../types/prompts";
import { displayValue } from "./data";

/** A line its writer already numbered or bulleted. */
const SELF_MARKED = /^\s*(\d+[.)]|[a-z][.)]|[•\-–*])\s+/i;

export type EntryValues = { get(key: string): string };

/** An entry's values as printable text, by field key ("#" = its place in the list, from 1). */
export function entryValues(c: DataCollection, r: DataRecord, index: number): EntryValues {
  const byKey = new Map(c.fields.map((f) => [f.key, displayValue(f, r.values[f.key])]));
  return { get: (key) => (key === "#" ? String(index + 1) : byKey.get(key) ?? "") };
}

/** Replace `{key}`, `{#}` and `{a|b}` with the entry's values. Text without braces is returned unchanged. */
export function fillTemplate(text: string, v: EntryValues): string {
  return text.replace(/\{([^{}]+)\}/g, (_m, inner: string) => {
    for (const k of inner.split("|")) {
      const val = v.get(k.trim());
      if (val.trim()) return val;
    }
    return "";
  });
}

const fill = (s: string | undefined, v: EntryValues) => (s === undefined ? undefined : fillTemplate(s, v));

/** The field a section prints, if it names one of the list's fields. */
export const boundField = (b: PromptBlock, c: DataCollection) => (b.content?.key && c.fields.some((f) => f.key === b.content!.key) ? b.content.key : undefined);

/** A page's sections filled from one entry. */
export function bindPromptSet(set: PromptSet, c: DataCollection, r: DataRecord, index: number): PromptSet {
  const v = entryValues(c, r, index);
  const blocks: PromptBlock[] = [];
  for (const b of set.blocks) {
    const key = boundField(b, c);
    const own: PromptBlock = { ...b, label: fillTemplate(b.label, v), ...(b.prompt !== undefined ? { prompt: fill(b.prompt, v) } : {}) };
    if (!key) {
      blocks.push(own);
      continue;
    }
    const value = v.get(key);
    const kind = b.kind ?? "prompt";
    if (kind === "heading" && b.textStyle === "body") {
      if (!value.trim()) continue;
      // The label prints as its own heading, kept with the text; the text flows on its own (line by line across pages).
      if (own.label.trim()) blocks.push({ id: `${b.id}-heading`, kind: "heading", label: own.label, ...(b.frame ? { frame: b.frame } : {}), ...(b.headingAlign ? { headingAlign: b.headingAlign } : {}) });
      blocks.push({ ...own, label: "", prompt: value });
    } else if (kind === "heading") {
      if (!value.trim()) continue;
      blocks.push({ ...own, label: value });
    } else if (kind === "list") {
      const lines = value.split(/\r?\n/).filter((line) => line.trim());
      if (!lines.length) continue;
      // Already numbered or bulleted by its writer ("1. …", "• …"): printed as written, one line each, so no second marker is added.
      if (lines.every((line) => SELF_MARKED.test(line))) {
        if (own.label.trim()) blocks.push({ id: `${b.id}-heading`, kind: "heading", label: own.label, ...(b.frame ? { frame: b.frame } : {}) });
        blocks.push({ id: b.id, kind: "heading", textStyle: "body", label: "", prompt: lines.join("\n"), content: b.content });
      } else blocks.push({ ...own, items: lines.map((text) => ({ text: text.trim() })) });
    } else if (kind === "prompt") {
      blocks.push(value.trim() ? { ...own, prompt: value } : own);
    } else blocks.push(own);
  }
  return {
    ...set,
    blocks,
    ...(set.instructions !== undefined ? { instructions: fill(set.instructions, v) } : {}),
    ...(set.header
      ? {
          header: Object.fromEntries(
            Object.entries(set.header).map(([k, x]) => [k, typeof x === "string" ? fillTemplate(x, v) : Array.isArray(x) ? x.map((y) => (typeof y === "string" ? fillTemplate(y, v) : y)) : x]),
          ) as PromptSet["header"],
        }
      : {}),
  };
}

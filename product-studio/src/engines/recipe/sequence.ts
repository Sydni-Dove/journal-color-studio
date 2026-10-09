/**
 * RECORD NUMBERING across a product. A record section numbers its records
 * ("No. 1", "No. 2", …), and a numbered table its rows; every instance of a page continues the count, in book
 * order, so a 100-page notary journal reads 1…N straight through. Records with
 * the same `numbering.sequence` share one count (default: the section's id,
 * which every copy of the page shares). The recipe assigns the numbers — the
 * order of the book is the recipe's — and pagination only ever draws them.
 */
import type { PromptSet } from "../../types/prompts";

/** This instance's first record number per record section, advancing `counters` (sequence → next number). */
export function recordStarts(set: PromptSet | undefined, counters: Map<string, number>): Record<string, number> | undefined {
  if (!set) return undefined;
  let out: Record<string, number> | undefined;
  for (const b of set.blocks) {
    // Records count their records; a numbered table counts its rows (it prints exactly its chosen rows).
    const numbering = b.kind === "record" ? b.numbering : b.responseStyle === "table" && (b.kind ?? "prompt") === "prompt" ? b.table?.numbering : undefined;
    if (b.kind !== "record" && !numbering) continue;
    const key = numbering?.sequence ?? b.id;
    const start = counters.get(key) ?? numbering?.start ?? 1;
    (out ??= {})[b.id] = start;
    const count = b.kind === "record" ? b.recordCount ?? 1 : b.table?.rows ?? b.lineCount ?? 6;
    counters.set(key, start + Math.max(1, Math.round(count)));
  }
  return out;
}

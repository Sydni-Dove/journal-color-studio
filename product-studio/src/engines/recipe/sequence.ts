/**
 * RECORD NUMBERING across a product. A record section numbers its records
 * ("No. 1", "No. 2", …); every instance of a page continues the count, in book
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
    if (b.kind !== "record") continue;
    const key = b.numbering?.sequence ?? b.id;
    const start = counters.get(key) ?? b.numbering?.start ?? 1;
    (out ??= {})[b.id] = start;
    counters.set(key, start + Math.max(1, Math.round(b.recordCount ?? 1)));
  }
  return out;
}

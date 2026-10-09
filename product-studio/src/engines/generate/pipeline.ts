/**
 * AI DOCUMENT PIPELINE — one path for every kind of document:
 *   description (+ the maker's own content)
 *     → generate-document Edge Function (OpenAI structured outputs; the key stays on the server)
 *     → checkSpec (the studio's rules)  → the maker reviews and edits the outline
 *     → projectFromSpec (existing components, recipes, page filling)
 *     → measured with the studio's own engines (Smart Layout Assistant) → the editor.
 */
import { supabase } from "../../persistence/cloud";
import { reviewLayout, type LayoutReview } from "../layout/assistant";
import { resolveDocument } from "../document/resolve";
import { projectFromSpec } from "./convert";
import { checkSpec, unplacedContent, type CheckedSpec, type DocSpec } from "./spec";
import type { ProductProject } from "../../types/project";

/** Ask the Edge Function for a proposal (raw: the studio checks it next). */
export async function requestSpec(description: string, content: string): Promise<string> {
  const { data, error } = await supabase().functions.invoke("generate-document", { body: { description, content } });
  if (error) {
    const res = "context" in error ? (error as { context?: unknown }).context : null;
    const detail = res instanceof Response ? await res.clone().json().catch(() => null) : null;
    throw new Error(typeof detail?.error === "string" ? detail.error : "Document generation is unavailable right now. Try again in a moment.");
  }
  if (typeof data?.error === "string") throw new Error(data.error);
  if (typeof data?.spec !== "string") throw new Error("The AI didn't return a document outline. Try again.");
  return data.spec;
}

/** The checked proposal for the maker's request (throws SpecError when the answer isn't a document). */
export const checkProposal = (raw: unknown, description: string, content: string): CheckedSpec => checkSpec(raw, { description, content });

/** The product an (edited) outline makes, and how its real pages measure. */
export function buildFromOutline(spec: DocSpec, content: string, base: Pick<CheckedSpec, "problems" | "flags">): { checked: CheckedSpec; project: ProductProject; review: LayoutReview; limits: string[]; bindings: DocSpec["page"]["binding"][] } {
  // The maker may have removed or edited parts since the check: what of their content is unplaced now.
  const checked: CheckedSpec = { spec, problems: base.problems, flags: base.flags, unplaced: unplacedContent(spec, content) };
  const project = projectFromSpec(checked);
  const limits = printLimits(project);
  return { checked, project, review: reviewLayout(project, { max: 4 }), limits, bindings: limits.length ? bindingsThatPrint(spec, content, base) : [] };
}

/**
 * What the printer and binding allow (page minimums, maximums, multiples) that this product doesn't
 * meet — in plain words. A bound book needs at least 24 pages; a stapled booklet a multiple of 4.
 */
export function printLimits(project: ProductProject): string[] {
  const doc = resolveDocument(project);
  if (doc.binding.sheetCountIsMetadata) return [];
  const n = doc.recipe.pageCount;
  const out: string[] = [];
  for (const { src, r } of [{ src: doc.printProfile.label, r: doc.printProfile.pageCountRules }, { src: doc.binding.label, r: doc.binding.pageCountRules }]) {
    if (!r) continue;
    if (r.minPages !== undefined && n < r.minPages) out.push(`${src} needs at least ${r.minPages} pages; this document has ${n}.`);
    if (r.maxPages !== undefined && n > r.maxPages) out.push(`${src} allows at most ${r.maxPages} pages; this document has ${n}.`);
    if (r.multipleOf !== undefined && n % r.multipleOf !== 0) out.push(`${src} needs a page count that's a multiple of ${r.multipleOf}; this document has ${n}.`);
  }
  return [...new Set(out)];
}

/** Bindings this outline prints with as it stands (each built and checked), for when the chosen one can't. */
export function bindingsThatPrint(spec: DocSpec, content: string, base: Pick<CheckedSpec, "problems" | "flags">): DocSpec["page"]["binding"][] {
  return (["spiral", "stapled", "loose", "book"] as const).filter((b) => b !== spec.page.binding && !printLimits(projectFromSpec({ ...base, spec: { ...spec, page: { ...spec.page, binding: b } }, unplaced: unplacedContent(spec, content) })).length);
}

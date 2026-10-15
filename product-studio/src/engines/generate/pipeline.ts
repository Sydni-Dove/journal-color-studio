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
import { checkSpec, MAX_DOCUMENT_PAGES, minimumPages, PageLimitError, unplacedContent, type BatchRequest, type CheckedSpec, type DocSpec, type GenerationMode } from "./spec";
import type { ProductProject } from "../../types/project";

/**
 * What else a request asks for. Structure only sends nothing extra (the request is exactly Phase 8's). Develop:
 * optionally how many entries; or `batch` — the next entries of a list already written.
 */
export type RequestOptions = { mode?: GenerationMode; entryCount?: number; batch?: BatchRequest };

/** Ask the Edge Function for a proposal (raw: the studio checks it next). */
export async function requestProposal(description: string, content: string, opts: RequestOptions = {}): Promise<{ spec: string; incomplete: string | null }> {
  const develop = opts.mode === "develop";
  const body = develop ? { description, content, mode: "develop", ...(opts.entryCount ? { entryCount: opts.entryCount } : {}), ...(opts.batch ? { batch: opts.batch } : {}) } : { description, content };
  const { data, error } = await supabase().functions.invoke("generate-document", { body });
  if (error) {
    const res = "context" in error ? (error as { context?: unknown }).context : null;
    const detail = res instanceof Response ? await res.clone().json().catch(() => null) : null;
    throw new Error(typeof detail?.error === "string" ? detail.error : "Document generation is unavailable right now. Try again in a moment.");
  }
  if (typeof data?.error === "string") throw new Error(data.error);
  if (typeof data?.spec !== "string") throw new Error("The AI didn't return a document outline. Try again.");
  return { spec: data.spec, incomplete: develop && typeof data?.incomplete === "string" ? data.incomplete : null };
}

/** Existing callers that only need the specification. An incomplete batch is not appended silently. */
export async function requestSpec(description: string, content: string, opts: RequestOptions = {}): Promise<string> {
  const result = await requestProposal(description, content, opts);
  if (result.incomplete) throw new Error(`The AI response did not meet your requested content depth: ${result.incomplete} This proposal counted toward today's allowance. Try fewer lessons in the next request.`);
  return result.spec;
}

/** The checked proposal for the maker's request (throws SpecError when the answer isn't a document). */
export const checkProposal = (raw: unknown, description: string, content: string, mode: GenerationMode = "structure"): CheckedSpec => checkSpec(raw, { description, content, mode });

/** The product an (edited) outline makes, and how its real pages measure. */
export function buildFromOutline(spec: DocSpec, content: string, base: Pick<CheckedSpec, "problems" | "flags" | "mode">): { checked: CheckedSpec; project: ProductProject; review: LayoutReview; limits: string[]; bindings: DocSpec["page"]["binding"][] } {
  // The maker may have removed or edited parts since the check: what of their content is unplaced now.
  // Counted before anything is built: an outline past the page limit is never laid out.
  const least = minimumPages(spec);
  if (least > MAX_DOCUMENT_PAGES) throw new PageLimitError(least);
  const checked: CheckedSpec = { spec, problems: base.problems, flags: base.flags, unplaced: unplacedContent(spec, content), ...(base.mode ? { mode: base.mode } : {}) };
  const project = projectFromSpec(checked);
  // Then the real count (continued pages, fillers) once the pages are expanded.
  const pages = resolveDocument(project).recipe.pageCount;
  if (pages > MAX_DOCUMENT_PAGES) throw new PageLimitError(pages, true);
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

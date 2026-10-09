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
export function buildFromOutline(spec: DocSpec, content: string, base: Pick<CheckedSpec, "problems" | "flags">): { checked: CheckedSpec; project: ProductProject; review: LayoutReview } {
  // The maker may have removed or edited parts since the check: what of their content is unplaced now.
  const checked: CheckedSpec = { spec, problems: base.problems, flags: base.flags, unplaced: unplacedContent(spec, content) };
  const project = projectFromSpec(checked);
  return { checked, project, review: reviewLayout(project, { max: 4 }) };
}

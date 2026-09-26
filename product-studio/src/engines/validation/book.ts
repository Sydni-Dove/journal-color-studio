/**
 * BOOK STRUCTURE VALIDATION — checks the EXPANDED book independently of the
 * engine that produced it (a guard, not a restatement):
 *   cadence / dates    engine errors: invalid cadence, missing date range, a
 *                      layout placed where it has no period, a broken "after"
 *   spreads            both halves present, consecutive, opening on a verso
 *   start sides        recto / verso start rules honoured in bound books
 *   duplicates         no page key (step × section × period × copy) twice
 *   blank pages        every filler is intentional and explained; never two in a row
 *   page count         numbering 1…n with no gaps; count matches the pages
 *   layout fit         every step's layout fits this trim size
 */
import { bookSteps } from "../recipe/bookRecipe";
import { recipeLayouts, type ResolvedDocument } from "../document/resolve";
import type { ValidationIssue } from "../../types/validation";

export function validateBook(doc: ResolvedDocument): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const add = (severity: ValidationIssue["severity"], message: string, page: number | null = null, componentId: string | null = null) =>
    out.push({ severity, rule: "book-structure", page, componentId, message });
  const { pages, pageCount, diagnostics } = doc.recipe;
  const composite = !!doc.project.recipe.structure;
  const paged = pages.some((p) => p.side !== "single");

  for (const d of diagnostics) out.push({ severity: d.severity, rule: composite ? "book-structure" : "page-count", page: null, componentId: d.itemId, message: d.message });

  if (pageCount !== pages.length) add("error", `Page count ${pageCount} does not match the ${pages.length} generated pages.`);
  pages.forEach((p, i) => {
    if (p.pageNumber !== i + 1) add("error", `Page numbering jumps at page ${i + 1} (found ${p.pageNumber}).`, p.pageNumber);
  });

  const keys = new Map<string, number>();
  pages.forEach((p, i) => {
    if (keys.has(p.key)) add("error", `Page ${p.pageNumber} duplicates page ${keys.get(p.key)} (${p.module?.title ?? p.layoutId}${p.module?.subtitle ? `, ${p.module.subtitle}` : ""}).`, p.pageNumber, p.recipeItemId);
    else keys.set(p.key, p.pageNumber);

    if (p.spreadPart === 0) {
      const next = pages[i + 1];
      if (!next || next.spreadPart !== 1 || next.recipeItemId !== p.recipeItemId || next.key.replace(/:1$/, "") !== p.key.replace(/:0$/, "")) add("error", `The spread starting on page ${p.pageNumber} is broken (its right-hand page does not follow).`, p.pageNumber, p.recipeItemId);
      if (paged && p.side !== "verso") add("error", `The spread starting on page ${p.pageNumber} opens on a right-hand page; spreads must open on the left.`, p.pageNumber, p.recipeItemId);
    }
    if (p.spreadPart === 1 && pages[i - 1]?.spreadPart !== 0) add("error", `Page ${p.pageNumber} is the right half of a spread with no left half.`, p.pageNumber, p.recipeItemId);

    if (p.filler) {
      if (composite && !p.fillerReason) add("error", `Page ${p.pageNumber} is a filler page with no purpose.`, p.pageNumber);
      if (pages[i + 1]?.filler) add("error", `Pages ${p.pageNumber}–${p.pageNumber + 1} are two filler pages in a row (an accidental blank).`, p.pageNumber);
    }
  });

  if (composite && paged) {
    const steps = new Map(bookSteps(doc.project.recipe.structure!).map(({ step }) => [step.id, step]));
    pages.forEach((p, i) => {
      if (p.filler || p.spreadPart === 1) return;
      const prev = pages[i - 1];
      if (prev && !prev.filler && prev.key === p.key) return;
      const rule = steps.get(p.recipeItemId)?.start;
      if (rule === "recto" && p.side !== "recto") add("error", `"${p.module?.title}" must start on a right-hand page but starts on page ${p.pageNumber} (left).`, p.pageNumber, p.recipeItemId);
      if (rule === "verso" && p.side !== "verso") add("error", `"${p.module?.title}" must start on a left-hand page but starts on page ${p.pageNumber} (right).`, p.pageNumber, p.recipeItemId);
    });
  }

  for (const { layout, fit } of recipeLayouts(doc)) if (!fit.ok) add("error", `${layout.label} does not fit this page size: ${fit.reason}`);
  return out;
}

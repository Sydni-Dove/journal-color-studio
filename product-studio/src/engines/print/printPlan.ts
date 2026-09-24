/**
 * PRINT ENGINE — decides WHICH pages print, how many times, and the @page
 * box. The pages themselves are drawn by the same PrintablePage used in the
 * editor (Preview = Print).
 */
import type { ExportSettings } from "../../types/project";
import { geometryFor, type ResolvedDocument } from "../document/resolve";

export type PrintPlan = {
  /** Page indices in output order (repeats included for repeated sheets). */
  sequence: number[];
  mediaWidthIn: number;
  mediaHeightIn: number;
  pageCss: string;
  errors: string[];
};

/** @page rule: exact media size, zero browser margins (no accidental scaling or margins). */
export function pageRuleCss(widthIn: number, heightIn: number): string {
  return `@page { size: ${widthIn}in ${heightIn}in; margin: 0; }`;
}

export function planPrint(doc: ResolvedDocument, settings: ExportSettings, currentIndex = 0): PrintPlan {
  const pages = doc.recipe.pages;
  const errors: string[] = [];
  let indices: number[];
  switch (settings.scope) {
    case "current-page":
      indices = [currentIndex];
      break;
    case "page-range": {
      const from = Math.max(1, settings.pageRange?.from ?? 1);
      const to = Math.min(pages.length, settings.pageRange?.to ?? pages.length);
      if (from > to) errors.push(`Page range ${from}–${to} is empty.`);
      indices = pages.map((_, i) => i).filter((i) => pages[i].pageNumber >= from && pages[i].pageNumber <= to);
      break;
    }
    default:
      indices = pages.map((_, i) => i);
  }

  const sequence: number[] = [];
  for (const i of indices) {
    const copies = settings.repeatSheets && pages[i].physicalSheets ? pages[i].physicalSheets : 1;
    for (let c = 0; c < copies; c++) sequence.push(i);
  }

  // All pages in one print job must share a media size.
  const sizes = new Set(indices.map((i) => {
    const g = geometryFor(doc, pages[i]);
    return `${g.mediaWidthIn.toFixed(4)}x${g.mediaHeightIn.toFixed(4)}`;
  }));
  if (sizes.size > 1) errors.push("Pages in this export have different media sizes; export them separately.");
  const g0 = geometryFor(doc, pages[indices[0] ?? 0]);
  return { sequence, mediaWidthIn: g0.mediaWidthIn, mediaHeightIn: g0.mediaHeightIn, pageCss: pageRuleCss(g0.mediaWidthIn, g0.mediaHeightIn), errors };
}

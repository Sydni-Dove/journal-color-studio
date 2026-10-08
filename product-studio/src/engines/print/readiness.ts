/**
 * EXPORT READINESS — print / PDF export only proceeds on final pagination.
 *
 * Pages are laid out with an approximate (heuristic) measurer until the real
 * fonts load, then laid out again with the canvas measurer; a face that loads
 * later (a heavier weight first used on a later page) triggers another layout.
 * Page counts, continuation pages and line breaks can differ between those
 * layouts, so exporting earlier could print a different book than the one the
 * editor shows once fonts settle.
 *
 * Export is ready only when:
 *   · the fonts are loaded (the studio's loader and the browser both say so),
 *   · the document was laid out with the real-font measurer, and
 *   · that measurer is the current one (no font change since the layout), and
 *   · the page count settled while measuring continuation pages.
 * The check runs when the export button is drawn and again immediately before
 * printing (components/export/ExportDialog.tsx).
 */
export type ExportReadinessInput = {
  /** The studio's font loader finished (useFontLoader). */
  fontsReady: boolean;
  /** document.fonts.status, when the browser reports it. */
  browserFonts?: "loading" | "loaded";
  /** The measurer the document was laid out with (ResolvedDocument.measurerId). */
  docMeasurerId: string;
  /** The measurer layouts use now (getLayoutMeasurer().id). */
  currentMeasurerId: string;
  /** Notes from resolving (ResolvedDocument.resolveNotes): a page count that did not settle. */
  resolveNotes?: string[];
};

export type ExportReadiness = { ready: true } | { ready: false; reason: string };

export function exportReadiness(s: ExportReadinessInput): ExportReadiness {
  if (!s.fontsReady || s.browserFonts === "loading") return { ready: false, reason: "Waiting for your fonts to load before the pages can be checked and exported." };
  if (!s.docMeasurerId.startsWith("canvas:")) return { ready: false, reason: "Laying the pages out with your fonts. Export is available as soon as that finishes." };
  if (s.docMeasurerId !== s.currentMeasurerId) return { ready: false, reason: "Your fonts changed: the pages are being laid out again. Export is available as soon as that finishes." };
  if (s.resolveNotes?.length) return { ready: false, reason: s.resolveNotes.join(" ") };
  return { ready: true };
}

/** The browser's own font status (absent outside a browser, e.g. in tests). */
export const browserFontStatus = (): "loading" | "loaded" | undefined =>
  typeof document !== "undefined" && document.fonts ? (document.fonts.status as "loading" | "loaded") : undefined;

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
import { solvePage, type ResolvedDocument } from "../document/resolve";
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
  /** Studio fonts the product uses that did not load (fontsNotLoaded): printing would substitute another font. */
  failedFonts?: string[];
};

export type ExportReadiness = { ready: true } | { ready: false; reason: string };

export function exportReadiness(s: ExportReadinessInput): ExportReadiness {
  if (!s.fontsReady || s.browserFonts === "loading") return { ready: false, reason: "Waiting for your fonts to load before the pages can be checked and exported." };
  if (s.failedFonts?.length)
    return { ready: false, reason: `${s.failedFonts.length === 1 ? `The font “${s.failedFonts[0]}” did` : `The fonts ${s.failedFonts.map((f) => `“${f}”`).join(", ")} did`} not load, so your pages can't be printed as designed (another font would be substituted and text could move). Check your internet connection and reopen the product, or choose another font in Style.` };
  if (!s.docMeasurerId.startsWith("canvas:")) return { ready: false, reason: "Laying the pages out with your fonts. Export is available as soon as that finishes." };
  if (s.docMeasurerId !== s.currentMeasurerId) return { ready: false, reason: "Your fonts changed: the pages are being laid out again. Export is available as soon as that finishes." };
  if (s.resolveNotes?.length) return { ready: false, reason: s.resolveNotes.join(" ") };
  return { ready: true };
}

/**
 * Studio fonts (from the font catalog — never system fonts) that have no
 * successfully loaded face in the browser. Run after the loader reports ready:
 * a face that errored, or a stylesheet that never arrived, leaves its family
 * without a loaded face. Outside a browser nothing can be checked: [].
 */
export function fontsNotLoaded(families: string[], isStudioFont: (family: string) => boolean): string[] {
  if (typeof document === "undefined" || !document.fonts) return [];
  const loaded = new Set<string>();
  document.fonts.forEach((face) => {
    if (face.status === "loaded") loaded.add(face.family.replace(/^["']|["']$/g, ""));
  });
  return [...new Set(families)].filter((f) => isStudioFont(f) && !loaded.has(f)).sort();
}

/**
 * The font families the given pages actually draw text in: each text node's
 * own family, else its role's family, else the font of its role's group — the
 * same choice the page renderer makes. Only these need to be loaded to print.
 */
export function fontsUsed(doc: ResolvedDocument, pageIndices: number[]): string[] {
  const out = new Set<string>();
  for (const i of pageIndices)
    for (const n of solvePage(doc, i).nodes) {
      if (n.type !== "text") continue;
      const role = doc.typography.roles[n.role];
      out.add(n.family ?? role.family ?? doc.typography.fonts[role.group]);
    }
  return [...out].sort();
}

/** The browser's own font status (absent outside a browser, e.g. in tests). */
export const browserFontStatus = (): "loading" | "loaded" | undefined =>
  typeof document !== "undefined" && document.fonts ? (document.fonts.status as "loading" | "loaded") : undefined;

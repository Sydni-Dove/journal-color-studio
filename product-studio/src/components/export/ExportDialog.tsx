import { plainIssue, SEVERITY_LABEL } from "../help/plainIssues";
import { TechnicalDetails } from "../help/visuals";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ResolvedDocument } from "../../engines/document/resolve";
import { planPrint } from "../../engines/print/printPlan";
import { compositionFor, contentGeometryFor, solvePage } from "../../engines/document/resolve";
import { coverSurfaceColors, coverSurfaceTheme } from "../../design-library/coverSurfaces";
import { rasterRequests } from "../../themes/decorationPlan";
import { prepareRasters } from "../../themes/recolor";
import { createCanvasMeasurer, getLayoutMeasurer, heuristicMeasurer } from "../../engines/typography/textMeasure";
import { browserFontStatus, exportReadiness, fontsNotLoaded, fontsUsed } from "../../engines/print/readiness";
import { findFont } from "../../presets/typography/typography";
import { validateProject } from "../../engines/validation/validate";
import type { ExportSettings } from "../../types/project";
import type { ProjectUsage } from "../../engines/document/usage";
import type { ValidationIssue } from "../../types/validation";
import { Check, LabeledNumeric, Segmented } from "../editor/ui";
import { PrintDocument } from "./PrintDocument";

/** Identical issues on many pages are listed once, with the pages they occur on. */
function groupIssues(issues: ValidationIssue[]): { issue: ValidationIssue; pages: number[]; details: string[] }[] {
  // One row per problem as the maker reads it: two rules that say the same thing in plain words
  // (a printer's and a binding's page minimum) are one row, with both technical messages kept.
  const byKey = new Map<string, { issue: ValidationIssue; pages: number[]; details: string[] }>();
  for (const i of issues) {
    const plain = plainIssue(i);
    const key = `${i.severity}|${i.rule}|${i.componentId ?? ""}|${plain.title}|${plain.advice ?? ""}`;
    const g = byKey.get(key);
    if (g) {
      if (i.page !== null && !g.pages.includes(i.page)) g.pages.push(i.page);
      if (!g.details.includes(i.message)) g.details.push(i.message);
    } else byKey.set(key, { issue: i, pages: i.page !== null ? [i.page] : [], details: [i.message] });
  }
  return [...byKey.values()];
}

export function IssueList({ issues, onGoTo }: { issues: ValidationIssue[]; onGoTo?: (page: number) => void }) {
  if (!issues.length) return <p className="hint">Everything checks out.</p>;
  return (
    <ul className="issues">
      {groupIssues(issues).map(({ issue: i, pages, details }, k) => {
        const plain = plainIssue(i);
        return (
          <li key={k} className={`issue issue--${i.severity}`} data-rule={i.rule}>
            <div className="issue-meta">
              {SEVERITY_LABEL[i.severity]}
              {pages.length > 0 && (
                <>
                  {" · "}
                  {onGoTo ? (
                    <button className="btn btn--ghost" style={{ minHeight: 44, padding: "0 10px" }} onClick={() => onGoTo(pages[0])}>
                      page {pages[0]}
                    </button>
                  ) : (
                    `page ${pages[0]}`
                  )}
                  {pages.length > 1 ? ` and ${pages.length - 1} more page${pages.length > 2 ? "s" : ""}` : ""}
                </>
              )}
            </div>
            <div className="issue-title">{plain.title}</div>
            {plain.advice && <div className="issue-advice">{plain.advice}</div>}
            <TechnicalDetails label="Show details">
              {details.map((d) => <div key={d}>{d}</div>)}
              {i.measurement && (
                <div>
                  measured {+i.measurement.actual.toFixed(4)} vs limit {+i.measurement.limit.toFixed(4)} {i.measurement.unit}
                </div>
              )}
              <div>
                <code>{i.rule}</code>
                {i.componentId ? <> · <code>{i.componentId}</code></> : null}
              </div>
            </TechnicalDetails>
          </li>
        );
      })}
    </ul>
  );
}

type Props = {
  doc: ResolvedDocument;
  usage: ProjectUsage;
  currentIndex: number;
  fontsReady: boolean;
  onClose: () => void;
  onGoTo: (page: number) => void;
  onSettings: (s: ExportSettings) => void;
};

/**
 * Resolves when every piece of artwork in the print tree is ready to paint: no
 * raster still being recolored, and every image decoded. Never waits forever
 * (30 s), so printing can't hang on one image.
 */
export async function artReady(root: HTMLElement | null, timeoutMs = 30_000): Promise<void> {
  if (!root) return;
  const until = Date.now() + timeoutMs;
  const frame = () => new Promise((r) => setTimeout(r, 50));
  while (root.querySelector('[data-decor="raster-pending"]') && Date.now() < until) await frame();
  const hrefs = [...new Set([...root.querySelectorAll("image")].map((i) => i.getAttribute("href") ?? "").filter(Boolean))];
  await Promise.race([
    Promise.all(hrefs.map((h) => { const img = new Image(); img.src = h; return img.decode().catch(() => undefined); })),
    new Promise((r) => setTimeout(r, Math.max(0, until - Date.now()))),
  ]);
}

export function ExportDialog({ doc, usage, currentIndex, fontsReady, onClose, onGoTo, onSettings }: Props) {
  const settings = doc.project.exportSettings;
  const [printing, setPrinting] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [prepError, setPrepError] = useState<string | null>(null);

  // Recolored decoration must be fully rendered before the print tree mounts —
  // print never captures a placeholder.
  const startPrint = async () => {
    setPreparing(true);
    setPrepError(null);
    try {
      const pages = [...new Set(plan.sequence)].map((i) => ({ g: contentGeometryFor(doc, doc.recipe.pages[i], i), comp: compositionFor(doc, i) }));
      // Covers with their own design-library surface: prepared in that surface's colors, for those pages only.
      const surfaces = [...new Set(plan.sequence)].flatMap((i) => {
        const surface = solvePage(doc, i).surface;
        if (!surface) return [];
        const page = { g: contentGeometryFor(doc, doc.recipe.pages[i], i), comp: { ...compositionFor(doc, i), ownArtwork: false } };
        return rasterRequests([page], coverSurfaceTheme(surface.assetId), coverSurfaceColors(surface.assetId, surface.ownColors, doc.colors));
      });
      await prepareRasters([...rasterRequests(pages, doc.background, doc.colors), ...rasterRequests(pages, doc.decorative, doc.colors), ...surfaces]);
      setPrinting(true);
    } catch (e) {
      setPrepError(`Decoration could not be prepared: ${(e as Error).message}`);
    } finally {
      setPreparing(false);
    }
  };
  const plan = useMemo(() => planPrint(doc, settings, currentIndex), [doc, settings, currentIndex]);
  const pageIndices = useMemo(() => [...new Set(plan.sequence)], [plan]);

  const report = useMemo(() => {
    const measure = (fontsReady && createCanvasMeasurer()) || heuristicMeasurer;
    return validateProject(doc.project, measure, { pageIndices });
  }, [doc.project, pageIndices, fontsReady]);

  // Final pagination only: real fonts loaded and the pages laid out with them (engines/print/readiness.ts).
  // The studio fonts the exported pages draw text in (a font chosen but used on no printed page doesn't block).
  const families = useMemo(() => fontsUsed(doc, pageIndices), [doc, pageIndices]);
  const readinessNow = () =>
    exportReadiness({
      fontsReady, browserFonts: browserFontStatus(), docMeasurerId: doc.measurerId, currentMeasurerId: getLayoutMeasurer().id, resolveNotes: doc.resolveNotes,
      failedFonts: fontsReady ? fontsNotLoaded(families, (f) => findFont(f).family === f) : [],
    });
  const readiness = readinessNow();
  // The latest check, for the moment just before printing (fonts can finish loading while artwork is prepared).
  const latestReadiness = useRef(readinessNow);
  latestReadiness.current = readinessNow;
  const blocked = !report.exportAllowed || plan.errors.length > 0 || !readiness.ready;

  useEffect(() => {
    if (!printing) return;
    let cancelled = false;
    const after = () => setPrinting(false);
    window.addEventListener("afterprint", after);
    // Wait for fonts, the artwork (every recolored image decoded — a large painted cover can take a moment),
    // then two frames so the print tree is laid out and painted before printing.
    document.fonts.ready
      .then(() => artReady(document.getElementById("print-root")))
      .then(() =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (cancelled) return;
            // Checked again now: a font that finished meanwhile means new pagination, not this print tree.
            const r = latestReadiness.current();
            if (!r.ready) {
              setPrinting(false);
              setPrepError(`Not printed: ${r.reason}`);
              return;
            }
            window.print();
          }),
        ),
      );
    return () => {
      cancelled = true;
      window.removeEventListener("afterprint", after);
    };
  }, [printing]);

  const isPad = doc.binding.sheetCountIsMetadata;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Export">
      <div className="modal">
        <h2>Print / Save PDF</h2>
        <Segmented
          label="What to export"
          value={settings.scope}
          options={[
            { value: "full", label: "Whole product" },
            ...(usage.mixedPageOrientation
              ? [
                  { value: "landscape-pages" as const, label: "Landscape pages" },
                  { value: "portrait-pages" as const, label: "Portrait pages" },
                ]
              : []),
            { value: "current-page", label: "Current page" },
            { value: "page-range", label: "Page range" },
          ]}
          onChange={(scope) => onSettings({ ...settings, scope })}
        />
        {settings.scope === "page-range" && (
          <div className="row">
            <LabeledNumeric
                label="From"
                rules={{ min: 1, max: settings.pageRange?.to ?? doc.recipe.pageCount, integer: true }}
                step={1}
                value={settings.pageRange?.from ?? 1}
                onCommit={(from) => from !== null && onSettings({ ...settings, pageRange: { from, to: settings.pageRange?.to ?? doc.recipe.pageCount } })}
              />
            <LabeledNumeric
                label="To"
                rules={{ min: settings.pageRange?.from ?? 1, max: doc.recipe.pageCount, integer: true }}
                step={1}
                value={settings.pageRange?.to ?? doc.recipe.pageCount}
                onCommit={(to) => to !== null && onSettings({ ...settings, pageRange: { from: settings.pageRange?.from ?? 1, to } })}
              />
          </div>
        )}
        {isPad && (
          <Check
            label={`Print every sheet of the pad (${doc.recipe.pages[0]?.physicalSheets ?? ""} copies of the design) — for printing at home. Off: one design page for a pad printer.`}
            checked={settings.repeatSheets}
            onChange={(repeatSheets) => onSettings({ ...settings, repeatSheets })}
          />
        )}
        <Segmented
          label="Paper"
          value={settings.paper ?? "page"}
          options={[
            { value: "page", label: "Page size (PDF, print shop)" },
            { value: "letter", label: "Letter (home printer)" },
            { value: "a4", label: "A4 (home printer)" },
          ]}
          onChange={(paper) => onSettings({ ...settings, paper: paper === "page" ? undefined : paper })}
        />
        {settings.paper && settings.paper !== "page" && (
          <Check
            label="Show trim marks"
            checked={settings.showTrimMarks === true}
            onChange={(showTrimMarks) => onSettings({ ...settings, showTrimMarks })}
          />
        )}
        <p className="hint" data-testid="export-output">
          Output: {plan.sequence.length} page(s), {plan.mediaWidthIn}" × {plan.mediaHeightIn}"
          {doc.project.production.includeBleed ? " (page size plus the area past the cut edge)" : " (page size)"}
          {settings.paper && settings.paper !== "page" ? `, centred on ${settings.paper === "letter" ? "Letter" : "A4"} paper with nothing else on the sheet` : ""}.{" "}
          {settings.paper && settings.paper !== "page"
            ? `In the print dialog keep scale at 100% (“Default” or “Actual size”) and turn on background graphics.${settings.showTrimMarks ? ` Cut along the corner marks for a page whose art runs to every edge${doc.project.production.includeBleed ? "" : " — turn on “Extend background past the cut edge” (Page setup) so no white shows where you cut"}.` : " Trim marks are off; turn them on above only when you plan to cut the sheet down to the finished page size."}`
            : "In the print dialog choose “Save as PDF”, margins “None”, scale 100%, and turn on background graphics. A home printer has no paper this size — choose Letter or A4 above to print at home."}
        </p>
        <div className="row">
          <span className={`badge ${report.errorCount ? "badge--error" : "badge--ok"}`}>{report.errorCount} to fix</span>
          <span className={`badge ${report.warningCount ? "badge--warning" : ""}`}>{report.warningCount} to check</span>
          <span className="hint">{report.checkedPages} page(s) checked · {readiness.ready ? "checked with your fonts" : "not ready to export yet"}</span>
        </div>
        {plan.errors.map((e) => (
          <div key={e} className="issue issue--error">{e}</div>
        ))}
        <IssueList
          issues={report.issues}
          onGoTo={(p) => {
            onGoTo(p);
            onClose();
          }}
        />
        {prepError && <div className="issue issue--error">{prepError}</div>}
        {!readiness.ready && <p className="hint" data-export-readiness="waiting">{readiness.reason}</p>}
        {!report.exportAllowed && <p className="hint">Fix the items marked “Needs fixing before export” to export. Nothing is exported with a known problem.</p>}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn" onClick={onClose}>Close</button>
          <button className="btn btn--primary" disabled={blocked || printing || preparing} onClick={startPrint}>
            {printing || preparing ? "Preparing…" : "Print / Save PDF"}
          </button>
        </div>
      </div>
      {printing && <PrintDocument doc={doc} plan={plan} />}
    </div>
  );
}

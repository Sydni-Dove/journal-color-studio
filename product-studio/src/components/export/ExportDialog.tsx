import { plainIssue, SEVERITY_LABEL } from "../help/plainIssues";
import { TechnicalDetails } from "../help/visuals";
import { useEffect, useMemo, useState } from "react";
import type { ResolvedDocument } from "../../engines/document/resolve";
import { planPrint } from "../../engines/print/printPlan";
import { compositionFor, geometryFor } from "../../engines/document/resolve";
import { rasterRequests } from "../../themes/decorationPlan";
import { prepareRasters } from "../../themes/recolor";
import { createCanvasMeasurer, heuristicMeasurer } from "../../engines/typography/textMeasure";
import { validateProject } from "../../engines/validation/validate";
import type { ExportSettings } from "../../types/project";
import type { ValidationIssue } from "../../types/validation";
import { Check, LabeledNumeric, Segmented } from "../editor/ui";
import { PrintDocument } from "./PrintDocument";

/** Identical issues on many pages are listed once, with the pages they occur on. */
function groupIssues(issues: ValidationIssue[]): { issue: ValidationIssue; pages: number[] }[] {
  const byKey = new Map<string, { issue: ValidationIssue; pages: number[] }>();
  for (const i of issues) {
    const key = `${i.severity}|${i.rule}|${i.componentId ?? ""}|${i.message}`;
    const g = byKey.get(key);
    if (g) {
      if (i.page !== null) g.pages.push(i.page);
    } else byKey.set(key, { issue: i, pages: i.page !== null ? [i.page] : [] });
  }
  return [...byKey.values()];
}

export function IssueList({ issues, onGoTo }: { issues: ValidationIssue[]; onGoTo?: (page: number) => void }) {
  if (!issues.length) return <p className="hint">Everything checks out.</p>;
  return (
    <ul className="issues">
      {groupIssues(issues).map(({ issue: i, pages }, k) => {
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
              <div>{i.message}</div>
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
  currentIndex: number;
  fontsReady: boolean;
  onClose: () => void;
  onGoTo: (page: number) => void;
  onSettings: (s: ExportSettings) => void;
};

export function ExportDialog({ doc, currentIndex, fontsReady, onClose, onGoTo, onSettings }: Props) {
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
      const pages = [...new Set(plan.sequence)].map((i) => ({ g: geometryFor(doc, doc.recipe.pages[i]), comp: compositionFor(doc, i) }));
      await prepareRasters([...rasterRequests(pages, doc.background, doc.colors), ...rasterRequests(pages, doc.decorative, doc.colors)]);
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

  const blocked = !report.exportAllowed || plan.errors.length > 0 || !fontsReady;

  useEffect(() => {
    if (!printing) return;
    let cancelled = false;
    const after = () => setPrinting(false);
    window.addEventListener("afterprint", after);
    // Wait for fonts + two frames so the print tree is laid out before printing.
    document.fonts.ready.then(() =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (!cancelled) window.print();
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
        <p className="hint">
          Output: {plan.sequence.length} page(s), {plan.mediaWidthIn}" × {plan.mediaHeightIn}"
          {doc.project.production.includeBleed ? " (page size plus the area past the cut edge)" : " (page size)"}. In the print dialog choose “Save as PDF”, margins “None”, scale 100%, and enable background graphics.
        </p>
        <div className="row">
          <span className={`badge ${report.errorCount ? "badge--error" : "badge--ok"}`}>{report.errorCount} to fix</span>
          <span className={`badge ${report.warningCount ? "badge--warning" : ""}`}>{report.warningCount} to check</span>
          <span className="hint">{report.checkedPages} page(s) checked · {fontsReady ? "checked with your fonts" : "waiting for fonts…"}</span>
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

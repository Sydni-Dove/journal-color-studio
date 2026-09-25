import { useEffect, useMemo, useState } from "react";
import type { ResolvedDocument } from "../../engines/document/resolve";
import { planPrint } from "../../engines/print/printPlan";
import { geometryFor } from "../../engines/document/resolve";
import { rasterRequests } from "../../themes/decorationPlan";
import { prepareRasters } from "../../themes/recolor";
import { createCanvasMeasurer, heuristicMeasurer } from "../../engines/typography/textMeasure";
import { validateProject } from "../../engines/validation/validate";
import type { ExportSettings } from "../../types/project";
import type { ValidationIssue } from "../../types/validation";
import { Check, Field, Segmented } from "../editor/ui";
import { PrintDocument } from "./PrintDocument";

export function IssueList({ issues, onGoTo }: { issues: ValidationIssue[]; onGoTo?: (page: number) => void }) {
  if (!issues.length) return <p className="hint">No issues.</p>;
  return (
    <ul className="issues">
      {issues.map((i, k) => (
        <li key={k} className={`issue issue--${i.severity}`}>
          <div className="issue-meta">
            {i.severity} · {i.rule}
            {i.page !== null && (
              <>
                {" · "}
                {onGoTo ? (
                  <button className="btn btn--ghost" style={{ minHeight: 44, padding: "0 10px" }} onClick={() => onGoTo(i.page!)}>
                    page {i.page}
                  </button>
                ) : (
                  `page ${i.page}`
                )}
              </>
            )}
            {i.componentId ? ` · ${i.componentId}` : ""}
          </div>
          <div>{i.message}</div>
          {i.measurement && (
            <div className="hint">
              measured {+i.measurement.actual.toFixed(4)} vs limit {+i.measurement.limit.toFixed(4)} {i.measurement.unit}
            </div>
          )}
        </li>
      ))}
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
      const geos = [...new Set(plan.sequence)].map((i) => geometryFor(doc, doc.recipe.pages[i]));
      await prepareRasters(rasterRequests(geos, doc.decorative, doc.colors));
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
          label="Scope"
          value={settings.scope}
          options={[
            { value: "full", label: "Full project" },
            { value: "current-page", label: "Current page" },
            { value: "page-range", label: "Page range" },
          ]}
          onChange={(scope) => onSettings({ ...settings, scope })}
        />
        {settings.scope === "page-range" && (
          <div className="row">
            <Field label="From">
              <input type="number" min={1} value={settings.pageRange?.from ?? 1} onChange={(e) => onSettings({ ...settings, pageRange: { from: +e.target.value, to: settings.pageRange?.to ?? doc.recipe.pageCount } })} />
            </Field>
            <Field label="To">
              <input type="number" min={1} value={settings.pageRange?.to ?? doc.recipe.pageCount} onChange={(e) => onSettings({ ...settings, pageRange: { from: settings.pageRange?.from ?? 1, to: +e.target.value } })} />
            </Field>
          </div>
        )}
        {isPad && (
          <Check
            label={`Repeat each master sheet ${doc.recipe.pages[0]?.physicalSheets ?? ""}× (home printing). Off = one master sheet for the pad printer.`}
            checked={settings.repeatSheets}
            onChange={(repeatSheets) => onSettings({ ...settings, repeatSheets })}
          />
        )}
        <p className="hint">
          Output: {plan.sequence.length} page(s) at {plan.mediaWidthIn}" × {plan.mediaHeightIn}" media
          {doc.project.production.includeBleed ? " (trim + bleed)" : " (trim)"}. In the print dialog choose “Save as PDF”, margins “None”, scale 100%, and enable background graphics.
        </p>
        <div className="row">
          <span className={`badge ${report.errorCount ? "badge--error" : "badge--ok"}`}>{report.errorCount} errors</span>
          <span className={`badge ${report.warningCount ? "badge--warning" : ""}`}>{report.warningCount} warnings</span>
          <span className="hint">{report.checkedPages} page(s) checked · {fontsReady ? "measured with loaded fonts" : "waiting for fonts…"}</span>
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
        {!report.exportAllowed && <p className="hint">Export is blocked until every error is fixed. Nothing is exported silently.</p>}
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

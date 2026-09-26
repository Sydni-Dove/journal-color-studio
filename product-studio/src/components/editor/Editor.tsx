import { useCallback, useMemo, useState } from "react";
import { compositionFor, geometryFor, resolveDocument, solvePage, type ResolvedDocument } from "../../engines/document/resolve";
import { planDecoration } from "../../themes/decorationPlan";
import { computeUsage } from "../../engines/document/usage";
import { createCanvasMeasurer, heuristicMeasurer, setLayoutMeasurer } from "../../engines/typography/textMeasure";
import { finalizeReport, validatePage, validateProductLevel } from "../../engines/validation/validate";
import type { ProductProject } from "../../types/project";
import { useFontLoader } from "../../utils/useFontLoader";
import { DEBUG_ALL, DEBUG_LABELS, DEBUG_OFF, type DebugFlags } from "../debug/DebugOverlay";
import { GeometryInfo } from "../debug/GeometryInfo";
import { ExportDialog, IssueList } from "../export/ExportDialog";
import { PagePreview, visibleIndices } from "../preview/PagePreview";
import { ColorPanel, DecorationPanel, LayoutPanel, PatternPanel, SpacingPanel, TextPlacementPanel, TypographyPanel, VariantsPanel, WordingPanel } from "./DesignPanels";
import { PagesPanel, ProductPanel, ProductionPanel } from "./ProductionPanels";
import { Section, type EditorNav } from "./ui";
import { getLayout } from "../../layouts/registry";

type Props = {
  project: ProductProject;
  onChange: (p: ProductProject) => void;
  onBack: () => void;
  saveStatus: "saved" | "saving" | "error";
};

function tryResolve(p: ProductProject): { doc: ResolvedDocument | null; error: string | null } {
  try {
    return { doc: resolveDocument(p), error: null };
  } catch (e) {
    return { doc: null, error: (e as Error).message };
  }
}

export function Editor({ project, onChange, onBack, saveStatus }: Props) {
  // Open on the first real page (spread products start with a filler page).
  const [index, setIndex] = useState(() => {
    try {
      return Math.max(0, resolveDocument(project).recipe.pages.findIndex((p) => !p.filler));
    } catch {
      return 0;
    }
  });
  const [debug, setDebug] = useState<DebugFlags>(DEBUG_OFF);
  const [exporting, setExporting] = useState(false);
  const fontsReady = useFontLoader(project.typography.fonts);

  const update = useCallback(
    (fn: (p: ProductProject) => ProductProject) => onChange({ ...fn(project), updatedAt: new Date().toISOString() }),
    [project, onChange],
  );

  // Layouts fit headings with the same real glyph metrics the live check uses, once the fonts have loaded.
  const layoutMeasure = useMemo(() => {
    const canvas = fontsReady ? createCanvasMeasurer() : null;
    const id = canvas ? `canvas:${JSON.stringify(project.typography.fonts)}` : "heuristic";
    setLayoutMeasurer(id, canvas ?? heuristicMeasurer);
    return id;
  }, [fontsReady, project.typography.fonts]);
  // Re-resolve when the layout measurer changes (solve keys include it).
  const { doc, error } = useMemo(() => (void layoutMeasure, tryResolve(project)), [project, layoutMeasure]);
  const usage = useMemo(() => (doc ? computeUsage(doc) : null), [doc]);

  // Live check of the visible page(s) with real font metrics once fonts load.
  const check = useMemo(() => {
    if (!doc || !doc.recipe.pages.length) return null;
    const measure = (fontsReady && createCanvasMeasurer()) || heuristicMeasurer;
    const i = Math.min(index, doc.recipe.pages.length - 1);
    const pages = visibleIndices(doc, i, false);
    const group = doc.recipe.pages[i].spreadPart !== undefined ? visibleIndices(doc, i, true) : pages;
    const issues = [...validateProductLevel(doc), ...group.flatMap((k) => validatePage(doc, k, measure))];
    return finalizeReport(issues, group.length);
  }, [doc, index, fontsReady]);
  const issueIds = useMemo(() => new Set((check?.issues ?? []).map((i) => i.componentId ?? "").filter(Boolean)), [check]);

  const current = doc && doc.recipe.pages.length ? Math.min(index, doc.recipe.pages.length - 1) : 0;
  // How the decoration was composed on the page being viewed (shown in the Decoration panel).
  const decor = useMemo(() => {
    if (!doc || !doc.recipe.pages.length) return null;
    const plan = planDecoration(geometryFor(doc, doc.recipe.pages[current]), doc.decorative, doc.colors, compositionFor(doc, current));
    return { reports: plan?.reports ?? [], colors: doc.colors, pageNumber: doc.recipe.pages[current].pageNumber };
  }, [doc, current]);
  const nav: EditorNav = {
    currentLayoutId: doc?.recipe.pages[current]?.layoutId ?? "",
    goToLayout: (id) => doc && setIndex(Math.max(0, doc.recipe.pages.findIndex((p) => p.layoutId === id && !p.filler))),
    goToItem: (id) => doc && setIndex(Math.max(0, doc.recipe.pages.findIndex((p) => p.recipeItemId === id && !p.filler))),
    goToSide: (side) => doc && setIndex(Math.max(0, doc.recipe.pages.findIndex((p) => p.side === side && !p.filler))),
    goToMonth: (key) => doc && setIndex(Math.max(0, doc.recipe.pages.findIndex((p) => p.period.kind === "month" && p.period.key === key))),
    layoutLabel: (id) => getLayout(id).label,
  };
  const goToPage = (n: number) => doc && setIndex(Math.max(0, doc.recipe.pages.findIndex((p) => p.pageNumber === n)));

  return (
    <>
      <header className="topbar">
        <button className="btn" onClick={onBack}>‹ Projects</button>
        <input className="name-input" value={project.name} aria-label="Project name" onChange={(e) => update((p) => ({ ...p, name: e.target.value }))} />
        <span className={`save-status ${saveStatus === "error" ? "save-status--error" : ""}`}>
          {saveStatus === "saved" ? "Saved" : saveStatus === "saving" ? "Saving…" : "Save failed (storage full?)"}
        </span>
        <span className="spacer" />
        {check && (
          <span className={`badge ${check.errorCount ? "badge--error" : check.warningCount ? "badge--warning" : "badge--ok"}`}>
            {check.errorCount ? `${check.errorCount} errors` : check.warningCount ? `${check.warningCount} warnings` : "Page OK"}
          </span>
        )}
        <button className="btn btn--primary" disabled={!doc} onClick={() => setExporting(true)}>
          Export
        </button>
      </header>

      <div className="editor">
        <aside className="panel" aria-label="Product controls">
          <ProductPanel project={project} update={update} />
          <ProductionPanel project={project} update={update} doc={doc} nav={doc ? nav : null} />
          {doc && usage && (
            <>
              <PagesPanel nav={nav} project={project} update={update} doc={doc} usage={usage} />
              <LayoutPanel nav={nav} project={project} update={update} usage={usage} />
              <PatternPanel nav={nav} project={project} update={update} usage={usage} />
              <SpacingPanel nav={nav} project={project} update={update} usage={usage} />
              <TypographyPanel nav={nav} project={project} update={update} usage={usage} />
              <ColorPanel nav={nav} project={project} update={update} usage={usage} />
              <WordingPanel nav={nav} project={project} update={update} usage={usage} />
              <TextPlacementPanel nav={nav} project={project} update={update} usage={usage} />
              <DecorationPanel nav={nav} project={project} update={update} usage={usage} decor={decor} />
              <VariantsPanel nav={nav} project={project} update={update} usage={usage} />
            </>
          )}

          <Section title={`Page check${check ? ` · ${check.errorCount}E ${check.warningCount}W` : ""}`}>
            {check ? <IssueList issues={check.issues} onGoTo={goToPage} /> : <p className="hint">—</p>}
          </Section>

          <Section title="Debug geometry overlay">
            <div className="row">
              <button className="btn" onClick={() => setDebug(DEBUG_ALL)}>All on</button>
              <button className="btn" onClick={() => setDebug(DEBUG_OFF)}>All off</button>
            </div>
            {(Object.keys(DEBUG_LABELS) as (keyof DebugFlags)[]).map((k) => (
              <label key={k} className="check">
                <input type="checkbox" checked={debug[k]} onChange={(e) => setDebug((d) => ({ ...d, [k]: e.target.checked }))} />
                {DEBUG_LABELS[k]}
              </label>
            ))}
            <p className="hint">The overlay is editor-only and never prints.</p>
          </Section>

          {doc && doc.recipe.pages.length > 0 && (
            <details className="section">
              <summary>Geometry info</summary>
              <GeometryInfo doc={doc} geometry={geometryFor(doc, doc.recipe.pages[current])} solved={solvePage(doc, current)} />
            </details>
          )}
        </aside>

        <main className="stage">
          {doc ? (
            <PagePreview doc={doc} index={current} onIndex={setIndex} debug={debug} issueIds={issueIds} />
          ) : (
            <div className="page-shell">
              <div className="issue issue--error">Cannot build this product: {error}</div>
            </div>
          )}
        </main>
      </div>

      {exporting && doc && (
        <ExportDialog
          doc={doc}
          currentIndex={current}
          fontsReady={fontsReady}
          onClose={() => setExporting(false)}
          onGoTo={goToPage}
          onSettings={(exportSettings) => update((p) => ({ ...p, exportSettings }))}
        />
      )}
    </>
  );
}

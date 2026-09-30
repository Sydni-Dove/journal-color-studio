import { LUXE_TITLE_FONT } from "../../presets/coverLuxe";
import { useCallback, useMemo, useState, type CSSProperties } from "react";
import { PanelResizer, usePanelWidth } from "./PanelResizer";
import { compositionFor, geometryFor, resolveDocument, solvePage, type ResolvedDocument } from "../../engines/document/resolve";
import { planDecoration } from "../../themes/decorationPlan";
import { computeUsage } from "../../engines/document/usage";
import { createCanvasMeasurer, heuristicMeasurer, setLayoutMeasurer } from "../../engines/typography/textMeasure";
import { finalizeReport, validatePage, validateProductLevel } from "../../engines/validation/validate";
import type { ProductProject } from "../../types/project";
import { useFontFacesLoaded, useFontLoader } from "../../utils/useFontLoader";
import { DEBUG_ALL, DEBUG_LABELS, DEBUG_OFF, type DebugFlags } from "../debug/DebugOverlay";
import { GeometryInfo } from "../debug/GeometryInfo";
import { ExportDialog, IssueList } from "../export/ExportDialog";
import { PagePreview, visibleIndices } from "../preview/PagePreview";
import { StationeryPanel } from "./StationeryPanel";
import { BackgroundPanel, ColorPanel, DecorationPanel, LayoutPanel, PatternPanel, SpacingPanel, TextPlacementPanel, TypographyPanel, VariantsPanel, WordingPanel } from "./DesignPanels";
import { PagesPanel, PlannerSetupPanel, ProductPanel, ProductionPanel } from "./ProductionPanels";
import { BookOutlinePanel, BookStructurePanel, ThisPagePanel } from "./BookPanels";
import { PagesBuilder } from "./PagesBuilder";
import { DesignPresetsPanel } from "./DesignPresetsPanel";
import { AreaList, AreaView, useArea, type AreaId } from "./Areas";
import { ThisPageHeading, AddToPageHint } from "./ThisPage";
import { pageInfo } from "../../engines/document/pageInfo";
import { findPalette } from "../../presets/themes/palettes";
import { SIZE_PRESETS } from "../../presets/sizes/sizePresets";
import { BINDING_PROFILES } from "../../presets/bindingProfiles/bindingProfiles";
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
  const panel = usePanelWidth();
  // The Neutral Cheetah Luxe script is always loaded: covers and dividers in that design use it for their title.
  const fontsReady = useFontLoader(project.typography.fonts, [LUXE_TITLE_FONT]);
  const facesLoaded = useFontFacesLoaded();

  const update = useCallback(
    (fn: (p: ProductProject) => ProductProject) => onChange({ ...fn(project), updatedAt: new Date().toISOString() }),
    [project, onChange],
  );

  // Layouts fit headings with the same real glyph metrics the live check uses, once the fonts have loaded
  // (and again whenever another face finishes loading, so nothing stays measured with a fallback's widths).
  const layoutMeasure = useMemo(() => {
    const canvas = fontsReady ? createCanvasMeasurer() : null;
    const id = canvas ? `canvas:${JSON.stringify(project.typography.fonts)}:${facesLoaded}` : "heuristic";
    setLayoutMeasurer(id, canvas ?? heuristicMeasurer);
    return id;
  }, [fontsReady, project.typography.fonts, facesLoaded]);
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
    // Issues that belong to another page of the book (e.g. a page style that doesn't fit this size) are listed
    // apart and never counted against the page in view.
    // A page style that doesn't fit this size belongs to the pages using it (it may have no pages at all yet).
    const shown = new Set(group.map((k) => doc.recipe.pages[k].pageNumber));
    const styles = new Set(group.map((k) => `layout:${doc.recipe.pages[k].layoutId}`));
    const isHere = (x: (typeof issues)[number]) => (x.componentId?.startsWith("layout:") ? styles.has(x.componentId) : x.page === null || shown.has(x.page));
    return { ...finalizeReport(issues.filter(isHere), group.length), elsewhere: issues.filter((x) => !isHere(x)) };
  }, [doc, index, fontsReady, facesLoaded]);
  const elsewhereErrors = check?.elsewhere.filter((x) => x.severity === "error").length ?? 0;
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
  const [area, setArea] = useArea();
  const currentItemId = doc?.recipe.pages[current]?.recipeItemId;
  const summaries: Partial<Record<AreaId, string>> = doc
    ? {
        pages: `${doc.recipe.pageCount} page${doc.recipe.pageCount === 1 ? "" : "s"}${doc.calendar ? (doc.calendar.settings.undated ? " · Undated" : ` · ${doc.calendar.settings.startDate.slice(0, 4)}`) : ""}`,
        layout: `This page: ${pageInfo(doc, current).typeLabel}`,
        style: findPalette(project.colors.paletteId)?.label ?? "Colors, background, decorations and typography",
        setup: `${SIZE_PRESETS.find((z) => z.id === project.dimensions.sizePresetId)?.label ?? "Custom size"} · ${BINDING_PROFILES[project.production.bindingType]?.label ?? project.production.bindingType}`,
        print: check ? (check.errorCount ? `${check.errorCount} to fix before printing` : check.warningCount ? `${check.warningCount} to check` : "This page checks out") : undefined,
      }
    : {};

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
          <button type="button" className={`badge badge--button ${check.errorCount ? "badge--error" : check.warningCount || elsewhereErrors ? "badge--warning" : "badge--ok"}`} title="Page check" onClick={() => setArea("print")}>
            {check.errorCount ? `${check.errorCount} to fix` : check.warningCount ? `${check.warningCount} to check` : "Page OK"}
            {elsewhereErrors ? ` · ${elsewhereErrors} elsewhere in the book` : ""}
          </button>
        )}
        <button className="btn btn--primary" disabled={!doc} onClick={() => setExporting(true)}>
          Export
        </button>
      </header>

      <div className="editor" style={{ "--ui-panel-w": `${panel.width}px` } as CSSProperties}>
        <aside className="panel" aria-label="Product controls">
          {area === null ? (
            <AreaList summaries={summaries} onOpen={setArea} />
          ) : (
            <AreaView id={area} onBack={() => setArea(null)}>
              {area === "pages" && doc && usage && (
                <>
                  <PlannerSetupPanel nav={nav} project={project} update={update} doc={doc} usage={usage} />
                  {doc.binding.sheetCountIsMetadata ? (
                    <PagesPanel nav={nav} project={project} update={update} doc={doc} usage={usage} />
                  ) : (
                    <>
                      <PagesBuilder project={project} update={update} doc={doc} onEdit={(id) => { nav.goToItem(id); setArea("layout"); }} />
                      <BookStructurePanel project={project} update={update} doc={doc} goToStep={nav.goToItem} />
                    </>
                  )}
                  <p className="hint">To move between the printed pages, use <strong>Browse pages</strong> above the preview.</p>
                </>
              )}
              {area === "layout" && doc && usage && (
                <>
                  <ThisPageHeading doc={doc} current={current} />
                  {project.recipe.structure ? (
                    <ThisPagePanel project={project} update={update} doc={doc} current={current} parts={["basics", "cover"]} />
                  ) : (
                    currentItemId && <div className="card"><PagesPanel nav={nav} project={project} update={update} doc={doc} usage={usage} onlyItemId={currentItemId} bare /></div>
                  )}
                  <LayoutPanel nav={nav} project={project} update={update} usage={usage} part="layout" />
                  <SpacingPanel nav={nav} project={project} update={update} usage={usage} />
                  <WordingPanel nav={nav} project={project} update={update} usage={usage} />
                </>
              )}
              {area === "writing" && doc && usage && (
                <>
                  <ThisPageHeading doc={doc} current={current} />
                  <PatternPanel nav={nav} project={project} update={update} usage={usage} />
                  <LayoutPanel nav={nav} project={project} update={update} usage={usage} part="writing" />
                  {!usage.patterns.length && !usage.lineStyle && !usage.sectionsPerDay && !usage.writingRows && <p className="hint">This product has no writing-line settings.</p>}
                </>
              )}
              {area === "add" && doc && usage && (
                <>
                  <ThisPageHeading doc={doc} current={current} />
                  {project.recipe.structure && <ThisPagePanel project={project} update={update} doc={doc} current={current} parts={["sections"]} />}
                  <StationeryPanel project={project} update={update} usage={usage} doc={doc} />
                  <LayoutPanel nav={nav} project={project} update={update} usage={usage} part="add" />
                  <AddToPageHint doc={doc} current={current} usage={usage} />
                </>
              )}
              {area === "style" && doc && usage && (
                  <>
                  <DesignPresetsPanel project={project} update={update} doc={doc} current={current} />
                  <ColorPanel nav={nav} project={project} update={update} usage={usage} />
                  <BackgroundPanel nav={nav} project={project} update={update} usage={usage} colors={doc.colors} />
                  <DecorationPanel nav={nav} project={project} update={update} usage={usage} decor={decor} />
                  <TypographyPanel nav={nav} project={project} update={update} usage={usage} />
                  <VariantsPanel nav={nav} project={project} update={update} usage={usage} />
                </>
              )}
              {area === "setup" && (
                <>
                  <ProductPanel project={project} update={update} />
                  <ProductionPanel project={project} update={update} doc={doc} nav={doc ? nav : null} />
                </>
              )}
              {area === "print" && (
                <>
                  <div className="card-actions">
                    <button className="btn btn--primary" disabled={!doc} onClick={() => setExporting(true)}>Print / Save PDF…</button>
                  </div>
                  <Section title={`Page check${check ? ` · ${check.errorCount} to fix · ${check.warningCount} to check` : ""}`} open>
                    <p className="hint">Checks the page you are viewing (and its facing page). The whole product is checked again when you print.</p>
                    {check ? <IssueList issues={check.issues} onGoTo={goToPage} /> : <p className="hint">—</p>}
                    {check && check.elsewhere.length > 0 && (
                      <>
                        <div className="group-label">Other pages in this book</div>
                        <p className="hint">Not a problem with this page's design: another page style in the book doesn't fit this size.</p>
                        <IssueList issues={check.elsewhere} onGoTo={goToPage} />
                      </>
                    )}
                  </Section>
                </>
              )}
              {area === "advanced" && (
                <>
                  {doc && usage && <TextPlacementPanel nav={nav} project={project} update={update} usage={usage} />}
                  {doc && doc.recipe.pageCount > 1 && <BookOutlinePanel doc={doc} current={current} goTo={setIndex} />}
                  <Section title="Developer: page guides">
                    <p className="hint">Draws print guides over the preview for checking a layout. Never printed.</p>
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
                  </Section>
                  {doc && doc.recipe.pages.length > 0 && (
                    <details className="section">
                      <summary>Developer: exact measurements</summary>
                      <GeometryInfo doc={doc} geometry={geometryFor(doc, doc.recipe.pages[current])} solved={solvePage(doc, current)} />
                    </details>
                  )}
                </>
              )}
            </AreaView>
          )}
        </aside>

        <PanelResizer width={panel.width} onChange={panel.set} onReset={panel.reset} />
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

/**
 * Design controls. Every control here is gated by ProjectUsage: it appears
 * only when the current product consumes it, so none is a placebo.
 */
import { ROLE_LABEL, rolesFor } from "../../design-library/placement";
import { DAILY_SECTIONS, dailySectionsOf, type DailySection } from "../../layouts/planner/dailyConfigurable";
import { fillerKindOf, monthlyArrangementOf, monthlySidebarOf, spreadModeOf, weeklyNotesOf, weeklyPlanNotesOf, weeklyPlanPrioritiesOf, weeklySidebarOf, type PlannerSection } from "../../layouts/planner/plannerOptions";
import { findAsset } from "../../design-library/library";
import { applyVariant, resolveDocument, type ResolvedDocument } from "../../engines/document/resolve";
import { PageThumb } from "../preview/PageThumb";
import { thumbHeight, usePhone } from "../../utils/usePhone";
import type { ProjectUsage } from "../../engines/document/usage";
import { GRID_PRESETS, RULING_PRESETS } from "../../engines/patterns/patterns";
import { addVariantFromCurrent } from "../../persistence/projectStore";
import { SPACING_LABELS } from "../../presets/spacing/spacingPresets";
import { arrangementsOf, findPalette, resolveColors, WHITE_PAPER } from "../../presets/themes/palettes";
import { DEFAULT_ROLES, DESIGN_TYPE_PAIRINGS, FONT_CATALOG, FONT_CATEGORY_LABEL, ROLE_LABELS } from "../../presets/typography/typography";
import { DEFAULT_WORDING } from "../../presets/wording";
import { JCS_SNAPSHOT } from "../../design-library/library";
import { COMPOSITION_ANCHORS, type AlignX, type AlignY, type CompositionAnchor, type DecorationPlacementOverrides } from "../../types/composition";
import type { ElementPosition, SemanticTextKey, TextAnchor } from "../../types/layout";
import { defaultCorners, edgesFor, isObjectPlacement, normalizeDecoration, opacityCap, placementsFor, titlePositionsFor, type PieceReport } from "../../themes/decorationPlan";
import type { ProductProject } from "../../types/project";
import type { CornerSet, DecorativePlacement, DecorativeTheme, EdgeTreatment, FunctionalPatternKind, TitleAccentPosition } from "../../types/theme";
import type { ColorToken, ColorTokens, FontCategory, FontGroup, SpacingDensity, WordingKey } from "../../types/tokens";
import { AppliesTo, Check, Field, NumberField, Section, Segmented, Select, type EditorNav } from "./ui";
import { fontOptions } from "./PromptEditor";
import { resolveTypography } from "../../presets/typography/typography";
import { useEffect, useMemo, useState } from "react";
import { BACKGROUND_GROUPS, ELEMENT_GROUPS, defaultRoles, designValue, groupOf, type CatalogDesign, type CatalogGroup } from "../../design-library/catalog";
import { jcsPaletteId } from "../../design-library/palettes";
import { isSurfaceStyle, NO_LAYER, splitLayers } from "../../themes/layers";
import { DesignThumb } from "./DesignThumb";
import { PalettePicker } from "./PalettePicker";
import { useFontLoader } from "../../utils/useFontLoader";
import { layoutName } from "../../presets/plainNames";
import { TechnicalDetails, Visual } from "../help/visuals";

type Update = (fn: (p: ProductProject) => ProductProject) => void;
type PanelProps = { project: ProductProject; update: Update; usage: ProjectUsage; nav: EditorNav };

const SIDEBAR_HEADINGS: WordingKey[] = ["notes", "priorities", "topPriorities", "weeklyFocus", "toDo", "goals", "prayer", "prayerRequests", "gratitude", "scripture", "kingdomAssignments"];

export type LayoutPart = "layout" | "writing" | "add";
const PART_TITLE: Record<LayoutPart, string> = { layout: "Page options", writing: "Writing space", add: "Extra sections" };

/** Labels for the planner sections that can each carry their own page orientation. */
const SECTION_LABEL: Record<PlannerSection, string> = { monthly: "Monthly", weekly: "Weekly", daily: "Daily" };

/**
 * Page-level options, in the part of the editor they belong to:
 *   layout  — how the page is arranged (date position, schedule times, page numbers, footer)
 *   writing — the writing space inside each day (sections and lines per day)
 *   add     — extra content on the page (sidebar, daily sections)
 */
export function LayoutPanel({ project, update, usage, nav, part = "layout" }: PanelProps & { part?: LayoutPart }) {
  const o = project.layoutOptions;
  const set = (patch: Partial<ProductProject["layoutOptions"]>) => update((p) => ({ ...p, layoutOptions: { ...p.layoutOptions, ...patch } }));
  const is = { layout: part === "layout", writing: part === "writing", add: part === "add" };
  const any = is.layout
    ? usage.weeklyOrientation.supported || usage.datePlacement || (usage.scheduleTimes && !usage.dailySections) || usage.pageNumbers || usage.footer || usage.spreadBehavior.supported || usage.plannerSections.length > 0
    : is.writing
      ? usage.sectionsPerDay || usage.writingRows
      : usage.sidebar.supported || usage.weeklyNotes.supported || usage.weeklyPlanSections.supported || usage.dailySections;
  if (!any) return null;
  return (
    <Section title={PART_TITLE[part]} open={part !== "layout" || usage.weeklyOrientation.supported}>
      {is.layout && usage.layouts.filter(({ layout }) => layout.id === nav.currentLayoutId).map(({ layout, fit }) => (
        <p key={layout.id} className="hint">
          {layoutName(layout.id, layout.label)}: {fit.ok ? (fit.variantLabel === layout.label ? "fits this size" : `using the ${fit.variantLabel} version for this size`) : "not enough room at this size"}
        </p>
      ))}
      {is.layout && usage.weeklyOrientation.supported && <WeeklyOrientationControl project={project} usage={usage} value={o.weeklyOrientation} onChange={(weeklyOrientation) => set({ weeklyOrientation })} />}
      {is.layout && usage.datePlacement && <AppliesTo ids={usage.consumers.datePlacement} nav={nav} />}
      {is.layout && usage.datePlacement && (
        <Segmented
          label="Where dates sit in calendar boxes"
          value={o.datePlacement}
          options={[{ value: "top-left", label: "Top left" }, { value: "top-center", label: "Center" }, { value: "top-right", label: "Top right" }]}
          onChange={(datePlacement) => set({ datePlacement })}
        />
      )}
      {is.add && usage.sidebar.supported && !usage.monthlySidebar.supported && !usage.weeklySidebar.supported && (
        <>
          {usage.sidebar.available && <AppliesTo ids={usage.consumers.sidebar} nav={nav} />}
          <label className="check">
            <input type="checkbox" checked={o.showSidebar && usage.sidebar.available} disabled={!usage.sidebar.available} onChange={(e) => set({ showSidebar: e.target.checked })} />
            <span>Sidebar{!usage.sidebar.available ? " (not available at this size)" : ""}</span>
          </label>
          {!usage.sidebar.available && usage.sidebar.reason && (
            <>
              <p className="hint">There isn't room for a sidebar at this page size.</p>
              <TechnicalDetails label="Show details">{usage.sidebar.reason}</TechnicalDetails>
            </>
          )}
          {o.showSidebar && usage.sidebar.available && (
            <>
              <Select label="Sidebar heading" value={o.sidebarContent} options={SIDEBAR_HEADINGS.map((k) => ({ value: k, label: DEFAULT_WORDING[k] }))} onChange={(sidebarContent) => set({ sidebarContent })} />
              <NumberField label="Sidebar width" suffix="inches" step={0.05} min={0.5} value={o.sidebarWidthIn} onChange={(sidebarWidthIn) => set({ sidebarWidthIn })} />
            </>
          )}
        </>
      )}
      {is.add && (usage.monthlySidebar.supported || usage.weeklySidebar.supported) && (
        <>
          {usage.monthlySidebar.supported && (
            <SidebarToggle
              label="Monthly sidebar"
              checked={monthlySidebarOf(o) && usage.monthlySidebar.available}
              disabled={!usage.monthlySidebar.available}
              reason={usage.monthlySidebar.reason}
              appliesTo={usage.consumers.monthlySidebar}
              nav={nav}
              onChange={(monthlySidebar) => set({ monthlySidebar })}
            />
          )}
          {usage.weeklySidebar.supported && (
            <SidebarToggle
              label="Weekly sidebar"
              checked={weeklySidebarOf(o) && usage.weeklySidebar.available}
              disabled={!usage.weeklySidebar.available}
              reason={usage.weeklySidebar.reason}
              appliesTo={usage.consumers.weeklySidebar}
              nav={nav}
              onChange={(weeklySidebar) => set({ weeklySidebar })}
            />
          )}
          {(monthlySidebarOf(o) && usage.monthlySidebar.available || weeklySidebarOf(o) && usage.weeklySidebar.available) && (
            <>
              <Select label="Sidebar heading" value={o.sidebarContent} options={SIDEBAR_HEADINGS.map((k) => ({ value: k, label: DEFAULT_WORDING[k] }))} onChange={(sidebarContent) => set({ sidebarContent })} />
              {usage.monthlySidebar.supported && (
                <NumberField label="Sidebar width" suffix="inches" step={0.05} min={0.5} value={o.sidebarWidthIn} onChange={(sidebarWidthIn) => set({ sidebarWidthIn })} />
              )}
            </>
          )}
        </>
      )}
      {is.add && usage.weeklyNotes.supported && !weeklySidebarOf(o) && (
        <label className="check">
          <input type="checkbox" checked={weeklyNotesOf(o)} onChange={(e) => set({ weeklyNotes: e.target.checked })} />
          <span>Weekly notes slot <span className="hint">— the extra slot beside the days; off gives the days its space</span></span>
        </label>
      )}
      {is.add && usage.weeklyPlanSections.supported && (
        <>
          <label className="check">
            <input type="checkbox" checked={weeklyPlanNotesOf(o)} onChange={(e) => set({ weeklyPlanNotes: e.target.checked })} />
            <span>Weekly plan notes <span className="hint">— the notes foot under the week's days</span></span>
          </label>
          <label className="check">
            <input type="checkbox" checked={weeklyPlanPrioritiesOf(o)} onChange={(e) => set({ weeklyPlanPriorities: e.target.checked })} />
            <span>Weekly priorities <span className="hint">— the priorities checklist closing the week</span></span>
          </label>
        </>
      )}
      {is.writing && usage.sectionsPerDay && <AppliesTo ids={usage.consumers.sectionsPerDay} nav={nav} />}
      {is.writing && usage.sectionsPerDay && <NumberField label="Sections per day" step={1} min={1} max={6} value={o.sectionsPerDay} onChange={(v) => set({ sectionsPerDay: Math.max(1, Math.round(v)) })} />}
      {is.writing && usage.writingRows && <NumberField label="Writing lines per day" step={1} min={1} max={8} value={o.writingRowsPerDay} onChange={(v) => set({ writingRowsPerDay: Math.max(1, Math.round(v)) })} />}
      {is.add && usage.dailySections && <DailySectionsControl project={project} set={set} />}
      {is.layout && usage.scheduleTimes && !usage.dailySections && (
        <Segmented
          label="Schedule times"
          value={o.scheduleTimes ?? "printed"}
          options={[{ value: "printed", label: "Printed hours" }, { value: "blank", label: "Blank — write your own" }]}
          onChange={(scheduleTimes) => set({ scheduleTimes })}
        />
      )}
      {is.layout && usage.pageNumbers && <Check label="Page numbers" checked={o.showPageNumbers} onChange={(showPageNumbers) => set({ showPageNumbers })} />}
      {is.layout && usage.footer && <Check label="Footer with the product name" checked={o.showFooter} onChange={(showFooter) => set({ showFooter })} />}
      {is.layout && usage.spreadBehavior.supported && (
        <>
          <Segmented
            label="Facing pages"
            value={spreadModeOf(o)}
            options={[{ value: "preserve", label: "Preserve spreads" }, { value: "continuous", label: "Continuous pages" }]}
            onChange={(spreadMode) => set({ spreadMode })}
          />
          <p className="hint">
            {spreadModeOf(o) === "preserve"
              ? "A filler page keeps every two-page spread opening on a left-hand page."
              : "Pages flow with no filler pages; spreads may open on either side."}
          </p>
          {spreadModeOf(o) === "preserve" && (
            <Select
              label="Filler pages hold"
              value={fillerKindOf(o)}
              options={[{ value: "notes", label: "Notes" }, { value: "blank", label: "Blank" }]}
              onChange={(fillerKind) => set({ fillerKind })}
            />
          )}
        </>
      )}
      {is.layout && usage.monthlySidebar.supported && (
        <>
          <Segmented
            label="Monthly calendar"
            value={monthlyArrangementOf(o)}
            options={[
              { value: "classic", label: "Upright" },
              { value: "rotated", label: "Turned sideways" },
            ]}
            onChange={(monthlyArrangement) => set({ monthlyArrangement })}
          />
          <p className="hint">
            {monthlyArrangementOf(o) === "rotated"
              ? "Same page size — the whole month is turned a quarter turn on the page, so the reader turns the planner to read it and the day boxes are wide."
              : "The month reads upright, like every other page."}
          </p>
        </>
      )}
      {is.layout && usage.plannerSections.length > 0 && (
        <>
          <h4 className="subhead">Page orientation</h4>
          {/* A sideways month keeps the planner's page, so its orientation switch would do nothing. */}
          {usage.plannerSections.filter((section) => !(section === "monthly" && monthlyArrangementOf(o) === "rotated")).map((section) => {
            const current = o.plannerPageOrientation?.[section] ?? project.dimensions.orientation;
            return (
              <Segmented
                key={section}
                label={`${SECTION_LABEL[section]} pages`}
                value={current}
                options={[
                  { value: "portrait", label: "Portrait" },
                  { value: "landscape", label: "Landscape" },
                ]}
                onChange={(orientation) => {
                  const next = { ...o.plannerPageOrientation };
                  if (orientation === project.dimensions.orientation) delete next[section];
                  else next[section] = orientation as "portrait" | "landscape";
                  set({ plannerPageOrientation: next });
                }}
              />
            );
          })}
          <p className="hint">
            Changes the paper itself (a landscape page is a different page size). To keep the page and just turn the monthly calendar, choose “Turned sideways” above.
            {usage.mixedPageOrientation ? " This product mixes orientations: export each one separately under Print / Save PDF." : ""}
          </p>
        </>
      )}
    </Section>
  );
}

/**
 * One planner family's sidebar switch. Monthly and weekly sidebars are
 * independent: each planner type keeps its own toggle.
 */
function SidebarToggle({ label, checked, disabled, reason, appliesTo, nav, onChange }: {
  label: string;
  checked: boolean;
  disabled: boolean;
  reason?: string;
  appliesTo: string[];
  nav: EditorNav;
  onChange: (v: boolean) => void;
}) {
  return (
    <>
      {!disabled && <AppliesTo ids={appliesTo} nav={nav} />}
      <label className="check">
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span>{label}{disabled ? " (not available at this size)" : ""}</span>
      </label>
      {disabled && reason && (
        <>
          <p className="hint">There isn't room for a sidebar at this page size.</p>
          <TechnicalDetails label="Show details">{reason}</TechnicalDetails>
        </>
      )}
    </>
  );
}

/**
 * Classic Weekly: how the week's days are arranged across its two pages —
 * as columns (Vertical) or as rows (Horizontal). An arrangement that cannot
 * fit at this size is shown, disabled, with the reason.
 */
function WeeklyOrientationControl({ project, usage, value, onChange }: { project: ProductProject; usage: ProjectUsage; value: ProductProject["layoutOptions"]["weeklyOrientation"]; onChange: (v: "vertical" | "horizontal") => void }) {
  void value;
  const w = usage.weeklyOrientation;
  const current = w.current ?? "vertical";
  const phone = usePhone();
  const opts = [
    { v: "vertical" as const, label: "Vertical", hint: "Two pages · days side by side in columns", ok: w.vertical },
    { v: "horizontal" as const, label: "Horizontal", hint: "Two pages · days stacked in rows", ok: w.horizontal },
  ];
  // Each arrangement drawn by the real renderer: this product's first weekly spread, both pages.
  const previews = useMemo(() => {
    const out: Partial<Record<"vertical" | "horizontal", { doc: ResolvedDocument; index: number }>> = {};
    for (const o of opts) {
      if (!o.ok) continue;
      try {
        const doc = resolveDocument({ ...project, layoutOptions: { ...project.layoutOptions, weeklyOrientation: o.v } });
        const index = doc.recipe.pages.findIndex((p) => p.layoutId === "planner-weekly-spread" && p.spreadPart === 0);
        if (index >= 0) out[o.v] = { doc, index };
      } catch {
        /* no preview */
      }
    }
    return out;
  }, [project, w.vertical, w.horizontal]);
  return (
    <div className="field" data-testid="weekly-orientation">
      <span className="field-label">Classic Weekly: how the days are arranged</span>
      <div className="orientation-cards" role="group" aria-label="How the days are arranged">
        {opts.map((o) => (
          <button key={o.v} type="button" className="orientation-card" aria-pressed={current === o.v} disabled={!o.ok} onClick={() => onChange(o.v)}>
            <span className="orientation-card__thumb">
              {previews[o.v] && (
                <>
                  <PageThumb doc={previews[o.v]!.doc} index={previews[o.v]!.index} heightPx={thumbHeight(phone, 96, 150)} />
                  <PageThumb doc={previews[o.v]!.doc} index={previews[o.v]!.index + 1} heightPx={thumbHeight(phone, 96, 150)} />
                </>
              )}
            </span>
            <strong>{o.label}</strong>
            <span className="hint">{o.ok ? o.hint : "Doesn't fit this page size"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Daily sections: tick the sections a daily page carries and put them in order
 * (original brief: configurable daily sections from semantic wording). The
 * schedule's hours apply when it is chosen.
 */
function DailySectionsControl({ project, set }: { project: ProductProject; set: (patch: Partial<ProductProject["layoutOptions"]>) => void }) {
  const o = project.layoutOptions;
  const chosen = dailySectionsOf(o);
  const name = (k: DailySection) => project.wording[k] ?? DEFAULT_WORDING[k];
  const move = (k: DailySection, d: -1 | 1) => {
    const i = chosen.indexOf(k), j = i + d;
    if (j < 0 || j >= chosen.length) return;
    const next = [...chosen];
    [next[i], next[j]] = [next[j], next[i]];
    set({ dailySections: next });
  };
  return (
    <div className="field-group daily-sections">
      <div className="field-label">Daily page sections</div>
      <p className="hint">Tick the sections each daily page carries; arrows set their order. Rename any heading under Wording.</p>
      <ul className="daily-sections__list">
        {chosen.map((k, i) => (
          <li key={k} className="daily-sections__row">
            <label className="check">
              <input type="checkbox" checked onChange={() => set({ dailySections: chosen.filter((x) => x !== k) })} disabled={chosen.length === 1} />
              <span>{name(k)}</span>
            </label>
            <button type="button" className="btn btn--icon" aria-label={`Move ${name(k)} up`} disabled={i === 0} onClick={() => move(k, -1)}>↑</button>
            <button type="button" className="btn btn--icon" aria-label={`Move ${name(k)} down`} disabled={i === chosen.length - 1} onClick={() => move(k, 1)}>↓</button>
          </li>
        ))}
        {DAILY_SECTIONS.filter((k) => !chosen.includes(k)).map((k) => (
          <li key={k} className="daily-sections__row daily-sections__row--off">
            <label className="check">
              <input type="checkbox" checked={false} onChange={() => set({ dailySections: [...chosen, k] })} />
              <span>{name(k)}</span>
            </label>
          </li>
        ))}
      </ul>
      {chosen.includes("schedule") && (
        <Segmented
          label="Schedule times"
          value={o.scheduleTimes ?? "printed"}
          options={[{ value: "printed", label: "Printed hours" }, { value: "blank", label: "Blank — write your own" }]}
          onChange={(scheduleTimes) => set({ scheduleTimes })}
        />
      )}
      {chosen.includes("schedule") && o.scheduleTimes === "blank" && (
        <NumberField label="Schedule rows" step={1} min={1} max={24} value={o.hourEnd - o.hourStart + 1} onChange={(v) => set({ hourEnd: Math.min(23, o.hourStart + Math.max(1, Math.round(v)) - 1) })} />
      )}
      {chosen.includes("schedule") && o.scheduleTimes !== "blank" && (
        <div className="row">
          <NumberField label="First hour (0–23, e.g. 6 = 6 AM)" step={1} min={0} max={22} value={o.hourStart} onChange={(v) => set({ hourStart: Math.max(0, Math.min(Math.round(v), o.hourEnd)) })} />
          <NumberField label="Last hour (0–23, e.g. 21 = 9 PM)" step={1} min={1} max={23} value={o.hourEnd} onChange={(v) => set({ hourEnd: Math.min(23, Math.max(Math.round(v), o.hourStart)) })} />
        </div>
      )}
      {chosen.includes("schedule") && o.scheduleTimes !== "blank" && <Check label="Add half-hour rows" checked={o.halfHours} onChange={(halfHours) => set({ halfHours })} />}
    </div>
  );
}

const PATTERN_LABELS: Record<FunctionalPatternKind, string> = {
  ruled: "Lined",
  "margin-ruled": "Lined with a margin line",
  "dot-grid": "Dot grid",
  "graph-grid": "Graph paper (squares)",
  blank: "Blank",
  checklist: "Checklist",
  cornell: "Cornell",
  "split-column": "Split column",
};

/** The writing lines' color now: the product's own choice, else its palette's. */
const lineColor = (p: ProductProject) => {
  const c = p.colors.overrides.line ?? resolveColors(p.colors.paletteId, {}, p.colors).line;
  return /^#[0-9a-f]{6}$/i.test(c) ? c : "#999999";
};

export function PatternPanel({ project, update, usage, nav }: PanelProps) {
  const f = project.functionalPattern;
  const set = (patch: Partial<ProductProject["functionalPattern"]>) => update((p) => ({ ...p, functionalPattern: { ...p.functionalPattern, ...patch } }));
  if (!usage.patterns.length && !usage.lineStyle) return null;
  const kind = usage.patterns.includes(f.kind) ? f.kind : usage.patterns[0];
  const isRuled = kind === "ruled" || kind === "margin-ruled";
  const isGrid = kind === "dot-grid" || kind === "graph-grid";
  const drawsLines = isRuled || isGrid || !usage.patterns.length;
  return (
    <Section title={usage.patterns.length ? "Writing lines" : "Line style"}>
      {usage.patterns.length > 0 && <AppliesTo ids={usage.consumers.pattern} nav={nav} />}
      {usage.patterns.length ? (
        <Select label="Writing style" value={kind} options={usage.patterns.map((k) => ({ value: k, label: PATTERN_LABELS[k] }))} onChange={(k) => set({ kind: k })} />
      ) : (
        <p className="hint">This page uses fixed checklist rows, so only the line look can change.</p>
      )}
      {isRuled && (
        <>
          <Select label="Space between lines" value={f.rulingPreset} options={RULING_PRESETS.map((r) => ({ value: r.id, label: r.label }))} onChange={(rulingPreset) => set({ rulingPreset })} />
          <Visual kind="line-spacing" caption="Space between writing lines. Wide suits bigger handwriting; narrow fits more lines." />
          {f.rulingPreset === "custom" && <NumberField label="Space between lines" suffix="inches" step={0.01} min={0.15} value={f.customLineSpacingIn} onChange={(customLineSpacingIn) => set({ customLineSpacingIn })} />}
        </>
      )}
      {isGrid && (
        <>
          <Select label="Grid size" value={f.gridPreset} options={GRID_PRESETS.map((g) => ({ value: g.id, label: g.label }))} onChange={(gridPreset) => set({ gridPreset })} />
          {f.gridPreset === "custom" && <NumberField label="Space between dots / grid lines" suffix="inches" step={0.01} min={0.05} value={f.customPitchIn} onChange={(customPitchIn) => set({ customPitchIn })} />}
        </>
      )}
      {kind === "dot-grid" && <NumberField label="Dot size" suffix="points" step={0.1} min={0.2} value={f.dotSizePt} onChange={(dotSizePt) => set({ dotSizePt })} />}
      {kind === "graph-grid" && <NumberField label="Darker line every … squares (0 = none)" step={1} min={0} value={f.majorEvery} onChange={(v) => set({ majorEvery: Math.max(0, Math.round(v)) })} />}
      {kind === "margin-ruled" && <NumberField label="Margin line distance from the binding side" suffix="inches" step={0.05} value={f.marginLineIn} onChange={(marginLineIn) => set({ marginLineIn })} />}
      {drawsLines && (
        <div className="row">
          <label className="field" style={{ flex: "0 0 auto" }}>
            <span className="field-label">Line color</span>
            <input type="color" aria-label="Writing line color" value={lineColor(project)} onChange={(e) => update((p) => ({ ...p, colors: { ...p.colors, overrides: { ...p.colors.overrides, line: e.target.value } } }))} />
          </label>
          {project.colors.overrides.line && (
            <button type="button" className="btn btn--ghost" onClick={() => update((p) => { const { line: _l, ...rest } = p.colors.overrides; void _l; return { ...p, colors: { ...p.colors, overrides: rest } }; })}>
              Use the palette's line color
            </button>
          )}
        </div>
      )}
      {drawsLines && usage.lineStyle && (
        <div className="row">
          {kind !== "dot-grid" && <NumberField label="Line thickness" suffix="points" step={0.1} min={0.1} value={f.lineWeightPt} onChange={(lineWeightPt) => set({ lineWeightPt })} />}
          <NumberField label="Line strength (0.05 faint – 1 full)" step={0.05} min={0.05} max={1} value={f.opacity} onChange={(opacity) => set({ opacity: Math.min(1, Math.max(0.05, opacity)) })} />
        </div>
      )}
    </Section>
  );
}

export function SpacingPanel({ project, update }: PanelProps) {
  return (
    <Section title="Spacing">
      <Segmented
        label="Overall spacing"
        value={project.spacing.density}
        options={(Object.keys(SPACING_LABELS) as SpacingDensity[]).map((d) => ({ value: d, label: d[0].toUpperCase() + d.slice(1) }))}
        onChange={(density) => update((p) => ({ ...p, spacing: { ...p.spacing, density } }))}
      />
      <p className="hint">{SPACING_LABELS[project.spacing.density]}</p>
    </Section>
  );
}

const GROUP_LABEL: Record<FontGroup, string> = { cover: "Cover font", headings: "Heading font", subheadings: "Label font", body: "Body font", accent: "Accent font" };

export function TypographyPanel({ project, update, usage }: PanelProps) {
  const fonts = project.typography.fonts;
  const categories = Object.keys(FONT_CATEGORY_LABEL) as FontCategory[];
  const groups = (Object.keys(GROUP_LABEL) as FontGroup[]).filter((g) => usage.fontGroups.includes(g));
  return (
    <Section title="Typography">
      <TypePairings fonts={fonts} onPick={(f) => update((p) => ({ ...p, typography: { ...p.typography, fonts: { ...p.typography.fonts, ...f } } }))} />
      <div className="field-label">Or choose each font</div>
      {groups.map((g) => (
        <Field key={g} label={GROUP_LABEL[g]}>
          <select value={fonts[g]} style={{ fontFamily: `'${fonts[g]}'` }} onChange={(e) => update((p) => ({ ...p, typography: { ...p.typography, fonts: { ...p.typography.fonts, [g]: e.target.value } } }))}>
            {categories.map((c) => (
              <optgroup key={c} label={FONT_CATEGORY_LABEL[c]}>
                {FONT_CATALOG.filter((f) => f.category === c).map((f) => (
                  <option key={f.family} value={f.family}>{f.family}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
      ))}
      <div className="field-label">Text sizes (points)</div>
      <div className="row">
        {usage.textRoles.map((r) => (
          <NumberField
            key={r}
            label={ROLE_LABELS[r]}
            step={0.5}
            min={6}
            value={project.typography.roleOverrides[r]?.sizePt ?? DEFAULT_ROLES[r].sizePt}
            onChange={(sizePt) => update((p) => ({ ...p, typography: { ...p.typography, roleOverrides: { ...p.typography.roleOverrides, [r]: { ...p.typography.roleOverrides[r], sizePt } } } }))}
          />
        ))}
      </div>
      <p className="hint">If text no longer fits, Page check tells you — text is never made smaller without telling you.</p>
    </Section>
  );
}

/** Font pairings shown as what they look like: a title in the heading font over a line of body text. */
function TypePairings({ fonts, onPick }: { fonts: ProductProject["typography"]["fonts"]; onPick: (f: Partial<ProductProject["typography"]["fonts"]>) => void }) {
  useFontLoader(fonts, [...new Set(DESIGN_TYPE_PAIRINGS.flatMap((t) => Object.values(t.fonts)))]);
  const current = DESIGN_TYPE_PAIRINGS.find((t) => Object.entries(t.fonts).every(([g, f]) => fonts[g as FontGroup] === f))?.id;
  return (
    <div className="type-grid" role="group" aria-label="Font pairing">
      {DESIGN_TYPE_PAIRINGS.map((t) => (
        <button key={t.id} type="button" className="type-card" data-pairing={t.id} aria-pressed={t.id === current} aria-label={t.label} onClick={() => onPick(t.fonts)}>
          <span className="type-card__title" style={{ fontFamily: `'${t.fonts.cover ?? t.fonts.headings}', serif` }}>Plan</span>
          <span className="type-card__heading" style={{ fontFamily: `'${t.fonts.headings}', serif` }}>This Week</span>
          <span className="type-card__body" style={{ fontFamily: `'${t.fonts.body ?? fonts.body}', sans-serif` }}>Write what God is saying today.</span>
          <span className="type-card__name">{t.short ?? t.label}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Colors and decoration are the variant-overridable "look". While a variant is
 * active, edits go to that variant; otherwise to the base design.
 */
type LookPatch = { colors?: Partial<ProductProject["colors"]["overrides"]>; decorativeTheme?: Partial<ProductProject["decorativeTheme"]>; backgroundTheme?: Partial<ProductProject["decorativeTheme"]> };
function setLook(update: Update, patch: LookPatch) {
  update((p) => {
    if (p.activeVariantId) {
      return {
        ...p,
        variants: p.variants.map((v) =>
          v.id !== p.activeVariantId
            ? v
            : {
                ...v,
                overrides: {
                  ...v.overrides,
                  colors: patch.colors ? { ...v.overrides.colors, ...patch.colors } : v.overrides.colors,
                  decorativeTheme: patch.decorativeTheme ? { ...v.overrides.decorativeTheme, ...patch.decorativeTheme } : v.overrides.decorativeTheme,
                  backgroundTheme: patch.backgroundTheme ? { ...v.overrides.backgroundTheme, ...patch.backgroundTheme } : v.overrides.backgroundTheme,
                },
              },
        ),
      };
    }
    return {
      ...p,
      colors: patch.colors ? { ...p.colors, overrides: { ...p.colors.overrides, ...patch.colors } } : p.colors,
      decorativeTheme: patch.decorativeTheme ? { ...p.decorativeTheme, ...patch.decorativeTheme } : p.decorativeTheme,
      backgroundTheme: patch.backgroundTheme ? { ...(p.backgroundTheme ?? NO_LAYER), ...patch.backgroundTheme } : p.backgroundTheme,
    };
  });
}

const TOKEN_LABEL: Record<ColorToken, string> = {
  primary: "Headings",
  secondary: "Secondary color",
  accent: "Accent",
  background: "Paper",
  text: "Text",
  mutedText: "Soft text",
  line: "Writing lines",
  border: "Divider lines & boxes",
  decorativeAccent: "Decoration accent (veins, gold)",
  decorBase: "Decoration main color",
  decorHighlight: "Decoration highlights",
  lineArt: "Line art",
  goldInk: "Step-number gold (tuned for print)",
  patternGround: "Stripe background",
  patternInk: "Stripes",
};
const HEX = /^#[0-9a-f]{6}$/i;

export function ColorPanel({ project, update, usage }: PanelProps) {
  const palette = findPalette(project.colors.paletteId);
  const view = applyVariant(project);
  const effective = resolveColors(project.colors.paletteId, view.colors.overrides, project.colors);
  const active = project.variants.find((v) => v.id === project.activeVariantId);
  const editable = usage.colorTokens.filter((t) => HEX.test(effective[t] ?? ""));
  const paper = project.colors.paper ?? "palette";
  const count = arrangementsOf(palette.colors, paper === "white" ? WHITE_PAPER : palette.colors.background).length;
  const at = Math.abs(project.colors.arrangement ?? 0) % count;
  const nextArrangement = () => update((p) => ({ ...p, colors: { ...p.colors, overrides: {}, arrangement: ((p.colors.arrangement ?? 0) + 1) % count || undefined } }));
  return (
    <Section title="Colors" open>
      <PalettePicker
        value={project.colors.paletteId}
        onPick={(paletteId) =>
          paletteId === project.colors.paletteId
            ? nextArrangement()
            : update((p) => ({ ...p, colors: { paletteId, overrides: {}, ...(p.colors.paper === "white" ? { paper: "white" as const } : {}) } }))
        }
      />
      {count > 1 && (
        <div className="color-arrangement" data-testid="color-arrangement">
          <p className="hint">
            Color arrangement {at + 1} of {count}: tap the chosen palette again (or the button) to swap which color is used for titles, lines and accents. Only this palette's colors are used.
          </p>
          <button type="button" className="btn" onClick={nextArrangement}>Try another arrangement</button>
        </div>
      )}
      <Segmented<"palette" | "white">
        label="Paper"
        value={paper}
        options={[{ value: "palette", label: "Palette's paper color" }, { value: "white", label: "White" }]}
        onChange={(v) => update((p) => ({ ...p, colors: { ...p.colors, paper: v === "white" ? "white" : undefined, arrangement: undefined } }))}
      />
      {palette.note && <p className="hint">{palette.brandPalette ? "" : "⚠ "}{palette.note}</p>}
      {active && <p className="hint">Editing the colors of the design option “{active.name}”.</p>}
      {editable.length > 0 && <div className="field-label">Fine-tune each color</div>}
      <div className="row">
        {editable.map((t) => (
          <label key={t} className="field" style={{ flex: "0 0 auto" }}>
            <span>{TOKEN_LABEL[t]}</span>
            <input type="color" value={effective[t]} onChange={(e) => setLook(update, { colors: { [t]: e.target.value } })} />
          </label>
        ))}
      </div>
      {usage.colorTokens.includes("line") && (
        <NumberField label="Writing-line strength" step={0.05} min={0.05} max={1} value={effective.lineOpacity} onChange={(lineOpacity) => setLook(update, { colors: { lineOpacity } })} />
      )}
      {!active && Object.keys(project.colors.overrides).length > 0 && (
        <button className="btn" onClick={() => update((p) => ({ ...p, colors: { ...p.colors, overrides: {} } }))}>Reset to palette</button>
      )}
    </Section>
  );
}

export function WordingPanel({ project, update, usage }: PanelProps) {
  if (!usage.wordingKeys.length) return null;
  return (
    <Section title="Titles & labels">
      <p className="hint">Renaming a label here changes it on every page that uses it.</p>
      {usage.wordingKeys.map((k) => (
        <Field key={k} label={DEFAULT_WORDING[k] || k}>
          <input type="text" value={project.wording[k] ?? DEFAULT_WORDING[k]} onChange={(e) => update((p) => ({ ...p, wording: { ...p.wording, [k]: e.target.value } }))} />
        </Field>
      ))}
    </Section>
  );
}

const PLACEMENT_LABEL: Record<DecorativePlacement, string> = {
  "full-page": "Whole page (soft, behind the writing)",
  "header-band": "Band across the top",
  "footer-band": "Band across the bottom",
  "edge-strip": "Strip along the outer edge",
  "border-frame": "Frame around the page",
  corners: "In the corners",
  "table-corner": "On the corner of a table (needs space around it)",
  "title-accent": "Beside the title",
  "top-bottom": "Top and bottom edges",
  "behind-title": "Behind the title (subtle)",
  "edge-accent": "Coming in from the side edge",
  "header-flourish": "On the line under the title",
  "footer-flourish": "At the bottom of the page",
};
const CORNER_LABEL: Record<CornerSet, string> = {
  "opposite-tl-br": "Upper-left + lower-right",
  "opposite-tr-bl": "Upper-right + lower-left",
  all: "All four corners",
  top: "Upper corners",
  bottom: "Lower corners",
  tl: "Upper-left only",
  tr: "Upper-right only",
  bl: "Lower-left only",
  br: "Lower-right only",
};
const EDGE_LABEL: Record<EdgeTreatment, string> = {
  contained: "Keep the whole artwork on the page (default)",
  bleed: "Let it run off the edge (trimmed on purpose)",
};
const TITLE_POSITION_LABEL: Record<TitleAccentPosition, string> = {
  "title-left": "Left of title",
  "title-right": "Right of title",
  "title-above": "Above title",
  "title-above-center": "Centered above title",
  "title-below": "Below title",
  "title-below-center": "Centered below title",
  "rule-left": "Left end of title rule",
  "rule-center": "Center of title rule",
  "rule-right": "Right end of title rule",
  "rule-both": "Both ends of title rule",
};
const ROLE_NAMES: Record<string, [string, string, string]> = {
  solid: ["Fill", "", ""],
  marble: ["Stone", "Veins", "Highlights"],
  pattern: ["Ground", "Stripes", ""],
  watercolor: ["Deep shapes", "Gold lines + splatter", "Pink washes"],
  floral: ["Leaves", "Gold", "Soft flowers"],
  accent: ["", "Line color", ""],
};
const DECOR_TOKENS: ColorToken[] = ["decorBase", "decorativeAccent", "decorHighlight", "lineArt", "patternGround", "patternInk", "primary", "accent", "border", "background", "text"];
const ALIGN_X_LABEL = { start: "Left", center: "Center", end: "Right" } as const;
const ALIGN_Y_LABEL = { start: "Top", center: "Middle", end: "Bottom" } as const;
/** Behind-content backgrounds above this strength compete with writing (JCS soft interiors use 0.16). */
const BEHIND_CONTENT_HINT = 0.3;

/** What the Size control scales, per design (null = the design has no size). */
function sizeControl(d: DecorativeTheme): { label: string; min: number; max: number } | null {
  if (d.style === "marble") return { label: "Zoom", min: 1, max: 3 };
  if (d.style === "pattern") return { label: "Stripe size", min: 1, max: 3 };
  if (d.style === "floral") return { label: "Size", min: 0.3, max: 2 };
  if (d.style === "accent" && d.placement !== "behind-title") return { label: d.placement === "header-band" || d.placement === "border-frame" ? "Pattern size" : "Size", min: 0.3, max: 3 };
  return null;
}

/** Human names for plan pieces. */
function pieceName(r: PieceReport): string {
  const corner: Record<string, string> = { topLeftAccent: "Top-left corner", topRightAccent: "Top-right corner", bottomLeftAccent: "Bottom-left corner", bottomRightAccent: "Bottom-right corner" };
  if (r.id.startsWith("corner")) return corner[r.anchor] ?? "Corner";
  const title: Record<string, string> = { "title-left": "Left of the title", "title-right": "Right of the title", "title-above": "Above the title", "title-below": "Below the title", "rule-left": "Left end of the title rule", "rule-center": "Center of the title rule", "rule-right": "Right end of the title rule" };
  return (
    title[r.id] ??
    ({ top: "Top edge", bottom: "Bottom edge", behind: "Behind the title", field: "Background", band: "Band", "header-flourish": "Header flourish", "footer-flourish": "Footer flourish", "edge-accent": "Edge accent" } as Record<string, string>)[r.id] ??
    r.id
  );
}

type DecorStatus = { reports: PieceReport[]; colors: ColorTokens; pageNumber: number } | null;

/**
 * Curated design picker: the library's groups as tabs, each design a
 * thumbnail in the current palette. Picking never exposes raw source files.
 */
function DesignPicker({ label, groups, value, colors, roles, original, onPick }: { label: string; groups: CatalogGroup[]; value: string; colors?: ColorTokens; roles?: Pick<DecorativeTheme, "colorA" | "colorB" | "colorC">; original?: boolean; onPick: (d: CatalogDesign) => void }) {
  const [tab, setTab] = useState(() => groupOf(groups, value).id);
  useEffect(() => setTab(groupOf(groups, value).id), [groups, value]);
  const group = groups.find((g) => g.id === tab) ?? groups[0];
  return (
    <div className="design-picker" role="group" aria-label={label}>
      <div className="design-tabs" role="tablist" aria-label={`${label} groups`}>
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={g.id === group.id}
            className={`design-tab${g.id === group.id ? " design-tab--on" : ""}`}
            // A group with one design (None, Watercolor, Solid) applies it; a larger group opens for browsing.
            onClick={() => (g.designs.length === 1 && g.designs[0].value !== value ? onPick(g.designs[0]) : setTab(g.id))}
          >
            {g.label}
          </button>
        ))}
      </div>
      {group.id !== "none" && !group.designs.some((d) => d.value === value) && <p className="hint design-pick-hint">Tap a design to use it on your pages.</p>}
      {group.id !== "none" && (
        <div className="design-grid">
          {group.designs.map((d) => (
            <button key={d.value} type="button" className="design-card" aria-pressed={d.value === value} title={d.hint} onClick={() => onPick(d)}>
              {colors && <DesignThumb design={d} colors={colors} roles={d.value === value ? roles : undefined} original={d.value === value && original} />}
              <span className="design-card-label">{d.label}</span>
              <span className="design-card-hint">{d.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Start a design from its strongest composition (first role-appropriate placement) and its own color roles. */
function pickDesign(d: DecorativeTheme, c: CatalogDesign): DecorativeTheme {
  const placement = placementsFor({ style: c.style, assetId: c.assetId })[0] ?? d.placement;
  const roles = c.style === d.style ? {} : defaultRoles(c.style);
  return normalizeDecoration({ ...d, ...roles, style: c.style, assetId: c.assetId, placement, corners: undefined, edge: undefined, titlePosition: undefined, layout: undefined, artColors: undefined, scale: c.style === d.style ? d.scale : 1 });
}

/**
 * BACKGROUND / SURFACE — marble, watercolor, stripes, solid. A surface covers
 * the page or one of its structural areas (header, footer, outer edge, margins).
 */
export function BackgroundPanel({ project, update, colors }: PanelProps & { colors?: ColorTokens }) {
  const view = applyVariant(project);
  const d = normalizeDecoration(splitLayers(view.backgroundTheme, { ...NO_LAYER, ...view.decorativeTheme }).background);
  // Always write the whole effective background, and clear a surface still held by the old combined slot,
  // so an edit can never fall back to (or be hidden by) the legacy value.
  const legacySurface = isSurfaceStyle(view.decorativeTheme.style);
  const set = (patch: Partial<DecorativeTheme>) => setLook(update, { backgroundTheme: { ...d, ...patch }, ...(legacySurface ? { decorativeTheme: { style: "none" } } : {}) });
  const a = findAsset(d.assetId);
  const marble = d.style === "marble" && a?.type === "marble" ? a : null;
  const placements = placementsFor(d);
  const size = sizeControl(d);
  const painting = d.style === "watercolor" && a?.type === "watercolor" ? a : null;
  const names: [string, string, string] = marble?.layers
    ? [marble.layers.stone[0], marble.layers.vein[0], marble.layers.highlight[0]]
    : painting
      ? [painting.layerNames.stone, painting.layerNames.vein, painting.layerNames.highlight]
      : ROLE_NAMES[d.style] ?? ["", "", ""];
  const tokenOptions = DECOR_TOKENS.map((c) => ({ value: c, label: colors?.[c] ? `${TOKEN_LABEL[c]} · ${colors[c]}` : TOKEN_LABEL[c] }));
  const asDesigned = marble?.asDesigned ?? painting?.asDesigned;
  const ownPalette = asDesigned ? jcsPaletteId(asDesigned) : null;
  const usingOwn = ownPalette === project.colors.paletteId && !Object.keys(project.colors.overrides).length && d.colorA === "decorBase" && d.colorB === "decorativeAccent" && d.colorC === "decorHighlight";
  return (
    <Section title="Background">
      <p className="hint">A background covers an area of the page — the whole page, a band across the top or bottom, a strip along the edge, or a frame. Your writing stays on clean paper unless you choose the whole page.</p>
      <Visual kind="background-vs-element" caption="Background (left) covers an area. A decorative element (right, next section) is one piece of art placed on the page." />
      <DesignPicker label="Background" groups={BACKGROUND_GROUPS} value={designValue(d)} colors={colors} roles={d} onPick={(c) => set(pickDesign(d, c))} />
      {d.style !== "none" && (
        <>
          {placements.length > 1 && <Select label="Where it goes" value={d.placement} options={placements.map((p) => ({ value: p, label: PLACEMENT_LABEL[p] }))} onChange={(placement) => set(normalizeDecoration({ ...d, placement }))} />}
          <Visual kind={`placement:${d.placement}`} caption={PLACEMENT_LABEL[d.placement]} />
          {ownPalette && (
            <div className="as-designed">
              {usingOwn ? (
                <p className="hint">Showing this {painting ? "watercolor" : "marble"} in its own colors (palette “{asDesigned}”).</p>
              ) : (
                <button type="button" className="btn" onClick={() => update((p) => ({ ...p, colors: { paletteId: ownPalette, overrides: {} } }))}>
                  Use its own colors — palette “{asDesigned}”
                </button>
              )}
            </div>
          )}
          <div className="row">
            {size && <NumberField label={size.label} step={0.1} min={size.min} max={size.max} value={d.scale} onChange={(scale) => set({ scale })} />}
            <NumberField label="Strength (0.05 faint – 1 full)" step={0.05} min={0.05} max={1} value={d.opacity} onChange={(opacity) => set({ opacity })} />
          </div>
          {d.placement === "full-page" && d.opacity > BEHIND_CONTENT_HINT && <p className="hint">Behind writing, keep the strength at {BEHIND_CONTENT_HINT} or lower so writing stays easy to read (Journal Color Studio pages use 0.16).</p>}
          <div className="row">
            {names[0] && <Select label={names[0]} value={d.colorA} options={tokenOptions} onChange={(colorA) => set({ colorA })} />}
            {names[1] && <Select label={names[1]} value={d.colorB} options={tokenOptions} onChange={(colorB) => set({ colorB })} />}
            {names[2] && <Select label={names[2]} value={d.colorC} options={tokenOptions} onChange={(colorC) => set({ colorC })} />}
          </div>
          {painting && <p className="hint">{painting.layerNames.accent} follow the palette's line-art color; the paper texture follows the page background.</p>}
        </>
      )}
    </Section>
  );
}

/**
 * DECORATIVE ELEMENTS — florals and line art, each placed against the page's
 * structure in one of the roles it was designed for.
 */
export function DecorationPanel({ project, update, usage, decor }: PanelProps & { decor?: DecorStatus }) {
  const view = applyVariant(project);
  const layers = splitLayers(view.backgroundTheme, { ...NO_LAYER, ...view.decorativeTheme });
  const d = normalizeDecoration(layers.elements);
  // A surface still held by the old combined slot moves to the background slot before the element slot is written.
  const legacySurface = isSurfaceStyle(view.decorativeTheme.style);
  const set = (patch: Partial<DecorativeTheme>) => setLook(update, { decorativeTheme: legacySurface ? { ...d, ...patch } : patch, ...(legacySurface ? { backgroundTheme: layers.background } : {}) });
  const setLayout = (patch: Partial<DecorationPlacementOverrides>) => set({ layout: { ...(d.layout ?? {}), ...patch } });
  const placements = placementsFor(d);
  const designRoles = d.style === "none" ? [] : rolesFor(findAsset(d.assetId)?.capabilities ?? []);
  const roles = ROLE_NAMES[d.style] ?? ["", "", ""];
  const size = sizeControl(d);
  const cap = opacityCap(d);
  const object = isObjectPlacement(d);
  const o = d.layout ?? {};
  const edges = edgesFor(d.assetId);
  const titlePositions = titlePositionsFor(d.assetId);
  const original = d.style === "floral" && d.artColors === "original";
  // Show each token's actual colour: tokens that share a colour in this palette look identical on the page.
  const tokenOptions = DECOR_TOKENS.map((c) => ({ value: c, label: decor?.colors[c] ? `${TOKEN_LABEL[c]} · ${decor.colors[c]}` : TOKEN_LABEL[c] }));
  return (
    <Section title="Decorations">
      <p className="hint">One piece of artwork placed on a part of the page — beside the title, in the corners, along an edge, or at the top or bottom. It never moves your writing lines or calendars, and keeps a little space from them.</p>
      <TechnicalDetails>Artwork snapshot from Journal Color Studio, commit {JCS_SNAPSHOT.commit}.</TechnicalDetails>
      <DesignPicker label="Decorative element" groups={ELEMENT_GROUPS} value={designValue(d)} colors={decor?.colors} roles={d} original={original} onPick={(c) => set(pickDesign(d, c))} />
      {designRoles.length > 0 && <p className="hint decor-roles">Designed for: {designRoles.map((r) => ROLE_LABEL[r]).join(" · ")}</p>}
      {d.style !== "none" && (
        <>
          {placements.length > 1 && <Select label="Where it goes" value={d.placement} options={placements.map((p) => ({ value: p, label: PLACEMENT_LABEL[p] }))} onChange={(placement) => set(normalizeDecoration({ ...d, placement, layout: undefined }))} />}
          <Visual kind={`placement:${d.placement}`} caption={PLACEMENT_LABEL[d.placement]} />
          {(d.placement === "corners" || d.placement === "table-corner") && (
            <Select
              label="Corners"
              value={d.corners ?? "__auto"}
              options={[
                ...(d.style === "floral" ? [{ value: "__auto", label: "Automatic — the pair with the most room" }] : [{ value: "__auto", label: `Default — ${CORNER_LABEL[defaultCorners(d.assetId)]}` }]),
                ...(Object.keys(CORNER_LABEL) as CornerSet[]).map((c) => ({ value: c, label: CORNER_LABEL[c] })),
              ]}
              onChange={(v) => set({ corners: v === "__auto" ? undefined : (v as CornerSet) })}
            />
          )}
          {d.placement === "corners" && edges.length > 1 && (
            <>
              <Select label="At the page edge" value={d.edge ?? "contained"} options={edges.map((e) => ({ value: e, label: EDGE_LABEL[e] }))} onChange={(v) => set({ edge: v === "contained" ? undefined : (v as EdgeTreatment), layout: undefined })} />
              <Visual kind="contained-vs-bleed" />
            </>
          )}
          {d.placement === "title-accent" && (
            <Select
              label="Position"
              value={d.titlePosition ?? "__auto"}
              options={[{ value: "__auto", label: "Automatic — balances the title" }, ...titlePositions.map((t) => ({ value: t, label: TITLE_POSITION_LABEL[t] }))]}
              onChange={(v) => set({ titlePosition: v === "__auto" ? undefined : (v as TitleAccentPosition), layout: undefined })}
            />
          )}
          {decor && decor.reports.some((r) => r.anchor !== "field") && (
            <ul className="decor-status" aria-label="Placement on this page">
              {decor.reports.map((r) => (
                <li key={r.id} className={r.rect ? "" : "decor-status--off"}>
                  <strong>{pieceName(r)}</strong> (page {decor.pageNumber}):{" "}
                  {r.rect ? `${r.scale < 0.999 ? `placed at ${Math.round(r.scale * 100)}% of its size to stay ${r.mode === "contained" ? "fully visible and " : ""}clear of your writing` : "placed at full size"}${r.mode === "bleed" && r.intentionalClip && r.clippedShare > 0 ? " — runs off the edge on purpose" : ""}` : "not placed — there isn't room here without covering your writing. Try other corners, a smaller size or another position."}
                  {!r.rect && r.reason && <TechnicalDetails label="Show details">{r.reason}</TechnicalDetails>}
                </li>
              ))}
            </ul>
          )}
          <div className="row">
            {size && <NumberField label={size.label} step={0.1} min={size.min} max={size.max} value={d.scale} onChange={(scale) => set({ scale })} />}
            <NumberField label={cap < 1 ? `Strength (up to ${cap})` : "Strength (0.05 faint – 1 full)"} step={0.05} min={0.05} max={cap} value={d.opacity} onChange={(opacity) => set({ opacity })} />
          </div>
          {object && <Visual kind="move" caption="Nudge the artwork from its automatic spot." />}
          {object && (
            <div className="row">
              <NumberField label="Move left / right" suffix="inches" step={0.05} min={-3} max={3} value={o.offsetXIn ?? 0} onChange={(offsetXIn) => setLayout({ offsetXIn })} />
              <NumberField label="Move up / down" suffix="inches" step={0.05} min={-3} max={3} value={o.offsetYIn ?? 0} onChange={(offsetYIn) => setLayout({ offsetYIn })} />
            </div>
          )}
          {d.placement === "full-page" && d.opacity > BEHIND_CONTENT_HINT && <p className="hint">Behind writing, keep the strength at {BEHIND_CONTENT_HINT} or lower so writing stays easy to read (Journal Color Studio pages use 0.16).</p>}
          {d.style === "floral" && (
            <Segmented
              label="Artwork colors"
              value={original ? "original" : "palette"}
              options={[{ value: "palette", label: "Palette" }, { value: "original", label: "As designed" }]}
              onChange={(v) => set({ artColors: v === "original" ? "original" : undefined })}
            />
          )}
          {original && <p className="hint">The artwork keeps its own painted colors; the palette does not recolor it.</p>}
          <div className="row">
            {!original && roles[0] && <Select label={roles[0]} value={d.colorA} options={tokenOptions} onChange={(colorA) => set({ colorA })} />}
            {!original && roles[1] && <Select label={roles[1]} value={d.colorB} options={tokenOptions} onChange={(colorB) => set({ colorB })} />}
            {!original && roles[2] && <Select label={roles[2]} value={d.colorC} options={tokenOptions} onChange={(colorC) => set({ colorC })} />}
          </div>
          {object && (
            <details className="subsection">
              <summary>Advanced placement</summary>
              <p className="hint">
                Product Studio places the artwork automatically and shrinks it (never crops it) to keep it clear of your writing. Use these only for fine adjustments.
              </p>
              <Select
                label="What this is attached to"
                value={o.anchor ?? "__default"}
                options={[{ value: "__default", label: "Automatic (best for this position)" }, ...COMPOSITION_ANCHORS.filter((a) => usage.compositionAnchors.includes(a.value))]}
                onChange={(v) => setLayout({ anchor: v === "__default" ? undefined : (v as CompositionAnchor) })}
              />
              <div className="row">
                <Select label="Left / right position" value={o.alignX ?? "__default"} options={[{ value: "__default", label: "Automatic" }, ...(["start", "center", "end"] as const).map((v) => ({ value: v, label: ALIGN_X_LABEL[v] }))]} onChange={(v) => setLayout({ alignX: v === "__default" ? undefined : (v as AlignX) })} />
                <Select label="Up / down position" value={o.alignY ?? "__default"} options={[{ value: "__default", label: "Automatic" }, ...(["start", "center", "end"] as const).map((v) => ({ value: v, label: ALIGN_Y_LABEL[v] }))]} onChange={(v) => setLayout({ alignY: v === "__default" ? undefined : (v as AlignY) })} />
              </div>
              <div className="row">
                <NumberField label="Largest width" suffix="inches" step={0.1} min={0} max={20} value={o.maxWidthIn ?? 0} onChange={(v) => setLayout({ maxWidthIn: v > 0 ? v : undefined })} />
                <NumberField label="Largest height" suffix="inches" step={0.1} min={0} max={20} value={o.maxHeightIn ?? 0} onChange={(v) => setLayout({ maxHeightIn: v > 0 ? v : undefined })} />
              </div>
              <p className="hint">0 = no limit.</p>
              <Check label="Allow it to overlap writing and text" checked={o.allowContentOverlap ?? d.placement === "behind-title"} onChange={(allowContentOverlap) => setLayout({ allowContentOverlap })} />
              {d.placement !== "corners" && (
                <>
                  <Check label="Allow it to extend past the cut edge" checked={o.allowBleed ?? (d.placement === "top-bottom" || d.placement === "edge-accent")} onChange={(allowBleed) => setLayout({ allowBleed })} />
                  <Check label="Allow it to be cut off at the page edge" checked={o.allowClipping ?? false} onChange={(allowClipping) => setLayout({ allowClipping })} />
                </>
              )}
              <button type="button" className="btn" onClick={() => set({ layout: undefined })}>
                Reset placement
              </button>
            </details>
          )}
        </>
      )}
    </Section>
  );
}

const TEXT_LABEL: Record<SemanticTextKey, string> = {
  pageTitle: "Page title",
  monthYear: "Month / year title",
  weekOf: "Week of",
  productTitle: "Product title",
  dateLabel: "Date label",
  footer: "Footer",
  sectionHeading: "Section headings (Notes, Priorities…)",
};
const ANCHOR_LABEL: Record<TextAnchor, string> = {
  "header-left": "Header — left",
  "header-center": "Header — center",
  "header-right": "Header — right",
  "above-content-left": "Above content — left",
  "above-content-center": "Above content — center",
  "above-content-right": "Above content — right",
  "footer-left": "Footer — left",
  "footer-center": "Footer — center",
  "footer-right": "Footer — right",
};
const SECTION_ANCHOR_LABEL: Partial<Record<TextAnchor, string>> = { "above-content-left": "Left", "above-content-center": "Center", "above-content-right": "Right" };

/** Controlled placement of semantic text: logical anchors + print-safe fine offsets. */
/**
 * The title of plain writing pages (journal and notes pages — "NOTES"): where it
 * sits, a line under it, its style and its own font. Every journal and notes
 * page in this product follows it.
 */
export function WritingTitlePanel({ project, update }: PanelProps) {
  const o = project.layoutOptions.writingTitle ?? {};
  const styleSize = resolveTypography(project.typography.fonts, project.typography.roleOverrides).roles[o.style ?? "label"].sizePt;
  const set = (patch: Partial<NonNullable<ProductProject["layoutOptions"]["writingTitle"]>>) =>
    update((p) => ({ ...p, layoutOptions: { ...p.layoutOptions, writingTitle: { ...(p.layoutOptions.writingTitle ?? {}), ...patch } } }));
  return (
    <Section title="Page title">
      <p className="hint">The title at the top of journal and notes pages (“NOTES”). Every journal and notes page in this product follows these.</p>
      <Segmented label="Position" value={o.align ?? "left"} options={[{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }]} onChange={(align) => set({ align })} />
      <Check label="Line under the title" checked={!!o.rule} onChange={(rule) => set({ rule })} />
      <Segmented label="Style" value={o.style ?? "label"} options={[{ value: "label", label: "Small label" }, { value: "sectionHeading", label: "Section heading" }, { value: "pageTitle", label: "Page title" }]} onChange={(style) => set({ style })} />
      <Select label="Font" value={o.font ?? ""} options={fontOptions("Same as Style")} onChange={(font) => set({ font: font || undefined })} />
      <div className="row">
        <NumberField label="Size" suffix="points" step={1} min={6} max={72} value={o.sizePt ?? styleSize} onChange={(v) => set({ sizePt: Math.max(6, Math.min(72, Math.round(v * 2) / 2)) })} />
        {o.sizePt !== undefined && <button type="button" className="btn btn--ghost" onClick={() => set({ sizePt: undefined })}>Use the style's size</button>}
      </div>
    </Section>
  );
}

export function TextPlacementPanel({ project, update, usage, nav }: PanelProps) {
  if (!usage.semanticText.length) return null;
  const positions = project.layoutOptions.textPositions ?? {};
  const setPos = (key: SemanticTextKey, pos: ElementPosition | undefined) =>
    update((p) => {
      const next = { ...(p.layoutOptions.textPositions ?? {}) };
      if (pos) next[key] = pos;
      else delete next[key];
      return { ...p, layoutOptions: { ...p.layoutOptions, textPositions: next } };
    });
  return (
    <Section title="Where titles and headings sit">
      <p className="hint">Move titles and headings to another spot this page supports. The “Move” fields nudge them a little; text always stays inside the printable area.</p>
      {usage.semanticText.map(({ key, example, anchors, layoutIds, anchor, defaultAnchor }) => {
        const cur = positions[key];
        const anchorLabel = key === "sectionHeading" ? SECTION_ANCHOR_LABEL : ANCHOR_LABEL;
        return (
          <div key={key} className="field-group">
            <AppliesTo ids={layoutIds} nav={nav} />
            <Select
              label={`${TEXT_LABEL[key]} — “${example.length > 24 ? example.slice(0, 23) + "…" : example}”`}
              value={anchor}
              options={anchors.map((a) => ({ value: a, label: `${anchorLabel[a] ?? a}${a === defaultAnchor ? " (default)" : ""}` }))}
              onChange={(v) => setPos(key, v === defaultAnchor && !cur?.offsetXIn && !cur?.offsetYIn ? undefined : { anchor: v as TextAnchor, offsetXIn: cur?.offsetXIn ?? 0, offsetYIn: cur?.offsetYIn ?? 0 })}
            />
            <div className="row">
              <NumberField label="Move left / right" suffix="inches" step={0.05} min={-5} max={5} value={cur?.offsetXIn ?? 0} onChange={(offsetXIn) => setPos(key, { anchor, offsetYIn: cur?.offsetYIn ?? 0, offsetXIn })} />
              <NumberField label="Move up / down" suffix="inches" step={0.05} min={-5} max={5} value={cur?.offsetYIn ?? 0} onChange={(offsetYIn) => setPos(key, { anchor, offsetXIn: cur?.offsetXIn ?? 0, offsetYIn })} />
            </div>
          </div>
        );
      })}
    </Section>
  );
}

export function VariantsPanel({ project, update }: PanelProps) {
  return (
    <Section title={`Saved looks · ${project.variants.length}`}>
      <p className="hint">Design options share the same pages and layout. Each can have its own colors, decoration and title — for example, one journal in several colorways.</p>
      <Select
        label="Showing"
        value={project.activeVariantId ?? "__base"}
        options={[{ value: "__base", label: "Original design" }, ...project.variants.map((v) => ({ value: v.id, label: v.name }))]}
        onChange={(id) => update((p) => ({ ...p, activeVariantId: id === "__base" ? null : id }))}
      />
      {project.variants.map((v) => (
        <div key={v.id} className="row">
          <input
            type="text"
            value={v.name}
            aria-label="Design option name"
            style={{ flex: 1, border: "1px solid var(--ui-line)", borderRadius: 8, padding: "0 10px" }}
            onChange={(e) => update((p) => ({ ...p, variants: p.variants.map((x) => (x.id === v.id ? { ...x, name: e.target.value } : x)) }))}
          />
          <button className="btn btn--danger" onClick={() => update((p) => ({ ...p, variants: p.variants.filter((x) => x.id !== v.id), activeVariantId: p.activeVariantId === v.id ? null : p.activeVariantId }))}>
            Delete
          </button>
        </div>
      ))}
      <button
        className="btn"
        onClick={() =>
          update((p) => {
            const look = applyVariant(p);
            const next = addVariantFromCurrent({ ...p, decorativeTheme: look.decorativeTheme, backgroundTheme: look.backgroundTheme }, `Design option ${p.variants.length + 1}`, { ...findPalette(p.colors.paletteId).colors, ...look.colors.overrides });
            // The base design is untouched; only the new variant captures the look.
            return { ...next, decorativeTheme: p.decorativeTheme, backgroundTheme: p.backgroundTheme };
          })
        }
      >
        Save current look as a design option
      </button>
    </Section>
  );
}

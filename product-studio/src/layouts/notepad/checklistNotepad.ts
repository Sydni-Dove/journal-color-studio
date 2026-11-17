/**
 * Checklist pad: the title, then the rest of the sheet blank except a column of checkboxes (no writing lines).
 * Checkbox shape (square, circle, none) and the number of rows come from the list-page options; two columns
 * when the sheet is wide enough. Row spacing is the grocery list's (research 3.2.3).
 */
import { distributeEqual } from "../../engines/layout/math";
import { STUDIO_GROCERY } from "../../presets/studioDefaults";
import type { LayoutMetric, LayoutNode, SolvedPage } from "../../types/layout";
import { checklistRows, headerTitle, pageFrame } from "../shared/components";
import { minimumAreaFit, type LayoutDefinition } from "../shared/types";

export const checklistNotepad: LayoutDefinition = {
  id: "notepad-checklist",
  label: "Checklist (title and checkboxes)",
  family: "notepad",
  description: "The title, then blank space with only checkboxes: square, circle or none.",
  pages: 1,
  period: "none",
  capability: {
    supportedProductTypes: ["notepad", "insert", "custom"],
    supportsPatterns: [],
    supportsLineStyle: false,
    supportsSidebar: false,
    supportsDatePlacement: false,
    supportsSectionsPerDay: false,
    supportsWritingRows: false,
    supportsPageNumbers: true,
    supportsFooter: true,
    requiresCalendar: false,
    usesWeekStart: false,
    wordingKeys: ["checklist"],
    repeats: ["repeated-sheet", "once", "count"],
    defaultRepeat: "repeated-sheet",
  },
  fit: minimumAreaFit(2, 2.5, "Checklist"),
  solve(ctx): SolvedPage[] {
    const s = ctx.spacing;
    const opts = ctx.options.listPage ?? {};
    const frame = pageFrame(ctx, 0, { headerH: STUDIO_GROCERY.header.valueIn });
    const title = headerTitle("checklist-header", ctx, frame.zones, "pageTitle", ctx.wording.checklist, "pageTitle", "header-center");
    const nodes: LayoutNode[] = [...frame.nodes, ...title.nodes];
    const rowH = STUDIO_GROCERY.row.valueIn;
    const colCount = frame.body.w + 1e-6 >= STUDIO_GROCERY.twoColumnMinWidth.valueIn ? 2 : 1;
    const cols = distributeEqual(frame.body.x, frame.body.w, colCount, s.section);
    const room = frame.body.h;
    const perCol = opts.lines ? Math.ceil(opts.lines / colCount) : Infinity;
    const h = Math.min(room, perCol * rowH);
    let rows = 0;
    cols.starts.forEach((x, c) => {
      const list = checklistRows(`checklist-col${c}`, { x, y: frame.body.y, w: cols.size, h }, ctx, rowH, { marker: opts.marker ?? "square", lines: false });
      rows += list.rows;
      nodes.push(...list.nodes);
    });
    const diagnostics = [...frame.diagnostics, ...title.diagnostics];
    if (opts.lines && opts.lines > rows) diagnostics.push({ severity: "warning", rule: "min-writing-area", componentId: "checklist", message: `${opts.lines} rows don't fit on this sheet: ${rows} are shown.` });
    const metrics: LayoutMetric[] = [
      { label: "Columns", value: colCount, unit: "count", provenance: { geometryClass: "studio-recommended", basis: `two columns when usable width ≥ ${STUDIO_GROCERY.twoColumnMinWidth.valueIn}"` } },
      { label: "Rows", value: rows, unit: "count", provenance: { geometryClass: "user-design", basis: opts.lines ? "set by the maker" : `floor(body ÷ ${rowH})` } },
    ];
    return [{ nodes, diagnostics, metrics, regions: { mainContent: frame.body, writingArea: frame.body } }];
  },
};

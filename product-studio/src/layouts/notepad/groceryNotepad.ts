/**
 * Grocery list pad. Research 3.2.3: header 0.7", category subheads 0.35",
 * rows 0.35", checkbox 0.16", two columns optional. Categories use semantic
 * wording keys; the number of rows per category is solved from the space.
 */
import { distributeEqual } from "../../engines/layout/math";
import { STUDIO_GROCERY } from "../../presets/studioDefaults";
import type { LayoutMetric, LayoutNode, SolvedPage } from "../../types/layout";
import type { WordingKey } from "../../types/tokens";
import { checklistRows, headerTitle, pageFrame } from "../shared/components";
import { group, rule, text } from "../shared/nodes";
import { minimumAreaFit, type LayoutDefinition } from "../shared/types";

const CATEGORIES: WordingKey[] = ["produce", "dairy", "protein", "pantry", "frozen", "household"];

export const groceryNotepad: LayoutDefinition = {
  id: "notepad-grocery",
  label: "Grocery List",
  family: "notepad",
  description: "Category blocks with checklist rows; two columns when the sheet is wide enough.",
  pages: 1,
  period: "none",
  capability: {
    supportedProductTypes: ["notepad", "insert", "custom"],
    supportsPatterns: [],
    supportsLineStyle: true,
    supportsSidebar: false,
    supportsDatePlacement: false,
    supportsSectionsPerDay: false,
    supportsWritingRows: false,
    supportsPageNumbers: true,
    supportsFooter: true,
    requiresCalendar: false,
    usesWeekStart: false,
    wordingKeys: ["groceryList", ...CATEGORIES],
    repeats: ["repeated-sheet", "once", "count"],
    defaultRepeat: "repeated-sheet",
  },
  // Six categories × (subhead + at least 2 rows) must fit in one or two columns.
  fit: minimumAreaFit(2.5, 4, "Grocery list"),
  solve(ctx): SolvedPage[] {
    const s = ctx.spacing;
    const frame = pageFrame(ctx, 0, { headerH: STUDIO_GROCERY.header.valueIn });
    const title = headerTitle("grocery-header", ctx, frame.zones, "pageTitle", ctx.wording.groceryList, "pageTitle", "header-center");
    const nodes: LayoutNode[] = [...frame.nodes, ...title.nodes];
    const twoCols = frame.body.w + 1e-6 >= STUDIO_GROCERY.twoColumnMinWidth.valueIn;
    const colCount = twoCols ? 2 : 1;
    const cols = distributeEqual(frame.body.x, frame.body.w, colCount, s.section);
    const perCol = CATEGORIES.length / colCount;
    const rowH = STUDIO_GROCERY.row.valueIn;
    const headH = STUDIO_GROCERY.categoryHead.valueIn;
    let rowsPerCategory = Infinity;
    cols.starts.forEach((x, c) => {
      const blocks = distributeEqual(frame.body.y, frame.body.h, perCol, s.block);
      blocks.starts.forEach((y, b) => {
        const key = CATEGORIES[c * perCol + b];
        const id = `grocery-${key}`;
        const blockRect = { x, y, w: cols.size, h: blocks.size };
        const headRect = { x, y, w: cols.size, h: headH };
        const listRect = { x, y: y + headH, w: cols.size, h: blocks.size - headH };
        const list = checklistRows(`${id}-list`, listRect, ctx, rowH);
        rowsPerCategory = Math.min(rowsPerCategory, list.rows);
        nodes.push(
          group(id, "Section", blockRect),
          text(`${id}-title`, { ...headRect, h: headH - s.headingToContentGap }, ctx.wording[key], "sectionHeading", { component: "SectionHeader", vAlign: "bottom" }),
          rule(`${id}-rule`, x, y + headH, x + cols.size, y + headH, { strokePt: 0.75 }),
          ...list.nodes,
        );
      });
    });
    const diagnostics = [...frame.diagnostics, ...title.diagnostics];
    if (rowsPerCategory < 2) {
      diagnostics.push({ severity: "warning", rule: "min-writing-area", componentId: "grocery", message: `Only ${rowsPerCategory} row(s) per category fit on this sheet.` });
    }
    const metrics: LayoutMetric[] = [
      { label: "Columns", value: colCount, unit: "count", provenance: { geometryClass: "studio-recommended", basis: `two columns when usable width ≥ ${STUDIO_GROCERY.twoColumnMinWidth.valueIn}"` } },
      { label: "Rows per category", value: rowsPerCategory, unit: "count", provenance: { geometryClass: "user-design", basis: `floor((block − ${headH}) ÷ ${rowH})` } },
      { label: "Category subhead", value: headH, unit: "in", provenance: STUDIO_GROCERY.categoryHead.provenance },
    ];
    return [{ nodes, diagnostics, metrics, regions: { mainContent: frame.body, writingArea: frame.body } }];
  },
};

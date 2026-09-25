/**
 * To-Do notepad sheet (Test Product 1).
 * Blueprint reference N-B1: glue band 0.375, header 0.9, rows 0.36,
 * checkbox 0.16 + 0.12 gap. Row count is solved from the remaining height —
 * never hard-coded.
 */
import { STUDIO_NOTEPAD } from "../../presets/studioDefaults";
import type { SolvedPage } from "../../types/layout";
import { checklistRows, headerTitle, pageFrame } from "../shared/components";
import { minimumAreaFit, type LayoutDefinition } from "../shared/types";

export const todoNotepad: LayoutDefinition = {
  id: "notepad-todo",
  label: "To-Do List",
  family: "notepad",
  description: "Header band + checklist rows filling the sheet.",
  pages: 1,
  period: "none",
  capability: {
    supportedProductTypes: ["notepad", "insert", "worksheet", "custom"],
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
    wordingKeys: ["toDo"],
    repeats: ["repeated-sheet", "once", "count"],
    defaultRepeat: "repeated-sheet",
  },
  // Header 0.9" + at least 3 checklist rows; checkbox + gap + a 1" writing line.
  fit: minimumAreaFit(1.5, 2.5, "To-do list"),
  solve(ctx): SolvedPage[] {
    const frame = pageFrame(ctx, 0, { headerH: STUDIO_NOTEPAD.header.valueIn });
    const list = checklistRows("todo", frame.body, ctx);
    const title = headerTitle("todo-header", ctx, frame.zones, "pageTitle", ctx.wording.toDo, "pageTitle", "header-center");
    return [
      {
        nodes: [...frame.nodes, ...title.nodes, ...list.nodes],
        diagnostics: [...frame.diagnostics, ...title.diagnostics],
        regions: { mainContent: frame.body, writingArea: frame.body },
        metrics: [
          { label: "Header height", value: STUDIO_NOTEPAD.header.valueIn, unit: "in", provenance: STUDIO_NOTEPAD.header.provenance },
          { label: "Writing region height", value: frame.body.h, unit: "in", provenance: { geometryClass: "user-design", basis: "safe height − header − gaps − footer" } },
          ...list.metrics,
        ],
      },
    ];
  },
};

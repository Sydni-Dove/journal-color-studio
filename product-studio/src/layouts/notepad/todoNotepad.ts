/**
 * To-Do notepad sheet (Test Product 1).
 * Blueprint reference N-B1: glue band 0.375, header 0.9, rows 0.36,
 * checkbox 0.16 + 0.12 gap. Row count is solved from the remaining height —
 * never hard-coded.
 */
import { STUDIO_NOTEPAD } from "../../presets/studioDefaults";
import type { SolvedPage } from "../../types/layout";
import { checklistRows, headerTitle, pageFrame } from "../shared/components";
import type { LayoutDefinition } from "../shared/types";

export const todoNotepad: LayoutDefinition = {
  id: "notepad-todo",
  label: "To-Do List",
  family: "notepad",
  description: "Header band + checklist rows filling the sheet.",
  pages: 1,
  period: "none",
  solve(ctx): SolvedPage[] {
    const frame = pageFrame(ctx, 0, {
      headerH: STUDIO_NOTEPAD.header.valueIn,
      footer: ctx.options.showFooter,
      footerText: ctx.wording.productTitle,
    });
    const list = checklistRows("todo", frame.body, ctx);
    return [
      {
        nodes: [...frame.nodes, ...headerTitle("todo-header", frame.header, ctx.wording.toDo, "pageTitle", "center"), ...list.nodes],
        diagnostics: frame.diagnostics,
        metrics: [
          { label: "Header height", value: STUDIO_NOTEPAD.header.valueIn, unit: "in", provenance: STUDIO_NOTEPAD.header.provenance },
          { label: "Writing region height", value: frame.body.h, unit: "in", provenance: { geometryClass: "user-design", basis: "safe height − header − gaps − footer" } },
          ...list.metrics,
        ],
      },
    ];
  },
};

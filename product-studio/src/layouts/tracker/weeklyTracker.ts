/** Undated weekly tracker. The module supplies tracked item labels; this layout
 * only arranges their seven check cells inside the print-safe body. */
import { STUDIO_PLANNER } from "../../presets/studioDefaults";
import type { LayoutNode, SolvedPage } from "../../types/layout";
import { headerTitle, pageFrame } from "../shared/components";
import { checkbox, rule, text } from "../shared/nodes";
import { minimumAreaFit, type LayoutDefinition } from "../shared/types";

export const weeklyTracker: LayoutDefinition = {
  id: "tracker-weekly",
  label: "Weekly tracker grid",
  family: "tracker",
  description: "Tracked items down the page and seven check boxes across each row.",
  pages: 1,
  period: "none",
  capability: {
    supportedProductTypes: ["tracker", "planner", "journal", "insert", "worksheet", "custom"],
    supportsPatterns: [], supportsLineStyle: true, supportsSidebar: false, supportsDatePlacement: false,
    supportsSectionsPerDay: false, supportsWritingRows: false, supportsPageNumbers: true, supportsFooter: true,
    requiresCalendar: false, usesWeekStart: true, wordingKeys: [], repeats: ["once", "count", "repeated-sheet"], defaultRepeat: "once",
  },
  fit: minimumAreaFit(4, 3, "Seven-day tracker"),
  solve(ctx): SolvedPage[] {
    const frame = pageFrame(ctx, 0, { headerH: STUDIO_PLANNER.weeklyTitle.valueIn });
    const title = headerTitle("tracker-title", ctx, frame.zones, "pageTitle", ctx.module?.title ?? "Weekly Tracker", "pageTitle", "header-left");
    const labels = (ctx.module?.prompts?.length ? ctx.module.prompts : ["Prayer", "Scripture", "Movement", "Water"]).slice(0, 16);
    const days = ctx.weekStart === 0 ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const body = frame.body;
    const labelW = Math.min(2.1, body.w * 0.3);
    const dayW = (body.w - labelW) / 7;
    const rowH = Math.min(0.58, body.h / (labels.length + 1));
    const nodes: LayoutNode[] = [...frame.nodes, ...title.nodes];
    days.forEach((day, col) => nodes.push(text(`tracker-day-${col}`, { x: body.x + labelW + col * dayW, y: body.y, w: dayW, h: rowH }, day, "label", { component: "PageHeader", align: "center" })));
    nodes.push(rule("tracker-header-rule", body.x, body.y + rowH, body.x + body.w, body.y + rowH));
    labels.forEach((label, row) => {
      const y = body.y + (row + 1) * rowH;
      nodes.push(text(`tracker-item-${row}`, { x: body.x, y, w: labelW - 0.08, h: rowH }, label, "label", { component: "SectionHeader" }));
      days.forEach((_, col) => {
        const size = Math.min(0.17, rowH * 0.42, dayW * 0.42);
        nodes.push(checkbox(`tracker-check-${row}-${col}`, { x: body.x + labelW + col * dayW + (dayW - size) / 2, y: y + (rowH - size) / 2, w: size, h: size }));
      });
      nodes.push(rule(`tracker-row-${row}`, body.x, y + rowH, body.x + body.w, y + rowH));
    });
    return [{ nodes, diagnostics: [...frame.diagnostics, ...title.diagnostics], metrics: [{ label: "Tracked items", value: labels.length, unit: "count", provenance: { geometryClass: "user-design", basis: "tracker item list" } }], regions: { mainContent: body } }];
  },
};

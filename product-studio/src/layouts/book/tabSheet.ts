import { coverPage } from "./coverDivider";
import type { LayoutContext, LayoutDefinition } from "../shared/types";
import { minimumAreaFit } from "../shared/types";
import { text, box, rule } from "../shared/nodes";
import { fitHeading } from "../shared/components";
import type { LayoutNode, SolvedPage } from "../../types/layout";
import type { TabPiece, TabSheetSettings } from "../../types/recipe";

export const DEFAULT_TAB_PIECES: TabPiece[] = ["Prayer", "Vision", "Plan", "Schedule", "Work", "Home", "Wellness", "Finances", "Notes"].map((label, i) => ({ label, color: (["secondary", "primary", "decorativeAccent", "decorHighlight", "secondary", "secondary", "primary", "accent", "text"] as const)[i], leopard: i === 4 }));

/** One folded face includes both the adhesion overlap and the visible extension. */
export function tabPieceDimensions(o: TabSheetSettings) {
  return { width: o.widthIn ?? 1.05, height: o.heightIn ?? 0.6, attach: o.attachIn ?? 0.35 };
}
function solve(ctx: LayoutContext): SolvedPage[] {
  const s = ctx.pages[0].safeRect, o = ctx.module?.tabSheet ?? {}, entries = o.entries ?? DEFAULT_TAB_PIECES;
  const { width, height, attach } = tabPieceDimensions(o);
  const nodes: LayoutNode[] = [], diagnostics: SolvedPage["diagnostics"] = [];
  const error = (message: string) => diagnostics.push({ severity: "error", rule: "tab-sheet-fit", componentId: "tab-sheet", message });
  const add = (id: string, value: string, x: number, y: number, w: number, h: number, role: "body" | "label" | "pageTitle", color: "text" | "background" = "text") => {
    const node = text(id, { x, y, w, h }, value, role, { wrap: true, color, align: "center" });
    const f = fitHeading(value, role, node.rect, ctx); node.fit = { ...f, failed: !f.ok }; nodes.push(node);
    if (!f.ok) error(`“${value}” needs more room. Shorten the wording or use larger tabs.`);
  };
  if (![width, height, attach].every(Number.isFinite) || width < 0.65 || width > 2 || height < 0.4 || height > 1.5 || attach < 0.2 || attach > width - 0.25) {
    error("Choose tabs 0.65–2 inches wide and 0.4–1.5 inches high, with at least 0.2 inches attached to the page and 0.25 inches sticking out.");
    return [{ manufacturingSheet: true, nodes, diagnostics, metrics: [] }];
  }
  if (!entries.length || entries.length > 24) error("Use between 1 and 24 tabs per sheet.");
  const gapX = 0.15, gapY = 0.16, header = 1.05, footer = 0.9, pieceW = width * 2;
  const cols = Math.floor((s.w + gapX) / (pieceW + gapX));
  const rows = Math.floor((s.h - header - footer + gapY) / (height + gapY));
  if (cols < 1 || rows < 1 || entries.length > cols * rows) {
    error(`This sheet fits ${Math.max(0, cols * rows)} tabs at this size. Use fewer tabs, smaller tabs, or print the tab sheet as a separate Letter-size product.`);
    return [{ manufacturingSheet: true, nodes, diagnostics, metrics: [] }];
  }
  add("tab-sheet-title", ctx.module?.title ?? "Separate Tabs", s.x, s.y, s.w, 0.35, "pageTitle");
  add("tab-sheet-instructions", "Cut the solid outline. Fold the dashed center. Attach both ends to opposite sides of the divider edge.", s.x, s.y + 0.42, s.w, 0.5, "body");
  entries.forEach((entry, i) => {
    const x = s.x + (i % cols) * (pieceW + gapX), y = s.y + header + Math.floor(i / cols) * (height + gapY);
    const shape = box(`piece-${i}`, { x, y, w: pieceW, h: height }, { fill: entry.color ?? "secondary", stroke: "text", strokePt: 0.6, radiusIn: o.rounded === false ? 0 : 0.08 });
    shape.leopard = entry.leopard; nodes.push(shape);
    // Attachment areas remain visibly marked while the center leaves room for each face's label.
    for (const at of [x, x + pieceW - attach]) nodes.push(box(`attach-${i}-${at}`, { x: at + 0.01, y: y + 0.01, w: attach - 0.02, h: height - 0.02 }, { stroke: null, fill: "background", fillOpacity: 0.7 }));
    add(`piece-number-${i}`, String(i + 1), x + 0.03, y + 0.04, attach - 0.06, height - 0.08, "label");
    if (o.guides !== false) {
      const fold = rule(`fold-${i}`, x + width, y, x + width, y + height, { color: "text", strokePt: 0.5 }); fold.dashed = true; nodes.push(fold);
      for (const at of [x + attach, x + pieceW - attach]) { const edge = rule(`page-edge-${i}-${at}`, at, y, at, y + height, { color: "text", strokePt: 0.3 }); edge.dashed = true; nodes.push(edge); }
    }
    const dark = entry.color === "primary" || entry.color === "text" || entry.leopard;
    for (const [face, left] of [x + attach, x + width].entries()) {
      const area = { x: left + 0.03, y: y + 0.05, w: width - attach - 0.06, h: height - 0.1 };
      if (entry.leopard) nodes.push(box(`label-backing-${i}-${face}`, area, { fill: "primary", fillOpacity: 0.95, stroke: null, radiusIn: 0.04 }));
      add(`tab-face-${i}-${face}`, entry.label, area.x, area.y, area.w, area.h, "label", dark ? "background" : "text");
    }
  });
  const fy = s.y + s.h - footer;
  add("tab-sheet-size", `Folded width ${width.toFixed(2)} in · Height ${height.toFixed(2)} in · Attach ${attach.toFixed(2)} in · Extends ${(width - attach).toFixed(2)} in`, s.x, fy, s.w, 0.32, "body");
  const dividerH = o.dividerHeightIn ?? ctx.pages[0].trimHeightIn;
  if (!Number.isFinite(dividerH) || dividerH < 3) error("Enter a divider height of at least 3 inches for placement guidance.");
  else if (entries.length * height + (entries.length - 1) * 0.08 > dividerH - 0.5) error("These tabs are too tall to stagger on that divider. Use shorter tabs, fewer tabs or a taller divider.");
  const usable = dividerH - 0.5, slot = usable / Math.max(1, entries.length);
  const positions = entries.map((_, i) => `${i + 1}: ${(0.25 + i * slot + (slot - height) / 2).toFixed(2)}″`).join(" · ");
  add("tab-sheet-placement", `Top edges measured down from the divider top (${dividerH.toFixed(2)} in tall): ${positions}`, s.x, fy + 0.38, s.w, 0.4, "body");
  return [{ manufacturingSheet: true, nodes, diagnostics, metrics: [], regions: { mainContent: s } }];
}
export const tabSheet: LayoutDefinition = { ...coverPage, id: "tab-sheet", label: "Separate cut-and-fold tab sheet", description: "Matching pieces to cut, fold and attach beyond a divider edge.", capability: { ...coverPage.capability, supportedProductTypes: ["planner", "journal", "notebook", "insert", "worksheet", "custom"] }, fit: minimumAreaFit(2.1, 3), solve };

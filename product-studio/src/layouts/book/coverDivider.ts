import type { LayoutNode, SolvedPage } from "../../types/layout";
import type { PageGeometry, Rect } from "../../types/geometry";
import type { CoverDividerSettings } from "../../types/recipe";
import type { ColorToken } from "../../types/tokens";
import { text, box, rule } from "../shared/nodes";
import { fitHeading } from "../shared/components";
import { guidedPage } from "./guidedPage";
import { minimumAreaFit, type LayoutContext, type LayoutDefinition } from "../shared/types";

/** Interior printed tabs: fixed physical width, all edges inside the resolved live area. */
export function tabGeometry(g: PageGeometry, tab: NonNullable<CoverDividerSettings["tab"]>): Rect | null {
  const count = tab.count ?? 9, order = tab.order ?? 1;
  if (!Number.isInteger(count) || count < 1 || count > 24 || !Number.isInteger(order) || order < 1 || order > count) return null;
  const s = g.safeRect, slot = s.h / count;
  const h = tab.style === "rounded" ? Math.min(0.6, slot - 0.04) : slot - 0.04;
  if (h < 0.24 || s.w < 1.5) return null;
  return { x: s.x + s.w - (tab.style === "staggered" ? 0.52 : 0.9), y: s.y + (order - 1) * slot + (slot - h) / 2, w: tab.style === "staggered" ? 0.52 : 0.9, h };
}

function solve(ctx: LayoutContext, divider: boolean): SolvedPage[] {
  const g = ctx.pages[0], s = g.safeRect, opt = ctx.module?.cover ?? {};
  const nodes: LayoutNode[] = [], diagnostics: SolvedPage["diagnostics"] = [];
  const title = ctx.module?.title ?? (divider ? "Prayer" : "Plan");
  const tab = opt.tab?.show ? tabGeometry(g, opt.tab) : null;
  if (opt.tab?.show && !tab) diagnostics.push({ severity: "error", rule: "tab-fit", componentId: "tab", message: "These tabs do not fit comfortably. Use fewer tabs or a larger page." });
  const content = { ...s, w: s.w - (tab ? tab.w + 0.16 : 0) };
  const w = g.trimWidthIn, h = g.trimHeightIn;
  // Wide and narrow trims recompose their corner elements; physical tab width never scales.
  const narrow = s.w < 4;
  const d = Math.min(w * (narrow ? 0.42 : 0.46), h * 0.32);
  const circle = (id: string, x: number, y: number, size: number, fill: ColorToken | null, outline = false, leopard = false) => nodes.push({ id, type: "circle", component: "Section", rect: { x, y, w: size, h: size }, functional: false, fill, outline, leopard });
  if (opt.preset !== "plain") {
    if (opt.circles !== false) {
      circle("luxe-chocolate", w * 0.12, -d * 0.2, d, "primary");
      circle("luxe-taupe", w - d * 0.75, h * 0.12, d * 0.8, "secondary");
      circle("luxe-blue", -d * 0.3, h - d * 0.65, d * 0.72, "decorativeAccent");
      circle("luxe-rust", w - d * 0.6, h - d * 0.55, d * 0.6, "accent");
    }
    if (opt.leopard !== false) circle("luxe-leopard", w - d * 0.6, narrow ? h * 0.72 : h * 0.04, d * 0.58, "secondary", false, true);
    if (opt.outlines !== false) {
      circle("luxe-arc-top", -d * 0.65, -d * 0.65, d * 1.8, null, true);
      circle("luxe-arc-bottom", w - d * 1.25, h - d * 0.75, d * 1.7, null, true);
    }
  }
  const desiredY = content.y + content.h * (opt.position === "upper" ? 0.26 : opt.position === "lower" ? 0.58 : 0.4);
  const addText = (id: string, value: string, rect: Rect, role: "coverTitle" | "coverSubtitle" | "body") => {
    const node = text(id, rect, value, role, { align: opt.alignment ?? "center", wrap: true });
    const fitted = fitHeading(value, role, rect, ctx);
    node.fit = { ...fitted, failed: !fitted.ok };
    if (!fitted.ok) diagnostics.push({ severity: "error", rule: "heading-fit", componentId: id, message: "This wording is too long. Shorten it or choose a larger page." });
    nodes.push(node);
  };
  const titleH = Math.min(2.2, content.h * 0.27);
  const y = Math.max(content.y, Math.min(desiredY, content.y + content.h - titleH - 0.88 - (opt.quote ? 0.7 : 0)));
  addText("cover-title", title, { x: content.x, y, w: content.w, h: titleH }, "coverTitle");
  const subY = y + titleH + 0.08;
  addText("cover-subtitle", opt.subtitle ?? (divider ? "" : "WITH PURPOSE"), { x: content.x, y: subY, w: content.w, h: 0.35 }, "coverSubtitle");
  if (opt.smallLine !== false) nodes.push(rule("cover-line", content.x + content.w * 0.4, subY + 0.44, content.x + content.w * 0.6, subY + 0.44, { color: "text", strokePt: 0.5 }));
  if (opt.quote) addText("cover-quote", opt.quote, { x: content.x, y: subY + 0.62, w: content.w, h: Math.max(0.2, s.y + s.h - subY - 0.72) }, "body");
  if (tab && opt.tab) {
    nodes.push(box("tab", tab, { stroke: null, fill: opt.tab.color ?? "secondary", radiusIn: opt.tab.style === "rounded" ? 0.12 : 0 }));
    if (opt.tab.leopard) nodes.push({ id: "tab-leopard", type: "circle", component: "Section", rect: tab, functional: false, fill: "secondary", leopard: true });
    const label = text("tab-label", { x: tab.x + 0.04, y: tab.y + 0.03, w: tab.w - 0.08, h: tab.h - 0.06 }, opt.tab.label ?? title, "label", { wrap: true, align: "center", color: opt.tab.color === "primary" || opt.tab.color === "text" || opt.tab.leopard ? "background" : "text" });
    const fitted = fitHeading(label.text, "label", label.rect, ctx);
    label.fit = { ...fitted, failed: !fitted.ok }; nodes.push(label);
    if (!fitted.ok) diagnostics.push({ severity: "error", rule: "tab-label-fit", componentId: label.id, message: "This tab label is too long. Use a short label or fewer tabs." });
  }
  return [{ nodes, diagnostics, metrics: [], regions: { mainContent: content } }];
}
const capability = { ...guidedPage.capability, supportsPatterns: [], supportsLineStyle: false, supportsPageNumbers: false, supportsFooter: false, wordingKeys: [] };
export const coverPage: LayoutDefinition = { id: "cover-page", label: "Cover page", description: "Reusable front cover, section cover or title page.", family: "shared", pages: 1, period: "none", capability, fit: minimumAreaFit(1.5, 2.5), solve: (ctx) => solve(ctx, false) };
export const dividerPage: LayoutDefinition = { ...coverPage, id: "divider-page", label: "Divider / tab page", description: "Section opener with optional interior printed tab.", solve: (ctx) => solve(ctx, true) };

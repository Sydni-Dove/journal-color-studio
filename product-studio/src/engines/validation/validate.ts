/**
 * LAYOUT VALIDATION ENGINE. Runs over the SAME solved nodes the preview and
 * print renderers draw. Export is blocked while any error remains.
 */
import { validateDimensions } from "../geometry/dimensions";
import { validateCalendarSettings } from "../calendar/calendar";
import { rectContains, rectsIntersect } from "../layout/math";
import { geometryFor, resolveDocument, solvePage, type ResolvedDocument } from "../document/resolve";
import { styleForRole, type TextMeasurer } from "../typography/textMeasure";
import { GEOMETRY_EPSILON_IN, ptToIn } from "../units/units";
import { MIN_PRINT_FONT_PT } from "../../presets/typography/typography";
import type { PageGeometry } from "../../types/geometry";
import type { LayoutNode, SolvedPage } from "../../types/layout";
import type { ProductProject } from "../../types/project";
import type { ValidationIssue, ValidationReport, ValidationRule } from "../../types/validation";

const EPS = GEOMETRY_EPSILON_IN;
/** Per page, per rule — further repeats are summarized. */
const MAX_ISSUES_PER_RULE_PER_PAGE = 4;

export function finalizeReport(issues: ValidationIssue[], checkedPages: number): ValidationReport {
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  return { issues, errorCount, warningCount, checkedPages, exportAllowed: errorCount === 0 };
}

// ─── Product-level checks ──────────────────────────────────────────────────
export function validateProductLevel(doc: ResolvedDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { binding, printProfile, recipe, project } = doc;
  const add = (severity: ValidationIssue["severity"], rule: ValidationRule, message: string, measurement?: ValidationIssue["measurement"]) =>
    issues.push({ severity, rule, page: null, componentId: null, message, measurement });

  if (!printProfile.bindingRules.supported.includes(binding.id)) {
    add("error", "printer-profile", `${printProfile.label} does not support ${binding.label}.`);
  }
  if (printProfile.supportedSizes !== "any") {
    const w = doc.trim.widthIn, h = doc.trim.heightIn;
    const ok = printProfile.supportedSizes.some((s) => {
      const [a, b] = s.split("x").map(Number);
      return (Math.abs(a - w) < 0.01 && Math.abs(b - h) < 0.01) || (Math.abs(a - h) < 0.01 && Math.abs(b - w) < 0.01);
    });
    if (!ok) add("warning", "printer-profile", `${w}" × ${h}" is not in ${printProfile.label}'s listed trim sizes (research snapshot). Confirm before ordering.`);
  }

  // Page-count rules: sheet-metadata products (pads) are exempt.
  if (!binding.sheetCountIsMetadata) {
    const n = recipe.pageCount;
    const rules = [
      { src: printProfile.label, r: printProfile.pageCountRules },
      { src: binding.label, r: binding.pageCountRules },
    ];
    for (const { src, r } of rules) {
      if (!r) continue;
      if (r.minPages !== undefined && n < r.minPages) add("error", "page-count", `${src} requires at least ${r.minPages} pages; this product has ${n}.`, { actual: n, limit: r.minPages, unit: "pages" });
      if (r.maxPages !== undefined && n > r.maxPages) add("error", "page-count", `${src} allows at most ${r.maxPages} pages; this product has ${n}.`, { actual: n, limit: r.maxPages, unit: "pages" });
      if (r.multipleOf !== undefined && n % r.multipleOf !== 0) add("error", "page-count", `${src} needs a page count divisible by ${r.multipleOf}; this product has ${n}.`, { actual: n, limit: r.multipleOf, unit: "pages" });
    }
  }

  for (const d of recipe.diagnostics) {
    add(d.severity, "page-count", d.message);
  }

  // Studio/user geometry must never go below required geometry.
  const g = geometryFor(doc, { side: recipe.pages[0]?.side ?? "single" });
  for (const m of g.margins) {
    if (m.clamped) {
      add("warning", "safe-area", `Your ${m.logicalEdge} margin (${m.userIn}") is below the required ${m.requiredIn}" and was raised to ${m.effectiveIn}".`, {
        actual: m.userIn!,
        limit: m.requiredIn,
        unit: "in",
      });
    }
  }

  const deco = doc.decorative;
  if (binding.id === "glued-pad" && deco.style !== "none" && deco.placement === "full-page" && deco.applyToInterior) {
    add("warning", "decoration", "Full-page backgrounds are discouraged on writable pads (UPrinting artwork guidance). Consider a header band.");
  }
  if (deco.style !== "none" && deco.placement === "full-page" && !project.production.includeBleed) {
    add("warning", "bleed", "Full-page decoration without bleed can leave white slivers at the trim. Turn on bleed.");
  }
  if (project.production.includeBleed && !doc.printProfile.bleedRules.bleed) {
    add("info", "bleed", `${doc.printProfile.label} defines no bleed; the page is output at trim size.`);
  }
  return issues;
}

// ─── Page-level checks ─────────────────────────────────────────────────────
function checkNode(node: LayoutNode, g: PageGeometry, push: (rule: ValidationRule, id: string, msg: string, m?: ValidationIssue["measurement"], severity?: ValidationIssue["severity"]) => void) {
  const r = node.rect;
  if (r.w < -EPS || r.h < -EPS || !Number.isFinite(r.x + r.y + r.w + r.h)) {
    push("negative-geometry", node.id, `Negative or invalid size (${r.w.toFixed(3)}" × ${r.h.toFixed(3)}").`, { actual: Math.min(r.w, r.h), limit: 0, unit: "in" });
    return;
  }
  if (!node.functional) return;

  if (!rectContains(g.safeRect, r)) {
    const over = Math.max(g.safeRect.x - r.x, g.safeRect.y - r.y, r.x + r.w - (g.safeRect.x + g.safeRect.w), r.y + r.h - (g.safeRect.y + g.safeRect.h));
    const rule: ValidationRule = node.component === "CalendarCell" ? "calendar-overflow" : node.component === "GraphGrid" || node.component === "DotGrid" ? "grid-overflow" : "safe-area";
    push(rule, node.id, `${node.component} crosses the safe area by ${over.toFixed(3)}".`, { actual: over, limit: 0, unit: "in" });
  }
  for (const k of g.keepOuts) {
    if (k.id === "glue-band") continue; // band sits inside the glue keep-out
    if (r.w > EPS && r.h > EPS ? rectsIntersect(k.rect, r) : false) {
      push(k.kind === "glue" ? "glue-keep-out" : "binding-keep-out", node.id, `${node.component} enters the ${k.label} (${k.depthIn}" from the ${k.edge} edge).`, { actual: k.depthIn, limit: k.depthIn, unit: "in" });
    }
  }
  if (node.type === "lines") {
    const lo = node.orientation === "horizontal" ? r.y : r.x;
    const hi = node.orientation === "horizontal" ? r.y + r.h : r.x + r.w;
    const bad = node.positions.find((p) => p < lo - EPS || p > hi + EPS);
    if (bad !== undefined) push("line-overflow", node.id, `A line at ${bad.toFixed(3)}" falls outside its writing region (${lo.toFixed(3)}–${hi.toFixed(3)}").`, { actual: bad, limit: hi, unit: "in" });
  }
  if (node.type === "dots") {
    const outX = node.xs.some((x) => x < g.safeRect.x - EPS || x > g.safeRect.x + g.safeRect.w + EPS);
    const outY = node.ys.some((y) => y < g.safeRect.y - EPS || y > g.safeRect.y + g.safeRect.h + EPS);
    if (outX || outY) push("grid-overflow", node.id, "Dot grid extends outside the safe area.");
  }
}

function checkText(node: Extract<LayoutNode, { type: "text" }>, doc: ResolvedDocument, measure: TextMeasurer, push: Parameters<typeof checkNode>[2]) {
  const role = doc.typography.roles[node.role];
  if (role.sizePt < MIN_PRINT_FONT_PT) {
    push("text-too-small", node.id, `${node.role} is ${role.sizePt} pt — below the ${MIN_PRINT_FONT_PT} pt print minimum.`, { actual: role.sizePt, limit: MIN_PRINT_FONT_PT, unit: "pt" });
  }
  if (!node.text) return;
  const lineH = ptToIn(role.sizePt * role.lineHeight);
  const width = measure(node.text, styleForRole(doc.typography, node.role));
  if (!node.wrap) {
    if (width > node.rect.w + EPS) {
      push("text-overflow", node.id, `"${node.text}" is ${width.toFixed(3)}" wide but its box is ${node.rect.w.toFixed(3)}".`, { actual: width, limit: node.rect.w, unit: "in" });
    }
    if (lineH > node.rect.h + 0.01) {
      push("text-overflow", node.id, `"${node.text}" line height ${lineH.toFixed(3)}" exceeds its ${node.rect.h.toFixed(3)}" box.`, { actual: lineH, limit: node.rect.h, unit: "in" });
    }
  } else {
    const lines = Math.max(1, Math.ceil(width / Math.max(node.rect.w, EPS)));
    if (lines * lineH > node.rect.h + 0.01) {
      push("text-overflow", node.id, `Text needs ~${lines} lines (${(lines * lineH).toFixed(3)}") but its box is ${node.rect.h.toFixed(3)}" tall.`, { actual: lines * lineH, limit: node.rect.h, unit: "in" });
    }
  }
}

export function validatePage(doc: ResolvedDocument, index: number, measure: TextMeasurer, solved?: SolvedPage): ValidationIssue[] {
  const page = doc.recipe.pages[index];
  const g = geometryFor(doc, page);
  const s = solved ?? solvePage(doc, index);
  const issues: ValidationIssue[] = [];
  const counts = new Map<string, number>();
  const push = (rule: ValidationRule, id: string, message: string, measurement?: ValidationIssue["measurement"], severity: ValidationIssue["severity"] = "error") => {
    const n = (counts.get(rule) ?? 0) + 1;
    counts.set(rule, n);
    if (n <= MAX_ISSUES_PER_RULE_PER_PAGE) issues.push({ severity, rule, page: page.pageNumber, componentId: id, message, measurement });
  };

  if (g.usableWidthIn <= EPS || g.usableHeightIn <= EPS) {
    push("negative-geometry", "page", `Safe area is ${g.usableWidthIn.toFixed(3)}" × ${g.usableHeightIn.toFixed(3)}" — margins exceed the trim.`, { actual: Math.min(g.usableWidthIn, g.usableHeightIn), limit: 0, unit: "in" });
  }
  for (const d of s.diagnostics) {
    const rule: ValidationRule = d.rule === "equal-columns" ? "grid-overflow" : "layout-solver";
    push(rule, d.componentId, d.message, d.measurement ? { actual: d.measurement.actualIn, limit: d.measurement.limitIn, unit: "in" } : undefined, d.severity);
  }

  const footers = s.nodes.filter((n) => n.component === "PageFooter" && n.type === "text");
  for (const node of s.nodes) {
    checkNode(node, g, push);
    if (node.type === "text") checkText(node, doc, measure, push);
    if (node.functional && node.component !== "PageFooter" && node.type !== "group") {
      for (const f of footers) {
        if (rectsIntersect(f.rect, node.rect)) {
          const isPageNo = doc.project.layoutOptions.showPageNumbers;
          push(isPageNo ? "page-number-collision" : "footer-collision", node.id, `${node.component} overlaps the page footer.`);
        }
      }
    }
  }
  for (const [rule, n] of counts) {
    if (n > MAX_ISSUES_PER_RULE_PER_PAGE) {
      issues.push({ severity: "error", rule: rule as ValidationRule, page: page.pageNumber, componentId: null, message: `…and ${n - MAX_ISSUES_PER_RULE_PER_PAGE} more "${rule}" issues on this page.` });
    }
  }
  return issues;
}

export type ValidateOptions = { pageIndices?: number[] };

export function validateProject(project: ProductProject, measure: TextMeasurer, opts: ValidateOptions = {}): ValidationReport {
  const dimErrors = validateDimensions(project.dimensions);
  if (dimErrors.length) {
    return finalizeReport(dimErrors.map((e) => ({ severity: "error", rule: "invalid-dimensions", page: null, componentId: e.field, message: e.message })), 0);
  }
  if (project.calendar) {
    const calErrors = validateCalendarSettings(project.calendar);
    if (calErrors.length) return finalizeReport(calErrors.map((m) => ({ severity: "error", rule: "invalid-dimensions", page: null, componentId: "calendar", message: m })), 0);
  }
  const doc = resolveDocument(project);
  const issues = validateProductLevel(doc);
  const indices = opts.pageIndices ?? doc.recipe.pages.map((_, i) => i);
  for (const i of indices) issues.push(...validatePage(doc, i, measure));
  return finalizeReport(issues, indices.length);
}

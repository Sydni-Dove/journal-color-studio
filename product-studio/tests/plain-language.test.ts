/**
 * Plain-language page check: every validation rule reads as advice a
 * stationery creator can act on, with no inch measurements or jargon in the
 * visible title. The technical message stays available under "Show details".
 */
import { describe, expect, it } from "vitest";
import { plainIssue, SEVERITY_LABEL } from "../src/components/help/plainIssues";
import type { ValidationIssue, ValidationRule } from "../src/types/validation";

const RULES: ValidationRule[] = [
  "invalid-dimensions", "negative-geometry", "safe-area", "binding-keep-out", "glue-keep-out", "bleed", "component-bounds", "text-overflow", "heading-fit", "book-structure",
  "text-too-small", "line-overflow", "grid-overflow", "calendar-overflow", "footer-collision", "page-number-collision", "layout-solver", "page-count", "printer-profile", "decoration",
  "text-collision", "layout-incompatible", "min-cell", "min-writing-area", "sidebar-balance", "decoration-clipped", "decoration-no-room", "decoration-overlap", "decoration-dead-space",
  "decoration-outside-region", "decoration-too-close", "decoration-bleed-contained", "title-rule-gap", "label-border-inset", "text-region",
];
const JARGON = /\b(gutter|cadence|recto|verso|anchor|offset|pitch|solver|keep-out|safe area|geometry|usable|trim|region width|component)\b/i;
const issue = (rule: ValidationRule, message: string, severity: ValidationIssue["severity"] = "error"): ValidationIssue => ({ rule, message, severity, page: 1, componentId: "x" });

describe("plain-language page check", () => {
  it("the user's examples", () => {
    const h = plainIssue(issue("heading-fit", 'Sidebar heading "IMPORTANT THINGS" exceeds the available heading width by 0.18" (1.40" needed, 1.22" available).'));
    expect(h.title).toBe("The heading “IMPORTANT THINGS” is too long for this box.");
    expect(h.advice).toBe("Shorten the wording, choose a smaller text size, or use a wider layout.");
    expect(plainIssue(issue("layout-incompatible", "Needs a usable area of at least 2\" × 3\"; this page has 1.8\" × 2.1\".")).title).toBe("This page style doesn't have enough room at this size.");
  });
  it("every rule gets a title with no inch measurements and no jargon, even for technical messages", () => {
    const technical = 'Component st0-x crosses the safe area by 0.183" (gutter 0.25", trim 6", solver region width 4.2").';
    for (const rule of RULES)
      for (const sev of ["error", "warning"] as const) {
        const p = plainIssue(issue(rule, technical, sev));
        expect(p.title, rule).not.toMatch(/\d\.\d+"/);
        expect(p.title, rule).not.toMatch(JARGON);
        if (p.advice) expect(p.advice, rule).not.toMatch(JARGON);
      }
  });
  it("page counts and printer notes are specific", () => {
    expect(plainIssue(issue("page-count", "Amazon KDP requires at least 24 pages; this product has 1.")).title).toBe("This printer and binding need at least 24 pages. Your product has 1.");
    expect(plainIssue(issue("printer-profile", '5.5" × 8.5" is not in Amazon KDP\'s listed trim sizes (research snapshot). Confirm before ordering.', "warning")).title).toBe("This printer doesn't list this page size.");
  });
  it("severity reads as what to do", () => {
    expect(SEVERITY_LABEL).toEqual({ error: "Needs fixing before export", warning: "Worth checking", info: "Good to know" });
  });
});

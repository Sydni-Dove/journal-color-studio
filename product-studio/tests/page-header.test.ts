/**
 * COMPOSED PAGE HEADER — step at the left, titles centred, details at the
 * right (each its own label and line), measured once; the sections start
 * below it. Headers saved before keep their stacked look.
 */
import { describe, expect, it } from "vitest";
import { geometryFor, resolveDocument, solvePage } from "../src/engines/document/resolve";
import { rectContains } from "../src/engines/layout/math";
import { heuristicMeasurer } from "../src/engines/typography/textMeasure";
import { validateProject } from "../src/engines/validation/validate";
import { step } from "../src/presets/bookRecipes";
import { createProject } from "../src/presets/products/projectFactory";
import type { LayoutNode } from "../src/types/layout";
import type { PromptSet } from "../src/types/prompts";
import { STEP_HEADERS, stepPage } from "./fixtures/propheticSteps";

import { SIZE_PRESETS } from "../src/presets/sizes/sizePresets";
/** Every page size the studio offers. */
const SIZES = SIZE_PRESETS.map((z) => z.id);
function solve(set: PromptSet, size: string) {
  const p = createProject("custom", { name: "h", dimensions: { sizePresetId: size, orientation: "portrait" }, recipe: { items: [], ordering: "sequential", structure: [step("custom", { type: "copies", count: 1 }, { layoutId: "guided-page", title: "Custom Page", promptSet: set })] } } as never);
  const doc = resolveDocument(p);
  const i = doc.recipe.pages.findIndex((x) => x.layoutId === "guided-page");
  return { doc, solved: solvePage(doc, i), g: geometryFor(doc, doc.recipe.pages[i]) };
}
const byId = (nodes: LayoutNode[], suffix: string) => nodes.find((n) => n.id.endsWith(suffix));
const overlaps = (a: LayoutNode["rect"], b: LayoutNode["rect"]) => a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.h - 1e-6 && b.y < a.y + a.h - 1e-6;

describe("composed page header: the five Prophetic Journal steps", () => {
  for (const size of SIZES)
    for (const header of STEP_HEADERS) {
      it(`${size} · ${header.title}: compact, no overlap, inside the safe area, sections below it, nothing to fix`, () => {
        const { doc, solved, g } = solve(stepPage(header), size);
        const head = solved.nodes.filter((n) => n.id.includes("-intro-") && n.type !== "group");
        const texts = head.filter((n) => n.type === "text");
        for (let a = 0; a < texts.length; a++) for (let b = a + 1; b < texts.length; b++) expect(overlaps(texts[a].rect, texts[b].rect), `${texts[a].id} × ${texts[b].id}`).toBe(false);
        const tooSmall = ["3x5", "filofax-pocket"].includes(size) && !!header.meta && header.meta.length > 2;
        // (Where the sections themselves don't fit — reported below — only the header is held to the safe area.)
        for (const n of solved.nodes.filter((n) => n.functional !== false && n.type !== "group" && (!tooSmall || n.id.includes("-intro-")))) expect(rectContains(g.safeRect, n.rect), n.id).toBe(true);
        const bottom = Math.max(...head.map((n) => n.rect.y + n.rect.h));
        const firstSection = byId(solved.nodes, "-word-title")!;
        expect(firstSection.rect.y).toBeGreaterThan(bottom);
        const small = g.safeRect.h < 6;
        // Compact: the header (with its gap) takes under 30% of the page body.
        const bodyTop = Math.min(...head.map((n) => n.rect.y));
        // Small cards and pocket inserts, and pages where the details drop below the titles, give the header a
        // larger share — never most of the page.
        const dropped = !!byId(solved.nodes, "-intro-meta0-label") && byId(solved.nodes, "-intro-meta0-label")!.rect.y > byId(solved.nodes, "-intro-title")!.rect.y + 0.1;
        if (!tooSmall) expect(firstSection.rect.y - bodyTop, `${size} header`).toBeLessThan((small ? 0.5 : dropped ? 0.4 : 0.3) * g.safeRect.h);
        // Hierarchy: the main title is the largest text; step label and details are the smallest.
        const role = (s: string) => { const t = byId(solved.nodes, s); return t?.type === "text" ? t.role : undefined; };
        expect(role("-intro-title")).toBe("monthTitle");
        expect(role("-intro-number")).toBe("weekTitle");
        expect(role("-intro-eyebrow")).toBe("label");
        if (header.overline) expect(role("-intro-overline")).toBe("label");
        // The step number and title are display type: larger than any section text.
        const ptOf = (s: string) => { const t = byId(solved.nodes, s); return t?.type === "text" ? t.fit?.sizePt ?? doc.typography.roles[t.role].sizePt : 0; };
        expect(ptOf("-intro-title")).toBeGreaterThan(doc.typography.roles.sectionHeading.sizePt * 1.5);
        expect(ptOf("-intro-number")).toBeGreaterThan(doc.typography.roles.sectionHeading.sizePt * 1.5);
        if (header.mark) expect(solved.nodes.some((n) => /-intro-mark0$/.test(n.id))).toBe(true);
        const sz = (r: string) => doc.typography.roles[r as "label"].sizePt;
        expect(sz("monthTitle")).toBeGreaterThan(sz("weekTitle"));
        expect(sz("weekTitle")).toBeGreaterThan(sz("label"));
        // The header itself never has a problem. On the two smallest cards, Receive's four details leave too
        // little room for both sections: the page says so (it is never squeezed) — the only error allowed.
        const errors = [...solved.diagnostics.filter((d) => d.severity === "error"), ...validateProject(doc.project, heuristicMeasurer).issues.filter((x) => x.severity === "error")];
        expect(errors.filter((e) => /intro|STEP|RECEIVE|DISCERN|RESPOND|WATCH|TESTIFY/.test(`${"componentId" in e ? e.componentId : ""} ${e.message}`))).toEqual([]);
        if (!tooSmall) expect(errors.map((e) => e.message), size).toEqual([]);
        else expect(errors.map((e) => e.message).filter((m) => !/writing space|page body|enough room|^(Section|WritingLines|Text|SectionHeader) crosses the safe area/.test(m)), size).toEqual([]);
      });
    }

  it("details go under the titles by default: centred across the page, below the whole header band", () => {
    for (const size of ["6x9", "7x9", "8.5x11", "5.5x8.5"]) {
      const { solved, g } = solve(stepPage(STEP_HEADERS[0]), size);
      const band = solved.nodes.filter((n) => /-intro-(eyebrow|number|overline|title|subtitle|tagline)$/.test(n.id));
      const bandBottom = Math.max(...band.map((n) => n.rect.y + n.rect.h));
      const labels = solved.nodes.filter((n) => /-intro-meta\d-label$/.test(n.id));
      const lines = solved.nodes.filter((n) => /-intro-meta\d-line$/.test(n.id));
      expect(labels).toHaveLength(4);
      for (const l of labels) expect(l.rect.y, size).toBeGreaterThanOrEqual(bandBottom - 1e-6);
      // Centred: as far from the left edge of the text area as from the right.
      const left = Math.min(...labels.map((n) => n.rect.x)) - g.safeRect.x;
      const right = g.safeRect.x + g.safeRect.w - Math.max(...lines.map((n) => n.rect.x + n.rect.w));
      expect(Math.abs(left - right), size).toBeLessThan(0.02);
    }
  });

  it("details: one label and one line each, stacked, lines aligned (never “DATE | TIME”) when put at the right", () => {
    for (const size of ["7x9", "8.5x11"]) {
      const { solved } = solve(stepPage({ ...STEP_HEADERS[0], metaPlace: "right" }), size);
      const labels = [0, 1, 2, 3].map((i) => byId(solved.nodes, `-intro-meta${i}-label`)!);
      expect(labels.map((l) => (l.type === "text" ? l.text : ""))).toEqual(["Date", "Time", "Received through", "Type"]);
      const lines = [0, 1, 2, 3].map((i) => byId(solved.nodes, `-intro-meta${i}-line`)!);
      for (const l of lines) {
        expect(l.type).toBe("rule");
        expect(l.rect.x).toBeCloseTo(lines[0].rect.x, 6);
        expect(l.rect.x + l.rect.w).toBeCloseTo(lines[0].rect.x + lines[0].rect.w, 6);
      }
      // Stacked top to bottom, right of the titles.
      for (let i = 1; i < 4; i++) expect(labels[i].rect.y).toBeGreaterThan(labels[i - 1].rect.y);
      expect(labels[0].rect.x).toBeGreaterThan(byId(solved.nodes, "-intro-title")!.rect.x);
    }
  });

  it("a narrow page moves the details below the titles as rows of blanks, inside the header region", () => {
    const { solved, g } = solve(stepPage(STEP_HEADERS[0]), "filofax-personal");
    const title = byId(solved.nodes, "-intro-title")!;
    const firstMeta = solved.nodes.find((n) => /-intro-meta0-label$/.test(n.id))!;
    expect(firstMeta.rect.y).toBeGreaterThan(title.rect.y + title.rect.h - 1e-6);
    expect(byId(solved.nodes, "-word-title")!.rect.y).toBeGreaterThan(firstMeta.rect.y + firstMeta.rect.h);
    for (const n of solved.nodes.filter((n) => n.functional !== false && n.type !== "group")) expect(rectContains(g.safeRect, n.rect), n.id).toBe(true);
  });

  it("headers saved before (step label, number, subtitle only) keep their stacked look", () => {
    const { solved } = solve({ header: { eyebrow: "STEP TWO", number: "02", subtitle: "The Word", rule: true }, blocks: [{ id: "word", label: "Write", space: "fill" }] }, "7x9");
    const e = byId(solved.nodes, "-intro-eyebrow")!, n = byId(solved.nodes, "-intro-number")!, sub = byId(solved.nodes, "-intro-subtitle")!;
    expect(e.rect.x).toBeCloseTo(n.rect.x, 6);
    expect(n.rect.x).toBeCloseTo(sub.rect.x, 6);
    expect(e.rect.y).toBeLessThan(n.rect.y);
    expect(n.rect.y).toBeLessThan(sub.rect.y);
    expect(n.type === "text" && n.role).toBe("weekTitle");
    expect(byId(solved.nodes, "-intro-meta0-label")).toBeUndefined();
  });
});

describe("section number circle and line at left", () => {
  it("a number circle sits left of its heading; the heading and prompt start after it; a line at the left sets the content in", () => {
    const { solved, g } = solve(stepPage(STEP_HEADERS[1]), "7x9");
    const badge = byId(solved.nodes, "-word-badge")!, num = byId(solved.nodes, "-word-badge-number")!, title = byId(solved.nodes, "-word-title")!, prompt = byId(solved.nodes, "-word-prompt")!;
    expect(badge.type).toBe("box");
    expect(num.type === "text" && num.text).toBe("1");
    expect(title.rect.x).toBeGreaterThan(badge.rect.x + badge.rect.w);
    expect(prompt.rect.x).toBeCloseTo(title.rect.x, 6);
    const line = byId(solved.nodes, "-word-frame")!;
    expect(line.type).toBe("rule");
    expect(line.rect.x).toBeLessThan(badge.rect.x);
    const lines = byId(solved.nodes, "-word-surface-lines")!;
    expect(lines.rect.x).toBeGreaterThan(line.rect.x);
    for (const n of solved.nodes.filter((n) => n.functional !== false && n.type !== "group")) expect(rectContains(g.safeRect, n.rect), n.id).toBe(true);
  });
});

describe("right-side mark", () => {
  // Reported on 6 × 9: the mark typed on one line with all four details dropped everything under the title.
  for (const size of ["6x9", "7x9", "5.5x8.5", "a5", "8.5x11"])
    it(`${size}: a mark typed on one line stays at the right, stacked; the details go below the band if they don't fit beside it`, () => {
      const header = { ...STEP_HEADERS[1], mark: "FROM REVELATION TO EXECUTION", meta: ["Date", "Time", "Received through", "Type"] };
      const { solved, g } = solve(stepPage(header), size);
      const title = byId(solved.nodes, "-intro-title")!;
      const lines = solved.nodes.filter((n) => /-intro-mark\d$/.test(n.id));
      expect(lines.length, size).toBeGreaterThan(1);
      for (const l of lines) expect(l.rect.x, size).toBeGreaterThanOrEqual(title.rect.x + title.rect.w - 1e-6);
      expect(lines.map((n) => (n.type === "text" ? n.text : "")).join(" ")).toBe("FROM REVELATION TO EXECUTION");
      const date = byId(solved.nodes, "-intro-meta0-label")!;
      expect(date).toBeDefined();
      const texts = solved.nodes.filter((n) => n.id.includes("-intro-") && n.type === "text");
      for (let a = 0; a < texts.length; a++) for (let b = a + 1; b < texts.length; b++) expect(overlaps(texts[a].rect, texts[b].rect), `${texts[a].id} × ${texts[b].id}`).toBe(false);
      for (const n of solved.nodes.filter((n) => n.functional !== false && n.type !== "group")) expect(rectContains(g.safeRect, n.rect), n.id).toBe(true);
      expect(byId(solved.nodes, "-word-title")!.rect.y).toBeGreaterThan(Math.max(...texts.map((t) => t.rect.y + t.rect.h)));
    });

  it("sits between two short rules: one above its first line, one below its last", () => {
    const { solved } = solve(stepPage(STEP_HEADERS[1]), "8.5x11");
    const top = byId(solved.nodes, "-intro-mark-top")!, bottom = byId(solved.nodes, "-intro-mark-bottom")!;
    const lines = solved.nodes.filter((n) => /-intro-mark\d$/.test(n.id));
    expect(lines.map((n) => (n.type === "text" ? n.text : ""))).toEqual(["FROM", "REVELATION", "TO", "EXECUTION"]);
    expect(top.rect.y).toBeLessThan(lines[0].rect.y);
    expect(bottom.rect.y).toBeGreaterThan(lines.at(-1)!.rect.y + lines.at(-1)!.rect.h - 1e-6);
  });
});

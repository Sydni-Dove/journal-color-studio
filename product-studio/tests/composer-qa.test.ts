/**
 * PAGE COMPOSER QA — real pages rebuilt from structured pieces only
 * (tests/fixtures/composerPages.ts): Project Snapshot, Revelation to
 * Execution, Master Dashboard. Plus the Phase 1 refinements: side-by-side
 * sections, section styles, info rows (1–3 blanks, line or box), graph grid,
 * checklist rows without lines. Every page: inside the safe area, no errors,
 * no overlapping sections, theme changes never move anything.
 */
import { describe, expect, it } from "vitest";
import { geometryFor, resolveDocument, solvePage } from "../src/engines/document/resolve";
import { rectContains } from "../src/engines/layout/math";
import { heuristicMeasurer } from "../src/engines/typography/textMeasure";
import { validateProject } from "../src/engines/validation/validate";
import { step } from "../src/presets/bookRecipes";
import { createProject } from "../src/presets/products/projectFactory";
import type { LayoutNode } from "../src/types/layout";
import type { PromptBlock, PromptSet } from "../src/types/prompts";
import { MASTER_DASHBOARD, PROJECT_SNAPSHOT, REVELATION_TO_EXECUTION } from "./fixtures/composerPages";

const project = (set: PromptSet, size: string, extra: Record<string, unknown> = {}) =>
  createProject("custom", {
    name: "QA",
    dimensions: { sizePresetId: size, orientation: "portrait" },
    recipe: { items: [], ordering: "sequential", structure: [step("custom", { type: "copies", count: 1 }, { id: "pg", layoutId: "guided-page", title: "", promptSet: set })] },
    ...extra,
  });

function solve(set: PromptSet, size: string, extra: Record<string, unknown> = {}) {
  const doc = resolveDocument(project(set, size, extra));
  const idx = doc.recipe.pages.map((p, i) => (p.layoutId === "guided-page" ? i : -1)).filter((i) => i >= 0);
  const pages = idx.map((i) => ({ solved: solvePage(doc, i), g: geometryFor(doc, doc.recipe.pages[i]) }));
  return { doc, pages, nodes: pages.flatMap((p) => p.solved.nodes) };
}

/** Everything drawn stays inside the safe area; no errors; sections never overlap. */
function expectClean(set: PromptSet, size: string) {
  const { doc, pages } = solve(set, size);
  for (const { solved, g } of pages) {
    for (const n of solved.nodes.filter((n) => n.functional !== false && n.type !== "group")) expect(rectContains(g.safeRect, n.rect), `${size} ${n.id}`).toBe(true);
    expect(solved.diagnostics.filter((d) => d.severity === "error"), size).toEqual([]);
    const sections = solved.nodes.filter((n) => n.type === "group" && n.component === "Section" && /^gp\d+-[^-]+$/.test(n.id));
    for (let a = 0; a < sections.length; a++)
      for (let b = a + 1; b < sections.length; b++) {
        const r = sections[a].rect, q = sections[b].rect;
        const overlap = r.x < q.x + q.w - 1e-6 && q.x < r.x + r.w - 1e-6 && r.y < q.y + q.h - 1e-6 && q.y < r.y + r.h - 1e-6;
        expect(overlap, `${size}: ${sections[a].id} overlaps ${sections[b].id}`).toBe(false);
      }
  }
  expect(validateProject(doc.project, heuristicMeasurer).issues.filter((x) => x.severity === "error"), size).toEqual([]);
  return pages.length;
}

const byId = (nodes: LayoutNode[], suffix: string) => nodes.find((n) => n.id.endsWith(suffix));
const texts = (nodes: LayoutNode[]) => nodes.flatMap((n) => (n.type === "text" ? [n.text] : []));
const SIZES = ["8.5x11", "7x9", "5.5x8.5"];

describe("Project Snapshot", () => {
  it("every size: clean; Letter fits one page", () => {
    for (const size of SIZES) expectClean(PROJECT_SNAPSHOT(), size);
    expect(solve(PROJECT_SNAPSHOT(), "8.5x11").pages).toHaveLength(1);
  });
  it("has every piece: heading, Updated + Stage / Status, paired writing areas, 3 moves, blockers / dates, notes", () => {
    const { nodes } = solve(PROJECT_SNAPSHOT(), "8.5x11");
    const t = texts(nodes);
    for (const want of ["PROJECT SNAPSHOT", "Updated", "Stage / Status", "Purpose", "Current focus", "Update", "Recently completed", "Next 3 moves", "Waiting / Blockers", "Important dates", "Notes"]) expect(t, want).toContain(want);
    expect(nodes.filter((n) => /-moves-surface-cb\d+$/.test(n.id))).toHaveLength(3);
  });
  it("side by side: same top, the second column right of the first, writing lines aligned", () => {
    const { nodes } = solve(PROJECT_SNAPSHOT(), "8.5x11");
    const a = byId(nodes, "-purpose-title")!, b = byId(nodes, "-focus-title")!;
    expect(a.rect.y).toBeCloseTo(b.rect.y, 6);
    expect(b.rect.x).toBeGreaterThan(a.rect.x + a.rect.w);
    const la = byId(nodes, "-purpose-surface-lines")!, lb = byId(nodes, "-focus-surface-lines")!;
    expect(la.type === "lines" && lb.type === "lines" && la.positions).toEqual(lb.type === "lines" && lb.positions);
  });
});

describe("Revelation to Execution", () => {
  it("every size: clean; four equal writing areas; Status and Review date on the last row", () => {
    for (const size of SIZES) expect(expectClean(REVELATION_TO_EXECUTION(), size)).toBe(1);
    const { nodes } = solve(REVELATION_TO_EXECUTION(), "7x9");
    const counts = ["received", "concerns", "discern", "next"].map((k) => {
      const n = byId(nodes, `-${k}-surface-lines`)!;
      return n.type === "lines" ? n.positions.length : 0;
    });
    expect(new Set(counts).size).toBe(1);
    expect(counts[0]).toBeGreaterThanOrEqual(3);
    const status = byId(nodes, "-status-surface-f0-label")!, date = byId(nodes, "-status-surface-f1-label")!;
    expect(status.rect.y).toBeCloseTo(date.rect.y, 6);
    expect(status.rect.y).toBeGreaterThan(byId(nodes, "-next-title")!.rect.y);
  });
});

describe("Master Dashboard", () => {
  it("every size: clean; the three column headings and every requested row", () => {
    for (const size of SIZES) expectClean(MASTER_DASHBOARD(12), size);
    const { nodes } = solve(MASTER_DASHBOARD(16), "8.5x11");
    expect(texts(nodes)).toEqual(expect.arrayContaining(["Master Dashboard", "Project / Area", "Status / Priority", "Next Step / Notes"]));
    expect(nodes.filter((n) => /-projects-surface-r\d+$/.test(n.id))).toHaveLength(16);
  });
});

describe("Phase 1 refinements", () => {
  const W: PromptBlock = { id: "w", label: "Writing", space: "fixed", lineCount: 4, responseStyle: "ruled" };
  it("section styles: framed content sits inside its frame; divider-only draws one rule between sections; colors are palette tokens", () => {
    for (const frame of ["outline", "panel", "rounded"] as const) {
      const { nodes } = solve({ blocks: [{ ...W, frame }, { ...W, id: "x", label: "Next" }] }, "7x9");
      const f = byId(nodes, "-w-frame")!, title = byId(nodes, "-w-title")!, lines = byId(nodes, "-w-surface-lines")!;
      expect(f.type).toBe("box");
      expect(rectContains(f.rect, title.rect) && rectContains(f.rect, lines.rect)).toBe(true);
      expect(title.rect.x).toBeGreaterThan(f.rect.x);
      if (f.type === "box") for (const c of [f.stroke, f.fill]) if (c) expect(["border", "accent"]).toContain(c);
    }
    const { nodes } = solve({ blocks: [{ ...W, frame: "divider" }, { ...W, id: "x", label: "Next", frame: "divider" }] }, "7x9");
    expect(nodes.filter((n) => /-divider$/.test(n.id))).toHaveLength(1);
    // The page's default applies to every section that has no style of its own.
    const all = solve({ frame: "outline", blocks: [W, { ...W, id: "x", label: "Next" }] }, "7x9").nodes;
    expect(all.filter((n) => /-frame$/.test(n.id))).toHaveLength(2);
  });
  it("info row: 1, 2 or 3 blanks; lines or open boxes; a narrow page wraps blanks to another row instead of squeezing", () => {
    for (const fields of [["Updated"], ["Project", "Date"], ["Project", "Date", "Status"]]) expectClean({ blocks: [{ id: "i", kind: "info", label: "", fields }] }, "7x9");
    const boxed = solve({ blocks: [{ id: "i", kind: "info", label: "", fields: ["Project", "Date"], fieldStyles: ["box", "line"] }] }, "7x9").nodes;
    expect(byId(boxed, "-i-surface-f0-box")?.type).toBe("box");
    expect(byId(boxed, "-i-surface-f1-line")?.type).toBe("rule");
    const narrow = solve({ blocks: [{ id: "i", kind: "info", label: "", fields: ["Project name", "Review date", "Stage / Status"] }, W] }, "filofax-personal");
    const ys = [0, 1, 2].map((k) => byId(narrow.nodes, `-i-surface-f${k}-label`)!.rect.y);
    expect(new Set(ys.map((y) => y.toFixed(4))).size).toBeGreaterThan(1);
    expectClean({ blocks: [{ id: "i", kind: "info", label: "", fields: ["Project name", "Review date", "Stage / Status"] }, W] }, "filofax-personal");
  });
  it("writing treatments: graph grid draws a grid; a checklist can drop its writing lines", () => {
    const g = solve({ blocks: [{ ...W, responseStyle: "graph-grid" }] }, "7x9").nodes;
    expect(g.some((n) => n.id.startsWith("gp") && /-w-surface-grid/.test(n.id))).toBe(true);
    const c = (taskLines?: boolean) => solve({ blocks: [{ ...W, responseStyle: "checkboxes", taskMarker: "square", taskLines }] }, "7x9").nodes;
    expect(c().some((n) => /-w-surface-lines$/.test(n.id))).toBe(true);
    expect(c(false).some((n) => /-w-surface-lines$/.test(n.id))).toBe(false);
    expect(c(false).filter((n) => /-w-surface-cb\d+$/.test(n.id))).toHaveLength(4);
  });
  it("a section beside a heading (not a writing section) stays below it", () => {
    const { nodes } = solve({ blocks: [{ id: "h", kind: "heading", label: "Title" }, { ...W, beside: true }] }, "7x9");
    expect(byId(nodes, "-w-title")!.rect.y).toBeGreaterThan(byId(nodes, "-h-title")!.rect.y);
  });
  it("a theme change moves nothing (structure is independent of Style)", () => {
    const run = (paletteId: string) => solve({ ...PROJECT_SNAPSHOT(), frame: "panel" }, "7x9", { colors: { paletteId, overrides: {} } });
    const a = run("dove-signature"), b = run("dove-blush");
    expect(JSON.stringify(a.doc.colors)).not.toBe(JSON.stringify(b.doc.colors));
    const rects = (r: typeof a) => r.nodes.map((n) => `${n.id}:${JSON.stringify(n.rect)}`);
    expect(rects(a)).toEqual(rects(b));
  });
});

describe("framed pages pass the studio's own spacing checks", () => {
  it("Project Snapshot with rounded panels: no warnings about text too close to a border", () => {
    for (const size of SIZES) {
      const doc = resolveDocument(project({ ...PROJECT_SNAPSHOT(), frame: "rounded" }, size));
      const issues = validateProject(doc.project, heuristicMeasurer).issues.filter((x) => x.rule === "label-border-inset");
      expect(issues.map((x) => x.message), size).toEqual([]);
    }
  });
});

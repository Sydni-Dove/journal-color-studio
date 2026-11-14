// Hope Journal: margin notes stay out of the writing area, sit on the outer side, and the spiral
// version keeps its binding margin; the border line at the top bleeds off the sheet.
import { describe, expect, it } from "vitest";
import { resolveDocument, solvePage, geometryFor } from "../src/engines/document/resolve";
import { BOOK_TEMPLATES } from "../src/presets/layouts/recipePresets";
import { projectFromTemplate } from "../src/components/wizard/BookTemplates";
import { HOPE_SPREADS, hopeJournalBook } from "../src/presets/hopeJournal";
import type { ProductProject } from "../src/types/project";

const template = BOOK_TEMPLATES.find((t) => t.id === "book-hope-journal")!;
function hope(spiral: boolean): ProductProject {
  const p = projectFromTemplate(template, { sizeId: "8.5x11", bindingId: spiral ? "coil" : "none", weekStart: 1, year: 2027 });
  p.production = spiral
    ? { ...p.production, bindingType: "coil", boundEdge: "left", printProfileId: "coil-generic", includeBleed: true, duplex: true, userMargins: { top: 0.25, bottom: 0.25, outside: 0.25, inside: 0.5 } }
    : { ...p.production, bindingType: "none", printProfileId: "custom", includeBleed: false, duplex: true, userMargins: { top: 0.5, bottom: 0.5, outside: 0.5, inside: 0.5 } };
  return p;
}

describe("Hope Journal", () => {
  it("30 facing hope spreads, the index facing at the back", () => {
    const doc = resolveDocument(hope(true));
    const pages = doc.recipe.pages.map((p) => `${p.recipeItemId}:${p.side}`);
    expect(pages.filter((p) => p === "hope-left:verso")).toHaveLength(HOPE_SPREADS);
    expect(pages.filter((p) => p === "hope-right:recto")).toHaveLength(HOPE_SPREADS);
    expect(pages.slice(-3)).toEqual(["hope-index:verso", "hope-index:recto", "hope-back-cover:verso"]);
    expect(pages.length).toBe(66);
    expect(doc.recipe.pages.some((p) => p.filler)).toBe(false);
  });

  it("margin notes sit in the outer margin, never over a writing line", () => {
    for (const spiral of [true, false]) {
      const doc = resolveDocument(hope(spiral));
      for (const id of ["hope-left", "hope-right"]) {
        const i = doc.recipe.pages.findIndex((p) => p.recipeItemId === id);
        const g = geometryFor(doc, doc.recipe.pages[i]);
        const nodes = solvePage(doc, i).nodes;
        const notes = nodes.filter((n) => n.id.endsWith("-margin-note"));
        expect(notes).toHaveLength(3);
        const lines = nodes.filter((n) => n.type === "lines");
        const writeL = Math.min(...lines.map((n: any) => n.rect.x)), writeR = Math.max(...lines.map((n: any) => n.rect.x + n.rect.w));
        const outerRight = g.boundEdge === "left" || (!g.boundEdge && doc.recipe.pages[i].pageNumber % 2 === 1);
        for (const n of notes as any[]) {
          if (outerRight) expect(n.rect.x).toBeGreaterThan(writeR);
          else expect(n.rect.x + n.rect.w).toBeLessThan(writeL);
        }
      }
    }
  });

  it("spiral: 1/2 in on the binding side, 1/4 in elsewhere; the top border bleeds", () => {
    const doc = resolveDocument(hope(true));
    const i = doc.recipe.pages.findIndex((p) => p.recipeItemId === "hope-left");
    const g = geometryFor(doc, doc.recipe.pages[i]);
    expect(g.mediaWidthIn).toBeCloseTo(8.75);
    expect(g.mediaHeightIn).toBeCloseTo(11.25);
    expect(g.safe.right).toBeCloseTo(0.5); // even page: bound on the right
    expect(g.safe.left).toBeCloseTo(0.25);
    expect(g.safe.top).toBeCloseTo(0.25);
    const border = solvePage(doc, i).nodes.find((n) => n.id.endsWith("-top-border")) as any;
    expect(border).toBeTruthy();
    expect(Math.min(border.x1, border.x2)).toBeLessThan(0);
    expect(Math.max(border.x1, border.x2)).toBeGreaterThan(g.trimWidthIn);
  });

  it("the template is the Hope Planner, with target dates on the steps by default", () => {
    expect(template.label).toBe("Hope Planner");
    const doc = resolveDocument(hope(false));
    const cover = doc.recipe.pages.findIndex((x) => x.recipeItemId === "hope-cover");
    expect(JSON.stringify(solvePage(doc, cover).nodes)).toContain("PLANNER");
    const right = doc.recipe.pages.findIndex((x) => x.recipeItemId === "hope-right");
    expect(solvePage(doc, right).nodes.filter((n) => /-date\d+-label$/.test(n.id))).toHaveLength(6);
  });

  it("home print: equal 1/2 in margins, no bleed", () => {
    const doc = resolveDocument(hope(false));
    const g = geometryFor(doc, doc.recipe.pages[2]);
    expect([g.mediaWidthIn, g.mediaHeightIn]).toEqual([8.5, 11]);
    expect(g.safe).toEqual({ top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 });
  });

  it("optional step dates: a 'By' blank ends each step row, clear of the writing line and the margin notes", () => {
    const p = hope(false);
    p.recipe = { items: [], ordering: "sequential", structure: hopeJournalBook(2) };
    const doc = resolveDocument(p);
    const i = doc.recipe.pages.findIndex((x) => x.recipeItemId === "hope-right");
    const nodes = solvePage(doc, i).nodes as any[];
    const labels = nodes.filter((n) => /-date\d+-label$/.test(n.id));
    const blanks = nodes.filter((n) => /-date\d+-line$/.test(n.id));
    expect(labels).toHaveLength(6);
    expect(blanks).toHaveLength(6);
    const steps = nodes.find((n) => n.type === "lines" && n.id.includes("hope-steps"));
    const note = nodes.find((n) => n.id.endsWith("hope-steps-margin-note"));
    for (const l of labels) expect(l.rect.x).toBeGreaterThan(steps.rect.x + steps.rect.w);
    for (const b of blanks) expect(Math.max(b.x1, b.x2)).toBeLessThan(note.rect.x);
    const cover = doc.recipe.pages.findIndex((x) => x.recipeItemId === "hope-cover");
    expect(JSON.stringify(solvePage(doc, cover).nodes)).toContain("PLANNER");
  });

  it("margin notes sit on a pale band the height of their section, in the margin column", () => {
    const doc = resolveDocument(hope(true));
    const i = doc.recipe.pages.findIndex((x) => x.recipeItemId === "hope-left");
    const nodes = solvePage(doc, i).nodes as any[];
    const bands = nodes.filter((n) => n.id.endsWith("-margin-shade"));
    const notes = nodes.filter((n) => n.id.endsWith("-margin-note"));
    expect(bands).toHaveLength(3);
    for (const b of bands) expect(b.fill).toBe("decorHighlight");
    notes.forEach((n, k) => {
      const b = bands[k];
      expect(n.rect.x).toBeGreaterThan(b.rect.x);
      expect(n.rect.x + n.rect.w).toBeLessThan(b.rect.x + b.rect.w);
      expect(n.rect.y).toBeGreaterThan(b.rect.y);
    });
  });
});


// Card sheets: cards to cut apart, fronts then backs placed for double-sided printing, cutting guides.
import { describe, expect, it } from "vitest";
import { resolveDocument, solvePage, geometryFor } from "../src/engines/document/resolve";
import { createProject } from "../src/presets/products/projectFactory";
import { step } from "../src/presets/bookRecipes";
import { cardAt, cardSheetPages } from "../src/layouts/book/cardSheet";
import { addCardSheet } from "../src/engines/recipe/pageBuilder";
import type { CardSheetContent } from "../src/types/recipe";

const card = (title: string, back = [{ label: "Meaning", text: `What ${title} means.` }, { label: "Scripture", text: "Romans 12:6" }]) => ({ title, front: "Romans 12", back });
const sheet = (n: number, extra: Partial<CardSheetContent> = {}): CardSheetContent => ({ cards: Array.from({ length: n }, (_, i) => card(`Gift ${i + 1}`)), ...extra });
function project(cards: CardSheetContent) {
  return createProject("worksheet", {
    dimensions: { sizePresetId: "8.5x11", orientation: "portrait" },
    production: { bindingType: "none", printProfileId: "custom", includeBleed: false, duplex: true, userMargins: { top: 0.5, bottom: 0.5, outside: 0.5, inside: 0.5 } },
    recipe: { items: [], ordering: "sequential", structure: [step("custom", { type: "once" }, { id: "cards", layoutId: "card-sheet", title: "Cards", cards } as never)] },
  });
}
const texts = (doc: ReturnType<typeof resolveDocument>, i: number) => solvePage(doc, i).nodes.filter((n) => n.type === "text").map((n) => (n as { text: string }).text);

describe("card sheet", () => {
  it("pages: a page of fronts and its page of backs for every 4 cards; fronts only when single-sided", () => {
    expect(cardSheetPages(sheet(4))).toBe(2);
    expect(cardSheetPages(sheet(9))).toBe(6);
    expect(cardSheetPages(sheet(9, { doubleSided: false }))).toBe(3);
    expect(cardSheetPages(sheet(9, { perSheet: 8 }))).toBe(4);
    expect(cardSheetPages(sheet(0))).toBe(2);
    expect(resolveDocument(project(sheet(6))).recipe.pages).toHaveLength(4);
  });

  it("each back prints behind its own front: columns swap for a long-edge flip, rows for a short-edge flip", () => {
    const c = sheet(4);
    // Front page 0: [1 2 / 3 4]. Back page 1 (long edge): [2 1 / 4 3].
    expect([0, 1].flatMap((r) => [0, 1].map((k) => cardAt(c, 0, r, k)))).toEqual([0, 1, 2, 3]);
    expect([0, 1].flatMap((r) => [0, 1].map((k) => cardAt(c, 1, r, k)))).toEqual([1, 0, 3, 2]);
    const s = { ...c, flip: "short-edge" as const };
    expect([0, 1].flatMap((r) => [0, 1].map((k) => cardAt(s, 1, r, k)))).toEqual([2, 3, 0, 1]);
    // In the solved pages: the back's top-left card is card 2's back.
    const doc = resolveDocument(project(c));
    const back = solvePage(doc, 1).nodes.find((n) => n.id.endsWith("-title") && n.type === "text") as { id: string; text: string; rect: { x: number } };
    expect(back.text).toBe("Gift 2");
    expect(texts(doc, 0)).toEqual(expect.arrayContaining(["Gift 1", "Gift 2", "Gift 3", "Gift 4", "Romans 12"]));
    expect(texts(doc, 1)).toEqual(expect.arrayContaining(["Meaning", "What Gift 1 means.", "Scripture", "Romans 12:6"]));
  });

  it("cutting guides: a dashed line round every card and trim marks in the margins, none inside the cards", () => {
    const doc = resolveDocument(project(sheet(3)));
    const g = geometryFor(doc, doc.recipe.pages[0]);
    const nodes = solvePage(doc, 0).nodes as { id: string; type: string; dashIn?: number[]; x1: number; y1: number; x2: number; y2: number; functional: boolean }[];
    const dashed = nodes.filter((n) => n.type === "rule" && n.dashIn);
    const marks = nodes.filter((n) => n.type === "rule" && n.id.includes("-mark-"));
    expect(dashed).toHaveLength(3 * 4); // three cards on this page, four sides each
    expect(marks.length).toBeGreaterThan(0);
    for (const m of marks) {
      const inside = Math.min(m.x1, m.x2) > g.safeRect.x + 1e-6 && Math.max(m.x1, m.x2) < g.safeRect.x + g.safeRect.w - 1e-6 && Math.min(m.y1, m.y2) > g.safeRect.y + 1e-6 && Math.max(m.y1, m.y2) < g.safeRect.y + g.safeRect.h - 1e-6;
      expect(inside).toBe(false);
      expect(m.functional).toBe(false);
    }
    // The empty fourth slot draws nothing.
    expect(nodes.some((n) => n.id.includes("card4"))).toBe(false);
  });

  it("a back too long for its card: smaller type first, then the part is left out and reported, never drawn past the card", () => {
    const long = Array.from({ length: 12 }, (_, i) => ({ label: `Part ${i + 1}`, text: "A long explanation that keeps going and going so it needs several lines on a small card. ".repeat(2) }));
    const doc = resolveDocument(project({ cards: [card("Too much", long)], perSheet: 8 }));
    const solved = solvePage(doc, 1);
    expect(solved.diagnostics.some((d) => d.rule === "card-back-fit" && /doesn't fit on the back/.test(d.message))).toBe(true);
    const cell = solved.nodes.find((n) => n.id === "cs1-card1")!.rect;
    for (const n of solved.nodes.filter((x) => x.id.startsWith("cs1-card1-b") && x.type === "text")) expect(n.rect.y + n.rect.h).toBeLessThanOrEqual(cell.y + cell.h + 1e-6);
  });

  it("+ Card sheet adds four starter cards on a right-hand page, before the end cover", () => {
    const nodes = addCardSheet([step("cover-page", { type: "once" }, { id: "c" }), step("back-cover", { type: "once" }, { id: "b" })]);
    const added = nodes[1] as { layoutId: string; start: string; cards: CardSheetContent };
    expect(added.layoutId).toBe("card-sheet");
    expect(added.start).toBe("recto");
    expect(added.cards.cards).toHaveLength(4);
    expect(nodes.at(-1)!.id).toBe("b");
  });
});

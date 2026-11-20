/**
 * Review fixes for the Coloring Book: the page's words print in black (never the palette's maroon), the
 * print-sharpness number is one measurement everywhere and follows the verse size, and the picture stays between
 * the title and verse whatever size the verse is.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDocument, solvePage, artworkFor } from "../src/engines/document/resolve";
import { coloringBrief, newBook, type ColoringBook } from "../src/engines/coloringBook/book";
import { assembleInterior, briefFor } from "../src/engines/coloringBook/assembleBook";
import { illustrationPpi } from "../src/engines/cover/assemble";
import { whatsMissing } from "../src/engines/coloringBook/missing";

beforeEach(() => {
  const m = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) });
});

// A tall picture: the room between the title and verse is what limits its size.
const book = (textSizePt = 18, picture = { w: 1800, h: 2400 }): ColoringBook => {
  const scenes = [{ id: "s1", title: "Brave", scriptureRef: "Joshua 1:9", verseText: "Have not I commanded thee? Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.", verseApproved: "x", illustrationId: "a".repeat(64), illustrationName: "brave.png", illustrationW: picture.w, illustrationH: picture.h, approvedAt: "x" } as never];
  const b = newBook("b", { name: "Gracious Ballerinas", faithBased: true, content: { title: true, scripture: "full", lesson: false, customText: false }, brief: coloringBrief({ title: "Gracious Ballerinas", translation: "KJV", scenes }) });
  return { ...b, brief: { ...b.brief, pageTypography: { ...b.brief.pageTypography, textSizePt } } };
};
const page = (b: ColoringBook) => {
  const doc = resolveDocument(assembleInterior(b));
  const i = doc.recipe.pages.findIndex((p) => p.recipeItemId === "scene-s1");
  return { doc, i, nodes: solvePage(doc, i).nodes as { id: string; type: string; color?: string; rect: { x: number; y: number; w: number; h: number } }[] };
};

describe("black-and-white pages print their words in black", () => {
  it("the title and verse are black ink, not the palette's maroon", () => {
    const { doc, nodes } = page(book());
    const title = nodes.find((n) => n.id.endsWith("-title-title"))!;
    const verse = nodes.find((n) => n.id.endsWith("-verse-prompt"))!;
    for (const n of [title, verse]) expect(doc.colors[(n.color ?? "text") as keyof typeof doc.colors]).toBe("#000000");
  });
});

describe("print sharpness: one number, at the current verse size", () => {
  it("What's Missing and the page's own check show the same number, measured where the page draws the picture", () => {
    const b = book();
    const { doc, i } = page(b);
    const art = artworkFor(doc, i).find((a) => a.use === "background")!;
    const drawn = Math.round(Math.min(1800 / art.draw.w, 2400 / art.draw.h));
    expect(illustrationPpi(briefFor(b), b.brief.scenes[0])).toBe(drawn);
    const issue = whatsMissing(b).find((x) => x.id === "ppi-s1");
    expect(issue?.detail).toContain(`${drawn} pixels per inch`);
  });

  it("a bigger verse leaves less room, so the picture is drawn smaller and the number goes up", () => {
    const small = illustrationPpi(briefFor(book(12)), book(12).brief.scenes[0])!;
    const big = illustrationPpi(briefFor(book(20)), book(20).brief.scenes[0])!;
    expect(big).toBeGreaterThan(small);
    expect(whatsMissing(book(20)).find((x) => x.id === "ppi-s1")?.detail).toContain(`${big} pixels`);
  });

  it("whatever the verse size, the picture stays between the title and verse", () => {
    for (const size of [12, 18, 20]) {
      const { doc, i, nodes } = page(book(size));
      const art = artworkFor(doc, i).find((a) => a.use === "background")!;
      // Coloring book pages have no bleed, so the drawn picture and the words share one set of coordinates.
      const top = art.draw.y, bottom = art.draw.y + art.draw.h;
      for (const n of nodes.filter((x) => x.type === "text")) {
        const overlaps = top < n.rect.y + n.rect.h - 1e-6 && n.rect.y < bottom - 1e-6;
        expect(overlaps, `${size} pt: picture overlaps ${n.id}`).toBe(false);
      }
    }
  });
});

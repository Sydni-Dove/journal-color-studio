/**
 * Bubble letters to color (Brave Ballerinas sample): title, verse and reference at the bottom under the picture, in
 * chunky outlined letters with hearts and bursts, black outlines only; full verse or a short KJV excerpt; the
 * elegant style stays as it was.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { resolveDocument, solvePage, pictureAreaOf } from "../src/engines/document/resolve";
import { coloringBrief, newBook, type ColoringBook } from "../src/engines/coloringBook/book";
import { assembleInterior } from "../src/engines/coloringBook/assembleBook";
import { excerptFromVerse } from "../src/engines/cover/assemble";
import { whatsMissing } from "../src/engines/coloringBook/missing";
import { normalizeBook } from "../src/persistence/coloringBookStore";
import { TextBlock } from "../src/primitives/nodes";
import { BUBBLE_FONT } from "../src/layouts/book/coloringLettering";
import type { TextNode } from "../src/types/layout";

beforeEach(() => {
  const m = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) });
});

const JOSHUA = "Have not I commanded thee? Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.";
const EXCERPT = "Be strong and of a good courage; be not afraid.";
const book = (over: Record<string, unknown> = {}, style: "bubble" | "elegant" = "bubble", translation: "KJV" | "NIV" = "KJV"): ColoringBook => {
  const scenes = [{ id: "s1", title: "Brave", scriptureRef: "Joshua 1:9", verseText: JOSHUA, verseApproved: "x", ...over } as never];
  const b = newBook("b", { name: "Brave Ballerinas", faithBased: true, content: { title: true, scripture: "full", lesson: false, customText: false }, brief: coloringBrief({ title: "Brave Ballerinas", translation, scenes }) });
  return { ...b, brief: { ...b.brief, pageTypography: { ...b.brief.pageTypography, ...(style === "bubble" ? { letterStyle: "bubble" as const } : {}) } } };
};
const page = (b: ColoringBook) => {
  const doc = resolveDocument(assembleInterior(b));
  const i = doc.recipe.pages.findIndex((p) => p.recipeItemId === "scene-s1");
  const s = solvePage(doc, i);
  const text = (id: string) => s.nodes.find((n) => n.id === id) as TextNode | undefined;
  return { doc, i, s, text };
};

describe("bubble letters to color", () => {
  it("title, then verse, then reference, all at the bottom under the picture", () => {
    const { doc, i, text } = page(book({ verseUse: "excerpt", verseExcerpt: EXCERPT }));
    const title = text("cl-title-title")!, verse = text("cl-verse-prompt")!, ref = text("cl-ref")!;
    expect(title.text).toBe("Brave");
    expect(verse.text).toBe(EXCERPT);
    expect(ref.text).toBe("Joshua 1:9");
    expect(title.rect.y + title.rect.h).toBeLessThanOrEqual(verse.rect.y + 1e-6);
    expect(verse.rect.y + verse.rect.h).toBeLessThanOrEqual(ref.rect.y + 1e-6);
    // The picture runs down to the lettering and tucks slightly behind the title, no big gap.
    const art = pictureAreaOf(doc, i)!;
    expect(art.y + art.h).toBeGreaterThan(title.rect.y);
    expect(art.y + art.h - title.rect.y).toBeLessThan(0.3);
    // Very large title, smaller verse, smaller reference.
    expect(title.fit!.sizePt).toBeGreaterThan(verse.fit!.sizePt);
    expect(verse.fit!.sizePt).toBeGreaterThan(ref.fit!.sizePt);
    expect(verse.fit!.lines.length).toBeGreaterThanOrEqual(2);
    expect(verse.fit!.lines.length).toBeLessThanOrEqual(4);
  });

  it("chunky outlined letters, black outlines with white inside; no dash; no maroon or gray", () => {
    const { s, text, doc } = page(book({ verseUse: "excerpt", verseExcerpt: EXCERPT }));
    for (const id of ["cl-title-title", "cl-verse-prompt"]) {
      const n = text(id)!;
      expect(n.outline).toBe(true);
      expect(n.family).toBe(BUBBLE_FONT);
      const html = renderToStaticMarkup(createElement(TextBlock, { node: n, typography: doc.typography }));
      expect(html).toMatch(/color:#ffffff/);
      expect(html).toMatch(/-webkit-text-stroke:[\d.]+pt #000000/);
    }
    expect(s.nodes.map((n) => (n as TextNode).text ?? "").join(" ")).not.toContain("—");
    expect(doc.colors.text).toBe("#000000");
    expect(doc.colors.primary).toBe("#000000");
  });

  it("an outlined heart each side of the title, hearts at the ends of the reference lines, bursts beside the verse", () => {
    const { s, text } = page(book({ verseUse: "excerpt", verseExcerpt: EXCERPT }));
    const hearts = s.nodes.filter((n) => (n as TextNode).glyph === "heart");
    expect(hearts.map((h) => h.id).sort()).toEqual(["cl-ref-heart-l", "cl-ref-heart-r", "cl-title-heart-l", "cl-title-heart-r"]);
    const html = renderToStaticMarkup(createElement(TextBlock, { node: hearts[0] as TextNode, typography: page(book()).doc.typography }));
    expect(html).toMatch(/fill="#ffffff" stroke="#000000"/);
    const title = text("cl-title-title")!;
    const th = hearts.filter((h) => h.id.startsWith("cl-title"));
    expect(th[0].rect.x + th[0].rect.w).toBeLessThanOrEqual(title.rect.x);
    expect(th[1].rect.x).toBeGreaterThanOrEqual(title.rect.x + title.rect.w);
    expect(s.nodes.filter((n) => n.id.startsWith("cl-burst-l")).length).toBe(3);
    expect(s.nodes.filter((n) => n.id.startsWith("cl-burst-r")).length).toBe(3);
    expect(s.nodes.filter((n) => /^cl-ref-line-[lr]$/.test(n.id)).length).toBe(2);
  });

  it("the full verse fits on up to four lines; a short excerpt is the verse's own words", () => {
    const full = page(book()).text("cl-verse-prompt")!;
    expect(full.text).toBe(JOSHUA);
    expect(full.fit!.lines.length).toBeLessThanOrEqual(4);
    expect(excerptFromVerse(EXCERPT, JOSHUA)).toBe(true);
    expect(excerptFromVerse("Be strong and brave; be not afraid.", JOSHUA)).toBe(false);
    expect(whatsMissing(book({ verseUse: "excerpt", verseExcerpt: "Be strong and brave" })).find((x) => x.id === "excerpt-s1")?.severity).toBe("blocking");
    expect(whatsMissing(book({ verseUse: "excerpt", verseExcerpt: EXCERPT })).find((x) => x.id === "excerpt-s1")).toBeUndefined();
  });

  it("excerpts are KJV only: another translation prints its full approved wording and says so", () => {
    const niv = book({ verseUse: "excerpt", verseExcerpt: EXCERPT }, "bubble", "NIV");
    expect(page(niv).text("cl-verse-prompt")!.text).toBe(JOSHUA);
    expect(whatsMissing(niv).find((x) => x.id === "excerpt-s1")?.title).toMatch(/KJV only/);
  });

  it("the elegant style stays available and unchanged in layout", () => {
    const { doc, i, s } = page(book({}, "elegant"));
    expect(s.nodes.some((n) => n.id.startsWith("cl-"))).toBe(false);
    expect(s.nodes.some((n) => n.id.endsWith("-verse-prompt"))).toBe(true);
    expect(pictureAreaOf(doc, i)).not.toBeNull();
  });

  it("the style and the excerpt are kept when the book is saved and reopened", () => {
    const b = normalizeBook(JSON.parse(JSON.stringify(book({ verseUse: "excerpt", verseExcerpt: EXCERPT }))))!;
    expect(b.brief.pageTypography.letterStyle).toBe("bubble");
    expect(b.brief.scenes[0].verseUse).toBe("excerpt");
    expect(b.brief.scenes[0].verseExcerpt).toBe(EXCERPT);
  });
});

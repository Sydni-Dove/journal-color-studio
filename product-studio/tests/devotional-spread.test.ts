/**
 * Devotional Spread (engines/coloringBook/spread.ts, layouts/book/devotionalMommy.ts), on a sample of “Mommy & Me:
 * Growing With God Together”: facing pages in print order, per-page lettering and text off, the Mommy page's
 * activity column (and bottom band), the answer check, translation labels, the NIV permission block, the mirrored
 * binding margin, the QR placeholder, the 2550 × 3300 image check, Art Prompts and saving.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { assembleInterior, bookStructure, bookWords, printedReferences } from "../src/engines/coloringBook/assembleBook";
import { GIRL_1, newBook } from "../src/engines/coloringBook/book";
import { printReady, whatsMissing } from "../src/engines/coloringBook/missing";
import { answerProblems, blankPrinted, containsAnswer, isWholePage, newSpread, spreadArtPrompt } from "../src/engines/coloringBook/spread";
import { briefFor } from "../src/engines/coloringBook/assembleBook";
import { pageBlocks, sceneLayoutId } from "../src/engines/cover/assemble";
import { artworkFor, geometryFor, resolveDocument, solvePage } from "../src/engines/document/resolve";
import { normalizeBook } from "../src/persistence/coloringBookStore";
import type { Scene } from "../src/engines/cover/brief";
import type { ColoringBook } from "../src/engines/coloringBook/book";
import { mommyAndMe, SPREAD_1, SPREAD_2 } from "./fixtures/mommyAndMe";

beforeEach(() => {
  const m = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) });
});

const withArt = (s: Scene, w = 2550, h = 3300): Scene => ({
  ...s, illustrationId: `d-${s.id}`, illustrationName: "d.png", illustrationW: w, illustrationH: h, approvedAt: "2026-11-25",
  mommy: { ...s.mommy!, illustrationId: `m-${s.id}`, illustrationName: "m.png", illustrationW: w, illustrationH: h, approvedAt: "2026-11-25" },
});
const pageOf = (book: ColoringBook, item: string) => {
  const doc = resolveDocument(assembleInterior(book));
  const i = doc.recipe.pages.findIndex((p) => p.recipeItemId === item);
  return { doc, i, page: doc.recipe.pages[i], solved: solvePage(doc, i) };
};
const texts = (book: ColoringBook, item: string) => pageOf(book, item).solved.nodes.filter((n) => n.type === "text").map((n) => (n as { text: string }).text);
const setSpread = (b: ColoringBook, k: number, patch: Partial<Scene>): ColoringBook => ({ ...b, brief: { ...b.brief, scenes: b.brief.scenes.map((s, j) => (j === k ? { ...s, ...patch } : s)) } });
const setMommy = (b: ColoringBook, k: number, patch: Partial<NonNullable<Scene["mommy"]>>) => setSpread(b, k, { mommy: { ...b.brief.scenes[k].mommy!, ...patch } });

describe("Facing pages in print order", () => {
  it("the daughter page is always a left-hand page and the Mommy page faces it", () => {
    for (const fm of [{ titlePage: true, copyrightPage: true, belongsTo: false }, { titlePage: true, copyrightPage: false, belongsTo: false }, { titlePage: false, copyrightPage: false, belongsTo: false }]) {
      const book = mommyAndMe({ printFormat: "kdp-paperback", frontMatter: fm });
      const doc = resolveDocument(assembleInterior(book));
      for (const s of book.brief.scenes) {
        const l = doc.recipe.pages.find((p) => p.recipeItemId === `scene-${s.id}`)!;
        const r = doc.recipe.pages.find((p) => p.recipeItemId === `mommy-${s.id}`)!;
        expect(l.pageNumber % 2).toBe(0);
        expect(r.pageNumber).toBe(l.pageNumber + 1);
        expect(l.side).toBe("verso");
        expect(r.side).toBe("recto");
      }
    }
  });

  it("adds one blank page before a spread only when needed, and no blank backs inside a spread", () => {
    const steps = bookStructure(mommyAndMe({ sides: "single" })).map((s) => s.id);
    expect(steps).toEqual(["front-title", "front-copyright", "pad-wonderful", "scene-wonderful", "mommy-wonderful", "scene-first", "mommy-first"]);
  });

  it("the page added before a spread is truly blank (no writing lines)", () => {
    const { solved } = pageOf(mommyAndMe({ sides: "single" }), "pad-wonderful");
    expect(solved.nodes.filter((n) => n.type === "lines" || n.type === "text")).toEqual([]);
  });

  it("standard scenes keep their own pages and blank backs beside spreads", () => {
    const plain: Scene = { id: "plain", title: "Praying", text: "", pageTitle: "Praying" };
    const steps = bookStructure(mommyAndMe({ sides: "single" }, [plain, SPREAD_1])).map((s) => s.id);
    expect(steps).toEqual(["front-title", "front-copyright", "scene-plain", "back-plain", "pad-wonderful", "scene-wonderful", "mommy-wonderful"]);
  });
});

describe("The binding margin mirrors on left and right pages", () => {
  it("the gutter is on the right of the daughter page and on the left of the Mommy page", () => {
    const book = mommyAndMe({ printFormat: "kdp-paperback", brief: { ...mommyAndMe().brief, gutter: 0.75 } });
    const { doc } = pageOf(book, "scene-wonderful");
    const at = (item: string) => {
      const i = doc.recipe.pages.findIndex((p) => p.recipeItemId === item);
      return geometryFor(doc, doc.recipe.pages[i], i);
    };
    const left = at("scene-wonderful"), right = at("mommy-wonderful");
    expect(left.safeInsideIn).toBeGreaterThanOrEqual(0.75);
    expect(right.safeInsideIn).toBeGreaterThanOrEqual(0.75);
    // Left page: binding on the right edge. Right page: binding on the left edge.
    expect(left.safeRect.x).toBeCloseTo(0.25, 2);
    expect(right.safeRect.x).toBeCloseTo(0.75, 2);
  });

  it("the Mommy page's art sits on the inner (binding) side and the activities on the outer side", () => {
    const { solved, page } = pageOf(mommyAndMe({ printFormat: "kdp-paperback" }), "mommy-wonderful");
    expect(page.side).toBe("recto");
    const art = solved.nodes.find((n) => n.id === "dm-art")!;
    const label = solved.nodes.find((n) => n.id === "dm-h-read")!;
    expect(art.rect.x).toBeLessThan(label.rect.x);
    // About 65% of the width.
    expect(art.rect.w / (art.rect.w + 0.2 + label.rect.w)).toBeCloseTo(0.65, 2);
  });
});

describe("Per-page lettering and text off", () => {
  it("a bubble daughter page faces an elegant script Mommy page", () => {
    const { solved: d } = pageOf(mommyAndMe(), "scene-wonderful");
    expect(d.nodes.some((n) => n.id === "cl-title-title" && (n as { outline?: boolean }).outline)).toBe(true);
    const { solved: m } = pageOf(mommyAndMe(), "mommy-wonderful");
    expect((m.nodes.find((n) => n.id === "dm-title-title") as { family: string }).family).toBe("Great Vibes");
  });

  it("the daughter page's words go across the top, within about the top quarter", () => {
    const { solved } = pageOf(mommyAndMe(), "scene-wonderful");
    const ref = solved.nodes.find((n) => n.id === "cl-ref")!;
    expect(ref.rect.y + ref.rect.h).toBeLessThan(11 * 0.25);
    expect(solved.nodes.find((n) => n.id === "cl-art")!.rect.y).toBeGreaterThan(ref.rect.y);
  });

  it("an elegant daughter page puts its title and verse above the picture", () => {
    const t = texts(mommyAndMe(), "scene-first");
    expect(t.join(" ")).toContain("We love him, because he first loved us.");
  });

  it("text off hides the app's words on that page only", () => {
    const off = setSpread(mommyAndMe(), 0, { textOff: true });
    expect(texts(off, "scene-wonderful").filter((x) => x.trim())).toEqual([]);
    expect(texts(off, "scene-first").join(" ")).toContain("We love him");
    // Mommy page 2 has its declaration drawn into the art (text off): no declaration, the activities stay.
    const m2 = texts(mommyAndMe(), "mommy-first");
    expect(m2).not.toContain("Love is patient, love is kind");
    expect(m2).toContain("READ THE WORD");
  });

  it("a standard page can choose its own lettering; the book-wide setting stays the default", () => {
    const book = mommyAndMe();
    const b = briefFor(book);
    const plain: Scene = { id: "p", title: "Praying", text: "", pageTitle: "Praying" };
    expect(sceneLayoutId(b, plain)).toBe("guided-page");
    expect(sceneLayoutId(b, { ...plain, letterStyle: "bubble" })).toBe("coloring-lettering");
    const bubbleBook = { ...b, pageTypography: { ...b.pageTypography, letterStyle: "bubble" as const } };
    expect(sceneLayoutId(bubbleBook, plain)).toBe("coloring-lettering");
    expect(sceneLayoutId(bubbleBook, { ...plain, letterStyle: "elegant" })).toBe("guided-page");
    expect(pageBlocks(b, { ...plain, textOff: true }).map((x) => x.id)).toEqual(["art"]);
  });
});

describe("The Mommy page's activity column", () => {
  it("has the four labelled sections, botanical separators and soft outlined panels", () => {
    const { solved } = pageOf(mommyAndMe(), "mommy-wonderful");
    const t = solved.nodes.filter((n) => n.type === "text").map((n) => (n as { text: string }).text);
    for (const h of ["READ THE WORD", "FILL IN THE BLANK", "LISTEN & REFLECT", "HEART TO HEART"]) expect(t).toContain(h);
    expect(solved.nodes.filter((n) => (n as { glyph?: string }).glyph === "sprig")).toHaveLength(3);
    const panels = solved.nodes.filter((n) => /^dm-read-\d-panel$/.test(n.id)) as { strokeHex?: string; radiusIn: number }[];
    expect(panels).toHaveLength(3);
    expect(panels.every((p) => p.strokeHex && p.radiusIn > 0)).toBe(true);
    // Listen & Reflect: its writing lines.
    expect(solved.nodes.filter((n) => /^dm-reflect-line-\d$/.test(n.id))).toHaveLength(4);
    expect(solved.diagnostics.filter((d) => d.componentId === "dm-column")).toEqual([]);
  });

  it("never prints the answers; each blank prints as a write-on line with its reference", () => {
    const t = texts(mommyAndMe(), "mommy-wonderful");
    expect(t).toContain("1. I am fearfully and ______________ made.");
    expect(t.filter((x) => /^\d\. /.test(x)).join(" ")).not.toMatch(/wonderfully|image|marvellous/);
    expect(blankPrinted("God is love")).toBe("God is love ______________");
  });

  it("labels paraphrases; exact quotes name the translation (the KJV prints its reference alone)", () => {
    const t = texts(mommyAndMe(), "mommy-wonderful");
    expect(t).toContain("Psalm 139:13 · paraphrase");
    expect(t).toContain("Psalm 139:14");
    const web = mommyAndMe({ brief: { ...mommyAndMe().brief, translation: "WEB" } });
    expect(texts(web, "mommy-wonderful")).toContain("Genesis 1:27 (WEB)");
  });

  it("the QR placeholder is a reserved, labelled box: no code and no link", () => {
    const { solved } = pageOf(mommyAndMe(), "mommy-wonderful");
    expect(solved.nodes.find((n) => n.id === "dm-qr")?.type).toBe("box");
    expect(texts(mommyAndMe(), "mommy-wonderful")).toContain("QR code here");
    expect(JSON.stringify(solved.nodes)).not.toMatch(/https?:\/\//);
    expect(pageOf(setMommy(mommyAndMe(), 0, { qr: false }), "mommy-wonderful").solved.nodes.some((n) => n.id === "dm-qr")).toBe(false);
  });

  it("the split, sizes and line spacing are adjustable", () => {
    const wide = pageOf(mommyAndMe({ spread: { split: 0.75, headingPt: 10.5, bodyPt: 9.5, lineSpacingIn: 0.3 } }), "mommy-wonderful").solved;
    const std = pageOf(mommyAndMe(), "mommy-wonderful").solved;
    expect(wide.nodes.find((n) => n.id === "dm-art")!.rect.w).toBeGreaterThan(std.nodes.find((n) => n.id === "dm-art")!.rect.w);
    const big = pageOf(mommyAndMe({ spread: { split: 0.65, headingPt: 10.5, bodyPt: 11, lineSpacingIn: 0.375 } }), "mommy-wonderful").solved;
    expect((big.nodes.find((n) => n.id === "dm-heart") as { fit: { sizePt: number } }).fit.sizePt).toBe(11);
    const gap = (s: typeof std) => { const l = s.nodes.filter((n) => /^dm-reflect-line-/.test(n.id)).map((n) => n.rect.y); return l[1] - l[0]; };
    expect(gap(big)).toBeCloseTo(0.375, 3);
    expect(gap(std)).toBeCloseTo(0.3, 3);
  });

  it("the bottom band: the art across the top, the activities in two columns underneath", () => {
    const { solved } = pageOf(mommyAndMe(), "mommy-first");
    const art = solved.nodes.find((n) => n.id === "dm-art")!;
    const read = solved.nodes.find((n) => n.id === "dm-h-read")!;
    const heart = solved.nodes.find((n) => n.id === "dm-h-heart")!;
    expect(art.rect.w).toBeGreaterThan(7);
    expect(read.rect.y).toBeGreaterThan(art.rect.y + art.rect.h);
    expect(Math.abs(read.rect.x - heart.rect.x)).toBeGreaterThan(2);
  });

  it("activities that don't fit block export, with ways to fix them", () => {
    const long = setMommy(mommyAndMe(), 0, { reflect: { question: "A very long question ".repeat(40), lines: 8 } });
    const issue = whatsMissing(long).find((i) => i.id === "mommy-fit-wonderful");
    expect(issue?.severity).toBe("blocking");
  });
});

describe("Answer check", () => {
  it("warns when a blank's answer word is missing from that page's printed excerpts", () => {
    expect(answerProblems(SPREAD_1)).toEqual([]);
    expect(answerProblems(SPREAD_2)).toEqual([{ index: 1, answer: "patient", kind: "missing" }]);
    const w = whatsMissing(mommyAndMe()).find((i) => i.id === "answer-first-2");
    expect(w?.severity).toBe("warning");
    expect(w?.title).toContain("patient");
    expect(containsAnswer("Charity suffereth long", "suffereth long")).toBe(true);
    expect(containsAnswer("Charity suffereth long", "suffer")).toBe(false);
  });
});

describe("Translation and permission", () => {
  it("the KJV book exports with no permission needed", () => {
    const book = mommyAndMe({ brief: { ...mommyAndMe().brief, scenes: [withArt(SPREAD_1), withArt(SPREAD_2)] }, cover: { mode: "with-title", backText: "", front: { id: "c", name: "c.png", w: 2550, h: 3300 }, approved: "x" } });
    const issues = whatsMissing(book);
    expect(issues.filter((i) => i.severity === "blocking")).toEqual([]);
    expect(printReady(issues)).toBe(true);
  });

  it("NIV stays blocked until permission is recorded", () => {
    const base = mommyAndMe({ brief: { ...mommyAndMe().brief, translation: "NIV", scenes: [withArt(SPREAD_1), withArt(SPREAD_2)] }, cover: { mode: "with-title", backText: "", front: { id: "c", name: "c.png", w: 2550, h: 3300 }, approved: "x" } });
    const lic = whatsMissing(base).find((i) => i.id === "license");
    expect(lic?.severity).toBe("blocking");
    expect(lic?.title).toContain("NIV");
    expect(whatsMissing({ ...base, scripturePermission: true }).some((i) => i.id === "license")).toBe(false);
  });

  it("the Mommy page's exact quotes count as Scripture; paraphrases and reflections don't", () => {
    const refs = printedReferences(mommyAndMe());
    expect(refs).toEqual(expect.arrayContaining(["Psalm 139:14", "Genesis 1:27", "1 John 4:19", "1 Corinthians 13:4"]));
    expect(refs).not.toContain("Psalm 139:13");
    const w = bookWords(mommyAndMe());
    expect(w.scripture).toBeGreaterThan(30);
    expect(w.total).toBeGreaterThan(w.scripture);
  });
});

describe("Images", () => {
  it("warns when an image is below 2550 × 3300 pixels, on either page", () => {
    const small = mommyAndMe({ brief: { ...mommyAndMe().brief, scenes: [withArt(SPREAD_1, 1024, 1536)] } });
    const ids = whatsMissing(small).filter((i) => i.severity === "warning").map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(["size-wonderful", "mommy-size-wonderful"]));
    const ok = mommyAndMe({ brief: { ...mommyAndMe().brief, scenes: [withArt(SPREAD_1)] } });
    expect(whatsMissing(ok).some((i) => /size-/.test(i.id))).toBe(false);
  });

  it("a whole-page image fills its page; any other is fitted to the Mommy page's art side", () => {
    expect(isWholePage(2550, 3300)).toBe(true);
    expect(isWholePage(1024, 1536)).toBe(false);
    const fitted = mommyAndMe({ brief: { ...mommyAndMe().brief, scenes: [withArt(SPREAD_1, 2000, 2000)] } });
    const { doc, i, solved } = pageOf(fitted, "mommy-wonderful");
    const art = artworkFor(doc, i)[0];
    const area = solved.nodes.find((n) => n.id === "dm-art")!.rect;
    expect(art.box.x).toBeCloseTo(area.x, 2);
    expect(art.box.w).toBeCloseTo(area.w, 2);
  });
});

describe("Art Prompts", () => {
  const book = mommyAndMe();
  const b = briefFor(book);

  it("daughter page: style lock, ages 4–8, one girl with Jesus, the character word for word, and the closing line", () => {
    const p = spreadArtPrompt(book, b, SPREAD_1, "daughter");
    expect(p).toContain("Pure black line art on pure white. No gray, no shading, no gradients, no shadows and no solid black fills.");
    expect(p).toContain("Portrait 8.5 x 11 inches, one page per image. Keep a clear half-inch margin on every side.");
    expect(p).toContain("Thick rounded outlines and large coloring spaces for ages 4 to 8.");
    expect(p).toContain("One girl with Jesus.");
    expect(p).toContain(GIRL_1.description);
    expect(p).toContain("five fingers");
    expect(p).toContain("no facial features");
    expect(p).toContain("simple straight rays around the head");
    expect(p).toContain(`Scene: ${SPREAD_1.text}`);
    expect(p.trim().endsWith("Spell every word exactly as written.")).toBe(true);
  });

  it("app text on: leave the top quarter blank; text off: letter it in hollow bubble letters with vines, no banner", () => {
    expect(spreadArtPrompt(book, b, SPREAD_1, "daughter")).toContain("Leave the top quarter of the page completely blank");
    const off = spreadArtPrompt(book, b, { ...SPREAD_1, textOff: true }, "daughter");
    expect(off).toContain("“I Am Wonderfully Made”, then “I am fearfully and wonderfully made” in large hollow bubble letters across the top third of the page, with vines curling around a few of the letters. No banner.");
    expect(off).toContain("Underneath, letter the reference “Psalm 139:14”");
  });

  it("Mommy page: finer botanical style, art in the inner 65%, the outer 35% blank, no people unless named", () => {
    const p = spreadArtPrompt(book, b, SPREAD_2, "mommy");
    expect(p).toContain("A finer, feminine botanical line style.");
    expect(p).toContain("The bottom 35% stays completely blank");
    const col = spreadArtPrompt(book, b, SPREAD_1, "mommy");
    expect(col).toContain("inner 65% of the page width");
    expect(col).toContain("The outer 35% (the right side) stays completely blank");
    expect(col).toContain("- No people.");
    expect(spreadArtPrompt(book, b, { ...SPREAD_1, mommy: { ...SPREAD_1.mommy!, textOff: true } }, "mommy")).toContain("“She is fearfully and wonderfully made” in elegant hollow script letters inside the art area");
    const withJesus = spreadArtPrompt(book, b, { ...SPREAD_1, mommy: { ...SPREAD_1.mommy!, scene: "Jesus blesses a mother and her daughter." } }, "mommy");
    expect(withJesus).toContain("no facial features");
    expect(withJesus).not.toContain("- No people.");
  });
});

describe("Saving", () => {
  it("every spread field, the settings and the saved characters survive a save and reload", () => {
    const book = mommyAndMe({ spread: { split: 0.7, headingPt: 11, bodyPt: 10, lineSpacingIn: 0.33 } });
    const back = normalizeBook(JSON.parse(JSON.stringify(book)))!;
    expect(back.brief.scenes).toEqual(book.brief.scenes);
    expect(back.spread).toEqual(book.spread);
    expect(back.artCharacters).toEqual([GIRL_1]);
  });

  it("older books open unchanged (no spread fields added)", () => {
    const old = newBook("old", { brief: { ...newBook("old").brief, scenes: [{ id: "a", title: "A", text: "" }] } });
    const back = normalizeBook(JSON.parse(JSON.stringify(old)))!;
    expect(back.brief.scenes).toEqual([{ id: "a", title: "A", text: "" }]);
    expect(back.spread).toBeUndefined();
    expect(back.artCharacters).toBeUndefined();
  });

  it("a new spread starts with bubble letters on the left, script on the right, and room for each activity", () => {
    const s = newSpread("n", 3);
    expect(s.pageType).toBe("devotional-spread");
    expect(s.letterStyle).toBe("bubble");
    expect(s.mommy?.letterStyle).toBe("elegant");
    expect(s.mommy?.blanks).toHaveLength(3);
  });
});

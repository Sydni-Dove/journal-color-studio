/**
 * Coloring Book as a finished product (engines/coloringBook): the product type, page content choices, Scripture
 * (found, never invented, approved, licensed), importing outlines and characters, the assembled book that the preview
 * draws and the export prints, the cover inside the book, "What's Missing?", and older saves still opening.
 *
 * Regression: the Gracious Kids ballet book — Jenny, Renae and Robby Ballerina, ten scenes from Scene 1 “The Brave
 * First Step”, Proverbs 31:26 on some scenes, NIV, black-and-white interiors at 8.5 × 11 in.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectList } from "../src/components/projects/ProjectList";
import { CONTENT_PRESETS, bookFromCoverBrief, coloringBrief, newBook, type ColoringBook } from "../src/engines/coloringBook/book";
import { assembleCover, assembleInterior, bookLicense, bookStructure, copyrightLines, interiorPageCount, kdpWrap } from "../src/engines/coloringBook/assembleBook";
import { castNamed, characterDescriptionPrompt, parseBookOutline, parseCharacters, scenesFromImport } from "../src/engines/coloringBook/importText";
import { fetchPublicDomain, findReferences, licenseCheck, normalizeReference, suggestReferences, verseCount, wordingProblem } from "../src/engines/coloringBook/scripture";
import { printReady, whatsMissing } from "../src/engines/coloringBook/missing";
import { scenePrompt } from "../src/engines/cover/coloring";
import { newBrief, type Scene } from "../src/engines/cover/brief";
import { pageBlocks } from "../src/engines/cover/assemble";
import { artworkFor, resolveDocument, solvePage } from "../src/engines/document/resolve";
import { textClearRegion } from "../src/components/editor/ArtworkPanel";
import { localBookStore, normalizeBook } from "../src/persistence/coloringBookStore";
import { GRACIOUS_CAST, GRACIOUS_OUTLINE, JENNY_DESCRIPTION } from "./fixtures/graciousKids";

beforeEach(() => {
  const m = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) });
});

let n = 0;
const id = () => `s${++n}`;
const NIV_26 = "She speaks with wisdom, and faithful instruction is on her tongue.";

/** The Gracious Kids book, imported from its outline: every scene with a page-canvas illustration unless told otherwise. */
function gracious(over: Partial<ColoringBook> = {}, withArt = true): ColoringBook {
  const imp = parseBookOutline(GRACIOUS_OUTLINE);
  const scenes = scenesFromImport(imp, id).map((s) => ({
    ...s, castIds: castNamed(s.characters ?? "", GRACIOUS_CAST).length ? castNamed(s.characters ?? "", GRACIOUS_CAST) : undefined,
    ...(withArt ? { illustrationId: `art-${s.id}`, illustrationName: `${s.id}.png`, illustrationW: 2550, illustrationH: 3300, approvedAt: "2026-11-14" } : {}),
  }));
  return newBook("gk", {
    name: imp.title, faithBased: true, content: { title: true, scripture: "full", lesson: false, customText: false },
    brief: coloringBrief({ title: imp.title, subtitle: imp.subtitle, audience: imp.audience, translation: "NIV", cast: GRACIOUS_CAST, castSelected: GRACIOUS_CAST.map((c) => c.id), scenes }),
    ...over,
  });
}
const sceneTexts = (book: ColoringBook, sceneIndex: number) => {
  const doc = resolveDocument(assembleInterior(book));
  const i = doc.recipe.pages.findIndex((p) => p.recipeItemId === `scene-${book.brief.scenes[sceneIndex].id}`);
  return { doc, i, texts: solvePage(doc, i).nodes.filter((x) => x.type === "text").map((x) => (x as { text: string }).text) };
};
const setScene = (b: ColoringBook, i: number, patch: Partial<Scene>): ColoringBook => ({ ...b, brief: { ...b.brief, scenes: b.brief.scenes.map((s, j) => (j === i ? { ...s, ...patch } : s)) } });

describe("Coloring Book is a product type", () => {
  it("is the first card under “What would you like to create?”, beside the other finished products", () => {
    const html = renderToStaticMarkup(<ProjectList projects={[]} meta={() => null} onStart={() => {}} onColoringBook={() => {}} onCovers={() => {}} onOpen={() => {}} onDuplicate={() => {}} onDuplicateAsVariant={() => {}} onDelete={() => {}} />);
    expect(html).toContain("What would you like to create?");
    const order = [...html.matchAll(/data-create="([^"]+)"/g)].map((m) => m[1]);
    expect(order[0]).toBe("coloring-book");
    expect(order).toEqual(expect.arrayContaining(["coloring-book", "storybook", "activity-book", "journal", "workbook", "planner", "book-cover", "custom"]));
    expect(html).toMatch(/<button[^>]*data-create="coloring-book"/);
    expect(html).toContain("Advanced tools");
  });
});

describe("Importing a book outline (Gracious Kids)", () => {
  const imp = parseBookOutline(GRACIOUS_OUTLINE);
  it("finds the book title, subtitle, audience and all ten scenes with their original titles", () => {
    expect(imp.title).toBe("She Is Gracious");
    expect(imp.subtitle).toBe("A Gracious Kids Ballet Coloring Book");
    expect(imp.audience).toBe("Girls ages 4–8");
    expect(imp.scenes).toHaveLength(10);
    expect(imp.scenes[0].title).toBe("The Brave First Step");
    expect(imp.scenes.map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
  it("reads characters, actions, references (any spelling), supplied verse wording, lessons and art notes", () => {
    const [s1, s2, s3, , s5] = imp.scenes;
    expect(s1.characters).toBe("Jenny Ballerina, Renae Ballerina");
    expect(s1.actions).toContain("Renae waves her in");
    expect(s1.scriptureRef).toBe("Proverbs 31:26");
    expect(s1.verseText).toBe(NIV_26);
    expect(s1.lesson).toContain("kind words help us feel brave");
    expect(s2.style).toContain("Keep the mirror simple");
    expect(s3.scriptureRef).toBe("Galatians 6:2");
    expect(s5.scriptureRef).toBe("Proverbs 31:26"); // written “Prov. 31:26”
    expect(imp.scenes.filter((s) => !s.scriptureRef)).toHaveLength(7);
  });
  it("keeps every scene's text; nothing is approved by importing", () => {
    const scenes = scenesFromImport(imp, id);
    expect(scenes[0].pageTitle).toBe("The Brave First Step");
    expect(scenes.every((s) => !s.verseApproved && !s.approvedAt)).toBe(true);
    expect(scenes[0].verseSource).toBe("customer");
  });
  it("reads plain numbered lists and unlabeled text too, never dropping a line", () => {
    const r = parseBookOutline("My Garden Book\n\n1. Planting Seeds\nA girl plants seeds with her grandmother.\nThey wear sun hats.\n\n2. First Sprouts (Ecclesiastes 3:1)\nTiny green sprouts.");
    expect(r.title).toBe("My Garden Book");
    expect(r.scenes.map((s) => s.title)).toEqual(["Planting Seeds", "First Sprouts (Ecclesiastes 3:1)"]);
    expect(r.scenes[0].description).toContain("They wear sun hats.");
    expect(r.scenes[1].scriptureRef).toBe("Ecclesiastes 3:1");
  });
});

describe("Characters: create, import, prompt; identities and reference pictures persist", () => {
  it("separates a pasted description into the character fields", () => {
    const [c] = parseCharacters(JENNY_DESCRIPTION);
    expect(c).toMatchObject({ name: "Jenny Ballerina", age: "about 9", hair: "long cornrow braids", hairAccessories: "large pink hair bow", clothing: "leotard with a tulle tutu, ballet slippers", description: "brave and encouraging" });
  });
  it("splits several characters and sorts free sentences by what they describe", () => {
    const cs = parseCharacters("## Renae Ballerina\nShe has a large curly high puff. She wears a wide pink headband. She loves to clap for her friends.\n\n## Robby Ballerina\nHair: braided high bun with spiral curls");
    expect(cs.map((c) => c.name)).toEqual(["Renae Ballerina", "Robby Ballerina"]);
    expect(cs[0].hair).toContain("curly high puff");
    expect(cs[0].hairAccessories).toContain("wide pink headband");
    expect(cs[1].hair).toBe("braided high bun with spiral curls");
  });
  it("the description prompt asks for exactly the labels the importer reads", () => {
    const p = characterDescriptionPrompt({ title: "She Is Gracious", audience: "girls 4–8", names: ["Jenny Ballerina"] });
    for (const label of ["Name:", "Hair:", "Hair accessories:", "Clothing:", "Distinctive features:"]) expect(p).toContain(label);
    expect(parseCharacters(p.split("\n").filter((l) => l.endsWith(":")).join("\n"))).toBeDefined();
  });
  it("a saved book keeps Jenny, Renae and Robby with their descriptions and reference images", () => {
    const b = gracious();
    localBookStore.save(b);
    const back = localBookStore.load("gk")!;
    expect(back.brief.cast).toEqual(GRACIOUS_CAST);
    expect(back.brief.cast.map((c) => [c.name, c.refId])).toEqual([["Jenny Ballerina", "ref-jenny"], ["Renae Ballerina", "ref-renae"], ["Robby Ballerina", "ref-robby"]]);
    expect(back.brief.scenes[0].title).toBe("The Brave First Step");
    expect(back.brief.scenes[0].castIds).toEqual(["jenny", "renae"]);
  });
  it("every scene prompt reuses the same three girls and their references", () => {
    const b = gracious();
    for (const [i, s] of b.brief.scenes.entries()) {
      const p = scenePrompt({ ...b.brief, pageContent: b.content }, s, i);
      expect(p).toContain("Jenny Ballerina");
      expect(p).toContain("long cornrow braids");
    }
  });
  it("a book without recurring characters still gets artwork instructions (never “No saved characters”)", () => {
    const b = gracious({}, false);
    const p = scenePrompt({ ...b.brief, cast: [], castSelected: [] }, b.brief.scenes[3], 3);
    expect(p).toContain("No recurring characters in this book");
    expect(p).not.toMatch(/No saved characters/i);
  });
});

describe("Interior settings are for printable coloring pages", () => {
  it("defaults to clean black outlines on white, medium lines, moderate complexity, 8.5 × 11 in at 300 DPI", () => {
    const b = coloringBrief();
    expect(b).toMatchObject({ coloringStyle: "outline", lineThickness: "Medium", complexity: "Moderate", size: "8.5×11", dpi: 300, safe: 0.25, gutter: 0.5 });
  });
  it("the cover's watercolor style and lettering never reach an interior page's instructions", () => {
    const b = gracious();
    const brief = { ...b.brief, style: "Soft watercolor typography", typography: "Elegant flowing script", pageContent: b.content };
    const p = scenePrompt(brief, brief.scenes[0], 0);
    expect(p).not.toMatch(/Soft watercolor|flowing script|typograph/i);
    expect(p).toContain("no watercolor washes"); // the only mention: forbidding it
    expect(p).toMatch(/black/i);
    expect(p).toMatch(/Do not include text/);
  });
});

describe("What each finished page shows", () => {
  it("offers illustration only, + title, + verse, + lesson, + custom text", () => {
    expect(CONTENT_PRESETS.map((p) => p.label)).toEqual(["Illustration only", "Illustration + title", "Illustration + Bible verse", "Illustration + lesson or reflection", "Illustration + custom text"]);
  });
  it("lessons switched off leave no lesson, label, heading or space, even when the scene has lesson text", () => {
    const b = gracious({ content: { title: true, scripture: "none", lesson: false, customText: false } });
    const { texts } = sceneTexts(b, 0);
    expect(texts).toEqual(["The Brave First Step"]);
    expect(pageBlocks({ ...b.brief, pageContent: b.content }, b.brief.scenes[0]).map((x) => x.id)).toEqual(["art", "title"]);
    expect(JSON.stringify(bookStructure(b))).not.toMatch(/lesson/i);
  });
  it("lessons and custom text print when chosen, without labels", () => {
    const b = setScene(gracious({ content: { title: true, scripture: "none", lesson: true, customText: true } }), 0, { customText: "Color me brave!" });
    expect(sceneTexts(b, 0).texts).toEqual(["The Brave First Step", "Being new can feel scary, but kind words help us feel brave.", "Color me brave!"]);
  });
  it("illustration only: no text on the page", () => {
    const b = gracious({ content: { title: false, scripture: "none", lesson: false, customText: false } });
    expect(sceneTexts(b, 0).texts).toEqual([]);
  });
  it("a page can choose differently from the book", () => {
    const b = setScene(gracious({ content: { title: true, scripture: "none", lesson: false, customText: false } }), 1, { content: { title: false } });
    expect(sceneTexts(b, 1).texts).toEqual([]);
    expect(sceneTexts(b, 0).texts).toEqual(["The Brave First Step"]);
  });
  it("a non-faith book never prints Scripture, even with references in the scenes", () => {
    const b = setScene(gracious({ faithBased: false }), 0, { verseApproved: "x" });
    expect(sceneTexts(b, 0).texts.join(" ")).not.toContain("Proverbs");
  });
});

describe("Scripture on finished pages", () => {
  it("finds references in any common spelling", () => {
    expect(findReferences("See Prov. 31:26, 1 John 4:19, First Corinthians 13:4-7 and Ps 23:1")).toEqual(["Proverbs 31:26", "1 John 4:19", "1 Corinthians 13:4-7", "Psalm 23:1"]);
    expect(normalizeReference("prov 31:26")).toBe("Proverbs 31:26");
    expect(normalizeReference("chapter 3")).toBeNull();
    expect(verseCount("John 3:16-18")).toBe(3);
  });
  it("prints the full approved verse with its reference and translation on the exported page", () => {
    const b = setScene(gracious(), 0, { verseApproved: "2026-11-14" });
    const { texts } = sceneTexts(b, 0);
    expect(texts).toContain(`“${NIV_26}” — Proverbs 31:26 (NIV)`);
  });
  it("never prints unapproved wording: the reference stands alone and the page is flagged", () => {
    const b = gracious();
    expect(sceneTexts(b, 0).texts).toEqual(["The Brave First Step", "Proverbs 31:26 (NIV)"]);
    const issues = whatsMissing(b);
    expect(issues.find((i) => i.id === `verse-${b.brief.scenes[0].id}`)?.severity).toBe("blocking");
    expect(issues.find((i) => i.id === `words-${b.brief.scenes[2].id}`)?.title).toContain("Galatians 6:2 (NIV)");
  });
  it("reference only prints just the reference", () => {
    const b = gracious({ content: { title: true, scripture: "reference", lesson: false, customText: false } });
    expect(sceneTexts(b, 4).texts).toEqual(["Helping a Friend Up", "Proverbs 31:26 (NIV)"]);
  });
  it("flags every page missing required Scripture (never silently omitted), and suggests references only", () => {
    const b = gracious();
    const missing = whatsMissing(b).filter((i) => i.id.startsWith("ref-s") || /has no Bible verse/.test(i.title));
    expect(missing).toHaveLength(7);
    expect(missing.every((i) => i.severity === "blocking" && i.step === "pages")).toBe(true);
    const sugg = suggestReferences("Jenny stands at the doorway, taking a brave first step");
    expect(sugg).toContain("Joshua 1:9");
    expect(sugg.every((r) => normalizeReference(r) === r)).toBe(true);
  });
  it("fetches only public-domain wording; copyrighted translations are never fetched", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ reference: "Proverbs 31:26", text: "She openeth her mouth with wisdom; and in her tongue\nis the law of kindness.\n" })));
    expect(await fetchPublicDomain("Proverbs 31:26", "KJV", fetcher as never)).toEqual({ ok: true, reference: "Proverbs 31:26", text: "She openeth her mouth with wisdom; and in her tongue is the law of kindness." });
    expect(fetcher).toHaveBeenCalledWith("https://bible-api.com/Proverbs%2031%3A26?translation=kjv");
    const niv = await fetchPublicDomain("Proverbs 31:26", "NIV", fetcher as never);
    expect(niv.ok).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("catches pasted wording that is the reference, or carries a web page's extras", () => {
    expect(wordingProblem("Proverbs 31:26", "Proverbs 31:26")).toMatch(/reference, not the verse/);
    expect(wordingProblem(`${NIV_26} Read full chapter`, "Proverbs 31:26")).toMatch(/web page/);
    expect(wordingProblem(NIV_26, "Proverbs 31:26")).toBeNull();
  });
  it("puts the NIV notice on the copyright page when NIV is quoted", () => {
    const b = setScene(gracious(), 0, { verseApproved: "x" });
    expect(copyrightLines(b, 2026).join(" ")).toContain("New International Version® NIV®");
    expect(copyrightLines({ ...b, faithBased: false }, 2026).join(" ")).not.toContain("NIV");
  });
  it("checks the publisher's free-use limits: a coloring book's verses are a large share of its words", () => {
    expect(licenseCheck("NIV", ["John 3:16"], 30, 100).overShare).toBe(true);
    expect(licenseCheck("NIV", ["John 3:16"], 10, 100).overShare).toBe(false);
    expect(licenseCheck("KJV", ["John 3:16"], 90, 100).overShare).toBe(false);
    // All ten Gracious Kids pages with full NIV verses: blocked until permission is confirmed.
    let b = gracious();
    b.brief.scenes.forEach((_, i) => (b = setScene(b, i, { scriptureRef: "Proverbs 31:26", verseText: NIV_26, verseApproved: "x" })));
    const lic = bookLicense(b)!;
    expect(lic.overShare).toBe(true);
    expect(whatsMissing(b).find((i) => i.id === "license")?.severity).toBe("blocking");
    expect(whatsMissing({ ...b, scripturePermission: true }).find((i) => i.id === "license")).toBeUndefined();
  });
});

describe("Typography in the editor changes the coloring book's pages", () => {
  it("fonts and sizes are the product's typography, not pinned on each line", () => {
    const b = setScene(gracious(), 0, { verseApproved: "x" });
    const p = assembleInterior(b);
    expect(p.typography.fonts.headings).toBe(b.brief.pageTypography.titleFont);
    expect(p.typography.fonts.body).toBe(b.brief.pageTypography.scriptureFont);
    const verseSize = (proj: typeof p) => {
      const doc = resolveDocument(proj);
      const i = doc.recipe.pages.findIndex((x) => x.recipeItemId === `scene-${b.brief.scenes[0].id}`);
      return (solvePage(doc, i).nodes.find((n) => n.id.endsWith("-verse-prompt")) as { fit: { sizePt: number } }).fit.sizePt;
    };
    expect(verseSize(p)).toBe(13);
    // Style → Typography: a bigger body size and another heading font reach the page.
    const edited = { ...p, typography: { fonts: { ...p.typography.fonts, headings: "Cinzel" }, roleOverrides: { ...p.typography.roleOverrides, body: { sizePt: 15 } } } };
    expect(verseSize(edited)).toBe(15);
    expect(JSON.stringify(bookStructure(b))).not.toMatch(/headingFont/);
  });
});

describe("A picture placed on a coloring page keeps clear of its words", () => {
  it("“Between the title and verse” fits the whole picture in the space between them, never under the verse", () => {
    const b = setScene(gracious(), 0, { verseApproved: "x" });
    const p = assembleInterior(b);
    const doc = resolveDocument(p);
    const i = doc.recipe.pages.findIndex((x) => x.recipeItemId === `scene-${b.brief.scenes[0].id}`);
    const region = textClearRegion(doc, i)!;
    expect(region).not.toBeNull();
    // The page's own illustration (a page-canvas picture) is set to the whole page; switch it as the panel does.
    const placements = p.artwork!.placements.map((x) => (x.use === "background" && x.targets[0]?.item === `scene-${b.brief.scenes[0].id}` ? { ...x, extent: "region" as const, region, fit: "fit" as const } : x));
    const moved = resolveDocument({ ...p, artwork: { ...p.artwork!, placements } });
    const pic = artworkFor(moved, i).find((x) => x.use === "background")!;
    const off = { x: pic.box.x - region.x, y: pic.box.y - region.y }; // the bleed the placement adds around the trim
    const r = { x: pic.draw.x - off.x, y: pic.draw.y - off.y, w: pic.draw.w, h: pic.draw.h };
    const words = solvePage(moved, i).nodes.filter((n) => n.type === "text") as { text: string; rect: { x: number; y: number; w: number; h: number } }[];
    expect(words.some((w) => /Proverbs|Joshua|wisdom/.test(w.text))).toBe(true);
    for (const w of words) {
      const overlaps = r.x < w.rect.x + w.rect.w - 1e-6 && w.rect.x < r.x + r.w - 1e-6 && r.y < w.rect.y + w.rect.h - 1e-6 && w.rect.y < r.y + r.h - 1e-6;
      expect(overlaps, `picture overlaps “${w.text.slice(0, 40)}”`).toBe(false);
    }
    // And the same picture over the whole page (as before) does run under the words.
    const whole = artworkFor(doc, i).find((x) => x.use === "background")!;
    const wr = { x: whole.draw.x - off.x, y: whole.draw.y - off.y, w: whole.draw.w, h: whole.draw.h };
    expect(words.some((w) => wr.y < w.rect.y + w.rect.h && w.rect.y < wr.y + wr.h)).toBe(true);
  });

  it("only pages with a picture area offer it", () => {
    const p = assembleInterior(gracious());
    const doc = resolveDocument(p);
    expect(textClearRegion(doc, doc.recipe.pages.findIndex((x) => x.recipeItemId === "front-copyright"))).toBeNull();
  });
});

describe("The finished book: preview = export", () => {
  it("assembles title page, copyright page, each scene with a blank back, on 8.5 × 11 in white pages with the safe margin and gutter", () => {
    const b = gracious();
    const p = assembleInterior(b);
    expect(p.production.userMargins).toEqual({ top: 0.25, bottom: 0.25, outside: 0.25, inside: 0.5 });
    expect(p.production.printProfileId).toBe("kdp");
    const ids = bookStructure(b).map((s) => s.id);
    expect(ids.slice(0, 4)).toEqual(["front-title", "front-copyright", `scene-${b.brief.scenes[0].id}`, `back-${b.brief.scenes[0].id}`]);
    const doc = resolveDocument(p);
    expect(doc.recipe.pages).toHaveLength(22);
  });
  it("every scene page draws its own illustration, the same placement in preview and print", () => {
    const b = gracious();
    const doc = resolveDocument(assembleInterior(b));
    for (const s of b.brief.scenes) {
      const i = doc.recipe.pages.findIndex((p) => p.recipeItemId === `scene-${s.id}`);
      expect(artworkFor(doc, i).map((a) => a.assetId)).toEqual([`art-${s.id}`]);
    }
    // Rebuilding with the saved product id gives the same pages (the export updates one product).
    const again = assembleInterior(b, "same-id");
    expect(again.id).toBe("same-id");
    expect(again.recipe.structure).toEqual(assembleInterior(b).recipe.structure);
  });
  it("KDP: ten single-sided scenes with blank backs are not automatically enough", () => {
    const b = gracious();
    expect(interiorPageCount(b)).toBe(22);
    const issue = whatsMissing(b).find((i) => i.id === "min-pages")!;
    expect(issue.severity).toBe("blocking");
    expect(issue.title).toContain("at least 24 pages; this book has 22");
    const withDrawing = { ...b, drawingPages: 1 };
    expect(interiorPageCount(withDrawing)).toBe(24);
    expect(whatsMissing(withDrawing).find((i) => i.id === "min-pages")).toBeUndefined();
    // Double-sided, ten scenes are 12 pages: further still.
    expect(interiorPageCount({ ...b, sides: "double" })).toBe(12);
    // A home-printed book has no minimum.
    expect(whatsMissing({ ...b, printFormat: "home-print" }).find((i) => i.id === "min-pages")).toBeUndefined();
  });
  it("too-long text is flagged, never shrunk, clipped or dropped silently", () => {
    const lesson = (n: number) => Array.from({ length: n }, () => "This is a very long reflection that goes on and on.").join(" ");
    const base = gracious({ content: { title: true, scripture: "none", lesson: true, customText: false }, printFormat: "home-print" });
    const sid = base.brief.scenes[0].id;
    // Long: it prints at full size, and the squeezed picture is a warning.
    const long = setScene(base, 0, { lessonText: lesson(40) });
    const { texts, doc, i } = sceneTexts(long, 0);
    expect(texts[1]).toBe(lesson(40));
    const lessonNode = solvePage(doc, i).nodes.find((x) => x.id.endsWith("-lesson-prompt")) as { fit: { sizePt: number } };
    expect(lessonNode.fit.sizePt).toBe(13);
    expect(whatsMissing(long).find((x) => x.id === `art-small-${sid}`)?.severity).toBe("warning");
    // Too long for the page: it would run onto another page, which blocks printing.
    const tooLong = setScene(base, 0, { lessonText: lesson(90) });
    expect(whatsMissing(tooLong).find((x) => x.id === `flow-${sid}`)?.severity).toBe("blocking");
    // Short: nothing flagged.
    const ok = setScene(base, 0, { lessonText: "Kind words help us feel brave." });
    expect(whatsMissing(ok).filter((x) => x.sceneId === sid && /fit|smaller|picture only|too long/.test(x.title))).toEqual([]);
  });
  it("is print-ready only when nothing blocks", () => {
    let b = gracious({ content: { title: true, scripture: "reference", lesson: false, customText: false }, drawingPages: 1, cover: { mode: "with-title", backText: "", front: { id: "cov", name: "cover.png", w: 2625, h: 3375 }, approved: "x" } });
    expect(printReady(whatsMissing(b))).toBe(false); // seven scenes still have no reference
    b = { ...b, brief: { ...b.brief, scenes: b.brief.scenes.map((s) => ({ ...s, scriptureRef: s.scriptureRef ?? "Joshua 1:9" })) } };
    const left = whatsMissing(b).filter((i) => i.severity === "blocking");
    expect(left).toEqual([]);
    expect(printReady(whatsMissing(b))).toBe(true);
  });
});

describe("The cover inside the book", () => {
  it("inherits the title and subtitle, with the uploaded artwork and the title as editable text", () => {
    const b = gracious({ cover: { mode: "with-title", backText: "", front: { id: "cov", name: "cover.png", w: 2625, h: 3375 } } });
    const p = assembleCover(b);
    const step = p.recipe.structure![0] as { module: string; title: string; cover: { subtitle: string; showText: boolean } };
    expect(step.module).toBe("cover-page");
    expect(step.title).toBe("She Is Gracious");
    expect(step.cover).toMatchObject({ subtitle: "A Gracious Kids Ballet Coloring Book", showText: true });
    expect(p.artwork!.placements[0]).toMatchObject({ use: "cover", assetId: "cov", mode: "with-title" });
    const doc = resolveDocument(p);
    expect(artworkFor(doc, 0).map((a) => a.assetId)).toEqual(["cov"]);
  });
  it("gives the KDP wrap size for the book's page count", () => {
    const w = kdpWrap({ ...gracious(), drawingPages: 1 });
    expect(w.pages).toBe(24);
    expect(w.spineIn).toBeCloseTo(24 * 0.002252, 4);
    expect(w.widthIn).toBeCloseTo(0.25 + 17 + w.spineIn, 3);
    expect(w.heightIn).toBe(11.25);
    expect(w.spineText).toBe(false);
  });
  it("missing or unapproved cover artwork is flagged", () => {
    expect(whatsMissing(gracious()).find((i) => i.id === "cover")?.severity).toBe("blocking");
  });
});

describe("Existing work keeps working", () => {
  it("a Cover Studio coloring book continues as a Coloring Book with everything kept", () => {
    const brief = newBrief({ category: "character", collection: "Gracious Kids", title: "She Is Gracious", cast: GRACIOUS_CAST, scenes: [{ id: "x1", title: "The Brave First Step", text: "…", scriptureRef: "Proverbs 31:26", verseText: NIV_26, illustrationId: "a1" }] });
    const b = bookFromCoverBrief("b2", brief);
    expect(b.brief.cast).toEqual(GRACIOUS_CAST);
    expect(b.brief.scenes[0]).toMatchObject({ title: "The Brave First Step", scriptureRef: "Proverbs 31:26", verseText: NIV_26, illustrationId: "a1" });
    expect(b.faithBased).toBe(true);
    expect(b.content.scripture).toBe("full");
    // Wording verified in Cover Studio still needs this page's approval before it prints in full.
    expect(b.brief.scenes[0].verseApproved).toBeUndefined();
  });
  it("older or partial saves open with defaults, never losing what they had", () => {
    const b = normalizeBook({ id: "old", name: "Old book", brief: { title: "Old", scenes: [{ id: "a", title: "One", text: "t", lessonText: "L" }] } })!;
    expect(b.name).toBe("Old book");
    expect(b.brief.scenes[0]).toMatchObject({ title: "One", lessonText: "L" });
    expect(b).toMatchObject({ printFormat: "kdp-paperback", sides: "single", drawingPages: 0, scripturePermission: false });
    expect(normalizeBook(null)).toBeNull();
  });
  it("Cover Studio pages (no book content set) assemble exactly as before", () => {
    const brief = newBrief({ category: "character", scenes: [{ id: "c1", title: "T", text: "x", scriptureRef: "John 3:16" }] });
    expect(pageBlocks(brief, brief.scenes[0]).map((x) => x.id)).toEqual(["art", "title", "verse"]);
  });
});

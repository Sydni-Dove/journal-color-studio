/**
 * Cover Studio for coloring books.
 *
 * Gracious Kids regression (ten ballet scenes, three established ballerinas, girls ages 8–12). The registry follows
 * the three girls in Sydni's own Gracious Kids art: box braids with gold cuffs and hoops, loose curls with a pink bow
 * headband, a dark top bun. Every scene prompt reuses the same registry and references, carries the scene's own
 * activity, asks for a text-free black-and-white illustration with unoutlined white space for Product Studio's text,
 * and never carries typography, cover style guides, banners, boxes, measurements to draw, or "empty band / title
 * field" wording. Product Studio assembles the page (title, Scripture, gutter, margins) at 8.5 × 11 in, 300 DPI,
 * 2550 × 3300 px. Also: a collection with no saved characters, and one with uploaded references.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { newBrief, type CastMember, type CoverBrief, type Scene } from "../src/engines/cover/brief";
import {
  NO_TEXT_RULE, REUSE_INSTRUCTION, applyColoringCard, applyCoverCard, castDesignPrompt, castFor, coloringCoverPrompt, referenceFiles, referenceImages, scenePrompt, spaceEstimate, splitScenes,
} from "../src/engines/cover/coloring";
import { artRegion, assembleColoringBook, illustrationPlacement, pageBlocks, verseLine } from "../src/engines/cover/assemble";
import { categoryBlocker, categoryCreateBlocker, categoryPrompt } from "../src/engines/cover/categories";
import { paletteColors } from "../src/engines/cover/prompt";
import { normalizeBrief } from "../src/persistence/coverStore";
import { artworkFor, geometryFor, resolveDocument, solvePage } from "../src/engines/document/resolve";
import type { ArtworkAsset } from "../src/types/artwork";

beforeEach(() => {
  const m = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) });
});

let n = 0;
const id = () => `s${++n}`;

export const BALLERINAS: CastMember[] = [
  {
    id: "braids", name: "Braids", age: "about 10", face: "heart-shaped face, light freckles across the cheeks, bright almond eyes, warm smile", hair: "long box braids, the top half gathered into a bun",
    hairAccessories: "gold cuffs on several braids", proportions: "tallest of the three, long arms and legs", clothing: "short-sleeved leotard with a tulle tutu and a bow at the waist",
    accessories: "small hoop earrings", traits: "box braids with cuffs, hoop earrings, freckles", description: "graceful and confident", refId: "ref-braids", refName: "braids-reference.png",
  },
  {
    id: "curls", name: "Curls", age: "about 9", face: "round face, freckles, big round eyes, wide smile", hair: "voluminous loose curls in a high ponytail",
    hairAccessories: "bow headband", proportions: "medium height, slight build", clothing: "wrap cardigan over a leotard, tights", accessories: "none",
    traits: "high curly ponytail, bow headband, freckles", description: "cheerful, claps for her friends", refId: "ref-curls", refName: "curls-reference.png",
  },
  {
    id: "bun", name: "Bun", age: "about 9", face: "oval face, rosy cheeks, gentle smile", hair: "dark straight hair in a neat top bun with loose wisps at the temples",
    hairAccessories: "none", proportions: "petite, the smallest of the three", clothing: "short-sleeved dance dress over tights", accessories: "none",
    traits: "top bun with side wisps, petite", description: "quiet and thoughtful", refId: "ref-bun", refName: "bun-reference.png",
  },
];

/** The ten-scene ballet collection, each scene with its own activity. */
export const GRACIOUS_SCENES: Scene[] = [
  ["Warm-up at the barre", "The three girls stretch side by side at the barre in the dance studio, smiling at each other."],
  ["Lacing ballet shoes", "The girls sit on a bench lacing their ballet slippers; Braids helps Bun tie a bow."],
  ["Practicing pliés", "In a row in front of the studio mirror, the girls practice pliés with their arms in second position."],
  ["Helping a friend up", "Bun has slipped; Braids and Curls kneel to help her up, kind and encouraging."],
  ["Costume fitting", "Backstage, the girls try on their recital tutus and twirl beside a rack of costumes."],
  ["Praying before the recital", "The three girls hold hands in a circle backstage and bow their heads to pray before the show."],
  ["Opening night", "On stage under soft lights, the three dancers perform a graceful arabesque together."],
  ["The final bow", "At the end of the recital the girls hold hands and take a bow as the curtain begins to close."],
  ["Flowers for the dancers", "After the show, the girls receive small bouquets of flowers and hug each other."],
  ["Celebration", "The friends laugh and jump for joy in the empty studio."],
].map(([title, text], i) => ({ id: `g${i + 1}`, title, text, scriptureRef: "Proverbs 31:25" }));
const ACTIVITY = ["barre", "lacing", "pliés", "help her up", "tutus", "pray", "arabesque", "take a bow", "bouquets", "jump for joy"];

function graciousKids(over: Partial<CoverBrief> = {}): CoverBrief {
  return newBrief({
    category: "character", collection: "Gracious Kids — Ballet Coloring Book", title: "She Is Gracious", audience: "girls ages 8–12", ageGroup: "Ages 8–12",
    palette: "jcs-blush-rose", product: "Workbook", size: "8.5×11", bleed: 0, safe: 0.25, gutter: 0.5, dpi: 300, binding: "Perfect bound",
    cast: BALLERINAS, castSelected: BALLERINAS.map((d) => d.id), castLocked: true, scenes: GRACIOUS_SCENES,
    // Cover settings that used to leak into the interior pages: they must not appear in any scene prompt.
    style: "Soft watercolor typography", typography: "Elegant flowing script", ...over,
  });
}
const HEX = /#[0-9A-F]{6}/i;
/** Wording that made ChatGPT draw banners, frames and text boxes, or that belongs to typography and cover styles. */
const FORBIDDEN = [/empty band/i, /title field/i, /finished (coloring )?page with/i, /with a title and (a )?Scripture/i, /display lettering/i, /centered white/i, /watercolor typography/i, /Elegant flowing script/i, /No saved characters/i, /typograph/i, /translucent lavender/i];

describe("Gracious Kids regression: ten scenes, the same three ballerinas", () => {
  const b = graciousKids();
  const prompts = b.scenes.map((s, i) => scenePrompt(b, s, i));
  it("every scene uses the same three established ballerinas, with their identifying features and reference images", () => {
    expect(prompts).toHaveLength(10);
    for (const p of prompts) {
      for (const c of BALLERINAS) {
        expect(p).toContain(`. ${c.name}: Age`);
        for (const f of [c.face!, c.hair!, c.proportions!, c.clothing!]) expect(p).toContain(f);
        if (c.hairAccessories !== "none") expect(p).toContain(c.hairAccessories!);
        expect(p).toContain(`Reference image: ${c.refName}`);
      }
      expect(p).toContain(REUSE_INSTRUCTION);
      expect(p).toContain("Attached reference images (use them as the visual identity anchors): braids-reference.png, curls-reference.png, bun-reference.png.");
    }
  });
  it("each scene depicts its own activity", () => {
    prompts.forEach((p, i) => {
      expect(p).toContain(`Scene ${i + 1} of 10: ${GRACIOUS_SCENES[i].title}.`);
      const scene = p.split("\nSCENE\n")[1].split("\nCOLORING STYLE\n")[0];
      expect(scene).toContain(ACTIVITY[i]);
      GRACIOUS_SCENES.forEach((other, j) => j !== i && expect(scene).not.toContain(other.text));
    });
  });
  it("the eight sections, in order", () => {
    for (const p of prompts) {
      const at = ["COLLECTION\n", "\nCHARACTERS\n", "\nSCENE\n", "\nCOLORING STYLE\n", "\nCOMPOSITION\n", "\nRESTRICTIONS\n", "\nPRODUCTION\n", "\nOUTPUT\n"].map((h) => p.indexOf(h));
      expect(at.every((x) => x >= 0)).toBe(true);
      expect([...at].sort((x, y) => x - y)).toEqual(at);
    }
  });
  it("no banners, frames, text boxes, titles, Scripture or drawn measurements; no typography or cover styles", () => {
    for (const p of prompts) {
      expect(p).toContain(NO_TEXT_RULE);
      for (const f of FORBIDDEN) expect(p, String(f)).not.toMatch(f);
      expect(p).not.toContain("Proverbs 31:25");
      expect(p).not.toContain("Playfair");
      expect(p).toContain("never draw numbers, sizes, pixel counts or labels on the image");
    }
  });
  it("black and white only: no color, gradients, grayscale, shadows or watercolor", () => {
    for (const p of prompts) {
      expect(p).toContain("Pure white background. Bold, clean black outlines. Closed coloring shapes. No shading, no grayscale, no color, no gradients, no watercolor washes, no shadows");
      expect(p).not.toMatch(HEX);
    }
  });
  it("appropriate for girls ages 8–12", () => {
    for (const p of prompts) {
      expect(p).toContain("Audience: girls ages 8–12");
      expect(p).toContain("Age-appropriate for girls ages 8–12: modest clothing");
    }
  });
  it("one scene per image, and the white space Product Studio's text needs, in pixels of the 2550 × 3300 canvas", () => {
    for (const p of prompts) {
      expect(p).toContain("One scene only. No character sheets, multiple views, or alternate compositions.");
      expect(p).toContain("2550 × 3300 px canvas");
      expect(p).toContain("8.5 × 11-inch, 300-DPI print canvas (2550 × 3300 pixels)");
      expect(p).toMatch(/the bottom \d+ px are where Product Studio places the page text/);
      expect(p).toContain("the left and right 150 px keep the outer margin and binding gutter clear");
    }
  });
});

describe("Product Studio assembles the page: editable title and Scripture, 8.5 × 11, margins and gutter", () => {
  const b = graciousKids();
  const doc = resolveDocument(assembleColoringBook(b));
  it("each picture on its own right-hand page with a blank back: twenty 8.5 × 11 portrait pages, 0.25 in outer margins and a 0.5 in binding gutter", () => {
    expect(doc.recipe.pages.filter((p) => !p.filler)).toHaveLength(20);
    const scenePages = doc.recipe.pages.filter((p) => p.recipeItemId.startsWith("scene-"));
    expect(scenePages).toHaveLength(10);
    expect(scenePages.every((p) => p.side === "recto")).toBe(true);
    const backs = doc.recipe.pages.map((p, i) => [p, i] as const).filter(([p]) => p.recipeItemId.startsWith("back-"));
    expect(backs.every(([, i]) => solvePage(doc, i).nodes.every((x) => x.type !== "text"))).toBe(true);
    expect(resolveDocument(assembleColoringBook({ ...b, blankBacks: false })).recipe.pages.filter((p) => !p.filler)).toHaveLength(10);
    doc.recipe.pages.forEach((p, i) => {
      const g = geometryFor(doc, p, i);
      expect([g.trimWidthIn, g.trimHeightIn, g.mediaWidthIn, g.mediaHeightIn]).toEqual([8.5, 11, 8.5, 11]);
      expect(g.safe.top).toBeCloseTo(0.25);
      expect(g.safe.bottom).toBeCloseTo(0.25);
      const inside = p.side === "verso" ? g.safe.right : g.safe.left, outside = p.side === "verso" ? g.safe.left : g.safe.right;
      expect(inside).toBeCloseTo(0.5);
      expect(outside).toBeCloseTo(0.25);
    });
  });
  it("each page carries its editable title and Scripture reference as text; the verse words wait for verification", () => {
    doc.recipe.pages.forEach((p, i) => {
      if (p.filler || !p.recipeItemId.startsWith("scene-")) return;
      const texts = solvePage(doc, i).nodes.filter((x) => x.type === "text").map((x) => (x as { text: string }).text);
      const k = GRACIOUS_SCENES.findIndex((s) => `scene-${s.id}` === p.recipeItemId);
      expect(texts).toContain(GRACIOUS_SCENES[k].title);
      expect(texts).toContain("Proverbs 31:25 (NIV)");
      const verse = solvePage(doc, i).nodes.find((x) => x.type === "text" && (x as { text: string }).text === "Proverbs 31:25 (NIV)") as { align?: string };
      expect(verse.align).toBe("center");
    });
    expect(verseLine({ ...b, verseVerified: true }, { ...GRACIOUS_SCENES[0], verseText: "She is clothed with strength and dignity." })).toBe("She is clothed with strength and dignity. Proverbs 31:25 (NIV)");
    expect(verseLine(b, { ...GRACIOUS_SCENES[0], verseText: "She is clothed with strength and dignity." })).toBe("Proverbs 31:25 (NIV)");
  });
  it("typography is applied only here, at assembly", () => {
    const blocks = pageBlocks({ ...b, pageTypography: { titleFont: "Great Vibes", scriptureFont: "Lato", align: "left", titleSizePt: 30 } }, GRACIOUS_SCENES[0]);
    expect(blocks.find((x) => x.id === "title")).toMatchObject({ headingFont: "Great Vibes", headingSizePt: 30, headingAlign: "left" });
  });
  it("the illustration area is clear of the text, inside the margins and clear of the gutter on either side", () => {
    const r = artRegion(b, GRACIOUS_SCENES[0]);
    expect(r.rect.x).toBeCloseTo(0.5);
    expect(r.rect.x + r.rect.w).toBeCloseTo(8);
    expect(r.px).toMatchObject({ left: 150, right: 2400 });
    expect(r.bottomTextPx).toBeGreaterThan(0);
    const i = doc.recipe.pages.findIndex((p) => p.recipeItemId === "scene-g1");
    const textTop = Math.min(...solvePage(doc, i).nodes.filter((x) => x.type === "text").map((x) => (x as { rect: { y: number } }).rect.y));
    expect(r.rect.y + r.rect.h).toBeLessThanOrEqual(textTop + 1e-6);
  });
  it("a page-canvas image (2550 × 3300) fills the page; any other size is fitted whole into the illustration area, never stretched or cropped", () => {
    const exact: ArtworkAsset = { id: "il-1", name: "scene1.png", mime: "image/png", widthPx: 2550, heightPx: 3300, hasAlpha: false, bytes: 1, addedAt: "" };
    const square: ArtworkAsset = { id: "il-2", name: "scene2.png", mime: "image/png", widthPx: 1024, heightPx: 1024, hasAlpha: false, bytes: 1, addedAt: "" };
    const scenes = [{ ...GRACIOUS_SCENES[0], illustrationId: exact.id, illustrationW: 2550, illustrationH: 3300 }, { ...GRACIOUS_SCENES[1], illustrationId: square.id, illustrationW: 1024, illustrationH: 1024 }];
    const d = resolveDocument(assembleColoringBook(b, scenes, [exact, square]));
    const a0 = artworkFor(d, d.recipe.pages.findIndex((p) => p.recipeItemId === "scene-g1"))[0];
    expect(a0.box).toEqual({ x: 0, y: 0, w: 8.5, h: 11 });
    expect(a0.draw).toEqual({ x: 0, y: 0, w: 8.5, h: 11 });
    const a1 = artworkFor(d, d.recipe.pages.findIndex((p) => p.recipeItemId === "scene-g2"))[0];
    const region = artRegion(b, scenes[1]).rect;
    expect(a1.draw.w).toBeCloseTo(a1.draw.h);
    expect(a1.draw.w).toBeLessThanOrEqual(region.w + 1e-9);
    expect(a1.draw.h).toBeLessThanOrEqual(region.h + 1e-9);
    expect(a1.draw.x).toBeGreaterThanOrEqual(0.5 - 1e-9);
    expect(a1.draw.x + a1.draw.w).toBeLessThanOrEqual(8 + 1e-9);
    expect(illustrationPlacement(b, scenes[1])).toMatchObject({ extent: "region", fit: "fit" });
  });
});

describe("no saved characters yet", () => {
  const b = graciousKids({ cast: [], castSelected: [], castLocked: false, characters: "Three ballet friends, ages 9 to 11, with clearly different hair and personalities." });
  it("scenes wait for the cast; a cast-design prompt comes first; never “No saved characters”", () => {
    expect(categoryBlocker(b)).toMatch(/Create your cast before the first scene/);
    const p = castDesignPrompt(b);
    expect(p).toContain("Three ballet friends, ages 9 to 11");
    expect(p).toContain("front, three-quarter, side and back views");
    expect(p).toContain("character registry");
    expect(p).not.toMatch(/No saved characters/);
  });
});

describe("uploaded references", () => {
  const b = graciousKids();
  it("the reference files (id + name) are what the studio copies or downloads for the image generator", () => {
    expect(referenceFiles(b, castFor(b)).map((f) => [f.id, f.name])).toEqual([["ref-braids", "braids-reference.png"], ["ref-curls", "curls-reference.png"], ["ref-bun", "bun-reference.png"]]);
    const group = { ...b, useGroupRef: true, groupRefId: "grp", groupRefName: "ballerinas-group.png" };
    expect(referenceFiles(group, castFor(group))).toEqual([{ id: "grp", name: "ballerinas-group.png", who: "Group" }]);
    expect(scenePrompt(group, b.scenes[0], 0)).toContain("Attached reference images (use them as the visual identity anchors): ballerinas-group.png.");
  });
  it("turning references off keeps the descriptions and drops the images", () => {
    const off = { ...b, useRefs: false };
    expect(referenceFiles(off, castFor(off))).toEqual([]);
    const p = scenePrompt(off, b.scenes[0], 0);
    expect(p).not.toContain("reference.png");
    expect(p).toContain(BALLERINAS[0].face!);
  });
  it("a character without a reference image is named and described in full", () => {
    const p = scenePrompt({ ...b, cast: b.cast.map((c) => (c.id === "bun" ? { ...c, refId: undefined, refName: undefined } : c)) }, b.scenes[0], 0);
    expect(p).toContain("No reference image yet for Bun: follow the description above exactly.");
  });
});

describe("regenerate a scene, keeping the characters", () => {
  it("the prompt says why the last image was rejected and keeps the same registry", () => {
    const b = graciousKids();
    const p = scenePrompt(b, { ...b.scenes[0], attempts: 1, rejectNotes: "Curls' bow headband was missing" }, 0);
    expect(p).toContain("REGENERATION (attempt 2): the previous image was not approved because: Curls' bow headband was missing.");
    expect(p).toContain(REUSE_INSTRUCTION);
  });
});

describe("scene batches", () => {
  it("splits at numbered headings, keeping each heading as the title", () => {
    const s = splitScenes("1. Warm-up at the barre\nThe dancers stretch.\n\n2. Opening night\nThey bow.\nTogether.\n\nScene 3: Backstage\nGiggles.", id);
    expect(s.map((x) => [x.title, x.text])).toEqual([["Warm-up at the barre", "The dancers stretch."], ["Opening night", "They bow.\nTogether."], ["Backstage", "Giggles."]]);
  });
  it("without numbered headings, splits at blank lines", () => {
    expect(splitScenes("The girls tie their ribbons. They are ready.\n\n\nThey leap across the stage.", id).map((x) => x.title)).toEqual(["The girls tie their ribbons.", "They leap across the stage."]);
  });
  it("a numbered heading with its words on the next line still gets a title", () => {
    expect(splitScenes("1.\nAmara spins.\n\n2.\nLucía jumps.", id).map((x) => x.title)).toEqual(["Amara spins.", "Lucía jumps."]);
  });
});

describe("line art settings", () => {
  const b = graciousKids({ scenes: [{ ...GRACIOUS_SCENES[0], lineThickness: "Thick", complexity: "Simple" }, { ...GRACIOUS_SCENES[1], lineThickness: "Thin", complexity: "Detailed" }] });
  it("per-scene overrides, collection defaults otherwise (Medium, Moderate)", () => {
    expect(scenePrompt(b, b.scenes[0], 0)).toContain("thick, bold lines (about 2 pt)");
    expect(scenePrompt(b, b.scenes[1], 1)).toContain("Illustration complexity: detailed:");
    expect(scenePrompt(b, GRACIOUS_SCENES[2], 2)).toContain("medium lines (about 1 pt)");
    expect(scenePrompt(b, GRACIOUS_SCENES[2], 2)).toContain("Illustration complexity: moderate:");
  });
  it("illustration styling is part of the prompt: style, proportions, hair and clothing detail, background, coloring areas", () => {
    const p = scenePrompt({ ...b, illustrationStyle: "Modern cartoon line art", proportions: "Natural child proportions", hairClothingDetail: "Detailed", backgroundDensity: "Minimal", coloringArea: "Large" }, b.scenes[0], 0);
    for (const t of ["Modern cartoon line art", "natural child proportions", "detailed hair and clothing detail", "minimal background", "large coloring areas"]) expect(p).toContain(t);
  });
  it("hybrid is an explicit choice: palette accents only, the shapes stay white", () => {
    const h = scenePrompt({ ...b, coloringStyle: "hybrid" }, b.scenes[0], 0);
    expect(h).toContain("every shape a child colors stays white");
    for (const hex of paletteColors(b)) expect(h).toContain(hex);
  });
  it("only a reference sheet asks for several views", () => {
    expect(scenePrompt({ ...b, output: "reference-sheet" }, b.scenes[0], 0)).toContain("front, three-quarter, side and back views");
    for (const o of ["coloring-page", "illustration", "worksheet", "drawing-page"] as const) expect(scenePrompt({ ...b, output: o }, b.scenes[0], 0)).toContain("One scene only.");
  });
  it("the live estimate of space left still works", () => {
    expect(spaceEstimate({ ...b, output: "coloring-page", coverage: 95 }).ok).toBe(false);
  });
});

describe("the coloring book cover uses the same cast, in full color", () => {
  const b = applyColoringCard(graciousKids({ category: "coloring-cover" }), "storybook");
  const p = coloringCoverPrompt(b);
  it("Full-Color Storybook with the palette, the three ballerinas and their references", () => {
    expect(p).toContain("full-color storybook painting");
    for (const hex of paletteColors(b)) expect(p).toContain(hex);
    for (const c of BALLERINAS) expect(p).toContain(`. ${c.name}: Age`);
    expect(p).toContain("Attach these reference images with this prompt: braids-reference.png, curls-reference.png, bun-reference.png.");
    expect(referenceImages(b, castFor(b))).toHaveLength(3);
  });
  it("artwork only: no plaque, banner or empty box for the title, and no drawn measurements", () => {
    expect(p).toContain("Artwork only: draw NO title, words or letters");
    expect(p).toContain("no plaque, banner, ribbon, frame, cartouche or empty box");
    expect(p).toContain("never draw numbers, sizes, pixel counts or labels on the image");
    expect(coloringCoverPrompt({ ...b, coverOutput: "complete-concept" })).toContain("letter the exact title “She Is Gracious”");
  });
  it("only the selected cast; cover-only changes; a wrap needs the printer's spine", () => {
    expect(coloringCoverPrompt({ ...b, castSelected: ["braids", "bun"] })).not.toContain(". Curls:");
    expect(coloringCoverPrompt({ ...b, cast: b.cast.map((c) => (c.id === "braids" ? { ...c, pose: "mid-pirouette" } : c)) })).toContain("On the cover: pose mid-pirouette.");
    expect(categoryCreateBlocker({ ...b, format: "wrap", spine: null })).toMatch(/spine width/);
  });
  it("interiors stay black and white while the cover is color", () => {
    expect(categoryPrompt({ ...b, category: "character" }, 0, [])).not.toMatch(HEX);
    expect(categoryPrompt(b, 0, [])).toMatch(HEX);
  });
});

describe("cards and saving", () => {
  it("cards respect typed fields", () => {
    expect(applyColoringCard(graciousKids({ category: "coloring-cover", titlePlacement: "title across the top" }), "watercolor").titlePlacement).toBe("title across the top");
    expect(applyCoverCard(newBrief({ imagery: "a lighthouse" }), "botanical")!.brief.imagery).toBe("a lighthouse");
  });
  it("the registry, scene approvals, illustrations and styling survive saving; old briefs get the defaults", () => {
    const b = graciousKids({
      scenes: [{ ...GRACIOUS_SCENES[0], illustrationId: "il", illustrationName: "s1.png", illustrationW: 2550, illustrationH: 3300, checks: { faces: true }, approvedAt: "2026-11-14T00:00:00.000Z", attempts: 2, rejectNotes: "hoops missing", lessonText: "Be kind" }],
      useRefs: false, illustrationStyle: "Modern cartoon line art", backgroundDensity: "Full", pageTypography: { titleFont: "Great Vibes", scriptureFont: "Lato", align: "left", titleSizePt: 28 },
    });
    expect(normalizeBrief(JSON.parse(JSON.stringify(b)))).toEqual(b);
    const old = normalizeBrief({ title: "Old" });
    expect([old.castLocked, old.useRefs, old.gutter, old.illustrationStyle, old.lineThickness, old.complexity]).toEqual([false, true, 0.5, "Clean storybook line art", "Medium", "Moderate"]);
  });
});

describe("Scripture coloring pages: the verse drawn into the artwork, only when chosen and verified", () => {
  const verse = "She is clothed with strength and dignity; she can laugh at the days to come.";
  const scene = { ...GRACIOUS_SCENES[5], verseText: verse, scriptureMode: "art" as const };
  it("not verified yet: that scene waits, with the reason; the other scenes go ahead", () => {
    const b = graciousKids({ scenes: [scene] });
    expect(categoryBlocker(b)).toMatch(/Scene 1: the verse is to be drawn into the artwork: tick “Verse wording and permission verified” first/);
    expect(categoryBlocker(graciousKids({ verseVerified: true, scenes: [{ ...scene, verseText: "" }] }))).toMatch(/enter its exact wording/);
    const mixed = graciousKids({ scenes: [GRACIOUS_SCENES[0], scene] });
    expect(categoryBlocker(mixed)).toBeNull();
    const all = categoryPrompt(mixed, 0, []);
    expect(all).toContain("Scene 1 of 2: Warm-up at the barre.");
    expect(all).not.toContain("Scene 2 of 2:");
    expect(all).toContain("(Not included yet: scene 2, the verse is to be drawn into the artwork");
  });
  it("verified: the exact verse, in hollow outline letters to color, with no banner or box; Product Studio adds only the title", () => {
    const b = graciousKids({ verseVerified: true, scenes: [scene] });
    expect(categoryBlocker(b)).toBeNull();
    const p = scenePrompt(b, scene, 0);
    expect(p).toContain(`“${verse}” — Proverbs 31:25 (NIV)`);
    expect(p).toContain("hollow outline letters");
    expect(p).toContain("No banner, ribbon, scroll, plaque or box behind or around the words.");
    expect(p).toContain("The only lettering in the image is this Scripture verse");
    expect(p).toContain("write out the lettered verse exactly as drawn");
    for (const f of [/empty band/i, /title field/i, /No saved characters/i, /typograph/i]) expect(p).not.toMatch(f);
    // The assembled page doesn't typeset the verse a second time.
    const texts = pageBlocks(b, scene).map((x) => x.label);
    expect(texts).toContain(GRACIOUS_SCENES[5].title);
    expect(texts.join(" ")).not.toContain("Proverbs 31:25");
  });
  it("the collection default is Product Studio; one scene can choose the artwork", () => {
    const b = graciousKids({ verseVerified: true, scenes: [GRACIOUS_SCENES[0], scene] });
    expect(scenePrompt(b, b.scenes[0], 0)).toContain(NO_TEXT_RULE);
    expect(scenePrompt(b, b.scenes[1], 1)).toContain("SCRIPTURE LETTERING");
    const all = graciousKids({ verseVerified: true, scriptureMode: "art", scenes: [{ ...GRACIOUS_SCENES[0], verseText: verse }] });
    expect(scenePrompt(all, all.scenes[0], 0)).toContain("SCRIPTURE LETTERING");
  });
});

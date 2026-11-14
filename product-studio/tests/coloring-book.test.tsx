/**
 * Cover Studio for coloring books: scene batches, the saved cast and its reference images, coloring style
 * (outlines vs hybrid, line thickness, complexity, per-scene overrides), page outputs and layout, the coloring book
 * cover that uses the same cast, and suggested-direction cards that respect what the maker typed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { newBrief, type CastMember, type CoverBrief, type Scene } from "../src/engines/cover/brief";
import {
  applyColoringCard, applyCoverCard, castFor, coloringCoverPrompt, referenceImages, scenePrompt, spaceEstimate, splitScenes,
} from "../src/engines/cover/coloring";
import { categoryBlocker, categoryCreateBlocker, categoryPrompt } from "../src/engines/cover/categories";
import { paletteColors } from "../src/engines/cover/prompt";
import { normalizeBrief } from "../src/persistence/coverStore";

beforeEach(() => {
  const m = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) });
});

let n = 0;
const id = () => `s${++n}`;
const DANCERS: CastMember[] = [
  { id: "amara", name: "Amara", description: "a 7-year-old ballerina with dark brown skin, a high bun of tight coils and a pink leotard", traits: "round face, dimples, tight coily hair", refId: "a1", refName: "amara-reference.png" },
  { id: "lucia", name: "Lucía", description: "a 6-year-old dancer with light olive skin and long wavy hair in a low ponytail", traits: "freckles, wavy hair, small nose", refId: "l1", refName: "lucia-reference.png" },
  { id: "grace", name: "Grace", description: "an 8-year-old dancer with fair skin and red hair in two braids, round glasses", traits: "glasses, freckles, braids", refId: "g1", refName: "grace-reference.png" },
];
function gracious(over: Partial<CoverBrief> = {}): CoverBrief {
  const scenes: Scene[] = [
    { id: "sc1", title: "Warm-up at the barre", text: "The three dancers stretch side by side at the barre, smiling at each other.", lineThickness: "Thick", complexity: "Simple" },
    { id: "sc2", title: "Opening night bow", text: "On stage under the lights, the three dancers take a bow together, holding hands.", lineThickness: "Thin", complexity: "Detailed" },
  ];
  return newBrief({
    category: "character", collection: "She Is Gracious — Ballet Coloring Book", title: "She Is Gracious", subtitle: "A Ballet Coloring Book", scripture: "Proverbs 31:25",
    palette: "jcs-blush-rose", product: "Workbook", size: "8.5×11", cast: DANCERS, castSelected: DANCERS.map((d) => d.id), scenes, ...over,
  });
}
const HEX = /#[0-9A-F]{6}/i;

describe("scene batches", () => {
  it("splits at numbered headings, keeping each heading as the title", () => {
    const s = splitScenes("1. Warm-up at the barre\nThe dancers stretch.\n\n2. Opening night\nThey bow.\nTogether.\n\nScene 3: Backstage\nGiggles.", id);
    expect(s.map((x) => [x.title, x.text])).toEqual([["Warm-up at the barre", "The dancers stretch."], ["Opening night", "They bow.\nTogether."], ["Backstage", "Giggles."]]);
    const md = splitScenes("## 1 The studio\nMirrors.\n## 2 The recital\nLights.", id);
    expect(md.map((x) => x.title)).toEqual(["The studio", "The recital"]);
  });
  it("without numbered headings, splits at blank lines (title from the first sentence)", () => {
    const s = splitScenes("The girls tie their ribbons. They are ready.\n\n\nThey leap across the stage.", id);
    expect(s.map((x) => x.title)).toEqual(["The girls tie their ribbons.", "They leap across the stage."]);
    expect(s[0].text).toBe("The girls tie their ribbons. They are ready.");
  });
  it("a numbered heading with its words on the next line still gets a title", () => {
    const s = splitScenes("1.\nAmara spins.\n\n2.\nLucía jumps.", id);
    expect(s.map((x) => x.title)).toEqual(["Amara spins.", "Lucía jumps."]);
  });
});

describe("interior scenes stay black and white, with their own thickness and complexity", () => {
  const b = gracious();
  const [one, two] = b.scenes.map((s, i) => scenePrompt(b, s, i));
  it("every scene inherits the saved cast and names the reference images to attach", () => {
    for (const p of [one, two]) {
      for (const d of DANCERS) expect(p).toContain(`- ${d.name}:`);
      expect(p).toContain("Attach these reference images with this prompt: amara-reference.png, lucia-reference.png, grace-reference.png.");
      expect(p).toContain("Keep these characters exactly consistent");
    }
  });
  it("black outlines on white, no palette colors", () => {
    for (const p of [one, two]) {
      expect(p).toContain("Black outlines on a pure white background. No color, no gray shading");
      expect(p).not.toMatch(HEX);
    }
  });
  it("scene 1 is Thick + Simple, scene 2 is Thin + Detailed", () => {
    expect(one).toContain("thick, bold lines (about 2 pt)");
    expect(one).toContain("Illustration complexity: simple:");
    expect(two).toContain("thin, fine lines (about 0.5 pt)");
    expect(two).toContain("Illustration complexity: detailed:");
  });
  it("collection defaults apply where a scene doesn't override (Medium, Moderate)", () => {
    const p = scenePrompt(b, { id: "x", title: "Snack time", text: "…" }, 2);
    expect(p).toContain("medium lines (about 1 pt)");
    expect(p).toContain("Illustration complexity: moderate:");
  });
  it("hybrid is an explicit choice: palette on borders and accents only, the shapes stay white", () => {
    const h = scenePrompt({ ...b, coloringStyle: "hybrid" }, b.scenes[0], 0);
    expect(h).toContain("Hybrid · colored accents only");
    expect(h).toContain("every shape a child colors stays white");
    for (const hex of paletteColors(b)) expect(h).toContain(hex);
  });
  it("a scene can use only some of the cast", () => {
    const p = scenePrompt(b, { ...b.scenes[0], castIds: ["amara"] }, 0);
    expect(p).toContain("- Amara:");
    expect(p).not.toContain("- Grace:");
    expect(p).toContain("Attach these reference images with this prompt: amara-reference.png.");
  });
});

describe("page outputs and layout", () => {
  const b = gracious();
  const s = b.scenes[0];
  it("finished coloring page: room for the title and an NIV verse, no verse words until verified", () => {
    const p = scenePrompt({ ...b, output: "coloring-page" }, s, 0);
    expect(b.translation).toBe("NIV");
    expect(p).toContain("Leave a clean, empty band for the title and the NIV verse");
    expect(p).toContain("Do not draw any words");
    expect(p).toContain("once their wording and permission are verified");
    expect(scenePrompt({ ...b, verseVerified: true }, s, 0)).not.toContain("once their wording and permission are verified");
  });
  it("text-free illustration, worksheet with empty text areas, drawing page", () => {
    expect(scenePrompt({ ...b, output: "illustration" }, s, 0)).toContain("No words, letters, numbers");
    expect(scenePrompt({ ...b, output: "worksheet" }, s, 0)).toContain("EMPTY text areas");
    expect(scenePrompt({ ...b, output: "drawing-page" }, s, 0)).toContain("large, empty framed area");
  });
  it("only a reference sheet asks for several views", () => {
    for (const o of ["coloring-page", "illustration", "worksheet", "drawing-page"] as const) {
      const p = scenePrompt({ ...b, output: o }, s, 0);
      expect(p, o).toContain("do not show several views");
      expect(p, o).not.toContain("three-quarter");
    }
    const r = scenePrompt({ ...b, output: "reference-sheet" }, s, 0);
    expect(r).toContain("front, three-quarter, side and back views");
    expect(r).not.toContain("do not show several views");
  });
  it("live estimate of space left: coverage and text placement change it", () => {
    const base = spaceEstimate({ ...b, output: "coloring-page", coverage: 60, textPlacement: "bottom" });
    expect(base.ok).toBe(true);
    expect(base.leftH).toBeCloseTo(base.usableH - base.artH - 1.5 - 0.2, 6);
    const full = spaceEstimate({ ...b, output: "coloring-page", coverage: 95 });
    expect(full.ok).toBe(false);
    expect(full.summary).toMatch(/Over by/);
    expect(spaceEstimate({ ...b, output: "illustration", coverage: 100 }).textH).toBe(0);
  });
});

describe("the coloring book cover uses the same cast", () => {
  const b = applyColoringCard(gracious({ category: "coloring-cover" }), "storybook");
  const p = coloringCoverPrompt(b);
  it("Full-Color Storybook: full color, the palette, the three dancers and their reference images", () => {
    expect(p).toContain("full-color storybook painting");
    for (const hex of paletteColors(b)) expect(p).toContain(hex);
    for (const d of DANCERS) expect(p).toContain(`- ${d.name}:`);
    expect(p).toContain("Attach these reference images with this prompt: amara-reference.png, lucia-reference.png, grace-reference.png.");
    expect(p).toContain("only the cover is in color");
    expect(referenceImages(b, castFor(b))).toEqual(["amara-reference.png", "lucia-reference.png", "grace-reference.png"]);
  });
  it("only the selected cast is used; the group image replaces the individual ones when chosen", () => {
    const two = coloringCoverPrompt({ ...b, castSelected: ["amara", "grace"] });
    expect(two).not.toContain("- Lucía:");
    expect(two).toContain("amara-reference.png, grace-reference.png.");
    const group = coloringCoverPrompt({ ...b, groupRefId: "grp", groupRefName: "dancers-group.png", useGroupRef: true });
    expect(group).toContain("Attach these reference images with this prompt: dancers-group.png.");
    expect(group).not.toContain("amara-reference.png");
  });
  it("individual changes keep faces, hair texture and proportions", () => {
    const c = coloringCoverPrompt({ ...b, cast: b.cast.map((d) => (d.id === "amara" ? { ...d, pose: "mid-pirouette", outfit: "a sparkly recital tutu" } : d)) });
    expect(c).toContain("In this image: pose mid-pirouette; outfit a sparkly recital tutu.");
    expect(c).toContain("the same facial features, hair texture, skin tone, proportions and distinctive traits");
  });
  it("artwork only draws no words (title set in Product Studio); a complete concept letters the exact title", () => {
    expect(p).toContain("Artwork only: draw NO title, words or letters");
    expect(coloringCoverPrompt({ ...b, coverOutput: "complete-concept" })).toContain("letter the exact title “She Is Gracious”");
  });
  it("a paperback wrap needs the printer's spine width before it can be handed off", () => {
    const wrap = { ...b, product: "Workbook", format: "wrap" as const, spine: null };
    expect(categoryCreateBlocker(wrap)).toMatch(/spine width/);
    expect(categoryCreateBlocker({ ...wrap, spine: 0.25 })).toBeNull();
    expect(categoryBlocker({ ...b, title: "" })).toMatch(/title/);
  });
  it("the interior scenes stay black and white while the cover is full color", () => {
    const interior = categoryPrompt({ ...b, category: "character" }, 0, []);
    expect(interior).toContain("Black outlines on a pure white background");
    expect(interior).not.toMatch(HEX);
    expect(categoryPrompt(b, 0, [])).toMatch(HEX);
  });
});

describe("suggested direction cards respect what was typed", () => {
  it("a coloring cover card fills empty fields and keeps typed ones; switching cards replaces only card wording", () => {
    const typed = gracious({ category: "coloring-cover", titlePlacement: "title in a ribbon banner" });
    const a = applyColoringCard(typed, "watercolor");
    expect(a.titlePlacement).toBe("title in a ribbon banner");
    expect(a.coverColor).toMatch(/soft watercolor/);
    const b = applyColoringCard(a, "cartoon");
    expect(b.coverColor).toMatch(/bright cartoon/);
    expect(b.titlePlacement).toBe("title in a ribbon banner");
    expect(b.starterScene).toBe("the characters mid-celebration, full of joy");
  });
  it("cover artwork cards set style and composition, and imagery only when empty", () => {
    const r = applyCoverCard(newBrief({ imagery: "a lighthouse" }), "botanical")!;
    expect(r.brief.style).toBe("Painterly botanical");
    expect(r.brief.imagery).toBe("a lighthouse");
    expect(r.direction).toBe(3);
    expect(applyCoverCard(newBrief(), "botanical")!.brief.imagery).toMatch(/olive branch/);
  });
});

describe("saving", () => {
  it("cast, scenes and coloring choices survive saving and reopening; old briefs get the defaults", () => {
    const b = applyColoringCard(gracious({ coloringStyle: "hybrid", coverage: 65, textPlacement: "top-and-bottom", useGroupRef: true, groupRefId: "grp", groupRefName: "g.png", coverApproved: "2026-11-14T00:00:00.000Z" }), "hybrid");
    expect(normalizeBrief(JSON.parse(JSON.stringify(b)))).toEqual(b);
    const old = normalizeBrief({ title: "Old" });
    expect([old.coloringStyle, old.lineThickness, old.complexity, old.output, old.translation, old.keepConsistent, old.cast.length]).toEqual(["outline", "Medium", "Moderate", "coloring-page", "NIV", true, 0]);
  });
});

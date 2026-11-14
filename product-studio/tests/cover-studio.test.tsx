/**
 * Cover Studio (ported from the standalone stationery cover generator): prompts keep the generator's wording,
 * dimensions come from Product Studio's own geometry and printer rules, the guards hold, palettes are Product
 * Studio's, and collections save, reopen, duplicate and import without touching projects.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CoverStudio } from "../src/components/cover/CoverStudio";
import { newBrief, withProduct, type CoverBrief, type CoverItem } from "../src/engines/cover/brief";
import { briefFromProject } from "../src/engines/cover/fromProject";
import { CHATGPT_HOME, CHATGPT_URL_MAX, chatgptPromptUrl, fitsInAddress, launchChatGpt } from "../src/engines/cover/launch";
import { DIRECTIONS, STARTER_SET, STYLE_GROUPS, STYLE_GUIDES } from "../src/engines/cover/guides";
import { createBlocker, handoffPrompt, paletteColors, paletteSpec, promptBlocker, promptFor, setPrompts } from "../src/engines/cover/prompt";
import { fmt, resolveCoverSpec, specLine } from "../src/engines/cover/spec";
import {
  duplicateAndRecolor, exportCollectionJson, importedPaletteId, loadDraft, localCoverStore, newCollection, normalizeBrief, parseCollectionFile, saveDraft,
} from "../src/persistence/coverStore";
import { localProjectStore } from "../src/persistence/projectStore";
import { COVER_PALETTES, PALETTES } from "../src/presets/themes/palettes";
import { TEST_PRODUCTS } from "../src/presets/products/testProducts";
import { GOLDEN_PROMPTS } from "./fixtures/coverGolden";
import { GENERATOR_PALETTES } from "./fixtures/coverGeneratorPalettes";

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
    clear: () => m.clear(),
    keys: () => [...m.keys()],
  };
}
let storage = memoryStorage();
beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal("localStorage", storage);
});

const titled = (over: Partial<CoverBrief> = {}) => newBrief({ collection: "Rooted in Hope", title: "Rooted in Hope", subtitle: "A prayer journal", ...over });

describe("prompts keep the generator's wording", () => {
  for (const g of GOLDEN_PROMPTS) {
    it(`${g.name}: identical to the generator's own prompt`, () => {
      const brief = normalizeBrief(g.brief);
      expect(promptFor(brief, g.dir, g.item)).toBe(g.expected);
    });
  }

  it("states the exact title, never 'Untitled', and the rejected-cover prohibitions", () => {
    const p = promptFor(titled(), 0);
    expect(p).toContain("Exact cover title: “Rooted in Hope”.");
    expect(p.match(/Untitled/g)).toHaveLength(1);
    expect(p).toContain("Never insert “Untitled,” extra verses, fake author names, or filler text.");
    expect(p).toContain("No generic sunrise, mountains, stacked books, clip-art foliage, antique parchment, ornate corner decoration, or random gold flourish unless explicitly requested above.");
    expect(p).toContain("do not add crosses, doves, or other religious symbols unless requested");
    expect(promptFor(titled({ product: "Notary journal" }), 0)).toContain("do not imply a government endorsement or invent a jurisdiction");
  });

  it("includes the style's self-contained description, the direction, the avoid list, the palette's hex values and the geometry", () => {
    const b = titled({ style: "Black and gold marble", avoid: "glitter, doves", palette: "dove-signature" });
    const p = promptFor(b, 3);
    expect(p).toContain(STYLE_GUIDES["Black and gold marble"]);
    expect(p).toContain(`Chosen composition: ${DIRECTIONS[3][0]}. ${DIRECTIONS[3][1]}`);
    expect(p).toContain("Avoid: glitter, doves.");
    expect(p).toMatch(/#630000/);
    expect(p).toContain("Target canvas: 6.25 × 9.25 inches; 1875 × 2775 pixels at 300 DPI.");
  });

  it("has all five directions and every style group of the generator, each styled one with a description", () => {
    expect(DIRECTIONS).toHaveLength(5);
    expect(STYLE_GROUPS.flatMap((g) => g.styles)).toHaveLength(7 + 16 + 6 + 5);
    for (const s of STYLE_GROUPS[0].styles) expect(STYLE_GUIDES[s], s).toBeTruthy();
  });
});

describe("production dimensions (Product Studio's geometry, not a generic formula)", () => {
  const spec = (over: Partial<CoverBrief>) => resolveCoverSpec(titled(over));

  it("6 × 9 front at 300 DPI, no bleed", () => {
    const s = spec({ bleed: 0 });
    expect([s.canvasW, s.canvasH, s.pxW, s.pxH]).toEqual([6, 9, 1800, 2700]);
  });
  it("6 × 9 front at 300 DPI with 0.125 in bleed", () => {
    const s = spec({});
    expect([s.canvasW, s.canvasH, s.pxW, s.pxH]).toEqual([6.25, 9.25, 1875, 2775]);
  });
  it("6 × 9 full wrap with a printer-confirmed spine, with and without bleed", () => {
    const withBleed = spec({ format: "wrap", spine: 0.5 });
    expect([withBleed.canvasW, withBleed.canvasH, withBleed.pxW, withBleed.pxH]).toEqual([12.75, 9.25, 3825, 2775]);
    const flat = spec({ format: "wrap", spine: 0.5, bleed: 0 });
    expect([flat.canvasW, flat.canvasH, flat.pxW, flat.pxH]).toEqual([12.5, 9, 3750, 2700]);
    expect(withBleed.needsSpine).toBe(false);
  });
  it("a custom size, and one the engine refuses", () => {
    const s = spec({ size: "Custom", customW: 5.25, customH: 8 });
    expect([s.trimW, s.trimH, s.pxW, s.pxH]).toEqual([5.25, 8, 1575 + 75, 2400 + 75]);
    const bad = spec({ size: "Custom", customW: 0.4, customH: 8 });
    expect(bad.ok).toBe(false);
    expect(bad.errors.join(" ")).toMatch(/minimum/);
    expect(createBlocker(titled({ size: "Custom", customW: 0.4, customH: 8 }))).toMatch(/minimum/);
  });
  it("a landscape custom size keeps the entered width and height", () => {
    const s = spec({ size: "Custom", customW: 9, customH: 6 });
    expect([s.trimW, s.trimH]).toEqual([9, 6]);
  });

  it("the printer's own bleed is the floor; the binding keep-out raises the safe zone on the punched edge only", () => {
    const small = spec({ bleed: 0.0625 });
    expect(small.bleed).toBe(0.125); // generic commercial print: 0.125 in
    expect(small.bleedNote).toMatch(/at least 0.125/);
    const none = spec({ bleed: 0 });
    expect(none.bleed).toBe(0); // a no-bleed build stays no-bleed, with a warning
    expect(none.warnings.join(" ")).toMatch(/No bleed/);
    const coil = spec({ binding: "Spiral / coil", product: "Planner", size: "7×9" });
    const edges = [coil.safe.top, coil.safe.right, coil.safe.bottom, coil.safe.left];
    expect(Math.max(...edges)).toBeGreaterThan(0.25);
    expect(Math.min(...edges)).toBe(0.25);
    expect(coil.keepOuts.length).toBeGreaterThan(0);
    expect(coil.safeText).toMatch(/where the coil/i);
    // A perfect-bound cover has no interior gutter on it.
    const perfect = spec({});
    expect(new Set(Object.values(perfect.safe)).size).toBe(1);
    expect(perfect.keepOuts).toHaveLength(0);
  });

  it("a larger safe zone entered by the maker wins over a smaller requirement", () => {
    const s = spec({ safe: 0.5 });
    expect(Object.values(s.safe)).toEqual([0.5, 0.5, 0.5, 0.5]);
  });

  it("printer rules: IngramSpark case wrap raises bleed and adds a hinge; KDP offers its published spine formula, never applying it", () => {
    const ingram = spec({ printProfile: "ingramspark", binding: "Case bound", format: "wrap", spine: 0.75 });
    expect(ingram.bleed).toBe(0.625);
    expect(ingram.hinge).toBe(0.5);
    expect(ingram.safeText).toContain("0.5 inches either side of each spine fold");
    expect(ingram.canvasW).toBeCloseTo(12.75 + 2 * 0.625, 6);
    const kdp = spec({ printProfile: "kdp", format: "wrap", pages: 150 });
    expect(kdp.spineSuggestion).toMatchObject({ white: 0.338, cream: 0.375 });
    expect(kdp.spine).toBeNull();
    expect(kdp.needsSpine).toBe(true);
    expect(spec({ printProfile: "kdp", pages: 150 }).spineSuggestion).toBeNull(); // front only: no spine
  });

  it("warns about binding and page-count rules instead of ignoring them", () => {
    expect(spec({ printProfile: "kdp", binding: "Spiral / coil" }).warnings.join(" ")).toMatch(/does not list/);
    expect(spec({ printProfile: "kdp", pages: 10 }).warnings.join(" ")).toMatch(/at least 24 pages/);
    expect(spec({ binding: "Saddle stitch", pages: 30 }).warnings.join(" ")).toMatch(/multiples of 4/);
  });

  it("only bound books can be a full wrap; a bookmark stays front only", () => {
    const s = spec({ product: "Bookmark", size: "2×6", format: "wrap", binding: "Loose / unbound" });
    expect(s.wrap).toBe(false);
    expect(s.needsSpine).toBe(false);
  });

  it("the spec line and note keep the generator's wording", () => {
    const b = titled({ format: "wrap" });
    const s = resolveCoverSpec(b);
    expect(s.note).toBe("Full wrap needs a printer-confirmed spine width. Enter it above to finalize canvas width. Page count alone cannot determine spine width because paper stock and binding vary.");
    expect(specLine(b, s)).toContain("spine printer confirmation required in");
    expect(resolveCoverSpec(titled({ medium: "Digital" })).note).toMatch(/^Digital output uses these pixel dimensions/);
    expect(fmt(6.2500001)).toBe("6.25");
  });
});

describe("guards", () => {
  it("no prompt is built or sent without a title", () => {
    expect(promptBlocker(newBrief())).toMatch(/cover title/);
    expect(promptBlocker(newBrief({ title: "   " }))).toMatch(/cover title/);
    expect(createBlocker(newBrief())).toMatch(/cover title/);
    expect(promptBlocker(titled())).toBeNull();
  });
  it("a full wrap without a printer-confirmed spine cannot be created, but the draft prompt says it is not print-ready", () => {
    const b = titled({ format: "wrap" });
    expect(createBlocker(b)).toBe("Enter the printer-confirmed spine width for a full wrap.");
    expect(promptFor(b, 0)).toContain("Spine width is unconfirmed; this concept is NOT a final print-ready wrap.");
    expect(createBlocker({ ...b, spine: 0.5 })).toBeNull();
  });
  it("the set's items obey the same guards", () => {
    const wrapJournal = titled({ format: "wrap" });
    expect(createBlocker(wrapJournal, { id: "i", product: "Planner", size: "7×9", status: "Idea" })).toMatch(/spine/);
    expect(createBlocker(wrapJournal, { id: "i", product: "Bookmark", size: "2×6", status: "Idea" })).toBeNull();
  });
  it("the ChatGPT handoff carries the full prompt and is honest that it is only a message", () => {
    const m = handoffPrompt(titled(), 1);
    expect(m.startsWith("Please create a polished cover image from this brief.")).toBe(true);
    expect(m.endsWith(promptFor(titled(), 1))).toBe(true);
  });
});

describe("palettes are Product Studio's", () => {
  const known = (id: string) => importedPaletteId(id);

  it("every palette of the standalone generator resolves to a Product Studio palette (66 of 66)", () => {
    expect(GENERATOR_PALETTES).toHaveLength(66);
    for (const g of GENERATOR_PALETTES) expect(known(g.id), `${g.id} (${g.name})`).not.toBeNull();
    expect(new Set(GENERATOR_PALETTES.map((g) => known(g.id))).size).toBeGreaterThanOrEqual(65); // JCS "Dove Signature" shares Product Studio's own
  });
  it("palette ids stay unique; the project color picker gains only Violet + Peach Cloud, the journal palettes are cover-only", () => {
    const ids = COVER_PALETTES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(PALETTES.length).toBe(46 + 1);
    expect(COVER_PALETTES.length).toBe(46 + 1 + 18);
    expect(PALETTES.map((p) => p.id)).toContain("jcs-violet-peach-cloud");
    for (const id of ["jcs-pink-prayer", "jcs-prayer-warrior", "jcs-warring-woman", "jcs-rose-gold"]) {
      expect(ids).toContain(id);
      expect(PALETTES.map((p) => p.id)).not.toContain(id);
    }
  });
  it("the added palettes keep the generator's exact colors", () => {
    const pw = COVER_PALETTES.find((p) => p.id === "jcs-prayer-warrior")!;
    expect(pw.colors.decorBase).toBe("#F3724B");
    expect(pw.colors.decorativeAccent).toBe("#D97904");
    expect(pw.colors.background).toBe("#FFFFFF");
  });
  it("changing the palette changes the prompt; a named palette lists its exact hex values", () => {
    const a = promptFor(titled({ palette: "dove-signature" }), 0);
    const b = promptFor(titled({ palette: "jcs-prayer-warrior" }), 0);
    expect(a).not.toBe(b);
    expect(paletteSpec(titled({ palette: "dove-signature" }))).toContain("exact Dove Signature palette from Product Studio");
    for (const h of paletteColors(titled({ palette: "jcs-prayer-warrior" }))) expect(b).toContain(h);
    expect(paletteSpec(titled({ palette: "variant-sage" }))).toContain("Product Studio drafts");
  });
  it("custom colors are exact, persist with the collection, and change the prompt", () => {
    const b = titled({ palette: "custom", colorPrimary: "#112233", colorAccent: "#AABBCC", colorPaper: "#FFFFFF", colorText: "#000000" });
    expect(promptFor(b, 0)).toContain("main #112233, accent #AABBCC, background #FFFFFF, text #000000");
    const c = newCollection("Custom", b, [], 0);
    localCoverStore.save(c);
    expect(localCoverStore.load(c.id)!.brief).toMatchObject({ palette: "custom", colorPrimary: "#112233", colorAccent: "#AABBCC" });
  });
  it("an unknown palette id falls back to custom colors rather than a guess", () => {
    expect(normalizeBrief({ palette: "no-such-palette", colorPrimary: "#010203" })).toMatchObject({ palette: "custom", colorPrimary: "#010203" });
  });
});

describe("collections: save, reopen, duplicate and recolor, import and export", () => {
  const items: CoverItem[] = STARTER_SET.map((s, i) => ({ id: `i${i}`, product: s.product, size: s.size, status: "Idea" }));

  it("a saved collection reopens with its style, palette, specs, listing notes and items", () => {
    const b = titled({ style: "Peach and gold marble", palette: "jcs-peach-marble", etsyTitle: "Rooted in Hope Journal", tags: "prayer, faith", angle: "For intercessors", status: "Proofing", format: "wrap", spine: 0.62, pages: 160 });
    const c = newCollection("Rooted in Hope", b, items, 3);
    localCoverStore.save(c);
    expect(localCoverStore.list()).toMatchObject([{ id: c.id, name: "Rooted in Hope", items: 4 }]);
    const back = localCoverStore.load(c.id)!;
    expect(back.brief).toEqual(b);
    expect(back.items).toEqual(items);
    expect(back.direction).toBe(3);
    expect(resolveCoverSpec(back.brief).pxW).toBe(resolveCoverSpec(b).pxW);
  });
  it("Duplicate & recolor keeps the original and starts a new variant with editable custom colors", () => {
    const c = newCollection("Rooted in Hope", titled({ palette: "dove-signature" }), items, 1);
    localCoverStore.save(c);
    const copy = duplicateAndRecolor(c);
    expect(copy.id).not.toBe(c.id);
    expect(copy.name).toBe("Rooted in Hope — new palette");
    expect(copy.brief.palette).toBe("custom");
    expect(copy.brief.colorPrimary).toBe("#630000");
    expect(localCoverStore.load(c.id)!.brief.palette).toBe("dove-signature");
    expect(localCoverStore.list()).toHaveLength(1); // the variant is not saved until the maker saves it
  });
  it("exports and imports its own backup, and the standalone generator's", () => {
    const b = titled({ palette: "dove-signature" });
    const back = parseCollectionFile(exportCollectionJson({ brief: b, items, direction: 2 }));
    expect(back.brief).toEqual(b);
    expect(back.items.map((i) => i.product)).toEqual(items.map((i) => i.product));
    expect(back.direction).toBe(2);

    const legacy = JSON.stringify({
      schema: "dove-stationery-v1", saved: "2026-11-13T00:00:00Z", direction: 1,
      brief: { collection: "Old", theme: "Rest", palette: "jcs-dream-journal-peach-marble", style: "Black and gold marble", product: "Planner", size: "7×9", format: "wrap", binding: "Spiral / coil", pages: "90", spine: "0.4", bleed: "0.125", safe: "0.25", medium: "Print", dpi: "300", title: "Rest", customW: "6", customH: "9" },
      items: [{ product: "Journal", size: "6×9", status: "Idea" }],
    });
    const imported = parseCollectionFile(legacy);
    expect(imported.brief).toMatchObject({ palette: "jcs-peach-marble", pages: 90, spine: 0.4, bleed: 0.125, format: "wrap", binding: "Spiral / coil" });
    expect(imported.items).toHaveLength(1);
    expect(imported.items[0].id).toBeTruthy();
  });
  it("refuses a file that is not a collection", () => {
    expect(() => parseCollectionFile("not json")).toThrow(/valid collection/);
    expect(() => parseCollectionFile(JSON.stringify({ brief: {}, items: [] }))).toThrow(/valid collection/);
    expect(() => parseCollectionFile(JSON.stringify({ schema: "something-else", brief: {}, items: [] }))).toThrow(/valid collection/);
  });
  it("an older save with fewer fields opens with the defaults filled in", () => {
    const c = newCollection("Old", titled(), [], 0);
    const { printProfile: _p, ...rest } = c.brief;
    storage.setItem(`dove-product-studio:v1:cover:${c.id}`, JSON.stringify({ ...c, brief: rest }));
    expect(localCoverStore.load(c.id)!.brief.printProfile).toBe("generic-commercial");
  });
  it("the work in progress survives a reload", () => {
    saveDraft({ brief: titled(), items, direction: 4, collectionId: null });
    expect(loadDraft()).toMatchObject({ direction: 4, brief: { title: "Rooted in Hope" } });
  });
  it("set prompts: one per item, in order, separated; products follow the item's own size", () => {
    const out = setPrompts(titled(), items, 0);
    expect(out.split("━━━━━━━━━━━━━━━━━━━━")).toHaveLength(4);
    expect(out).toContain("Create ONE bookmark flat front-cover design");
    expect(out).toContain("Finished trim: 2 × 6 inches");
  });
});

describe("nothing else changes", () => {
  it("saving collections writes only cover keys: projects, their index and sync bookkeeping are untouched", () => {
    const before = TEST_PRODUCTS[0].build();
    localProjectStore.save(before);
    const projectKeys = storage.keys().filter((k) => !k.includes(":cover"));
    localCoverStore.save(newCollection("A", titled(), [], 0));
    saveDraft({ brief: titled(), items: [], direction: 0, collectionId: null });
    expect(storage.keys().filter((k) => !k.includes(":cover"))).toEqual(projectKeys);
    expect(localProjectStore.list().map((p) => p.id)).toEqual([before.id]);
    expect(localProjectStore.load(before.id)).toEqual(before);
    localCoverStore.remove(localCoverStore.list()[0].id);
    expect(localProjectStore.list()).toHaveLength(1);
  });
  it("a cover brief starts from one of the maker's products: trim, binding, printer, pages and palette come across", () => {
    for (const t of TEST_PRODUCTS) {
      const p = t.build();
      const b = briefFromProject(p);
      expect(b.collection).toBe(p.name);
      const s = resolveCoverSpec(b);
      expect(s.ok, p.name).toBe(true);
      expect(PALETTES.some((x) => x.id === b.palette)).toBe(true);
    }
    const journal = TEST_PRODUCTS.find((t) => t.build().productType === "journal")!.build();
    expect(briefFromProject(journal).product).toBe("Journal");
  });
  it("choosing a product moves size and binding to what that product usually is", () => {
    const b = withProduct(newBrief(), "Bookmark");
    expect(b).toMatchObject({ size: "2×6", binding: "Loose / unbound", format: "front" });
  });
});

describe("the screen", () => {
  const html = renderToStaticMarkup(<CoverStudio onBack={() => {}} projects={[]} loadProject={() => null} />);
  it("shows the brief, the live specification, the five directions, the set and the library", () => {
    for (const t of ["Cover Studio", "1 · Collection brief", "2 · Product &amp; print setup", "3 · Cover text &amp; listing", "Live print specification", "Design directions", "Coordinated set", "Collection library"]) expect(html).toContain(t);
    expect((html.match(/data-direction="/g) ?? []).length).toBe(5);
    expect(html).toContain("6.25 × 9.25 in");
    expect(html).toContain("1,875 × 2,775 px");
  });
  it("reuses the studio's palette picker, with named swatches and the exact hex values", () => {
    expect(html).toContain('class="palette-picker"');
    expect(html).toContain('data-testid="palette-hexes"');
    expect(html).toContain("#5B0610");
  });
  it("asks for a title first and says plainly that ChatGPT is a handoff", () => {
    expect(html).toContain("Add a cover title, then choose Generate directions.");
    expect(html).toContain("Product Studio does not make images.");
    expect(html).toMatch(/data-testid="generate-chatgpt"[^>]*disabled|disabled[^>]*data-testid="generate-chatgpt"/);
  });
});

describe("launching ChatGPT", () => {
  it("fills the message box without sending: ?prompt= , never the send-at-once ?q=", () => {
    const m = handoffPrompt(titled(), 0);
    const url = chatgptPromptUrl(m);
    expect(url.startsWith(`${CHATGPT_HOME}?prompt=`)).toBe(true);
    expect(url).not.toContain("?q=");
    expect(decodeURIComponent(url.slice(`${CHATGPT_HOME}?prompt=`.length))).toBe(m);
  });
  it("every prompt the studio can build fits in an address (longest of the matrix)", () => {
    let longest = 0;
    for (const style of STYLE_GROUPS.flatMap((g) => g.styles))
      for (const product of ["Journal", "Notary record book", "Scripture cards"])
        for (const direction of [0, 4]) {
          const b = titled({ style, product, format: "wrap", spine: 0.62, avoid: "generic sunrise, mountains, stacked books, ornate antique borders, clip-art leaves", imagery: "olive branches, dawn light", theme: "Renewal, rest, courage", audience: "Women in ministry", scripture: "Isaiah 40:31" });
          longest = Math.max(longest, chatgptPromptUrl(handoffPrompt(b, direction)).length);
        }
    expect(longest).toBeLessThan(CHATGPT_URL_MAX);
  });
  it("a prompt too long for an address is not launched half-filled: ChatGPT's plain page opens and the prompt is to be pasted", () => {
    const opened: string[] = [];
    const long = "x".repeat(CHATGPT_URL_MAX);
    expect(fitsInAddress(long)).toBe(false);
    expect(launchChatGpt(long, (u) => (opened.push(u), {} as Window))).toBe("too-long");
    expect(opened).toEqual([CHATGPT_HOME]);
    expect(launchChatGpt("short", (u) => (opened.push(u), {} as Window))).toBe("launched");
    expect(opened[1]).toBe(chatgptPromptUrl("short"));
  });
  it("a blocked new tab is reported, not hidden", () => {
    expect(launchChatGpt("short", () => null)).toBe("blocked");
  });
});

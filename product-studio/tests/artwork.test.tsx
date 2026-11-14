/**
 * Uploaded artwork: cover, page background and page illustration — placement
 * (trim, bleed, safe area, binding gutter), dedicated areas the content makes
 * room for, saving and reopening, and the same placement in the preview and
 * the printed pages.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { artworkFor, fullGeometryFor, geometryFor, pageOrdinal, resolveDocument, solvePage, isCoverPage } from "../src/engines/document/resolve";
import { drawRect, edgeAnchor, effectivePpi, placeArtwork, reservedBand, normalizeArtwork, AREA_GAP_IN } from "../src/engines/artwork/place";
import { readHeader, sniffMime, setArtworkUrl, importArtwork } from "../src/engines/artwork/store";
import { planPrint } from "../src/engines/print/printPlan";
import { PrintSheets } from "../src/components/export/PrintDocument";
import { PrintablePage } from "../src/primitives/PrintablePage";
import { createProject } from "../src/presets/products/projectFactory";
import { step, withCovers } from "../src/presets/bookRecipes";
import { migrate } from "../src/persistence/projectStore";
import type { ArtworkAsset, ArtworkPlacement, ProjectArtwork } from "../src/types/artwork";
import type { ProductProject } from "../src/types/project";

const COVER: ArtworkAsset = { id: "cover-art", name: "cover.jpg", mime: "image/jpeg", widthPx: 2700, heightPx: 3450, hasAlpha: false, bytes: 1, addedAt: "2026-11-14T00:00:00Z" };
const WASH: ArtworkAsset = { id: "wash-art", name: "wash.webp", mime: "image/webp", widthPx: 2000, heightPx: 2000, hasAlpha: false, bytes: 1, addedAt: "2026-11-14T00:00:00Z" };
const DOVE: ArtworkAsset = { id: "dove-art", name: "dove.png", mime: "image/png", widthPx: 900, heightPx: 600, hasAlpha: true, bytes: 1, addedAt: "2026-11-14T00:00:00Z" };

function book(art?: ProjectArtwork): ProductProject {
  const p = createProject("planner", {
    name: "Artwork QA",
    dimensions: { sizePresetId: "8.5x11", orientation: "portrait" },
    production: { bindingType: "coil", printProfileId: "coil-generic", duplex: true, includeBleed: true },
    calendar: { startDate: "2027-01-01", endDate: "2027-01-31", weekStart: 1, sixRowMonths: true },
    recipe: {
      items: [],
      ordering: "chronological",
      structure: withCovers([step("monthly-calendar", { type: "monthly" }, { id: "month" }), step("reflection", { type: "copies", count: 3 }, { id: "refl" }), step("lined-journal", { type: "copies", count: 4 }, { id: "lined" })]),
    },
  });
  return art ? { ...p, artwork: art } : p;
}
const coverId = (p: ProductProject) => resolveDocument(p).recipe.pages.find((x) => isCoverPage(x))!.recipeItemId;

function threeUses(p: ProductProject): ProjectArtwork {
  const placements: ArtworkPlacement[] = [
    { id: "c1", use: "cover", assetId: COVER.id, targets: [{ item: coverId(p) }], fit: "fill", crop: { x: 0.5, y: 0.5, zoom: 1 }, mode: "with-title", titleColor: "light" },
    { id: "b1", use: "background", assetId: WASH.id, targets: [{ item: "lined", nth: 1 }, { item: "refl" }], fit: "fill", crop: { x: 0.5, y: 0.5, zoom: 1 }, opacity: 0.4, extent: "bleed" },
    { id: "i1", use: "illustration", assetId: DOVE.id, targets: [{ item: "lined" }], placement: "corner", anchor: "bottom-right", sizeIn: 1.5, offsetXIn: 0, offsetYIn: 0, mirror: true, opacity: 1 },
  ];
  return { assets: [COVER, WASH, DOVE], placements };
}

describe("artwork placement math", () => {
  it("fill covers the box and crops; fit shows the whole image", () => {
    const box = { x: 0, y: 0, w: 8, h: 10 };
    const fill = drawRect(box, 2000, 1000, "fill", { x: 0.5, y: 0.5, zoom: 1 });
    expect(fill.h).toBeCloseTo(10);
    expect(fill.w).toBeCloseTo(20);
    expect(fill.x).toBeCloseTo(-6); // centred: 6 in cropped off each side
    const left = drawRect(box, 2000, 1000, "fill", { x: 0, y: 0.5, zoom: 1 });
    expect(left.x).toBeCloseTo(0); // shows the left edge
    const zoom = drawRect(box, 2000, 1000, "fill", { x: 0.5, y: 0.5, zoom: 2 });
    expect(zoom.h).toBeCloseTo(20);
    const fit = drawRect(box, 2000, 1000, "fit", { x: 0.5, y: 0.5, zoom: 3 });
    expect([fit.w, fit.h]).toEqual([8, 4]); // zoom never applies to "fit"
    expect(fit.y).toBeCloseTo(3);
  });

  it("reports print resolution", () => {
    expect(effectivePpi({ widthPx: 2700, heightPx: 3450 }, { x: 0, y: 0, w: 8.75, h: 11.25 })).toBe(307);
  });
});

describe("cover, background and illustration on the pages", () => {
  const p0 = book();
  const p = { ...p0, artwork: threeUses(p0) };
  const doc = resolveDocument(p);
  const at = (item: string, nth = 0) => doc.recipe.pages.findIndex((x, i) => x.recipeItemId === item && !x.filler && pageOrdinal(doc, i) === nth);

  it("full cover: the whole media box, to the trim plus the bleed", () => {
    const i = doc.recipe.pages.findIndex((x) => isCoverPage(x) && x.module?.type === "cover-page");
    const art = artworkFor(doc, i);
    expect(art.map((a) => a.use)).toEqual(["cover"]);
    const g = geometryFor(doc, doc.recipe.pages[i], i);
    expect(art[0].box).toEqual({ x: 0, y: 0, w: g.mediaWidthIn, h: g.mediaHeightIn });
    expect(g.mediaWidthIn).toBeGreaterThan(g.trimWidthIn); // bleed is on
    // The back cover isn't selected.
    const back = doc.recipe.pages.findIndex((x) => x.module?.type === "back-cover");
    expect(artworkFor(doc, back)).toEqual([]);
  });

  it("background only on the selected pages (every reflection page, and the second lined page)", () => {
    const has = (i: number) => artworkFor(doc, i).some((a) => a.use === "background");
    expect([0, 1, 2].map((n) => has(at("refl", n)))).toEqual([true, true, true]);
    expect([0, 1, 2, 3].map((n) => has(at("lined", n)))).toEqual([false, true, false, false]);
    expect(has(at("month"))).toBe(false);
    expect(artworkFor(doc, at("lined", 1)).find((a) => a.use === "background")!.opacity).toBe(0.4);
  });

  it("corner illustration stays inside the print-safe area and mirrors to the outer edge", () => {
    for (let n = 0; n < 4; n++) {
      const i = at("lined", n);
      const page = doc.recipe.pages[i];
      const g = geometryFor(doc, page, i);
      const ill = artworkFor(doc, i).find((a) => a.use === "illustration")!;
      const sx = g.trimOffset.x + g.safeRect.x, sy = g.trimOffset.y + g.safeRect.y;
      expect(ill.box.x).toBeGreaterThanOrEqual(sx - 1e-9);
      expect(ill.box.y).toBeGreaterThanOrEqual(sy - 1e-9);
      expect(ill.box.x + ill.box.w).toBeLessThanOrEqual(sx + g.safeRect.w + 1e-9);
      expect(ill.box.y + ill.box.h).toBeLessThanOrEqual(sy + g.safeRect.h + 1e-9);
      expect(ill.box.w).toBeCloseTo(1.5);
      expect(ill.box.h).toBeCloseTo(1); // 900 × 600 keeps its shape
      // Bottom-right on a right-hand page; mirrored to bottom-left on a left-hand page (away from the coil).
      const outer = page.side === "verso" ? Math.abs(ill.box.x - sx) : Math.abs(ill.box.x + ill.box.w - (sx + g.safeRect.w));
      expect(outer).toBeLessThan(1e-9);
    }
  });

  it("a mirrored background flips on left-hand pages, keeping its art on the outer edge", () => {
    setArtworkUrl(WASH.id, "data:image/webp;base64,BBBB");
    const art: ProjectArtwork = { assets: [WASH], placements: [{ id: "m", use: "background", assetId: WASH.id, targets: [{ item: "lined" }], fit: "fill", crop: { x: 0.2, y: 0.5, zoom: 1.5 }, opacity: 1, extent: "bleed", mirror: true }] };
    const d = resolveDocument({ ...p0, artwork: art });
    const pages = d.recipe.pages.map((x, i) => [x, i] as const).filter(([x]) => x.recipeItemId === "lined");
    for (const [x, i] of pages) {
      const a = artworkFor(d, i)[0];
      expect(!!a.flipX).toBe(x.side === "verso");
      // The crop is mirrored too: the flipped image covers the box exactly as the unflipped one does.
      expect(a.draw.x).toBeLessThanOrEqual(a.box.x + 1e-9);
      expect(a.draw.x + a.draw.w).toBeGreaterThanOrEqual(a.box.x + a.box.w - 1e-9);
    }
    const [left, li] = pages.find(([x]) => x.side === "verso")!;
    const html = renderToStaticMarkup(<PrintablePage geometry={geometryFor(d, left, li)} solved={solvePage(d, li)} colors={d.colors} typography={d.typography} decorative={d.decorative} background={d.background} spacing={d.spacing} mode="print" art={artworkFor(d, li)} />);
    expect(html).toContain("scale(-1 1)");
  });

  it("art cut along the bottom and right runs off the page there; mirrored and flipped on left-hand pages", () => {
    const cut = { ...DOVE, id: "cut-art", cutEdges: ["bottom", "right"] as ("bottom" | "right")[] };
    const art: ProjectArtwork = { assets: [cut], placements: [{ id: "e", use: "illustration", assetId: cut.id, targets: [{ item: "lined" }], placement: "corner", anchor: "bottom-right", sizeIn: 2.5, offsetXIn: 0, offsetYIn: 0, mirror: true, opacity: 1, toEdge: true }] };
    const d = resolveDocument({ ...p0, artwork: art });
    for (const [x, i] of d.recipe.pages.map((x, i) => [x, i] as const).filter(([x]) => x.recipeItemId === "lined")) {
      const g = fullGeometryFor(d, x, i);
      const a = artworkFor(d, i)[0];
      // Flush with the bottom of the media: past the trim, into the bleed.
      expect(a.box.y + a.box.h).toBeCloseTo(g.mediaHeightIn);
      expect(a.box.y + a.box.h).toBeGreaterThan(g.trimOffset.y + g.trimHeightIn);
      if (x.side === "verso") {
        expect(a.box.x).toBeCloseTo(0); // the outer (left) edge
        expect(a.flipX).toBe(true); // its cut edge faces out
      } else {
        expect(a.box.x + a.box.w).toBeCloseTo(g.mediaWidthIn);
        expect(a.flipX).toBeUndefined();
      }
    }
    expect(edgeAnchor(["bottom", "right"])).toBe("bottom-right");
    expect(edgeAnchor(["bottom"])).toBe("bottom");
    expect(edgeAnchor(["left"])).toBeUndefined();
  });

  it("a safe-area background keeps clear of the binding gutter", () => {
    const i = at("refl", 0);
    const g = fullGeometryFor(doc, doc.recipe.pages[i], i);
    const placed = placeArtwork({ assets: [WASH], placements: [{ id: "s", use: "background", assetId: WASH.id, targets: [{ item: "refl" }], fit: "fill", crop: { x: 0.5, y: 0.5, zoom: 1 }, opacity: 1, extent: "safe" }] }, { item: "refl", nth: 0, side: doc.recipe.pages[i].side, cover: false }, g);
    expect(placed[0].box).toEqual({ x: g.trimOffset.x + g.safeRect.x, y: g.trimOffset.y + g.safeRect.y, w: g.safeRect.w, h: g.safeRect.h });
    expect(Math.max(g.safe.left, g.safe.right)).toBeGreaterThan(0.5); // the coil side is wider
  });

  it("the preview and the printed pages draw the same images at the same places", () => {
    setArtworkUrl(COVER.id, "data:image/jpeg;base64,AAAA");
    setArtworkUrl(WASH.id, "data:image/webp;base64,BBBB");
    setArtworkUrl(DOVE.id, "data:image/png;base64,CCCC");
    const plan = planPrint(doc, doc.project.exportSettings);
    const printed = renderToStaticMarkup(<PrintSheets doc={doc} plan={plan} />);
    const images = (html: string) => [...html.matchAll(/<image href="(data:image\/\w+;base64,(?:AAAA|BBBB|CCCC))" x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/g)].map((m) => m.slice(1).join(" "));
    const editor = doc.recipe.pages
      .map((pg, i) => renderToStaticMarkup(<PrintablePage geometry={geometryFor(doc, pg, i)} solved={solvePage(doc, i)} colors={doc.colors} typography={doc.typography} decorative={doc.decorative} background={doc.background} spacing={doc.spacing} mode="editor" art={artworkFor(doc, i)} />))
      .join("");
    expect(images(printed).length).toBe(1 + 4 + 4); // cover + 3 reflection + 1 lined backgrounds, 4 lined illustrations
    expect(images(editor)).toEqual(images(printed));
    // The cover keeps its title (in light ink) over the artwork and drops its own design.
    const ci = doc.recipe.pages.findIndex((x) => x.module?.type === "cover-page");
    const cover = renderToStaticMarkup(<PrintablePage geometry={geometryFor(doc, doc.recipe.pages[ci], ci)} solved={solvePage(doc, ci)} colors={doc.colors} typography={doc.typography} decorative={doc.decorative} background={doc.background} spacing={doc.spacing} mode="print" art={artworkFor(doc, ci)} />);
    expect(cover).toContain("Plan");
    expect(cover).toContain("--c-text:#ffffff");
  });

  it("a finished cover as-is prints only the artwork", () => {
    const q = { ...p, artwork: { ...p.artwork!, placements: p.artwork!.placements.map((x) => (x.use === "cover" ? { ...x, mode: "as-is" as const } : x)) } };
    const d = resolveDocument(q);
    const ci = d.recipe.pages.findIndex((x) => x.module?.type === "cover-page");
    const html = renderToStaticMarkup(<PrintablePage geometry={geometryFor(d, d.recipe.pages[ci], ci)} solved={solvePage(d, ci)} colors={d.colors} typography={d.typography} decorative={d.decorative} background={d.background} spacing={d.spacing} mode="print" art={artworkFor(d, ci)} />);
    expect(html).toContain('data-art="cover"');
    expect(html).not.toContain(">Plan<");
  });

  it("pages without artwork print exactly as before", () => {
    const plain = resolveDocument(p0);
    const i = at("lined", 0);
    const before = renderToStaticMarkup(<PrintablePage geometry={geometryFor(plain, plain.recipe.pages[i], i)} solved={solvePage(plain, i)} colors={plain.colors} typography={plain.typography} decorative={plain.decorative} background={plain.background} spacing={plain.spacing} mode="print" />);
    const month = at("month");
    const withArtElsewhere = renderToStaticMarkup(<PrintablePage geometry={geometryFor(doc, doc.recipe.pages[month], month)} solved={solvePage(doc, month)} colors={doc.colors} typography={doc.typography} decorative={doc.decorative} background={doc.background} spacing={doc.spacing} mode="print" art={artworkFor(doc, month)} />);
    const monthPlain = renderToStaticMarkup(<PrintablePage geometry={geometryFor(plain, plain.recipe.pages[month], month)} solved={solvePage(plain, month)} colors={plain.colors} typography={plain.typography} decorative={plain.decorative} background={plain.background} spacing={plain.spacing} mode="print" />);
    expect(withArtElsewhere).toBe(monthPlain);
    expect(before).not.toContain("data-layer=\"artwork\"");
  });
});

describe("a dedicated illustration area: the content makes room", () => {
  const p0 = book();
  const area: ProjectArtwork = { assets: [DOVE], placements: [{ id: "a1", use: "illustration", assetId: DOVE.id, targets: [{ item: "month" }, { item: "refl", nth: 2 }], placement: "area", anchor: "top", sizeIn: 1.5, offsetXIn: 0, offsetYIn: 0, mirror: false, opacity: 1 }] };
  const doc = resolveDocument({ ...p0, artwork: area });
  const plain = resolveDocument(p0);

  it("the page's safe area shrinks by the area and its gap; the art sits in the room taken", () => {
    const i = doc.recipe.pages.findIndex((x) => x.recipeItemId === "month" && !x.filler);
    const full = fullGeometryFor(doc, doc.recipe.pages[i], i);
    const laid = geometryFor(doc, doc.recipe.pages[i], i);
    expect(laid.safeRect.y - full.safeRect.y).toBeCloseTo(1.5 + AREA_GAP_IN);
    expect(laid.safeRect.h).toBeCloseTo(full.safeRect.h - 1.5 - AREA_GAP_IN);
    const ill = artworkFor(doc, i)[0];
    expect(ill.box.h).toBeCloseTo(1.5);
    expect(ill.box.y + ill.box.h).toBeLessThanOrEqual(full.trimOffset.y + laid.safeRect.y - AREA_GAP_IN + 1e-9);
    // The calendar is laid out below the area: nothing it draws starts above the new safe top.
    const tops = solvePage(doc, i).nodes.flatMap((n) => ("y" in n && typeof n.y === "number" ? [n.y] : "y1" in n && typeof n.y1 === "number" ? [Math.min(n.y1, (n as { y2: number }).y2)] : []));
    expect(Math.min(...tops)).toBeGreaterThanOrEqual(laid.safeRect.y - 1e-6);
  });

  it("an area covers every page of its item (its content is measured in the same room)", () => {
    const pages = doc.recipe.pages.map((x, i) => [x, i] as const).filter(([x]) => x.recipeItemId === "refl");
    expect(pages.every(([x, i]) => artworkFor(doc, i).length === 1 && geometryFor(doc, x, i).safeRect.h < fullGeometryFor(doc, x, i).safeRect.h)).toBe(true);
    // Pages it doesn't cover are unchanged.
    const li = doc.recipe.pages.findIndex((x) => x.recipeItemId === "lined");
    expect(geometryFor(doc, doc.recipe.pages[li], li)).toEqual(geometryFor(plain, plain.recipe.pages[li], li));
    expect(reservedBand(area, "lined", 9).top).toBe(0);
  });
});

describe("saving and reopening", () => {
  it("artwork and its placements survive a save and reload", () => {
    const p0 = book();
    const p = { ...p0, artwork: threeUses(p0) };
    const back = migrate(JSON.parse(JSON.stringify(p)))!;
    expect(back.artwork).toEqual(p.artwork);
    const d = resolveDocument(back);
    expect(d.recipe.pages.map((_, i) => artworkFor(d, i).map((a) => [a.key, a.box, a.draw]))).toEqual(resolveDocument(p).recipe.pages.map((_, i) => artworkFor(resolveDocument(p), i).map((a) => [a.key, a.box, a.draw])));
  });

  it("projects saved before artwork load unchanged; broken entries are dropped", () => {
    const p = book();
    expect(migrate(JSON.parse(JSON.stringify(p)))!.artwork).toBeUndefined();
    const n = normalizeArtwork({ assets: [DOVE], placements: [{ id: "x", use: "background", assetId: "gone", targets: [], fit: "fill", crop: { x: 0.5, y: 0.5, zoom: 1 }, opacity: 1, extent: "bleed" }] });
    expect(n).toEqual({ assets: [DOVE], placements: [] });
  });
});

describe("reading uploaded files", () => {
  const png = (colorType: number, w = 640, h = 480) => {
    const b = new Uint8Array(33 + 12);
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    new DataView(b.buffer).setUint32(16, w);
    new DataView(b.buffer).setUint32(20, h);
    b[24] = 8;
    b[25] = colorType;
    b.set([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44], 33);
    return b;
  };
  it("PNG: size and transparency", () => {
    expect(sniffMime(png(6))).toBe("image/png");
    expect(readHeader(png(6), "image/png")).toEqual({ widthPx: 640, heightPx: 480, hasAlpha: true });
    expect(readHeader(png(2), "image/png")!.hasAlpha).toBe(false);
  });
  it("JPEG and WebP sizes", () => {
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0x01, 0xe0, 0x02, 0x80, 3, 0, 0, 0, 0]);
    expect(sniffMime(jpg)).toBe("image/jpeg");
    expect(readHeader(jpg, "image/jpeg")).toEqual({ widthPx: 640, heightPx: 480, hasAlpha: false });
    const webp = new Uint8Array(30);
    webp.set([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBPVP8X"), 10, 0, 0, 0, 0x10, 0, 0, 0, 0x7f, 0x02, 0, 0xdf, 0x01, 0]);
    expect(sniffMime(webp)).toBe("image/webp");
    expect(readHeader(webp, "image/webp")).toEqual({ widthPx: 640, heightPx: 480, hasAlpha: true });
  });
  it("refuses files that aren't PNG, JPG or WebP, and keeps a valid file byte for byte", async () => {
    const bad = await importArtwork(Object.assign(new Blob([new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])]), { name: "anim.gif" }));
    expect(bad.ok).toBe(false);
    const good = await importArtwork(Object.assign(new Blob([png(6)]), { name: "corner.png" }));
    expect(good.ok && good.asset).toMatchObject({ name: "corner.png", mime: "image/png", widthPx: 640, heightPx: 480, hasAlpha: true, bytes: 45 });
    const again = await importArtwork(Object.assign(new Blob([png(6)]), { name: "copy.png" }));
    expect(again.ok && good.ok && again.asset.id === good.asset.id).toBe(true); // the same image is stored once
  });
});

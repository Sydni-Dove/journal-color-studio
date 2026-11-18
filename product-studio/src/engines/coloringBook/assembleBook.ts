/**
 * BUILD MY PAGES — the finished coloring book as a Product Studio product, the same one the preview draws and the
 * print file prints (one renderer for both, so the preview is the export).
 *
 *   front matter   title page, copyright page (with the Bible translation's required notice), "This book belongs to"
 *   each scene     the illustration fitted into its area, and only the text the customer chose (engines/cover/assemble)
 *   single-sided   a blank back after every page, so markers don't bleed through
 *   drawing pages  optional "Draw your own picture" pages at the end
 *
 * The cover is its own file (printers take the cover and the interior separately): `assembleCover`.
 */
import { BINDING_TYPE } from "../cover/guides";
import { COLORING_INK, bookTypography, illustrationPlacement, pageBlocks, pageCanvas, pageContentOf } from "../cover/assemble";
import { createProject } from "../../presets/products/projectFactory";
import { step } from "../../presets/bookRecipes";
import { CUSTOM_SIZE_ID, SIZE_PRESETS } from "../../presets/sizes/sizePresets";
import { KDP } from "../../data/research/printerSpecs";
import type { CoverBrief, Scene } from "../cover/brief";
import type { ProductProject } from "../../types/project";
import type { PromptBlock } from "../../types/prompts";
import type { BookStep } from "../../types/recipe";
import type { ArtworkAsset, ArtworkPlacement } from "../../types/artwork";
import { bookTitle, contentOf, formatOf, type ColoringBook } from "./book";
import { licenseCheck, translationOf, verseCount, wordCount } from "./scripture";

/** The brief the pages are assembled and prompted from: the book's content choices, sides and print format applied. */
export function briefFor(book: ColoringBook): CoverBrief {
  const f = formatOf(book.printFormat);
  return {
    ...book.brief,
    category: "character",
    pageContent: { ...book.content, scripture: book.faithBased ? book.content.scripture : "none" },
    blankBacks: book.sides === "single",
    binding: f.binding,
    printProfile: f.printProfile,
    title: bookTitle(book),
  };
}

const page = (id: string, title: string, blocks: PromptBlock[]): BookStep => ({ kind: "step", id, module: "custom", layoutId: "guided-page", cadence: { type: "copies", count: 1 }, title, promptSet: { blocks } });
const blank = (id: string, title: string) => page(id, title, []);

/** Every Bible reference printed in the book (pages that show Scripture). */
export function printedReferences(book: ColoringBook): string[] {
  const b = briefFor(book);
  return b.scenes.flatMap((s) => {
    const c = pageContentOf(b, s)!;
    return c.scripture !== "none" && s.scriptureRef?.trim() ? [s.scriptureRef.trim()] : [];
  });
}

/** The words printed in the book, and how many of them are Scripture (for the translation's free-use limits). */
export function bookWords(book: ColoringBook): { total: number; scripture: number } {
  const b = briefFor(book);
  let total = wordCount(`${bookTitle(book)} ${b.subtitle} ${book.author}`), scripture = 0;
  for (const s of b.scenes) {
    const c = pageContentOf(b, s)!;
    if (c.title) total += wordCount(s.pageTitle ?? s.title);
    if (c.scripture === "full" && s.verseText?.trim()) {
      const w = wordCount(s.verseText);
      total += w;
      scripture += w;
    }
    if (c.scripture !== "none" && s.scriptureRef) total += wordCount(s.scriptureRef);
    if (c.lesson) total += wordCount(s.lessonText ?? "");
    if (c.customText) total += wordCount(s.customText ?? "");
  }
  return { total, scripture };
}

/** The copyright page's wording: the year, the author, the translation's notice when it is quoted. */
export function copyrightLines(book: ColoringBook, year = new Date().getFullYear()): string[] {
  const t = translationOf(book.brief.translation);
  const quoted = book.faithBased && printedReferences(book).length > 0;
  return [
    `Copyright © ${year}${book.author.trim() ? ` ${book.author.trim()}` : ""}. All rights reserved.`,
    "No part of this book may be reproduced without permission, except that the buyer may copy pages for their own family's or classroom's personal coloring.",
    ...(quoted && !t.publicDomain ? [t.notice ?? `Scripture quotations are from the ${t.label}.`] : quoted ? [`Scripture quotations are from the ${t.label.replace(/ — public domain$/, "")}, which is in the public domain.`] : []),
  ];
}

/** The book's pages: front matter, the scenes (with blank backs when single-sided) and the drawing pages. */
export function bookStructure(book: ColoringBook): BookStep[] {
  const b = briefFor(book);
  const t = b.pageTypography;
  // Fonts and sizes from the product's typography (bookTypography); only the title page's larger title sets its own size.
  const head = (id: string, label: string, size?: number): PromptBlock => ({ id, kind: "heading", label, textStyle: "title", headingAlign: "center", ...(size && size !== t.titleSizePt ? { headingSizePt: size } : {}) });
  const body = (id: string, label: string): PromptBlock => ({ id, kind: "heading", label, textStyle: "body", headingAlign: "center" });
  const single = book.sides === "single";
  const out: BookStep[] = [];
  const fm = book.frontMatter;
  if (fm.titlePage) {
    out.push(page("front-title", "Title page", [
      { id: "sp1", label: "", space: "fill", responseStyle: "blank", weight: 2 },
      head("t", bookTitle(book) || "Untitled coloring book", Math.max(30, t.titleSizePt + 12)),
      ...(b.subtitle.trim() ? [body("st", b.subtitle.trim())] : []),
      ...(book.author.trim() ? [body("au", book.author.trim())] : []),
      { id: "sp2", label: "", space: "fill", responseStyle: "blank", weight: 3 },
    ]));
    // The copyright page is the title page's back; without one, a single-sided title page has a blank back.
    if (!fm.copyrightPage && single) out.push(blank("front-title-back", "Back of the title page (blank)"));
  }
  if (fm.copyrightPage) {
    out.push(page("front-copyright", "Copyright page", [
      { id: "sp", label: "", space: "fill", responseStyle: "blank", weight: 4 },
      ...copyrightLines(book).map((l, i) => body(`c${i}`, l)),
    ]));
  }
  if (fm.belongsTo) {
    out.push(page("front-belongs", "This book belongs to", [
      { id: "sp1", label: "", space: "fill", responseStyle: "blank", weight: 2 },
      head("b", "This book belongs to"),
      { id: "line", label: "", space: "fixed", lineCount: 1, responseStyle: "ruled" },
      { id: "sp2", label: "", space: "fill", responseStyle: "blank", weight: 3 },
    ]));
    if (single) out.push(blank("front-belongs-back", "Back of “This book belongs to” (blank)"));
  }
  b.scenes.forEach((s, i) => {
    out.push(page(`scene-${s.id}`, `Scene ${i + 1}: ${s.pageTitle ?? s.title}`, pageBlocks(b, s)));
    if (single) out.push(blank(`back-${s.id}`, `Back of scene ${i + 1} (blank)`));
  });
  for (let i = 0; i < book.drawingPages; i++) {
    out.push(page(`draw-${i + 1}`, `Draw your own picture ${i + 1}`, [head("d", "Draw your own picture"), { id: "frame", label: "", space: "fill", responseStyle: "blank", frame: "outline" }]));
    if (single) out.push(blank(`draw-${i + 1}-back`, `Back of drawing page ${i + 1} (blank)`));
  }
  return out;
}

/** The scene a step id belongs to (a scene page or its blank back), or null for front matter and drawing pages. */
export function sceneOfStep(book: ColoringBook, stepId: string): Scene | null {
  const id = /^(?:scene|back)-(.+)$/.exec(stepId)?.[1];
  return id ? book.brief.scenes.find((s) => s.id === id) ?? null : null;
}

function sizeOf(b: CoverBrief) {
  const pg = pageCanvas(b);
  const preset = SIZE_PRESETS.find((z) => z.unit === "in" && Math.min(z.short, z.long) === Math.min(pg.trimW, pg.trimH) && Math.max(z.short, z.long) === Math.max(pg.trimW, pg.trimH));
  return preset ? { sizePresetId: preset.id, orientation: "portrait" as const } : { sizePresetId: CUSTOM_SIZE_ID, custom: { width: pg.trimW, height: pg.trimH, unit: "in" as const }, orientation: "portrait" as const };
}

/** The scenes' uploaded illustrations as artwork assets (the files themselves are in the artwork store). */
export function sceneAssets(b: CoverBrief): ArtworkAsset[] {
  return b.scenes.flatMap((s) => (s.illustrationId ? [{ id: s.illustrationId, name: s.illustrationName ?? "illustration", mime: "image/png" as const, widthPx: s.illustrationW ?? 1, heightPx: s.illustrationH ?? 1, hasAlpha: false, bytes: 0, addedAt: "" }] : []));
}

/** The finished interior: every page of the book, its illustrations placed. `id` keeps the same product when rebuilt. */
export function assembleInterior(book: ColoringBook, id?: string): ProductProject {
  const b = briefFor(book);
  const f = formatOf(book.printFormat);
  const project = createProject("custom", {
    name: `${bookTitle(book) || "Coloring book"} — interior`,
    dimensions: sizeOf(b),
    production: { bindingType: BINDING_TYPE[f.binding] ?? "perfect-bound", printProfileId: f.printProfile, duplex: true, includeBleed: false, userMargins: { top: b.safe, bottom: b.safe, outside: b.safe, inside: b.gutter } },
    // Black-and-white pages: the title and every word print in black ink, never the palette's maroon.
    colors: { paletteId: "dove-signature", paper: "white", overrides: COLORING_INK },
    recipe: { items: [], ordering: "sequential", structure: bookStructure(book) },
  } as never) as ProductProject;
  const assets = sceneAssets(b);
  const placements: ArtworkPlacement[] = b.scenes.flatMap((s) => (s.illustrationId ? [illustrationPlacement(b, s)] : []));
  // Fonts and sizes as the product's own typography, so Style → Typography in the editor changes every page.
  const typed = { ...project, typography: bookTypography(b) };
  const out = placements.length ? { ...typed, artwork: { assets, placements } } : typed;
  return id ? { ...out, id } : out;
}

/** The front cover as a product page: the uploaded cover artwork, with the title and subtitle as editable text over it (or as-is). */
export function assembleCover(book: ColoringBook, id?: string): ProductProject {
  const b = briefFor(book);
  const cover = step("cover-page", { type: "once" }, {
    id: "front-cover", title: bookTitle(book) || "Coloring book",
    cover: { preset: "plain", subtitle: b.subtitle, showText: book.cover.mode === "with-title", alignment: "center", position: "upper" },
  });
  const project = createProject("custom", {
    name: `${bookTitle(book) || "Coloring book"} — front cover`,
    dimensions: sizeOf(b),
    production: { bindingType: "none", printProfileId: "generic-commercial", duplex: false, includeBleed: true },
    colors: { paletteId: b.palette === "custom" ? "dove-signature" : b.palette },
    recipe: { items: [], ordering: "sequential", structure: [cover] },
  } as never) as ProductProject;
  const art = book.cover.front;
  const out: ProductProject = art
    ? {
        ...project,
        artwork: {
          assets: [{ id: art.id, name: art.name, mime: "image/png", widthPx: art.w || 1, heightPx: art.h || 1, hasAlpha: false, bytes: 0, addedAt: "" }],
          placements: [{ id: "cover-art", use: "cover", assetId: art.id, targets: [{ item: "front-cover" }], fit: "fill", crop: { x: 0.5, y: 0.5, zoom: 1 }, mode: book.cover.mode, titleColor: "dark" }],
        },
      }
    : project;
  return id ? { ...out, id } : out;
}

/** The interior's page count as printed (front matter, scenes, blank backs, drawing pages). */
export const interiorPageCount = (book: ColoringBook) => bookStructure(book).length;

/** KDP paperback cover: the full wrap (back, spine, front) for this page count on white paper. */
export function kdpWrap(book: ColoringBook): { spineIn: number; widthIn: number; heightIn: number; spineText: boolean; pages: number } {
  const pg = pageCanvas(briefFor(book));
  const pages = interiorPageCount(book) + (interiorPageCount(book) % 2);
  const spineIn = +(pages * KDP.spinePerPage.white.value).toFixed(4);
  return { spineIn, widthIn: +(0.125 + pg.trimW + spineIn + pg.trimW + 0.125).toFixed(4), heightIn: +(pg.trimH + 0.25).toFixed(4), spineText: pages >= KDP.spineTextMinPages, pages };
}

/** The translation's free-use limits against this book (null when no Scripture is printed). */
export function bookLicense(book: ColoringBook) {
  const refs = printedReferences(book);
  if (!book.faithBased || !refs.length) return null;
  const w = bookWords(book);
  return licenseCheck(book.brief.translation, refs, w.scripture, w.total);
}

export { contentOf, verseCount };

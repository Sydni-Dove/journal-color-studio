/**
 * COLORING BOOK PAGE ASSEMBLY — Product Studio, not the image generator, lays out each page:
 *   the image generator makes a text-free black-and-white illustration;
 *   Product Studio adds the editable page title, Scripture reference (and verse wording once verified), lesson
 *   text, fonts, placement, margins, the binding gutter, page numbers and the final print-ready PDF.
 *
 * `assembleColoringBook` builds that product (one Custom Page per scene: title, an empty illustration area, the
 * verse; a worksheet adds lesson text and answer lines, a drawing page a framed drawing area). The illustration is
 * placed by the studio's own artwork engine: an image at the exact page-canvas size fills the page (its white space
 * was reserved for the text); any other image is fitted proportionally into the illustration area — never stretched,
 * never cropped, clear of the text and the binding gutter.
 *
 * `artRegion` measures that layout, so each prompt tells the image generator exactly which part of the page to keep
 * white — the same numbers Product Studio uses when it assembles the page.
 */
import { artworkFor, pictureAreaOf, resolveDocument, geometryFor } from "../document/resolve";
import { effectivePpi } from "../artwork/place";
import { BUBBLE_VERSE_PT } from "../../layouts/book/coloringLettering";
import { BINDING_TYPE } from "./guides";
import { resolveCoverSpec } from "./spec";
import { createProject } from "../../presets/products/projectFactory";
import { CUSTOM_SIZE_ID, SIZE_PRESETS } from "../../presets/sizes/sizePresets";
import { DEFAULT_FONTS } from "../../presets/typography/typography";
import type { ProductProject } from "../../types/project";
import type { PromptBlock } from "../../types/prompts";
import type { BookStep } from "../../types/recipe";
import type { ArtworkAsset, ArtworkPlacement } from "../../types/artwork";
import type { CoverBrief, PageOutput, Scene } from "./brief";

/** A coloring page's words are black like its line art: titles, verse, lessons, rules and lines. */
export const COLORING_INK = { primary: "#000000", secondary: "#000000", accent: "#000000", text: "#000000", mutedText: "#000000", line: "#000000", border: "#000000" } as const;

/** Verse, lesson and custom text on a Coloring Book page (13 pt: children read it), unless the maker sets a size. */
export const BOOK_TEXT_PT = 13;
/** The verse size chosen for this book's pages. */
export const bookTextPt = (b: CoverBrief) => b.pageTypography.textSizePt ?? BOOK_TEXT_PT;
/** Sizes offered for the verse and other page text. */
export const BOOK_TEXT_SIZES = [10, 11, 12, 13, 14, 16, 18, 20];

/**
 * A Coloring Book's typography, as the product's own Style → Typography (not pinned on each line of text): the title
 * font and size, and the verse / lesson font at 13 pt. Changing Typography in the editor then changes every page.
 */
export function bookTypography(b: CoverBrief): ProductProject["typography"] {
  const t = b.pageTypography;
  return {
    fonts: { ...DEFAULT_FONTS, headings: t.titleFont, body: t.scriptureFont },
    roleOverrides: { pageTitle: { sizePt: t.titleSizePt }, body: { sizePt: bookTextPt(b) } },
  };
}

export type Rect = { x: number; y: number; w: number; h: number };

/** The page the coloring book is printed on: trim, DPI and its pixel canvas. */
export function pageCanvas(b: CoverBrief): { trimW: number; trimH: number; dpi: number; pxW: number; pxH: number } {
  const spec = resolveCoverSpec({ ...b, format: "front" });
  const trimW = spec.trimW || 8.5, trimH = spec.trimH || 11;
  return { trimW, trimH, dpi: b.dpi, pxW: Math.round(trimW * b.dpi), pxH: Math.round(trimH * b.dpi) };
}

const outputOf = (b: CoverBrief, s: Scene): PageOutput => s.output ?? b.output;

/** What a page shows in a Coloring Book: the book's choice with the page's own on top (null outside a Coloring Book). */
export const pageContentOf = (b: CoverBrief, s: Scene) => (b.pageContent ? { ...b.pageContent, ...(s.content ?? {}) } : null);

/**
 * The words Product Studio prints for the verse.
 *   Cover Studio: the reference, plus the wording only once it is verified.
 *   Coloring Book: nothing when the page shows no Scripture; the reference alone when it shows the reference; the
 *   full verse ("wording" — Reference (Translation)) only once the customer approved this page's wording. Until then
 *   the reference stands alone, and the book's review lists the page as missing its approved verse.
 */
/** Short excerpts are offered for the King James Version only (public domain: its wording may be shortened). */
export const excerptAllowed = (b: CoverBrief) => b.translation === "KJV";

/** The verse words this page prints: the approved verse, or the maker's short excerpt of it (KJV only). */
export function verseWords(b: CoverBrief, s: Scene): string {
  const full = s.verseApproved && s.verseText?.trim() ? s.verseText.trim() : "";
  if (!full) return "";
  const excerpt = s.verseUse === "excerpt" && excerptAllowed(b) ? s.verseExcerpt?.trim() : "";
  return (excerpt || full).replace(/^["“]|["”]$/g, "");
}

/** Does the excerpt keep the verse's own words, in order (nothing added or reworded)? */
export function excerptFromVerse(excerpt: string, verse: string): boolean {
  const words = (t: string) => t.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(Boolean);
  const v = words(verse);
  let i = 0;
  for (const w of words(excerpt)) {
    while (i < v.length && v[i] !== w) i++;
    if (i === v.length) return false;
    i++;
  }
  return words(excerpt).length > 0;
}

/** The layout a scene's page uses. */
export const sceneLayoutId = (b: CoverBrief) => (b.pageTypography.letterStyle === "bubble" && b.pageContent ? "coloring-lettering" : "guided-page");

export function verseLine(b: CoverBrief, s: Scene): string {
  const content = pageContentOf(b, s);
  const ref = (s.scriptureRef || (content ? "" : b.scripture) || "").trim();
  if (!ref || content?.scripture === "none") return "";
  if (content) {
    const words = content.scripture === "full" ? verseWords(b, s) : "";
    // The reference on its own line under the words (no dash before it).
    return words ? `“${words}”\n${ref} (${b.translation})` : `${ref} (${b.translation})`;
  }
  const words = b.verseVerified && s.verseText?.trim() ? `${s.verseText.trim()} ` : "";
  return `${words}${ref} (${b.translation})`;
}

/** The page's sections, in order: title and verse where the text placement puts them, the illustration area between. */
export function pageBlocks(b: CoverBrief, s: Scene, withText = true): PromptBlock[] {
  const t = b.pageTypography;
  const output = outputOf(b, s);
  const content = pageContentOf(b, s);
  if (content) return bookPageBlocks(b, s, content, withText);
  const title: PromptBlock = { id: "title", kind: "heading", label: (s.pageTitle ?? s.title).trim() || " ", textStyle: "title", headingAlign: t.align, headingFont: t.titleFont, headingSizePt: t.titleSizePt };
  // A verse lettered into the artwork isn't typeset again.
  const verseText = (s.scriptureMode ?? b.scriptureMode) === "art" ? "" : verseLine(b, s);
  const verse: PromptBlock | null = verseText ? { id: "verse", kind: "heading", label: verseText, textStyle: "body", headingAlign: t.align, headingFont: t.scriptureFont } : null;
  const art: PromptBlock = { id: "art", label: "", space: "fill", responseStyle: "blank", weight: output === "drawing-page" ? 1 : 3 };
  const extra: PromptBlock[] =
    output === "worksheet"
      ? [
          ...(s.lessonText?.trim() ? [{ id: "lesson", kind: "heading", label: s.lessonText.trim(), textStyle: "body", headingAlign: t.align, headingFont: t.scriptureFont } as PromptBlock] : []),
          { id: "answer", label: "", space: "fixed", lineCount: 4, responseStyle: "ruled" },
        ]
      : output === "drawing-page"
        ? [{ id: "draw", label: "", space: "fill", responseStyle: "blank", frame: "outline", weight: 2 }]
        : [];
  if (!withText || b.textPlacement === "none") return [art, ...extra];
  switch (b.textPlacement) {
    case "top":
      return [title, ...(verse ? [verse] : []), art, ...extra];
    case "bottom":
      return [art, ...extra, title, ...(verse ? [verse] : [])];
    default:
      return [title, art, ...extra, ...(verse ? [verse] : [])];
  }
}

/**
 * A Coloring Book page: only what the customer chose to show. A part that is switched off, or empty, is not on the
 * page at all (no label, heading, placeholder or reserved space).
 */
function bookPageBlocks(b: CoverBrief, s: Scene, c: NonNullable<ReturnType<typeof pageContentOf>>, withText: boolean): PromptBlock[] {
  const t = b.pageTypography;
  // Fonts and sizes come from the product's typography (bookTypography), so Style → Typography in the editor changes them.
  const text = (id: string, label: string, style: "title" | "body"): PromptBlock => ({ id, kind: "heading", label, textStyle: style, headingAlign: t.align });
  const titleText = (s.pageTitle ?? s.title).trim();
  const verse = (s.scriptureMode ?? b.scriptureMode) === "art" ? "" : verseLine(b, s);
  const art: PromptBlock = { id: "art", label: "", space: "fill", responseStyle: "blank", weight: 3 };
  if (b.pageTypography.letterStyle === "bubble") {
    // Bubble letters: title, verse words and reference as separate pieces, all under the picture.
    if (!withText) return [art];
    const ref = (s.scriptureRef ?? "").trim();
    const lettered = (s.scriptureMode ?? b.scriptureMode) === "art" || c.scripture === "none" || !ref;
    const words = !lettered && c.scripture === "full" ? verseWords(b, s) : "";
    return [
      art,
      ...(c.title && titleText ? [{ id: "title", kind: "heading", label: titleText, textStyle: "title" } as PromptBlock] : []),
      ...(words ? [{ id: "verse", kind: "heading", label: words, textStyle: "body", headingSizePt: b.pageTypography.bubbleVersePt ?? BUBBLE_VERSE_PT } as PromptBlock] : []),
      // The reference alone (KJV and other translations named by abbreviation), no dash.
      ...(!lettered ? [{ id: "ref", kind: "heading", label: b.translation === "KJV" ? ref : `${ref} (${b.translation})`, textStyle: "body" } as PromptBlock] : []),
    ];
  }
  const parts = {
    title: c.title && titleText ? [text("title", titleText, "title")] : [],
    rest: [
      ...(verse ? [text("verse", verse, "body")] : []),
      ...(c.lesson && s.lessonText?.trim() ? [text("lesson", s.lessonText.trim(), "body")] : []),
      ...(c.customText && s.customText?.trim() ? [text("custom", s.customText.trim(), "body")] : []),
    ],
  };
  if (!withText || b.textPlacement === "none") return [art];
  switch (b.textPlacement) {
    case "top":
      return [...parts.title, ...parts.rest, art];
    case "top-and-bottom":
      return [...parts.title, art, ...parts.rest];
    default:
      return [art, ...parts.title, ...parts.rest];
  }
}

/** The coloring book as a Product Studio product: one Custom Page per scene, on the brief's page, margins and gutter. */
export function assembleColoringBook(b: CoverBrief, scenes: Scene[] = b.scenes, assets: ArtworkAsset[] = []): ProductProject {
  const page = pageCanvas(b);
  const preset = SIZE_PRESETS.find((z) => z.unit === "in" && Math.min(z.short, z.long) === Math.min(page.trimW, page.trimH) && Math.max(z.short, z.long) === Math.max(page.trimW, page.trimH));
  const structure: BookStep[] = scenes.flatMap((s, i): BookStep[] => [
    {
      kind: "step", id: `scene-${s.id}`, module: "custom", layoutId: sceneLayoutId(b), cadence: { type: "copies", count: 1 },
      title: `Scene ${i + 1}: ${s.title}`, promptSet: { blocks: pageBlocks(b, s) },
    },
    // Each picture on its own sheet: the back stays blank (a one-page preview of a scene has no back).
    ...(b.blankBacks && scenes.length > 1
      ? [{ kind: "step" as const, id: `back-${s.id}`, module: "custom" as const, layoutId: "guided-page", cadence: { type: "copies" as const, count: 1 }, title: `Back of scene ${i + 1} (blank)`, promptSet: { blocks: [] } }]
      : []),
  ]);
  const project = createProject("custom", {
    name: b.collection || b.title || "Coloring book",
    dimensions: preset ? { sizePresetId: preset.id, orientation: "portrait" } : { sizePresetId: CUSTOM_SIZE_ID, custom: { width: page.trimW, height: page.trimH, unit: "in" }, orientation: "portrait" },
    production: { bindingType: BINDING_TYPE[b.binding] ?? "perfect-bound", printProfileId: b.printProfile, duplex: true, includeBleed: false, userMargins: { top: b.safe, bottom: b.safe, outside: b.safe, inside: b.gutter } },
    // Black-and-white pages: the title and every word print in black ink, never the palette's maroon.
    colors: { paletteId: "dove-signature", paper: "white", overrides: COLORING_INK },
    recipe: { items: [], ordering: "sequential", structure },
  } as never) as ProductProject;
  // A Coloring Book page takes its fonts and sizes from the product's typography (see bookTypography).
  // Cover Studio's own pages: the verse size too, when one is chosen.
  const withSize = b.pageContent
    ? { ...project, typography: bookTypography(b) }
    : b.pageTypography.textSizePt
      ? { ...project, typography: { ...project.typography, roleOverrides: { ...project.typography.roleOverrides, body: { ...project.typography.roleOverrides.body, sizePt: b.pageTypography.textSizePt } } } }
      : project;
  const placements: ArtworkPlacement[] = scenes.flatMap((s) => {
    if (!s.illustrationId || !assets.some((a) => a.id === s.illustrationId)) return [];
    return [illustrationPlacement(b, s)];
  });
  return placements.length ? { ...withSize, artwork: { assets: assets.filter((a) => placements.some((p) => p.assetId === a.id)), placements } } : withSize;
}

/** The size the generated illustration should be: the whole page canvas. */
export const isPageCanvas = (b: CoverBrief, w?: number, h?: number) => {
  const c = pageCanvas(b);
  return !!w && !!h && Math.abs(w - c.pxW) <= 2 && Math.abs(h - c.pxH) <= 2;
};

/**
 * Where a scene's illustration goes: an image at the exact page-canvas size covers the page (its white space is
 * where the text goes); any other image is fitted, whole and in proportion, into the illustration area.
 */
export function illustrationPlacement(b: CoverBrief, s: Scene): ArtworkPlacement {
  const exact = isPageCanvas(b, s.illustrationW, s.illustrationH);
  return {
    id: `art-${s.id}`, use: "background", assetId: s.illustrationId!, targets: [{ item: `scene-${s.id}` }], fit: "fit", crop: { x: 0.5, y: 0.5, zoom: 1 }, opacity: 1,
    extent: exact ? "bleed" : "region", ...(exact ? {} : { region: artRegion(b, s).rect }),
  };
}

export type ArtRegion = {
  /** The illustration area in trim inches: between the text, inside the outer margins, clear of the binding gutter on either side. */
  rect: Rect;
  /** The same in pixels on the page canvas. */
  px: { left: number; top: number; right: number; bottom: number };
  /** White space reserved for the text, in pixels from the top and bottom of the canvas (0 = none). */
  topTextPx: number;
  bottomTextPx: number;
  canvas: { pxW: number; pxH: number };
};

/**
 * How sharply a scene's illustration prints, in pixels per inch, measured where the finished page actually draws it
 * (the whole page, or fitted between the title and verse at the current text size). Null without an illustration.
 * Every screen that shows a print-sharpness number uses this one, so they always agree.
 */
export function illustrationPpi(b: CoverBrief, s: Scene): number | null {
  if (!s.illustrationId || !s.illustrationW || !s.illustrationH) return null;
  const asset: ArtworkAsset = { id: s.illustrationId, name: s.illustrationName ?? "illustration", widthPx: s.illustrationW, heightPx: s.illustrationH, mime: "image/png", bytes: 0, addedAt: "", hasAlpha: false } as ArtworkAsset;
  const one = assembleColoringBook(b, [s], [asset]);
  const doc = resolveDocument(one);
  const i = doc.recipe.pages.findIndex((p) => !p.filler);
  const art = i >= 0 ? artworkFor(doc, i).find((a) => a.use === "background") : undefined;
  return art ? effectivePpi(asset, art.draw) : null;
}

/** Measures the assembled page: the illustration area and the text space around it, in inches and pixels. */
export function artRegion(b: CoverBrief, s: Scene): ArtRegion {
  const one = assembleColoringBook(b, [s]);
  const doc = resolveDocument(one);
  const i = doc.recipe.pages.findIndex((p) => !p.filler);
  const g = geometryFor(doc, doc.recipe.pages[i], i);
  // The same picture area the printed page uses (pictureAreaOf), so every check measures the same box.
  const area = pictureAreaOf(doc, i);
  const rect = area ?? { x: g.safeRect.x, y: g.safeRect.y, w: g.safeRect.w, h: g.safeRect.h };
  const y0 = rect.y, y1 = rect.y + rect.h;
  const c = pageCanvas(b);
  const px = (v: number) => Math.round(v * c.dpi);
  const hasTop = b.textPlacement !== "none" && b.textPlacement !== "bottom" && y0 > g.safeRect.y + 0.01;
  const hasBottom = b.textPlacement !== "none" && b.textPlacement !== "top" && y1 < g.safeRect.y + g.safeRect.h - 0.01;
  return {
    rect,
    px: { left: px(rect.x), top: px(rect.y), right: px(rect.x + rect.w), bottom: px(rect.y + rect.h) },
    topTextPx: hasTop ? px(y0) : 0,
    bottomTextPx: hasBottom ? c.pxH - px(y1) : 0,
    canvas: { pxW: c.pxW, pxH: c.pxH },
  };
}

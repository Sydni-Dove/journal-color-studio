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
import { resolveDocument, solvePage, geometryFor } from "../document/resolve";
import { BINDING_TYPE } from "./guides";
import { resolveCoverSpec } from "./spec";
import { createProject } from "../../presets/products/projectFactory";
import { CUSTOM_SIZE_ID, SIZE_PRESETS } from "../../presets/sizes/sizePresets";
import type { ProductProject } from "../../types/project";
import type { PromptBlock } from "../../types/prompts";
import type { BookStep } from "../../types/recipe";
import type { ArtworkAsset, ArtworkPlacement } from "../../types/artwork";
import type { CoverBrief, PageOutput, Scene } from "./brief";

export type Rect = { x: number; y: number; w: number; h: number };

/** The page the coloring book is printed on: trim, DPI and its pixel canvas. */
export function pageCanvas(b: CoverBrief): { trimW: number; trimH: number; dpi: number; pxW: number; pxH: number } {
  const spec = resolveCoverSpec({ ...b, format: "front" });
  const trimW = spec.trimW || 8.5, trimH = spec.trimH || 11;
  return { trimW, trimH, dpi: b.dpi, pxW: Math.round(trimW * b.dpi), pxH: Math.round(trimH * b.dpi) };
}

const outputOf = (b: CoverBrief, s: Scene): PageOutput => s.output ?? b.output;

/** The words Product Studio prints for the verse: the reference, plus the wording only once it is verified. */
export function verseLine(b: CoverBrief, s: Scene): string {
  const ref = (s.scriptureRef || b.scripture || "").trim();
  if (!ref) return "";
  const words = b.verseVerified && s.verseText?.trim() ? `${s.verseText.trim()} ` : "";
  return `${words}${ref} (${b.translation})`;
}

/** The page's sections, in order: title and verse where the text placement puts them, the illustration area between. */
export function pageBlocks(b: CoverBrief, s: Scene, withText = true): PromptBlock[] {
  const t = b.pageTypography;
  const output = outputOf(b, s);
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

/** The coloring book as a Product Studio product: one Custom Page per scene, on the brief's page, margins and gutter. */
export function assembleColoringBook(b: CoverBrief, scenes: Scene[] = b.scenes, assets: ArtworkAsset[] = []): ProductProject {
  const page = pageCanvas(b);
  const preset = SIZE_PRESETS.find((z) => z.unit === "in" && Math.min(z.short, z.long) === Math.min(page.trimW, page.trimH) && Math.max(z.short, z.long) === Math.max(page.trimW, page.trimH));
  const structure: BookStep[] = scenes.flatMap((s, i): BookStep[] => [
    {
      kind: "step", id: `scene-${s.id}`, module: "custom", layoutId: "guided-page", cadence: { type: "copies", count: 1 },
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
    colors: { paletteId: "dove-signature", paper: "white" },
    recipe: { items: [], ordering: "sequential", structure },
  } as never) as ProductProject;
  const withSize = project;
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

/** Measures the assembled page: the illustration area and the text space around it, in inches and pixels. */
export function artRegion(b: CoverBrief, s: Scene): ArtRegion {
  const one = assembleColoringBook(b, [s]);
  const doc = resolveDocument(one);
  const i = doc.recipe.pages.findIndex((p) => !p.filler);
  const g = geometryFor(doc, doc.recipe.pages[i], i);
  const art = solvePage(doc, i).nodes.find((n) => n.type === "group" && /-art$/.test(n.id)) as { rect: Rect } | undefined;
  const side = Math.max(b.gutter, b.safe, g.safe.left, g.safe.right);
  const y0 = art?.rect.y ?? g.safeRect.y, y1 = art ? art.rect.y + art.rect.h : g.safeRect.y + g.safeRect.h;
  const rect = { x: side, y: y0, w: g.trimWidthIn - 2 * side, h: y1 - y0 };
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

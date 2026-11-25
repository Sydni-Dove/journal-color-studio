/**
 * Putting finished lettering on a page — always on a COPY of the project ("… (with lettering)"), so a finished project
 * is never changed or overwritten. The lettering PNG becomes one of the copy's artwork pictures, placed on one printed
 * page: a band across the top or bottom (the page's content moves out of its way), or centred on the page.
 */
import { duplicateProject } from "../../persistence/projectStore";
import { geometryFor, resolveDocument } from "../document/resolve";
import type { ArtworkAsset, ArtworkPlacement } from "../../types/artwork";
import type { ProductProject } from "../../types/project";

/** top / bottom: a band; page: centred in the safe area; full: a whole-page image (its own margins and bleed) on the page. */
export type LetteringPosition = "top" | "bottom" | "page" | "full";

/** The project's printed pages, each with its Pages-list item and which of that item's pages it is. */
export function pagesOf(p: ProductProject): { item: string; nth: number; label: string; safeWidthIn: number; safeHeightIn: number }[] {
  const doc = resolveDocument(p);
  const seen = new Map<string, number>();
  return doc.recipe.pages.flatMap((pg, i) => {
    if (pg.filler) return [];
    const nth = seen.get(pg.recipeItemId) ?? 0;
    seen.set(pg.recipeItemId, nth + 1);
    const g = geometryFor(doc, pg, i);
    const title = (pg as { title?: string }).title;
    return [{ item: pg.recipeItemId, nth, label: `Page ${pg.pageNumber}${title ? ` · ${title}` : ""}`, safeWidthIn: g.safeRect.w, safeHeightIn: g.safeRect.h }];
  });
}

/**
 * A copy of `project` with the lettering on one page. `widthIn`/`heightIn`: the lettering's size. A band is as tall
 * as the lettering at the page's safe width (never more than half the page); "page" fits it inside the safe area.
 */
export function placeOnCopy(project: ProductProject, asset: ArtworkAsset, at: { item: string; nth: number }, position: LetteringPosition, size: { widthIn: number; heightIn: number }, safe: { w: number; h: number }, id: string, suffix = "with lettering"): ProductProject {
  const copy = duplicateProject(project, `${project.name} (${suffix})`);
  const art = copy.artwork ?? { assets: [], placements: [] };
  const assets = art.assets.some((a) => a.id === asset.id) ? art.assets : [...art.assets, asset];
  const target = [{ item: at.item, nth: at.nth }];
  const placement: ArtworkPlacement =
    position === "page" || position === "full"
      ? { id, use: "background", assetId: asset.id, targets: target, fit: "fit", crop: { x: 0.5, y: 0.5, zoom: 1 }, opacity: 1, extent: position === "full" ? "bleed" : "safe" }
      : {
          id, use: "illustration", assetId: asset.id, targets: target, placement: "area", anchor: position, mirror: false, opacity: 1, offsetXIn: 0, offsetYIn: 0,
          sizeIn: +Math.min(safe.h * 0.5, size.heightIn * Math.min(1, safe.w / size.widthIn)).toFixed(3),
        };
  return { ...copy, artwork: { assets, placements: [...art.placements, placement] } };
}

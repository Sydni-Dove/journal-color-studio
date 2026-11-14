/**
 * COVER STUDIO — start a cover brief from one of the maker's own products: its trim, binding, printer, page count,
 * palette and name come across, so the cover is planned against the same production setup as the pages.
 */
import { PRINT_PROFILES } from "../../presets/printProfiles/printProfiles";
import { PALETTES } from "../../presets/themes/palettes";
import type { BindingType } from "../../types/binding";
import type { ProductProject } from "../../types/project";
import { resolveDocument } from "../document/resolve";
import { resolveTrim } from "../geometry/dimensions";
import { newBrief, type CoverBrief } from "./brief";
import { COVER_SIZES, parseSize } from "./guides";

const PRODUCT_NAME: Partial<Record<ProductProject["productType"], string>> = {
  journal: "Journal", planner: "Planner", notebook: "Notebook", devotional: "Devotional", notepad: "Notepad", worksheet: "Workbook", tracker: "Workbook",
};
const BINDING_NAME: Partial<Record<BindingType, string>> = {
  "perfect-bound": "Perfect bound", "case-bound": "Case bound", coil: "Spiral / coil", "wire-o": "Spiral / coil", "saddle-stitch": "Saddle stitch",
};

export function briefFromProject(p: ProductProject): CoverBrief {
  const trim = resolveTrim(p.dimensions);
  const w = Math.min(trim.widthIn, trim.heightIn), h = Math.max(trim.widthIn, trim.heightIn);
  const key = COVER_SIZES.find((s) => {
    const d = parseSize(s);
    return d && Math.abs(d[0] - w) < 1e-6 && Math.abs(d[1] - h) < 1e-6;
  });
  let pages: number | null = null;
  try {
    pages = resolveDocument(p).recipe.pageCount;
  } catch {
    /* an unresolvable product still gives its size and look */
  }
  return newBrief({
    collection: p.name,
    title: (p.wording.productTitle ?? "").trim(),
    product: PRODUCT_NAME[p.productType] ?? "Other stationery",
    size: key ?? "Custom",
    customW: Number(w.toFixed(3)),
    customH: Number(h.toFixed(3)),
    binding: BINDING_NAME[p.production.bindingType] ?? "Loose / unbound",
    printProfile: PRINT_PROFILES.some((x) => x.id === p.production.printProfileId) ? p.production.printProfileId : "generic-commercial",
    pages,
    palette: PALETTES.some((x) => x.id === p.colors.paletteId) ? p.colors.paletteId : newBrief().palette,
  });
}

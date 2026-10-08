import { useMemo } from "react";
import { geometryFor, resolveDocument, solvePage } from "../../engines/document/resolve";
import { CSS_PX_PER_IN } from "../../engines/units/units";
import { getLayout } from "../../layouts/registry";
import { PrintablePage } from "../../primitives/PrintablePage";
import type { ProductProject } from "../../types/project";
import type { RepeatRule } from "../../types/recipe";

/** Actual page renderer, in a small isolated preview recipe. */
export function LayoutThumbnail({ project, layoutId }: { project: ProductProject; layoutId: string }) {
  const result = useMemo(() => {
    try {
      const layout = getLayout(layoutId);
      const repeat: RepeatRule = layout.period === "week" ? { kind: "every-week" } : layout.period === "month" ? { kind: "every-month" } : layout.period === "day" ? { kind: "every-day" } : { kind: "once" };
      const year = new Date().getFullYear() + 1;
      const sample = { ...project, recipe: { items: [{ id: "thumbnail", layoutId, repeat }], ordering: "chronological" as const }, calendar: layout.capability.requiresCalendar ? { startDate: `${year}-01-01`, endDate: `${year}-02-02`, weekStart: 1 as const, sixRowMonths: true } : undefined };
      const doc = resolveDocument(sample);
      const first = doc.recipe.pages.findIndex((p) => !p.filler);
      if (first < 0) return null;
      const indices = Array.from({ length: layout.pages }, (_, n) => first + n).filter((i) => i < doc.recipe.pages.length);
      const geos = indices.map((i) => geometryFor(doc, doc.recipe.pages[i]));
      const naturalW = geos.reduce((sum, g) => sum + g.mediaWidthIn * CSS_PX_PER_IN, 0);
      const naturalH = Math.max(...geos.map((g) => g.mediaHeightIn * CSS_PX_PER_IN));
      const scale = Math.min(220 / naturalW, 170 / naturalH);
      return { doc, indices, geos, naturalW, naturalH, scale };
    } catch { return null; }
  }, [project, layoutId]);
  if (!result) return <span className="layout-thumbnail layout-thumbnail--empty">Preview unavailable at this size</span>;
  const { doc, indices, geos, naturalW, naturalH, scale } = result;
  return <span className="layout-thumbnail" aria-hidden="true"><span className="layout-thumbnail__frame" style={{ width: naturalW * scale, height: naturalH * scale }}><span className="layout-thumbnail__pages" style={{ width: naturalW, height: naturalH, transform: `scale(${scale})` }}>{indices.map((i, k) => <PrintablePage key={i} geometry={geos[k]} solved={solvePage(doc, i)} colors={doc.colors} typography={doc.typography} decorative={doc.decorative} spacing={doc.spacing} mode="editor" />)}</span></span></span>;
}

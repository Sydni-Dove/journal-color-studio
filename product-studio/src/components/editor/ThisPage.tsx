/**
 * The page the page-level areas (Page layout, Writing, Add to page) are
 * editing: named in plain words, with its date, so it is always clear which
 * page a change applies to.
 */
import type { ResolvedDocument } from "../../engines/document/resolve";
import type { ProjectUsage } from "../../engines/document/usage";
import { pageInfo } from "../../engines/document/pageInfo";

export function ThisPageHeading({ doc, current, onDuplicate }: { doc: ResolvedDocument; current: number; onDuplicate?: () => void }) {
  if (!doc.recipe.pages[current]) return null;
  const info = pageInfo(doc, current);
  const page = doc.recipe.pages[current];
  // Pages that don't follow the calendar (custom, guided, journal, notes pages) can be duplicated as a whole.
  const canDuplicate = !!onDuplicate && !!page.recipeItemId && !page.filler && (page.period.kind === "none" || page.period.kind === "copy") && page.layoutId !== "cover-page" && page.layoutId !== "back-cover-page";
  return (
    <div className="this-page-heading" data-testid="this-page">
      <span className="this-page-heading__eyebrow">Edit this page</span>
      <span className="this-page-heading__name">
        {info.title && info.title !== info.typeLabel ? `${info.title} · ${info.typeLabel}` : info.typeLabel}
      </span>
      <span className="hint">
        Page {info.pageNumber}
        {info.dateLabel ? ` · ${info.dateLabel}` : ""}
      </span>
      {canDuplicate && (
        <button type="button" className="btn this-page-heading__duplicate" onClick={onDuplicate}>
          Duplicate page
        </button>
      )}
    </div>
  );
}

/** When the page being viewed takes no extra content, say so (and why) rather than showing an empty area. */
export function AddToPageHint({ doc, current, usage }: { doc: ResolvedDocument; current: number; usage: ProjectUsage }) {
  const p = doc.recipe.pages[current];
  if (!p) return null;
  const hasSections = p.layoutId === "guided-page" || p.layoutId.startsWith("stationery:");
  if (hasSections || usage.sidebar.supported || usage.dailySections) return null;
  const cover = p.layoutId === "cover-page" || p.layoutId === "back-cover-page" || p.layoutId === "divider-page";
  return (
    <p className="hint">
      {cover
        ? "Covers and dividers carry a title, subtitle and artwork: set them under Page layout."
        : "This page has no extra sections. To add prompts, a checklist or a table, add a Custom page or a Prompts + writing space page under Pages."}
    </p>
  );
}

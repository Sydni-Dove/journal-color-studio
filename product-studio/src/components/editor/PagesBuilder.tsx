/**
 * PAGES — what is in this product, grouped as a planner maker thinks:
 *
 *   Cover     Front cover · End cover            + Add
 *   Monthly   Classic Monthly · Every month      Edit
 *   Weekly    Not added                          + Add weekly
 *   …
 *
 * Each row edits (Page layout) or removes one kind of page; each category adds
 * its kind of page in the right place (engines/recipe/pageBuilder.ts). The
 * detailed order and repeating sections stay available under "Order & repeats".
 * This defines the product; moving between printed pages is Browse pages.
 */
import { useState } from "react";
import type { ResolvedDocument } from "../../engines/document/resolve";
import { removeNode, structureFromItems, updateNode } from "../../engines/recipe/bookEdit";
import {
  addDaily, addDivider, addEndCover, addFrontCover, addMonthly, addPageOfType, addToEachMonth, addToEachWeek, addWeekly, addYearly,
  BUILDER_CATEGORIES, builderRows, primaryCategories, stepPeriod, WEEKLY_JOURNAL, type BuilderCategory, type BuilderRow, type WeeklyJournalKind,
} from "../../engines/recipe/pageBuilder";
import { getLayout } from "../../layouts/registry";
import { addPageFromDesign, removePageDesign } from "../../engines/recipe/pageDesigns";
import { neutralLuxeDividers } from "../../presets/bookRecipes";
import { moduleTitle } from "../../presets/modules";
import { layoutName, pageTypeName } from "../../presets/plainNames";
import { PRODUCT_TYPES } from "../../presets/products/productTypes";
import type { ProductProject } from "../../types/project";
import type { BookNode, BookStep, PageModuleType } from "../../types/recipe";

type Update = (fn: (p: ProductProject) => ProductProject) => void;
type Props = { project: ProductProject; update: Update; doc: ResolvedDocument; onEdit: (stepId: string) => void };

const nextYear = new Date().getFullYear() + 1;
const DATED_CATEGORIES: BuilderCategory[] = ["yearly", "monthly", "weekly", "daily"];

/** "Every month", "After the weekly pages", "End of each month", "× 3" — how often, in words. */
function howOften(r: BuilderRow, rows: BuilderRow[]): string {
  const c = r.step.cadence;
  const period = stepPeriod(r.step, r.parents);
  switch (c.type) {
    case "once":
      return period === "none" ? "Once" : `Every ${period}`;
    case "copies":
      return c.count > 1 ? `${c.count} pages` : period === "none" ? "Once" : `Every ${period}`;
    case "after-module": {
      const t = rows.find((x) => x.step.id === c.moduleId);
      return t ? `After the ${t.step.module === "weekly-planner" ? "weekly pages" : `“${rowName(t.step)}”`}, every ${stepPeriod(t.step, t.parents) === "none" ? "time" : stepPeriod(t.step, t.parents)}` : "After another page";
    }
    case "end-of-period":
      return `End of each ${c.period}`;
    default:
      return `Every ${period}`;
  }
}

const rowName = (s: BookStep, period: string = "none") =>
  s.module === "monthly-calendar" || s.module === "weekly-planner" || s.module === "daily-planner" || s.module === "back-cover" || s.module === "cover-page"
    ? pageTypeName(s.module)
    : s.title || moduleTitle(s.module, (period === "day" ? "none" : period) as Parameters<typeof moduleTitle>[1]) || pageTypeName(s.module);

export function PagesBuilder({ project, update, doc, onEdit }: Props) {
  const structure = project.recipe.structure ?? structureFromItems(project.recipe);
  const rows = builderRows(structure);
  const productLabel = PRODUCT_TYPES[project.productType]?.label ?? "Product";
  const primary = primaryCategories(project.productType);
  const more = BUILDER_CATEGORIES.map((c) => c.id).filter((c) => !primary.includes(c) && !rows.some((r) => r.category === c));
  const [showMore, setShowMore] = useState(false);

  /** Every edit works on the book structure (a simple page list becomes one on the first change, page for page). */
  const edit = (fn: (n: BookNode[]) => BookNode[], needsDates = false) =>
    update((p) => ({
      ...p,
      calendar: needsDates && !p.calendar ? { startDate: `${nextYear}-01-01`, endDate: `${nextYear}-12-31`, weekStart: 1, sixRowMonths: true } : p.calendar,
      recipe: { ...p.recipe, structure: fn(p.recipe.structure ?? structureFromItems(p.recipe)) },
    }));

  const shown = [...primary, ...BUILDER_CATEGORIES.map((c) => c.id).filter((c) => !primary.includes(c) && rows.some((r) => r.category === c)), ...(showMore ? more : [])];

  return (
    <section className="builder" aria-label={`${productLabel} pages`}>
      <h3 className="builder__title">{productLabel} pages</h3>
      <p className="hint">What this {productLabel.toLowerCase()} contains. Add a kind of page and it goes in the right place; choose Edit to change its layout, writing space and content.</p>
      {shown.map((cat) => (
        <Category key={cat} cat={cat} rows={rows} allRows={rows} edit={edit} onEdit={onEdit} doc={doc} />
      ))}
      <PageDesigns project={project} edit={edit} update={update} />
      {more.length > 0 && (
        <button type="button" className="btn btn--ghost builder__more" aria-expanded={showMore} onClick={() => setShowMore(!showMore)}>
          {showMore ? "Fewer kinds of pages" : `More kinds of pages (${more.map((c) => BUILDER_CATEGORIES.find((x) => x.id === c)!.label).join(", ")})`}
        </button>
      )}
    </section>
  );
}

function Category({ cat, rows, allRows, edit, onEdit, doc }: { cat: BuilderCategory; rows: BuilderRow[]; allRows: BuilderRow[]; edit: (fn: (n: BookNode[]) => BookNode[], needsDates?: boolean) => void; onEdit: (id: string) => void; doc: ResolvedDocument }) {
  const def = BUILDER_CATEGORIES.find((c) => c.id === cat)!;
  const mine = rows.filter((r) => r.category === cat);
  const has = (m: PageModuleType) => allRows.some((r) => r.step.module === m);
  const dated = DATED_CATEGORIES.includes(cat);
  const add = (fn: (n: BookNode[]) => BookNode[]) => edit(fn, dated);
  const [journalOpen, setJournalOpen] = useState(false);
  const weekly = allRows.find((r) => r.step.module === "weekly-planner");
  return (
    <div className="builder-cat" data-category={cat}>
      <div className="builder-cat__head">
        <strong>{def.label}</strong>
        {!mine.length && <span className="builder-cat__empty">{def.empty}</span>}
      </div>
      {mine.map((r) => (
        <div key={r.step.id} className="builder-row" data-step={r.step.id}>
          <div className="builder-row__text">
            <span className="builder-row__name">{rowName(r.step, stepPeriod(r.step, r.parents))}</span>
            <span className="builder-row__detail">
              {layoutName(r.step.layoutId, getLayout(r.step.layoutId).label)} · {howOften(r, allRows)}
              {r.step.module === "divider-page" ? ` · ${r.step.cover?.tab?.show ? `Tab: ${(r.step.cover.tab.label ?? r.step.title ?? "").toUpperCase() || "on"}` : "No tab"}` : ""}
            </span>
          </div>
          <div className="builder-row__actions">
            <button type="button" className="btn" onClick={() => onEdit(r.step.id)} aria-label={`Edit ${rowName(r.step)}`}>Edit</button>
            <button type="button" className="btn btn--ghost" onClick={() => edit((n) => removeNode(n, r.step.id))} aria-label={`Remove ${rowName(r.step)}`}>Remove</button>
          </div>
        </div>
      ))}
      <div className="builder-cat__add">
        {cat === "cover" && (
          <>
            {!has("cover-page") && <button type="button" className="btn" onClick={() => add(addFrontCover)}>+ Add front cover</button>}
            {!has("back-cover") && <button type="button" className="btn" onClick={() => add(addEndCover)}>+ Add end cover</button>}
          </>
        )}
        {cat === "yearly" && (
          <>
            <button type="button" className="btn" onClick={() => add((n) => addYearly(n, "goals"))}>+ Goals for the year</button>
            <button type="button" className="btn" onClick={() => add((n) => addYearly(n, "review"))}>+ Year in review</button>
          </>
        )}
        {cat === "monthly" && (
          <>
            {!has("monthly-calendar") && <button type="button" className="btn" onClick={() => add(addMonthly)}>+ Add monthly</button>}
            {has("monthly-calendar") && (
              <>
                <button type="button" className="btn" onClick={() => add((n) => addToEachMonth(n, "goals"))}>+ Monthly goals</button>
                <button type="button" className="btn" onClick={() => add((n) => addToEachMonth(n, "review"))}>+ Monthly review</button>
                <button type="button" className="btn" onClick={() => add((n) => addToEachMonth(n, "notes"))}>+ Notes each month</button>
              </>
            )}
          </>
        )}
        {cat === "weekly" && (
          <>
            {!weekly && <button type="button" className="btn" onClick={() => add(addWeekly)}>+ Add weekly</button>}
            <button type="button" className="btn" aria-expanded={journalOpen} onClick={() => setJournalOpen(!journalOpen)}>+ Add guided journal to each week</button>
          </>
        )}
        {cat === "daily" && !has("daily-planner") && <button type="button" className="btn" onClick={() => add(addDaily)}>+ Add daily</button>}
        {cat === "journal" && (
          <>
            <button type="button" className="btn" onClick={() => add((n) => addPageOfType(n, "lined-journal"))}>+ Journal page</button>
            <button type="button" className="btn" onClick={() => add((n) => addPageOfType(n, "guided"))}>+ Prompts + writing space</button>
            <button type="button" className="btn" onClick={() => add((n) => addPageOfType(n, "custom"))}>+ Custom page</button>
          </>
        )}
        {cat === "notes" && <button type="button" className="btn" onClick={() => add((n) => addPageOfType(n, "notes"))}>+ Notes page</button>}
        {cat === "dividers" && (
          <>
            <button type="button" className="btn" onClick={() => add((n) => addDivider(n))}>+ Divider with tab</button>
            <button type="button" className="btn" onClick={() => add((n) => addDivider(n, "Section", false))}>+ Divider without tab</button>
            <button type="button" className="btn" onClick={() => add((n) => [...neutralLuxeDividers().filter((x) => !(x.kind === "step" && x.module === "cover-page" && n.some((y) => y.kind === "step" && y.module === "cover-page"))), ...n])}>+ Coordinating set of 9 dividers</button>
          </>
        )}
      </div>
      {cat === "weekly" && journalOpen && (
        <WeeklyJournalChooser
          weeklyLayout={weekly?.step.layoutId}
          onAdd={(kind, placement) => {
            add((n) => addToEachWeek(n, kind, placement));
            setJournalOpen(false);
          }}
          fitsSameSpread={!!doc}
        />
      )}
    </div>
  );
}

/** Choose the guided journal that comes with every week, and where it goes. */
function WeeklyJournalChooser({ weeklyLayout, onAdd }: { weeklyLayout?: string; onAdd: (k: WeeklyJournalKind, placement: "after" | "same-spread") => void; fitsSameSpread: boolean }) {
  const [kind, setKind] = useState<WeeklyJournalKind>("reflection");
  const canShare = kind === "meeting-with-god" && weeklyLayout === "weekly-plan-spread";
  const [placement, setPlacement] = useState<"after" | "same-spread">("after");
  return (
    <div className="builder-choose" role="group" aria-label="Guided journal for each week">
      {WEEKLY_JOURNAL.map((j) => (
        <label key={j.id} className="choice-row">
          <input type="radio" name="weekly-journal" checked={kind === j.id} onChange={() => setKind(j.id)} />
          <span>
            <strong>{j.label}</strong>
            <span className="hint"> — {j.hint}</span>
          </span>
        </label>
      ))}
      <div className="field-label">Where it goes</div>
      <label className="choice-row">
        <input type="radio" name="weekly-journal-place" checked={placement === "after" || !canShare} onChange={() => setPlacement("after")} />
        <span>After the weekly pages, every week</span>
      </label>
      {canShare && (
        <label className="choice-row">
          <input type="radio" name="weekly-journal-place" checked={placement === "same-spread"} onChange={() => setPlacement("same-spread")} />
          <span>On the facing page of the weekly spread (the week on the left, Meeting With God on the right)</span>
        </label>
      )}
      <button type="button" className="btn btn--primary" onClick={() => onAdd(kind, canShare ? placement : "after")}>Add to each week</button>
    </div>
  );
}

/** Rename a step (used by rows that show a title). */
export function renameStep(nodes: BookNode[], id: string, title: string): BookNode[] {
  return updateNode(nodes, id, (n) => ({ ...n, title }) as BookNode);
}

/** Your page designs: Custom Pages saved for reuse; each adds pages that are a copy of it. */
function PageDesigns({ project, edit, update }: { project: ProductProject; edit: (fn: (n: BookNode[]) => BookNode[]) => void; update: Update }) {
  const designs = project.pageDesigns ?? [];
  const [copies, setCopies] = useState<Record<string, number>>({});
  if (!designs.length) return null;
  return (
    <div className="builder-cat" data-category="designs">
      <div className="builder-cat__head"><strong>Your page designs</strong></div>
      {designs.map((d) => (
        <div key={d.id} className="builder-row" data-design={d.id}>
          <div className="builder-row__text">
            <span className="builder-row__name">{d.name}</span>
            <span className="builder-row__detail">{d.promptSet.blocks.length} section{d.promptSet.blocks.length === 1 ? "" : "s"}</span>
          </div>
          <div className="builder-row__actions">
            <label className="copies-field">
              <span className="visually-hidden">Copies of {d.name}</span>
              <input type="number" min={1} max={200} value={copies[d.id] ?? 1} aria-label={`Copies of ${d.name}`} onChange={(e) => setCopies({ ...copies, [d.id]: Math.max(1, Math.min(200, Math.round(+e.target.value || 1))) })} />
            </label>
            <button type="button" className="btn" onClick={() => edit((n) => addPageFromDesign(n, d, copies[d.id] ?? 1))} aria-label={`Add ${d.name}`}>+ Add</button>
            <button type="button" className="btn btn--ghost" onClick={() => update((p) => removePageDesign(p, d.id))} aria-label={`Delete design ${d.name}`}>Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
}

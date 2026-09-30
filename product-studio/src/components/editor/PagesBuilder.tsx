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
import { useMemo, useState } from "react";
import { resolveDocument, type ResolvedDocument } from "../../engines/document/resolve";
import { removeNode, structureFromItems, updateNode } from "../../engines/recipe/bookEdit";
import {
  addDaily, addDivider, addEndCover, addFrontCover, addMonthly, addPageOfType, addToEachMonth, addToEachWeek, addWeekly, addYearly,
  BUILDER_CATEGORIES, builderRows, categoryOf, primaryCategories, stepPeriod, WEEKLY_JOURNAL, type BuilderCategory, type BuilderRow, type WeeklyJournalKind,
} from "../../engines/recipe/pageBuilder";
import { getLayout } from "../../layouts/registry";
import { addPageFromDesign, duplicatePage, isDesignGroup, MAX_DESIGN_PAGES, MAX_REPEATS, moveAmong, removePageDesign, repeatableNodes, repeatIndex, repeatPages, setDesignPageCount, stepFromDesign, stepsOf, type RepeatPlace } from "../../engines/recipe/pageDesigns";
import { Segmented } from "./ui";
import { PageThumb } from "../preview/PageThumb";
import { usePhone } from "../../utils/usePhone";
import { neutralLuxeDividers } from "../../presets/bookRecipes";
import { moduleTitle } from "../../presets/modules";
import { layoutName, pageTypeName } from "../../presets/plainNames";
import { PRODUCT_TYPES } from "../../presets/products/productTypes";
import type { PageDesign, ProductProject } from "../../types/project";
import type { BookGroup, BookNode, BookStep, PageModuleType } from "../../types/recipe";

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
      <h3 className="builder__title">{/page$/i.test(productLabel) ? "Pages" : `${productLabel} pages`}</h3>
      <p className="hint">What this {productLabel.toLowerCase()} contains. Add a kind of page and it goes in the right place; choose Edit to change its layout, writing space and content.</p>
      {shown.map((cat) => (
        <Category key={cat} cat={cat} rows={rows} allRows={rows} edit={edit} onEdit={onEdit} doc={doc} structure={structure} project={project} />
      ))}
      <RepeatPages structure={structure} doc={doc} edit={edit} />
      <PageDesigns project={project} edit={edit} update={update} />
      {more.length > 0 && (
        <button type="button" className="btn btn--ghost builder__more" aria-expanded={showMore} onClick={() => setShowMore(!showMore)}>
          {showMore ? "Fewer kinds of pages" : `More kinds of pages (${more.map((c) => BUILDER_CATEGORIES.find((x) => x.id === c)!.label).join(", ")})`}
        </button>
      )}
    </section>
  );
}

/** A row in a category: one kind of page, or a group of pages made from a saved page design. */
type Item = { kind: "row"; r: BuilderRow } | { kind: "design"; g: BookGroup; r: BuilderRow };

function Category({ cat, rows, allRows, edit, onEdit, doc, structure, project }: { cat: BuilderCategory; rows: BuilderRow[]; allRows: BuilderRow[]; edit: (fn: (n: BookNode[]) => BookNode[], needsDates?: boolean) => void; onEdit: (id: string) => void; doc: ResolvedDocument; structure: BookNode[]; project: ProductProject }) {
  const def = BUILDER_CATEGORIES.find((c) => c.id === cat)!;
  const mine = rows.filter((r) => r.category === cat);
  // Pages made from a saved design show as one row ("Project Snapshot · 8 pages"), in book order.
  const items: Item[] = [];
  const seen = new Set<string>();
  for (const r of mine) {
    const g = r.parents.find(isDesignGroup);
    if (!g) items.push({ kind: "row", r });
    else if (!seen.has(g.id)) {
      seen.add(g.id);
      items.push({ kind: "design", g, r });
    }
  }
  // Custom and saved-design pages can be put in order among themselves (the rest keep their planned places).
  const movable = cat === "journal";
  const among = (n: BookNode) => isDesignGroup(n) || (n.kind === "step" && categoryOf(n, []) === cat);
  const topIds = structure.filter(among).map((n) => n.id);
  const moveButtons = (id: string, name: string) =>
    movable && topIds.includes(id) && topIds.length > 1 ? (
      <>
        <button type="button" className="btn" disabled={topIds[0] === id} onClick={() => edit((n) => moveAmong(n, id, -1, among))} aria-label={`Move ${name} up`}>Move up</button>
        <button type="button" className="btn" disabled={topIds.at(-1) === id} onClick={() => edit((n) => moveAmong(n, id, 1, among))} aria-label={`Move ${name} down`}>Move down</button>
      </>
    ) : null;
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
      {items.map((it) =>
        it.kind === "design" ? (
          <DesignGroupRow key={it.g.id} g={it.g} design={project.pageDesigns?.find((d) => d.id === it.g.designId)} edit={edit} onEdit={onEdit} moveButtons={moveButtons(it.g.id, it.g.label ?? "pages")} />
        ) : (
          <div key={it.r.step.id} className="builder-row" data-step={it.r.step.id}>
            <div className="builder-row__text">
              <span className="builder-row__name">{rowName(it.r.step, stepPeriod(it.r.step, it.r.parents))}</span>
              <span className="builder-row__detail">
                {layoutName(it.r.step.layoutId, getLayout(it.r.step.layoutId).label)} · {howOften(it.r, allRows)}
                {it.r.step.module === "divider-page" ? ` · ${it.r.step.cover?.tab?.show ? `Tab: ${(it.r.step.cover.tab.label ?? it.r.step.title ?? "").toUpperCase() || "on"}` : "No tab"}` : ""}
              </span>
            </div>
            <div className="builder-row__actions">
              <button type="button" className="btn" onClick={() => onEdit(it.r.step.id)} aria-label={`Edit ${rowName(it.r.step)}`}>Edit</button>
              {movable && (
                <button type="button" className="btn" onClick={() => edit((n) => duplicatePage(n, it.r.step.id)?.nodes ?? n)} aria-label={`Duplicate ${rowName(it.r.step)}`}>Duplicate</button>
              )}
              {moveButtons(it.r.step.id, rowName(it.r.step))}
              <button type="button" className="btn btn--ghost" onClick={() => edit((n) => removeNode(n, it.r.step.id))} aria-label={`Remove ${rowName(it.r.step)}`}>Remove</button>
            </div>
          </div>
        ),
      )}
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
/**
 * Pages made from a saved design, as one row: how many pages, each page's
 * Edit (every page is its own copy), order, remove.
 */
function DesignGroupRow({ g, design, edit, onEdit, moveButtons }: { g: BookGroup; design?: PageDesign; edit: (fn: (n: BookNode[]) => BookNode[]) => void; onEdit: (id: string) => void; moveButtons: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pages = g.children.filter((c): c is BookStep => c.kind === "step");
  const name = g.label || design?.name || "Page design";
  const setCount = (n: number) => edit((x) => setDesignPageCount(x, g.id, n, design));
  return (
    <div className="builder-row builder-row--design" data-design-group={g.id}>
      <div className="builder-row__text">
        <span className="builder-row__name">{name}</span>
        <span className="builder-row__detail">{pages.length} page{pages.length === 1 ? "" : "s"} · your page design{design ? "" : " (design deleted; the pages stay)"}</span>
      </div>
      <div className="builder-row__actions">
        <div className="page-count" role="group" aria-label={`Number of ${name} pages`}>
          <button type="button" className="btn btn--icon" aria-label={`One ${name} page fewer`} disabled={pages.length <= 1} onClick={() => setCount(pages.length - 1)}>−</button>
          <span className="page-count__n" aria-live="polite">{pages.length}</span>
          <button type="button" className="btn btn--icon" aria-label={`One ${name} page more`} disabled={pages.length >= MAX_DESIGN_PAGES} onClick={() => setCount(pages.length + 1)}>+</button>
        </div>
        <button type="button" className="btn" aria-expanded={open} onClick={() => setOpen(!open)} aria-label={`Edit ${name} pages`}>Edit pages</button>
        {moveButtons}
        <button type="button" className="btn btn--ghost" onClick={() => edit((x) => removeNode(x, g.id))} aria-label={`Remove ${name} pages`}>Remove</button>
      </div>
      {open && (
        <ol className="design-pages" aria-label={`${name} pages`}>
          {pages.map((s, k) => (
            <li key={s.id}>
              <span>{name} {k + 1}</span>
              <span className="design-pages__actions">
                <button type="button" className="btn" onClick={() => onEdit(s.id)} aria-label={`Edit ${name} ${k + 1}`}>Edit</button>
                <button type="button" className="btn" onClick={() => edit((x) => duplicatePage(x, s.id)?.nodes ?? x)} aria-label={`Duplicate ${name} ${k + 1}`}>Duplicate</button>
              </span>
            </li>
          ))}
          <li className="hint">Each page is its own copy: editing one never changes the others or your saved design.</li>
        </ol>
      )}
    </div>
  );
}

/** A small preview of a saved design, drawn by the real page renderer in this product's size and Style. */
function DesignThumb({ project, design, heightPx }: { project: ProductProject; design: PageDesign; heightPx: number }) {
  const doc = useMemo(() => {
    try {
      return resolveDocument({ ...project, recipe: { ...project.recipe, items: [], ordering: "sequential", structure: [stepFromDesign(design)] } });
    } catch {
      return null;
    }
    // The preview depends on the design and the product's size and Style.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design, project.dimensions, project.colors, project.typography, project.decorativeTheme, project.backgroundTheme, project.spacing, project.functionalPattern, project.production, project.layoutOptions]);
  const i = doc ? doc.recipe.pages.findIndex((p) => p.layoutId === "guided-page") : -1;
  return doc && i >= 0 ? <PageThumb doc={doc} index={i} heightPx={heightPx} /> : null;
}

/**
 * REPEAT PAGES — pick one or more rows of the book (one kind of page, or
 * several kinds together), how many more times, and where the copies start.
 */
function RepeatPages({ structure, doc, edit }: { structure: BookNode[]; doc: ResolvedDocument; edit: (fn: (n: BookNode[]) => BookNode[]) => void }) {
  const rows = repeatableNodes(structure);
  const [picked, setPicked] = useState<string[]>([]);
  const [times, setTimes] = useState("1");
  const [place, setPlace] = useState<"after" | "page" | "end">("after");
  const [page, setPage] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const pagesOf = (n: BookNode) => {
    const ids = new Set(stepsOf(n).map((s) => s.id));
    return doc.recipe.pages.filter((p) => ids.has(p.recipeItemId) && !p.filler).map((p) => p.pageNumber);
  };
  const firstPage = (n: BookNode) => (pagesOf(n).length ? Math.min(...pagesOf(n)) : null);
  const nameOf = (n: BookNode) => (n.kind === "step" ? rowName(n) : n.label ?? "Section");
  const range = (n: BookNode) => {
    const ps = pagesOf(n);
    if (!ps.length) return "no pages yet";
    const a = Math.min(...ps), b = Math.max(...ps);
    return a === b ? `page ${a}` : `pages ${a}–${b} (${ps.length})`;
  };
  if (!rows.length) return null;
  const count = Math.max(1, Math.min(MAX_REPEATS, Math.round(Number(times)) || 1));
  const chosen = rows.filter((n) => picked.includes(n.id));
  const perSet = chosen.reduce((sum, n) => sum + pagesOf(n).length, 0);
  const where: RepeatPlace = place === "page" ? { at: "page", page: Math.max(1, Math.round(Number(page)) || 1) } : { at: place };
  const at = repeatIndex(structure, picked, where, firstPage);
  const startPage = at < structure.length ? firstPage(structure[at]) ?? doc.recipe.pageCount + 1 : doc.recipe.pageCount + 1;
  const toggle = (id: string, on: boolean) => setPicked((p) => (on ? [...p, id] : p.filter((x) => x !== id)));
  return (
    <div className="builder-cat repeat-pages" data-category="repeat">
      <div className="builder-cat__head"><strong>Repeat pages</strong></div>
      <p className="hint">Copy a set of pages as many more times as you need — one kind of page, or several kinds together in their order. Every copy is its own page to edit.</p>
      <div className="repeat-pages__rows" role="group" aria-label="Pages to repeat">
        {rows.map((n) => (
          <label key={n.id} className="repeat-pages__row">
            <input type="checkbox" checked={picked.includes(n.id)} onChange={(e) => toggle(n.id, e.target.checked)} />
            <span className="builder-row__name">{nameOf(n)}</span>
            <span className="builder-row__detail">{range(n)}</span>
          </label>
        ))}
      </div>
      <div className="row">
        <label className="field">
          <span className="field-label">How many more times</span>
          <input type="number" inputMode="numeric" min={1} max={MAX_REPEATS} value={times} onChange={(e) => setTimes(e.target.value)} onBlur={() => setTimes(String(count))} />
        </label>
      </div>
      <Segmented label="Where the copies start" value={place} options={[{ value: "after", label: "Right after them" }, { value: "page", label: "At a page" }, { value: "end", label: "At the end" }]} onChange={setPlace} />
      {place === "page" && (
        <label className="field">
          <span className="field-label">Start at page</span>
          <input type="number" inputMode="numeric" min={1} value={page} placeholder={String(doc.recipe.pageCount + 1)} onChange={(e) => setPage(e.target.value)} />
        </label>
      )}
      {chosen.length > 0 && (
        <p className="hint" data-testid="repeat-summary">
          Adds {perSet * count} page{perSet * count === 1 ? "" : "s"} ({chosen.map(nameOf).join(" + ")}{count > 1 ? `, ${count} times` : ""}), starting at page {startPage}.
          {place === "page" && Number(page) > 0 && startPage !== Number(page) ? " (That page is in the middle of other pages, so the copies start after them.)" : ""}
        </p>
      )}
      <button
        type="button"
        className="btn btn--primary"
        disabled={!chosen.length}
        onClick={() => {
          edit((n) => repeatPages(n, picked, count, repeatIndex(n, picked, where, firstPage)));
          setDone(`Added ${perSet * count} pages, starting at page ${startPage}.`);
          setPicked([]);
        }}
      >
        Repeat
      </button>
      {done && <p className="hint" role="status">{done}</p>}
    </div>
  );
}

function PageDesigns({ project, edit, update }: { project: ProductProject; edit: (fn: (n: BookNode[]) => BookNode[]) => void; update: Update }) {
  const designs = project.pageDesigns ?? [];
  const phone = usePhone();
  const [copies, setCopies] = useState<Record<string, string>>({});
  const [added, setAdded] = useState<string | null>(null);
  const count = (d: PageDesign) => Math.max(1, Math.min(MAX_DESIGN_PAGES, Math.round(Number(copies[d.id] ?? 1) || 1)));
  return (
    <div className="builder-cat" data-category="designs">
      <div className="builder-cat__head">
        <strong>Your page designs</strong>
        {!designs.length && <span className="builder-cat__empty">None yet</span>}
      </div>
      {!designs.length && <p className="hint">Build a page from sections (Edit → Add to page), then “Save page design”. It appears here to add as many pages as you need.</p>}
      {designs.map((d) => (
        <div key={d.id} className="builder-row design-row" data-design={d.id}>
          <div className="design-row__thumb"><DesignThumb project={project} design={d} heightPx={phone ? 96 : 72} /></div>
          <div className="builder-row__text">
            <span className="builder-row__name">{d.name}</span>
            <span className="builder-row__detail">{d.promptSet.blocks.length} section{d.promptSet.blocks.length === 1 ? "" : "s"}</span>
          </div>
          <div className="builder-row__actions design-row__actions">
            <label className="copies-field">
              <span className="field-label">Number of pages</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_DESIGN_PAGES}
                value={copies[d.id] ?? "1"}
                aria-label={`Number of ${d.name} pages`}
                onChange={(e) => setCopies({ ...copies, [d.id]: e.target.value })}
                onBlur={() => setCopies({ ...copies, [d.id]: String(count(d)) })}
              />
            </label>
            <button
              type="button"
              className="btn btn--primary"
              aria-label={`Add ${d.name} to product`}
              onClick={() => {
                const n = count(d);
                edit((x) => addPageFromDesign(x, d, n));
                setAdded(`Added ${n} “${d.name}” page${n === 1 ? "" : "s"}.`);
              }}
            >
              Add to product
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => update((p) => removePageDesign(p, d.id))} aria-label={`Delete design ${d.name}`}>Delete design</button>
          </div>
        </div>
      ))}
      {added && <p className="hint" role="status">{added} They're listed under Journal &amp; guided pages.</p>}
    </div>
  );
}

/**
 * PAGES sheet: every generated page with its plain-language type, a filter by
 * page type and "Jump to" (months, sections, page types). Navigation only —
 * choosing a page moves the preview; nothing about the book changes.
 *
 * A bottom sheet on phones, a drawer on wider screens; never a permanent
 * sidebar. Thumbnails are the real renderer, drawn only while on screen, so a
 * book of hundreds of pages opens instantly.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ResolvedDocument } from "../../engines/document/resolve";
import { allPageInfo, jumpTargets, PAGE_CATEGORIES, type PageCategory, type PageInfo } from "../../engines/document/pageInfo";
import { PageThumb } from "./PageThumb";

export type PageFilter = PageCategory | "all";

/** Categories present in this book, with page counts, in the filter's order. */
export function filterOptions(doc: ResolvedDocument): { id: PageFilter; label: string; count: number }[] {
  const info = allPageInfo(doc);
  const counts = new Map<PageCategory, number>();
  for (const i of info) counts.set(i.category, (counts.get(i.category) ?? 0) + 1);
  return [{ id: "all", label: "All pages", count: info.length }, ...PAGE_CATEGORIES.filter((c) => counts.has(c.id)).map((c) => ({ id: c.id, label: c.plural, count: counts.get(c.id)! }))];
}

/** A small, quiet marker per page type (the label text carries the meaning). */
export function CategoryMark({ category }: { category: PageCategory }) {
  return <span className={`page-mark page-mark--${category}`} aria-hidden />;
}

function Row({ info, doc, current, onPick, root }: { info: PageInfo; doc: ResolvedDocument; current: boolean; onPick: (i: number) => void; root: HTMLElement | null }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") return setSeen(true);
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setSeen(true), { root, rootMargin: "300px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [root, seen]);
  return (
    <li>
      <button ref={ref} type="button" className="page-row" aria-current={current ? "page" : undefined} data-page={info.pageNumber} data-category={info.category} onClick={() => onPick(info.index)}>
        <span className="page-row__thumb">{seen ? <PageThumb doc={doc} index={info.index} heightPx={72} /> : null}</span>
        <span className="page-row__num">{info.pageNumber}</span>
        <span className="page-row__text">
          <span className="page-row__type">
            <CategoryMark category={info.category} />
            {info.typeLabel}
            {info.title ? <> — {info.title}</> : null}
          </span>
          {info.dateLabel && <span className="page-row__date">{info.dateLabel}</span>}
          {info.filler && <span className="page-row__date">Keeps the next spread facing</span>}
        </span>
      </button>
    </li>
  );
}

export function PageNavigator({ doc, index, onIndex, filter, onFilter, onClose }: { doc: ResolvedDocument; index: number; onIndex: (i: number) => void; filter: PageFilter; onFilter: (f: PageFilter) => void; onClose: () => void }) {
  const info = allPageInfo(doc);
  const options = useMemo(() => filterOptions(doc), [doc]);
  const targets = useMemo(() => jumpTargets(doc), [doc]);
  const shown = filter === "all" ? info : info.filter((i) => i.category === filter);
  const listRef = useRef<HTMLOListElement>(null);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Open on the current page; Escape closes; focus starts on Close.
  useEffect(() => {
    setRoot(listRef.current);
    closeRef.current?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "center" });
  }, [filter]);

  const pick = (i: number) => {
    onIndex(i);
    onClose();
  };
  const jump = (value: string) => {
    const t = targets[Number(value)];
    if (!t) return;
    // A jump outside the current filter shows all pages again (it never hides the page you jumped to).
    if (filter !== "all" && info[t.index].category !== filter) onFilter("all");
    pick(t.index);
  };
  const groups = [...new Set(targets.map((t) => t.group))];

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Pages" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__head">
          <h2>Pages</h2>
          <button ref={closeRef} type="button" className="btn" onClick={onClose}>Close</button>
        </div>
        <div className="sheet__controls">
          <label className="field">
            <span>Show</span>
            <select value={filter} onChange={(e) => onFilter(e.target.value as PageFilter)} aria-label="Show pages">
              {options.map((o) => (
                <option key={o.id} value={o.id}>{o.label} ({o.count})</option>
              ))}
            </select>
          </label>
          {targets.length > 0 && (
            <label className="field">
              <span>Jump to</span>
              <select value="" onChange={(e) => jump(e.target.value)} aria-label="Jump to">
                <option value="">Choose…</option>
                {groups.map((g) => (
                  <optgroup key={g} label={g}>
                    {targets.map((t, k) => (t.group === g ? <option key={k} value={k}>{t.label}</option> : null))}
                  </optgroup>
                ))}
              </select>
            </label>
          )}
        </div>
        <p className="hint sheet__count">{filter === "all" ? `${info.length} pages` : `${shown.length} of ${info.length} pages`} · tap a page to open it</p>
        <ol className="page-list" ref={listRef}>
          {shown.map((i) => (
            <Row key={i.index} info={i} doc={doc} current={i.index === index} onPick={pick} root={root} />
          ))}
        </ol>
      </div>
    </div>
  );
}

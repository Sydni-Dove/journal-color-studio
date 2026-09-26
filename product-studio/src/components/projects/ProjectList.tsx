/**
 * STUDIO HOME — the workspace you land in: continue recent work, start from a
 * product family, jump to a real quick action, and a short reminder of what the
 * studio does. Every card and action here leads to a working flow; families
 * without a foundation yet are shown as "next" and are not clickable.
 */
import { useMemo, type ReactNode } from "react";
import { PRODUCT_TYPES } from "../../presets/products/productTypes";
import { PRODUCT_FAMILIES, type ProductFamilyId, type WizardStart } from "../../presets/products/productFamilies";
import { findSizePreset } from "../../presets/sizes/sizePresets";
import type { ProjectSummary } from "../../persistence/projectStore";

export type ProjectMeta = { pages: number; pad: boolean; sheets?: number; book: boolean } | null;

type Props = {
  projects: ProjectSummary[];
  meta: (id: string) => ProjectMeta;
  onStart: (start?: WizardStart) => void;
  onOpen: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDuplicateAsVariant: (id: string) => void;
  onDelete: (id: string) => void;
  now?: Date;
};

const RECENT = 4;

export function relativeTime(iso: string, now = new Date()): string {
  const t = new Date(iso).getTime();
  const s = Math.max(0, (now.getTime() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 2 * 86400) return "yesterday";
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Small line glyphs per family (studio UI, not product art). */
const GLYPH: Record<ProductFamilyId, ReactNode> = {
  planner: (
    <>
      <rect x="5" y="7" width="22" height="20" rx="2" />
      <path d="M5 13h22M11 4v6M21 4v6M10 18h4M18 18h4M10 22h4" />
    </>
  ),
  journal: (
    <>
      <path d="M8 5h15a2 2 0 0 1 2 2v20H10a2 2 0 0 1-2-2z" />
      <path d="M8 25a2 2 0 0 1 2-2h15M13 10h8M13 14h8" />
    </>
  ),
  "planner-journal": (
    <>
      <path d="M4 7h11v20H4zM17 7h11v20H17z" />
      <path d="M4 12h11M8 16h3M8 20h3M20 12h5M20 16h5M20 20h5" />
    </>
  ),
  devotional: (
    <>
      <path d="M16 8c-3-2-7-2-10 0v18c3-2 7-2 10 0 3-2 7-2 10 0V8c-3-2-7-2-10 0z" />
      <path d="M16 8v18M21 12v6M18 14.5h6" />
    </>
  ),
  workbook: (
    <>
      <rect x="6" y="5" width="20" height="22" rx="2" />
      <path d="M10 11h2M14 11h8M10 16h2M14 16h8M10 21h2M14 21h8" />
    </>
  ),
  worksheet: (
    <>
      <path d="M8 4h12l5 5v19H8z" />
      <path d="M20 4v5h5M12 15h9M12 19h9M12 23h6" />
    </>
  ),
  notepad: (
    <>
      <rect x="7" y="8" width="18" height="19" rx="1.5" />
      <path d="M7 11h18M11 16h10M11 20h10M11 24h6M9 8V6h14v2" />
    </>
  ),
  deskpad: (
    <>
      <rect x="3" y="8" width="26" height="17" rx="1.5" />
      <path d="M3 12h26M9 12v13M15 12v13M21 12v13" />
    </>
  ),
  custom: (
    <>
      <rect x="6" y="6" width="20" height="20" rx="2" strokeDasharray="3 3" />
      <path d="M16 11v10M11 16h10" />
    </>
  ),
};

function Glyph({ id }: { id: ProductFamilyId }) {
  return (
    <svg className="family-glyph" viewBox="0 0 32 32" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {GLYPH[id]}
    </svg>
  );
}

function describe(p: ProjectSummary, m: ProjectMeta): string {
  const size = findSizePreset(p.sizePresetId)?.label ?? p.sizePresetId;
  const type = m?.book ? "Planner + Journal book" : (PRODUCT_TYPES[p.productType]?.label ?? p.productType);
  const pages = !m ? "" : m.pad ? ` · ${m.sheets ? `${m.sheets} sheets, ` : ""}one master sheet` : ` · ${m.pages} page${m.pages === 1 ? "" : "s"}`;
  return `${type} · ${size}${pages}`;
}

export function ProjectList({ projects, meta, onStart, onOpen, onDuplicate, onDuplicateAsVariant, onDelete, now }: Props) {
  const metas = useMemo(() => new Map(projects.map((p) => [p.id, meta(p.id)])), [projects, meta]);
  const recent = projects.slice(0, RECENT);
  const hasProjects = projects.length > 0;

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">D</span>
          <span>Product Studio</span>
        </div>
        <span className="spacer" />
        <button className="btn btn--primary" onClick={() => onStart()}>New product</button>
      </header>
      <div className="page-shell home">
        <section className="home-hero">
          <p className="home-eyebrow">Internal creative workspace</p>
          <h1>Dove Expressions Product Studio</h1>
          <p className="lede">Create print-ready journals, planners, devotionals, worksheets, workbooks and stationery from reusable layouts, content structures and design systems.</p>
        </section>

        {hasProjects ? (
          <section aria-labelledby="h-continue">
            <h2 id="h-continue">Continue working</h2>
            <div className="recent-grid">
              {recent.map((p) => (
                <div key={p.id} className="card recent-card">
                  <h3>{p.name}</h3>
                  <p>{describe(p, metas.get(p.id) ?? null)}</p>
                  <p className="recent-card__time">Edited {relativeTime(p.updatedAt, now)}</p>
                  <div className="card-actions">
                    <button className="btn btn--primary" onClick={() => onOpen(p.id)}>Open</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <section className="card home-welcome" aria-labelledby="h-welcome">
            <h2 id="h-welcome">Your studio is ready</h2>
            <p>Nothing here yet. Choose what you are creating below, or begin from a starter template — every product can be reshaped afterwards.</p>
            <div className="card-actions">
              <button className="btn btn--primary" onClick={() => onStart({ section: "templates" })}>Browse starter templates</button>
              <button className="btn" onClick={() => onStart()}>Start a new product</button>
            </div>
          </section>
        )}

        <section aria-labelledby="h-create">
          <h2 id="h-create">What are you creating?</h2>
          <div className="family-grid">
            {PRODUCT_FAMILIES.map((f) =>
              f.status === "ready" ? (
                <button key={f.id} type="button" className="family-card" onClick={() => onStart(f.start)}>
                  <Glyph id={f.id} />
                  <span className="family-card__label">{f.label}</span>
                  <span className="family-card__blurb">{f.blurb}</span>
                </button>
              ) : (
                <div key={f.id} className="family-card family-card--next" aria-disabled="true">
                  <Glyph id={f.id} />
                  <span className="family-card__label">{f.label}</span>
                  <span className="family-card__blurb">{f.blurb}</span>
                  <span className="family-card__next">{f.nextNote}</span>
                </div>
              ),
            )}
          </div>
        </section>

        <div className="home-columns">
          <section aria-labelledby="h-quick">
            <h2 id="h-quick">Quick start</h2>
            <div className="quick-list">
              <button type="button" className="quick-action" onClick={() => onStart()}>
                <strong>Start a new product</strong>
                <span>Choose type, size, binding, printer and pages.</span>
              </button>
              <button type="button" className="quick-action" onClick={() => onStart({ section: "templates" })}>
                <strong>Start from a starter template</strong>
                <span>Notepad, journal, monthly and weekly planner, desk pad.</span>
              </button>
              <button type="button" className="quick-action" onClick={() => onStart({ type: "planner", recipeId: "book-meetings-with-god", section: "build" })}>
                <strong>Build a multi-section book</strong>
                <span>Front matter, every month, every week, reviews.</span>
              </button>
              {hasProjects && (
                <button type="button" className="quick-action" onClick={() => onOpen(projects[0].id)}>
                  <strong>Open your latest project</strong>
                  <span>{projects[0].name}</span>
                </button>
              )}
            </div>
          </section>
          <section aria-labelledby="h-how" className="home-how">
            <h2 id="h-how">How the studio works</h2>
            <p>Build the structure once, then change wording, colors, typography, dates, writing surfaces, decoration, size and page sequence — without rebuilding the product by hand.</p>
            <ul>
              <li>
                <strong>Geometry</strong> is solved from the trim, binding and printer, so margins and gutters stay print-safe.
              </li>
              <li>
                <strong>Structure</strong> repeats pages across your dates: months, weeks, reviews and journal pages.
              </li>
              <li>
                <strong>Design</strong> (type, color, surfaces, decoration) is a layer you can restyle at any time.
              </li>
            </ul>
          </section>
        </div>

        {hasProjects && (
          <section aria-labelledby="h-all">
            <h2 id="h-all">All projects · {projects.length}</h2>
            <div className="project-rows">
              {projects.map((p) => (
                <div key={p.id} className="card project-row">
                  <div className="project-row__main">
                    <h3>{p.name}</h3>
                    <p>
                      {describe(p, metas.get(p.id) ?? null)}
                      {p.variantCount ? ` · ${p.variantCount} variant${p.variantCount === 1 ? "" : "s"}` : ""} · edited {relativeTime(p.updatedAt, now)}
                    </p>
                  </div>
                  <div className="card-actions">
                    <button className="btn btn--primary" onClick={() => onOpen(p.id)}>Open</button>
                    <button className="btn" onClick={() => onDuplicate(p.id)}>Duplicate</button>
                    <button className="btn" onClick={() => onDuplicateAsVariant(p.id)}>Duplicate as variant</button>
                    <button
                      className="btn btn--danger"
                      onClick={() => {
                        if (window.confirm(`Delete "${p.name}"? This cannot be undone.`)) onDelete(p.id);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

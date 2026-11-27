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
  onGenerate?: () => void;
  /** Cover Studio: plan the covers of a collection. */
  onCovers?: () => void;
  /** Bubble Lettering: words as coloring-page lettering. */
  onLettering?: () => void;
  /** Fit Art to Page: any art scaled and centred inside the page margins. */
  onFitArt?: () => void;
  /** My Prompts: every ChatGPT prompt made, to copy or download again. */
  onPrompts?: () => void;
  /** Coloring Book: the complete coloring-book workflow (a saved book by id, or the book list). */
  onColoringBook?: (bookId?: string) => void;
  /** Saved coloring books, newest first. */
  books?: { id: string; name: string; scenes: number; updatedAt: string }[];
  onOpen: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDuplicateAsVariant: (id: string) => void;
  onDelete: (id: string) => void;
  now?: Date;
  /** Online saving (sign in / status). */
  account?: React.ReactNode;
};

const RECENT = 4;

/** "What would you like to create?": finished products first. Each card opens that product's guided flow. */
type CreateCard = { id: string; label: string; blurb: string; glyph: ProductFamilyId | "coloring" | "storybook" | "cover"; family?: ProductFamilyId; action?: "coloring" | "cover" | "lettering" | "fit"; start?: WizardStart; next?: string; featured?: boolean };
const familyStart = (id: ProductFamilyId) => {
  const f = PRODUCT_FAMILIES.find((x) => x.id === id);
  return f?.status === "ready" ? f.start : undefined;
};
const CREATE: CreateCard[] = [
  { id: "coloring-book", label: "Coloring Book", blurb: "Characters, scenes, black-and-white pages, Bible verses if you want them, a full-color cover, and print-ready files.", glyph: "coloring", action: "coloring", featured: true },
  { id: "storybook", label: "Children's Storybook", blurb: "Full-color illustrated pages with your story text.", glyph: "storybook", next: "Coming next" },
  { id: "activity-book", label: "Activity Book", blurb: "Worksheets with prompts, tables, drawing boxes and answer space.", glyph: "worksheet", family: "worksheet", start: familyStart("worksheet") },
  { id: "journal", label: "Journal", blurb: "Guided writing, reflection, lined, dot-grid and free-writing pages.", glyph: "journal", family: "journal", start: familyStart("journal") },
  { id: "workbook", label: "Workbook", blurb: "Lessons with guided exercises and response space.", glyph: "workbook", family: "workbook", start: familyStart("workbook"), next: PRODUCT_FAMILIES.find((f) => f.id === "workbook")?.nextNote },
  { id: "planner", label: "Planner", blurb: "Monthly, weekly, daily and yearly planning pages.", glyph: "planner", family: "planner", start: familyStart("planner") },
  { id: "book-cover", label: "Book Cover", blurb: "A cover on its own: artwork instructions with the exact print size, spine and bleed.", glyph: "cover", action: "cover" },
  { id: "bubble-lettering", label: "Bubble Lettering", blurb: "Words as coloring-page lettering: black outline, white inside. Copy the look of lettering you already have, then export SVG or PNG or put it on a page.", glyph: "coloring", action: "lettering" },
  { id: "fit-art", label: "Fit Art to Page", blurb: "Scale and centre any art (lettering, borders, frames, coloring pictures) inside your page margins, without stretching it.", glyph: "cover", action: "fit" },
  { id: "custom", label: "Other / Custom Product", blurb: "Start blank, then add the pages you need.", glyph: "custom", family: "custom", start: familyStart("custom") },
];

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
const GLYPH: Partial<Record<ProductFamilyId | "coloring" | "storybook" | "cover", ReactNode>> = {
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
  inventory: (
    <>
      <rect x="5" y="6" width="22" height="21" rx="1.5" />
      <path d="M5 11h22M11 11v16M5 16h22M5 21h22M8 14h.1M8 19h.1M8 24h.1" />
    </>
  ),
  tracker: (
    <>
      <rect x="5" y="5" width="22" height="22" rx="2" />
      <path d="M10 11h12M10 16h12M10 21h12M8 11h.1M8 16h.1M8 21h.1" />
    </>
  ),
  coloring: (
    <>
      <path d="M8 5h15a2 2 0 0 1 2 2v20H10a2 2 0 0 1-2-2z" />
      <path d="M13 17c0-3 2-5 4.5-5s4.5 2 4.5 5-2 5-4.5 5-4.5-2-4.5-5zM17.5 12v-2M13 21l-2 2" />
    </>
  ),
  storybook: (
    <>
      <path d="M16 8c-3-2-7-2-10 0v18c3-2 7-2 10 0 3-2 7-2 10 0V8c-3-2-7-2-10 0z" />
      <path d="M16 8v18M9 13l2-2 2 2M19 14h4" />
    </>
  ),
  cover: (
    <>
      <rect x="8" y="4" width="16" height="24" rx="1.5" />
      <path d="M11 9h10M11 12h7M12 24l4-6 4 6" />
    </>
  ),
  custom: (
    <>
      <rect x="6" y="6" width="20" height="20" rx="2" strokeDasharray="3 3" />
      <path d="M16 11v10M11 16h10" />
    </>
  ),
};

function Glyph({ id }: { id: ProductFamilyId | "coloring" | "storybook" | "cover" }) {
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

export function ProjectList({ projects, meta, onStart, onGenerate, onCovers, onLettering, onFitArt, onPrompts, onColoringBook, books = [], onOpen, onDuplicate, onDuplicateAsVariant, onDelete, now, account }: Props) {
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
        {onGenerate && <button className="btn" onClick={onGenerate}>Generate with AI</button>}
        {onCovers && <button className="btn" onClick={onCovers}>Cover Studio</button>}
        {onPrompts && <button className="btn" onClick={onPrompts} data-testid="open-my-prompts">My Prompts</button>}
      </header>
      <div className="page-shell home">
        <section className="home-hero">
          <p className="home-eyebrow">Internal creative workspace</p>
          <h1>Dove Expressions Product Studio</h1>
          <p className="lede">Build print-ready stationery without sorting through every tool at once. Choose a product, choose its pages, then design it.</p>
          <p className="hint build-stamp" data-testid="build">Version {__BUILD__}</p>
        </section>
        {account}

        {books.length > 0 && onColoringBook && (
          <section aria-labelledby="h-books">
            <h2 id="h-books">Coloring books</h2>
            <div className="recent-grid">
              {books.slice(0, RECENT).map((b) => (
                <div key={b.id} className="card recent-card" data-book={b.id}>
                  <h3>{b.name}</h3>
                  <p>Coloring book · {b.scenes} scene{b.scenes === 1 ? "" : "s"}</p>
                  <p className="recent-card__time">Edited {relativeTime(b.updatedAt, now)}</p>
                  <div className="card-actions"><button className="btn btn--primary" onClick={() => onColoringBook(b.id)}>Open</button></div>
                </div>
              ))}
            </div>
          </section>
        )}
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
            <p>Nothing here yet. Choose the kind of product first. Then add the pages and layouts you want — you can mix and match them afterwards.</p>
            <div className="card-actions">
              <button className="btn btn--primary" onClick={() => onStart({ section: "templates" })}>Browse starter templates</button>
              <button className="btn" onClick={() => onStart()}>Start a new product</button>
            </div>
          </section>
        )}

        <section aria-labelledby="h-create">
          <h2 id="h-create">What would you like to create?</h2>
          <p className="hint">Choose the finished product. Each one guides you from setup to a print-ready file.</p>
          <div className="family-grid create-grid" data-testid="create-grid">
            {CREATE.map((c) => {
              const go = c.action === "coloring" ? onColoringBook && (() => onColoringBook()) : c.action === "cover" ? onCovers : c.action === "lettering" ? onLettering : c.action === "fit" ? onFitArt : c.start ? () => onStart(c.start) : undefined;
              return go ? (
                <button key={c.id} type="button" className={`family-card${c.featured ? " family-card--featured" : ""}`} onClick={go} data-create={c.id}>
                  <Glyph id={c.glyph} />
                  <span className="family-card__label">{c.label}</span>
                  <span className="family-card__blurb">{c.blurb}</span>
                </button>
              ) : (
                <div key={c.id} className="family-card family-card--next" aria-disabled="true" data-create={c.id}>
                  <Glyph id={c.glyph} />
                  <span className="family-card__label">{c.label}</span>
                  <span className="family-card__blurb">{c.blurb}</span>
                  <span className="family-card__next">{c.next ?? "Coming next"}</span>
                </div>
              );
            })}
          </div>
          <h3 className="more-types">More product types</h3>
          <div className="family-grid">
              {PRODUCT_FAMILIES.filter((f) => !["journal", "planner", "workbook", "custom"].includes(f.id)).map((f) =>
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

        {(onCovers || onGenerate) && (
          <section aria-labelledby="h-advanced" className="advanced-tools">
            <h2 id="h-advanced">Advanced tools</h2>
            <div className="quick-list">
              {onCovers && (
                <button type="button" className="quick-action" onClick={onCovers}>
                  <strong>Cover art and illustration prompts</strong>
                  <span>Artwork instructions for covers, interior art, children's characters and coordinated collections, on their own.</span>
                </button>
              )}
              {onGenerate && (
                <button type="button" className="quick-action" onClick={onGenerate}>
                  <strong>Turn a document into pages</strong>
                  <span>AI builds a journal, workbook or devotional's pages from your own document or idea.</span>
                </button>
              )}
            </div>
          </section>
        )}

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
              <button type="button" className="quick-action" onClick={() => onStart({ type: "planner", template: "book-daily-planner", section: "books" })}>
                <strong>Start a daily planner</strong>
                <span>A dated page for every day, with the month and week around it.</span>
              </button>
              <button type="button" className="quick-action" onClick={() => onStart({ section: "books" })}>
                <strong>Start with a complete planner or book</strong>
                <span>Monthly, weekly, daily and Meetings With God pages, already arranged.</span>
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
                <strong>Measurements</strong> are worked out from the page size, binding and printer, so margins and binding space are always print-safe.
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
                    <button className="btn" onClick={() => onDuplicateAsVariant(p.id)}>Duplicate as a design option</button>
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

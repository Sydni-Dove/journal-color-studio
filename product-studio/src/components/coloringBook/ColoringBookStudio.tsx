/**
 * COLORING BOOK — the whole product in one place, in five steps:
 *   1 Book Setup · 2 Characters · 3 Interior Pages · 4 Cover Design · 5 Preview and Export
 * Every change is saved as it happens (this device). The finished pages are drawn by Product Studio's own page
 * renderer from one assembled book, so the page previews, the book preview and the print file are the same pages.
 */
import { BUBBLE_FONT } from "../../layouts/book/coloringLettering";
import { MOMMY_SCRIPT_FONT } from "../../layouts/book/devotionalMommy";
import { newSpread } from "../../engines/coloringBook/spread";
import { useEffect, useMemo, useRef, useState } from "react";
import { GIRL_1, bookFromCoverBrief, bookTitle, newBook, type BookStepId, type ColoringBook } from "../../engines/coloringBook/book";
import { assembleCover, assembleInterior } from "../../engines/coloringBook/assembleBook";
import { whatsMissing } from "../../engines/coloringBook/missing";
import type { CoverBrief, Scene } from "../../engines/cover/brief";
import { resolveDocument } from "../../engines/document/resolve";
import { createCanvasMeasurer, heuristicMeasurer } from "../../engines/typography/textMeasure";
import { localBookStore, type BookStore } from "../../persistence/coloringBookStore";
import { loadDraft, localCoverStore, type CoverStore } from "../../persistence/coverStore";
import { newId } from "../../presets/products/projectFactory";
import { useFontLoader } from "../../utils/useFontLoader";
import { holdItem } from "../../persistence/itemBases";
import { savedWhere, useItemsSyncStatus } from "../../app/useItemsSync";
import type { ProductProject } from "../../types/project";
import { StepFooter, StepHeader, type StepDef } from "../editor/Steps";
import { relativeTime } from "../projects/ProjectList";
import { SetupStep } from "./SetupStep";
import { CharactersStep } from "./CharactersStep";
import { PagesStep } from "./PagesStep";
import { CoverStep } from "./CoverStep";
import { PreviewStep } from "./PreviewStep";

export const BOOK_STEPS: StepDef<BookStepId>[] = [
  { id: "setup", title: "Book Setup", blurb: "Title, who it's for, Bible verses, what each page shows, and how it's printed." },
  { id: "characters", title: "Characters", blurb: "Your recurring characters and their reference pictures, so every page draws them the same." },
  { id: "pages", title: "Interior Pages", blurb: "Add your scenes, generate each illustration, upload it, and see the finished page." },
  { id: "cover", title: "Cover Design", blurb: "A full-color cover from the same title and characters." },
  { id: "preview", title: "Preview and Export", blurb: "What's missing, the whole book as it prints, and the print files." },
];
const ORDER = BOOK_STEPS.map((s) => s.id);

type Props = {
  bookId: string | null;
  onBack: () => void;
  /** Saves the finished interior or cover as a product and opens its print step. */
  onExport: (project: ProductProject, book: ColoringBook) => void;
  /** Cover Studio (Advanced Tools). */
  onAdvanced?: () => void;
  store?: BookStore;
  coverStore?: CoverStore;
};

export function ColoringBookStudio({ bookId, onBack, onExport, onAdvanced, store = localBookStore, coverStore = localCoverStore }: Props) {
  const [book, setBook] = useState<ColoringBook | null>(() => (bookId ? store.load(bookId) : null));
  if (!book) return <BookLibrary store={store} coverStore={coverStore} onOpen={setBook} onBack={onBack} onAdvanced={onAdvanced} />;
  return <BookFlow key={book.id} initial={book} store={store} onBack={onBack} onExport={onExport} onLibrary={() => setBook(null)} />;
}

function BookFlow({ initial, store, onBack, onExport, onLibrary }: { initial: ColoringBook; store: BookStore; onBack: () => void; onExport: Props["onExport"]; onLibrary: () => void }) {
  const [book, setBookState] = useState(initial);
  const [saved, setSaved] = useState<"saved" | "saving" | "error">("saved");
  const [message, setMessage] = useState<string | null>(null);
  const [openScene, setOpenScene] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const msgTimer = useRef<number | undefined>(undefined);
  const latest = useRef(book);
  latest.current = book;
  // Online saving leaves this book alone while it is open here.
  useEffect(() => holdItem("coloring-book", initial.id), [initial.id]);
  const online = useItemsSyncStatus();

  const save = (b: ColoringBook) => {
    try {
      store.save(b);
      setSaved("saved");
    } catch {
      setSaved("error");
    }
  };
  const update = (patch: Partial<ColoringBook>) => {
    setBookState((b) => ({ ...b, ...patch, updatedAt: new Date().toISOString() }));
    setSaved("saving");
  };
  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => save(book), 400);
    return () => window.clearTimeout(timer.current);
  }, [book]);
  useEffect(() => {
    const flush = () => save(latest.current);
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, []);

  const setBrief = (patch: Partial<CoverBrief>) => setBookState((b) => ({ ...b, brief: { ...b.brief, ...patch }, ...(patch.title !== undefined ? { name: patch.title } : {}), updatedAt: new Date().toISOString() }));
  const setScene = (id: string, patch: Partial<Scene>) => setBookState((b) => ({ ...b, brief: { ...b.brief, scenes: b.brief.scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)) }, updatedAt: new Date().toISOString() }));
  const say = (m: string) => {
    setMessage(m);
    window.clearTimeout(msgTimer.current);
    msgTimer.current = window.setTimeout(() => setMessage(null), 5000);
  };
  const copy = (t: string) => navigator.clipboard.writeText(t).then(() => say("Copied to clipboard")).catch(() => say("Copy isn't available in this browser"));
  const go = (s: BookStepId, sceneId?: string) => {
    setBookState((b) => ({ ...b, step: s, reached: Math.max(b.reached, ORDER.indexOf(s)) }));
    setOpenScene(sceneId ?? null);
    window.scrollTo({ top: 0 });
  };

  const interior = useMemo(() => resolveDocument(assembleInterior(book)), [book]);
  const fontsReady = useFontLoader(interior.typography.fonts, [book.brief.pageTypography.titleFont, book.brief.pageTypography.scriptureFont, BUBBLE_FONT, MOMMY_SCRIPT_FONT]);
  const issues = useMemo(() => whatsMissing(book, (fontsReady && createCanvasMeasurer()) || heuristicMeasurer), [book, fontsReady]);
  const props = { book, update, setBrief, setScene, say, copy, go, interior };
  const blocking = issues.filter((i) => i.severity === "blocking").length;

  const exportBook = (what: "interior" | "cover" | "digital", proof: boolean) => {
    // The printable digital PDF: the same 8.5 × 11 in pages, set up for printing at home (no printer's binding rules).
    const p = what === "interior" ? assembleInterior(book, book.interiorProjectId) : what === "digital" ? assembleInterior({ ...book, printFormat: "digital" }, book.digitalProjectId) : assembleCover(book, book.coverProjectId);
    const named = { ...p, name: `${p.name}${what === "digital" ? " (printable digital PDF)" : ""}${proof ? " (proof)" : ""}` };
    const next = { ...book, ...(what === "interior" ? { interiorProjectId: p.id } : what === "digital" ? { digitalProjectId: p.id } : { coverProjectId: p.id }) };
    // Saved now, and the copy saved on leaving is this one (the book closes as the print step opens).
    latest.current = next;
    save(next);
    setBookState(next);
    onExport(named, next);
  };

  return (
    <div className="cover-studio book-studio" data-testid="coloring-book">
      <header className="topbar">
        <button className="btn" onClick={onBack}>‹ Home</button>
        <div className="brand"><span className="brand-mark">D</span><span>Coloring Book</span></div>
        <span className="hint book-name">{bookTitle(book) || "Untitled coloring book"}</span>
        <span className="spacer" />
        <span className="hint" role="status" data-testid="book-saved">{saved === "saved" ? savedWhere(online) : saved === "saving" ? "Saving…" : "Not saved: this browser's storage is full"}</span>
        <button className="btn" onClick={onLibrary}>My coloring books</button>
      </header>
      {message && <div className="update-banner" role="status"><span>{message}</span></div>}
      <div className="cover-flow">
        <StepHeader steps={BOOK_STEPS} current={book.step} reached={book.reached} onGo={(s) => go(s)} />
        <StepFooter
          steps={BOOK_STEPS}
          current={book.step}
          onGo={(s) => go(s)}
          finish={<span className="hint steps__status">{blocking ? `${blocking} to fix before printing` : "Print-ready"}</span>}
        />
        {book.step === "setup" && <SetupStep {...props} />}
        {book.step === "characters" && <CharactersStep {...props} otherBooks={store.list().filter((s) => s.id !== book.id).flatMap((s) => store.load(s.id) ?? [])} />}
        {book.step === "pages" && <PagesStep {...props} openScene={openScene} setOpenScene={(id) => { setOpenScene(id); window.scrollTo({ top: 0 }); }} issues={issues} />}
        {book.step === "cover" && <CoverStep {...props} />}
        {book.step === "preview" && <PreviewStep {...props} issues={issues} onExport={exportBook} />}
        <StepFooter steps={BOOK_STEPS} current={book.step} onGo={(s) => go(s)} />
      </div>
    </div>
  );
}

/** A new Devotional Spread book: Mommy & Me, KJV, one empty spread to fill in (Girl 1 saved for Art Prompts). */
function mommyAndMeStarter(): ColoringBook {
  const b = newBook(newId("book"));
  const title = "Mommy & Me: Growing With God Together";
  return {
    ...b, name: title, faithBased: true, content: { ...b.content, title: true, scripture: "full" }, step: "pages", reached: 2,
    brief: { ...b.brief, title, translation: "KJV", ageGroup: "Ages 4–8", pageTypography: { ...b.brief.pageTypography, letterStyle: "bubble" }, scenes: [newSpread(newId("s"), 1)] },
    artCharacters: [GIRL_1],
  };
}

/** The coloring books on this device: open one, start a new one, or bring one in from Cover Studio. */
function BookLibrary({ store, coverStore, onOpen, onBack, onAdvanced }: { store: BookStore; coverStore: CoverStore; onOpen: (b: ColoringBook) => void; onBack: () => void; onAdvanced?: () => void }) {
  const [list, setList] = useState(() => store.list());
  // Work arriving from your account (another device or address) appears without reopening.
  const [synced, setSynced] = useState(0);
  useEffect(() => {
    const on = () => {
      setList(store.list());
      setSynced((n) => n + 1);
    };
    window.addEventListener("dove-items-synced", on);
    return () => window.removeEventListener("dove-items-synced", on);
  }, [store]);
  const start = (b: ColoringBook) => {
    store.save(b);
    onOpen(b);
  };
  // Coloring books started in Cover Studio (Children's Character Illustrations): the draft, and saved collections with characters or scenes.
  const fromCover = useMemo(() => {
    const out: { label: string; brief: CoverBrief }[] = [];
    const d = loadDraft();
    if (d && (d.brief.cast.length || d.brief.scenes.length)) out.push({ label: `${d.brief.collection || d.brief.title || "Cover Studio draft"} (open in Cover Studio)`, brief: d.brief });
    for (const s of coverStore.list()) {
      const c = coverStore.load(s.id);
      if (c && (c.brief.cast.length || c.brief.scenes.length)) out.push({ label: c.name, brief: c.brief });
    }
    return out;
  }, [coverStore, synced]);
  return (
    <div className="cover-studio book-studio" data-testid="coloring-library">
      <header className="topbar">
        <button className="btn" onClick={onBack}>‹ Home</button>
        <div className="brand"><span className="brand-mark">D</span><span>Coloring Book</span></div>
        <span className="spacer" />
        {onAdvanced && <button className="btn" onClick={onAdvanced}>Advanced: Cover Studio</button>}
      </header>
      <div className="page-shell home">
        <section className="home-hero">
          <h1>Coloring Book</h1>
          <p className="lede">Create a complete coloring book: set it up, add your characters and scenes, generate each picture, design the cover, preview the whole book and export print-ready files.</p>
          <div className="card-actions">
            <button type="button" className="btn btn--primary btn--big" onClick={() => start(newBook(newId("book")))} data-testid="new-coloring-book">Start a new coloring book</button>
            <button type="button" className="btn btn--big" onClick={() => start(mommyAndMeStarter())} data-testid="new-mommy-me">Start “Mommy & Me: Growing With God Together” (Devotional Spreads)</button>
          </div>
        </section>
        {list.length > 0 && (
          <section aria-labelledby="h-books">
            <h2 id="h-books">My coloring books</h2>
            <div className="project-rows">
              {list.map((s) => (
                <div key={s.id} className="card project-row">
                  <div className="project-row__main"><h3>{s.name}</h3><p>{s.scenes} scene{s.scenes === 1 ? "" : "s"} · edited {relativeTime(s.updatedAt)}</p></div>
                  <div className="card-actions">
                    <button className="btn btn--primary" onClick={() => { const b = store.load(s.id); if (b) onOpen(b); }}>Open</button>
                    <button className="btn btn--danger" onClick={() => { if (window.confirm(`Delete “${s.name}”? This can't be undone. (Its pictures stay on this device for other books that use them.)`)) { store.remove(s.id); setList(store.list()); } }}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
        {fromCover.length > 0 && (
          <section aria-labelledby="h-from-cover">
            <h2 id="h-from-cover">Continue a coloring book from Cover Studio</h2>
            <p className="hint">Brings its characters (with their reference pictures), scenes, titles, Scripture and artwork into a new coloring book. Nothing in Cover Studio changes.</p>
            <div className="project-rows">
              {fromCover.map((x, i) => (
                <div key={i} className="card project-row">
                  <div className="project-row__main"><h3>{x.label}</h3><p>{x.brief.cast.length} character{x.brief.cast.length === 1 ? "" : "s"} ({x.brief.cast.map((c) => c.name).join(", ") || "none"}) · {x.brief.scenes.length} scene{x.brief.scenes.length === 1 ? "" : "s"}</p></div>
                  <div className="card-actions"><button className="btn btn--primary" onClick={() => start(bookFromCoverBrief(newId("book"), x.brief))} data-testid={`from-cover-${i}`}>Continue as a coloring book</button></div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

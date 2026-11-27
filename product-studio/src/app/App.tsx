import { useUpdateCheck } from "../utils/useUpdateCheck";
import { useCallback, useEffect, useRef, useState } from "react";
import { Editor } from "../components/editor/Editor";
import { ProjectList, type ProjectMeta } from "../components/projects/ProjectList";
import { resolveDocument } from "../engines/document/resolve";
import type { WizardStart } from "../presets/products/productFamilies";
import { NewProductWizard } from "../components/wizard/NewProductWizard";
import { AiDocumentWizard } from "../components/wizard/AiDocumentWizard";
import { CoverStudio } from "../components/cover/CoverStudio";
import { ColoringBookStudio } from "../components/coloringBook/ColoringBookStudio";
import { LetteringStudio, type StudioPicture } from "../components/lettering/LetteringStudio";
import { ArtFitStudio } from "../components/lettering/ArtFitStudio";
import { MyPrompts } from "../components/prompts/MyPrompts";
import { loadDraft, localCoverStore } from "../persistence/coverStore";
import type { ColoringBook } from "../engines/coloringBook/book";
import { localBookStore } from "../persistence/coloringBookStore";
import { resolveColors } from "../presets/themes/palettes";
import { addVariantFromCurrent, duplicateProject, localProjectStore, projectKey, saveGuarded, type ProjectSummary } from "../persistence/projectStore";
import type { ProductProject } from "../types/project";
import { useCloud } from "./useCloud";
import { useItemsSync } from "./useItemsSync";
import { bookFromCoverBrief } from "../engines/coloringBook/book";
import type { CoverBrief } from "../engines/cover/brief";
import { newId } from "../presets/products/projectFactory";
import { CloudAccount, cloudLabel } from "../components/projects/CloudAccount";

type View =
  | { kind: "list" }
  | { kind: "new"; start?: WizardStart }
  | { kind: "ai" }
  | { kind: "cover" }
  | { kind: "coloring"; bookId: string | null }
  | { kind: "lettering" }
  | { kind: "fit" }
  | { kind: "prompts" }
  /** `fromBook`: opened from a Coloring Book's export (its print step open; Back returns to the book). */
  | { kind: "edit"; project: ProductProject; fromBook?: string; startInExport?: boolean };

/** Page count / pad sheets / book flag for the home screen (expansion only — no page is solved). */
function projectMeta(id: string): ProjectMeta {
  const p = localProjectStore.load(id);
  if (!p) return null;
  try {
    const doc = resolveDocument(p);
    return { pages: doc.recipe.pageCount, pad: doc.binding.sheetCountIsMetadata, sheets: p.production.sheetsPerPad, book: !!p.recipe.structure };
  } catch {
    return null;
  }
}

/** Pictures already in Product Studio (projects' artwork, coloring books' pages and covers), each once. */
function studioPictures(projects: ProductProject[], books: ColoringBook[]): StudioPicture[] {
  const out = new Map<string, StudioPicture>();
  for (const p of projects) for (const a of p.artwork?.assets ?? []) if (!out.has(a.id)) out.set(a.id, { id: a.id, name: a.name, from: p.name });
  for (const b of books) {
    const from = b.brief.title || b.name || "Coloring book";
    const add = (id: string | undefined, name: string | undefined) => { if (id && !out.has(id)) out.set(id, { id, name: name ?? "picture", from }); };
    add(b.cover.front?.id, b.cover.front?.name);
    for (const s of b.brief.scenes) {
      add(s.illustrationId, s.illustrationName);
      add(s.mommy?.illustrationId, s.mommy?.illustrationName);
    }
  }
  return [...out.values()];
}

/** Autosave debounce — long enough to batch typing, short enough to feel instant. */
const AUTOSAVE_MS = 600;

/** A newer build is deployed than this tab is running: offer a reload (saving first). */
function UpdateBanner({ onReload }: { onReload: () => void }) {
  return (
    <div className="update-banner" role="status">
      <span>Product Studio was updated. Reload to get the latest version — your work is saved first.</span>
      <button type="button" className="btn btn--primary" onClick={onReload}>Reload</button>
    </div>
  );
}

export function App() {
  const stale = useUpdateCheck();
  const store = localProjectStore;
  const [projects, setProjects] = useState<ProjectSummary[]>(() => store.list());
  const [view, setView] = useState<View>({ kind: "list" });
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">("saved");
  const timer = useRef<number | undefined>(undefined);

  const refresh = () => setProjects(store.list());
  /** Edits made in this tab that are not saved yet. Only then does anything write to storage. */
  const dirty = useRef(false);
  /** updatedAt of the version this tab loaded or last saved: a newer stored one came from another tab. */
  const base = useRef<string | null>(null);
  const current = useRef<ProductProject | null>(null);
  /** A message about something that happened to the person's products (a kept copy, a deletion from another device…). */
  const [notice, setNotice] = useState<string | null>(null);
  /** Bumped when another tab's version replaces this tab's: the editor starts fresh (its undo history was of the old one). */
  const [generation, setGeneration] = useState(0);

  const cloud = useCloud({
    store,
    onLocalChanged: (updated) => {
      // Newer versions from another device: an open project with no unsaved edits follows them.
      const open = current.current;
      const mine = open && updated.find((u) => u.id === open.id);
      if (mine && !dirty.current) openLoaded(mine);
      refresh();
    },
    onEvent: (e) => {
      const open = current.current;
      if (e.kind === "kept-both") {
        if (open && open.id === e.current.id) {
          base.current = e.current.updatedAt;
          current.current = e.current;
          dirty.current = false;
          setView((v) => (v.kind === "edit" && v.project.id === e.current.id ? { ...v, project: e.current } : v));
          setGeneration((g) => g + 1);
          setNotice(`This project was also changed on another device, so the newest version is open here. The other version was kept as a separate project: “${e.copy.name}”.`);
        } else setNotice(`“${e.current.name}” was changed on two devices. Both versions were kept: the newest as “${e.current.name}”, the other as “${e.copy.name}”.`);
      } else if (e.kind === "deleted-elsewhere") {
        if (open && open.id === e.id) {
          if (e.recovered) openLoaded(e.recovered);
          else {
            current.current = null;
            dirty.current = false;
            setView({ kind: "list" });
          }
        }
        if (e.recovered) setNotice(`“${e.name}” was deleted on another device. The edits made here that weren't saved online yet were kept as a separate project: “${e.recovered.name}”.`);
        else if (open && open.id === e.id) setNotice(`“${e.name}” was deleted on another device.`);
      } else {
        setNotice(`“${e.name}” was changed on another device after you deleted it, so it was kept (nothing was lost). Delete it again if you no longer need it.`);
        void cloudRef.current.sync();
      }
      refresh();
    },
  });
  const cloudRef = useRef(cloud);
  cloudRef.current = cloud;
  // Cover Studio and Coloring Book saved online too (signed in); the home screen re-reads its lists when a sync brings work here.
  const itemsReceived = useItemsSync(cloud.session?.user.id ?? null);
  /** Continue a Cover Studio coloring book as a Coloring Book: everything entered there comes along. */
  const continueAsBook = (brief: CoverBrief) => {
    const book = bookFromCoverBrief(newId("book"), brief);
    localBookStore.save(book);
    setView({ kind: "coloring", bookId: book.id });
  };

  const persist = useCallback((p: ProductProject) => {
    window.clearTimeout(timer.current);
    const startedFrom = base.current;
    try {
      const r = saveGuarded(store, p, base.current);
      if (r.status === "saved") void cloudRef.current.saved(p, startedFrom);
      else void cloudRef.current.saved(r.copy, null);
      if (r.status === "conflict") {
        // Never overwrite newer work: keep the newer version open, this tab's edits as a separate copy.
        base.current = r.stored.updatedAt;
        current.current = r.stored;
        setView((v) => (v.kind === "edit" && v.project.id === p.id ? { ...v, project: r.stored } : v));
        setGeneration((g) => g + 1);
        setNotice(`This project was changed in another tab, so that newer version is open here. Your edits were kept as a separate project: “${r.copy.name}”.`);
      } else base.current = p.updatedAt;
      dirty.current = false;
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
    refresh();
  }, []);
  /** Save only unsaved edits (leaving, reloading, going back): an unchanged tab never writes. */
  const flush = useCallback(() => {
    if (dirty.current && current.current) persist(current.current);
  }, [persist]);

  const openLoaded = (p: ProductProject, from?: { fromBook?: string; startInExport?: boolean }) => {
    base.current = p.updatedAt;
    current.current = p;
    dirty.current = false;
    setNotice(null);
    setGeneration((g) => g + 1);
    setView({ kind: "edit", project: p, ...(from ?? {}) });
  };
  const open = (p: ProductProject, from?: { fromBook?: string; startInExport?: boolean }) => {
    // Rebuilding a product that exists (a Coloring Book exported again) replaces it: never a conflict copy.
    const existing = store.load(p.id);
    base.current = existing ? existing.updatedAt : null;
    persist({ ...p, createdAt: existing?.createdAt ?? p.createdAt, updatedAt: new Date().toISOString() });
    openLoaded(store.load(p.id) ?? p, from);
  };

  const onChange = (p: ProductProject) => {
    current.current = p;
    dirty.current = true;
    setView((v) => (v.kind === "edit" ? { ...v, project: p } : { kind: "edit", project: p }));
    setSaveStatus("saving");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => persist(p), AUTOSAVE_MS);
  };

  // Flush a pending autosave when leaving the page.
  useEffect(() => {
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, [flush]);

  // Another tab saved: an unchanged tab follows it (so it can never write an older copy later).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      const open = current.current;
      if (open && e.key === projectKey(open.id) && !dirty.current) {
        const p = store.load(open.id);
        if (p && p.updatedAt > (base.current ?? "")) openLoaded(p);
      }
      refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const reload = () => {
    flush();
    window.location.reload();
  };
  const banner = stale ? <UpdateBanner onReload={reload} /> : null;
  const noticeBanner = notice ? <div className="update-banner" role="alert"><span>{notice}</span><button type="button" className="btn" onClick={() => setNotice(null)}>OK</button></div> : null;
  if (view.kind === "new") return <>{banner}<NewProductWizard start={view.start} onCreate={open} onCancel={() => setView({ kind: "list" })} /></>;
  if (view.kind === "ai")
    return (
      <>
        {banner}
        <AiDocumentWizard
          signedIn={!!cloud.session}
          account={
            <CloudAccount
              email={cloud.session?.user.email ?? null}
              status={cloud.status}
              error={cloud.error}
              onSignIn={cloud.signIn}
              onSignOut={() => void cloud.signOut()}
              onRetry={() => void cloud.sync()}
              intro={<p>Use the same Dove Expressions account as for online saving.</p>}
              signInLabel="Sign in to use Generate with AI"
            />
          }
          onCreate={open}
          onCancel={() => setView({ kind: "list" })}
        />
      </>
    );
  if (view.kind === "cover")
    return (
      <>
        {banner}
        <CoverStudio onBack={() => setView({ kind: "list" })} projects={projects} loadProject={(id) => store.load(id)} onCreateProject={open} onColoringBook={continueAsBook} />
      </>
    );
  if (view.kind === "prompts")
    return (
      <>
        {banner}
        <MyPrompts
          onBack={() => setView({ kind: "list" })}
          books={localBookStore.list().flatMap((b) => localBookStore.load(b.id) ?? [])}
          collections={[
            ...localCoverStore.list().flatMap((c) => localCoverStore.load(c.id) ?? []),
            // The Cover Studio draft in progress (when it isn't a saved collection already).
            ...((d) => (d && !d.collectionId ? [{ schemaVersion: 1, id: "cover-draft", name: "Cover Studio draft", createdAt: d.updatedAt ?? "", updatedAt: d.updatedAt ?? "", brief: d.brief, items: d.items, direction: d.direction }] : []))(loadDraft()),
          ]}
        />
      </>
    );
  if (view.kind === "fit")
    return (
      <>
        {banner}
        <ArtFitStudio
          onBack={() => setView({ kind: "list" })}
          projects={projects}
          loadProject={(id) => store.load(id)}
          pictures={studioPictures(projects.map((p) => store.load(p.id)).filter((p): p is ProductProject => !!p), localBookStore.list().flatMap((b) => localBookStore.load(b.id) ?? []))}
          onPlaced={open}
        />
      </>
    );
  if (view.kind === "lettering")
    return (
      <>
        {banner}
        <LetteringStudio
          onBack={() => setView({ kind: "list" })}
          projects={projects}
          loadProject={(id) => store.load(id)}
          pictures={studioPictures(projects.map((p) => store.load(p.id)).filter((p): p is ProductProject => !!p), localBookStore.list().flatMap((b) => localBookStore.load(b.id) ?? []))}
          onPlaced={open}
        />
      </>
    );
  if (view.kind === "coloring")
    return (
      <>
        {banner}
        <ColoringBookStudio
          bookId={view.bookId}
          onBack={() => setView({ kind: "list" })}
          onAdvanced={() => setView({ kind: "cover" })}
          onExport={(p, book) => {
            // Exporting again rebuilds the pages from the book, but keeps the typography chosen in the editor (Style → Typography).
            const before = store.load(p.id);
            open(before ? { ...p, typography: before.typography } : p, { fromBook: book.id, startInExport: true });
          }}
        />
      </>
    );
  if (view.kind === "edit") {
    return (
      <>
      {banner}
      {noticeBanner}
      <Editor
        key={`${view.project.id}:${generation}`}
        project={view.project}
        onChange={onChange}
        saveStatus={saveStatus}
        cloudLabel={cloudLabel(cloud.status)}
        startInExport={view.startInExport}
        backLabel={view.fromBook ? "‹ Back to the coloring book" : undefined}
        onBack={() => {
          flush();
          current.current = null;
          setView(view.fromBook ? { kind: "coloring", bookId: view.fromBook } : { kind: "list" });
        }}
      />
      </>
    );
  }
  return (
    <>
    {banner}
    {noticeBanner}
    <ProjectList
      projects={projects}
      meta={projectMeta}
      onStart={(start) => setView({ kind: "new", start })}
      onGenerate={() => setView({ kind: "ai" })}
      onCovers={() => setView({ kind: "cover" })}
      onLettering={() => setView({ kind: "lettering" })}
      onFitArt={() => setView({ kind: "fit" })}
      onPrompts={() => setView({ kind: "prompts" })}
      onColoringBook={(bookId) => setView({ kind: "coloring", bookId: bookId ?? null })}
      books={localBookStore.list()}
      key={`home-${itemsReceived}`}
      onOpen={(id) => {
        const p = store.load(id);
        if (p) openLoaded(p);
      }}
      onDuplicate={(id) => {
        const p = store.load(id);
        if (p) persist(duplicateProject(p));
      }}
      onDuplicateAsVariant={(id) => {
        const p = store.load(id);
        if (!p) return;
        const withVariant = addVariantFromCurrent(p, `Variant ${p.variants.length + 1}`, resolveColors(p.colors.paletteId, p.colors.overrides, p.colors));
        open({ ...withVariant, updatedAt: new Date().toISOString() });
      }}
      onDelete={(id) => {
        const p = store.load(id);
        if (p) void cloud.remove(p); // removes it here at once; online when it can (remembered until then)
        else store.remove(id);
        refresh();
      }}
      account={<CloudAccount email={cloud.session?.user.email ?? null} status={cloud.status} error={cloud.error} onSignIn={cloud.signIn} onSignOut={() => void cloud.signOut()} onRetry={() => void cloud.sync()} />}
    />
    </>
  );
}

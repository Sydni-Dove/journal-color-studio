import { useUpdateCheck } from "../utils/useUpdateCheck";
import { useCallback, useEffect, useRef, useState } from "react";
import { Editor } from "../components/editor/Editor";
import { ProjectList, type ProjectMeta } from "../components/projects/ProjectList";
import { resolveDocument } from "../engines/document/resolve";
import type { WizardStart } from "../presets/products/productFamilies";
import { NewProductWizard } from "../components/wizard/NewProductWizard";
import { resolveColors } from "../presets/themes/palettes";
import { addVariantFromCurrent, duplicateProject, localProjectStore, projectKey, saveGuarded, type ProjectSummary } from "../persistence/projectStore";
import type { ProductProject } from "../types/project";
import { useCloud } from "./useCloud";
import { CloudAccount, cloudLabel } from "../components/projects/CloudAccount";

type View = { kind: "list" } | { kind: "new"; start?: WizardStart } | { kind: "edit"; project: ProductProject };

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
  const [conflict, setConflict] = useState<string | null>(null);
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
    onConflict: (newer, copyName) => {
      const open = current.current;
      if (open && open.id === newer.id) {
        base.current = newer.updatedAt;
        current.current = newer;
        dirty.current = false;
        setView((v) => (v.kind === "edit" && v.project.id === newer.id ? { kind: "edit", project: newer } : v));
        setGeneration((g) => g + 1);
      }
      setConflict(`${copyName}|device`);
      refresh();
    },
  });
  const cloudRef = useRef(cloud);
  cloudRef.current = cloud;

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
        setView((v) => (v.kind === "edit" && v.project.id === p.id ? { kind: "edit", project: r.stored } : v));
        setGeneration((g) => g + 1);
        setConflict(r.copy.name);
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

  const openLoaded = (p: ProductProject) => {
    base.current = p.updatedAt;
    current.current = p;
    dirty.current = false;
    setConflict(null);
    setGeneration((g) => g + 1);
    setView({ kind: "edit", project: p });
  };
  const open = (p: ProductProject) => {
    base.current = null;
    persist(p);
    openLoaded(p);
  };

  const onChange = (p: ProductProject) => {
    current.current = p;
    dirty.current = true;
    setView({ kind: "edit", project: p });
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
  if (view.kind === "new") return <>{banner}<NewProductWizard start={view.start} onCreate={open} onCancel={() => setView({ kind: "list" })} /></>;
  if (view.kind === "edit") {
    return (
      <>
      {banner}
      {conflict && <div className="update-banner" role="alert"><span>This project was changed {conflict.endsWith("|device") ? "on another device" : "in another tab"}, so that newer version is open here. Your edits were kept as a separate project: “{conflict.replace(/\|device$/, "")}”.</span><button type="button" className="btn" onClick={() => setConflict(null)}>OK</button></div>}
      <Editor
        key={`${view.project.id}:${generation}`}
        project={view.project}
        onChange={onChange}
        saveStatus={saveStatus}
        cloudLabel={cloudLabel(cloud.status)}
        onBack={() => {
          flush();
          current.current = null;
          setView({ kind: "list" });
        }}
      />
      </>
    );
  }
  return (
    <>
    {banner}
    <ProjectList
      projects={projects}
      meta={projectMeta}
      onStart={(start) => setView({ kind: "new", start })}
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
        store.remove(id);
        void cloud.removed(id);
        refresh();
      }}
      account={<CloudAccount email={cloud.session?.user.email ?? null} status={cloud.status} error={cloud.error} onSignIn={cloud.signIn} onSignOut={() => void cloud.signOut()} onRetry={() => void cloud.sync()} />}
    />
    </>
  );
}

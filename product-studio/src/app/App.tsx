import { useCallback, useEffect, useRef, useState } from "react";
import { Editor } from "../components/editor/Editor";
import { ProjectList, type ProjectMeta } from "../components/projects/ProjectList";
import { resolveDocument } from "../engines/document/resolve";
import type { WizardStart } from "../presets/products/productFamilies";
import { NewProductWizard } from "../components/wizard/NewProductWizard";
import { resolveColors } from "../presets/themes/palettes";
import { addVariantFromCurrent, duplicateProject, localProjectStore, type ProjectSummary } from "../persistence/projectStore";
import type { ProductProject } from "../types/project";

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

export function App() {
  const store = localProjectStore;
  const [projects, setProjects] = useState<ProjectSummary[]>(() => store.list());
  const [view, setView] = useState<View>({ kind: "list" });
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">("saved");
  const timer = useRef<number | undefined>(undefined);

  const refresh = () => setProjects(store.list());

  const persist = useCallback((p: ProductProject) => {
    try {
      store.save(p);
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
    refresh();
  }, []);

  const open = (p: ProductProject) => {
    persist(p);
    setView({ kind: "edit", project: p });
  };

  const onChange = (p: ProductProject) => {
    setView({ kind: "edit", project: p });
    setSaveStatus("saving");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => persist(p), AUTOSAVE_MS);
  };

  // Flush a pending autosave when leaving the page.
  useEffect(() => {
    const flush = () => {
      if (view.kind === "edit" && saveStatus === "saving") persist(view.project);
    };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, [view, saveStatus, persist]);

  if (view.kind === "new") return <NewProductWizard start={view.start} onCreate={open} onCancel={() => setView({ kind: "list" })} />;
  if (view.kind === "edit") {
    return (
      <Editor
        project={view.project}
        onChange={onChange}
        saveStatus={saveStatus}
        onBack={() => {
          window.clearTimeout(timer.current);
          persist(view.project);
          setView({ kind: "list" });
        }}
      />
    );
  }
  return (
    <ProjectList
      projects={projects}
      meta={projectMeta}
      onStart={(start) => setView({ kind: "new", start })}
      onOpen={(id) => {
        const p = store.load(id);
        if (p) setView({ kind: "edit", project: p });
      }}
      onDuplicate={(id) => {
        const p = store.load(id);
        if (p) persist(duplicateProject(p));
      }}
      onDuplicateAsVariant={(id) => {
        const p = store.load(id);
        if (!p) return;
        const withVariant = addVariantFromCurrent(p, `Variant ${p.variants.length + 1}`, resolveColors(p.colors.paletteId, p.colors.overrides));
        open({ ...withVariant, updatedAt: new Date().toISOString() });
      }}
      onDelete={(id) => {
        store.remove(id);
        refresh();
      }}
    />
  );
}

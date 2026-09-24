/**
 * Project persistence — localStorage, one key per project plus an index.
 * Structured project JSON is the source of truth; generated HTML is never
 * stored. Kept behind this interface so a backend (or Dove Command Center)
 * can replace it later without touching the editor.
 */
import type { ProductProject } from "../types/project";
import type { ColorTokens } from "../types/tokens";
import { PROJECT_SCHEMA_VERSION } from "../types/project";
import { newId } from "../presets/products/projectFactory";

const PREFIX = "dove-product-studio:v1";
const INDEX_KEY = `${PREFIX}:index`;
const projectKey = (id: string) => `${PREFIX}:project:${id}`;

export type ProjectSummary = {
  id: string;
  name: string;
  productType: ProductProject["productType"];
  sizePresetId: string;
  updatedAt: string;
  variantCount: number;
};

export interface ProjectStore {
  list(): ProjectSummary[];
  load(id: string): ProductProject | null;
  save(project: ProductProject): void;
  remove(id: string): void;
}

function summarize(p: ProductProject): ProjectSummary {
  return { id: p.id, name: p.name, productType: p.productType, sizePresetId: p.dimensions.sizePresetId, updatedAt: p.updatedAt, variantCount: p.variants.length };
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function migrate(raw: unknown): ProductProject | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as ProductProject;
  if (p.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    // Future schema migrations go here. Unknown versions are refused rather
    // than guessed at.
    return null;
  }
  return p;
}

export const localProjectStore: ProjectStore = {
  list() {
    try {
      const idx = JSON.parse(safeGet(INDEX_KEY) ?? "[]") as ProjectSummary[];
      return idx.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    } catch {
      return [];
    }
  },
  load(id) {
    try {
      return migrate(JSON.parse(safeGet(projectKey(id)) ?? "null"));
    } catch {
      return null;
    }
  },
  save(project) {
    // Throws on quota errors so the caller can show "Save failed".
    localStorage.setItem(projectKey(project.id), JSON.stringify(project));
    const idx = this.list().filter((s) => s.id !== project.id);
    idx.push(summarize(project));
    localStorage.setItem(INDEX_KEY, JSON.stringify(idx));
  },
  remove(id) {
    try {
      localStorage.removeItem(projectKey(id));
      localStorage.setItem(INDEX_KEY, JSON.stringify(this.list().filter((s) => s.id !== id)));
    } catch {
      /* storage unavailable */
    }
  },
};

export function duplicateProject(p: ProductProject, name?: string): ProductProject {
  const now = new Date().toISOString();
  return { ...structuredClone(p), id: newId(), name: name ?? `${p.name} (copy)`, createdAt: now, updatedAt: now };
}

/** Add a color/style variant capturing the project's current look. */
export function addVariantFromCurrent(p: ProductProject, name: string, resolvedColors: Partial<ColorTokens>): ProductProject {
  const id = newId("v");
  return {
    ...p,
    variants: [
      ...p.variants,
      {
        id,
        name,
        overrides: {
          colors: { ...resolvedColors },
          decorativeTheme: { ...p.decorativeTheme },
          title: p.wording.productTitle,
        },
      },
    ],
    activeVariantId: id,
  };
}

/**
 * COLORING BOOKS — saved on this device like Cover Studio collections (localStorage, one key per book plus an index,
 * under the same versioned prefix). A book's reference images and artwork live in the artwork store (IndexedDB), by id.
 * Older saves keep working when fields are added: every field is merged onto the defaults; nothing is ever deleted.
 */
import { itemsChanged, normalizeBrief } from "./coverStore";
import { markItemDeleted } from "./itemBases";
import { newBook, PRINT_FORMATS, type BookStepId, type ColoringBook, type PageContent } from "../engines/coloringBook/book";

const PREFIX = "dove-product-studio:v1";
const INDEX_KEY = `${PREFIX}:coloring-book-index`;
export const bookKey = (id: string) => `${PREFIX}:coloring-book:${id}`;

export type BookSummary = { id: string; name: string; scenes: number; updatedAt: string };
const summarize = (b: ColoringBook): BookSummary => ({ id: b.id, name: b.name || b.brief.title || "Untitled coloring book", scenes: b.brief.scenes.length, updatedAt: b.updatedAt });

const safeGet = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export interface BookStore {
  list(): BookSummary[];
  load(id: string): ColoringBook | null;
  /** Throws when the browser refuses the write (storage full), so the caller can say so. */
  save(b: ColoringBook): void;
  remove(id: string): void;
}

const STEPS: BookStepId[] = ["setup", "characters", "pages", "cover", "preview"];

function content(raw: unknown, d: PageContent): PageContent {
  const c = (raw ?? {}) as Record<string, unknown>;
  return {
    title: typeof c.title === "boolean" ? c.title : d.title,
    scripture: c.scripture === "full" || c.scripture === "reference" || c.scripture === "none" ? c.scripture : d.scripture,
    lesson: typeof c.lesson === "boolean" ? c.lesson : d.lesson,
    customText: typeof c.customText === "boolean" ? c.customText : d.customText,
  };
}

export function normalizeBook(raw: unknown): ColoringBook | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (typeof r.id !== "string") return null;
  const d = newBook(r.id, {}, typeof r.createdAt === "string" ? r.createdAt : undefined);
  const fm = (r.frontMatter ?? {}) as Record<string, unknown>;
  const cv = (r.cover ?? {}) as Record<string, unknown>;
  const front = cv.front as Record<string, unknown> | undefined;
  return {
    ...d,
    name: typeof r.name === "string" ? r.name : "",
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : d.updatedAt,
    brief: { ...normalizeBrief(r.brief), category: "character" },
    author: typeof r.author === "string" ? r.author : "",
    faithBased: r.faithBased === true,
    content: content(r.content, d.content),
    printFormat: PRINT_FORMATS.some((f) => f.id === r.printFormat) ? (r.printFormat as ColoringBook["printFormat"]) : d.printFormat,
    sides: r.sides === "double" ? "double" : "single",
    frontMatter: { titlePage: fm.titlePage !== false, copyrightPage: fm.copyrightPage !== false, belongsTo: fm.belongsTo === true },
    drawingPages: Math.max(0, Math.min(100, Math.round(Number(r.drawingPages) || 0))),
    scripturePermission: r.scripturePermission === true,
    difficulty: typeof r.difficulty === "string" ? r.difficulty : d.difficulty,
    importSource: typeof r.importSource === "string" ? r.importSource : "",
    cover: {
      mode: cv.mode === "as-is" ? "as-is" : "with-title",
      backText: typeof cv.backText === "string" ? cv.backText : "",
      ...(front && typeof front.id === "string" ? { front: { id: front.id, name: String(front.name ?? "cover"), w: Number(front.w) || 0, h: Number(front.h) || 0 } } : {}),
      ...(typeof cv.approved === "string" ? { approved: cv.approved } : {}),
    },
    ...(typeof r.interiorProjectId === "string" ? { interiorProjectId: r.interiorProjectId } : {}),
    ...(typeof r.coverProjectId === "string" ? { coverProjectId: r.coverProjectId } : {}),
    step: STEPS.includes(r.step as BookStepId) ? (r.step as BookStepId) : "setup",
    reached: Math.max(0, Math.min(4, Math.round(Number(r.reached) || 0))),
  };
}

export const localBookStore: BookStore = {
  list() {
    try {
      return (JSON.parse(safeGet(INDEX_KEY) ?? "[]") as BookSummary[]).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    } catch {
      return [];
    }
  },
  load(id) {
    try {
      return normalizeBook(JSON.parse(safeGet(bookKey(id)) ?? "null"));
    } catch {
      return null;
    }
  },
  save(b) {
    localStorage.setItem(bookKey(b.id), JSON.stringify(b));
    const idx = this.list().filter((s) => s.id !== b.id);
    idx.push(summarize(b));
    localStorage.setItem(INDEX_KEY, JSON.stringify(idx));
    itemsChanged();
  },
  remove(id) {
    try {
      const was = this.load(id);
      if (was) markItemDeleted("coloring-book", id, was.updatedAt);
      localStorage.removeItem(bookKey(id));
      localStorage.setItem(INDEX_KEY, JSON.stringify(this.list().filter((s) => s.id !== id)));
    } catch {
      /* storage unavailable */
    }
  },
};

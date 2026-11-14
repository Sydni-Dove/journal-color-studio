/**
 * COVER COLLECTIONS — saved with the same kind of storage as Product Studio's projects (this browser's
 * localStorage, one key per item plus an index, versioned under the same prefix) but kept apart from projects: a
 * collection is a set of covers for several products, not one product, so it never appears in the project list,
 * is never part of an export, and never touches autosave or online saving of projects.
 *
 * Collections are saved on this device only (online saving syncs projects; collections have no table online yet).
 * "Export collection JSON" is the backup. The file format also reads the standalone stationery cover generator's
 * backups ("dove-stationery-v1"), so collections made there open here.
 */
import { newId } from "../presets/products/projectFactory";
import { COVER_PALETTES } from "../presets/themes/palettes";
import { jcsPaletteId } from "../design-library/palettes";
import { COVER_SCHEMA_VERSION, newBrief, type CoverBrief, type CoverCollection, type CoverItem } from "../engines/cover/brief";
import { summarizePalette } from "../engines/cover/prompt";

const PREFIX = "dove-product-studio:v1";
const INDEX_KEY = `${PREFIX}:cover-index`;
const DRAFT_KEY = `${PREFIX}:cover-draft`;
export const coverKey = (id: string) => `${PREFIX}:cover:${id}`;
export const COVER_FILE_SCHEMA = "dove-product-studio-cover-v1";
const LEGACY_FILE_SCHEMA = "dove-stationery-v1";

export type CoverSummary = { id: string; name: string; theme: string; items: number; updatedAt: string };

const summarize = (c: CoverCollection): CoverSummary => ({ id: c.id, name: c.name, theme: c.brief.theme, items: c.items.length, updatedAt: c.updatedAt });
const safeGet = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export interface CoverStore {
  list(): CoverSummary[];
  load(id: string): CoverCollection | null;
  /** Throws when the browser refuses the write (quota), so the caller can say "Save failed". */
  save(c: CoverCollection): void;
  remove(id: string): void;
}

export const localCoverStore: CoverStore = {
  list() {
    try {
      const idx = JSON.parse(safeGet(INDEX_KEY) ?? "[]") as CoverSummary[];
      return idx.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    } catch {
      return [];
    }
  },
  load(id) {
    try {
      const c = JSON.parse(safeGet(coverKey(id)) ?? "null") as CoverCollection | null;
      if (!c || c.schemaVersion !== COVER_SCHEMA_VERSION) return null;
      // Older saves keep working when a field is added: the brief is merged onto the defaults.
      return { ...c, brief: normalizeBrief(c.brief), items: normalizeItems(c.items) };
    } catch {
      return null;
    }
  },
  save(c) {
    localStorage.setItem(coverKey(c.id), JSON.stringify(c));
    const idx = this.list().filter((s) => s.id !== c.id);
    idx.push(summarize(c));
    localStorage.setItem(INDEX_KEY, JSON.stringify(idx));
  },
  remove(id) {
    try {
      localStorage.removeItem(coverKey(id));
      localStorage.setItem(INDEX_KEY, JSON.stringify(this.list().filter((s) => s.id !== id)));
    } catch {
      /* storage unavailable */
    }
  },
};

/** The brief being worked on (not yet a saved collection): kept so a reload doesn't lose it. */
/** The draft: the brief, the set, the chosen direction and collection, and the screen in view (and the furthest reached). */
export type CoverDraft = { brief: CoverBrief; items: CoverItem[]; direction: number; collectionId: string | null; step?: string; reached?: number };
export function loadDraft(): CoverDraft | null {
  try {
    const d = JSON.parse(safeGet(DRAFT_KEY) ?? "null");
    if (!d || typeof d !== "object") return null;
    return {
      brief: normalizeBrief(d.brief), items: normalizeItems(d.items), direction: clampDirection(d.direction), collectionId: typeof d.collectionId === "string" ? d.collectionId : null,
      ...(typeof d.step === "string" ? { step: d.step } : {}), ...(Number.isFinite(d.reached) ? { reached: Math.max(0, Math.min(3, Math.round(d.reached))) } : {}),
    };
  } catch {
    return null;
  }
}
export function saveDraft(d: CoverDraft): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    /* a convenience only */
  }
}
export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

const clampDirection = (v: unknown): number => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 4 ? (v as number) : 0);
const text = (v: unknown, d: string): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : d);
/** "120" / 120 → 120; "" / null / junk → null. */
const optNum = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const numOr = (v: unknown, d: number): number => optNum(v) ?? d;

/** A palette id from the standalone generator → this studio's id ("custom" and unknown ids are kept apart). */
export function importedPaletteId(id: string): string | null {
  if (id === "custom") return "custom";
  const alias: Record<string, string> = { "ps-dove-warmth": "dove-coral", "jcs-dream-journal-dove-signature": "dove-signature" };
  const exists = (x: string) => COVER_PALETTES.some((p) => p.id === x);
  if (alias[id]) return alias[id];
  if (id.startsWith("ps-") && exists(id.slice(3))) return id.slice(3);
  const m = /^jcs-(?:dream-journal|color-families|prayer-journal|prayer-warrior|warring-woman)-(.+)$/.exec(id);
  if (m) {
    const byName = COVER_PALETTES.find((p) => p.id === `jcs-${m[1]}`) ?? COVER_PALETTES.find((p) => p.id === jcsPaletteId(m[1].replace(/-/g, " ")));
    if (byName) return byName.id;
  }
  return exists(id) ? id : null;
}

/** Whatever a saved or imported brief holds, as a complete brief (missing fields take the defaults). */
export function normalizeBrief(raw: unknown): CoverBrief {
  const d = newBrief();
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const palette = text(r.palette, d.palette);
  const mapped = importedPaletteId(palette);
  const format = r.format === "wrap" ? "wrap" : "front";
  return {
    ...d,
    collection: text(r.collection, d.collection), theme: text(r.theme, d.theme), season: text(r.season, d.season), audience: text(r.audience, d.audience),
    scripture: text(r.scripture, d.scripture), imagery: text(r.imagery, d.imagery), avoid: text(r.avoid, d.avoid), style: text(r.style, d.style),
    palette: mapped ?? "custom",
    colorPrimary: text(r.colorPrimary, d.colorPrimary), colorAccent: text(r.colorAccent, d.colorAccent), colorPaper: text(r.colorPaper, d.colorPaper), colorText: text(r.colorText, d.colorText),
    product: text(r.product, d.product), size: text(r.size, d.size), customW: numOr(r.customW, d.customW), customH: numOr(r.customH, d.customH), format,
    binding: text(r.binding, d.binding), printProfile: text(r.printProfile, d.printProfile), pages: "pages" in r ? optNum(r.pages) : d.pages, spine: optNum(r.spine),
    bleed: numOr(r.bleed, d.bleed), safe: numOr(r.safe, d.safe), medium: r.medium === "Digital" ? "Digital" : "Print", dpi: numOr(r.dpi, d.dpi),
    title: text(r.title, d.title), subtitle: text(r.subtitle, d.subtitle), etsyTitle: text(r.etsyTitle, d.etsyTitle), angle: text(r.angle, d.angle), tags: text(r.tags, d.tags),
    mockups: text(r.mockups, d.mockups), status: text(r.status, d.status),
    // Saved before categories existed: a cover, with the other categories' details at their defaults.
    category: r.category === "interior" || r.category === "character" || r.category === "collection" || r.category === "coloring-cover" ? r.category : "cover",
    typography: text(r.typography, d.typography),
    pageKind: text(r.pageKind, d.pageKind), artUse: text(r.artUse, d.artUse), artPlacement: text(r.artPlacement, d.artPlacement), clearArea: text(r.clearArea, d.clearArea),
    characters: text(r.characters, d.characters), ageGroup: text(r.ageGroup, d.ageGroup), expressions: text(r.expressions, d.expressions),
    characterCount: Math.max(1, Math.min(12, Math.round(numOr(r.characterCount, d.characterCount)))), characterBackground: r.characterBackground === "scene" ? "scene" : "transparent", scene: text(r.scene, d.scene),
    ...normalizeColoring(r, d),
  };
}

const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const optText = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const THICK = ["Thin", "Medium", "Thick"] as const, COMPLEX = ["Simple", "Moderate", "Detailed"] as const;
const OUTPUTS = ["coloring-page", "illustration", "worksheet", "drawing-page", "reference-sheet"] as const;

function normalizeTypography(raw: unknown, d: CoverBrief["pageTypography"]): CoverBrief["pageTypography"] {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    titleFont: text(r.titleFont, d.titleFont), scriptureFont: text(r.scriptureFont, d.scriptureFont),
    align: r.align === "left" || r.align === "right" ? r.align : "center", titleSizePt: Math.max(10, Math.min(72, numOr(r.titleSizePt, d.titleSizePt))),
  };
}

/** The cast, scenes, coloring defaults and coloring-cover choices (absent in collections saved before them). */
function normalizeColoring(r: Record<string, unknown>, d: CoverBrief): Partial<CoverBrief> {
  const cast = (Array.isArray(r.cast) ? r.cast : []).flatMap((x) => {
    const c = (x ?? {}) as Record<string, unknown>;
    if (typeof c.id !== "string") return [];
    return [{
      id: c.id, name: text(c.name, ""), description: text(c.description, ""), traits: text(c.traits, ""),
      ...(optText(c.refId) ? { refId: optText(c.refId), refName: optText(c.refName) } : {}),
      ...Object.fromEntries((["pose", "expression", "outfit", "hairstyle", "age", "face", "hair", "hairAccessories", "proportions", "clothing", "accessories"] as const).flatMap((k) => (optText(c[k]) ? [[k, c[k]]] : []))),
    }];
  });
  const ids = new Set(cast.map((c) => c.id));
  const scenes = (Array.isArray(r.scenes) ? r.scenes : []).flatMap((x) => {
    const c = (x ?? {}) as Record<string, unknown>;
    if (typeof c.id !== "string") return [];
    return [{
      id: c.id, title: text(c.title, ""), text: text(c.text, ""),
      ...(Array.isArray(c.castIds) ? { castIds: c.castIds.filter((i): i is string => typeof i === "string" && ids.has(i)) } : {}),
      ...(THICK.includes(c.lineThickness as never) ? { lineThickness: c.lineThickness as (typeof THICK)[number] } : {}),
      ...(COMPLEX.includes(c.complexity as never) ? { complexity: c.complexity as (typeof COMPLEX)[number] } : {}),
      ...(OUTPUTS.includes(c.output as never) ? { output: c.output as (typeof OUTPUTS)[number] } : {}),
      ...Object.fromEntries((["pageTitle", "scriptureRef", "verseText", "lessonText", "illustrationId", "illustrationName", "approvedAt", "rejectNotes"] as const).flatMap((k) => (optText(c[k]) ? [[k, c[k]]] : []))),
      ...(Number(c.illustrationW) > 0 && Number(c.illustrationH) > 0 ? { illustrationW: Number(c.illustrationW), illustrationH: Number(c.illustrationH) } : {}),
      ...(c.scriptureMode === "art" || c.scriptureMode === "page" ? { scriptureMode: c.scriptureMode as "art" | "page" } : {}),
      ...(Number(c.attempts) > 0 ? { attempts: Math.round(Number(c.attempts)) } : {}),
      ...(c.checks && typeof c.checks === "object" ? { checks: Object.fromEntries(Object.entries(c.checks as Record<string, unknown>).filter(([, v]) => typeof v === "boolean")) as Record<string, boolean> } : {}),
    }];
  });
  return {
    cast, useGroupRef: r.useGroupRef === true, keepConsistent: r.keepConsistent !== false, castLocked: r.castLocked === true, useRefs: r.useRefs !== false,
    illustrationStyle: text(r.illustrationStyle, d.illustrationStyle), proportions: text(r.proportions, d.proportions), hairClothingDetail: text(r.hairClothingDetail, d.hairClothingDetail),
    backgroundDensity: text(r.backgroundDensity, d.backgroundDensity), coloringArea: text(r.coloringArea, d.coloringArea), gutter: Math.max(0, Math.min(2, numOr(r.gutter, d.gutter))), blankBacks: r.blankBacks !== false,
    pageTypography: normalizeTypography(r.pageTypography, d.pageTypography),
    ...(optText(r.groupRefId) ? { groupRefId: optText(r.groupRefId), groupRefName: optText(r.groupRefName) } : {}),
    castSelected: Array.isArray(r.castSelected) ? r.castSelected.filter((i): i is string => typeof i === "string" && ids.has(i)) : cast.map((c) => c.id),
    coloringStyle: r.coloringStyle === "hybrid" ? "hybrid" : "outline",
    lineThickness: oneOf(r.lineThickness, THICK, d.lineThickness), complexity: oneOf(r.complexity, COMPLEX, d.complexity), output: oneOf(r.output, OUTPUTS, d.output),
    textPlacement: oneOf(r.textPlacement, ["top", "bottom", "top-and-bottom", "none"] as const, d.textPlacement),
    coverage: Math.max(20, Math.min(100, Math.round(numOr(r.coverage, d.coverage)))), translation: text(r.translation, d.translation), verseVerified: r.verseVerified === true, scriptureMode: r.scriptureMode === "art" ? "art" : "page",
    sceneSource: text(r.sceneSource, ""), scenes,
    coverOutput: r.coverOutput === "complete-concept" ? "complete-concept" : "artwork-only",
    coverColor: text(r.coverColor, ""), coverComposition: text(r.coverComposition, ""), titlePlacement: text(r.titlePlacement, ""), coverBackground: text(r.coverBackground, ""),
    illustrationScale: text(r.illustrationScale, ""), starterScene: text(r.starterScene, ""),
    ...(optText(r.finishedCoverId) ? { finishedCoverId: optText(r.finishedCoverId), finishedCoverName: optText(r.finishedCoverName) } : {}),
    ...(optText(r.coverApproved) ? { coverApproved: optText(r.coverApproved) } : {}),
  };
}

export function normalizeItems(raw: unknown): CoverItem[] {
  return (Array.isArray(raw) ? raw : []).flatMap((x) => {
    const r = (x ?? {}) as Record<string, unknown>;
    return typeof r.product === "string" ? [{ id: typeof r.id === "string" ? r.id : newId("i"), product: r.product, size: text(r.size, "6×9"), status: text(r.status, "Idea") }] : [];
  });
}

export function newCollection(name: string, brief: CoverBrief, items: CoverItem[], direction: number): CoverCollection {
  const now = new Date().toISOString();
  return { schemaVersion: COVER_SCHEMA_VERSION, id: newId("c"), name, createdAt: now, updatedAt: now, brief, items: items.map((i) => ({ ...i })), direction };
}

/** The collection as a backup file. */
export function exportCollectionJson(c: Pick<CoverCollection, "brief" | "items" | "direction"> & { name?: string }): string {
  return JSON.stringify({ schema: COVER_FILE_SCHEMA, saved: new Date().toISOString(), name: c.name ?? c.brief.collection, brief: c.brief, items: c.items, direction: c.direction }, null, 2);
}

/** A backup file (this studio's or the standalone generator's) as a new, unsaved collection. Throws on anything else. */
export function parseCollectionFile(raw: string): CoverCollection {
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(raw);
  } catch {
    throw new Error("This file is not a valid collection backup.");
  }
  if (!d || typeof d !== "object" || !d.brief || typeof d.brief !== "object" || !Array.isArray(d.items) || (d.schema !== COVER_FILE_SCHEMA && d.schema !== LEGACY_FILE_SCHEMA))
    throw new Error("This file is not a valid collection backup.");
  const brief = normalizeBrief(d.brief);
  return newCollection(typeof d.name === "string" && d.name ? d.name : brief.collection, brief, normalizeItems(d.items), clampDirection(d.direction));
}

/** A copy of a collection with its palette turned into editable custom colors, so it can be recolored. The original is untouched. */
export function duplicateAndRecolor(c: CoverCollection): CoverCollection {
  const b = c.brief;
  const known = b.palette === "custom" ? undefined : COVER_PALETTES.find((p) => p.id === b.palette);
  const s = known ? summarizePalette(known) : null;
  const brief: CoverBrief = { ...b, collection: `${b.collection || c.name} — new palette`, palette: "custom", ...(s ? { colorPrimary: s.main, colorAccent: s.accent, colorPaper: s.background, colorText: s.ink } : {}) };
  return newCollection(brief.collection, brief, c.items, c.direction);
}

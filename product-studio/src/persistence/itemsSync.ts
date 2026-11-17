/**
 * ONLINE SAVING for Cover Studio (the draft being worked on and saved collections) and Coloring Book (books) —
 * the same rules as products (persistence/cloud.ts):
 *   table public.product_studio_items, one row per item, owner-only by row level security, `data` = the item JSON;
 *   pictures (reference images, illustrations, covers) in the private bucket product-studio-artwork, at
 *   <account id>/<picture id> (a picture's id is its content's SHA-256, so the same picture is stored once).
 *
 * A sync merges by item, using the version both sides last agreed on (itemBases):
 *   changed only online → here; changed only here → online;
 *   changed on both sides → the newer stays, the older is kept as a copy (a draft's older version becomes a saved
 *   collection) — nothing is lost;
 *   deleted online → removed here unless changed here since (then kept); deleted here → hidden online.
 * Items open in a screen right now are never replaced underneath the person editing them (next sync).
 */
import { supabase } from "./cloud";
import { canonicalJson } from "./cloud";
import { loadDraft, localCoverStore, newCollection, normalizeBrief, saveDraft, type CoverDraft } from "./coverStore";
import { localBookStore, normalizeBook } from "./coloringBookStore";
import { getArtworkFile, putArtworkFile } from "../engines/artwork/store";
import { newId } from "../presets/products/projectFactory";
import type { CoverCollection } from "../engines/cover/brief";
import type { ColoringBook } from "../engines/coloringBook/book";
import { isHeld, itemBase, itemDeletionDone, markArtworkUploaded, pendingItemDeletions, uploadedArtwork, type ItemKind } from "./itemBases";

const TABLE = "product_studio_items";
export const ARTWORK_BUCKET = "product-studio-artwork";

export type Item = { kind: ItemKind; id: string; name: string; updatedAt: string; data: unknown; deletedAt?: string | null };

/** Where items are kept online (a fake one in tests). */
export interface ItemsBackend {
  list(): Promise<Item[]>;
  get(kind: ItemKind, id: string): Promise<Item | null>;
  /** Write only if the online copy is still at `expected` (null = only if there is no row). One statement. */
  putIf(item: Item, expected: string | null): Promise<boolean>;
  /** Hide (delete) only if the online copy is not newer than `upTo`. */
  removeIf(kind: ItemKind, id: string, upTo: string): Promise<boolean>;
  /** Pictures: which ids are online, send one, fetch one. */
  hasArtwork(ids: string[]): Promise<Set<string>>;
  putArtwork(id: string, blob: Blob): Promise<void>;
  getArtwork(id: string): Promise<Blob | null>;
}

/** Items on this device (a fake one in tests). */
export interface LocalItems {
  list(): Item[];
  put(item: Item): void;
  remove(kind: ItemKind, id: string): void;
  /** Keep an older version as a copy of its own (never under the same id). */
  keepCopy(item: Item, from: "this device" | "online"): void;
}

const iso = (t: string | null | undefined) => (t ? new Date(t).toISOString() : null);

export const supabaseItems = (userId: string): ItemsBackend => {
  const db = () => supabase().from(TABLE);
  const bucket = () => supabase().storage.from(ARTWORK_BUCKET);
  type Row = { kind: ItemKind; id: string; name: string; updated_at: string; data: unknown; deleted_at: string | null };
  const row = (r: Row): Item => ({ kind: r.kind, id: r.id, name: r.name, updatedAt: iso(r.updated_at)!, data: r.data, deletedAt: iso(r.deleted_at) });
  const COLS = "kind,id,name,updated_at,data,deleted_at";
  return {
    async list() {
      const { data, error } = await db().select(COLS);
      if (error) throw error;
      return ((data ?? []) as Row[]).map(row);
    },
    async get(kind, id) {
      const { data, error } = await db().select(COLS).eq("kind", kind).eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? row(data as Row) : null;
    },
    async putIf(item, expected) {
      const values = { kind: item.kind, id: item.id, name: item.name, data: item.data, updated_at: item.updatedAt };
      if (expected === null) {
        const { error } = await db().insert(values);
        if (!error) return true;
        if (error.code === "23505") return false;
        throw error;
      }
      const { data, error } = await db().update(values).eq("kind", item.kind).eq("id", item.id).eq("updated_at", expected).is("deleted_at", null).select("id");
      if (error) throw error;
      return (data ?? []).length === 1;
    },
    async removeIf(kind, id, upTo) {
      const { data, error } = await db().update({ deleted_at: new Date().toISOString() }).eq("kind", kind).eq("id", id).lte("updated_at", upTo).is("deleted_at", null).select("id");
      if (error) throw error;
      if ((data ?? []).length === 1) return true;
      const now = await this.get(kind, id);
      return !now || !!now.deletedAt;
    },
    async hasArtwork(ids) {
      if (!ids.length) return new Set();
      const online = new Set<string>();
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await bucket().list(userId, { limit: 1000, offset });
        if (error) throw error;
        for (const o of data ?? []) online.add(o.name);
        if ((data ?? []).length < 1000) break;
      }
      return new Set(ids.filter((id) => online.has(id)));
    },
    async putArtwork(id, blob) {
      const { error } = await bucket().upload(`${userId}/${id}`, blob, { upsert: false, contentType: blob.type || "application/octet-stream" });
      // Already there (same id = same picture): fine.
      if (error && !/exists|duplicate/i.test(error.message)) throw error;
    },
    async getArtwork(id) {
      const { data, error } = await bucket().download(`${userId}/${id}`);
      if (error) return null;
      return data;
    },
  };
};

// ---- This device ------------------------------------------------------------------------------------

const DRAFT_ID = "draft";
const draftName = (d: CoverDraft) => d.brief.collection || d.brief.title || "Cover Studio draft";

export const browserItems: LocalItems = {
  list() {
    const out: Item[] = [];
    const d = loadDraft();
    if (d) out.push({ kind: "cover-draft", id: DRAFT_ID, name: draftName(d), updatedAt: d.updatedAt ?? "1970-01-01T00:00:00.000Z", data: d });
    for (const s of localCoverStore.list()) {
      const c = localCoverStore.load(s.id);
      if (c) out.push({ kind: "cover-collection", id: c.id, name: c.name, updatedAt: c.updatedAt, data: c });
    }
    for (const s of localBookStore.list()) {
      const b = localBookStore.load(s.id);
      if (b) out.push({ kind: "coloring-book", id: b.id, name: b.name, updatedAt: b.updatedAt, data: b });
    }
    return out;
  },
  put(item) {
    if (item.kind === "cover-draft") {
      const d = item.data as CoverDraft;
      saveDraft({ ...d, brief: normalizeBrief(d.brief), updatedAt: item.updatedAt });
    } else if (item.kind === "cover-collection") {
      const c = item.data as CoverCollection;
      localCoverStore.save({ ...c, brief: normalizeBrief(c.brief), updatedAt: item.updatedAt });
    } else {
      const b = normalizeBook(item.data);
      if (b) localBookStore.save({ ...b, updatedAt: item.updatedAt });
    }
  },
  remove(kind, id) {
    if (kind === "cover-collection") localCoverStore.remove(id);
    else if (kind === "coloring-book") localBookStore.remove(id);
    // A removal that came from online is not a deletion to send back.
    if (kind !== "cover-draft") itemDeletionDone(kind, id);
  },
  keepCopy(item, from) {
    const label = from === "online" ? "from another device" : "from this device";
    const now = new Date().toISOString();
    if (item.kind === "cover-draft") {
      const d = item.data as CoverDraft;
      localCoverStore.save(newCollection(`${draftName(d)} (draft ${label})`, normalizeBrief(d.brief), d.items, d.direction));
    } else if (item.kind === "cover-collection") {
      const c = item.data as CoverCollection;
      localCoverStore.save({ ...c, id: newId("cover"), name: `${c.name} (${label})`, brief: normalizeBrief(c.brief), createdAt: now, updatedAt: now });
    } else {
      const b = normalizeBook(item.data);
      if (b) localBookStore.save({ ...b, id: newId("book"), name: `${b.name || "Coloring book"} (${label})`, interiorProjectId: undefined, coverProjectId: undefined, updatedAt: now } as ColoringBook);
    }
  },
};

// ---- Merging ----------------------------------------------------------------------------------------

const k = (i: Pick<Item, "kind" | "id">) => `${i.kind}:${i.id}`;
const same = (a: unknown, b: unknown) => canonicalJson({ ...(a as object), updatedAt: "" }) === canonicalJson({ ...(b as object), updatedAt: "" });

export type ItemsPlan = {
  toLocal: Item[];
  toCloud: { item: Item; expected: string | null }[];
  keepBoth: { newer: Item; older: Item; olderFrom: "this device" | "online"; expected: string | null }[];
  removeHere: Item[];
};

export function planItems(local: Item[], remote: Item[], baseOf: (i: Item) => string | undefined): ItemsPlan {
  const here = new Map(local.map((i) => [k(i), i]));
  const seen = new Set<string>();
  const plan: ItemsPlan = { toLocal: [], toCloud: [], keepBoth: [], removeHere: [] };
  for (const r of remote) {
    seen.add(k(r));
    const l = here.get(k(r));
    const base = baseOf(r);
    if (r.deletedAt) {
      if (l && ((base !== undefined && l.updatedAt <= base) || l.updatedAt <= r.updatedAt || same(l.data, r.data))) plan.removeHere.push(l);
      continue;
    }
    if (!l) { plan.toLocal.push(r); continue; }
    if (l.updatedAt === r.updatedAt) continue;
    if (base !== undefined && l.updatedAt === base) { plan.toLocal.push(r); continue; }
    if (base !== undefined && r.updatedAt === base) { plan.toCloud.push({ item: l, expected: r.updatedAt }); continue; }
    const localNewer = l.updatedAt > r.updatedAt;
    if (same(l.data, r.data)) {
      if (localNewer) plan.toCloud.push({ item: l, expected: r.updatedAt });
      else plan.toLocal.push(r);
      continue;
    }
    plan.keepBoth.push(localNewer ? { newer: l, older: r, olderFrom: "online", expected: r.updatedAt } : { newer: r, older: l, olderFrom: "this device", expected: r.updatedAt });
  }
  for (const l of local) if (!seen.has(k(l))) plan.toCloud.push({ item: l, expected: null });
  return plan;
}

/** Every picture an item uses (reference images, group image, illustrations, finished covers). */
export function artworkIds(item: Item): string[] {
  const out = new Set<string>();
  const walk = (v: unknown, keyName = "") => {
    if (Array.isArray(v)) return v.forEach((x) => walk(x));
    if (v && typeof v === "object") return Object.entries(v as Record<string, unknown>).forEach(([kk, x]) => walk(x, kk));
    if (typeof v === "string" && /^(refId|groupRefId|illustrationId|finishedCoverId)$/.test(keyName) && /^[0-9a-f]{64}$/.test(v)) out.add(v);
  };
  walk(item.data);
  // A coloring book's uploaded cover.
  const front = (item.data as { cover?: { front?: { id?: unknown } } })?.cover?.front?.id;
  if (typeof front === "string" && /^[0-9a-f]{64}$/.test(front)) out.add(front);
  return [...out];
}

export type ItemsSyncResult = { uploaded: number; downloaded: number; copies: number; pictures: number; deferred: number };

/** One full sync: items both ways, then pictures both ways. Throws on network errors (nothing is lost; try again later). */
export async function syncItems(backend: ItemsBackend, local: LocalItems = browserItems): Promise<ItemsSyncResult> {
  const res: ItemsSyncResult = { uploaded: 0, downloaded: 0, copies: 0, pictures: 0, deferred: 0 };
  // Deletions made here first, so they are never downloaded again.
  for (const d of pendingItemDeletions()) {
    if (await backend.removeIf(d.kind, d.id, d.version)) itemDeletionDone(d.kind, d.id);
  }
  const deleting = new Set(pendingItemDeletions().map(k));
  const remote = (await backend.list()).filter((r) => !deleting.has(k(r)));
  const plan = planItems(local.list(), remote, (i) => itemBase.get(i.kind, i.id));
  const held = (i: Item) => isHeld(i.kind, i.id);
  for (const r of plan.toLocal) {
    if (held(r)) { res.deferred++; continue; }
    local.put(r);
    itemBase.set(r.kind, r.id, r.updatedAt);
    res.downloaded++;
  }
  for (const { item, expected } of plan.toCloud) {
    if (await backend.putIf(item, expected)) {
      itemBase.set(item.kind, item.id, item.updatedAt);
      res.uploaded++;
    }
  }
  for (const c of plan.keepBoth) {
    if (held(c.newer) || held(c.older)) { res.deferred++; continue; }
    local.keepCopy(c.older, c.olderFrom);
    res.copies++;
    if (c.olderFrom === "online") {
      if (await backend.putIf(c.newer, c.expected)) itemBase.set(c.newer.kind, c.newer.id, c.newer.updatedAt);
    } else {
      local.put(c.newer);
      itemBase.set(c.newer.kind, c.newer.id, c.newer.updatedAt);
    }
  }
  for (const r of plan.removeHere) {
    if (held(r)) { res.deferred++; continue; }
    local.remove(r.kind, r.id);
    itemBase.clear(r.kind, r.id);
  }
  // Pictures: send the ones this device has that aren't online yet; fetch the ones it is missing.
  const ids = [...new Set(local.list().flatMap(artworkIds))];
  const sent = uploadedArtwork();
  const toCheck = ids.filter((id) => !sent.has(id));
  const online = await backend.hasArtwork(toCheck);
  markArtworkUploaded([...online]);
  for (const id of toCheck) {
    const blob = await getArtworkFile(id);
    if (blob && !online.has(id)) {
      await backend.putArtwork(id, blob);
      markArtworkUploaded([id]);
      res.pictures++;
    } else if (!blob && online.has(id)) {
      const got = await backend.getArtwork(id);
      if (got && (await putArtworkFile(id, got))) res.pictures++;
    }
  }
  // Pictures already marked online but missing here (a new device that synced before): fetch them.
  for (const id of ids.filter((x) => sent.has(x))) {
    if (await getArtworkFile(id)) continue;
    const got = await backend.getArtwork(id);
    if (got && (await putArtworkFile(id, got))) res.pictures++;
  }
  return res;
}

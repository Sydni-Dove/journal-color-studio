/**
 * ONLINE SAVING — Supabase ("Dove Expressions App 2"), table
 * public.product_studio_projects: one row per product, owner-only by row level
 * security, `data` = the project JSON. The browser keeps its local copy as the
 * working copy (instant, works offline); every save is also sent here, and on
 * sign-in / start-up both sides are merged so each device ends up with the
 * newest version of every product. Nothing is ever overwritten silently:
 * a newer online version stays, and the other edits are kept as a copy.
 *
 * The publishable key is meant for browsers; the rows are protected by the
 * table's row level security (each signed-in account sees only its own).
 */
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import type { ProductProject } from "../types/project";

export const SUPABASE_URL = "https://jnlvvlkwskidloripvtp.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_lopqr1HC3kjSio_vVFN_tg_VdBoTi4R";
const TABLE = "product_studio_projects";

export type CloudProject = { id: string; name: string; updatedAt: string; data: ProductProject };

/** What the studio needs from an online store (a fake one in tests). */
export interface CloudBackend {
  list(): Promise<CloudProject[]>;
  get(id: string): Promise<CloudProject | null>;
  put(p: ProductProject): Promise<void>;
  /**
   * Write `p` only if the online copy is still at `expected` (its updatedAt), or — with
   * `expected` null — only if there is no listed online copy (none yet, or one removed on
   * another device, which is brought back). Each write is one statement on the server, so
   * two devices saving at once can never both succeed. false = the online copy is not at
   * `expected` (nothing was written).
   */
  putIf(p: ProductProject, expected: string | null): Promise<boolean>;
  remove(id: string): Promise<void>;
}

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  client ??= createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "dove-product-studio:auth" } });
  return client;
}

export const supabaseBackend = (): CloudBackend => {
  const db = () => supabase().from(TABLE);
  const row = (r: { id: string; name: string; updated_at: string; data: ProductProject }): CloudProject => ({ id: r.id, name: r.name, updatedAt: new Date(r.updated_at).toISOString(), data: r.data });
  return {
    async list() {
      const { data, error } = await db().select("id,name,updated_at,data").is("deleted_at", null);
      if (error) throw error;
      return (data ?? []).map(row);
    },
    async get(id) {
      const { data, error } = await db().select("id,name,updated_at,data").eq("id", id).is("deleted_at", null).maybeSingle();
      if (error) throw error;
      return data ? row(data) : null;
    },
    async put(p) {
      const { error } = await db().upsert({ id: p.id, name: p.name, data: p, updated_at: p.updatedAt, deleted_at: null }, { onConflict: "owner_id,id" });
      if (error) throw error;
    },
    async putIf(p, expected) {
      const values = { id: p.id, name: p.name, data: p, updated_at: p.updatedAt, deleted_at: null };
      if (expected === null) {
        // A product that isn't online yet: insert, never overwrite (the primary key refuses a second copy).
        const { error } = await db().insert(values);
        if (!error) return true;
        if (error.code !== "23505") throw error;
        // A row exists. If it was removed (on another device) while this device still has the product,
        // bring it back with these contents — again only while it is still removed. A live row is never touched.
        const revived = await db().update(values).eq("id", p.id).not("deleted_at", "is", null).select("id");
        if (revived.error) throw revived.error;
        return (revived.data ?? []).length === 1;
      }
      // Compare-and-swap: the row changes only while it is still the version this save started from.
      const { data, error } = await db().update(values).eq("id", p.id).eq("updated_at", expected).select("id");
      if (error) throw error;
      return (data ?? []).length === 1;
    },
    async remove(id) {
      // Kept online (recoverable), just no longer listed.
      const { error } = await db().update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
  };
};

export type SyncPlan = {
  /** Changed only online (or only online): save these on this device. */
  toLocal: ProductProject[];
  /** Changed only here (or only here): send these online — `expected` is the online version they replace (null = new). */
  toCloud: { project: ProductProject; expected: string | null }[];
  /**
   * Changed on BOTH sides since they last agreed: the newer becomes the product on both
   * sides, and the older is kept as a copy — no edits are lost.
   */
  keepBoth: { newer: ProductProject; older: ProductProject; olderFrom: "this device" | "online"; expected: string | null }[];
};

/**
 * A value as JSON with every object's keys sorted. The online copy comes back
 * from Postgres jsonb, which stores object keys in its own order, so plain
 * JSON.stringify would call identical products different.
 */
export function canonicalJson(v: unknown): string {
  return JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
}
/** Two versions with the same content (only their save time differs; key order never matters). */
export const sameContent = (a: ProductProject, b: ProductProject) => canonicalJson({ ...a, updatedAt: "" }) === canonicalJson({ ...b, updatedAt: "" });

/**
 * Merge by product, using the version both sides last agreed on (`baseOf`):
 *   changed only online → here; changed only here → online;
 *   changed on both sides → keep both (newer as the product, older as a copy).
 * Without a known base (never synced on this device) two differing versions are
 * both kept rather than guessed at. Nothing is deleted.
 */
export function planSync(local: ProductProject[], remote: CloudProject[], baseOf: (id: string) => string | undefined = () => undefined): SyncPlan {
  const byId = new Map(local.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const plan: SyncPlan = { toLocal: [], toCloud: [], keepBoth: [] };
  for (const r of remote) {
    seen.add(r.id);
    const l = byId.get(r.id);
    if (!l) { plan.toLocal.push(r.data); continue; }
    if (l.updatedAt === r.updatedAt) continue;
    const base = baseOf(r.id);
    if (base !== undefined && l.updatedAt === base) { plan.toLocal.push(r.data); continue; }
    if (base !== undefined && r.updatedAt === base) { plan.toCloud.push({ project: l, expected: r.updatedAt }); continue; }
    // Both changed (or unknown): keep both unless they only differ in their save time.
    const localNewer = l.updatedAt > r.updatedAt;
    if (sameContent(l, r.data)) {
      if (localNewer) plan.toCloud.push({ project: l, expected: r.updatedAt });
      else plan.toLocal.push(r.data);
      continue;
    }
    plan.keepBoth.push(localNewer ? { newer: l, older: r.data, olderFrom: "online", expected: r.updatedAt } : { newer: r.data, older: l, olderFrom: "this device", expected: r.updatedAt });
  }
  for (const l of local) if (!seen.has(l.id)) plan.toCloud.push({ project: l, expected: null });
  return plan;
}

export type CloudSave = { status: "saved" } | { status: "conflict"; newer: ProductProject };

/**
 * Send one save online. If the online copy is newer than the version this edit
 * started from (another device saved since), nothing is overwritten: the
 * caller keeps the newer one and saves these edits as a copy.
 */
export async function saveOnline(backend: CloudBackend, p: ProductProject, base: string | null): Promise<CloudSave> {
  // Each attempt is one compare-and-swap on the server; between attempts we only learn what is there now.
  let expected = base;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (await backend.putIf(p, expected)) return { status: "saved" };
    const online = await backend.get(p.id);
    if (!online) {
      expected = null; // not online (yet, or any more): add it
      continue;
    }
    if (online.updatedAt === p.updatedAt) return { status: "saved" }; // this very version is already there
    // Another device saved after these edits started: keep theirs, these edits become a copy.
    if (!base || online.updatedAt > base) return { status: "conflict", newer: online.data };
    // The online copy is older than these edits' starting point (earlier edits here never reached it): replace it — atomically.
    expected = online.updatedAt;
  }
  throw new Error("The online copy kept changing while saving; your edits are kept on this device and will be sent at the next sync.");
}

export type { Session };

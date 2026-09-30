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
    async remove(id) {
      // Kept online (recoverable), just no longer listed.
      const { error } = await db().update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
  };
};

export type SyncPlan = {
  /** Newer online (or only online): save these on this device. */
  toLocal: ProductProject[];
  /** Newer on this device (or only here): send these online. */
  toCloud: ProductProject[];
};

/** Merge by product: the newer version of each wins on both sides; nothing is deleted. */
export function planSync(local: ProductProject[], remote: CloudProject[]): SyncPlan {
  const byId = new Map(local.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const plan: SyncPlan = { toLocal: [], toCloud: [] };
  for (const r of remote) {
    seen.add(r.id);
    const l = byId.get(r.id);
    if (!l || r.updatedAt > l.updatedAt) plan.toLocal.push(r.data);
    else if (l.updatedAt > r.updatedAt) plan.toCloud.push(l);
  }
  for (const l of local) if (!seen.has(l.id)) plan.toCloud.push(l);
  return plan;
}

export type CloudSave = { status: "saved" } | { status: "conflict"; newer: ProductProject };

/**
 * Send one save online. If the online copy is newer than the version this edit
 * started from (another device saved since), nothing is overwritten: the
 * caller keeps the newer one and saves these edits as a copy.
 */
export async function saveOnline(backend: CloudBackend, p: ProductProject, base: string | null): Promise<CloudSave> {
  const online = await backend.get(p.id);
  if (online && base && online.updatedAt > base && online.updatedAt !== p.updatedAt) return { status: "conflict", newer: online.data };
  await backend.put(p);
  return { status: "saved" };
}

export type { Session };

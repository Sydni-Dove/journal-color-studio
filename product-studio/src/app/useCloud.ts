/**
 * The studio's online saving: who is signed in, and keeping this device's
 * projects and the online ones in step (persistence/cloud.ts).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { planSync, saveOnline, supabase, supabaseBackend, type CloudBackend, type Session } from "../persistence/cloud";
import { duplicateProject, type ProjectStore } from "../persistence/projectStore";
import { storageBases, type SyncBases } from "../persistence/sync";
import type { ProductProject } from "../types/project";

export type CloudStatus = "signed-out" | "syncing" | "saved" | "offline" | "error";

type Hooks = {
  store: ProjectStore;
  /** Products changed on this device by a sync (refresh the list; follow an open, unchanged one). */
  onLocalChanged: (updated: ProductProject[]) => void;
  /** A save found a newer online version: it is saved here, the edits as a copy (named). */
  onConflict: (newer: ProductProject, copyName: string) => void;
};

export function useCloud({ store, onLocalChanged, onConflict }: Hooks, backendFor: () => CloudBackend = supabaseBackend, bases: SyncBases = defaultBases) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<CloudStatus>("signed-out");
  const [error, setError] = useState<string | null>(null);
  const hooks = useRef({ onLocalChanged, onConflict });
  hooks.current = { onLocalChanged, onConflict };
  const backend = useRef<CloudBackend | null>(null);
  const signedIn = !!session;

  const sync = useCallback(async () => {
    const b = backend.current;
    if (!b) return;
    setStatus("syncing");
    try {
      const changed = await applySync(store, b, bases, (newer, copyName) => hooks.current.onConflict(newer, copyName));
      if (changed.length) hooks.current.onLocalChanged(changed);
      setStatus("saved");
      setError(null);
    } catch (e) {
      setStatus(navigator.onLine === false ? "offline" : "error");
      setError((e as Error).message ?? String(e));
    }
  }, [store]);

  useEffect(() => {
    const auth = supabase().auth;
    auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  // Signed in: merge now, again when back online, and when the tab comes back into view.
  useEffect(() => {
    if (!signedIn) {
      backend.current = null;
      setStatus("signed-out");
      return;
    }
    backend.current = backendFor();
    void sync();
    let last = Date.now();
    const again = () => {
      if (document.visibilityState === "visible" && Date.now() - last > 30_000) {
        last = Date.now();
        void sync();
      }
    };
    const online = () => void sync();
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", again);
    return () => {
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", again);
    };
  }, [signedIn, sync, backendFor]);

  /** After a save on this device: send it online (base = the version the edits started from). */
  const saved = useCallback(async (p: ProductProject, base: string | null) => {
    const b = backend.current;
    if (!b) return;
    setStatus("syncing");
    try {
      const r = await saveOnline(b, p, base);
      if (r.status === "saved") bases.set(p.id, p.updatedAt);
      if (r.status === "conflict") {
        const copy = duplicateProject(p, `${p.name} (changes from another device)`);
        store.save(r.newer);
        bases.set(r.newer.id, r.newer.updatedAt);
        store.save(copy);
        if (await b.putIf(copy, null)) bases.set(copy.id, copy.updatedAt);
        hooks.current.onConflict(r.newer, copy.name);
      }
      setStatus("saved");
      setError(null);
    } catch (e) {
      // Kept on this device; the next sync sends it.
      setStatus(navigator.onLine === false ? "offline" : "error");
      setError((e as Error).message ?? String(e));
    }
  }, [store]);

  const removed = useCallback(async (id: string) => {
    try {
      await backend.current?.remove(id);
      bases.clear(id);
    } catch {
      /* removed here; online it stays listed until the next removal succeeds */
    }
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error: e } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
    if (e) throw new Error(e.message === "Invalid login credentials" ? "That email and password don't match a Dove Expressions account." : e.message);
  };
  const signOut = async () => {
    await supabase().auth.signOut();
  };

  return { session, status, error, sync, saved, removed, signIn, signOut };
}

const defaultBases = storageBases();

/**
 * One sync: bring this device and the online copies into agreement (planSync)
 * without losing edits from either side, and remember each agreed version.
 * Every online write is a compare-and-swap: a product that changed online
 * meanwhile is simply left for the next sync. Returns the products saved on
 * this device (to refresh the list and any open product).
 */
export async function applySync(store: ProjectStore, b: CloudBackend, bases: SyncBases, onKeptBoth: (newer: ProductProject, copyName: string) => void): Promise<ProductProject[]> {
  const local = store.list().map((s) => store.load(s.id)).filter((p): p is ProductProject => !!p);
  const remote = await b.list();
  const plan = planSync(local, remote, (id) => bases.get(id));
  const changed: ProductProject[] = [];
  for (const p of plan.toLocal) {
    store.save(p);
    bases.set(p.id, p.updatedAt);
    changed.push(p);
  }
  for (const { project, expected } of plan.toCloud) if (await b.putIf(project, expected)) bases.set(project.id, project.updatedAt);
  for (const k of plan.keepBoth) {
    const copy = duplicateProject(k.older, `${k.older.name} (version from ${k.olderFrom === "online" ? "another device" : "this device"})`);
    store.save(copy);
    changed.push(copy);
    if (await b.putIf(copy, null)) bases.set(copy.id, copy.updatedAt);
    if (k.olderFrom === "this device") {
      store.save(k.newer);
      bases.set(k.newer.id, k.newer.updatedAt);
      changed.push(k.newer);
    } else if (await b.putIf(k.newer, k.expected)) bases.set(k.newer.id, k.newer.updatedAt);
    onKeptBoth(k.newer, copy.name);
  }
  // Products already in agreement: that version is their base from now on.
  const here = new Map(local.map((p) => [p.id, p.updatedAt]));
  for (const r of remote) if (here.get(r.id) === r.updatedAt) bases.set(r.id, r.updatedAt);
  return changed;
}

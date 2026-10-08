/**
 * The studio's online saving: who is signed in, and keeping this device's
 * projects and the online ones in step (persistence/cloud.ts).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { planSync, saveOnline, supabase, supabaseBackend, type CloudBackend, type Session } from "../persistence/cloud";
import { duplicateProject, type ProjectStore } from "../persistence/projectStore";
import { copyName } from "../persistence/copyNames";
import { storageBases, type SyncBases } from "../persistence/sync";
import type { ProductProject } from "../types/project";

export type CloudStatus = "signed-out" | "syncing" | "saved" | "offline" | "error";

type Hooks = {
  store: ProjectStore;
  /** Products changed on this device by a sync (refresh the list; follow an open, unchanged one). */
  onLocalChanged: (updated: ProductProject[]) => void;
  /** Something the person should know (a kept copy, a deletion from another device…): see SyncEvent. */
  onEvent: (e: SyncEvent) => void;
};

export function useCloud({ store, onLocalChanged, onEvent }: Hooks, backendFor: () => CloudBackend = supabaseBackend, bases: SyncBases = defaultBases) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<CloudStatus>("signed-out");
  const [error, setError] = useState<string | null>(null);
  const hooks = useRef({ onLocalChanged, onEvent });
  hooks.current = { onLocalChanged, onEvent };
  const backend = useRef<CloudBackend | null>(null);
  const signedIn = !!session;

  const sync = useCallback(async () => {
    const b = backend.current;
    if (!b) return;
    setStatus("syncing");
    try {
      const changed = await applySync(store, b, bases, (e) => hooks.current.onEvent(e));
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
      await applySave(store, b, bases, p, base, (e) => hooks.current.onEvent(e));
      setStatus("saved");
      setError(null);
    } catch (e) {
      // Kept on this device; the next sync sends it.
      setStatus(navigator.onLine === false ? "offline" : "error");
      setError((e as Error).message ?? String(e));
    }
  }, [store]);

  /** Delete a product here and online (finished by the next sync if it can't reach the online copy now). */
  const remove = useCallback(async (p: ProductProject) => {
    try {
      await applyDelete(store, backend.current, bases, p, (e) => hooks.current.onEvent(e));
    } catch {
      /* deleted here and remembered: the next sync finishes it online */
    }
  }, [store]);

  const signIn = async (email: string, password: string) => {
    const { error: e } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
    if (e) throw new Error(e.message === "Invalid login credentials" ? "That email and password don't match a Dove Expressions account." : e.message);
  };
  const signOut = async () => {
    await supabase().auth.signOut();
  };

  return { session, status, error, sync, saved, remove, signIn, signOut };
}

const defaultBases = storageBases();

/**
 * What a sync or save did that the person should know about:
 *   kept-both           the product changed on two devices: `current` is the product now, `copy` holds the other version
 *   deleted-elsewhere   deleted on another device: removed here; edits made here since (not yet online) are kept as `recovered`
 *   deletion-kept       deleted here, but another device saved newer edits after the deleted version: it was kept (it comes back here)
 */
export type SyncEvent =
  | { kind: "kept-both"; current: ProductProject; copy: ProductProject }
  | { kind: "deleted-elsewhere"; id: string; name: string; recovered: ProductProject | null }
  | { kind: "deletion-kept"; id: string; name: string };

/** Keep `p`'s edits as a new product (a new id: the deleted id stays deleted) — here and online. */
async function recover(store: ProjectStore, b: CloudBackend, bases: SyncBases, p: ProductProject): Promise<ProductProject> {
  const copy = duplicateProject(p, copyName(p.name, "recovered", p.updatedAt));
  store.save(copy);
  store.remove(p.id);
  bases.clear(p.id);
  if (await b.putIf(copy, null)) bases.set(copy.id, copy.updatedAt);
  return copy;
}

/**
 * Send one save online. If another device saved this product since these edits
 * started, its newer version becomes the product here, and these edits are kept
 * as a copy ("… (other version · saved …)") — here and online. If the product
 * was deleted on another device, these edits are kept as a recovered copy.
 */
export async function applySave(store: ProjectStore, b: CloudBackend, bases: SyncBases, p: ProductProject, base: string | null, onEvent: (e: SyncEvent) => void): Promise<void> {
  const r = await saveOnline(b, p, base);
  if (r.status === "saved") {
    bases.set(p.id, p.updatedAt);
    return;
  }
  if (r.status === "deleted") {
    onEvent({ kind: "deleted-elsewhere", id: p.id, name: p.name, recovered: await recover(store, b, bases, p) });
    return;
  }
  const copy = duplicateProject(p, copyName(p.name, "other-version", p.updatedAt));
  store.save(r.newer);
  bases.set(r.newer.id, r.newer.updatedAt);
  store.save(copy);
  if (await b.putIf(copy, null)) bases.set(copy.id, copy.updatedAt);
  onEvent({ kind: "kept-both", current: r.newer, copy });
}

/**
 * Delete a product on this device and online. The deletion is remembered until
 * it reaches the online copy (offline, signed out or a failed request: the next
 * sync finishes it), so it is never downloaded or uploaded again meanwhile.
 * Online, only the deleted version (or older) is hidden: if another device saved
 * newer edits, the product is kept and comes back here (deletion-kept).
 */
export async function applyDelete(store: ProjectStore, b: CloudBackend | null, bases: SyncBases, p: ProductProject, onEvent: (e: SyncEvent) => void): Promise<void> {
  store.remove(p.id);
  bases.clear(p.id);
  bases.markDeleted(p.id, p.updatedAt);
  if (!b) return;
  if (await b.removeIf(p.id, p.updatedAt)) bases.deletionDone(p.id);
  else {
    bases.deletionDone(p.id);
    onEvent({ kind: "deletion-kept", id: p.id, name: p.name });
  }
}

/**
 * One sync: bring this device and the online copies into agreement (planSync)
 * without losing edits from either side, and remember each agreed version.
 * Deletions travel both ways: ones made here are finished online first; ones
 * made elsewhere remove the product here (or recover edits made here since).
 * Every online write is conditional: a product that changed online meanwhile
 * is simply left for the next sync. Returns the products saved on this device.
 */
export async function applySync(store: ProjectStore, b: CloudBackend, bases: SyncBases, onEvent: (e: SyncEvent) => void): Promise<ProductProject[]> {
  let remote = await b.list();
  // Deletions made here that haven't reached the online copy yet.
  const stillPending = new Set<string>();
  for (const { id, version } of bases.pendingDeletions()) {
    const r = remote.find((x) => x.id === id);
    if (!r || r.deletedAt) bases.deletionDone(id);
    else if (r.updatedAt > version) {
      // Another device saved newer edits after the version deleted here: keep them (downloaded below).
      bases.deletionDone(id);
      onEvent({ kind: "deletion-kept", id, name: r.name });
    } else if (await b.removeIf(id, version)) {
      bases.deletionDone(id);
      remote = remote.map((x) => (x.id === id ? { ...x, deletedAt: new Date().toISOString() } : x));
    } else stillPending.add(id); // changed meanwhile: decided at the next sync
  }
  remote = remote.filter((x) => !stillPending.has(x.id));
  const local = store.list().map((s) => store.load(s.id)).filter((p): p is ProductProject => !!p);
  const plan = planSync(local, remote, (id) => bases.get(id));
  const changed: ProductProject[] = [];
  for (const p of plan.toLocal) {
    store.save(p);
    bases.set(p.id, p.updatedAt);
    changed.push(p);
  }
  for (const { project, expected } of plan.toCloud) if (await b.putIf(project, expected)) bases.set(project.id, project.updatedAt);
  for (const k of plan.keepBoth) {
    const copy = duplicateProject(k.older, copyName(k.older.name, "other-version", k.older.updatedAt));
    store.save(copy);
    changed.push(copy);
    if (await b.putIf(copy, null)) bases.set(copy.id, copy.updatedAt);
    if (k.olderFrom === "this device") {
      store.save(k.newer);
      bases.set(k.newer.id, k.newer.updatedAt);
      changed.push(k.newer);
    } else if (await b.putIf(k.newer, k.expected)) bases.set(k.newer.id, k.newer.updatedAt);
    onEvent({ kind: "kept-both", current: k.newer, copy });
  }
  for (const id of plan.removeHere) {
    const p = store.load(id);
    store.remove(id);
    bases.clear(id);
    onEvent({ kind: "deleted-elsewhere", id, name: p?.name ?? id, recovered: null });
  }
  for (const p of plan.recover) {
    const copy = await recover(store, b, bases, p);
    changed.push(copy);
    onEvent({ kind: "deleted-elsewhere", id: p.id, name: p.name, recovered: copy });
  }
  // Products already in agreement: that version is their base from now on.
  const here = new Map(local.map((p) => [p.id, p.updatedAt]));
  for (const r of remote) if (!r.deletedAt && here.get(r.id) === r.updatedAt) bases.set(r.id, r.updatedAt);
  return changed;
}

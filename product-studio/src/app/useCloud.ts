/**
 * The studio's online saving: who is signed in, and keeping this device's
 * projects and the online ones in step (persistence/cloud.ts).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { planSync, saveOnline, supabase, supabaseBackend, type CloudBackend, type Session } from "../persistence/cloud";
import { duplicateProject, type ProjectStore } from "../persistence/projectStore";
import type { ProductProject } from "../types/project";

export type CloudStatus = "signed-out" | "syncing" | "saved" | "offline" | "error";

type Hooks = {
  store: ProjectStore;
  /** Products changed on this device by a sync (refresh the list; follow an open, unchanged one). */
  onLocalChanged: (updated: ProductProject[]) => void;
  /** A save found a newer online version: it is saved here, the edits as a copy (named). */
  onConflict: (newer: ProductProject, copyName: string) => void;
};

export function useCloud({ store, onLocalChanged, onConflict }: Hooks, backendFor: () => CloudBackend = supabaseBackend) {
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
      const local = store.list().map((s) => store.load(s.id)).filter((p): p is ProductProject => !!p);
      const plan = planSync(local, await b.list());
      for (const p of plan.toLocal) store.save(p);
      for (const p of plan.toCloud) await b.put(p);
      if (plan.toLocal.length) hooks.current.onLocalChanged(plan.toLocal);
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
      if (r.status === "conflict") {
        const copy = duplicateProject(p, `${p.name} (changes from another device)`);
        store.save(r.newer);
        store.save(copy);
        await b.put(copy);
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

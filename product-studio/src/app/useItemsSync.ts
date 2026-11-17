/**
 * Keeps Cover Studio and Coloring Book online while signed in (persistence/itemsSync.ts): a sync at sign-in and
 * start-up, shortly after every save, when the tab comes back into view, and once a minute. Signed out, nothing is
 * sent and everything stays on this device. The status is shared, so any screen can say where its work is saved.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { supabaseItems, syncItems, type ItemsBackend } from "../persistence/itemsSync";

export type ItemsSyncStatus = { state: "signed-out" | "syncing" | "synced" | "error"; at?: string; error?: string };

let status: ItemsSyncStatus = { state: "signed-out" };
const listeners = new Set<() => void>();
const setStatus = (s: ItemsSyncStatus) => {
  status = s;
  listeners.forEach((l) => l());
};
export function useItemsSyncStatus(): ItemsSyncStatus {
  return useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => status, () => status);
}

/** Plain words for a screen's "saved" line. */
export function savedWhere(s: ItemsSyncStatus): string {
  switch (s.state) {
    case "synced":
      return "Saved online";
    case "syncing":
      return "Saving online…";
    case "error":
      return "Saved on this device; online saving will retry";
    default:
      return "Saved on this device (sign in to save online)";
  }
}

const DEBOUNCE_MS = 1500;
const EVERY_MS = 60_000;

/** Returns a number that changes whenever a sync brought something to this device (screens re-read their lists). */
export function useItemsSync(userId: string | null, backendFor: (userId: string) => ItemsBackend = supabaseItems): number {
  const [received, setReceived] = useState(0);
  const running = useRef(false);
  const again = useRef(false);
  useEffect(() => {
    if (!userId) {
      setStatus({ state: "signed-out" });
      return;
    }
    const backend = backendFor(userId);
    let timer: number | undefined;
    let stopped = false;
    const run = async () => {
      if (stopped) return;
      if (running.current) {
        again.current = true;
        return;
      }
      running.current = true;
      setStatus({ state: "syncing", at: status.at });
      try {
        const r = await syncItems(backend);
        if (r.downloaded || r.copies) {
          setReceived((n) => n + 1);
          window.dispatchEvent(new Event("dove-items-synced"));
        }
        setStatus({ state: "synced", at: new Date().toISOString() });
      } catch (e) {
        setStatus({ state: "error", at: status.at, error: e instanceof Error ? e.message : String(e) });
      } finally {
        running.current = false;
        if (again.current && !stopped) {
          again.current = false;
          void run();
        }
      }
    };
    const soon = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void run(), DEBOUNCE_MS);
    };
    const visible = () => document.visibilityState === "visible" && void run();
    void run();
    window.addEventListener("dove-items-changed", soon);
    document.addEventListener("visibilitychange", visible);
    const every = window.setInterval(() => void run(), EVERY_MS);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.clearInterval(every);
      window.removeEventListener("dove-items-changed", soon);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [userId, backendFor]);
  return received;
}

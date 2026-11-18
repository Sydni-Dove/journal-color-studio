/**
 * Keeps Cover Studio and Coloring Book online while signed in (persistence/itemsSync.ts): a sync at sign-in and
 * start-up, shortly after every save, when the tab comes back into view (at most once a minute), and every five
 * minutes while the tab is in view — never from a tab in the background. When the server can't be reached, it waits
 * longer each time (up to half an hour) so a struggling server isn't kept busy. Signed out, nothing is
 * sent and everything stays on this device. The status is shared, so any screen can say where its work is saved.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { supabaseItems, syncItems, type ItemsBackend } from "../persistence/itemsSync";
import { saveErrorMessage, unreachable } from "../persistence/saveErrors";

export type ItemsSyncStatus = { state: "signed-out" | "syncing" | "synced" | "error"; at?: string; error?: string; unreachable?: boolean };

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
      return s.unreachable ? "Couldn't reach the saving server: saved on this device, not online yet" : "Saved on this device; online saving will retry";
    default:
      return "Saved on this device (sign in to save online)";
  }
}

const DEBOUNCE_MS = 1500;
/** A routine check while the tab is in view. */
export const EVERY_MS = 5 * 60_000;
/** After failures: wait longer each time, up to this. */
export const MAX_BACKOFF_MS = 30 * 60_000;
/** Coming back to the tab checks at most this often. */
const VISIBLE_MIN_MS = 60_000;
/** How long until the next routine check after this many failures in a row: 5, 10, 20, then 30 minutes. */
export const nextWaitMs = (failures: number) => (failures ? Math.min(MAX_BACKOFF_MS, EVERY_MS * 2 ** (failures - 1)) : EVERY_MS);

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
    let next: number | undefined;
    let stopped = false;
    let failures = 0;
    let last = 0;
    // The next routine check: five minutes, or longer after failures (doubling, up to half an hour).
    const schedule = () => {
      window.clearTimeout(next);
      if (stopped) return;
      const wait = nextWaitMs(failures);
      next = window.setTimeout(() => {
        if (document.visibilityState === "visible") void run();
        else schedule();
      }, wait);
    };
    const run = async () => {
      if (stopped) return;
      last = Date.now();
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
        failures = 0;
        setStatus({ state: "synced", at: new Date().toISOString() });
      } catch (e) {
        failures++;
        setStatus({ state: "error", at: status.at, error: saveErrorMessage(e), unreachable: unreachable(e) });
      } finally {
        running.current = false;
        schedule();
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
    const visible = () => {
      if (document.visibilityState === "visible" && Date.now() - last > VISIBLE_MIN_MS && !failures) void run();
    };
    void run();
    window.addEventListener("dove-items-changed", soon);
    document.addEventListener("visibilitychange", visible);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.clearTimeout(next);
      window.removeEventListener("dove-items-changed", soon);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [userId, backendFor]);
  return received;
}

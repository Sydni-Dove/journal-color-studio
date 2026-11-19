/**
 * Keeps Cover Studio and Coloring Book online while signed in (persistence/itemsSync.ts): a sync at sign-in and
 * start-up, shortly after every save, right away when the tab comes back into view, and every 3 minutes
 * (SAVE_CHECK_INTERVAL_MS) while the tab is in view and in use — never from a tab in the background, and not after
 * 15 minutes with no mouse, keyboard or touch (the next interaction checks and resumes). A routine check lists names
 * and versions only; a book's data is fetched only when it changed. When the server can't be reached, it waits
 * 3, 6, 12, then 15 minutes, back to 3 after a success. Signed out, nothing is
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
/** The routine check while the tab is in view and someone is using it: one light list (names and versions) every 3 minutes. */
export const SAVE_CHECK_INTERVAL_MS = 180_000;
/** After failures the wait doubles from the interval, up to this: 3, 6, 12, then 15 minutes. */
export const MAX_BACKOFF_MS = 15 * 60_000;
/** Routine checks stop after this long with no mouse, keyboard or touch; the next interaction checks and resumes. */
export const IDLE_STOP_MS = 15 * 60_000;
/** How long until the next routine check after this many failures in a row: 3, 3, 6, 12, then 15 minutes. */
export const nextWaitMs = (failures: number) => (failures ? Math.min(MAX_BACKOFF_MS, SAVE_CHECK_INTERVAL_MS * 2 ** (failures - 1)) : SAVE_CHECK_INTERVAL_MS);
/** Kept for older imports. */
export const EVERY_MS = SAVE_CHECK_INTERVAL_MS;

/**
 * Returns a number that changes whenever a sync brought something to this device (screens re-read their lists).
 * One instance per tab (App), so however many Product Studio screens are open there is one shared check.
 * A save never waits for the routine check: it starts its own sync (dove-items-changed), as before.
 */
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
    let lastActivity = Date.now();
    /** A routine check came due while the tab was hidden or idle: it runs on return / the next interaction. */
    let waiting = false;
    const hidden = () => document.visibilityState === "hidden";
    const idle = () => Date.now() - lastActivity > IDLE_STOP_MS;
    // The next routine check: 3 minutes, or longer after failures. Hidden or idle: nothing runs until the person is back.
    const schedule = () => {
      window.clearTimeout(next);
      if (stopped) return;
      next = window.setTimeout(() => {
        if (hidden() || idle()) waiting = true;
        else void run();
      }, nextWaitMs(failures));
    };
    const run = async () => {
      if (stopped) return;
      waiting = false;
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
    // A save: its own sync shortly after, whatever the routine schedule (saving never depends on it).
    const soon = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void run(), DEBOUNCE_MS);
    };
    // Back to the tab: one check right away (not twice in a few seconds), then the schedule resumes.
    const visible = () => {
      if (!hidden() && Date.now() - last > 5_000) void run();
    };
    // Mouse, keyboard or touch: the person is here. After an idle stop, check now and resume.
    const active = () => {
      const wasIdle = idle();
      lastActivity = Date.now();
      if ((wasIdle || waiting) && !hidden() && !running.current) void run();
    };
    const ACTIVITY = ["pointerdown", "pointermove", "keydown", "touchstart", "wheel"] as const;
    void run();
    window.addEventListener("dove-items-changed", soon);
    document.addEventListener("visibilitychange", visible);
    for (const ev of ACTIVITY) window.addEventListener(ev, active, { passive: true });
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.clearTimeout(next);
      window.removeEventListener("dove-items-changed", soon);
      document.removeEventListener("visibilitychange", visible);
      for (const ev of ACTIVITY) window.removeEventListener(ev, active);
    };
  }, [userId, backendFor]);
  return received;
}

/**
 * SYNC BASES — for each product, the version (updatedAt) this device and the
 * online copy last agreed on. With it, a sync can tell "changed only online"
 * or "changed only here" (safe to copy across) from "changed on both sides"
 * (keep both: persistence/cloud.ts planSync). Stored per device; losing it is
 * safe (the next sync then keeps both differing versions instead of guessing).
 */
const PREFIX = "dove-product-studio:v1:synced";

export interface SyncBases {
  get(id: string): string | undefined;
  set(id: string, updatedAt: string): void;
  clear(id: string): void;
}

/** Sync bases in this browser's storage (a missing or blocked storage just means "unknown"). */
export function storageBases(storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined = typeof localStorage !== "undefined" ? localStorage : undefined): SyncBases {
  const key = (id: string) => `${PREFIX}:${id}`;
  return {
    get(id) {
      try {
        return storage?.getItem(key(id)) ?? undefined;
      } catch {
        return undefined;
      }
    },
    set(id, updatedAt) {
      try {
        storage?.setItem(key(id), updatedAt);
      } catch {
        /* unknown next time: the next sync keeps both versions rather than guessing */
      }
    },
    clear(id) {
      try {
        storage?.removeItem(key(id));
      } catch {
        /* nothing to clear */
      }
    },
  };
}

/** In-memory bases (tests, or a browser without storage). */
export function memoryBases(init: Record<string, string> = {}): SyncBases & { all: Map<string, string> } {
  const all = new Map(Object.entries(init));
  return { all, get: (id) => all.get(id), set: (id, v) => void all.set(id, v), clear: (id) => void all.delete(id) };
}

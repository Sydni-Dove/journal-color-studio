/**
 * SYNC BASES — for each product, the version (updatedAt) this device and the
 * online copy last agreed on. With it, a sync can tell "changed only online"
 * or "changed only here" (safe to copy across) from "changed on both sides"
 * (keep both: persistence/cloud.ts planSync). Stored per device; losing it is
 * safe (the next sync then keeps both differing versions instead of guessing).
 *
 * PENDING DELETIONS — products deleted on this device whose deletion has not
 * reached the online copy yet (offline, signed out, a failed request), with
 * the version that was deleted. Until it does, a sync never downloads them
 * again; once it does (or a newer version from another device wins), the
 * mark is cleared.
 */
const PREFIX = "dove-product-studio:v1:synced";
const DELETING = "dove-product-studio:v1:deleting";

export interface SyncBases {
  get(id: string): string | undefined;
  set(id: string, updatedAt: string): void;
  clear(id: string): void;
  /** Mark a product deleted here: `version` = the updatedAt of the version that was deleted. */
  markDeleted(id: string, version: string): void;
  /** Products deleted here whose deletion is not online yet, with the version deleted. */
  pendingDeletions(): { id: string; version: string }[];
  deletionDone(id: string): void;
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

/** Sync bases in this browser's storage (a missing or blocked storage just means "unknown"). */
export function storageBases(storage: Store | undefined = typeof localStorage !== "undefined" ? localStorage : undefined): SyncBases {
  const key = (id: string) => `${PREFIX}:${id}`;
  const del = (id: string) => `${DELETING}:${id}`;
  const attempt = <T>(fn: () => T, fallback: T): T => {
    try {
      return fn();
    } catch {
      return fallback; // storage unavailable: unknown next time (the safe direction)
    }
  };
  return {
    get: (id) => attempt(() => storage?.getItem(key(id)) ?? undefined, undefined),
    set: (id, updatedAt) => attempt(() => storage?.setItem(key(id), updatedAt), undefined),
    clear: (id) => attempt(() => storage?.removeItem(key(id)), undefined),
    markDeleted: (id, version) => attempt(() => storage?.setItem(del(id), version), undefined),
    pendingDeletions: () =>
      attempt(() => {
        const out: { id: string; version: string }[] = [];
        for (let i = 0; storage && i < storage.length; i++) {
          const k = storage.key(i);
          if (k?.startsWith(`${DELETING}:`)) out.push({ id: k.slice(DELETING.length + 1), version: storage.getItem(k) ?? "" });
        }
        return out;
      }, []),
    deletionDone: (id) => attempt(() => storage?.removeItem(del(id)), undefined),
  };
}

/** In-memory bases (tests, or a browser without storage). */
export function memoryBases(init: Record<string, string> = {}): SyncBases & { all: Map<string, string>; deleting: Map<string, string> } {
  const all = new Map(Object.entries(init));
  const deleting = new Map<string, string>();
  return {
    all,
    deleting,
    get: (id) => all.get(id),
    set: (id, v) => void all.set(id, v),
    clear: (id) => void all.delete(id),
    markDeleted: (id, v) => void deleting.set(id, v),
    pendingDeletions: () => [...deleting].map(([id, version]) => ({ id, version })),
    deletionDone: (id) => void deleting.delete(id),
  };
}

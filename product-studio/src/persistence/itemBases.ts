/**
 * ONLINE SAVING of Cover Studio and Coloring Book items — this device's memory of them:
 *   bases     for each item, the version (updatedAt) this device and the online copy last agreed on
 *   deleting  items deleted here whose deletion hasn't reached the online copy yet (never downloaded again)
 *   uploaded  pictures already online (by id), so each is sent once
 *   open      items open in a screen right now: a sync never replaces them underneath the person editing them
 * Kept in this browser's storage; losing it is safe (the next sync then keeps both differing versions).
 */
export type ItemKind = "cover-draft" | "cover-collection" | "coloring-book";
const P = "dove-product-studio:v1:items";
const safe = <T>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};
const key = (kind: ItemKind, id: string) => `${kind}:${id}`;

export const itemBase = {
  get: (kind: ItemKind, id: string) => safe(() => localStorage.getItem(`${P}:synced:${key(kind, id)}`) ?? undefined, undefined),
  set: (kind: ItemKind, id: string, v: string) => safe(() => localStorage.setItem(`${P}:synced:${key(kind, id)}`, v), undefined),
  clear: (kind: ItemKind, id: string) => safe(() => localStorage.removeItem(`${P}:synced:${key(kind, id)}`), undefined),
};

export function markItemDeleted(kind: ItemKind, id: string, version: string): void {
  safe(() => localStorage.setItem(`${P}:deleting:${key(kind, id)}`, version), undefined);
  if (typeof window !== "undefined") window.dispatchEvent(new Event("dove-items-changed"));
}
export function pendingItemDeletions(): { kind: ItemKind; id: string; version: string }[] {
  return safe(() => {
    const out: { kind: ItemKind; id: string; version: string }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(`${P}:deleting:`)) continue;
      const [kind, ...rest] = k.slice(`${P}:deleting:`.length).split(":");
      out.push({ kind: kind as ItemKind, id: rest.join(":"), version: localStorage.getItem(k) ?? "" });
    }
    return out;
  }, []);
}
export const itemDeletionDone = (kind: ItemKind, id: string) => safe(() => localStorage.removeItem(`${P}:deleting:${key(kind, id)}`), undefined);

const UPLOADED = `${P}:artwork-online`;
export const uploadedArtwork = (): Set<string> => new Set(safe(() => JSON.parse(localStorage.getItem(UPLOADED) ?? "[]") as string[], []));
export const markArtworkUploaded = (ids: string[]) =>
  safe(() => localStorage.setItem(UPLOADED, JSON.stringify([...new Set([...uploadedArtwork(), ...ids])])), undefined);

const open = new Set<string>();
/** A screen has this item open (a sync leaves it alone until it is closed). */
export function holdItem(kind: ItemKind, id: string): () => void {
  open.add(key(kind, id));
  return () => open.delete(key(kind, id));
}
export const isHeld = (kind: ItemKind, id: string) => open.has(key(kind, id));

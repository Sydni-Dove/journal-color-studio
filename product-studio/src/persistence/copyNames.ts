/**
 * COPY NAMES — when two versions of a product both survive (edited on two
 * devices or tabs), or edits are rescued from a product deleted elsewhere,
 * the extra one is saved as a separate product. Its name says what it is and
 * when its edits were saved — never "this device" / "another device", which
 * would read wrongly on the other device. The current version keeps the
 * plain name, so the copy is always distinguishable.
 *
 *   "Prayer Journal (other version · saved Oct 8, 2026, 2:51:07 PM)"
 *   "Prayer Journal (recovered after deletion · saved Oct 8, 2026, 2:51:07 PM)"
 */
export type CopyKind = "other-version" | "recovered";

const LABEL: Record<CopyKind, string> = { "other-version": "other version", recovered: "recovered after deletion" };
/** A name's earlier copy suffix (so a copy of a copy doesn't grow a chain of them). */
const SUFFIX = / \((?:other version|recovered after deletion) · saved [^()]*\)$/;

export function savedStamp(updatedAt: string, timeZone?: string): string {
  const d = new Date(updatedAt);
  if (Number.isNaN(d.getTime())) return updatedAt;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", timeZone }).format(d);
}

/** The name for a kept copy of `name` holding the version saved at `savedAt`. */
export function copyName(name: string, kind: CopyKind, savedAt: string, timeZone?: string): string {
  return `${name.replace(SUFFIX, "")} (${LABEL[kind]} · saved ${savedStamp(savedAt, timeZone)})`;
}

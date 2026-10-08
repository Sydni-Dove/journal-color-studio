/**
 * Sample devotionals for tests and visual checks. Every word of every entry
 * is a unique, traceable token ("e12tea0034") inside ordinary sentences and
 * paragraphs, so a test can prove each word prints exactly once, in order,
 * in its own section. Entry lengths vary: short, typical and very long
 * (a teaching of several pages), chosen by a fixed pattern.
 */
import { addCollection, addRecord, COLLECTION_STARTERS } from "../../src/engines/data/data";
import { withDevotionalStructure } from "../../src/presets/devotionalStructures";
import { createProject } from "../../src/presets/products/projectFactory";
import type { FieldValue, ProjectData } from "../../src/types/document";
import type { ProductProject } from "../../src/types/project";

export const SECTION_CODES = { title: "tit", scripture: "scr", reading: "tea", questions: "que", prayer: "pra", action: "app" } as const;
export type SampleField = keyof typeof SECTION_CODES;

/** n tokens for entry e / section code, as sentences of 6–11 words, `paras` paragraphs. */
function prose(e: number, code: string, n: number, paras = 1, from = 0): string {
  const out: string[] = [];
  let k = from;
  const per = Math.ceil(n / paras);
  for (let p = 0; p < paras && k < from + n; p++) {
    const sentences: string[] = [];
    const end = Math.min(from + n, k + per);
    while (k < end) {
      const len = Math.min(end - k, 6 + ((k * 7 + e) % 6));
      const words = Array.from({ length: len }, () => `e${e}${code}${String(k++).padStart(4, "0")}`);
      sentences.push(`${words.join(" ")}.`);
    }
    out.push(sentences.join(" "));
  }
  return out.join("\n");
}

export type Size = "short" | "typical" | "long";
/** Entry e's length: every 7th entry is very long, every 3rd short, the rest typical. */
export const sizeOf = (e: number): Size => (e % 7 === 3 ? "long" : e % 3 === 0 ? "short" : "typical");

export function sampleEntry(e: number, size: Size = sizeOf(e)): Record<string, FieldValue> {
  const teach = size === "long" ? 1800 : size === "short" ? 40 : 260;
  return {
    day: e + 1,
    title: `e${e}tit0000 e${e}tit0001`,
    scripture: prose(e, "scr", size === "long" ? 90 : 18),
    reading: prose(e, "tea", teach, size === "long" ? 14 : size === "short" ? 1 : 3),
    questions: Array.from({ length: size === "short" ? 2 : 4 }, (_, q) => `${prose(e, "que", 9, 1, q * 9).replace(/\.$/, "?")}`).join("\n"),
    prayer: prose(e, "pra", size === "long" ? 160 : 45, size === "long" ? 2 : 1),
    action: prose(e, "app", size === "short" ? 8 : 20),
  };
}

/** A devotional data set: `days` entries in the starter's fields. */
export function sampleData(days: number, size?: Size): { data: ProjectData; collectionId: string; recordIds: string[] } {
  const starter = COLLECTION_STARTERS.find((s) => s.id === "devotional")!;
  let { data, id } = addCollection(undefined, "Devotional days", starter.fields);
  const recordIds: string[] = [];
  for (let e = 0; e < days; e++) {
    const r = addRecord(data, id, sampleEntry(e, size));
    data = r.data;
    recordIds.push(r.recordId);
  }
  return { data, collectionId: id, recordIds };
}

export type DevotionalOpts = { days: number; size?: Size; structure?: string; sizePreset?: string; orientation?: "portrait" | "landscape"; binding?: string; profile?: string };

/** A devotional product: the sample entries printed with a devotional structure. */
export function sampleDevotional(o: DevotionalOpts): ProductProject & { data: ProjectData } {
  const { data, collectionId } = sampleData(o.days, o.size);
  const c = data.collections.find((x) => x.id === collectionId)!;
  const p = createProject("journal", {
    name: `Devotional ${o.days} days`,
    dimensions: { sizePresetId: o.sizePreset ?? "6x9", orientation: o.orientation ?? "portrait" },
    production: { bindingType: (o.binding ?? "perfect-bound") as never, printProfileId: o.profile ?? "kdp", includeBleed: false, duplex: true },
    recipe: { items: [], ordering: "sequential", structure: withDevotionalStructure(undefined, o.structure ?? "flowing", c) },
  });
  return { ...p, data };
}

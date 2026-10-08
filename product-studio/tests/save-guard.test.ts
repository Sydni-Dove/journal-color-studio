/**
 * Saving never overwrites newer work: a tab (e.g. one left open on an older
 * build) that saves after another tab saved keeps its edits as a copy.
 */
import { describe, expect, it } from "vitest";
import { saveGuarded, type ProjectStore, type ProjectSummary } from "../src/persistence/projectStore";
import { createProject } from "../src/presets/products/projectFactory";
import type { ProductProject } from "../src/types/project";

function memoryStore(): ProjectStore & { all: Map<string, ProductProject> } {
  const all = new Map<string, ProductProject>();
  return {
    all,
    list: () => [...all.values()].map((p) => ({ id: p.id, name: p.name }) as ProjectSummary),
    load: (id) => (all.has(id) ? structuredClone(all.get(id)!) : null),
    save: (p) => void all.set(p.id, structuredClone(p)),
    remove: (id) => void all.delete(id),
  };
}
const at = (p: ProductProject, t: string, name = p.name): ProductProject => ({ ...p, name, updatedAt: t });

describe("saveGuarded", () => {
  it("saves normally when nothing newer is stored", () => {
    const store = memoryStore();
    const p = at(createProject("journal", { name: "Mine" }), "2026-09-30T10:00:00.000Z");
    expect(saveGuarded(store, p, null).status).toBe("saved");
    const next = at(p, "2026-09-30T10:05:00.000Z", "Mine, edited");
    expect(saveGuarded(store, next, p.updatedAt).status).toBe("saved");
    expect(store.load(p.id)!.name).toBe("Mine, edited");
  });

  it("an older tab saving after a newer save keeps both: the newer stays, the older becomes a copy", () => {
    const store = memoryStore();
    const loaded = at(createProject("journal", { name: "Prophetic Journal" }), "2026-09-30T10:00:00.000Z");
    store.save(loaded);
    // Tab A edits and saves.
    const a = at(loaded, "2026-09-30T10:10:00.000Z", "Prophetic Journal — tab A edits");
    expect(saveGuarded(store, a, loaded.updatedAt).status).toBe("saved");
    // Tab B, opened on the 10:00 version, saves later.
    const b = at(loaded, "2026-09-30T10:20:00.000Z", "Prophetic Journal");
    const r = saveGuarded(store, b, loaded.updatedAt);
    expect(r.status).toBe("conflict");
    expect(store.load(loaded.id)!.name).toBe("Prophetic Journal — tab A edits");
    if (r.status === "conflict") {
      expect(r.copy.id).not.toBe(loaded.id);
      // Neutral copy name: the name, what it is, when its edits were saved (accurate in every tab and on every device).
      expect(store.load(r.copy.id)!.name).toMatch(/^Prophetic Journal \(other version · saved Sep 30, 2026, \d{1,2}:20:00 [AP]M\)$/);
      expect(r.stored.name).toBe("Prophetic Journal — tab A edits");
    }
  });
});

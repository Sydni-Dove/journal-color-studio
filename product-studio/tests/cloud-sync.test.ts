/**
 * Online saving: no edit is ever lost. A sync copies across what changed on
 * only one side, keeps BOTH versions when a product changed on both sides,
 * carries deletions to every device (rescuing edits made since as a recovered
 * copy), and every online write is conditional, so two devices acting at once
 * can never overwrite each other or bring a deleted product back.
 */
import { describe, expect, it } from "vitest";
import { planSync, saveOnline, type CloudBackend, type CloudProject } from "../src/persistence/cloud";
import { applyDelete, applySave, applySync, type SyncEvent } from "../src/app/useCloud";
import { copyName } from "../src/persistence/copyNames";
import { memoryBases } from "../src/persistence/sync";
import { createProject } from "../src/presets/products/projectFactory";
import type { ProjectStore } from "../src/persistence/projectStore";
import type { ProductProject } from "../src/types/project";

const at = (p: ProductProject, t: string, name = p.name): ProductProject => ({ ...p, name, updatedAt: t });
const online = (p: ProductProject, deletedAt: string | null = null): CloudProject => ({ id: p.id, name: p.name, updatedAt: p.updatedAt, data: p, deletedAt });

/** An online store that behaves like the table: conditional writes are single statements; deleting hides the row (deleted_at), it stays. */
function fakeBackend(rows: ProductProject[] = []) {
  const map = new Map(rows.map((r) => [r.id, { p: r, deletedAt: null as string | null }]));
  const be: CloudBackend & { live: () => ProductProject[]; deleted: () => string[] } = {
    live: () => [...map.values()].filter((r) => !r.deletedAt).map((r) => r.p),
    deleted: () => [...map].filter(([, r]) => r.deletedAt).map(([id]) => id),
    list: async () => [...map.values()].map((r) => online(r.p, r.deletedAt)),
    get: async (id) => (map.has(id) ? online(map.get(id)!.p, map.get(id)!.deletedAt) : null),
    putIf: async (p, expected) => {
      const cur = map.get(p.id);
      if (expected === null ? cur !== undefined : !cur || cur.deletedAt || cur.p.updatedAt !== expected) return false;
      map.set(p.id, { p, deletedAt: null });
      return true;
    },
    removeIf: async (id, upTo) => {
      const cur = map.get(id);
      if (cur && !cur.deletedAt && cur.p.updatedAt <= upTo) {
        cur.deletedAt = new Date().toISOString();
        return true;
      }
      return !cur || !!cur.deletedAt;
    },
  };
  return be;
}
function memoryStore(rows: ProductProject[] = []): ProjectStore & { rows: Map<string, ProductProject> } {
  const map = new Map(rows.map((r) => [r.id, r]));
  return {
    rows: map,
    list: () => [...map.values()].map((p) => ({ id: p.id, name: p.name, productType: p.productType, sizePresetId: p.dimensions.sizePresetId, updatedAt: p.updatedAt, variantCount: p.variants.length })),
    load: (id) => map.get(id) ?? null,
    save: (p) => void map.set(p.id, p),
    remove: (id) => void map.delete(id),
  };
}
const names = (ps: Iterable<ProductProject>) => [...ps].map((x) => x.name).sort();
const STAMP = / \((other version|recovered after deletion) · saved [A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2}:\d{2} [AP]M\)$/;

const T0 = "2026-09-30T10:00:00.000Z", T1 = "2026-09-30T11:00:00.000Z", T2 = "2026-09-30T12:00:00.000Z";

describe("copy names: neutral, accurate on every device, distinct from the current version", () => {
  it("name + what it is + when its edits were saved", () => {
    expect(copyName("Prayer Journal", "other-version", "2026-10-08T18:51:07.000Z", "UTC")).toBe("Prayer Journal (other version · saved Oct 8, 2026, 6:51:07 PM)");
    expect(copyName("Prayer Journal", "recovered", "2026-10-08T18:51:07.000Z", "UTC")).toBe("Prayer Journal (recovered after deletion · saved Oct 8, 2026, 6:51:07 PM)");
  });
  it("a copy of a copy doesn't chain labels", () => {
    const once = copyName("Planner", "other-version", T0, "UTC");
    expect(copyName(once, "recovered", T1, "UTC")).toBe("Planner (recovered after deletion · saved Sep 30, 2026, 11:00:00 AM)");
  });
});

describe("planSync", () => {
  const a = at(createProject("journal", { name: "A" }), T0);
  const b = at(createProject("journal", { name: "B" }), T0);
  const c = at(createProject("journal", { name: "C" }), T0);
  const EMPTY = { toLocal: [], toCloud: [], keepBoth: [], removeHere: [], recover: [] };
  it("only here → online; only online → here; the same version → nothing", () => {
    const d = at(createProject("journal", { name: "D (other device)" }), T0);
    const plan = planSync([c], [online(d)]);
    expect(plan.toCloud.map((x) => [x.project.name, x.expected])).toEqual([["C", null]]);
    expect(plan.toLocal.map((p) => p.name)).toEqual(["D (other device)"]);
    expect(planSync([a], [online(a)])).toEqual(EMPTY);
  });
  it("with the version both sides last agreed on: changed only here → online, changed only online → here", () => {
    const bases: Record<string, string> = { [a.id]: T0, [b.id]: T0 };
    const plan = planSync([at(a, T1, "A edited here"), b], [online(a), online(at(b, T1, "B edited on the phone"))], (id) => bases[id]);
    expect(plan.toCloud.map((x) => [x.project.name, x.expected])).toEqual([["A edited here", T0]]);
    expect(plan.toLocal.map((p) => p.name)).toEqual(["B edited on the phone"]);
    expect(plan.keepBoth).toEqual([]);
  });
  it("changed on BOTH sides: both are kept — the newer as the product, the older as a copy", () => {
    const plan = planSync([at(a, T1, "A on the laptop")], [online(at(a, T2, "A on the phone"))], () => T0);
    expect(plan.keepBoth.map((k) => [k.newer.name, k.older.name, k.olderFrom])).toEqual([["A on the phone", "A on the laptop", "this device"]]);
  });
  it("never synced on this device (no base): differing versions are both kept; identical content (keys in any order) isn't copied", () => {
    expect(planSync([at(a, T1, "A here")], [online(at(a, T2, "A online"))]).keepBoth).toHaveLength(1);
    const reordered = (p: ProductProject): ProductProject => JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(p).reverse())));
    const same = planSync([at(a, T1)], [online(reordered(at(a, T2)))]);
    expect(same.keepBoth).toEqual([]);
    expect(same.toLocal.map((p) => p.updatedAt)).toEqual([T2]);
  });
  it("deleted online: removed here when unchanged here since; recovered as a copy when changed here since; never downloaded", () => {
    const gone = (p: ProductProject) => online(p, T2);
    expect(planSync([a], [gone(a)], () => T0).removeHere).toEqual([a.id]); // unchanged since the agreed version
    expect(planSync([a], [gone(a)]).removeHere).toEqual([a.id]); // no base, but the very version deleted
    expect(planSync([at(a, T1)], [gone(a)]).removeHere).toEqual([a.id]); // no base, same content
    const edited = planSync([at(a, T1, "A edited here, offline")], [gone(a)], () => T0);
    expect(edited.removeHere).toEqual([]);
    expect(edited.recover.map((p) => p.name)).toEqual(["A edited here, offline"]);
    expect(planSync([], [gone(a)])).toEqual(EMPTY);
  });
});

describe("two devices, one account", () => {
  it("edited on both: both versions exist on both sides, the copy named neutrally; a second sync changes nothing", async () => {
    const p = at(createProject("journal", { name: "Journal" }), T0);
    const laptop = memoryStore([at(p, T1, "Journal — laptop edits")]);
    const be = fakeBackend([at(p, T2, "Journal — phone edits")]);
    const bases = memoryBases({ [p.id]: T0 });
    const events: SyncEvent[] = [];
    await applySync(laptop, be, bases, (e) => events.push(e));
    const copy = [...laptop.rows.values()].find((x) => x.id !== p.id)!;
    expect(laptop.rows.get(p.id)!.name).toBe("Journal — phone edits");
    expect(copy.name).toMatch(/^Journal — laptop edits \(other version · saved /);
    expect(copy.name).toMatch(STAMP);
    expect(names(be.live())).toEqual(names(laptop.rows.values()));
    expect(events.map((e) => e.kind)).toEqual(["kept-both"]);
    expect(await applySync(laptop, be, bases, (e) => events.push(e))).toEqual([]);
    expect(events).toHaveLength(1);
  });

  it("deleted on one device: the other removes it (it had no unsynced edits); it's never uploaded again", async () => {
    const p = at(createProject("journal", { name: "Old planner" }), T0);
    const A = memoryStore([p]), B = memoryStore([p]);
    const be = fakeBackend([p]);
    const basesA = memoryBases({ [p.id]: T0 }), basesB = memoryBases({ [p.id]: T0 });
    await applyDelete(A, be, basesA, p, () => {});
    expect(A.rows.has(p.id)).toBe(false);
    expect(be.deleted()).toEqual([p.id]);
    const events: SyncEvent[] = [];
    await applySync(B, be, basesB, (e) => events.push(e));
    expect(B.rows.has(p.id)).toBe(false);
    expect(events).toEqual([{ kind: "deleted-elsewhere", id: p.id, name: "Old planner", recovered: null }]);
    for (let i = 0; i < 3; i++) {
      await applySync(A, be, basesA, () => {});
      await applySync(B, be, basesB, () => {});
    }
    expect(A.rows.size + B.rows.size).toBe(0);
    expect(be.live()).toEqual([]);
    expect(be.deleted()).toEqual([p.id]);
  });

  it("deleted on one device while the other edited offline: those edits are recovered as a copy; the deleted product stays deleted", async () => {
    const p = at(createProject("journal", { name: "Workbook" }), T0);
    const B = memoryStore([at(p, T1, "Workbook — edited offline")]);
    const be = fakeBackend([p]);
    await applyDelete(memoryStore([p]), be, memoryBases({ [p.id]: T0 }), p, () => {});
    const basesB = memoryBases({ [p.id]: T0 });
    const events: SyncEvent[] = [];
    await applySync(B, be, basesB, (e) => events.push(e));
    expect(B.rows.has(p.id)).toBe(false);
    const rec = [...B.rows.values()];
    expect(rec).toHaveLength(1);
    expect(rec[0].name).toMatch(/^Workbook — edited offline \(recovered after deletion · saved /);
    expect(be.live().map((x) => x.id)).toEqual([rec[0].id]);
    expect(be.deleted()).toEqual([p.id]);
    expect(events[0]).toMatchObject({ kind: "deleted-elsewhere", id: p.id, recovered: { id: rec[0].id } });
    expect(await applySync(B, be, basesB, (e) => events.push(e))).toEqual([]);
    expect(events).toHaveLength(1);
  });

  it("an open product saved after it was deleted elsewhere: never written back; the edits become a recovered copy", async () => {
    const p = at(createProject("journal", { name: "Notary journal" }), T0);
    const be = fakeBackend([p]);
    await be.removeIf(p.id, T0);
    const here = memoryStore([at(p, T1, "Notary journal — new entries")]);
    const events: SyncEvent[] = [];
    await applySave(here, be, memoryBases({ [p.id]: T0 }), here.rows.get(p.id)!, T0, (e) => events.push(e));
    expect(be.deleted()).toEqual([p.id]);
    expect(here.rows.has(p.id)).toBe(false);
    const rec = [...here.rows.values()][0];
    expect(rec.name).toMatch(/^Notary journal — new entries \(recovered after deletion/);
    expect(be.live().map((x) => x.id)).toEqual([rec.id]);
    expect(events[0].kind).toBe("deleted-elsewhere");
  });

  it("deleted offline: remembered, never downloaded again meanwhile, finished online by the next sync; then other devices drop it", async () => {
    const p = at(createProject("journal", { name: "Log" }), T0);
    const be = fakeBackend([p]);
    const A = memoryStore([p]), basesA = memoryBases({ [p.id]: T0 });
    await applyDelete(A, null, basesA, p, () => {}); // offline / signed out
    expect(basesA.pendingDeletions()).toEqual([{ id: p.id, version: T0 }]);
    expect(be.live()).toHaveLength(1);
    await applySync(A, be, basesA, () => {});
    expect(A.rows.has(p.id)).toBe(false);
    expect(be.deleted()).toEqual([p.id]);
    expect(basesA.pendingDeletions()).toEqual([]);
    const B = memoryStore([p]);
    await applySync(B, be, memoryBases({ [p.id]: T0 }), () => {});
    expect(B.rows.size).toBe(0);
  });

  it("deleted here, but another device saved newer edits after that version: the product is kept (and comes back here)", async () => {
    const p = at(createProject("journal", { name: "Shared planner" }), T0);
    const be = fakeBackend([at(p, T1, "Shared planner — phone edits")]);
    const A = memoryStore([p]), basesA = memoryBases({ [p.id]: T0 });
    const events: SyncEvent[] = [];
    await applyDelete(A, be, basesA, p, (e) => events.push(e));
    expect(be.live().map((x) => x.name)).toEqual(["Shared planner — phone edits"]);
    expect(events).toEqual([{ kind: "deletion-kept", id: p.id, name: "Shared planner" }]);
    await applySync(A, be, basesA, () => {});
    expect(A.rows.get(p.id)?.name).toBe("Shared planner — phone edits");
  });

  it("a deletion and a save at the same moment: whichever lands first, the edits survive exactly once", async () => {
    for (const saveFirst of [false, true]) {
      const p = at(createProject("journal", { name: "Race" }), T0);
      const be = fakeBackend([p]);
      const editor = memoryStore([at(p, T1, "Race — new edits")]);
      const del = () => applyDelete(memoryStore([p]), be, memoryBases({ [p.id]: T0 }), p, () => {});
      const save = () => applySave(editor, be, memoryBases({ [p.id]: T0 }), editor.rows.get(p.id)!, T0, () => {});
      await (saveFirst ? Promise.all([save(), del()]) : Promise.all([del(), save()]));
      expect(be.live().filter((x) => x.name.startsWith("Race — new edits"))).toHaveLength(1);
    }
  });
});

describe("saveOnline (compare-and-swap)", () => {
  it("saves when the online copy is the version the edits started from", async () => {
    const p = at(createProject("journal", { name: "P" }), T0);
    const be = fakeBackend([p]);
    expect(await saveOnline(be, at(p, T1, "P edited"), T0)).toEqual({ status: "saved" });
    expect(be.live()[0].name).toBe("P edited");
  });
  it("never overwrites a newer online version (another device saved since): conflict, theirs untouched", async () => {
    const p = at(createProject("journal", { name: "P" }), T0);
    const be = fakeBackend([at(p, T1, "P from the phone")]);
    const r = await saveOnline(be, at(p, T2, "P from the laptop"), T0);
    expect(r.status).toBe("conflict");
    expect(be.live()[0].name).toBe("P from the phone");
  });
  it("replaces an OLDER online copy (earlier edits here never reached it), and adds a product not online yet", async () => {
    const p = at(createProject("journal", { name: "P" }), T0);
    const be = fakeBackend([p]);
    expect(await saveOnline(be, at(p, T2, "P offline edits"), T1)).toEqual({ status: "saved" });
    const n = at(createProject("journal", { name: "New" }), T1);
    expect(await saveOnline(be, n, null)).toEqual({ status: "saved" });
    expect(names(be.live())).toEqual(["New", "P offline edits"]);
  });
  it("a deleted product is never written back, from any starting version", async () => {
    const p = at(createProject("journal", { name: "P" }), T0);
    const be = fakeBackend([p]);
    await be.removeIf(p.id, T0);
    expect(await saveOnline(be, at(p, T1), T0)).toEqual({ status: "deleted" });
    expect(await saveOnline(be, at(p, T1), null)).toEqual({ status: "deleted" });
    expect(be.live()).toEqual([]);
  });
  it("two devices saving from the same version at the same moment: exactly one is saved, the other is told", async () => {
    const p = at(createProject("journal", { name: "P" }), T0);
    const be = fakeBackend([p]);
    const results = await Promise.all([saveOnline(be, at(p, T1, "phone"), T0), saveOnline(be, at(p, T2, "laptop"), T0)]);
    expect(results.filter((r) => r.status === "saved")).toHaveLength(1);
    const loser = results.find((r) => r.status === "conflict");
    expect(loser && loser.status === "conflict" && loser.newer.name).toBe(be.live()[0].name);
  });
});

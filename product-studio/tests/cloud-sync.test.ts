/**
 * Online saving: no edit is ever lost. A sync copies across what changed on
 * only one side, keeps BOTH versions when a product changed on both sides, and
 * every online write is a compare-and-swap, so two devices saving at once can
 * never overwrite each other.
 */
import { describe, expect, it } from "vitest";
import { planSync, saveOnline, type CloudBackend, type CloudProject } from "../src/persistence/cloud";
import { applySync } from "../src/app/useCloud";
import { memoryBases } from "../src/persistence/sync";
import { createProject } from "../src/presets/products/projectFactory";
import type { ProjectStore } from "../src/persistence/projectStore";
import type { ProductProject } from "../src/types/project";

const at = (p: ProductProject, t: string, name = p.name): ProductProject => ({ ...p, name, updatedAt: t });
const online = (p: ProductProject): CloudProject => ({ id: p.id, name: p.name, updatedAt: p.updatedAt, data: p });

/** An online store whose conditional write behaves like the server's single UPDATE … WHERE updated_at = expected. */
function fakeBackend(rows: ProductProject[] = []): CloudBackend & { rows: Map<string, ProductProject>; removed: Map<string, ProductProject> } {
  const map = new Map(rows.map((r) => [r.id, r]));
  const removed = new Map<string, ProductProject>(); // removed rows stay online, unlisted (like deleted_at)
  return {
    rows: map,
    removed,
    list: async () => [...map.values()].map(online),
    get: async (id) => (map.has(id) ? online(map.get(id)!) : null),
    put: async (p) => void map.set(p.id, p),
    putIf: async (p, expected) => {
      const cur = map.get(p.id);
      if (expected === null ? cur !== undefined : cur?.updatedAt !== expected) return false;
      removed.delete(p.id);
      map.set(p.id, p);
      return true;
    },
    remove: async (id) => {
      if (map.has(id)) removed.set(id, map.get(id)!);
      map.delete(id);
    },
  };
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

const T0 = "2026-09-30T10:00:00.000Z", T1 = "2026-09-30T11:00:00.000Z", T2 = "2026-09-30T12:00:00.000Z";

describe("planSync", () => {
  const a = at(createProject("journal", { name: "A" }), T0);
  const b = at(createProject("journal", { name: "B" }), T0);
  const c = at(createProject("journal", { name: "C" }), T0);
  it("only here → online; only online → here; the same version → nothing", () => {
    const d = at(createProject("journal", { name: "D (other device)" }), T0);
    const plan = planSync([c], [online(d)]);
    expect(plan.toCloud.map((x) => [x.project.name, x.expected])).toEqual([["C", null]]);
    expect(plan.toLocal.map((p) => p.name)).toEqual(["D (other device)"]);
    expect(planSync([a], [online(a)])).toEqual({ toLocal: [], toCloud: [], keepBoth: [] });
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
    expect(plan.toLocal).toEqual([]);
    expect(plan.toCloud).toEqual([]);
    expect(plan.keepBoth.map((k) => [k.newer.name, k.older.name, k.olderFrom])).toEqual([["A on the phone", "A on the laptop", "this device"]]);
  });
  it("never synced on this device (no base): differing versions are both kept, never guessed; identical content isn't copied", () => {
    expect(planSync([at(a, T1, "A here")], [online(at(a, T2, "A online"))]).keepBoth).toHaveLength(1);
    // The online copy comes back from jsonb with its keys in another order: still the same content.
    const reordered = (p: ProductProject): ProductProject => JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(p).reverse())));
    const same = planSync([at(a, T1)], [online(reordered(at(a, T2)))]);
    expect(same.keepBoth).toEqual([]);
    expect(same.toLocal.map((p) => p.updatedAt)).toEqual([T2]);
  });
});

describe("a phone and a laptop both edit the same product", () => {
  const names = (m: Map<string, ProductProject>) => [...m.values()].map((x) => x.name).sort();
  it("after syncing, both sets of edits exist here and online; a second sync changes nothing", async () => {
    const p = at(createProject("journal", { name: "Journal" }), T0);
    const laptop = memoryStore([at(p, T1, "Journal — laptop edits")]);
    const be = fakeBackend([at(p, T2, "Journal — phone edits")]);
    const bases = memoryBases({ [p.id]: T0 });
    const kept: string[] = [];
    const changed = await applySync(laptop, be, bases, (_n, name) => kept.push(name));
    expect(names(laptop.rows)).toEqual(["Journal — laptop edits (version from this device)", "Journal — phone edits"]);
    expect(names(be.rows)).toEqual(names(laptop.rows));
    expect(kept).toEqual(["Journal — laptop edits (version from this device)"]);
    expect(changed.length).toBe(2);
    const again = await applySync(laptop, be, bases, () => kept.push("unexpected"));
    expect(again).toEqual([]);
    expect(names(be.rows)).toEqual(names(laptop.rows));
    expect(kept).toHaveLength(1);
  });
  it("an edit made only here goes online, replacing exactly the version it started from", async () => {
    const p = at(createProject("journal", { name: "Planner" }), T0);
    const here = memoryStore([at(p, T1, "Planner — edited here")]);
    const be = fakeBackend([p]);
    const bases = memoryBases({ [p.id]: T0 });
    await applySync(here, be, bases, () => {});
    expect(be.rows.get(p.id)!.name).toBe("Planner — edited here");
    expect(bases.get(p.id)).toBe(T1);
  });
});

describe("saveOnline (compare-and-swap)", () => {
  it("saves when the online copy is the version the edits started from", async () => {
    const p = at(createProject("journal", { name: "P" }), T0);
    const be = fakeBackend([p]);
    expect(await saveOnline(be, at(p, T1, "P edited"), T0)).toEqual({ status: "saved" });
    expect(be.rows.get(p.id)!.name).toBe("P edited");
  });
  it("never overwrites a newer online version (another device saved since): conflict, theirs untouched", async () => {
    const p = at(createProject("journal", { name: "P" }), T0);
    const be = fakeBackend([at(p, T1, "P from the phone")]);
    const r = await saveOnline(be, at(p, T2, "P from the laptop"), T0);
    expect(r.status).toBe("conflict");
    expect(be.rows.get(p.id)!.name).toBe("P from the phone");
  });
  it("replaces an OLDER online copy (earlier edits here never reached it), and adds a product not online yet", async () => {
    const p = at(createProject("journal", { name: "P" }), T0);
    const be = fakeBackend([p]);
    expect(await saveOnline(be, at(p, T2, "P offline edits"), T1)).toEqual({ status: "saved" });
    expect(be.rows.get(p.id)!.name).toBe("P offline edits");
    const n = at(createProject("journal", { name: "New" }), T1);
    expect(await saveOnline(be, n, null)).toEqual({ status: "saved" });
    expect(be.rows.get(n.id)!.name).toBe("New");
  });
  it("a product removed on another device but still edited here is brought back, not lost or stuck", async () => {
    const p = at(createProject("journal", { name: "P" }), T0);
    const be = fakeBackend([p]);
    await be.remove(p.id);
    expect(await saveOnline(be, at(p, T1, "P kept here"), T0)).toEqual({ status: "saved" });
    expect(be.rows.get(p.id)!.name).toBe("P kept here");
  });
  it("two devices saving from the same version at the same moment: exactly one is saved, the other is told", async () => {
    const p = at(createProject("journal", { name: "P" }), T0);
    const be = fakeBackend([p]);
    const results = await Promise.all([saveOnline(be, at(p, T1, "phone"), T0), saveOnline(be, at(p, T2, "laptop"), T0)]);
    expect(results.filter((r) => r.status === "saved")).toHaveLength(1);
    const loser = results.find((r) => r.status === "conflict");
    expect(loser && loser.status === "conflict" && loser.newer.name).toBe(be.rows.get(p.id)!.name);
  });
});

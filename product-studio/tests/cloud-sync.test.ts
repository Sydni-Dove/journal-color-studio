/**
 * Online saving: the newer version of each product wins on both sides, nothing
 * is deleted, and a save never overwrites a newer online version.
 */
import { describe, expect, it } from "vitest";
import { planSync, saveOnline, type CloudBackend, type CloudProject } from "../src/persistence/cloud";
import { createProject } from "../src/presets/products/projectFactory";
import type { ProductProject } from "../src/types/project";

const at = (p: ProductProject, t: string, name = p.name): ProductProject => ({ ...p, name, updatedAt: t });
const online = (p: ProductProject): CloudProject => ({ id: p.id, name: p.name, updatedAt: p.updatedAt, data: p });
function fakeBackend(rows: ProductProject[] = []): CloudBackend & { rows: Map<string, ProductProject> } {
  const map = new Map(rows.map((r) => [r.id, r]));
  return {
    rows: map,
    list: async () => [...map.values()].map(online),
    get: async (id) => (map.has(id) ? online(map.get(id)!) : null),
    put: async (p) => void map.set(p.id, p),
    remove: async (id) => void map.delete(id),
  };
}

describe("planSync", () => {
  const a = at(createProject("journal", { name: "A" }), "2026-09-30T10:00:00.000Z");
  const b = at(createProject("journal", { name: "B" }), "2026-09-30T10:00:00.000Z");
  const c = at(createProject("journal", { name: "C" }), "2026-09-30T10:00:00.000Z");
  it("only here → online; only online → here; newer wins either way; equal → nothing", () => {
    const localA = at(a, "2026-09-30T12:00:00.000Z", "A edited here");
    const remoteB = at(b, "2026-09-30T12:00:00.000Z", "B edited on the phone");
    const plan = planSync([localA, b, c], [online(a), online(remoteB)].concat([]));
    expect(plan.toCloud.map((p) => p.name).sort()).toEqual(["A edited here", "C"]);
    expect(plan.toLocal.map((p) => p.name)).toEqual(["B edited on the phone"]);
    const d = at(createProject("journal", { name: "D (other device)" }), "2026-09-30T09:00:00.000Z");
    expect(planSync([], [online(d)]).toLocal.map((p) => p.name)).toEqual(["D (other device)"]);
    expect(planSync([a], [online(a)])).toEqual({ toLocal: [], toCloud: [] });
  });
});

describe("saveOnline", () => {
  it("saves when nothing newer is online", async () => {
    const p = at(createProject("journal", { name: "P" }), "2026-09-30T10:00:00.000Z");
    const be = fakeBackend([p]);
    const next = at(p, "2026-09-30T10:05:00.000Z", "P edited");
    expect(await saveOnline(be, next, p.updatedAt)).toEqual({ status: "saved" });
    expect(be.rows.get(p.id)!.name).toBe("P edited");
  });
  it("never overwrites a newer online version (another device saved since)", async () => {
    const p = at(createProject("journal", { name: "P" }), "2026-09-30T10:00:00.000Z");
    const phone = at(p, "2026-09-30T10:10:00.000Z", "P from the phone");
    const be = fakeBackend([phone]);
    const laptop = at(p, "2026-09-30T10:20:00.000Z", "P from the laptop");
    const r = await saveOnline(be, laptop, p.updatedAt);
    expect(r.status).toBe("conflict");
    expect(be.rows.get(p.id)!.name).toBe("P from the phone");
  });
});

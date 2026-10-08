/**
 * LIVE CHECK of online saving against the real Supabase table — run by hand,
 * never by `npm test`. Open the dev app, sign in, then in the browser console:
 *
 *   const m = await import("/tests/live/cloud-live.ts"); await m.run();
 *
 * It uses the app's own backend (same signed-in client), sync, save and delete
 * code, with several simulated devices (each its own local store and its own
 * record of agreed versions and pending deletions). It only creates products
 * named "Phase 4 verify …" and only ever writes to those; at the end they are
 * deleted (hidden online). Existing products are read during a sync (into the
 * simulated devices' memory) and never written.
 */
import { canonicalJson, supabaseBackend, saveOnline, type CloudBackend } from "../../src/persistence/cloud";
import { applyDelete, applySave, applySync, type SyncEvent } from "../../src/app/useCloud";
import { memoryBases } from "../../src/persistence/sync";
import { createProject } from "../../src/presets/products/projectFactory";
import type { ProjectStore } from "../../src/persistence/projectStore";
import type { ProductProject } from "../../src/types/project";

type Result = { name: string; ok: boolean; detail: string };
const PREFIX = "Phase 4 verify";
const STAMP = / \((other version|recovered after deletion) · saved [A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2}:\d{2} [AP]M\)$/;
let clock = Date.now();
/** Strictly increasing save times (ms precision, as the app writes them). */
const tick = () => new Date((clock = Math.max(clock + 7, Date.now()))).toISOString();
const at = (p: ProductProject, name = p.name): ProductProject => ({ ...p, name, updatedAt: tick() });

function device(): ProjectStore & { rows: Map<string, ProductProject> } {
  const rows = new Map<string, ProductProject>();
  return {
    rows,
    list: () => [...rows.values()].map((p) => ({ id: p.id, name: p.name, productType: p.productType, sizePresetId: p.dimensions.sizePresetId, updatedAt: p.updatedAt, variantCount: p.variants.length })),
    load: (id) => rows.get(id) ?? null,
    save: (p) => void rows.set(p.id, p),
    remove: (id) => void rows.delete(id),
  };
}

export async function run(): Promise<Result[]> {
  const be: CloudBackend = supabaseBackend();
  const results: Result[] = [];
  const check = (name: string, ok: boolean, detail = "") => { results.push({ name, ok, detail }); console[ok ? "log" : "error"](`${ok ? "PASS" : "FAIL"} — ${name}${detail ? ` (${detail})` : ""}`); };
  const fresh = (label: string) => ({ ...createProject("journal", { name: `${PREFIX} — ${label}` }), updatedAt: tick() });
  const preexisting = new Set((await be.list()).filter((r) => r.name.startsWith(PREFIX)).map((r) => r.id)); // earlier runs
  /** Live (not deleted) test rows from THIS run whose name contains `part`. */
  const liveNamed = async (part: string) => (await be.list()).filter((x) => !x.deletedAt && x.name.includes(part) && !preexisting.has(x.id));
  const realRows = async () => (await be.list()).filter((r) => !r.name.startsWith(PREFIX)).map((r) => `${r.id}@${r.updatedAt}@${r.deletedAt ?? ""}`).sort();
  const before = await realRows();
  /** Two devices that both have `p`, synced. */
  const twoDevices = async (p: ProductProject) => {
    await be.putIf(p, null);
    const A = device(), B = device(), bA = memoryBases(), bB = memoryBases();
    await applySync(A, be, bA, () => {});
    await applySync(B, be, bB, () => {});
    return { A, B, bA, bB };
  };

  try {
    // 1. Save, reload.
    const p = fresh("save and reload");
    check("new product saved online", await be.putIf(p, null));
    const got = await be.get(p.id);
    check("reloaded copy is identical (content and save time)", !!got && got.updatedAt === p.updatedAt && canonicalJson(got.data) === canonicalJson(p), got?.updatedAt);
    check("adding the same product again is refused (no second copy, nothing overwritten)", !(await be.putIf(at(p, "should not land"), null)) && (await be.get(p.id))?.name === p.name);

    // 2. Edit; 3. a stale conditional save is rejected.
    const p1 = at(p, `${PREFIX} — save and reload (edited)`);
    check("edit saved over the version it started from", (await saveOnline(be, p1, p.updatedAt)).status === "saved" && (await be.get(p.id))?.name === p1.name);
    const accepted = await be.putIf(at(p, "STALE — must not land"), p.updatedAt);
    const after = await be.get(p.id);
    check("stale conditional save rejected; online copy untouched", !accepted && after?.name === p1.name && after?.updatedAt === p1.updatedAt, `online: ${after?.name}`);

    // 4. Simultaneous saves.
    const q = fresh("simultaneous saves");
    await be.putIf(q, null);
    const [ra, rb] = await Promise.all([saveOnline(be, at(q, `${PREFIX} — simultaneous (phone)`), q.updatedAt), saveOnline(be, at(q, `${PREFIX} — simultaneous (laptop)`), q.updatedAt)]);
    const qNow = await be.get(q.id);
    const loser = [ra, rb].find((r) => r.status === "conflict");
    check("simultaneous saves: exactly one saved, the other told the winner", [ra.status, rb.status].sort().join() === "conflict,saved" && !!loser && loser.status === "conflict" && loser.newer.name === qNow?.name, qNow?.name);
    const racers = Array.from({ length: 10 }, (_, i) => at(q, `${PREFIX} — racer ${i}`));
    const wins = await Promise.all(racers.map((r) => be.putIf(r, qNow!.updatedAt)));
    check("10 racing conditional writes: exactly one accepted, and it is the one online", wins.filter(Boolean).length === 1 && (await be.get(q.id))?.name === racers[wins.indexOf(true)]?.name);

    // 5. Save conflict (the app's save path): the newer stays; the other edits become a neutrally named copy.
    const r0 = fresh("edited on two devices");
    const d5 = await twoDevices(r0);
    const rA = at(r0, `${PREFIX} — edited on two devices (A's edits)`);
    d5.A.save(rA);
    await applySave(d5.A, be, d5.bA, rA, r0.updatedAt, () => {});
    const ev5: SyncEvent[] = [];
    const rB = at(d5.B.load(r0.id)!, `${PREFIX} — edited on two devices (B's edits)`);
    d5.B.save(rB);
    await applySave(d5.B, be, d5.bB, rB, r0.updatedAt, (e) => ev5.push(e));
    const copy5 = ev5[0]?.kind === "kept-both" ? ev5[0].copy : null;
    check("save conflict: the newer (A's) stays the product, online and on B", (await be.get(r0.id))?.name === rA.name && d5.B.load(r0.id)?.name === rA.name);
    check("save conflict: B's edits kept as '<name> (other version · saved <time>)', online and on B", !!copy5 && copy5.name.startsWith(`${rB.name} (other version · saved `) && STAMP.test(copy5.name) && (await liveNamed("edited on two devices")).some((x) => x.name === copy5.name) && d5.B.load(copy5.id)?.name === copy5.name, copy5?.name);

    // 6. Changed on both sides, then a sync.
    const s0 = fresh("changed on both sides");
    const d6 = await twoDevices(s0);
    const sA = at(s0, `${PREFIX} — changed on both sides (A)`);
    d6.A.save(sA);
    await applySave(d6.A, be, d6.bA, sA, s0.updatedAt, () => {});
    d6.B.save(at(d6.B.load(s0.id)!, `${PREFIX} — changed on both sides (B, offline)`)); // never went online
    const ev6: SyncEvent[] = [];
    await applySync(d6.B, be, d6.bB, (e) => ev6.push(e));
    const online6 = await liveNamed("changed on both sides");
    check("sync conflict: both versions online and on B, the copy named neutrally", online6.length === 2 && online6.some((x) => STAMP.test(x.name)) && [...d6.B.rows.values()].filter((x) => x.name.includes("changed on both sides")).length === 2, online6.map((x) => x.name).join(" | "));
    await applySync(d6.A, be, d6.bA, () => {});
    check("the other device (A) gets both versions too, under the same names", [...d6.A.rows.values()].filter((x) => x.name.includes("changed on both sides")).map((x) => x.name).sort().join() === online6.map((x) => x.name).sort().join());
    check("repeated syncs change nothing", (await applySync(d6.B, be, d6.bB, (e) => ev6.push(e))).length === 0 && (await applySync(d6.A, be, d6.bA, (e) => ev6.push(e))).length === 0 && ev6.length === 1);

    // 7. First sync with identical content: no copies.
    const i0 = fresh("identical on first sync");
    await be.putIf(i0, null);
    const E = device(), F = device(), ev7: SyncEvent[] = [];
    E.save({ ...i0 });
    F.save({ ...i0, updatedAt: tick() });
    await applySync(E, be, memoryBases(), (e) => ev7.push(e));
    await applySync(F, be, memoryBases(), (e) => ev7.push(e));
    check("first sync, identical content: no copies made", ev7.length === 0 && (await liveNamed("identical on first sync")).length === 1);

    // 8. Deleted on A; B (no unsynced edits) drops it; repeated syncs never bring it back.
    const del = fresh("deleted on A");
    const d8 = await twoDevices(del);
    await applyDelete(d8.A, be, d8.bA, d8.A.load(del.id)!, () => {});
    check("delete: hidden online (row kept, marked deleted)", !!(await be.get(del.id))?.deletedAt);
    const ev8: SyncEvent[] = [];
    await applySync(d8.B, be, d8.bB, (e) => ev8.push(e));
    check("delete reaches B: removed there, and B is told", !d8.B.load(del.id) && ev8[0]?.kind === "deleted-elsewhere" && ev8[0].recovered === null);
    for (let i = 0; i < 2; i++) { await applySync(d8.A, be, d8.bA, () => {}); await applySync(d8.B, be, d8.bB, () => {}); }
    check("repeated syncs on both: never uploaded or downloaded again", !d8.A.load(del.id) && !d8.B.load(del.id) && !!(await be.get(del.id))?.deletedAt && (await liveNamed("deleted on A")).length === 0);

    // 9. Deleted on A while B had offline edits: B's edits are recovered as a copy.
    const off = fresh("deleted while edited offline");
    const d9 = await twoDevices(off);
    const offEdit = at(d9.B.load(off.id)!, `${PREFIX} — deleted while edited offline (B's offline edits)`);
    d9.B.save(offEdit);
    await applyDelete(d9.A, be, d9.bA, d9.A.load(off.id)!, () => {});
    const ev9: SyncEvent[] = [];
    await applySync(d9.B, be, d9.bB, (e) => ev9.push(e));
    const rec9 = ev9[0]?.kind === "deleted-elsewhere" ? ev9[0].recovered : null;
    const rec9Online = rec9 ? await be.get(rec9.id) : null;
    check("offline edits recovered as '<name> (recovered after deletion · saved <time>)', here and online", !!rec9 && rec9.name.startsWith(`${offEdit.name} (recovered after deletion · saved `) && STAMP.test(rec9.name) && d9.B.load(rec9.id)?.name === rec9.name && rec9Online?.name === rec9.name && !rec9Online?.deletedAt, rec9?.name);
    check("the deleted product stays deleted (not revived under its id)", !d9.B.load(off.id) && !!(await be.get(off.id))?.deletedAt);
    await applySync(d9.A, be, d9.bA, () => {});
    check("A receives the recovered copy; repeated syncs stable", !!rec9 && d9.A.load(rec9.id)?.name === rec9.name && (await applySync(d9.B, be, d9.bB, (e) => ev9.push(e))).length === 0 && ev9.length === 1);

    // 10. Open on B and saved after A deleted it (the app's save path).
    const op = fresh("deleted while open elsewhere");
    const d10 = await twoDevices(op);
    await applyDelete(d10.A, be, d10.bA, d10.A.load(op.id)!, () => {});
    const opEdit = at(d10.B.load(op.id)!, `${PREFIX} — deleted while open elsewhere (B's new edits)`);
    d10.B.save(opEdit);
    const ev10: SyncEvent[] = [];
    await applySave(d10.B, be, d10.bB, opEdit, op.updatedAt, (e) => ev10.push(e));
    const rec10 = ev10[0]?.kind === "deleted-elsewhere" ? ev10[0].recovered : null;
    const op10 = await be.get(op.id);
    check("save after deletion elsewhere: never written back; edits recovered as a copy", !!rec10 && !!op10?.deletedAt && op10.name === op.name && (await be.get(rec10.id))?.name === rec10.name, rec10?.name);

    // 11. Deleted while offline: remembered, then finished by the next sync.
    const lo = fresh("deleted offline");
    const d11 = await twoDevices(lo);
    await applyDelete(d11.A, null, d11.bA, d11.A.load(lo.id)!, () => {});
    check("offline delete: gone here, still online, remembered as pending", !d11.A.load(lo.id) && !(await be.get(lo.id))?.deletedAt && d11.bA.pendingDeletions().some((x) => x.id === lo.id));
    await applySync(d11.A, be, d11.bA, () => {});
    check("next sync finishes it online and doesn't download it back", !d11.A.load(lo.id) && !!(await be.get(lo.id))?.deletedAt && d11.bA.pendingDeletions().length === 0);
    await applySync(d11.B, be, d11.bB, () => {});
    check("then B drops it too", !d11.B.load(lo.id));

    // 12. Deleted on A, but B saved newer edits first: kept, nothing lost.
    const nw = fresh("deleted but edited newer elsewhere");
    const d12 = await twoDevices(nw);
    const nwB = at(d12.B.load(nw.id)!, `${PREFIX} — deleted but edited newer elsewhere (B's newer edits)`);
    d12.B.save(nwB);
    await applySave(d12.B, be, d12.bB, nwB, nw.updatedAt, () => {});
    const ev12: SyncEvent[] = [];
    await applyDelete(d12.A, be, d12.bA, d12.A.load(nw.id)!, (e) => ev12.push(e));
    const nwNow = await be.get(nw.id);
    check("deleting an older version never hides newer edits from another device", !nwNow?.deletedAt && nwNow?.name === nwB.name && ev12[0]?.kind === "deletion-kept");
    await applySync(d12.A, be, d12.bA, () => {});
    check("…and it comes back to A with those edits", d12.A.load(nw.id)?.name === nwB.name);

    // 13. A deletion and a save racing on the server: the edits survive exactly once.
    for (const order of ["delete first", "save first"]) {
      const rc = fresh(`race ${order}`);
      const d13 = await twoDevices(rc);
      const rcEdit = at(d13.B.load(rc.id)!, `${PREFIX} — race ${order} (B's edits)`);
      d13.B.save(rcEdit);
      const delete13 = () => applyDelete(d13.A, be, d13.bA, d13.A.load(rc.id)!, () => {});
      const save13 = () => applySave(d13.B, be, d13.bB, rcEdit, rc.updatedAt, () => {});
      await (order === "delete first" ? Promise.all([delete13(), save13()]) : Promise.all([save13(), delete13()]));
      const survivors = await liveNamed(`race ${order} (B's edits)`);
      check(`delete/save race (${order}): B's edits survive exactly once`, survivors.length === 1, survivors.map((x) => x.name).join(" | "));
    }

    check("existing products untouched (same ids, save times, not deleted)", JSON.stringify(await realRows()) === JSON.stringify(before), `${before.length} existing`);
  } catch (e) {
    check("ran without errors", false, (e as Error).message ?? String(e));
  } finally {
    // Hide every test product (all named with the prefix); the rows are removed for good separately.
    for (const r of await be.list()) if (r.name.startsWith(PREFIX) && !r.deletedAt) await be.removeIf(r.id, "9999-12-31T00:00:00.000Z").catch(() => {});
    check("test products hidden afterwards", (await be.list()).filter((r) => r.name.startsWith(PREFIX) && !r.deletedAt).length === 0);
  }
  console.table(results);
  return results;
}

/**
 * LIVE CHECK of online saving against the real Supabase table — run by hand,
 * never by `npm test`. Open the dev app, sign in, then in the browser console:
 *
 *   const m = await import("/tests/live/cloud-live.ts"); await m.run();
 *
 * It uses the app's own backend (same signed-in client), sync and save code,
 * with two or three simulated devices (each its own local store and its own
 * record of agreed versions). It only creates products named
 * "Phase 4 verify …" and only ever writes to those; at the end they are
 * removed (hidden online, like any removed product). Existing products are
 * read during a sync (into the simulated devices' memory) and never written.
 */
import { canonicalJson, supabaseBackend, saveOnline, type CloudBackend } from "../../src/persistence/cloud";
import { applySave, applySync } from "../../src/app/useCloud";
import { memoryBases } from "../../src/persistence/sync";
import { createProject } from "../../src/presets/products/projectFactory";
import type { ProjectStore } from "../../src/persistence/projectStore";
import type { ProductProject } from "../../src/types/project";

type Result = { name: string; ok: boolean; detail: string };
const PREFIX = "Phase 4 verify";
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
  const created = new Set<string>();
  const check = (name: string, ok: boolean, detail = "") => { results.push({ name, ok, detail }); console[ok ? "log" : "error"](`${ok ? "PASS" : "FAIL"} — ${name}${detail ? ` (${detail})` : ""}`); };
  const fresh = (label: string) => { const p = { ...createProject("journal", { name: `${PREFIX} — ${label}` }), updatedAt: tick() }; created.add(p.id); return p; };
  const leftovers = new Set((await be.list()).filter((r) => r.name.startsWith(PREFIX)).map((r) => r.id)); // from an earlier, interrupted run
  const before = (await be.list()).filter((r) => !r.name.startsWith(PREFIX)).map((r) => `${r.id}@${r.updatedAt}`).sort();

  try {
    // 1. Save, reload.
    const p = fresh("save and reload");
    check("new product saved online", await be.putIf(p, null));
    const got = await be.get(p.id);
    check("reloaded copy is identical (content and save time)", !!got && got.updatedAt === p.updatedAt && canonicalJson(got.data) === canonicalJson(p), got?.updatedAt);
    check("adding the same product again is refused (no second copy, nothing overwritten)", !(await be.putIf(at(p, "should not land"), null)) && (await be.get(p.id))?.name === p.name);

    // 2. Edit from the version it started from.
    const p1 = at(p, `${PREFIX} — save and reload (edited)`);
    const s1 = await saveOnline(be, p1, p.updatedAt);
    check("edit saved over the version it started from", s1.status === "saved" && (await be.get(p.id))?.name === p1.name);

    // 3. A conditional save from a stale version is rejected and changes nothing.
    const stale = at(p, "STALE — must not land");
    const accepted = await be.putIf(stale, p.updatedAt);
    const after = await be.get(p.id);
    check("stale conditional save rejected; online copy untouched", !accepted && after?.name === p1.name && after?.updatedAt === p1.updatedAt, `online: ${after?.name}`);

    // 4. Two devices save at the same moment from the same version.
    const q = fresh("simultaneous saves");
    await be.putIf(q, null);
    const [ra, rb] = await Promise.all([saveOnline(be, at(q, `${PREFIX} — simultaneous (phone)`), q.updatedAt), saveOnline(be, at(q, `${PREFIX} — simultaneous (laptop)`), q.updatedAt)]);
    const qNow = await be.get(q.id);
    const statuses = [ra.status, rb.status].sort().join(",");
    const loser = [ra, rb].find((r) => r.status === "conflict");
    check("simultaneous saves: exactly one saved, the other told", statuses === "conflict,saved", statuses);
    check("the one told is shown the version that won", !!loser && loser.status === "conflict" && loser.newer.name === qNow?.name, qNow?.name);

    // 4b. Ten conditional writes racing from one version: exactly one lands.
    const base = qNow!.updatedAt;
    const racers = Array.from({ length: 10 }, (_, i) => at(q, `${PREFIX} — racer ${i}`));
    const wins = await Promise.all(racers.map((r) => be.putIf(r, base)));
    const landed = await be.get(q.id);
    const winner = racers[wins.indexOf(true)];
    check("10 racing conditional writes: exactly one accepted, and it is the one online", wins.filter(Boolean).length === 1 && landed?.name === winner?.name, `${wins.filter(Boolean).length} accepted; online: ${landed?.name}`);

    // 5. Two devices edit the same product; the second saves after the first (the app's save path).
    const r0 = fresh("edited on two devices");
    const A = device(), B = device();
    const basesA = memoryBases(), basesB = memoryBases();
    A.save(r0);
    await applySave(A, be, basesA, r0, null, () => {});
    await applySync(B, be, basesB, () => {}); // B downloads it
    const kept: string[] = [];
    const rA = at(r0, `${PREFIX} — edited on two devices (A's edits)`);
    A.save(rA);
    await applySave(A, be, basesA, rA, r0.updatedAt, () => {});
    const rB = at(B.load(r0.id)!, `${PREFIX} — edited on two devices (B's edits)`);
    B.save(rB);
    await applySave(B, be, basesB, rB, r0.updatedAt, (_n, name) => kept.push(name));
    const online5 = (await be.list()).filter((x) => x.name.includes("edited on two devices") && !leftovers.has(x.id));
    online5.forEach((x) => created.add(x.id));
    check("save conflict: A's version stays the product online", (await be.get(r0.id))?.name === rA.name);
    check("save conflict: B's edits kept as a labeled copy, online and on B", kept[0] === `${rB.name} (version from this device)` && online5.some((x) => x.name === kept[0]) && [...B.rows.values()].some((x) => x.name === kept[0]), kept[0]);
    check("save conflict: B now has A's version as the product", B.load(r0.id)?.name === rA.name);

    // 6. Both devices edited while apart; the second one SYNCS (the app's start-up / sign-in path).
    const s0 = fresh("changed on both sides");
    const C = device(), D = device();
    const basesC = memoryBases(), basesD = memoryBases();
    C.save(s0);
    await applySync(C, be, basesC, () => {});
    await applySync(D, be, basesD, () => {});
    const sC = at(s0, `${PREFIX} — changed on both sides (C)`);
    C.save(sC);
    await applySave(C, be, basesC, sC, s0.updatedAt, () => {});
    const sD = at(D.load(s0.id)!, `${PREFIX} — changed on both sides (D, offline)`);
    D.save(sD); // D was offline: its edit never went online
    const keptD: string[] = [];
    await applySync(D, be, basesD, (_n, name) => keptD.push(name));
    const online6 = (await be.list()).filter((x) => x.name.includes("changed on both sides") && !leftovers.has(x.id));
    online6.forEach((x) => created.add(x.id));
    check("sync conflict: both versions online, each clearly named", online6.length === 2 && online6.some((x) => x.name === sD.name) && online6.some((x) => x.name === `${sC.name} (version from another device)`), online6.map((x) => x.name).join(" | "));
    check("sync conflict: device D has both too", [...D.rows.values()].filter((x) => x.name.includes("changed on both sides")).length === 2, keptD.join(" | "));
    const again = await applySync(D, be, basesD, () => keptD.push("unexpected"));
    check("a second sync changes nothing", again.filter((x) => x.name.startsWith(PREFIX)).length === 0 && keptD.length === 1);

    // 7. First sync on a device that never synced: identical content is not duplicated.
    const i0 = fresh("identical on first sync");
    await be.putIf(i0, null);
    const E = device();
    E.save({ ...i0 }); // same version
    const iLater = { ...i0, updatedAt: tick() }; // same content, later save time only
    const F = device();
    F.save(iLater);
    const keptEF: string[] = [];
    await applySync(E, be, memoryBases(), (_n, n) => keptEF.push(n));
    await applySync(F, be, memoryBases(), (_n, n) => keptEF.push(n));
    const online7 = (await be.list()).filter((x) => x.name.includes("identical on first sync") && !leftovers.has(x.id));
    check("first sync, identical content: no copies made", keptEF.length === 0 && online7.length === 1 && [...F.rows.values()].filter((x) => x.name.includes("identical on first sync") && !leftovers.has(x.id)).length === 1, `${online7.length} online; copies: ${keptEF.join(" | ") || "none"}; on F: ${[...F.rows.values()].filter((x) => x.name.includes("identical on first sync") && !leftovers.has(x.id)).map((x) => x.name).join(" | ")}`);
    check("first sync, identical content (later save time): online takes the later one", online7[0]?.updatedAt === iLater.updatedAt);

    // 8. Removed on one device, still edited on another: brought back, not stuck.
    const d0 = fresh("removed elsewhere");
    await be.putIf(d0, null);
    await be.remove(d0.id);
    const dEdit = at(d0, `${PREFIX} — removed elsewhere (still edited here)`);
    const s8 = await saveOnline(be, dEdit, d0.updatedAt);
    check("edit to a product removed on another device is saved (brought back)", s8.status === "saved" && (await be.get(d0.id))?.name === dEdit.name);

    // Nothing else was touched.
    const afterAll = (await be.list()).filter((r) => !r.name.startsWith(PREFIX)).map((r) => `${r.id}@${r.updatedAt}`).sort();
    check("existing products untouched (same ids and save times)", JSON.stringify(afterAll) === JSON.stringify(before), `${before.length} existing`);
  } catch (e) {
    check("ran without errors", false, (e as Error).message ?? String(e));
  } finally {
    // Everything this check made, including copies made by syncs (all named with the prefix).
    for (const r of await be.list()) if (r.name.startsWith(PREFIX)) created.add(r.id);
    for (const id of created) await be.remove(id).catch(() => {});
    const left = (await be.list()).filter((r) => r.name.startsWith(PREFIX));
    check("test products removed afterwards", left.length === 0, `${created.size} created`);
  }
  console.table(results);
  return results;
}

/** Ids of this check's products (removed rows included) — for the report. */
export const TEST_PREFIX = PREFIX;

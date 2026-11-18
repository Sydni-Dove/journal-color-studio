/**
 * Online saving for Cover Studio and Coloring Book (persistence/itemsSync.ts), against a fake online store:
 * new work goes up; work from another device comes down; both changed keeps both (nothing lost); deletions travel;
 * an item open in a screen is never replaced underneath; pictures go up once and come down to a new device;
 * existing Cover Studio work on a device moves online on first sync; and a coloring book continued from Cover
 * Studio carries everything entered there.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const files = new Map<string, Blob>();
vi.mock("../src/engines/artwork/store", () => ({
  getArtworkFile: async (id: string) => files.get(id) ?? null,
  putArtworkFile: async (id: string, b: Blob) => (files.set(id, b), true),
}));

import { artworkIds, browserItems, planItems, syncItems, type Item, type ItemsBackend } from "../src/persistence/itemsSync";
import { holdItem, itemBase } from "../src/persistence/itemBases";
import { nextWaitMs } from "../src/app/useItemsSync";
import { SAVE_UNREACHABLE, SIGN_IN_UNREACHABLE, WRONG_PASSWORD, saveErrorMessage, signInErrorMessage, unreachable } from "../src/persistence/saveErrors";
import { loadDraft, localCoverStore, newCollection, saveDraft } from "../src/persistence/coverStore";
import { localBookStore } from "../src/persistence/coloringBookStore";
import { newBrief, type CoverBrief } from "../src/engines/cover/brief";
import { bookFromCoverBrief, newBook } from "../src/engines/coloringBook/book";
import { GRACIOUS_CAST } from "./fixtures/graciousKids";

const PIC = "a".repeat(64), PIC2 = "b".repeat(64);

beforeEach(() => {
  const m = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; },
  });
  vi.stubGlobal("window", { dispatchEvent: () => true });
  files.clear();
});

/** An online store in memory, with the same compare-and-swap rules as the real table. */
function fakeOnline(init: Item[] = []) {
  const rows = new Map(init.map((i) => [`${i.kind}:${i.id}`, structuredClone(i)]));
  const pics = new Map<string, Blob>();
  const calls = { gets: 0 };
  const backend: ItemsBackend = {
    // As the real table: the list carries names and versions only, never the books themselves.
    async list() { return [...rows.values()].map((r) => ({ ...structuredClone(r), data: undefined })); },
    async get(kind, id) { calls.gets++; return structuredClone(rows.get(`${kind}:${id}`) ?? null); },
    async putIf(item, expected) {
      const cur = rows.get(`${item.kind}:${item.id}`);
      if (expected === null ? cur : !cur || cur.updatedAt !== expected || cur.deletedAt) return false;
      rows.set(`${item.kind}:${item.id}`, structuredClone({ ...item, deletedAt: null }));
      return true;
    },
    async removeIf(kind, id, upTo) {
      const cur = rows.get(`${kind}:${id}`);
      if (!cur || cur.deletedAt) return true;
      if (cur.updatedAt > upTo) return false;
      cur.deletedAt = new Date().toISOString();
      return true;
    },
    async hasArtwork(ids) { return new Set(ids.filter((i) => pics.has(i))); },
    async putArtwork(id, b) { pics.set(id, b); },
    async getArtwork(id) { return pics.get(id) ?? null; },
  };
  return { backend, rows, pics, calls };
}

const gracious = (over: Partial<CoverBrief> = {}) => newBrief({ category: "character", collection: "Gracious Kids", title: "She Is Gracious", audience: "girls 4–8", cast: GRACIOUS_CAST.map((c) => ({ ...c, refId: PIC })), scenes: [{ id: "s1", title: "The Brave First Step", text: "Jenny steps in.", scriptureRef: "Proverbs 31:26", verseText: "She speaks with wisdom, and faithful instruction is on her tongue.", illustrationId: PIC2 }], ...over });

describe("first sync: existing work on this device moves online, nothing lost", () => {
  it("the Cover Studio draft, saved collections and coloring books go up, with their pictures", async () => {
    saveDraft({ brief: gracious(), items: [], direction: 0, collectionId: null });
    localCoverStore.save(newCollection("Gracious Kids", gracious(), [], 0));
    localBookStore.save(newBook("b1", { name: "Book one" }));
    files.set(PIC, new Blob(["ref"], { type: "image/png" }));
    files.set(PIC2, new Blob(["art"], { type: "image/png" }));
    const online = fakeOnline();
    const r = await syncItems(online.backend);
    expect(r.uploaded).toBe(3);
    expect([...online.rows.keys()].sort()).toEqual(["coloring-book:b1", "cover-collection:" + localCoverStore.list()[0].id, "cover-draft:draft"].sort());
    expect(online.pics.has(PIC) && online.pics.has(PIC2)).toBe(true);
    // Local copies are untouched.
    expect(loadDraft()!.brief.title).toBe("She Is Gracious");
    // Nothing more to send the second time.
    expect((await syncItems(online.backend)).uploaded).toBe(0);
  });
});

describe("a new device or preview address gets everything, pictures included", () => {
  it("downloads the draft, collections and books and their pictures", async () => {
    const draft = { brief: gracious(), items: [], direction: 0, collectionId: null, updatedAt: "2026-11-17T10:00:00.000Z" };
    const online = fakeOnline([
      { kind: "cover-draft", id: "draft", name: "Gracious Kids", updatedAt: draft.updatedAt, data: draft },
      { kind: "coloring-book", id: "b9", name: "Book nine", updatedAt: "2026-11-17T09:00:00.000Z", data: newBook("b9", { name: "Book nine", updatedAt: "2026-11-17T09:00:00.000Z" }) },
    ]);
    online.pics.set(PIC, new Blob(["ref"]));
    online.pics.set(PIC2, new Blob(["art"]));
    const r = await syncItems(online.backend);
    expect(r.downloaded).toBe(2);
    expect(loadDraft()!.brief.cast.map((c) => c.name)).toEqual(["Jenny Ballerina", "Renae Ballerina", "Robby Ballerina"]);
    expect(localBookStore.load("b9")!.name).toBe("Book nine");
    expect(files.has(PIC) && files.has(PIC2)).toBe(true);
  });
});

describe("merging never loses work", () => {
  const item = (updatedAt: string, title: string): Item => ({ kind: "cover-collection", id: "c1", name: "C", updatedAt, data: { ...newCollection("C", gracious({ title }), [], 0), id: "c1", updatedAt } });
  it("changed only online → here; changed only here → online", () => {
    const base = () => "2026-01-01T00:00:00.000Z";
    expect(planItems([item(base(), "A")], [item("2026-02-01T00:00:00.000Z", "B")], base).toLocal).toHaveLength(1);
    expect(planItems([item("2026-02-01T00:00:00.000Z", "B")], [item(base(), "A")], base).toCloud).toHaveLength(1);
  });
  it("changed on both sides → the newer stays, the older is kept as a copy", async () => {
    localCoverStore.save(item("2026-03-01T00:00:00.000Z", "Here").data as never);
    itemBase.set("cover-collection", "c1", "2026-01-01T00:00:00.000Z");
    const online = fakeOnline([item("2026-02-01T00:00:00.000Z", "Online")]);
    const r = await syncItems(online.backend);
    expect(r.copies).toBe(1);
    const titles = localCoverStore.list().map((s) => localCoverStore.load(s.id)!.brief.title).sort();
    expect(titles).toEqual(["Here", "Online"]);
    expect((online.rows.get("cover-collection:c1")!.data as { brief: CoverBrief }).brief.title).toBe("Here");
  });
  it("an item open in a screen is not replaced underneath; it is next time", async () => {
    localBookStore.save(newBook("b1", { name: "Old", updatedAt: "2026-01-01T00:00:00.000Z" }));
    itemBase.set("coloring-book", "b1", "2026-01-01T00:00:00.000Z");
    const online = fakeOnline([{ kind: "coloring-book", id: "b1", name: "New", updatedAt: "2026-02-01T00:00:00.000Z", data: newBook("b1", { name: "New", updatedAt: "2026-02-01T00:00:00.000Z" }) }]);
    const release = holdItem("coloring-book", "b1");
    expect((await syncItems(online.backend)).deferred).toBe(1);
    expect(localBookStore.load("b1")!.name).toBe("Old");
    release();
    await syncItems(online.backend);
    expect(localBookStore.load("b1")!.name).toBe("New");
  });
  it("deleted here → hidden online, never downloaded again; deleted elsewhere → removed here", async () => {
    localBookStore.save(newBook("b1", { name: "One", updatedAt: "2026-01-01T00:00:00.000Z" }));
    const online = fakeOnline();
    await syncItems(online.backend);
    localBookStore.remove("b1");
    await syncItems(online.backend);
    expect(online.rows.get("coloring-book:b1")!.deletedAt).toBeTruthy();
    expect(localBookStore.load("b1")).toBeNull();
    // Another device deletes a book this device has unchanged.
    localBookStore.save(newBook("b2", { name: "Two", updatedAt: "2026-01-01T00:00:00.000Z" }));
    await syncItems(online.backend);
    online.rows.get("coloring-book:b2")!.deletedAt = "2026-02-01T00:00:00.000Z";
    await syncItems(online.backend);
    expect(localBookStore.load("b2")).toBeNull();
  });
});

describe("pictures", () => {
  it("finds every picture an item uses", () => {
    const b = newBook("x", { cover: { mode: "with-title", backText: "", front: { id: "c".repeat(64), name: "cover.png", w: 1, h: 1 } } });
    expect(artworkIds({ kind: "cover-draft", id: "draft", name: "", updatedAt: "", data: { brief: gracious() } }).sort()).toEqual([PIC, PIC2]);
    expect(artworkIds({ kind: "coloring-book", id: "x", name: "", updatedAt: "", data: b })).toEqual(["c".repeat(64)]);
  });
  it("each picture is sent once", async () => {
    saveDraft({ brief: gracious(), items: [], direction: 0, collectionId: null });
    files.set(PIC, new Blob(["ref"]));
    const online = fakeOnline();
    const put = vi.spyOn(online.backend, "putArtwork");
    await syncItems(online.backend);
    await syncItems(online.backend);
    expect(put).toHaveBeenCalledTimes(1);
  });
});

describe("continuing a Cover Studio coloring book carries everything", () => {
  it("title, audience, characters with pictures, scenes, Scripture choice, verified wording, style, binding", () => {
    const brief = gracious({ verseVerified: true, lineThickness: "Thick", complexity: "Simple", binding: "Spiral / coil", blankBacks: false, illustrationStyle: "Modern cartoon line art" });
    const b = bookFromCoverBrief("bk", brief, "2026-11-17T00:00:00.000Z");
    expect(b.name).toBe("She Is Gracious");
    expect(b.brief.audience).toBe("girls 4–8");
    expect(b.brief.cast.map((c) => [c.name, c.refId])).toEqual(GRACIOUS_CAST.map((c) => [c.name, PIC]));
    expect(b.brief.scenes[0]).toMatchObject({ title: "The Brave First Step", scriptureRef: "Proverbs 31:26", illustrationId: PIC2, verseApproved: "2026-11-17T00:00:00.000Z" });
    expect(b).toMatchObject({ faithBased: true, printFormat: "spiral", sides: "double", difficulty: "easy" });
    expect(b.content.scripture).toBe("full");
    expect(b.brief.illustrationStyle).toBe("Modern cartoon line art");
  });
  it("unverified wording is not approved for you; references-only and no-Scripture choices carry", () => {
    expect(bookFromCoverBrief("bk", gracious()).brief.scenes[0].verseApproved).toBeUndefined();
    expect(bookFromCoverBrief("bk", { ...gracious(), scriptureShow: "reference" } as CoverBrief).content.scripture).toBe("reference");
    expect(bookFromCoverBrief("bk", { ...gracious(), scriptureShow: "none" } as CoverBrief).faithBased).toBe(false);
  });
  it("browserItems lists a coloring book continued from Cover Studio like any other", () => {
    localBookStore.save(bookFromCoverBrief("bk", gracious()));
    expect(browserItems.list().map((i) => i.kind)).toContain("coloring-book");
  });
});

describe("a routine check stays small, however many books are saved", () => {
  it("nothing changed: no book is downloaded, only names and versions", async () => {
    localBookStore.save({ ...newBook("b1", { name: "Ballerinas" }), updatedAt: "2026-11-18T10:00:00.000Z" });
    const online = fakeOnline();
    await syncItems(online.backend);
    online.calls.gets = 0;
    await syncItems(online.backend);
    await syncItems(online.backend);
    expect(online.calls.gets).toBe(0);
  });
  it("a book changed on another device is the only one downloaded", async () => {
    localBookStore.save({ ...newBook("b1", { name: "One" }), updatedAt: "2026-11-18T10:00:00.000Z" });
    localBookStore.save({ ...newBook("b2", { name: "Two" }), updatedAt: "2026-11-18T10:00:00.000Z" });
    const online = fakeOnline();
    await syncItems(online.backend);
    const row = online.rows.get("coloring-book:b2")!;
    online.rows.set("coloring-book:b2", { ...row, name: "Two, renamed", updatedAt: "2026-11-18T11:00:00.000Z", data: { ...(row.data as object), name: "Two, renamed", updatedAt: "2026-11-18T11:00:00.000Z" } });
    online.calls.gets = 0;
    await syncItems(online.backend);
    expect(online.calls.gets).toBe(1);
    expect(localBookStore.load("b2")!.name).toBe("Two, renamed");
  });
  it("checks every 5 minutes, and after failures waits 10, 20, then 30 minutes", () => {
    expect([0, 1, 2, 3, 4, 9].map((n) => nextWaitMs(n) / 60_000)).toEqual([5, 5, 10, 20, 30, 30]);
  });
});

describe("when the saving server can't be reached, it says so plainly", () => {
  const gateway = { name: "AuthRetryableFetchError", message: "", status: 504 };
  it("a timed-out sign-in is never called a wrong password", () => {
    expect(signInErrorMessage(gateway)).toBe(SIGN_IN_UNREACHABLE);
    expect(signInErrorMessage(new TypeError("Failed to fetch"))).toBe(SIGN_IN_UNREACHABLE);
    expect(signInErrorMessage({ name: "TimeoutError", message: "signal timed out" })).toBe(SIGN_IN_UNREACHABLE);
    expect(SIGN_IN_UNREACHABLE).toMatch(/password wasn't checked/);
    expect(signInErrorMessage({ name: "AuthApiError", message: "Invalid login credentials", status: 400 })).toBe(WRONG_PASSWORD);
  });
  it("a failed save says the work isn't saved online yet, and is safe here", () => {
    for (const e of [gateway, { code: "", message: "upstream request timeout" }, { message: "Unexpected token '<', \"<html>\" is not valid JSON" }, { status: 522 }]) {
      expect(unreachable(e)).toBe(true);
      expect(saveErrorMessage(e)).toBe(SAVE_UNREACHABLE);
    }
    expect(SAVE_UNREACHABLE).toMatch(/Couldn't reach the saving server, so your work isn't saved online yet/);
    expect(unreachable({ code: "42501", message: "new row violates row-level security policy" })).toBe(false);
  });
});

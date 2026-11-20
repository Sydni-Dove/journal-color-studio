/**
 * Cover Studio and Coloring Book saved online, end to end in two real browsers (two devices, or two preview
 * addresses) signed in to the same account, against an in-memory stand-in for the account's online storage
 * (the same requests the app makes to Supabase): work entered on one appears on the other — characters, scenes,
 * reference pictures — and continues as a coloring book with nothing to retype.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type BrowserContext, type Page, type Route } from "playwright-core";
import { preview, type PreviewServer } from "vite";

let server: PreviewServer;
let browser: Browser;
beforeAll(async () => {
  server = await preview({ preview: { port: 0, host: "127.0.0.1" }, logLevel: "silent" });
  browser = await chromium.launch({ executablePath: (import.meta.env.CHROMIUM_PATH as string | undefined) || undefined });
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await new Promise<void>((r) => server?.httpServer.close(() => r()));
});

const USER = "11111111-2222-3333-4444-555555555555";
type Row = { kind: string; id: string; name: string; data: unknown; updated_at: string; deleted_at: string | null };

/** The account's online storage, shared by both browsers. */
function onlineAccount() {
  const rows = new Map<string, Row>();
  const pics = new Map<string, Buffer>();
  const filters = (url: URL) => {
    const f: Record<string, string> = {};
    url.searchParams.forEach((v, k) => { if (!["select", "on_conflict"].includes(k)) f[k] = v; });
    return f;
  };
  const matches = (r: Row, f: Record<string, string>) =>
    Object.entries(f).every(([k, v]) => {
      const val = (r as Record<string, unknown>)[k];
      if (v.startsWith("eq.")) return String(val) === v.slice(3) || (k === "updated_at" && new Date(String(val)).getTime() === new Date(v.slice(3)).getTime());
      if (v === "is.null") return val === null;
      if (v.startsWith("lte.")) return new Date(String(val)) <= new Date(v.slice(4));
      return true;
    });
  async function handleItems(route: Route) {
    const req = route.request();
    const url = new URL(req.url());
    const f = filters(url);
    const json = (status: number, body: unknown) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (req.method() === "GET") {
      const list = [...rows.values()].filter((r) => matches(r, f));
      return req.headers()["accept"]?.includes("vnd.pgrst.object") ? json(200, list[0] ?? null) : json(200, list);
    }
    if (req.method() === "POST") {
      const body = req.postDataJSON() as Row;
      const key = `${body.kind}:${body.id}`;
      if (rows.has(key)) return json(409, { code: "23505", message: "duplicate key" });
      rows.set(key, { ...body, deleted_at: null });
      return json(201, []);
    }
    if (req.method() === "PATCH") {
      const patch = req.postDataJSON() as Partial<Row>;
      const hit = [...rows.values()].filter((r) => matches(r, f));
      for (const r of hit) Object.assign(r, patch);
      return json(200, hit.map((r) => ({ id: r.id })));
    }
    return json(200, []);
  }
  async function handleStorage(route: Route) {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname.includes("/object/list/")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([...pics.keys()].map((name) => ({ name }))) });
    }
    const id = url.pathname.split("/").pop()!;
    if (req.method() === "POST" || req.method() === "PUT") {
      // The app sends the file as a form upload (as Supabase Storage expects): keep the file part, as the server does.
      const raw = req.postDataBuffer() ?? Buffer.alloc(0);
      const type = req.headers()["content-type"] ?? "";
      const boundary = /boundary=(.+)$/.exec(type)?.[1];
      let file = raw;
      if (boundary) {
        const parts = raw.toString("latin1").split(`--${boundary}`);
        const part = parts.find((p) => /content-type:\s*image\//i.test(p)) ?? parts.find((p) => /filename=/i.test(p));
        if (part) {
          const body = part.slice(part.indexOf("\r\n\r\n") + 4).replace(/\r\n$/, "");
          file = Buffer.from(body, "latin1");
        }
      }
      pics.set(id, file);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ Key: `product-studio-artwork/${USER}/${id}` }) });
    }
    const b = pics.get(id);
    return b ? route.fulfill({ status: 200, contentType: "image/png", body: b }) : route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ message: "not found" }) });
  }
  return { rows, pics, handleItems, handleStorage };
}

async function device(account: ReturnType<typeof onlineAccount>): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort().catch(() => {}));
  await ctx.route("**/rest/v1/product_studio_items**", account.handleItems);
  await ctx.route("**/rest/v1/product_studio_projects**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.route("**/storage/v1/**", account.handleStorage);
  await ctx.route("**/auth/v1/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: USER, email: "maker@example.com" }) }));
  const page = await ctx.newPage();
  await page.goto(server.resolvedUrls!.local[0]);
  // Signed in to the account (a session as the app keeps it).
  await page.evaluate((user) => {
    localStorage.clear();
    const exp = Math.floor(Date.now() / 1000) + 3600;
    localStorage.setItem("dove-product-studio:auth", JSON.stringify({ access_token: "test-token", refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: exp, user: { id: user, email: "maker@example.com", aud: "authenticated", role: "authenticated" } }));
  }, USER);
  await page.reload();
  return { ctx, page };
}

/** A small line-art PNG made in the page (a reference picture). */
async function png(page: Page) {
  const b64 = await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 300;
    c.height = 400;
    const x = c.getContext("2d")!;
    x.fillStyle = "#fff";
    x.fillRect(0, 0, 300, 400);
    x.strokeStyle = "#000";
    x.lineWidth = 4;
    x.beginPath();
    x.arc(150, 120, 60, 0, 7);
    x.stroke();
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/png"));
    let s = "";
    for (const v of new Uint8Array(await blob.arrayBuffer())) s += String.fromCharCode(v);
    return btoa(s);
  });
  return { name: "jenny-reference.png", mimeType: "image/png", buffer: Buffer.from(b64, "base64") };
}

describe("Cover Studio and Coloring Book online", () => {
  it("work entered on one device appears on another, pictures included, and continues as a coloring book with nothing to retype", async () => {
    const account = onlineAccount();
    // Device A: a Cover Studio coloring book with a character and her reference picture, and a scene.
    const a = await device(account);
    await a.page.getByRole("button", { name: "Cover Studio", exact: true }).click();
    await a.page.getByRole("tab", { name: /Children’s Character/ }).click();
    await a.page.getByLabel("Collection name").fill("Gracious Kids — Ballet Coloring Book");
    await a.page.locator(".steps__dot").nth(2).click();
    await a.page.getByRole("button", { name: "Add a character" }).click();
    await a.page.getByLabel("Character name").first().fill("Jenny Ballerina");
    await a.page.getByLabel("Jenny Ballerina: hair texture and hairstyle").fill("long cornrow braids");
    await a.page.getByTestId("ref-Jenny Ballerina").setInputFiles(await png(a.page));
    await a.page.locator('[data-cast="Jenny Ballerina"]').getByText("jenny-reference.png").waitFor();
    await a.page.locator(".steps__dot").nth(3).click();
    await a.page.getByLabel("Scenes text").fill("1. The Brave First Step\nJenny steps into the studio.\n\n2. Warm-up\nThe girls stretch.");
    await a.page.getByRole("button", { name: "Split into scenes" }).click();
    await expect.poll(async () => (await a.page.getByTestId("cover-saved").textContent()) ?? "").toBe("Saved online");
    // It reaches the account: the draft, and the picture.
    await expect.poll(() => [...account.rows.keys()].includes("cover-draft:draft"), { timeout: 15_000 }).toBe(true);
    await expect.poll(() => account.pics.size, { timeout: 15_000 }).toBe(1);

    // Device B: a fresh browser (another device, or a preview address) — signed in, nothing on it yet.
    const b = await device(account);
    await b.page.locator('[data-create="coloring-book"]').click();
    await b.page.getByTestId("from-cover-0").waitFor({ timeout: 15_000 });
    await b.page.getByTestId("from-cover-0").click();
    // Everything came across: the title, the character with her picture, the scenes.
    await b.page.locator(".steps__dot").nth(0).click();
    await expect(b.page.getByTestId("book-title").inputValue()).resolves.toBe("Gracious Kids — Ballet Coloring Book");
    await b.page.locator(".steps__dot").nth(1).click();
    await b.page.locator('[data-cast="Jenny Ballerina"]').waitFor();
    await expect(b.page.locator('[data-cast="Jenny Ballerina"] img').count()).resolves.toBe(1);
    await expect.poll(() => b.page.locator('[data-cast="Jenny Ballerina"] img').evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)).toBe(300);
    await b.page.locator(".steps__dot").nth(2).click();
    await expect(b.page.locator(".book-page-card").count()).resolves.toBe(2);
    await expect(b.page.locator('[data-scene="1"]').textContent()).resolves.toContain("The Brave First Step");
    // The artwork instructions are ready without retyping.
    await b.page.locator('[data-scene="1"] .book-page-card__open').click();
    await b.page.getByRole("button", { name: "Show artwork instructions" }).click();
    await expect(b.page.getByTestId("artwork-instructions").textContent()).resolves.toContain("Jenny Ballerina");
    // The new coloring book goes online too.
    await expect.poll(() => [...account.rows.keys()].some((k) => k.startsWith("coloring-book:")), { timeout: 15_000 }).toBe(true);
    await a.ctx.close();
    await b.ctx.close();
  }, 120_000);

  it("Cover Studio's own button continues the draft as a coloring book", async () => {
    const account = onlineAccount();
    const a = await device(account);
    await a.page.getByRole("button", { name: "Cover Studio", exact: true }).click();
    await a.page.getByRole("tab", { name: /Children’s Character/ }).click();
    await a.page.getByLabel("Collection name").fill("Garden Friends");
    await a.page.getByTestId("continue-as-book").click();
    await a.page.getByTestId("coloring-book").waitFor();
    await expect(a.page.getByTestId("book-title").inputValue()).resolves.toBe("Garden Friends");
    await a.ctx.close();
  }, 60_000);

  it("signed out, nothing is sent anywhere and work stays on the device", async () => {
    const ctx = await browser.newContext();
    let sent = 0;
    await ctx.route("**/rest/v1/product_studio_items**", (r) => { sent++; return r.fulfill({ status: 200, contentType: "application/json", body: "[]" }); });
    await ctx.route("**/rest/v1/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    const page = await ctx.newPage();
    await page.goto(server.resolvedUrls!.local[0]);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole("button", { name: "Cover Studio", exact: true }).click();
    await page.getByLabel("Collection name").fill("Offline work");
    await expect(page.getByTestId("cover-saved").textContent()).resolves.toMatch(/sign in to save online/);
    await page.waitForTimeout(2500);
    expect(sent).toBe(0);
    await ctx.close();
  }, 60_000);

  it("one light check every 3 minutes, none while hidden or idle, one right away on return; book data only when it changed", async () => {
    const account = onlineAccount();
    account.rows.set("coloring-book:b1", { kind: "coloring-book", id: "b1", name: "Gracious Ballerinas", data: { schemaVersion: 1, id: "b1", name: "Gracious Ballerinas", updatedAt: "2026-11-18T10:00:00.000Z" }, updated_at: "2026-11-18T10:00:00.000Z", deleted_at: null });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort().catch(() => {}));
    await ctx.route("**/rest/v1/product_studio_items**", account.handleItems);
    await ctx.route("**/rest/v1/product_studio_projects**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    await ctx.route("**/storage/v1/**", account.handleStorage);
    await ctx.route("**/auth/v1/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: USER, email: "maker@example.com" }) }));
    const page = await ctx.newPage();
    const gets: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "GET" && r.url().includes("/rest/v1/product_studio_items")) gets.push(new URL(r.url()).searchParams.get("select") ?? "");
    });
    await page.clock.install({ time: new Date("2026-11-19T12:00:00Z") });
    await page.goto(server.resolvedUrls!.local[0]);
    await page.evaluate((user) => {
      localStorage.clear();
      const exp = Math.floor(Date.now() / 1000) + 36000;
      localStorage.setItem("dove-product-studio:auth", JSON.stringify({ access_token: "test-token", refresh_token: "r", token_type: "bearer", expires_in: 36000, expires_at: exp, user: { id: user, email: "maker@example.com", aud: "authenticated", role: "authenticated" } }));
    }, USER);
    await page.reload();
    const lists = () => gets.filter((g) => g === "kind,id,name,updated_at,deleted_at").length;
    // Start-up: one light list; the book is new here, so its data is fetched once.
    await expect.poll(lists).toBe(1);
    await expect.poll(() => gets.filter((g) => g.includes("data")).length).toBe(1);
    const settle = async (ms: number) => { await page.clock.runFor(ms); await page.waitForTimeout(150); };
    // In view and in use: one light check per 3 minutes, and the book's data is not fetched again (unchanged).
    await page.mouse.move(10, 10);
    await settle(179_000);
    expect(lists()).toBe(1);
    await page.mouse.move(20, 20);
    await settle(2_000);
    expect(lists()).toBe(2);
    expect(gets.filter((g) => g.includes("data")).length).toBe(1);
    // Hidden: nothing, however long.
    await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
    await settle(20 * 60_000);
    expect(lists()).toBe(2);
    // Back: one check right away.
    await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
    await expect.poll(lists).toBe(3);
    // Idle 15 minutes (no mouse, keyboard or touch): the routine checks stop.
    await settle(16 * 60_000);
    const idleCount = lists();
    await settle(30 * 60_000);
    expect(lists()).toBe(idleCount);
    // No interaction since well before the tab was hidden: no routine check ran after the return check.
    expect(idleCount).toBe(3);
    // An interaction: one check now, and the schedule resumes.
    await page.mouse.move(50, 50);
    await expect.poll(lists).toBe(idleCount + 1);
    await ctx.close();
  }, 120_000);
});

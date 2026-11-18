/**
 * Coloring Book, the finished-product workflow, in a real browser — a first-time customer's path:
 * Home → "Coloring Book" → Book Setup (faith-based, NIV, page content) → Characters (import Jenny's description,
 * reference picture) → Interior Pages (coloring-only settings, paste the Gracious Kids outline, review, add ten pages,
 * approve a verse, upload an illustration, see the finished page) → reload keeps everything → Cover Design (full-color
 * settings, upload, preview with the title) → Preview and Export (What's Missing?, KDP minimum, the whole book,
 * export opens the print step, Back returns to the book). Phone width too. Set SHOTS_DIR for screenshots.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { preview, type PreviewServer } from "vite";
import { GRACIOUS_OUTLINE, JENNY_DESCRIPTION } from "../fixtures/graciousKids";

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

const SHOTS = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};
const NIV_26 = "She speaks with wisdom, and faithful instruction is on her tongue.";

async function context(viewport = { width: 1280, height: 1000 }, phone = false): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport, isMobile: phone, hasTouch: phone, permissions: ["clipboard-read", "clipboard-write"] });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, async (route) => route.fulfill({ response: await route.fetch() }).catch(() => route.abort()));
  await ctx.route("**/rest/v1/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  return ctx;
}
const toStep = async (page: Page, n: number) => {
  await page.locator(".steps__dot").nth(n - 1).click();
  await page.locator(".steps__count", { hasText: new RegExp(`^Step ${n} of`) }).waitFor();
};

/** A PNG of black line art on white, drawn by the browser. */
async function png(page: Page, w: number, h: number, name: string, fill = "#fff") {
  const b64 = await page.evaluate(
    async ({ w, h, fill }) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const x = c.getContext("2d")!;
      x.fillStyle = fill;
      x.fillRect(0, 0, w, h);
      x.strokeStyle = "#000";
      x.lineWidth = Math.max(3, w / 250);
      for (let i = 0; i < 3; i++) {
        x.beginPath();
        x.arc(w * (0.28 + i * 0.22), h * 0.35, w * 0.08, 0, 7);
        x.stroke();
        x.strokeRect(w * (0.21 + i * 0.22), h * 0.45, w * 0.14, h * 0.3);
      }
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/png"));
      let s = "";
      for (const v of new Uint8Array(await blob.arrayBuffer())) s += String.fromCharCode(v);
      return btoa(s);
    },
    { w, h, fill },
  );
  return { name, mimeType: "image/png", buffer: Buffer.from(b64, "base64") };
}

async function startBook(page: Page) {
  await page.goto(server.resolvedUrls!.local[0]);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('[data-create="coloring-book"]').click();
  await page.getByTestId("new-coloring-book").click();
  await page.locator(".steps__count", { hasText: /^Step 1 of 5/ }).waitFor();
}

describe("Coloring Book — a first-time customer, start to export", () => {
  it("setup, characters, ten pages with Scripture, cover, What's Missing, preview and export", async () => {
    const ctx = await context();
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await startBook(page);

    // 1 Book Setup
    await page.getByTestId("book-title").fill("She Is Gracious");
    await page.getByTestId("faith").getByRole("button", { name: "Yes" }).click();
    await expect(page.getByTestId("scripture-choice").getByRole("button", { name: "Full Bible verse and reference" }).getAttribute("aria-pressed")).resolves.toBe("true");
    await expect(page.getByLabel("Translation").inputValue()).resolves.toBe("NIV");
    // Lessons are off unless chosen.
    await expect(page.getByTestId("page-content").getByLabel("Lesson or reflection").isChecked()).resolves.toBe(false);
    await shot(page, "cb-1-setup");

    // 2 Characters: import a pasted description, review it, add it, attach a reference picture.
    await toStep(page, 2);
    await page.getByTestId("character-mode").getByRole("button", { name: "Import a description" }).click();
    await page.getByTestId("character-paste").fill(JENNY_DESCRIPTION);
    await page.getByRole("button", { name: "Read the description" }).click();
    const review = page.getByTestId("character-review");
    await expect(review.getByLabel("What is their hair like (texture and hairstyle)?").inputValue()).resolves.toBe("long cornrow braids");
    await expect(review.getByLabel("Any bows, headbands or hair accessories?").inputValue()).resolves.toBe("large pink hair bow");
    await page.getByTestId("add-imported-characters").click();
    await page.locator('[data-cast="Jenny Ballerina"]').waitFor();
    await page.getByTestId("ref-Jenny Ballerina").setInputFiles(await png(page, 800, 1000, "jenny-reference.png"));
    await page.locator('[data-cast="Jenny Ballerina"]').getByText("jenny-reference.png").waitFor();
    // The description prompt is one click away.
    await page.getByTestId("character-mode").getByRole("button", { name: "Get a description prompt" }).click();
    await expect(page.getByTestId("character-prompt").textContent()).resolves.toContain("Hair accessories:");

    // 3 Interior Pages: coloring settings only — no watercolor, palette or lettering choices.
    await toStep(page, 3);
    const settings = await page.getByTestId("coloring-settings").textContent();
    expect(settings).toContain("Line thickness");
    expect(settings).toContain("Coloring difficulty");
    expect(settings).toContain("Background detail");
    expect(settings).not.toMatch(/watercolor|Color palette|oil|Lettering style/i);
    await page.getByTestId("outline-text").fill(GRACIOUS_OUTLINE);
    await page.getByTestId("read-outline").click();
    const table = page.getByTestId("outline-review");
    await expect(table.locator("tbody tr").count()).resolves.toBe(10);
    await expect(table.getByLabel("Scene 1 title").inputValue()).resolves.toBe("The Brave First Step");
    await expect(table.locator('[data-row="1"]').textContent()).resolves.toContain("Proverbs 31:26 (wording included)");
    await shot(page, "cb-2-import");
    await page.getByTestId("add-scenes").click();
    await expect(page.locator(".book-page-card").count()).resolves.toBe(10);
    await expect(page.getByTestId("import-source").textContent()).resolves.toContain("## Scene 1: The Brave First Step");

    // Scene 1: the finished page — title, then the verse once approved; no lesson (lessons are off).
    await page.locator('[data-scene="1"] .book-page-card__open').click();
    const editor = page.getByTestId("page-editor-1");
    await expect(editor.getByTestId("verse-text").inputValue()).resolves.toBe(NIV_26);
    let finished = (await editor.getByTestId("finished-page").textContent()) ?? "";
    expect(finished).toContain("The Brave First Step");
    expect(finished).toContain("Proverbs 31:26 (NIV)");
    expect(finished.replace(/\s+/g, "")).not.toContain("Shespeakswithwisdom"); // not approved yet: never printed
    await editor.getByTestId("approve-verse").click();
    // The page draws each wrapped line separately: compare without line breaks.
    const flat = async () => ((await editor.getByTestId("finished-page").textContent()) ?? "").replace(/\s+/g, "");
    // The reference on its own line under the words (no dash before it).
    await expect.poll(flat).toContain(`“${NIV_26}”Proverbs31:26(NIV)`.replace(/\s+/g, ""));
    finished = (await editor.getByTestId("finished-page").textContent()) ?? "";
    expect(finished).not.toMatch(/kind words help us feel brave|Lesson/);
    // The artwork instructions: text-free, black and white, Jenny's registry.
    await editor.getByRole("button", { name: "Show artwork instructions" }).click();
    const prompt = (await editor.getByTestId("artwork-instructions").textContent()) ?? "";
    expect(prompt).toContain("Jenny Ballerina");
    expect(prompt).toContain("Do not include text");
    expect(prompt).not.toMatch(/watercolor typography|Proverbs/);
    // Upload the illustration at the page canvas: it fills the page beneath the text.
    await editor.getByTestId("illustration-upload-1").setInputFiles(await png(page, 2550, 3300, "scene-1.png"));
    await editor.getByTestId("illustration-size-1").waitFor();
    await expect.poll(() => editor.getByTestId("finished-page").locator("image").count()).toBeGreaterThan(0);
    // A lesson on this page only: it appears without any label.
    await editor.getByLabel("Lesson or reflection").first().check();
    await expect.poll(flat).toContain("Beingnewcanfeelscary,butkindwordshelpusfeelbrave.");
    await editor.getByLabel("Lesson or reflection").first().uncheck();
    await shot(page, "cb-3-page");

    // Scene 4 has no reference: suggestions (references only) and an approval are required.
    await editor.getByRole("button", { name: "‹ All pages" }).click();
    await page.locator('[data-scene="4"] .book-page-card__open').click();
    await page.getByTestId("verse-suggestions").waitFor();

    // Reload: the book, its step, characters, pages and approvals are all still there.
    await page.waitForTimeout(700);
    await page.reload();
    await page.locator('[data-book]').first().getByRole("button", { name: "Open" }).click();
    await page.locator(".steps__count", { hasText: /^Step 3 of 5/ }).waitFor();
    await expect(page.locator(".book-page-card").count()).resolves.toBe(10);
    await expect(page.locator('[data-scene="1"]').textContent()).resolves.toContain("Verse ready");
    await expect(page.locator('[data-scene="1"]').textContent()).resolves.toContain("Artwork added");

    // 4 Cover Design: full-color choices here, inherited title, upload, preview with the title as text.
    await toStep(page, 4);
    await expect(page.getByTestId("cover-title").inputValue()).resolves.toBe("She Is Gracious");
    await page.getByLabel("Lettering style").waitFor();
    await page.getByTestId("cover-upload").setInputFiles(await png(page, 2625, 3375, "cover.png", "#f6d6e0"));
    await expect.poll(async () => (await page.getByTestId("cover-preview").textContent()) ?? "").toContain("She Is Gracious");
    await page.getByTestId("approve-cover").click();
    await expect(page.getByTestId("cover-sizes").textContent()).resolves.toMatch(/spine 0\.\d+ in/);

    // 5 Preview and Export: What's Missing? lists blocking items; KDP needs 24 pages.
    await toStep(page, 5);
    const missing = page.getByTestId("whats-missing");
    await expect(page.getByTestId("print-ready").getAttribute("data-ready")).resolves.toBe("false");
    await expect(missing.textContent()).resolves.toContain("Amazon KDP paperback needs at least 24 pages; this book has 22");
    await expect(missing.textContent()).resolves.toContain("Scene 2 has no Bible verse");
    await expect(page.getByTestId("export-interior").isDisabled()).resolves.toBe(true);
    await page.getByTestId("add-drawing-pages").click();
    await expect.poll(async () => (await missing.textContent()) ?? "").not.toContain("needs at least 24 pages");
    // A fix link opens the right page.
    await missing.locator('[data-issue^="ref-"]').first().getByRole("button", { name: /Fix in Interior Pages/ }).click();
    await page.locator('[data-testid^="page-editor-"]').waitFor();
    await toStep(page, 5);
    // The whole book as it prints: the cover and every interior page.
    await expect(page.getByTestId("book-preview").locator(".finished-page").count()).resolves.toBe(25);
    await shot(page, "cb-4-preview");
    // Export a proof: the print step opens; Back returns to the book.
    await page.getByTestId("export-proof").click();
    await page.getByRole("dialog", { name: "Export" }).waitFor();
    await page.getByRole("dialog", { name: "Export" }).getByRole("button", { name: /Close|Cancel/ }).first().click();
    await page.getByRole("button", { name: "‹ Back to the coloring book" }).click();
    await page.getByTestId("coloring-book").waitFor();
    // The proof is a product in the projects list; exporting again updates the same one.
    await page.getByTestId("export-proof").click();
    await page.getByRole("dialog", { name: "Export" }).waitFor();
    const count = await page.evaluate(() => JSON.parse(localStorage.getItem("dove-product-studio:v1:index") ?? "[]").length);
    expect(count).toBe(1);
    expect(errors).toEqual([]);
    await ctx.close();
  }, 120_000);

  it("works at phone width: no sideways scrolling in setup, the page list and the page editor", async () => {
    const ctx = await context({ width: 390, height: 844 }, true);
    const page = await ctx.newPage();
    await startBook(page);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(await overflow()).toBeLessThanOrEqual(1);
    await toStep(page, 3);
    await page.getByTestId("outline-text").fill(GRACIOUS_OUTLINE);
    await page.getByTestId("read-outline").click();
    await page.getByTestId("add-scenes").click();
    expect(await overflow()).toBeLessThanOrEqual(1);
    await page.locator('[data-scene="1"] .book-page-card__open').click();
    await page.getByTestId("finished-page").first().waitFor();
    expect(await overflow()).toBeLessThanOrEqual(1);
    await shot(page, "cb-phone-page");
    await ctx.close();
  }, 60_000);

  it("a coloring book started in Cover Studio continues here with its characters and scenes", async () => {
    const ctx = await context();
    const page = await ctx.newPage();
    await page.goto(server.resolvedUrls!.local[0]);
    await page.evaluate(() => {
      localStorage.clear();
      const brief = { category: "character", collection: "Gracious Kids", title: "She Is Gracious", cast: [{ id: "jenny", name: "Jenny Ballerina", description: "", traits: "cornrow braids, pink bow", hair: "long cornrow braids", refId: "ref-jenny", refName: "jenny.png" }], scenes: [{ id: "a", title: "The Brave First Step", text: "Jenny steps in.", scriptureRef: "Proverbs 31:26" }] };
      localStorage.setItem("dove-product-studio:v1:cover-draft", JSON.stringify({ brief, items: [], direction: 0, collectionId: null }));
    });
    await page.reload();
    await page.locator('[data-create="coloring-book"]').click();
    await page.getByTestId("from-cover-0").click();
    await toStep(page, 3);
    await expect(page.locator('[data-scene="1"]').textContent()).resolves.toContain("The Brave First Step");
    await toStep(page, 2);
    await page.locator('[data-cast="Jenny Ballerina"]').getByText("jenny.png").waitFor();
    // Cover Studio itself is still there, unchanged (Advanced Tools).
    await page.getByRole("button", { name: "‹ Home" }).click();
    await page.getByRole("button", { name: "Cover Studio", exact: true }).click();
    await page.getByRole("tab", { name: /Children’s Character/ }).waitFor();
    await ctx.close();
  }, 60_000);
});

/**
 * Cover Studio in a real browser (npm run test:mobile builds first): the planning flow, the guards, the exact
 * dimensions, saved collections that reopen, and projects left untouched.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import { preview, type PreviewServer } from "vite";
import { TEST_PRODUCTS } from "../../src/presets/products/testProducts";

let server: PreviewServer;
let browser: Browser;
beforeAll(async () => {
  server = await preview({ preview: { port: 0, host: "127.0.0.1" }, logLevel: "silent" });
  browser = await chromium.launch({ executablePath: (import.meta.env.CHROMIUM_PATH as string | undefined) || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await new Promise<void>((r) => server?.httpServer.close(() => r()));
});

const DESKTOP = { width: 1400, height: 1000 };
const PHONE = { width: 390, height: 844 };

/** A fresh studio (one saved product, optional) opened on the Cover Studio screen. */
async function studio(viewport = DESKTOP, withProject = false): Promise<Page> {
  const page = await (await browser.newContext({ viewport })).newPage();
  await page.addInitScript(() => {
    (window as unknown as { __opened: string[] }).__opened = [];
    window.open = ((url?: string | URL) => { (window as unknown as { __opened: string[] }).__opened.push(String(url)); return { opener: null } as unknown as Window; }) as typeof window.open;
  });
  await page.route("**/rest/v1/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.goto(server.resolvedUrls!.local[0]);
  if (withProject) {
    const p = TEST_PRODUCTS[0].build();
    await page.evaluate((proj) => {
      localStorage.clear();
      localStorage.setItem(`dove-product-studio:v1:project:${proj.id}`, JSON.stringify(proj));
      localStorage.setItem("dove-product-studio:v1:index", JSON.stringify([{ id: proj.id, name: proj.name, productType: proj.productType, sizePresetId: proj.dimensions.sizePresetId, updatedAt: proj.updatedAt, variantCount: 0 }]));
    }, p);
    await page.reload();
  } else {
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  }
  await page.getByRole("button", { name: "Cover Studio" }).click();
  await page.getByRole("heading", { name: "Cover Studio" }).waitFor();
  return page;
}
const text = (page: Page, id: string) => page.getByTestId(id).innerText();
const commit = async (page: Page, label: string, value: string) => {
  const f = page.getByLabel(label, { exact: true });
  await f.click();
  await f.fill(value);
  await f.press("Enter");
};
/** Palettes show one group at a time; "All" shows every one. */
const pick = async (page: Page, id: string) => {
  await page.getByRole("button", { name: /^All \(/ }).click();
  await page.locator(`[data-palette="${id}"]`).click();
};
/** A select whose label is exactly this (a label that wraps its options also names them, so a plain label match is ambiguous). */
const select = (page: Page, label: string) => page.locator("label.field").filter({ has: page.locator("span", { hasText: new RegExp(`^${label}$`) }) }).locator("select");
const opened = (page: Page) => page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);

describe("Cover Studio", () => {
  it("opens from the home screen with the studio's palette picker and the live 6 × 9 specification", async () => {
    const page = await studio();
    expect(await text(page, "spec-inches")).toBe("6.25 × 9.25 in");
    expect(await text(page, "spec-pixels")).toMatch(/1,875 × 2,775 px/);
    await page.getByRole("button", { name: /^All \(/ }).click();
    await expect(page.locator(".palette-picker .palette-card").count()).resolves.toBe(65);
    expect(await text(page, "palette-hexes")).toMatch(/#5B0610/);
    await page.close();
  });

  it("bleed on and off, and a custom size, change the canvas exactly", async () => {
    const page = await studio();
    await commit(page, "Bleed, each edge (in)", "0");
    expect(await text(page, "spec-inches")).toBe("6 × 9 in");
    expect(await text(page, "spec-pixels")).toMatch(/1,800 × 2,700 px/);
    await page.getByLabel("Trim size (inches)").selectOption("Custom");
    await commit(page, "Width (in)", "5.25");
    await commit(page, "Height (in)", "8");
    await commit(page, "Bleed, each edge (in)", "0.125");
    expect(await text(page, "spec-trim")).toBe("5.25 × 8 in");
    expect(await text(page, "spec-inches")).toBe("5.5 × 8.25 in");
    await page.close();
  });

  it("title guard: nothing to copy or send until there is a title; then the prompt carries it exactly", async () => {
    const page = await studio();
    expect(await text(page, "cover-prompt")).toMatch(/Add a cover title/);
    await expect(page.getByTestId("generate-chatgpt").isDisabled()).resolves.toBe(true);
    await page.getByRole("button", { name: "Copy prompt" }).first().click();
    await expect(page.getByRole("status").first().innerText()).resolves.toMatch(/cover title/);
    await page.getByLabel("Cover title").fill("Rooted in Hope");
    await page.getByRole("button", { name: "Generate directions" }).click();
    const prompt = await text(page, "cover-prompt");
    expect(prompt).toContain("Exact cover title: “Rooted in Hope”.");
    expect(prompt.match(/Untitled/g)).toHaveLength(1);
    await expect(page.getByTestId("generate-chatgpt").isDisabled()).resolves.toBe(false);
    await page.close();
  });

  it("full wrap: no final creation without the printer's spine width; with it the wrap canvas is exact", async () => {
    const page = await studio();
    await page.getByLabel("Cover title").fill("Rooted in Hope");
    await page.getByLabel("Cover format").selectOption("wrap");
    expect(await text(page, "spec-note")).toMatch(/needs a printer-confirmed spine width/);
    await expect(page.getByTestId("generate-chatgpt").isDisabled()).resolves.toBe(true);
    expect(await text(page, "create-blocker")).toMatch(/spine width/);
    await page.getByRole("button", { name: "Generate directions" }).click();
    expect(await text(page, "cover-prompt")).toContain("NOT a final print-ready wrap");
    await commit(page, "Spine width (in)", "0.5");
    expect(await text(page, "spec-inches")).toBe("12.75 × 9.25 in");
    expect(await text(page, "spec-pixels")).toMatch(/3,825 × 2,775 px/);
    await expect(page.getByTestId("generate-chatgpt").isDisabled()).resolves.toBe(false);
    await page.close();
  });

  it("printer rules come from the studio's own profiles: coil keep-out, and KDP's spine formula is offered, never applied", async () => {
    const page = await studio();
    await select(page, "Product").selectOption("Planner");
    await page.getByLabel("Binding").selectOption("Spiral / coil");
    expect(await text(page, "spec-keepouts")).toMatch(/keep 0\.\d+ in clear/);
    await select(page, "Product").selectOption("Journal");
    await page.getByLabel("Printer").selectOption("kdp");
    await page.getByLabel("Cover format").selectOption("wrap");
    await commit(page, "Page count", "150");
    expect(await text(page, "spine-suggestion")).toMatch(/white paper 0\.338 in, cream 0\.375 in/);
    expect(await text(page, "spec-spine")).toMatch(/needs the printer/);
    await page.getByRole("button", { name: "Use the white-paper value" }).click();
    expect(await text(page, "spec-spine")).toBe("0.338 in");
    await page.close();
  });

  it("the palette picker changes the prompt, with exact hex values", async () => {
    const page = await studio();
    await page.getByLabel("Cover title").fill("Rooted in Hope");
    await page.getByRole("button", { name: "Generate directions" }).click();
    const before = await text(page, "cover-prompt");
    await pick(page, "jcs-prayer-warrior");
    const after = await text(page, "cover-prompt");
    expect(after).not.toBe(before);
    expect(after).toContain("#F3724B");
    expect(await text(page, "palette-hexes")).toMatch(/#F3724B/);
    await page.close();
  });

  it("custom colors are exact and are kept in the saved collection", async () => {
    const page = await studio();
    await page.getByLabel("Cover title").fill("Rooted in Hope");
    await page.getByRole("button", { name: "Use custom colors" }).click();
    await page.getByLabel("Main color").fill("#112233");
    await page.getByRole("button", { name: "Generate directions" }).click();
    expect(await text(page, "cover-prompt")).toContain("main #112233");
    await page.getByLabel("Collection name").fill("Custom hue");
    await page.getByRole("button", { name: "Save collection" }).click();
    await page.reload();
    await page.getByRole("button", { name: "Cover Studio" }).click();
    await page.getByRole("button", { name: "Open", exact: true }).click();
    await page.getByRole("button", { name: "Generate directions" }).click();
    expect(await text(page, "cover-prompt")).toContain("main #112233");
    await page.close();
  });

  it("Generate in ChatGPT: a new tab at ChatGPT's fill-but-don't-send address, with the actual prompt; never the auto-send address", async () => {
    const page = await studio();
    await page.getByLabel("Cover title").fill("Rooted in Hope");
    await page.getByRole("button", { name: "Generate directions" }).click();
    await page.getByTestId("generate-chatgpt").click();
    const urls = await opened(page);
    expect(urls).toHaveLength(1);
    expect(urls[0].startsWith("https://chatgpt.com/?prompt=")).toBe(true);
    expect(urls[0]).not.toContain("?q=");
    const sent = decodeURIComponent(urls[0].slice("https://chatgpt.com/?prompt=".length));
    expect(sent).toContain("Exact cover title: “Rooted in Hope”.");
    expect(sent).not.toContain("[TITLE REQUIRED]");
    expect(sent.endsWith(await text(page, "cover-prompt"))).toBe(true);
    await expect(page.getByRole("status").first().innerText()).resolves.toMatch(/message box.*press send/);
    expect(await page.locator(".cover-main").innerText()).toMatch(/Product Studio does not make images/);
    await page.close();
  });

  it("Generate in ChatGPT carries the exact prompt for different styles, products, sizes, directions and palettes", async () => {
    const page = await studio();
    await page.getByLabel("Cover title").fill("Quiet Strength");
    const matrix = [
      { style: "Black and gold marble", product: "Journal", size: "6×9", direction: 0 },
      { style: "Formal notary register", product: "Notary journal", size: "6×9", direction: 1, palette: "dove-charcoal" },
      { style: "Soft watercolor typography", product: "Planner", size: "7×9", direction: 2, palette: "jcs-prayer-warrior" },
      { style: "Abstract circle planner", product: "Bookmark", size: "2×6", direction: 3 },
      { style: "Oversized script statement", product: "Greeting card", size: "5×7", direction: 4, palette: "jcs-blush-rose" },
      { style: "Painterly botanical", product: "Other stationery", size: "Custom", direction: 0 },
    ];
    for (const m of matrix) {
      await select(page, "Product").selectOption(m.product);
      await page.getByLabel("Trim size (inches)").selectOption(m.size);
      await page.getByLabel("Cover style").selectOption(m.style);
      if (m.palette) await pick(page, m.palette);
      await page.locator(`[data-direction="${m.direction}"] button`).click();
      const shown = await text(page, "cover-prompt");
      const before = (await opened(page)).length;
      await page.getByTestId("generate-chatgpt").click();
      const urls = await opened(page);
      expect(urls.length, m.style).toBe(before + 1);
      const sent = decodeURIComponent(urls[urls.length - 1].slice("https://chatgpt.com/?prompt=".length));
      expect(sent.endsWith(shown), `${m.style} / ${m.product}`).toBe(true);
      expect(sent).toContain(`Chosen visual language: ${m.style}.`);
      expect(sent).toContain(`Product: ${m.product}.`);
      expect(urls[urls.length - 1].length).toBeLessThan(8000);
    }
    await page.close();
  });

  it("Copy prompt works on its own: it copies the prompt and opens nothing", async () => {
    const context = await browser.newContext({ viewport: DESKTOP, permissions: ["clipboard-read", "clipboard-write"] });
    const page = await context.newPage();
    await page.addInitScript(() => { (window as unknown as { __opened: string[] }).__opened = []; window.open = ((u?: string | URL) => { (window as unknown as { __opened: string[] }).__opened.push(String(u)); return { opener: null } as unknown as Window; }) as typeof window.open; });
    await page.goto(server.resolvedUrls!.local[0]);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole("button", { name: "Cover Studio" }).click();
    await page.getByLabel("Cover title").fill("Rooted in Hope");
    await page.getByRole("button", { name: "Generate directions" }).click();
    const shown = await text(page, "cover-prompt");
    await page.getByTestId("copy-prompt").click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(shown);
    expect(await opened(page)).toEqual([]);
    // Open ChatGPT is separate: ChatGPT's plain page, no prompt in the address.
    await page.getByTestId("open-chatgpt").click();
    expect(await opened(page)).toEqual(["https://chatgpt.com/"]);
    await context.close();
  });

  it("nothing is launched when required information is missing", async () => {
    const page = await studio();
    // No title: the launch button is off, and no other control launches or copies a prompt.
    await expect(page.getByTestId("generate-chatgpt").isDisabled()).resolves.toBe(true);
    await page.getByTestId("copy-prompt").click();
    await expect(page.getByRole("status").first().innerText()).resolves.toMatch(/cover title/);
    // A full wrap with a title but no spine width: still off, with the reason.
    await page.getByLabel("Cover title").fill("Rooted in Hope");
    await page.getByLabel("Cover format").selectOption("wrap");
    await expect(page.getByTestId("generate-chatgpt").isDisabled()).resolves.toBe(true);
    expect(await text(page, "create-blocker")).toMatch(/spine width/);
    expect(await opened(page)).toEqual([]);
    await page.close();
  });

  it("a blocked new tab is reported, with the copy-and-paste way", async () => {
    const page = await studio();
    await page.getByLabel("Cover title").fill("Rooted in Hope");
    await page.evaluate(() => { window.open = (() => null) as typeof window.open; }); // a blocked pop-up returns no window
    await page.getByTestId("generate-chatgpt").click();
    await expect(page.getByRole("status").first().innerText()).resolves.toMatch(/blocked the new tab[\s\S]*copied/);
    await page.close();
  });

  it("a weekly set: starter set, per-item specs, a saved collection that reopens, duplicate & recolor, import and export", async () => {
    const page = await studio();
    await page.getByLabel("Collection name").fill("Rooted in Hope");
    await page.getByLabel("Cover title").fill("Rooted in Hope");
    await page.getByLabel("Theme").fill("Renewal");
    await page.getByLabel("Cover style").selectOption("Peach and gold marble");
    await pick(page, "jcs-peach-marble");
    await page.getByLabel("Etsy title idea").fill("Rooted in Hope Prayer Journal");
    await page.getByLabel("Tags / keywords").fill("prayer journal, faith gift");
    await page.getByRole("button", { name: "Add starter set" }).click();
    const items = page.getByTestId("cover-items").locator("li");
    expect(await items.count()).toBe(4);
    expect(await items.nth(2).innerText()).toMatch(/Bookmark[\s\S]*2×6[\s\S]*2\.25 × 6\.25 in canvas/);
    await page.getByRole("button", { name: "Save collection" }).click();
    expect(await page.getByTestId("cover-library").locator("[data-collection]").count()).toBe(1);

    // Reopens with its style, palette, listing notes and items.
    await page.reload();
    await page.getByRole("button", { name: "Cover Studio" }).click();
    await page.getByRole("button", { name: "Open", exact: true }).click();
    await expect(page.getByLabel("Cover style").inputValue()).resolves.toBe("Peach and gold marble");
    await expect(page.getByLabel("Tags / keywords").inputValue()).resolves.toBe("prayer journal, faith gift");
    await expect(page.getByLabel("Etsy title idea").inputValue()).resolves.toBe("Rooted in Hope Prayer Journal");
    expect(await page.getByTestId("cover-items").locator("li").count()).toBe(4);
    await page.getByRole("button", { name: /^All \(/ }).click();
    await expect(page.locator('[data-palette="jcs-peach-marble"]').getAttribute("aria-pressed")).resolves.toBe("true");

    // Duplicate & recolor: the original stays; the variant is a new, unsaved one.
    await page.getByRole("button", { name: "Duplicate & recolor" }).click();
    await expect(page.getByLabel("Collection name").inputValue()).resolves.toBe("Rooted in Hope — new palette");
    await expect(page.getByLabel("Main color").count()).resolves.toBe(1);
    expect(await page.getByTestId("cover-library").locator("[data-collection]").count()).toBe(1);
    await page.getByRole("button", { name: "Save collection" }).click();
    expect(await page.getByTestId("cover-library").locator("[data-collection]").count()).toBe(2);
    const stored = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes(":cover:")).map((k) => JSON.parse(localStorage.getItem(k)!).brief.palette));
    expect(stored.sort()).toEqual(["custom", "jcs-peach-marble"]);

    // Export, then import the same file back.
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export collection JSON" }).click()]);
    const file = await download.path();
    await page.getByLabel("Import JSON").setInputFiles(file!);
    await expect.poll(() => page.getByRole("status").first().innerText(), { timeout: 5000 }).toMatch(/imported/);
    await page.close();
  });

  it("projects are unaffected: the product is still listed, unchanged, and still opens", async () => {
    const page = await studio(DESKTOP, true);
    const before = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => k.includes(":project:") || k.endsWith(":index")).map((k) => [k, localStorage.getItem(k)])));
    await page.getByLabel("Start from one of your products").selectOption({ index: 1 });
    await page.getByLabel("Collection name").fill("From my product");
    await page.getByRole("button", { name: "Save collection" }).click();
    await page.getByRole("button", { name: "← Back to Product Studio" }).click();
    const after = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => k.includes(":project:") || k.endsWith(":index")).map((k) => [k, localStorage.getItem(k)])));
    expect(after).toEqual(before);
    await page.getByRole("button", { name: "Open", exact: true }).first().click();
    await page.getByRole("button", { name: "‹ Projects" }).waitFor();
    await page.close();
  });

  it("on a phone nothing runs off the screen", async () => {
    const page = await studio(PHONE);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.getByLabel("Cover title").fill("Rooted in Hope");
    await page.getByRole("button", { name: "Generate directions" }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await page.close();
  });
});

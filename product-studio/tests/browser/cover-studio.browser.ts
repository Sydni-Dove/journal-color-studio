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
/** Open one of the category's screens (for a cover: 1 Collection, 2 Art direction, 3 Artwork details, 4 Review and copy). */
const toStep = async (page: Page, n: number) => {
  await page.locator(".steps__dot").nth(n - 1).click();
  await page.locator(".steps__count", { hasText: new RegExp(`^Step ${n} of`) }).waitFor();
};
/** Step 3's folded "Advanced options", opened. */
const advanced = async (page: Page) => {
  const d = page.locator("details.cover-advanced");
  if ((await d.getAttribute("open")) === null) await d.locator("summary").click();
};
const library = async (page: Page) => {
  const d = page.locator("details.cover-library-section");
  if ((await d.getAttribute("open")) === null) await d.locator("summary").click();
};
const category = (page: Page, name: RegExp) => page.getByRole("tab", { name });
/** Title on step 3, then the review. */
const titled = async (page: Page, title = "Rooted in Hope") => {
  await toStep(page, 3);
  await page.getByLabel("Cover title").fill(title);
  await toStep(page, 4);
};

describe("Cover Studio", () => {
  it("tabs, then the step title and Back / Next at the top; jump back from the review; kept on reload", async () => {
    const page = await studio();
    expect(await page.locator(".steps__title").innerText()).toBe("Collection");
    expect(await page.locator(".steps__count").textContent()).toBe("Step 1 of 4");
    expect(await page.locator('[role="tab"]').count()).toBe(5);
    // Back / Next sit at the top, directly under the tabs and the step title.
    const y = async (sel: string) => (await page.locator(sel).first().boundingBox())!.y;
    expect(await y(".steps__nav")).toBeLessThan(await y(".cover-step"));
    expect(await y(".steps__nav")).toBeGreaterThan(await y(".cover-tabs"));
    await page.locator(".steps__nav").getByRole("button", { name: /^Next/ }).click();
    expect(await page.locator(".steps__title").innerText()).toBe("Art direction");
    await page.locator(".steps__nav").getByRole("button", { name: /^Next/ }).click();
    expect(await page.locator(".steps__title").innerText()).toBe("Artwork details");
    await page.getByLabel("Cover title").fill("Rooted in Hope");
    await page.locator(".steps__nav").getByRole("button", { name: /^Next/ }).click();
    expect(await page.locator(".steps__title").innerText()).toBe("Review and copy");
    // Edit an earlier step from the review.
    await page.getByTestId("cover-summary").locator(".cover-summary__row", { hasText: "Art direction" }).getByRole("button", { name: "Edit" }).click();
    expect(await page.locator(".steps__title").innerText()).toBe("Art direction");
    await page.locator(".steps__nav").getByRole("button", { name: /^‹ Back/ }).click();
    expect(await page.locator(".steps__title").innerText()).toBe("Collection");
    // Reload: the same screen, the title kept, the later steps still reached.
    await toStep(page, 3);
    await page.waitForTimeout(600);
    await page.reload();
    await page.getByRole("button", { name: "Cover Studio" }).click();
    expect(await page.locator(".steps__title").innerText()).toBe("Artwork details");
    await expect(page.getByLabel("Cover title").inputValue()).resolves.toBe("Rooted in Hope");
    expect(await page.locator(".steps__item--done").count()).toBe(3);
    await page.close();
  });

  it("opens with the studio's palette picker, and the live 6 × 9 specification in the review", async () => {
    const page = await studio();
    await toStep(page, 2);
    await page.getByRole("button", { name: /^All \(/ }).click();
    await expect(page.locator(".palette-picker .palette-card").count()).resolves.toBe(65);
    expect(await text(page, "palette-hexes")).toMatch(/#5B0610/);
    await toStep(page, 4);
    expect(await text(page, "spec-inches")).toBe("6.25 × 9.25 in");
    expect(await text(page, "spec-pixels")).toMatch(/1,875 × 2,775 px/);
    await page.close();
  });

  it("bleed on and off, and a custom size, change the canvas exactly", async () => {
    const page = await studio();
    await toStep(page, 3);
    await advanced(page);
    await commit(page, "Bleed, each edge (in)", "0");
    await toStep(page, 4);
    expect(await text(page, "spec-inches")).toBe("6 × 9 in");
    expect(await text(page, "spec-pixels")).toMatch(/1,800 × 2,700 px/);
    await toStep(page, 3);
    await page.getByLabel("Trim size (inches)").selectOption("Custom");
    await commit(page, "Width (in)", "5.25");
    await commit(page, "Height (in)", "8");
    await advanced(page);
    await commit(page, "Bleed, each edge (in)", "0.125");
    await toStep(page, 4);
    expect(await text(page, "spec-trim")).toBe("5.25 × 8 in");
    expect(await text(page, "spec-inches")).toBe("5.5 × 8.25 in");
    await page.close();
  });

  it("title guard: nothing to copy or send until there is a title; then the prompt carries it exactly", async () => {
    const page = await studio();
    await toStep(page, 4);
    expect(await text(page, "cover-prompt")).toMatch(/Add a cover title/);
    await expect(page.getByTestId("generate-chatgpt").isDisabled()).resolves.toBe(true);
    await expect(page.getByTestId("copy-prompt").isDisabled()).resolves.toBe(true);
    await titled(page);
    const prompt = await text(page, "cover-prompt");
    expect(prompt).toContain("Exact cover title: “Rooted in Hope”.");
    expect(prompt.match(/Untitled/g)).toHaveLength(1);
    await expect(page.getByTestId("generate-chatgpt").isDisabled()).resolves.toBe(false);
    await page.close();
  });

  it("full wrap: no final creation without the printer's spine width; with it the wrap canvas is exact", async () => {
    const page = await studio();
    await toStep(page, 3);
    await page.getByLabel("Cover title").fill("Rooted in Hope");
    await advanced(page);
    await page.getByLabel("Cover format").selectOption("wrap");
    await toStep(page, 4);
    expect(await text(page, "spec-note")).toMatch(/needs a printer-confirmed spine width/);
    await expect(page.getByTestId("generate-chatgpt").isDisabled()).resolves.toBe(true);
    expect(await text(page, "create-blocker")).toMatch(/spine width/);
    expect(await text(page, "cover-prompt")).toContain("NOT a final print-ready wrap");
    await toStep(page, 3);
    await advanced(page);
    await commit(page, "Spine width (in)", "0.5");
    await toStep(page, 4);
    expect(await text(page, "spec-inches")).toBe("12.75 × 9.25 in");
    expect(await text(page, "spec-pixels")).toMatch(/3,825 × 2,775 px/);
    await expect(page.getByTestId("generate-chatgpt").isDisabled()).resolves.toBe(false);
    await page.close();
  });

  it("printer rules come from the studio's own profiles: coil keep-out, and KDP's spine formula is offered, never applied", async () => {
    const page = await studio();
    await toStep(page, 3);
    await select(page, "Product").selectOption("Planner");
    await advanced(page);
    await page.getByLabel("Binding").selectOption("Spiral / coil");
    await toStep(page, 4);
    expect(await text(page, "spec-keepouts")).toMatch(/keep 0\.\d+ in clear/);
    await toStep(page, 3);
    await select(page, "Product").selectOption("Journal");
    await advanced(page);
    await page.getByLabel("Printer").selectOption("kdp");
    await page.getByLabel("Cover format").selectOption("wrap");
    await commit(page, "Page count", "150");
    expect(await text(page, "spine-suggestion")).toMatch(/white paper 0\.338 in, cream 0\.375 in/);
    await page.getByRole("button", { name: "Use the white-paper value" }).click();
    await toStep(page, 4);
    expect(await text(page, "spec-spine")).toBe("0.338 in");
    await page.close();
  });

  it("the palette picker changes the prompt, with exact hex values", async () => {
    const page = await studio();
    await titled(page);
    const before = await text(page, "cover-prompt");
    await toStep(page, 2);
    await pick(page, "jcs-prayer-warrior");
    expect(await text(page, "palette-hexes")).toMatch(/#F3724B/);
    await toStep(page, 4);
    const after = await text(page, "cover-prompt");
    expect(after).not.toBe(before);
    expect(after).toContain("#F3724B");
    await page.close();
  });

  it("custom colors are exact and are kept in the saved collection", async () => {
    const page = await studio();
    await page.getByLabel("Collection name").fill("Custom hue");
    await toStep(page, 2);
    await page.getByRole("button", { name: "Use custom colors" }).click();
    await page.getByLabel("Main color").fill("#112233");
    await titled(page);
    expect(await text(page, "cover-prompt")).toContain("main #112233");
    await page.getByRole("button", { name: "Save collection" }).click();
    await page.getByRole("button", { name: "New collection" }).click();
    await library(page);
    await page.getByRole("button", { name: "Open", exact: true }).click();
    await toStep(page, 4);
    expect(await text(page, "cover-prompt")).toContain("main #112233");
    await page.close();
  });

  it("Generate in ChatGPT: a new tab at ChatGPT's fill-but-don't-send address, with the actual prompt; never the auto-send address", async () => {
    const page = await studio();
    await titled(page);
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
    expect(await page.locator(".cover-step").innerText()).toMatch(/Product Studio does not make images/);
    await page.close();
  });

  it("Generate in ChatGPT carries the exact prompt for different styles, products, sizes, directions and palettes", async () => {
    const page = await studio();
    await titled(page, "Quiet Strength");
    const matrix = [
      { style: "Black and gold marble", product: "Journal", size: "6×9", direction: 0 },
      { style: "Formal notary register", product: "Notary journal", size: "6×9", direction: 1, palette: "dove-charcoal" },
      { style: "Soft watercolor typography", product: "Planner", size: "7×9", direction: 2, palette: "jcs-prayer-warrior" },
      { style: "Abstract circle planner", product: "Bookmark", size: "2×6", direction: 3 },
      { style: "Oversized script statement", product: "Greeting card", size: "5×7", direction: 4, palette: "jcs-blush-rose" },
      { style: "Painterly botanical", product: "Other stationery", size: "Custom", direction: 0 },
    ];
    for (const m of matrix) {
      await toStep(page, 3);
      await select(page, "Product").selectOption(m.product);
      await page.getByLabel("Trim size (inches)").selectOption(m.size);
      await toStep(page, 2);
      await page.getByLabel("Style", { exact: true }).selectOption(m.style);
      if (m.palette) await pick(page, m.palette);
      await page.locator(`[data-direction="${m.direction}"] button`).click();
      await toStep(page, 4);
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

  it("each category: the copied prompt carries the palette chosen and that category's own details", async () => {
    const context = await browser.newContext({ viewport: DESKTOP, permissions: ["clipboard-read", "clipboard-write"] });
    const page = await context.newPage();
    await page.addInitScript(() => { (window as unknown as { __opened: string[] }).__opened = []; window.open = ((u?: string | URL) => { (window as unknown as { __opened: string[] }).__opened.push(String(u)); return { opener: null } as unknown as Window; }) as typeof window.open; });
    await page.goto(server.resolvedUrls!.local[0]);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole("button", { name: "Cover Studio" }).click();
    const copied = async () => {
      await page.locator(".steps__dot").last().click();
      await page.locator(".steps__title", { hasText: "Review and copy" }).waitFor();
      await page.getByTestId("copy-prompt").click();
      return page.evaluate(() => navigator.clipboard.readText());
    };
    const palette = async (id: string, hex: string) => {
      await toStep(page, 2);
      await pick(page, id);
      expect(await text(page, "palette-hexes")).toContain(hex);
    };

    // Cover Artwork: title, typography and palette.
    await category(page, /Cover Artwork/).click();
    await palette("jcs-prayer-warrior", "#F3724B");
    await page.getByLabel("Typography", { exact: true }).selectOption("Elegant flowing script");
    await toStep(page, 3);
    await page.getByLabel("Cover title").fill("Rooted in Hope");
    let p = await copied();
    for (const t of ["#F3724B", "Exact cover title: “Rooted in Hope”", "Typography: Elegant flowing script."]) expect(p, "cover").toContain(t);
    expect(p).toBe(await text(page, "cover-prompt"));

    // Interior Page Design: page, use, placement, writing space.
    await toStep(page, 1);
    await category(page, /Interior Page Design/).click();
    await palette("jcs-peach-marble", "#");
    await toStep(page, 3);
    await page.getByLabel("Page", { exact: true }).selectOption("To-do list page");
    await page.getByLabel("How the art is used").selectOption("Corner illustration");
    await page.getByLabel("Artwork placement").selectOption("Bottom right corner");
    await page.getByLabel("Writing space").selectOption("Keep the center two-thirds clear");
    p = await copied();
    for (const t of ["to-do list page", "Placement: Bottom right corner", "run off the bottom and right edges", "Keep the center two-thirds clear", "transparent background", "Peach"]) expect(p, "interior").toContain(t);
    expect(p).not.toContain("Exact cover title");

    // Children's Character Illustrations: a saved character and a scene batch; the pages stay black and white.
    await category(page, /Children’s Character/).click();
    await page.locator(".steps__dot").last().click();
    await expect(page.getByTestId("copy-prompt").isDisabled()).resolves.toBe(true);
    await toStep(page, 3);
    await page.getByRole("button", { name: "Add a character" }).click();
    await page.getByLabel("Character name").fill("Maya");
    await page.getByLabel("Maya: description").fill("a 7-year-old with curly hair in two puffs and a yellow raincoat");
    await page.getByLabel("Age group").selectOption("Ages 4–8");
    await toStep(page, 4);
    await page.getByLabel("Scenes text").fill("1. Puddle jumping\nMaya jumps in a puddle, laughing.\n\n2. Sharing a snack\nMaya shares her apple with a friend.");
    await page.getByRole("button", { name: "Split into scenes" }).click();
    p = await copied();
    for (const t of ["Scene 1 of 2: Puddle jumping.", "Scene 2 of 2: Sharing a snack.", "Notes: a 7-year-old with curly hair", "Pure white background. Bold, clean black outlines."]) expect(p, "character").toContain(t);
    expect(p).not.toMatch(/#[0-9A-F]{6}/i);

    // Coordinated Collection Design: the products in the set and one design system.
    await toStep(page, 1);
    await category(page, /Coordinated Collection/).click();
    await toStep(page, 3);
    await page.getByRole("button", { name: "Add starter set" }).click();
    await page.getByLabel("Add a product").selectOption("Greeting card");
    p = await copied();
    for (const t of ["COORDINATED COLLECTION DESIGN SYSTEM", "Journal (6×9 in)", "Bookmark (2×6 in)", "Greeting card (5×7 in)", "Product: Greeting card."]) expect(p, "collection").toContain(t);
    const hexes = (await text(page, "cover-prompt")).match(/#[0-9A-F]{6}/g) ?? [];
    expect(hexes.length).toBeGreaterThan(3);
    await context.close();
  });

  it("Copy prompt works on its own: it copies the prompt and opens nothing", async () => {
    const context = await browser.newContext({ viewport: DESKTOP, permissions: ["clipboard-read", "clipboard-write"] });
    const page = await context.newPage();
    await page.addInitScript(() => { (window as unknown as { __opened: string[] }).__opened = []; window.open = ((u?: string | URL) => { (window as unknown as { __opened: string[] }).__opened.push(String(u)); return { opener: null } as unknown as Window; }) as typeof window.open; });
    await page.goto(server.resolvedUrls!.local[0]);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole("button", { name: "Cover Studio" }).click();
    await titled(page);
    const shown = await text(page, "cover-prompt");
    await page.getByTestId("copy-prompt").click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(shown);
    expect(await opened(page)).toEqual([]);
    // The last step's Copy prompt (in place of Next) copies the same.
    await page.evaluate(() => navigator.clipboard.writeText(""));
    await page.locator(".steps__nav").getByRole("button", { name: "Copy prompt" }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(shown);
    // Open ChatGPT is separate: ChatGPT's plain page, no prompt in the address.
    await page.getByTestId("open-chatgpt").click();
    expect(await opened(page)).toEqual(["https://chatgpt.com/"]);
    await context.close();
  });

  it("nothing is launched when required information is missing", async () => {
    const page = await studio();
    await toStep(page, 4);
    await expect(page.getByTestId("generate-chatgpt").isDisabled()).resolves.toBe(true);
    await expect(page.getByTestId("copy-prompt").isDisabled()).resolves.toBe(true);
    // A full wrap with a title but no spine width: still off, with the reason.
    await toStep(page, 3);
    await page.getByLabel("Cover title").fill("Rooted in Hope");
    await advanced(page);
    await page.getByLabel("Cover format").selectOption("wrap");
    await toStep(page, 4);
    await expect(page.getByTestId("generate-chatgpt").isDisabled()).resolves.toBe(true);
    expect(await text(page, "create-blocker")).toMatch(/spine width/);
    expect(await opened(page)).toEqual([]);
    await page.close();
  });

  it("a blocked new tab is reported, with the copy-and-paste way", async () => {
    const page = await studio();
    await titled(page);
    await page.evaluate(() => { window.open = (() => null) as typeof window.open; }); // a blocked pop-up returns no window
    await page.getByTestId("generate-chatgpt").click();
    await expect(page.getByRole("status").first().innerText()).resolves.toMatch(/blocked the new tab[\s\S]*copied/);
    await page.close();
  });

  it("a weekly set: starter set, per-item specs, a saved collection that reopens, duplicate & recolor, import and export", async () => {
    const page = await studio();
    await category(page, /Coordinated Collection/).click();
    await page.getByLabel("Collection name").fill("Rooted in Hope");
    await toStep(page, 2);
    await page.getByLabel("Style", { exact: true }).selectOption("Peach and gold marble");
    await pick(page, "jcs-peach-marble");
    await toStep(page, 3);
    await page.getByLabel("Collection title (printed on each piece)").fill("Rooted in Hope");
    await page.getByLabel("Theme").fill("Renewal");
    await advanced(page);
    await page.getByLabel("Etsy title idea").fill("Rooted in Hope Prayer Journal");
    await page.getByLabel("Tags / keywords").fill("prayer journal, faith gift");
    await page.getByRole("button", { name: "Add starter set" }).click();
    const items = page.getByTestId("cover-items").locator("li");
    expect(await items.count()).toBe(4);
    expect(await items.nth(2).innerText()).toMatch(/Bookmark[\s\S]*2×6[\s\S]*2\.25 × 6\.25 in canvas/);
    await toStep(page, 4);
    await page.getByRole("button", { name: "Save collection" }).click();
    await toStep(page, 1);
    await library(page);
    expect(await page.getByTestId("cover-library").locator("[data-collection]").count()).toBe(1);

    // Reopens with its category, style, palette, listing notes and items.
    await page.getByRole("button", { name: "New collection" }).click();
    await library(page);
    await page.getByRole("button", { name: "Open", exact: true }).click();
    await expect(category(page, /Coordinated Collection/).getAttribute("aria-selected")).resolves.toBe("true");
    await toStep(page, 2);
    await expect(page.getByLabel("Style", { exact: true }).inputValue()).resolves.toBe("Peach and gold marble");
    await page.getByRole("button", { name: /^All \(/ }).click();
    await expect(page.locator('[data-palette="jcs-peach-marble"]').getAttribute("aria-pressed")).resolves.toBe("true");
    await toStep(page, 3);
    await advanced(page);
    await expect(page.getByLabel("Tags / keywords").inputValue()).resolves.toBe("prayer journal, faith gift");
    await expect(page.getByLabel("Etsy title idea").inputValue()).resolves.toBe("Rooted in Hope Prayer Journal");
    expect(await page.getByTestId("cover-items").locator("li").count()).toBe(4);

    // Duplicate & recolor: the original stays; the variant is a new, unsaved one.
    await toStep(page, 1);
    await library(page);
    await page.getByRole("button", { name: "Duplicate & recolor" }).click();
    await expect(page.getByLabel("Collection name").inputValue()).resolves.toBe("Rooted in Hope — new palette");
    await toStep(page, 2);
    await expect(page.getByLabel("Main color").count()).resolves.toBe(1);
    await toStep(page, 4);
    await page.getByRole("button", { name: "Save collection" }).click();
    const stored = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes(":cover:")).map((k) => JSON.parse(localStorage.getItem(k)!).brief.palette));
    expect(stored.sort()).toEqual(["custom", "jcs-peach-marble"]);

    // Export, then import the same file back.
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export collection JSON" }).click()]);
    const file = await download.path();
    await toStep(page, 1);
    await library(page);
    await page.getByLabel("Import JSON").setInputFiles(file!);
    await expect.poll(() => page.getByRole("status").first().innerText(), { timeout: 5000 }).toMatch(/imported/);
    await page.close();
  });

  it("an existing saved collection (made before the four screens) opens as Cover Artwork, its choices intact", async () => {
    const page = await studio();
    await page.evaluate(() => {
      const brief = { collection: "Old Favourite", theme: "Rest", title: "Be Still", subtitle: "", style: "Black and gold marble", palette: "jcs-peach-marble", product: "Journal", size: "6×9", format: "front", binding: "Perfect bound", printProfile: "generic-commercial", pages: 120, spine: null, bleed: 0.125, safe: 0.25, medium: "Print", dpi: 300 };
      const c = { schemaVersion: 1, id: "old1", name: "Old Favourite", createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z", brief, items: [], direction: 2 };
      localStorage.setItem("dove-product-studio:v1:cover:old1", JSON.stringify(c));
      localStorage.setItem("dove-product-studio:v1:cover-index", JSON.stringify([{ id: "old1", name: "Old Favourite", theme: "Rest", items: 0, updatedAt: c.updatedAt }]));
    });
    await page.reload();
    await page.getByRole("button", { name: "Cover Studio" }).click();
    await library(page);
    await page.locator('[data-collection="old1"]').getByRole("button", { name: "Open", exact: true }).click();
    await expect(category(page, /Cover Artwork/).getAttribute("aria-selected")).resolves.toBe("true");
    await toStep(page, 4);
    const p = await text(page, "cover-prompt");
    expect(p).toContain("Exact cover title: “Be Still”");
    expect(p).toContain("Chosen visual language: Black and gold marble.");
    await page.close();
  });

  it("projects are unaffected: the product is still listed, unchanged, and still opens", async () => {
    const page = await studio(DESKTOP, true);
    const before = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => k.includes(":project:") || k.endsWith(":index")).map((k) => [k, localStorage.getItem(k)])));
    await page.getByLabel("Start from one of your products").selectOption({ index: 1 });
    await page.getByLabel("Collection name").fill("From my product");
    await toStep(page, 4);
    await page.getByRole("button", { name: "Save collection" }).click();
    await page.getByRole("button", { name: "← Back to Product Studio" }).click();
    const after = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => k.includes(":project:") || k.endsWith(":index")).map((k) => [k, localStorage.getItem(k)])));
    expect(after).toEqual(before);
    await page.getByRole("button", { name: "Open", exact: true }).first().click();
    await page.getByRole("button", { name: "‹ Projects" }).waitFor();
    await page.close();
  });

  it("on a phone nothing runs off the screen, on any step, with 44px touch targets", async () => {
    const page = await studio(PHONE);
    for (const n of [1, 2, 3, 4]) {
      await toStep(page, n);
      if (n === 3) {
        await page.getByLabel("Cover title").fill("Rooted in Hope");
        await advanced(page);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `step ${n}`).toBeLessThanOrEqual(0);
      const small = await page.locator(".steps__dot, .steps__nav .btn, .cover-tab, .cover-category, .cover-summary .btn, .cover-actions .btn").evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent && e.getBoundingClientRect().height < 44).map((e) => e.textContent));
      expect(small, `step ${n}`).toEqual([]);
    }
    await page.close();
  });
});

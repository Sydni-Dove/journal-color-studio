/**
 * Studio shell in a real browser (npm run test:mobile builds first):
 *   home    empty / one / several projects, desktop + phone, every card leads somewhere
 *   editor  default panel width, drag + keyboard resizing within limits, the
 *           preview rescales, no page-level horizontal overflow; phone keeps the stacked flow
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import { preview, type PreviewServer } from "vite";
import { TEST_PRODUCTS } from "../../src/presets/products/testProducts";
import type { ProductProject } from "../../src/types/project";

let server: PreviewServer;
let browser: Browser;
let base: string;

beforeAll(async () => {
  server = await preview({ preview: { port: 0, host: "127.0.0.1" }, logLevel: "silent" });
  base = server.resolvedUrls!.local[0];
  browser = await chromium.launch({ executablePath: (import.meta.env.CHROMIUM_PATH as string | undefined) || undefined });
}, 60_000);

afterAll(async () => {
  await browser?.close();
  await new Promise<void>((r) => server?.httpServer.close(() => r()));
});

const DESKTOP = { width: 1400, height: 900 };
const PHONE = { width: 390, height: 844 };

async function home(projects: ProductProject[], viewport: { width: number; height: number }): Promise<Page> {
  const page = await (await browser.newContext({ viewport })).newPage();
  await page.goto(base);
  await page.evaluate((list) => {
    localStorage.clear();
    const idx = list.map((p) => {
      localStorage.setItem(`dove-product-studio:v1:project:${p.id}`, JSON.stringify(p));
      return { id: p.id, name: p.name, productType: p.productType, sizePresetId: p.dimensions.sizePresetId, updatedAt: p.updatedAt, variantCount: 0 };
    });
    localStorage.setItem("dove-product-studio:v1:index", JSON.stringify(idx));
  }, projects);
  await page.goto(base);
  await page.waitForSelector(".home-hero");
  return page;
}
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const products = (n: number) => TEST_PRODUCTS.slice(0, n).map((t, i) => ({ ...t.build(), name: `U${i} ${t.label}` }));

describe("Studio home", () => {
  for (const [name, vp] of [["desktop", DESKTOP], ["phone", PHONE]] as const) {
    it(`${name}: new user — welcome, product families, quick start; no overflow`, async () => {
      const page = await home([], vp);
      await expect(page.locator("h1").textContent()).resolves.toBe("Dove Expressions Product Studio");
      await expect(page.getByText("Your studio is ready").count()).resolves.toBe(1);
      await expect(page.locator("button.family-card").count()).resolves.toBe(9);
      await expect(page.locator("button.family-card", { hasText: "Daily Planner" }).count()).resolves.toBe(1);
      await expect(page.getByRole("button", { name: /Start a daily planner/ }).count()).resolves.toBe(1);
      // Families without a foundation are shown, never clickable.
      const next = page.locator(".family-card--next");
      await expect(next.count()).resolves.toBe(1);
      await expect(next.evaluateAll((els) => els.every((e) => e.tagName !== "BUTTON" && !e.querySelector("button, a")))).resolves.toBe(true);
      await expect(page.getByText("Open your latest project").count()).resolves.toBe(0);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await page.context().close();
    });
    it(`${name}: several projects — continue working with type, size, pages, edited; no overflow`, async () => {
      const list = products(4);
      const page = await home(list, vp);
      const cards = page.locator(".recent-card");
      await expect(cards.count()).resolves.toBe(4);
      await expect(cards.filter({ hasText: "U2" }).textContent()).resolves.toMatch(/Planner · 7 × 9 · \d+ pages/);
      await expect(cards.filter({ hasText: "U1" }).textContent()).resolves.toMatch(/Journal · 6 × 9 · 120 pages/);
      await expect(cards.filter({ hasText: "U0" }).textContent()).resolves.toMatch(/Notepad · 5 × 7 · .*one master sheet/);
      await expect(page.getByText("All projects · 4").count()).resolves.toBe(1);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await page.context().close();
    });
  }

  it("one project: Open reaches the editor; 'Open your latest project' too", async () => {
    const page = await home(products(1), DESKTOP);
    await page.getByRole("button", { name: /Open your latest project/ }).click();
    await page.waitForSelector(".ps-page--editor");
    await page.context().close();
  });

  it("Planner + Journal opens its full book template: real page previews, then Use this template makes an editable book", async () => {
    const page = await home([], DESKTOP);
    await page.locator("button.family-card", { hasText: "Planner + Journal" }).click();
    const view = page.getByRole("region", { name: "Meetings With God Planner" });
    await view.waitFor();
    // Previews are the real renderer (PrintablePage), not pictures.
    await expect.poll(() => view.locator(".page-thumb .ps-page").count()).toBeGreaterThanOrEqual(3);
    await expect(view.locator("img").count()).resolves.toBe(0);
    // Page type lists page layouts only — no complete books.
    const pageTypes = await page.locator("#wizard-build ~ .wizard button.choice").allInnerTexts();
    expect(pageTypes.join(" | ")).not.toMatch(/Book:|Meetings With God|Journal Planner|Daily Planner \+/);
    await view.getByRole("button", { name: "Use this template" }).click();
    await page.waitForSelector(".ps-page--editor");
    await expect(page.locator("details.section > summary", { hasText: /^Book structure/ }).count()).resolves.toBe(1);
    await expect(page.locator(".badge--error").count()).resolves.toBe(0);
    await page.context().close();
  });

  it("phone: Full planners & books cards and Page type choices fit — no page overflow, no multi-line pills", async () => {
    const page = await home([], PHONE);
    await page.getByRole("button", { name: /Start with a complete planner or book/ }).click();
    await page.waitForSelector("#wizard-books");
    await expect.poll(() => page.locator(".book-card .ps-page").count()).toBeGreaterThanOrEqual(8);
    await page.locator(".book-card", { hasText: "Daily Planner + Meetings With God" }).getByRole("button", { name: "View template" }).click();
    await page.getByRole("region", { name: "Daily Planner + Meetings With God" }).waitFor();
    await page.locator("button.choice", { hasText: /^Planner$/ }).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const pills = await page.locator("button.choice").evaluateAll((els) => els.map((e) => ({ t: e.textContent, over: e.scrollWidth > e.clientWidth + 1, tall: e.getBoundingClientRect().height > 60 })));
    expect(pills.filter((p) => p.over || p.tall)).toEqual([]);
    await page.context().close();
  });

  it("Devotional → SOAP → 6 × 9 → Generate: a print-ready page with no measuring, customizable by semantic controls", async () => {
    const page = await home([], DESKTOP);
    await page.locator("button.family-card", { hasText: "Devotional" }).click();
    await page.waitForSelector("#wizard-build");
    await expect(page.locator('button.choice[aria-pressed="true"]', { hasText: /^Devotional$/ }).count()).resolves.toBe(1);
    await page.locator("label.field", { hasText: "Page size" }).locator("select").selectOption("6x9");
    await page.locator("button.choice", { hasText: /^SOAP$/ }).click();
    await page.getByRole("button", { name: "Generate" }).click();
    await page.waitForSelector(".ps-page--editor");
    await expect(page.locator(".badge").first().textContent()).resolves.toBe("Page OK");
    const sections = page.locator("details.section", { has: page.locator(":scope > summary", { hasText: /^Page sections$/ }) });
    // The SOAP prompts, in the shared prompt editor; no raw measurements among the controls.
    const prayer = sections.locator('[data-prompt="prayer"]');
    await expect(prayer.count()).resolves.toBe(1);
    await expect(sections.locator('input[type="number"]').count()).resolves.toBe(0);
    // Choosing writing lines updates the page immediately.
    const field = prayer.getByRole("spinbutton", { name: "Writing lines" });
    await field.click();
    await field.fill("4");
    await field.press("Enter");
    await expect.poll(() => page.locator(".badge").first().textContent()).toBe("Page OK");
    // Rename a prompt: the page shows the new wording.
    await prayer.getByRole("textbox", { name: "Prompt 4" }).fill("What should I pray about?");
    await expect.poll(() => page.locator(".ps-page--editor").first().textContent()).toMatch(/What should I pray about\?/i);

    await page.context().close();
  });

  it("Devotional → Daily Reflection → 5.5 × 8.5 uses the Compact Daily Reflection and says so", async () => {
    const page = await home([], DESKTOP);
    await page.locator("button.family-card", { hasText: "Devotional" }).click();
    await page.waitForSelector("#wizard-build");
    await page.locator("label.field", { hasText: "Page size" }).locator("select").selectOption("5.5x8.5");
    const choice = page.locator("button.choice", { hasText: /^Daily Reflection/ });
    await expect(choice.isDisabled()).resolves.toBe(false);
    await choice.click();
    await page.getByRole("button", { name: "Generate" }).click();
    await page.waitForSelector(".ps-page--editor");
    await expect(page.getByTestId("size-variant-notice").textContent()).resolves.toMatch(/Using the Compact Daily Reflection.*not available at this size.*leaves out Stand Out Verse and Thankful For/);
    await expect(page.locator(".badge--error").count()).resolves.toBe(0);
    await page.context().close();
  });

  it("starter templates are real: creating one opens the editor", async () => {
    const page = await home([], DESKTOP);
    await page.getByRole("button", { name: /Start from a starter template/ }).click();
    await page.locator("#wizard-templates").waitFor();
    await page.locator("button.card--pick").first().click();
    await page.waitForSelector(".ps-page--editor");
    await page.context().close();
  });
});

describe("Editor panel width", () => {
  async function editor(viewport: { width: number; height: number }) {
    const page = await home(products(3).slice(2), viewport);
    await page.locator(".card", { hasText: "U2" }).first().getByRole("button", { name: "Open" }).click();
    await page.waitForSelector(".ps-page--editor");
    return page;
  }
  const panelW = (page: Page) => page.locator("aside.panel").evaluate((e) => e.getBoundingClientRect().width);
  const pageW = (page: Page) => page.locator(".ps-page--editor").first().evaluate((e) => e.getBoundingClientRect().width);

  it("desktop: 420–480 px by default; drag and keyboard resize within 360–600; the preview rescales; no overflow", async () => {
    const page = await editor(DESKTOP);
    const w0 = await panelW(page);
    expect(w0).toBeGreaterThanOrEqual(420);
    expect(w0).toBeLessThanOrEqual(480);
    // Fit width: the page scale follows the room left for the preview.
    await page.getByRole("button", { name: "Fit width" }).click();
    await page.waitForTimeout(100);
    const p0 = await pageW(page);
    const handle = page.getByRole("separator", { name: "Resize the editor panel" });
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 200);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 400, box.y + 200, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => panelW(page)).toBe(600);
    await expect.poll(() => pageW(page)).toBeLessThan(p0); // less room → smaller fitted page
    await handle.focus();
    await page.keyboard.press("Home");
    await expect.poll(() => panelW(page)).toBe(360);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => panelW(page)).toBe(376);
    await expect.poll(() => pageW(page)).toBeGreaterThan(p0 * 0.99);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await page.context().close();
  });

  it("the chosen width is remembered", async () => {
    const page = await editor(DESKTOP);
    await page.getByRole("separator", { name: "Resize the editor panel" }).focus();
    await page.keyboard.press("End");
    await expect.poll(() => panelW(page)).toBe(600);
    await page.reload();
    await page.locator(".card", { hasText: "U2" }).first().getByRole("button", { name: "Open" }).click();
    await page.waitForSelector(".ps-page--editor");
    await expect.poll(() => panelW(page)).toBe(600);
    await page.context().close();
  });

  it("phone: stacked flow, no divider, no overflow", async () => {
    const page = await editor(PHONE);
    await expect(page.getByRole("separator", { name: "Resize the editor panel" }).isVisible()).resolves.toBe(false);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await page.context().close();
  });
});

describe("Prompt editor in a book", () => {
  it("Meeting With God guided page: add prompts with 5 lines each; the page continues on another page", async () => {
    const p = { ...TEST_PRODUCTS[1].build(), name: "PE" } as ProductProject;
    p.recipe = { items: [], ordering: "sequential", structure: [{ kind: "step", id: "mwg", module: "meeting-with-god", layoutId: "guided-page", cadence: { type: "once" } }] } as never;
    const page = await home([p], DESKTOP);
    await page.locator(".card", { hasText: "PE" }).first().getByRole("button", { name: "Open" }).click();
    await page.waitForSelector(".ps-page--editor");
    // Open the step's card in Book structure.
    await page.locator('details.book-step[data-step="mwg"] > summary').click();
    const editor = page.getByTestId("prompt-editor").first();
    await editor.scrollIntoViewIfNeeded();
    await editor.getByLabel("Use the same number of lines for every prompt").check();
    const per = editor.getByRole("spinbutton", { name: "Lines per prompt" });
    await per.fill("5");
    await per.press("Enter");
    const count = editor.getByRole("spinbutton", { name: "Number of prompts" });
    await count.fill("9");
    await count.press("Enter");
    await expect(editor.locator(".prompt-block").count()).resolves.toBe(9);
    await expect.poll(() => page.getByTestId("prompt-continues").count(), { timeout: 10_000 }).toBe(1);
    // Continuing is not a problem: nothing about the prompts needs fixing.
    await expect(page.getByTestId("prompt-fit").count()).resolves.toBe(0);
    await page.context().close();
  });
});

/**
 * Studio shell in a real browser (npm run test:mobile builds first):
 *   home    empty / one / several projects, desktop + phone, every card leads somewhere
 *   editor  default panel width, drag + keyboard resizing within limits, the
 *           preview rescales, no page-level horizontal overflow; phone keeps the stacked flow
 */
import { openArea } from "./areas";
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

/** "+ Add section" opens a menu of section types; add a writing-lines section. */
async function addWritingSection(editor: import("playwright-core").Locator) {
  const menu = editor.locator("details.add-section-menu");
  if (!(await menu.evaluate((d) => (d as HTMLDetailsElement).open))) await menu.locator(":scope > summary").click();
  await menu.getByRole("button", { name: "Writing lines" }).click();
}

describe("Studio home", () => {
  for (const [name, vp] of [["desktop", DESKTOP], ["phone", PHONE]] as const) {
    it(`${name}: new user — welcome, product families, quick start; no overflow`, async () => {
      const page = await home([], vp);
      await expect(page.locator("h1").textContent()).resolves.toBe("Dove Expressions Product Studio");
      await expect(page.getByText("Your studio is ready").count()).resolves.toBe(1);
      // The simplified home: real product categories (the daily planner is a Planner template, reached below).
      await expect(page.locator("button.family-card").count()).resolves.toBe(8);
      await expect(page.locator("button.family-card", { hasText: /^Planner/ }).count()).resolves.toBe(1);
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

  it("Full planners & books: the Meetings With God Planner template — real page previews, then Use this template makes an editable book", async () => {
    const page = await home([], DESKTOP);
    await page.getByRole("button", { name: /Start with a complete planner or book/ }).click();
    await page.locator('.book-card[data-template="book-meetings-with-god"]').getByRole("button", { name: "View template" }).click();
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
    await openArea(page, "pages");
    // The template's pages, grouped by kind: cover, monthly, weekly, …
    await expect(page.locator('.builder-cat[data-category="cover"] .builder-row').count()).resolves.toBe(2);
    await expect(page.locator('.builder-cat[data-category="weekly"] .builder-row').count()).resolves.toBeGreaterThanOrEqual(2);
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
    // Choices may be large touch cards, but their text never wraps or overflows.
    const pills = await page.locator("button.choice:visible").evaluateAll((els) =>
      els.map((e) => {
        // Lines of the label: its text height over its line height.
        const label = (e.querySelector("strong") as HTMLElement | null) ?? (e as HTMLElement);
        const lh = parseFloat(getComputedStyle(label).lineHeight) || parseFloat(getComputedStyle(label).fontSize) * 1.2;
        const r = document.createRange();
        r.selectNodeContents(label);
        const lines = Math.round(r.getBoundingClientRect().height / lh);
        return { t: e.textContent, over: e.scrollWidth > e.clientWidth + 1, tall: lines > 1 };
      }),
    );
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
    await page.getByRole("button", { name: /^(Start planner|Create )/ }).click();
    await page.waitForSelector(".ps-page--editor");
    await expect(page.locator(".badge").first().textContent()).resolves.toBe("Page OK");
    await openArea(page, "add");
    const sections = page.locator("details.section", { has: page.locator(":scope > summary", { hasText: /^What's on this page\?$/ }) });
    // The SOAP prompts, in the shared prompt editor; no raw measurements among the controls.
    const prayer = sections.locator('[data-prompt="prayer"]');
    await expect(prayer.count()).resolves.toBe(1);
    await expect(sections.locator('input[type="number"]').count()).resolves.toBe(0);
    // Each section is a compact row showing its real writing space; open it to edit.
    await expect(prayer.getByTestId("section-space").textContent()).resolves.toMatch(/\d+ lines?/);
    await prayer.locator(":scope > summary").click();
    // Choosing an exact number of writing lines (under More) updates the page immediately.
    await prayer.locator("details.subsection > summary", { hasText: /^More writing-space options$/ }).click();
    const field = prayer.getByRole("spinbutton", { name: "Exact number of lines" });
    await field.click();
    await field.fill("3");
    await field.press("Enter");
    await expect.poll(() => page.locator(".badge").first().textContent()).toBe("Page OK");
    // Rename a prompt: the page shows the new wording.
    await expect.poll(() => prayer.getByTestId("section-space").textContent()).toBe("Compact · 3 lines");
    await prayer.getByRole("textbox", { name: "Heading" }).fill("What should I pray about?");
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
    await page.getByRole("button", { name: /^(Start planner|Create )/ }).click();
    await page.waitForSelector(".ps-page--editor");
    await openArea(page, "add");
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
    // The page being viewed is the guided page: Add to page → What's on this page?
    await openArea(page, "add");
    const editor = page.getByTestId("prompt-editor").first();
    await editor.scrollIntoViewIfNeeded();
    await editor.locator("details.subsection > summary", { hasText: "More section options" }).click();
    await editor.getByLabel("Use the same number of lines for every section").check();
    const per = editor.getByRole("spinbutton", { name: "Lines per section" });
    await per.fill("5");
    await per.press("Enter");
    const before = await editor.locator(".prompt-block").count();
    for (let k = before; k < 9; k++) await addWritingSection(editor);
    await expect(editor.locator(".prompt-block").count()).resolves.toBe(9);
    await expect.poll(() => page.getByTestId("prompt-continues").count(), { timeout: 10_000 }).toBe(1);
    // Continuing is not a problem: nothing about the prompts needs fixing.
    await expect(page.getByTestId("prompt-fit").count()).resolves.toBe(0);
    await page.context().close();
  });
});

describe("Guided Lined Page", () => {
  const rows = (editor: import("playwright-core").Locator) => editor.locator(".prompt-block > summary").allInnerTexts();
  const openRow = (editor: import("playwright-core").Locator, i: number) => editor.locator(".prompt-block").nth(i).evaluate((d) => ((d as HTMLDetailsElement).open = true));
  for (const [vp, label] of [[DESKTOP, "desktop"], [PHONE, "phone"]] as const) {
    it(`${label}: New product → Journal → Guided Lined Page; starters, add, duplicate, move, remove, lines ± — real line counts, saved and reloaded`, async () => {
      const page = await home([], vp);
      await page.locator("button.family-card", { hasText: /^Journal/ }).first().click();
      await page.waitForSelector("#wizard-build");
      await page.locator("button.choice", { hasText: /^Guided Lined Page$/ }).click();
      await page.getByRole("button", { name: /^(Start planner|Create )/ }).click();
      await page.waitForSelector(".ps-page--editor");
      await expect.poll(() => page.locator(".badge").first().textContent()).toBe("Page OK");
      // The page's sections (Add to page): one section that fills the page, shown with its real line count.
      await openArea(page, "add");
      const editor = page.getByTestId("prompt-editor").first();
      await expect.poll(() => rows(editor)).toEqual([expect.stringMatching(/^The Word\s*Fills space · \d{2} lines/)]);
      // Three Prompt Response: 8 + 8 lines, Prayer fills what is left.
      await editor.getByLabel("Start from a structure (replaces the sections)").selectOption({ label: "Three Prompt Response" });
      await expect.poll(() => rows(editor)).toEqual([expect.stringMatching(/My Response\s*8 lines/), expect.stringMatching(/What I Will Do\s*8 lines/), expect.stringMatching(/Prayer\s*Fills space · \d+ lines?( · page 2)?/)]);
      // Duplicate the first, move the copy down, remove it again; add a section.
      const first = editor.locator(".prompt-block").first();
      await openRow(editor, 0);
      await first.getByRole("button", { name: "Duplicate" }).click();
      await expect.poll(() => editor.locator(".prompt-block").count()).toBe(4);
      await openRow(editor, 1);
      await editor.locator(".prompt-block").nth(1).getByRole("button", { name: "Move section 2 down" }).click();
      await expect.poll(async () => (await rows(editor))[2]).toMatch(/^My Response/);
      await openRow(editor, 2);
      await editor.locator(".prompt-block").nth(2).getByRole("button", { name: "Remove" }).click();
      await expect.poll(() => editor.locator(".prompt-block").count()).toBe(3);
      // Lines ±: one line more on My Response (exact lines are under More).
      await openRow(editor, 0);
      await editor.locator(".prompt-block").first().locator("details.subsection").evaluate((d) => ((d as HTMLDetailsElement).open = true));
      await editor.locator(".prompt-block").first().getByRole("button", { name: "One line more" }).click();
      await openRow(editor, 0);
      await expect.poll(async () => (await rows(editor))[0]).toMatch(/9 lines/);
      await addWritingSection(editor);
      await expect.poll(() => editor.locator(".prompt-block").count()).toBe(4);
      if (label === "phone") expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      // Saved: reload and the sections are the same.
      const saved = await rows(editor);
      await page.reload();
      await page.locator(".card").first().getByRole("button", { name: "Open" }).click();
      await page.waitForSelector(".ps-page--editor");
      await openArea(page, "add");
      await expect.poll(() => rows(page.getByTestId("prompt-editor").first())).toEqual(saved);
      await page.context().close();
    });
  }
});

describe("Guided Lined Page in the simple page list", () => {
  for (const [vp, label] of [[DESKTOP, "desktop"], [PHONE, "phone"]] as const) {
    it(`${label}: planner started from Classic Monthly → add a Prompts + writing space page → its Sections editor, real line counts, labelled in Pages`, async () => {
      const page = await home([], vp);
      await page.locator("button.family-card", { hasText: /^Planner/ }).first().click();
      await page.waitForSelector("#wizard-build");
      // One starting page: Classic Monthly (the planner's default start). Other pages are added under Pages.
      await expect(page.getByTestId("planner-start").innerText()).resolves.toMatch(/Starting with:\s*Monthly/);
      // Layout choices show the real page as a thumbnail, then their name.
      await page.locator("button.choice", { has: page.locator("strong", { hasText: /^Classic Monthly$/ }) }).click();
      await page.getByRole("button", { name: /^(Start planner|Create )/ }).click();
      await page.waitForSelector(".ps-page--editor");
      // Page label and Pages control beside the page number.
      await expect.poll(() => page.getByTestId("page-label").innerText()).toMatch(/MONTHLY PLANNER/);
      await expect(page.getByRole("button", { name: "Browse pages", exact: true }).isVisible()).resolves.toBe(true);
      // Pages → a kind of page the planner doesn't list first: Prompts + writing space. Edit takes you to it.
      await openArea(page, "pages");
      await page.getByRole("button", { name: /^More kinds of pages/ }).click();
      const journal = page.locator('.builder-cat[data-category="journal"]');
      await journal.getByRole("button", { name: "+ Prompts + writing space" }).click();
      await journal.locator(".builder-row").last().getByRole("button", { name: /^Edit / }).click();
      await page.locator('section.area[data-area="layout"]').waitFor();
      await openArea(page, "add");
      const sections = page.getByTestId("prompt-editor").first();
      await expect.poll(() => sections.locator(".prompt-block > summary").allInnerTexts()).toEqual([expect.stringMatching(/^Prompt 1/), expect.stringMatching(/^Prompt 2/), expect.stringMatching(/^Prompt 3/)]);
      await sections.getByLabel("Start from a structure (replaces the sections)").selectOption({ label: "Four Prompt Review" });
      await expect.poll(() => sections.locator(".prompt-block > summary").allInnerTexts()).toEqual([
        expect.stringMatching(/What God Did\s*8 lines/), expect.stringMatching(/Timeline\s*(Standard · )?6 lines/), expect.stringMatching(/Fruit & Impact\s*(Standard · )?6 lines/), expect.stringMatching(/Praise & Gratitude\s*Fills space/),
      ]);
      await expect.poll(() => page.locator(".badge").first().textContent()).toMatch(/Page OK|warning/);
      // Pages: filter Journal → the guided page, labelled with its title.
      await page.getByRole("button", { name: "Browse pages", exact: true }).click();
      const sheet = page.getByRole("dialog", { name: "Browse pages" });
      await sheet.getByLabel("Show pages").selectOption("journal");
      await sheet.locator(".page-row").first().click();
      await expect.poll(() => page.getByTestId("page-label").innerText()).toMatch(/Guided Page/i);
      if (label === "phone") expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      await page.context().close();
    });
  }
});

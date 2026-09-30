/**
 * Page Composer in a real browser: a blank Custom Page → + Add a section
 * (heading, info row, divider, spacer, table) → the page draws each piece →
 * save it as a page design → Pages adds three pages made from it. Desktop and
 * phone (no page overflow).
 */
import { openArea } from "./areas";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import { preview, type PreviewServer } from "vite";
import { step } from "../../src/presets/bookRecipes";
import { createProject } from "../../src/presets/products/projectFactory";
import type { ProductProject } from "../../src/types/project";

let server: PreviewServer, browser: Browser, base: string;
beforeAll(async () => {
  server = await preview({ preview: { port: 0, host: "127.0.0.1" }, logLevel: "silent" });
  base = server.resolvedUrls!.local[0];
  browser = await chromium.launch({ executablePath: (import.meta.env.CHROMIUM_PATH as string | undefined) || undefined });
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await new Promise<void>((r) => server.httpServer.close(() => r()));
});

const blank = (): ProductProject =>
  createProject("journal", {
    name: "Composer QA",
    dimensions: { sizePresetId: "7x9", orientation: "portrait" },
    // Coil: no minimum page count, so the check is about the composed page itself.
    production: { bindingType: "coil", printProfileId: "coil-generic", duplex: true } as never,
    recipe: { items: [], ordering: "sequential", structure: [step("custom", { type: "copies", count: 1 }, { id: "dash", layoutId: "guided-page", title: "Master Dashboard", promptSet: { blocks: [] } })] },
  });

async function open(p: ProductProject, phone: boolean): Promise<Page> {
  const page = await (await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1400, height: 1000 }, isMobile: phone, hasTouch: phone })).newPage();
  await page.goto(base);
  await page.evaluate((x) => {
    localStorage.clear();
    localStorage.setItem(`dove-product-studio:v1:project:${x.id}`, JSON.stringify(x));
    localStorage.setItem("dove-product-studio:v1:index", JSON.stringify([{ id: x.id, name: x.name, productType: x.productType, sizePresetId: x.dimensions.sizePresetId, updatedAt: x.updatedAt, variantCount: 0 }]));
  }, p);
  await page.goto(base);
  await page.locator(".card", { hasText: p.name }).first().getByRole("button", { name: "Open" }).click();
  await page.waitForSelector(".ps-page--editor");
  return page;
}

/** Tap a piece under "Build your page". */
async function add(page: Page, label: string) {
  await page.getByTestId("build-your-page").getByRole("button", { name: label, exact: true }).click();
}

/** The composer's section `i` (1-based), opened. */
async function section(page: Page, i: number) {
  const d = page.getByTestId("prompt-editor").first().locator(".prompt-block").nth(i - 1);
  await d.evaluate((el) => ((el as HTMLDetailsElement).open = true));
  return d;
}

describe("Page Composer", () => {
  it("a new Custom Page opens straight on its building pieces (no menus to find)", async () => {
    const custom = createProject("custom", {
      name: "Blank Custom Page",
      dimensions: { sizePresetId: "8.5x11", orientation: "portrait" },
      recipe: { items: [], ordering: "sequential", structure: [step("custom", { type: "copies", count: 1 }, { title: "Custom Page", promptSet: { blocks: [] } })] },
    });
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
    await page.goto(base);
    // Even when another area was open last time.
    await page.evaluate((x) => {
      localStorage.clear();
      localStorage.setItem("dove-product-studio:v1:editor-area", "pages");
      localStorage.setItem(`dove-product-studio:v1:project:${x.id}`, JSON.stringify(x));
      localStorage.setItem("dove-product-studio:v1:index", JSON.stringify([{ id: x.id, name: x.name, productType: x.productType, sizePresetId: x.dimensions.sizePresetId, updatedAt: x.updatedAt, variantCount: 0 }]));
    }, custom);
    await page.goto(base);
    await page.locator(".card", { hasText: custom.name }).first().getByRole("button", { name: "Open" }).click();
    await page.waitForSelector(".ps-page--editor");
    await expect.poll(() => page.locator('section.area[data-area="add"]').count()).toBe(1);
    for (const piece of ["Heading / text", "Info row", "Divider line", "Spacer / open space"]) {
      expect(await page.getByRole("button", { name: piece, exact: true }).first().isVisible(), piece).toBe(true);
    }
    expect(await page.getByTestId("save-design").isVisible()).toBe(true);
    // "Build your page" comes first; the secondary choices sit below the pieces, under Page options.
    const order = await page.evaluate(() => {
      const top = (sel: string) => document.querySelector(sel)!.getBoundingClientRect().top;
      return { build: top('[data-testid="build-your-page"]'), options: top('[data-testid="page-options"]') };
    });
    expect(order.build).toBeLessThan(order.options);
    expect(await page.getByTestId("page-options").evaluate((d) => (d as HTMLDetailsElement).open)).toBe(false);
    await page.context().close();
  }, 60_000);

  it("after adding a piece: Done closes it and shows the list again; Add another piece goes back to Build your page; tables have no duplicate space controls", async () => {
    const page = await open(blank(), true);
    await openArea(page, "add");
    for (const piece of ["Heading / text", "Writing lines", "Table"]) await add(page, piece);
    const blocks = page.getByTestId("prompt-editor").first().locator(".prompt-block");
    const isOpen = (i: number) => blocks.nth(i).evaluate((d) => (d as HTMLDetailsElement).open);
    // The piece just added is open, the others closed.
    await expect.poll(() => isOpen(2)).toBe(true);
    expect(await isOpen(0)).toBe(false);
    // A table shows its own Table space only: no second "writing space" control, no "More" panel.
    await expect(blocks.nth(2).getByRole("group", { name: "Table space" }).count()).resolves.toBe(1);
    await expect(blocks.nth(2).getByText(/writing-space options/).count()).resolves.toBe(0);
    await blocks.nth(2).getByRole("button", { name: /^Done with / }).click();
    await expect.poll(() => isOpen(2)).toBe(false);
    // All three sections are visible as rows again.
    for (let i = 0; i < 3; i++) await expect(blocks.nth(i).locator(":scope > summary").isVisible()).resolves.toBe(true);
    // From an open section, "Add another piece" returns to the pieces.
    await blocks.nth(1).evaluate((d) => ((d as HTMLDetailsElement).open = true));
    await blocks.nth(1).getByRole("button", { name: "Add another piece" }).click();
    await expect.poll(() => page.getByTestId("build-your-page").evaluate((el) => { const r = el.getBoundingClientRect(); return r.top < window.innerHeight && r.bottom > 0; })).toBe(true);
    expect(await isOpen(1)).toBe(false);
    await page.context().close();
  }, 60_000);

  it("Master Dashboard: a page title, three column labels edited one by one, the table filling the page", async () => {
    const page = await open(blank(), false);
    await openArea(page, "add");
    await add(page, "Heading / text");
    await add(page, "Table");
    const heading = await section(page, 1);
    // The first heading on a page is its title.
    await expect(heading.getByRole("group", { name: "Text style" }).getByRole("button", { name: "Page title" }).getAttribute("aria-pressed")).resolves.toBe("true");
    await heading.getByRole("textbox", { name: "Heading" }).fill("Master Dashboard");
    const table = await section(page, 2);
    await table.getByRole("textbox", { name: "Heading" }).fill("");
    const cols = table.getByTestId("table-columns");
    // Three separate boxes (the piece starts with three columns); each edited on its own.
    await expect(cols.getByRole("textbox").count()).resolves.toBe(3);
    await cols.getByRole("textbox", { name: "Column 1" }).fill("Project / Area");
    await cols.getByRole("textbox", { name: "Column 2" }).fill("Status / Priority");
    await cols.getByRole("textbox", { name: "Column 3" }).fill("Next Step / Notes");
    await expect(cols.getByRole("textbox", { name: "Column 1" }).inputValue()).resolves.toBe("Project / Area");
    // Add and remove a column: the boxes follow.
    await cols.getByRole("button", { name: "+ Add column" }).click();
    await expect(cols.getByRole("textbox").count()).resolves.toBe(4);
    await cols.getByRole("button", { name: "Remove column 4" }).click();
    await expect(cols.getByRole("textbox").count()).resolves.toBe(3);
    await table.getByRole("group", { name: "Table space" }).getByRole("button", { name: "Fill remaining space" }).click();
    const drawn = page.locator(".ps-page--editor").first();
    await expect.poll(() => drawn.textContent()).toMatch(/Next Step \/ Notes/);
    for (const want of ["Master Dashboard", "Project / Area", "Status / Priority"]) expect((await drawn.textContent()) ?? "").toContain(want);
    // The table reaches the bottom of the page's writing area.
    const fill = await page.evaluate(() => {
      const page = document.querySelector(".ps-page--editor svg")!.getBoundingClientRect();
      const rows = [...document.querySelectorAll('.ps-page--editor [data-node*="-surface-r"]')].map((e) => e.getBoundingClientRect().bottom);
      return { last: Math.max(...rows), pageBottom: page.bottom, pageH: page.height, n: rows.length };
    });
    expect(fill.n).toBeGreaterThanOrEqual(6);
    expect((fill.pageBottom - fill.last) / fill.pageH).toBeLessThan(0.12);
    await expect.poll(async () => (await page.locator(".badge").first().textContent()) ?? "").toMatch(/Page OK/);
    await page.context().close();
  }, 60_000);

  it("Revelation to Execution, built by tapping pieces and typing (no custom code for the page)", async () => {
    const page = await open(blank(), false);
    await openArea(page, "add");
    for (const piece of ["Heading / text", "Writing lines", "Writing lines", "Writing lines", "Writing lines", "Info row"]) await add(page, piece);
    const heading = await section(page, 1);
    await heading.getByRole("textbox", { name: "Heading" }).fill("Revelation to Execution");
    const names = ["What I received", "What I believe it concerns", "Scripture + what needs discernment", "Next act of obedience or action"];
    for (const [k, name] of names.entries()) {
      const s = await section(page, k + 2);
      await s.getByRole("textbox", { name: "Heading" }).fill(name);
      // Plain amounts, not inches: the four areas share the page.
      await s.getByRole("group", { name: "Writing space" }).getByRole("button", { name: "Fill remaining space" }).click();
    }
    const info = await section(page, 6);
    await info.getByRole("textbox", { name: "Blank 1 label" }).fill("Status");
    await info.getByRole("textbox", { name: "Blank 2 label" }).fill("Review date");
    await info.getByRole("group", { name: "Blank 2 is" }).getByRole("button", { name: "A box" }).click();
    const drawn = page.locator(".ps-page--editor").first();
    await expect.poll(() => drawn.textContent()).toMatch(/Revelation to Execution/);
    const text = (await drawn.textContent()) ?? "";
    for (const want of [...names, "Status", "Review date"]) expect(text, want).toContain(want);
    expect(await page.locator('.ps-page--editor [data-node$="-surface-f1-box"]').count()).toBeGreaterThan(0);
    await expect.poll(async () => (await page.locator(".badge").first().textContent()) ?? "").toMatch(/Page OK/);
    // Two sections side by side, and a section style.
    const second = await section(page, 3);
    await second.getByRole("checkbox", { name: "Beside the section above (two columns)" }).check();
    await second.getByLabel("Section style").selectOption("panel");
    await expect.poll(() => page.locator('.ps-page--editor [data-node$="-frame"]').count()).toBeGreaterThan(0);
    // The paired columns share one band: the panel's top edge is level with the first column's heading, to its right.
    const band = await page.evaluate(() => {
      const first = [...document.querySelectorAll('.ps-page--editor [data-node$="-title"]')].find((e) => /What I received/.test(e.textContent ?? ""))!.getBoundingClientRect();
      const panel = document.querySelector('.ps-page--editor [data-node$="-frame"]')!.getBoundingClientRect();
      return { firstTop: first.top, firstRight: first.left, panelTop: panel.top, panelLeft: panel.left };
    });
    expect(Math.abs(band.firstTop - band.panelTop)).toBeLessThanOrEqual(1.5);
    expect(band.panelLeft).toBeGreaterThan(band.firstRight);
    await expect.poll(async () => (await page.locator(".badge").first().textContent()) ?? "").toMatch(/Page OK/);
    await page.context().close();
  }, 60_000);

  for (const phone of [false, true]) {
    it(`${phone ? "phone" : "desktop"}: compose a page from structured pieces, save it as a design, add it × 3 from Pages`, async () => {
      const page = await open(blank(), phone);
      await openArea(page, "add");
      for (const piece of ["Heading / text", "Info row", "Divider line", "Spacer / open space", "Table", "Task list", "Writing lines"]) await add(page, piece);
      const editor = page.getByTestId("prompt-editor").first();
      await expect.poll(() => editor.locator(".prompt-block").count()).toBe(7);
      // Each piece is drawn on the page.
      const drawn = (re: string) => page.locator(`.ps-page--editor [data-node$="${re}"]`).count();
      await expect.poll(() => drawn("-surface-rule")).toBeGreaterThan(0); // divider
      await expect.poll(() => page.locator('.ps-page--editor [data-node*="-surface-f1-label"]').count()).toBeGreaterThan(0); // info row
      await expect.poll(async () => (await page.locator(".badge").first().textContent()) ?? "").toMatch(/Page OK|to check/);
      // Rename the heading.
      const first = editor.locator(".prompt-block").first();
      await first.evaluate((d) => ((d as HTMLDetailsElement).open = true));
      await first.getByRole("textbox", { name: "Heading" }).fill("Project Snapshot");
      await expect.poll(() => page.locator(".ps-page--editor").first().textContent()).toMatch(/Project Snapshot/);
      // Save as a page design, then add three pages made from it.
      const save = page.getByTestId("save-design");
      await save.getByRole("textbox", { name: "Page design name" }).fill("Project Snapshot");
      await save.getByRole("button", { name: "Save", exact: true }).click();
      await expect(save.getByRole("status").textContent()).resolves.toMatch(/Saved “Project Snapshot”/);
      const before = Number((await page.locator(".page-counter").innerText()).match(/of (\d+)/)![1]);
      await openArea(page, "pages");
      const row = page.locator('.builder-cat[data-category="designs"] .builder-row').first();
      await row.getByRole("spinbutton", { name: "Number of Project Snapshot pages" }).fill("3");
      await row.getByRole("button", { name: "Add Project Snapshot to product" }).click();
      await expect.poll(async () => Number((await page.locator(".page-counter").innerText()).match(/of (\d+)/)![1])).toBeGreaterThanOrEqual(before + 3);
      if (phone) {
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      }
      await page.context().close();
    }, 60_000);
  }

  for (const phone of [false, true]) {
    it(`${phone ? "phone" : "desktop"}: save a page design, reload, add 8 pages at once, reload, edit copy #4 — the others and the saved design stay as they were`, async () => {
      const page = await open(blank(), phone);
      await openArea(page, "add");
      for (const piece of ["Heading / text", "Writing lines", "Task list"]) await add(page, piece);
      const title = await section(page, 1);
      await title.getByRole("textbox", { name: "Heading" }).fill("Project Snapshot");
      const purpose = await section(page, 2);
      await purpose.getByRole("textbox", { name: "Heading" }).fill("Purpose");
      await purpose.getByRole("group", { name: "Writing space" }).getByRole("button", { name: "Compact" }).click();
      const save = page.getByTestId("save-design");
      await save.getByRole("textbox", { name: "Page design name" }).fill("Project Snapshot");
      await save.getByRole("button", { name: "Save", exact: true }).click();
      await expect.poll(() => save.getByRole("status").textContent()).toMatch(/Saved “Project Snapshot”/);
      // A second save under the same name is refused, never overwriting the design.
      await save.getByRole("textbox", { name: "Page design name" }).fill("project snapshot");
      await expect(save.getByRole("button", { name: "Save", exact: true }).isDisabled()).resolves.toBe(true);
      await expect(save.getByText(/already exists/).count()).resolves.toBeGreaterThan(0);

      // Close and reopen the project: the design is still there.
      const reopen = async () => {
        await page.waitForTimeout(700); // autosave
        await page.reload();
        await page.locator(".card").first().getByRole("button", { name: "Open" }).click();
        await page.waitForSelector(".ps-page--editor");
      };
      await reopen();
      await openArea(page, "pages");
      const design = page.locator('.builder-cat[data-category="designs"] .builder-row').first();
      await expect(design.textContent()).resolves.toMatch(/Project Snapshot/);
      // A small preview drawn by the real renderer.
      await expect.poll(() => design.locator(".page-thumb").count()).toBe(1);
      // 8 pages in one step.
      const before = Number((await page.locator(".page-counter").innerText()).match(/of (\d+)/)![1]);
      await design.getByRole("spinbutton", { name: "Number of Project Snapshot pages" }).fill("8");
      await design.getByRole("button", { name: "Add Project Snapshot to product" }).click();
      await expect.poll(async () => Number((await page.locator(".page-counter").innerText()).match(/of (\d+)/)![1])).toBe(before + 8);
      const group = page.locator(".builder-row--design").first();
      await expect(group.textContent()).resolves.toMatch(/Project Snapshot.*8 pages/);
      if (phone) {
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
        const add = await design.getByRole("button", { name: "Add Project Snapshot to product" }).boundingBox();
        expect(add!.height).toBeGreaterThanOrEqual(43);
      }
      await reopen();
      await openArea(page, "pages");
      await expect(page.locator(".builder-row--design").first().textContent()).resolves.toMatch(/8 pages/);

      // Edit copy #4 only.
      await page.locator(".builder-row--design").first().getByRole("button", { name: "Edit Project Snapshot pages" }).click();
      await page.getByRole("button", { name: "Edit Project Snapshot 4", exact: true }).click();
      await page.locator('section.area[data-area="add"]').waitFor();
      const p4 = await section(page, 2);
      await p4.getByRole("textbox", { name: "Heading" }).fill("Why this project");
      await expect.poll(() => page.locator(".ps-page--editor").first().textContent()).toMatch(/Why this project/);
      await page.waitForTimeout(700);
      const stored = await page.evaluate(() => {
        const key = Object.keys(localStorage).find((k) => k.startsWith("dove-product-studio:v1:project:"))!;
        const p = JSON.parse(localStorage.getItem(key)!);
        const group = p.recipe.structure.find((n: { designId?: string; kind: string }) => n.kind === "group" && n.designId);
        const label = (step: { promptSet: { blocks: { label: string }[] } }) => step.promptSet.blocks[1].label;
        return { copies: group.children.map(label), design: p.pageDesigns[0].promptSet.blocks[1].label };
      });
      expect(stored.copies).toEqual(["Purpose", "Purpose", "Purpose", "Why this project", "Purpose", "Purpose", "Purpose", "Purpose"]);
      expect(stored.design).toBe("Purpose");
      if (phone) expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      await page.context().close();
    }, 90_000);
  }

  it("Style: tapping the chosen palette again rearranges its colors; white paper keeps the palette; long choices never squeeze to three lines", async () => {
    const page = await open(blank(), false);
    await openArea(page, "add");
    await add(page, "Writing lines");
    const b = await section(page, 1);
    const fill = b.getByRole("group", { name: "Writing space" }).getByRole("button", { name: "Fill remaining space" });
    const lineH = await fill.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
    expect((await fill.boundingBox())!.height).toBeLessThanOrEqual(Math.max(44, lineH * 2 + 10));
    await openArea(page, "style");
    const stored = () => page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => k.startsWith("dove-product-studio:v1:project:"))!;
      return JSON.parse(localStorage.getItem(key)!).colors;
    });
    // Every palette card is tall enough for its swatches, name and brand (the highlight never runs through the name).
    await page.getByRole("button", { name: /^All \(/ }).click();
    const squeezed = await page.evaluate(() => [...document.querySelectorAll(".palette-card")].filter((c) => c.scrollHeight > c.clientHeight + 1).length);
    expect(squeezed).toBe(0);
    const current = page.locator('.palette-card[aria-pressed="true"]').first();
    const note = page.getByTestId("color-arrangement");
    if (await note.count()) {
      await expect(note.textContent()).resolves.toMatch(/arrangement 1 of \d/);
      await current.click();
      await expect.poll(() => note.textContent()).toMatch(/arrangement 2 of \d/);
      await expect.poll(async () => (await stored()).arrangement).toBe(1);
    }
    await page.getByRole("group", { name: "Paper" }).getByRole("button", { name: "White" }).click();
    await expect.poll(async () => (await stored()).paper).toBe("white");
    // A different palette keeps the white paper.
    await page.locator('.palette-card[aria-pressed="false"]').first().click();
    await expect.poll(async () => (await stored()).paper).toBe("white");
    await page.context().close();
  }, 60_000);

  it("regression: a new Custom Page with an empty page header prints no “Custom Page” — the page begins with STEP ONE", async () => {
    const page = await (await browser.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
    await page.goto(base);
    await page.evaluate(() => localStorage.clear());
    await page.goto(base);
    await page.locator("button.family-card", { hasText: /^Custom Page/ }).first().click();
    await page.waitForSelector("#wizard-build");
    await page.getByRole("button", { name: /^Create/ }).last().click();
    await page.waitForSelector(".ps-page--editor");
    await page.locator('section.area[data-area="add"]').waitFor();
    const drawn = page.locator(".ps-page--editor").first();
    // Before anything is added: nothing printed at the top.
    await expect.poll(() => drawn.textContent()).not.toMatch(/Custom Page/);
    for (const piece of ["Heading / text", "Heading / text", "Heading / text", "Heading / text", "Info row", "Writing lines"]) await add(page, piece);
    for (const [k, words] of ["STEP ONE", "01", "RECEIVE", "THE WORD"].entries()) {
      const s = await section(page, k + 1);
      await s.getByRole("textbox", { name: "Heading" }).fill(words);
    }
    await expect.poll(() => drawn.textContent()).toMatch(/THE WORD/);
    // The page header was never touched: every field is empty.
    const header = page.locator("details.prompt-header-editor");
    await header.evaluate((d) => ((d as HTMLDetailsElement).open = true));
    // Every text field is empty and no detail or rule is chosen (the dividing-lines option is on by default; it draws nothing without a header).
    for (const v of await header.locator('input[type="text"], textarea').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))) expect(v).toBe("");
    for (const name of ["Date", "Time", "Received through", "Type", "Short decorative rule under the header"]) expect(await header.getByRole("checkbox", { name }).isChecked(), name).toBe(false);
    const topmost = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll(".ps-page--editor .ps-text")].filter((t) => (t.textContent ?? "").trim());
      nodes.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      return nodes.map((t) => (t.textContent ?? "").trim());
    });
    expect(topmost[0]).toBe("STEP ONE");
    expect(topmost).not.toContain("Custom Page");
    // The page is still called “Custom Page” where pages are listed.
    await expect(page.getByTestId("page-label").innerText()).resolves.toMatch(/Custom Page/i);
    await page.context().close();
  }, 60_000);

  const pageCount = async (page: Page) => Number((await page.locator(".page-counter").innerText()).match(/of (\d+)/)![1]);
  const pageNo = async (page: Page) => Number(await page.getByLabel("Page number", { exact: true }).inputValue());
  const goToPage = async (page: Page, n: number) => {
    await page.getByLabel("Page number", { exact: true }).fill(String(n));
    await page.getByLabel("Page number", { exact: true }).press("Enter");
  };

  it("Duplicate page: Discern 1 → Discern 2, edit the copy, the original stays; both survive a reload", async () => {
    const page = await open(blank(), false);
    await openArea(page, "add");
    await add(page, "Heading / text");
    await add(page, "Prompt + response");
    await (await section(page, 1)).getByRole("textbox", { name: "Heading" }).fill("1");
    await (await section(page, 2)).getByRole("textbox", { name: "Prompt (optional)" }).fill("What is the cohesive message?");
    await page.waitForTimeout(800);
    const before = await pageCount(page);
    const original = await pageNo(page);
    await page.getByRole("button", { name: "Duplicate page" }).click();
    await expect.poll(() => pageCount(page)).toBe(before + 1);
    // The editor now shows the copy.
    await expect.poll(() => pageNo(page)).toBe(original + 1);
    await expect.poll(() => page.getByTestId("this-page").innerText()).toMatch(/Master Dashboard 2/);
    await (await section(page, 1)).getByRole("textbox", { name: "Heading" }).fill("2");
    await (await section(page, 2)).getByRole("textbox", { name: "Prompt (optional)" }).fill("What confirms it?");
    const pageText = async (n: number) => {
      await goToPage(page, n);
      await expect.poll(() => pageNo(page)).toBe(n);
      return (await page.locator(".ps-page--editor").first().textContent()) ?? "";
    };
    await expect.poll(async () => pageText(original + 1)).toMatch(/What confirms it\?/);
    const first = await pageText(original);
    expect(first).toMatch(/What is the cohesive message\?/);
    expect(first).not.toMatch(/What confirms it/);
    await page.waitForTimeout(800);
    await page.reload();
    await page.locator(".card").first().getByRole("button", { name: "Open" }).click();
    await page.waitForSelector(".ps-page--editor");
    expect(await pageCount(page)).toBe(before + 1);
    expect(await pageText(original)).toMatch(/What is the cohesive message\?/);
    expect(await pageText(original + 1)).toMatch(/What confirms it\?/);
    await page.context().close();
  }, 90_000);

  it("Page header: step, titles and details from one panel — one compact header, details as separate labelled lines", async () => {
    const page = await open(blank(), false);
    await openArea(page, "add");
    await add(page, "Writing lines");
    const header = page.getByTestId("page-header");
    await header.evaluate((d) => ((d as HTMLDetailsElement).open = true));
    await header.getByRole("textbox", { name: "Step label" }).fill("STEP ONE");
    await header.getByRole("textbox", { name: "Step number" }).fill("01");
    await header.getByRole("textbox", { name: /^Overline/ }).fill("PROPHETIC WORD");
    await header.getByRole("textbox", { name: "Main title" }).fill("RECEIVE");
    await header.getByRole("textbox", { name: "Subtitle", exact: true }).fill("THE WORD");
    for (const m of ["Date", "Time", "Received through", "Type"]) await header.getByRole("checkbox", { name: m }).check();
    const drawn = page.locator(".ps-page--editor").first();
    await expect.poll(() => drawn.locator('[data-node$="-intro-meta3-label"]').count()).toBe(1);
    const box = (sel: string) => drawn.locator(sel).first().boundingBox();
    const title = (await box('[data-node$="-intro-title"]'))!, step = (await box('[data-node$="-intro-eyebrow"]'))!, date = (await box('[data-node$="-intro-meta0-label"]'))!;
    // Step at the left, title in the middle, details at the right — all in one band at the top.
    expect(step.x).toBeLessThan(title.x);
    expect(date.x).toBeGreaterThan(title.x);
    expect(Math.abs(step.y - title.y)).toBeLessThan(title.height);
    for (const m of ["Date", "Time", "Received through", "Type"]) await expect(drawn.textContent()).resolves.toContain(m);
    await expect(drawn.textContent()).resolves.not.toMatch(/DATE \| TIME|Date \| Time/);
    const writing = (await box('[data-node$="-title"]:not([data-node*="-intro-"])'))!;
    expect(writing.y).toBeGreaterThan(date.y);
    await expect.poll(async () => (await page.locator(".badge").first().textContent()) ?? "").toMatch(/Page OK/);
    await page.context().close();
  }, 60_000);

  it("Undo and Redo: buttons and keyboard", async () => {
    const page = await open(blank(), false);
    await openArea(page, "add");
    const undo = page.getByRole("button", { name: "Undo", exact: true }), redo = page.getByRole("button", { name: "Redo", exact: true });
    await expect(undo.isDisabled()).resolves.toBe(true);
    const count = () => page.getByTestId("prompt-editor").first().locator(".prompt-block").count();
    await add(page, "Writing lines");
    await page.waitForTimeout(800);
    await add(page, "Divider line");
    await expect.poll(count).toBe(2);
    await undo.click();
    await expect.poll(count).toBe(1);
    await undo.click();
    await expect.poll(count).toBe(0);
    await expect(undo.isDisabled()).resolves.toBe(true);
    await redo.click();
    await expect.poll(count).toBe(1);
    // Keyboard, outside a text box.
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Control+Shift+Z");
    await expect.poll(count).toBe(2);
    await page.keyboard.press("Control+Z");
    await expect.poll(count).toBe(1);
    // A new change clears what could be redone.
    await add(page, "Spacer / open space");
    await expect(redo.isDisabled()).resolves.toBe(true);
    await page.context().close();
  }, 60_000);
});

/**
 * Neutral Cheetah Luxe uses Sydni's own leopard art (the "Plan with purpose" Canva export), never drawn spots;
 * and a title whose narrower "look" zone is too tight takes the full width before it is reported.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { LEOPARD_ART } from "../src/design-library/leopardArt";
import { renderToStaticMarkup } from "react-dom/server";
import { geometryFor, resolveDocument, solvePage } from "../src/engines/document/resolve";
import { PrintablePage } from "../src/primitives/PrintablePage";
import { step } from "../src/presets/bookRecipes";
import { neutralLuxeDividers } from "../src/presets/bookRecipes";
import { createProject } from "../src/presets/products/projectFactory";

const luxeProject = (size: string) =>
  createProject("planner", { name: "Leopard QA", dimensions: { sizePresetId: size }, colors: { paletteId: "neutral-cheetah-luxe" }, recipe: { items: [], ordering: "sequential", structure: neutralLuxeDividers() } });

const markup = (doc: ReturnType<typeof resolveDocument>, i: number, mode: "editor" | "print") =>
  renderToStaticMarkup(<PrintablePage geometry={geometryFor(doc, doc.recipe.pages[i])} solved={solvePage(doc, i)} colors={doc.colors} typography={doc.typography} decorative={doc.decorative} mode={mode} />);

describe("the leopard print is Sydni's artwork", () => {
  it("cheetah circles are filled with the embedded art image — the same in preview and print — and no drawn spots", () => {
    const doc = resolveDocument(luxeProject("7x9"));
    const i = doc.recipe.pages.findIndex((p) => p.layoutId === "cover-page");
    const html = markup(doc, i, "print");
    expect(html).toMatch(/<pattern[^>]*><image[^>]*href="data:image\/jpeg;base64,/);
    // Two leopard fills: the art, and the art turned half a turn for the second circle.
    expect(html.match(/<pattern /g)?.length).toBe(2);
    expect(html).toContain('transform="rotate(180 0.5 0.5)"');
    expect(html).not.toMatch(/<pattern[^>]*>(?:(?!<\/pattern>).)*<circle/s);
    const leopards = solvePage(doc, i).nodes.filter((n) => n.type === "circle" && n.leopard);
    expect(leopards.length).toBeGreaterThanOrEqual(2);
    expect(markup(doc, i, "editor").replace("ps-page--editor", "")).toBe(html.replace("ps-page--print", ""));
  });
});

it("the embedded leopard art is byte-for-byte the recorded asset", () => {
  const file = readFileSync(new URL("../src/design-library/assets/leopard-plan-with-purpose.jpg", import.meta.url));
  expect(createHash("sha1").update(file).digest("hex")).toBe("b3f1b4f59453cd7698011b67bdfd0d614aa0918e");
  expect(LEOPARD_ART).toBe(`data:image/jpeg;base64,${file.toString("base64")}`);
});

describe("divider titles on small tabbed pages", () => {
  for (const title of ["Prayer", "Schedule", "Wellness", "Finances"]) {
    it(`Filofax Personal, 9 tabs: "${title}" fits (the narrower look zone widens before anything is reported)`, () => {
      const p = luxeProject("filofax-personal");
      p.recipe.structure = [step("divider-page", { type: "once" }, { title, cover: { tab: { show: true, style: "rounded", count: 9, order: 1 } } })];
      const doc = resolveDocument(p);
      const t = solvePage(doc, 0).nodes.find((n) => n.id === "cover-title")!;
      expect(t.type === "text" && !t.fit?.failed, title).toBe(true);
    });
  }
});

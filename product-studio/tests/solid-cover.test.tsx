import { describe, expect, it } from "vitest";
import { createProject } from "../src/presets/products/projectFactory";
import { step } from "../src/presets/bookRecipes";
import { geometryFor, resolveDocument, solvePage } from "../src/engines/document/resolve";

function solidProject(showText = true) {
  const p = createProject("journal", {
    name: "Solid cover QA",
    dimensions: { sizePresetId: "6x9" },
    recipe: {
      items: [],
      ordering: "sequential",
      structure: [
        step("cover-page", { type: "once" }, {
          title: "Prophetic Word Journal",
          cover: {
            preset: "solid",
            solidColor: "primary",
            solidTextColor: "background",
            showText,
            subtitle: "FROM REVELATION TO EXECUTION",
          },
        }),
        step("lined-journal", { type: "once" }),
        step("back-cover", { type: "once" }, {
          cover: {
            preset: "solid",
            solidColor: "primary",
            solidTextColor: "background",
            showText,
            subtitle: "DOVE EXPRESSIONS",
          },
        }),
      ],
    },
  });
  return p;
}

describe("Solid cover", () => {
  it("fills the whole output media and keeps editable wording on the front", () => {
    const doc = resolveDocument(solidProject(true));
    const i = doc.recipe.pages.findIndex((p) => p.layoutId === "cover-page");
    const pg = doc.recipe.pages[i], g = geometryFor(doc, pg), s = solvePage(doc, i);
    const bg = s.nodes.find((n) => n.id === "cover-solid-bg");
    expect(bg?.type).toBe("box");
    expect(bg?.rect).toEqual({ x: -g.trimOffset.x, y: -g.trimOffset.y, w: g.mediaWidthIn, h: g.mediaHeightIn });
    expect(bg && bg.type === "box" ? bg.fill : null).toBe("primary");
    const title = s.nodes.find((n) => n.id === "cover-title");
    expect(title?.type).toBe("text");
    expect(title && title.type === "text" ? title.text : "").toBe("Prophetic Word Journal");
    expect(s.ownArtwork).toBe(true);
  });

  it("can be artwork/color only, with no printed words", () => {
    const doc = resolveDocument(solidProject(false));
    for (const layoutId of ["cover-page", "back-cover-page"]) {
      const i = doc.recipe.pages.findIndex((p) => p.layoutId === layoutId);
      const s = solvePage(doc, i);
      expect(s.nodes.some((n) => n.id === "cover-solid-bg")).toBe(true);
      expect(s.nodes.some((n) => n.type === "text")).toBe(false);
      expect(s.ownArtwork).toBe(true);
    }
  });
});

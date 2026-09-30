/** Reported: '"Every year" needs the project's date range.' didn't say which page, or what to do. */
import { expect, it } from "vitest";
import { createProject } from "../src/presets/products/projectFactory";
import { step } from "../src/presets/bookRecipes";
import { resolveDocument } from "../src/engines/document/resolve";
import { validateProject } from "../src/engines/validation/validate";
import { heuristicMeasurer } from "../src/engines/typography/textMeasure";

it("an undated product with a yearly page names that page and both fixes", () => {
  const p = createProject("journal", { name: "Undated", dimensions: { sizePresetId: "6x9" }, recipe: { items: [], ordering: "sequential", structure: [step("lined-journal", { type: "once" }), step("goals", { type: "yearly" }, { title: "Goals for the year" })] } } as never);
  const p2 = { ...p, calendar: undefined } as never;
  resolveDocument(p2);
  const msgs = validateProject(p2, heuristicMeasurer).issues.filter((i) => i.severity === "error").map((i) => i.message);
  const m = msgs.find((x) => /no dates/.test(x));
  expect(m, msgs.join(" | ")).toContain("Goals for the year");
  expect(m).toMatch(/number of copies/);
  expect(m).toMatch(/start and end date/);
});

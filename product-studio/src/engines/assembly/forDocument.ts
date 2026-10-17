/**
 * The hardcover plan for a product as it stands: its trim (as oriented), its binding and the binding edge the
 * front cover shows from outside. Recomputed whenever any of those or the maker's materials change.
 */
import { HARDCOVER_DEFAULTS, hardcoverPlan, type HardcoverPlan, type HardcoverSettings } from "./hardcover";
import type { ResolvedDocument } from "../document/resolve";
import type { Edge } from "../../types/geometry";

/** The product's hardcover settings, or null when the maker hasn't turned hardcover on. */
export const hardcoverSettingsOf = (doc: ResolvedDocument): HardcoverSettings | null => {
  const h = doc.project.production.hardcover;
  return h?.enabled ? { ...HARDCOVER_DEFAULTS, ...h, laminate: { ...HARDCOVER_DEFAULTS.laminate, ...h.laminate } } : null;
};

/** The front cover's binding edge seen from outside: the product's chosen bound edge, else the binding's default. */
export const frontBoundEdge = (doc: ResolvedDocument): Edge => doc.project.production.boundEdge ?? doc.binding.defaultBoundEdge ?? "left";

export function hardcoverPlanFor(doc: ResolvedDocument, settings = hardcoverSettingsOf(doc)): HardcoverPlan | null {
  if (!settings) return null;
  return hardcoverPlan({ w: doc.trim.widthIn, h: doc.trim.heightIn }, doc.project.production.bindingType, frontBoundEdge(doc), settings);
}

/**
 * COVER STUDIO — the production specification of one cover: trim, bleed, safe zone, spine and canvas pixels.
 *
 * The numbers come from Product Studio's own systems, not from a generic formula:
 *   · trim        → size presets + dimension engine (resolveTrim / validateDimensions)
 *   · bleed       → 0 = no bleed; any bleed asked for is raised to the print profile's own minimum
 *   · safe zone   → the geometry engine (computePageGeometry): printer live margin, and — for bindings that are
 *                   punched or glued through the cover (coil, wire-o, disc, rings, glued pads) — the binding keep-out
 *   · spine/hinge → never invented. A full wrap needs the printer-confirmed spine width. Published printer values
 *                   (KDP's per-page spine formula, IngramSpark's case-wrap bleed and hinge) are used where they exist.
 * A perfect-bound / case-bound / saddle-stitched book's interior gutter rule does not apply to its cover, so those
 * covers are laid out with the unbound geometry (printer margins only) plus the fold allowances above.
 */
import { INGRAM_SPARK, KDP } from "../../data/research/printerSpecs";
import { getBindingProfile } from "../../presets/bindingProfiles/bindingProfiles";
import { getPrintProfile } from "../../presets/printProfiles/printProfiles";
import { SIZE_PRESETS } from "../../presets/sizes/sizePresets";
import type { BindingType } from "../../types/binding";
import type { KeepOutZone, PageGeometry } from "../../types/geometry";
import type { Orientation } from "../../types/geometry";
import { resolveTrim, validateDimensions } from "../geometry/dimensions";
import { computePageGeometry } from "../geometry/pageGeometry";
import { measurementIn, toInches } from "../units/units";
import type { CoverBrief } from "./brief";
import { BINDING_TYPE, isWrapProduct, parseSize } from "./guides";

export const fmt = (x: number): string => Number(x.toFixed(3)).toString();

export type CoverSpec = {
  /** False when the size itself is invalid: there is nothing to build a canvas from. */
  ok: boolean;
  /** Reasons the size is invalid. */
  errors: string[];
  /** Things the maker should know, never blocking by themselves. */
  warnings: string[];
  product: string;
  wrap: boolean;
  binding: BindingType;
  printProfileId: string;
  trimW: number;
  trimH: number;
  /** Bleed actually used on each edge (the maker's, raised to the printer's minimum). */
  bleed: number;
  /** Set when the printer's minimum raised the maker's bleed. */
  bleedNote: string | null;
  /** Safe distance from the trim on each physical edge (top / right / bottom / left). */
  safe: { top: number; right: number; bottom: number; left: number };
  /** "0.25 inches inside the trim", or the per-edge wording when a binding keep-out differs. */
  safeText: string;
  /** The printer-confirmed spine width the maker entered (inches); null = not given. */
  spine: number | null;
  /** Fold allowance each side of the spine where the printer publishes one (IngramSpark case wrap). */
  hinge: number | null;
  /** A full wrap without a spine width: the concept can be drafted, but a final wrap cannot be created. */
  needsSpine: boolean;
  canvasW: number;
  canvasH: number;
  pxW: number;
  pxH: number;
  dpi: number;
  /** Binding / glue keep-outs from the geometry engine (empty for unbound and for book-bound covers). */
  keepOuts: KeepOutZone[];
  geometry: PageGeometry | null;
  /** Printer-published spine value for this page count, to offer (never applied automatically). */
  spineSuggestion: { white: number; cream: number; note: string } | null;
  /** The one-line note under the specification (the generator's wording). */
  note: string;
};

/** A size preset whose trim equals w × h inches, so the engine's own preset (with its research) is used. */
function presetFor(w: number, h: number): string | null {
  const p = SIZE_PRESETS.find((s) => {
    const a = toInches(s.short, s.unit), b = toInches(s.long, s.unit);
    return Math.abs(a - Math.min(w, h)) < 1e-6 && Math.abs(b - Math.max(w, h)) < 1e-6;
  });
  return p?.id ?? null;
}

/** Whether the binding goes through the cover (punched or glued) so its keep-out applies there. */
const throughCover = (bt: BindingType): boolean => {
  const b = getBindingProfile(bt);
  return !!b.punch || !!b.glueBand || b.boundEdgeMode === "punched-leaf" || b.boundEdgeMode === "glued-edge";
};

export function resolveCoverSpec(brief: CoverBrief, over: { product?: string; size?: string } = {}): CoverSpec {
  const product = over.product ?? brief.product;
  const size = over.size ?? brief.size;
  const wrap = brief.format === "wrap" && isWrapProduct(product);
  const bindingType: BindingType = BINDING_TYPE[brief.binding] ?? "none";
  const profile = getPrintProfile(brief.printProfile);
  const dpi = brief.dpi;
  const warnings: string[] = [];

  const base: CoverSpec = {
    ok: false, errors: [], warnings, product, wrap, binding: bindingType, printProfileId: profile.id, trimW: 0, trimH: 0, bleed: brief.bleed, bleedNote: null,
    safe: { top: brief.safe, right: brief.safe, bottom: brief.safe, left: brief.safe }, safeText: `${fmt(brief.safe)} inches inside the trim`, spine: brief.spine, hinge: null,
    needsSpine: wrap && !brief.spine, canvasW: 0, canvasH: 0, pxW: 0, pxH: 0, dpi, keepOuts: [], geometry: null, spineSuggestion: null, note: "",
  };

  // Trim: the dimension engine's own validation and resolution.
  const parsed = size === "Custom" ? ([brief.customW, brief.customH] as [number, number]) : parseSize(size);
  if (!parsed) return { ...base, errors: [`“${size}” is not a size Product Studio knows.`] };
  const [w0, h0] = parsed;
  const preset = size === "Custom" ? null : presetFor(w0, h0);
  const dims = preset
    ? { sizePresetId: preset, orientation: "portrait" as Orientation }
    : { sizePresetId: "custom", custom: { width: w0, height: h0, unit: "in" as const }, orientation: (w0 > h0 ? "landscape" : "portrait") as Orientation };
  const errors = validateDimensions(dims).map((e) => e.message);
  if (errors.length) return { ...base, errors };
  const trim = resolveTrim(dims);
  const trimW = trim.widthIn, trimH = trim.heightIn;

  // Bleed: the printer's own is the floor. IngramSpark's case wrap publishes a larger one.
  const caseWrapIngram = profile.id === "ingramspark" && bindingType === "case-bound" && wrap;
  const profileBleed = profile.bleedRules.bleed && profile.bleedRules.edges !== "none" ? measurementIn(profile.bleedRules.bleed) : 0;
  const floor = caseWrapIngram ? measurementIn(INGRAM_SPARK.caseWrapBleed) : profileBleed;
  // Bleed 0 is a no-bleed build (a digital file, or a printer that trims without bleed): the floor applies only when bleed is asked for.
  const wantsBleed = brief.bleed > 0;
  const bleed = wantsBleed ? Math.max(brief.bleed, floor) : 0;
  const bleedNote = wantsBleed && bleed > brief.bleed + 1e-9 ? `${profile.label} needs at least ${fmt(floor)} in of bleed${caseWrapIngram ? " on a case wrap" : ""}, so ${fmt(bleed)} in is used.` : null;
  if (!wantsBleed && floor > 0) warnings.push(`No bleed: ${profile.label} prints covers with ${fmt(floor)} in of bleed, so artwork without it can show a white edge after trimming.`);
  const hinge = caseWrapIngram ? measurementIn(INGRAM_SPARK.caseWrapHinge) : null;

  // Safe zone: the geometry engine. A book-bound cover has no interior gutter, so it uses the unbound geometry.
  const binding = getBindingProfile(throughCover(bindingType) ? bindingType : "none");
  const geometry = computePageGeometry({
    trim: { widthIn: trimW, heightIn: trimH, orientation: trim.orientation },
    binding,
    printProfile: profile,
    includeBleed: wantsBleed,
    pageCount: brief.pages ?? 0,
    side: "single",
    duplex: false,
    userMargins: { top: brief.safe, bottom: brief.safe, inside: brief.safe, outside: brief.safe },
  });
  const safe = { ...geometry.safe };
  const values = [safe.top, safe.right, safe.bottom, safe.left];
  const uniform = Math.max(...values) - Math.min(...values) < 1e-9;
  const bound = geometry.boundEdge;
  let safeText = `${fmt(safe.top)} inches inside the trim`;
  if (!uniform) {
    const others = (["top", "right", "bottom", "left"] as const).filter((e) => e !== bound);
    const otherMax = Math.max(...others.map((e) => safe[e])), otherMin = Math.min(...others.map((e) => safe[e]));
    safeText = bound && otherMax - otherMin < 1e-9
      ? `${fmt(otherMax)} inches inside the trim, and ${fmt(safe[bound])} inches inside the ${bound} edge where the ${binding.label.toLowerCase()} goes through the cover`
      : `inside the trim by ${(["top", "right", "bottom", "left"] as const).map((e) => `${fmt(safe[e])} in (${e})`).join(", ")}`;
  }
  if (wrap && hinge) safeText += `, and ${fmt(hinge)} inches either side of each spine fold`;

  // The wrap's canvas needs the spine; without it the width is the two panels (a draft, never final).
  const spine = brief.spine && brief.spine > 0 ? brief.spine : null;
  const sw = wrap ? spine ?? 0 : 0;
  const canvasW = (wrap ? 2 * trimW + sw : trimW) + 2 * bleed;
  const canvasH = trimH + 2 * bleed;

  // Page-count and binding rules from the printer and binding profiles.
  const pages = brief.pages ?? 0;
  if (bindingType !== "none" && !profile.bindingRules.supported.includes(bindingType)) warnings.push(`${profile.label} does not list ${brief.binding.toLowerCase()} binding: confirm with the printer.`);
  const pr = profile.pageCountRules, br = getBindingProfile(bindingType).pageCountRules;
  if (pages > 0 && bindingType !== "none") {
    const min = Math.max(pr?.minPages ?? 0, br?.minPages ?? 0), max = Math.min(pr?.maxPages ?? Infinity, br?.maxPages ?? Infinity);
    if (min && pages < min) warnings.push(`${brief.binding} at ${profile.label} needs at least ${min} pages; this is ${pages}.`);
    if (max < Infinity && pages > max) warnings.push(`${brief.binding} at ${profile.label} allows at most ${max} pages; this is ${pages}.`);
    const mult = br?.multipleOf;
    if (mult && pages % mult !== 0) warnings.push(`${brief.binding} page counts are multiples of ${mult}; ${pages} is not.`);
  }
  if (bleedNote) warnings.push(bleedNote);

  // KDP publishes a per-page spine width: offered, never applied by itself.
  const spineSuggestion = profile.id === "kdp" && bindingType === "perfect-bound" && wrap && pages >= KDP.minPages
    ? {
        white: Number((pages * measurementIn(KDP.spinePerPage.white)).toFixed(3)),
        cream: Number((pages * measurementIn(KDP.spinePerPage.cream)).toFixed(3)),
        note: "Amazon KDP's published per-page formula (white paper 0.002252 in, cream 0.0025 in per page). Confirm with KDP's cover calculator before using it.",
      }
    : null;

  const note = wrap && !spine
    ? "Full wrap needs a printer-confirmed spine width. Enter it above to finalize canvas width. Page count alone cannot determine spine width because paper stock and binding vary."
    : brief.medium === "Digital"
      ? "Digital output uses these pixel dimensions as an export target. Confirm the destination platform’s preferred size."
      : "Confirm the printer’s template, fold/hinge allowances, and cover stock before final export.";

  return {
    ok: true, errors: [], warnings, product, wrap, binding: bindingType, printProfileId: profile.id, trimW, trimH, bleed, bleedNote, safe, safeText, spine, hinge,
    needsSpine: wrap && !spine, canvasW, canvasH, pxW: Math.round(canvasW * dpi), pxH: Math.round(canvasH * dpi), dpi, keepOuts: geometry.keepOuts, geometry, spineSuggestion, note,
  };
}

/** The specification as one line (what "Copy specs" copies and the brief download starts with). */
export function specLine(brief: CoverBrief, spec: CoverSpec): string {
  const v = [spec.safe.top, spec.safe.right, spec.safe.bottom, spec.safe.left];
  const inset = Math.max(...v) - Math.min(...v) < 1e-9 ? `${fmt(v[0])} in from trim` : `${(["top", "right", "bottom", "left"] as const).map((e) => `${fmt(spec.safe[e])} in ${e}`).join(", ")} from trim`;
  return `${spec.product} | ${spec.wrap ? "full wrap" : "front only"} | trim ${fmt(spec.trimW)} × ${fmt(spec.trimH)} in | canvas ${fmt(spec.canvasW)} × ${fmt(spec.canvasH)} in (${spec.pxW} × ${spec.pxH} px at ${spec.dpi} DPI) | bleed ${fmt(spec.bleed)} in each outer edge | safe inset ${inset} | ${brief.binding} | ${brief.pages ?? ""} pages | spine ${spec.spine ? fmt(spec.spine) : "printer confirmation required"} in | ${brief.medium}`;
}

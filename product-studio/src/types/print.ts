import type { Measurement } from "./measurement";
import type { BindingType } from "./binding";

export type BleedEdgesRule = "outer-three" | "all-four" | "none";

export type GutterRule =
  | { kind: "none" }
  | {
      /** Required gutter from a page-count table (KDP). */
      kind: "page-count-table";
      bands: { minPages: number; maxPages: number; gutter: Measurement }[];
    }
  | {
      /**
       * Lulu publishes a hard minimum gutter plus a RECOMMENDED total inside
       * margin by page count. Only the minimum is a requirement; the table is
       * surfaced as the printer's recommendation.
       */
      kind: "minimum-plus-recommended-table";
      minimum: Measurement;
      bands: { minPages: number; maxPages: number; inside: Measurement; insideFullBleed: Measurement }[];
    }
  | { kind: "flat"; gutter: Measurement };

export type PrintProfile = {
  id: string;
  label: string;
  description: string;
  kind: "pod-book" | "commercial" | "binding-generic" | "custom";

  bleedRules: {
    bleed: Measurement | null;
    edges: BleedEdgesRule;
  };

  /** Minimum live margin from trim on all edges (printer requirement). */
  safeMargins: {
    noBleed: Measurement | null;
    withBleed: Measurement | null;
  };

  gutterRules: GutterRule;

  pageCountRules?: {
    minPages?: number;
    maxPages?: number;
    multipleOf?: number;
  };

  bindingRules: {
    supported: BindingType[];
  };

  /** Size preset ids; "any" means custom trims accepted. */
  supportedSizes: string[] | "any";

  printVariance?: Measurement;
  notes: string[];
};

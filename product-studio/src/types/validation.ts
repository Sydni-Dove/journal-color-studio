export type ValidationSeverity = "error" | "warning" | "info";

export type ValidationRule =
  | "invalid-dimensions"
  | "negative-geometry"
  | "safe-area"
  | "binding-keep-out"
  | "glue-keep-out"
  | "bleed"
  | "component-bounds"
  | "text-overflow"
  | "heading-fit"
  | "text-too-small"
  | "line-overflow"
  | "grid-overflow"
  | "calendar-overflow"
  | "footer-collision"
  | "page-number-collision"
  | "layout-solver"
  | "page-count"
  | "printer-profile"
  | "decoration"
  | "text-collision"
  | "layout-incompatible"
  | "min-cell"
  | "min-writing-area"
  | "sidebar-balance"
  | "decoration-clipped"
  | "decoration-no-room"
  | "decoration-overlap"
  | "decoration-dead-space"
  | "decoration-outside-region"
  | "decoration-too-close"
  | "decoration-bleed-contained"
  | "title-rule-gap"
  | "label-border-inset"
  | "text-region";

export type ValidationIssue = {
  severity: ValidationSeverity;
  rule: ValidationRule;
  /** 1-based page number; null for product-level issues. */
  page: number | null;
  componentId: string | null;
  message: string;
  measurement?: {
    actual: number;
    limit: number;
    unit: "in" | "pt" | "pages";
  };
};

export type ValidationReport = {
  issues: ValidationIssue[];
  errorCount: number;
  warningCount: number;
  checkedPages: number;
  /** Export is blocked while errorCount > 0. */
  exportAllowed: boolean;
};

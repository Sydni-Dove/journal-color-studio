import { DEFAULT_FUNCTIONAL_PATTERN } from "../../engines/patterns/patterns";
import { DEFAULT_FONTS } from "../typography/typography";
import { STUDIO_PLANNER, STUDIO_PAD } from "../studioDefaults";
import type { DecorativeTheme } from "../../types/theme";
import type { LayoutOptions, ProductProject } from "../../types/project";
import { PROJECT_SCHEMA_VERSION } from "../../types/project";
import { PRODUCT_TYPES } from "./productTypes";
import type { ProductType } from "../../types/product";

export const DEFAULT_LAYOUT_OPTIONS: LayoutOptions = {
  datePlacement: "top-left",
  showSidebar: false,
  sidebarContent: "notes",
  sidebarWidthIn: STUDIO_PLANNER.monthlySidebar.valueIn,
  sectionsPerDay: STUDIO_PLANNER.sectionsPerDay,
  hourStart: STUDIO_PLANNER.hourStart,
  hourEnd: STUDIO_PLANNER.hourEnd,
  halfHours: false,
  writingRowsPerDay: STUDIO_PLANNER.deskPadWritingRows,
  showPageNumbers: false,
  showFooter: false,
  dailySections: ["schedule", "priorities", "toDo", "notes"],
  promptText: "",
};

export const DEFAULT_DECORATIVE: DecorativeTheme = {
  style: "none",
  placement: "full-page",
  scale: 1,
  opacity: 1,
  colorA: "decorBase",
  colorB: "decorativeAccent",
  colorC: "decorHighlight",
  applyToInterior: false,
};

export function newId(prefix = "p"): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

/** Template patch: nested settings objects may be partial. */
export type ProjectPatch = Omit<
  Partial<ProductProject>,
  "dimensions" | "production" | "typography" | "colors" | "spacing" | "functionalPattern" | "decorativeTheme" | "layoutOptions" | "exportSettings"
> & {
  dimensions?: Partial<ProductProject["dimensions"]>;
  production?: Partial<ProductProject["production"]>;
  typography?: Partial<ProductProject["typography"]>;
  colors?: Partial<ProductProject["colors"]>;
  spacing?: Partial<ProductProject["spacing"]>;
  functionalPattern?: Partial<ProductProject["functionalPattern"]>;
  decorativeTheme?: Partial<ProductProject["decorativeTheme"]>;
  layoutOptions?: Partial<ProductProject["layoutOptions"]>;
  exportSettings?: Partial<ProductProject["exportSettings"]>;
};

/** Merge a template patch onto a complete default project. */
export function createProject(productType: ProductType, patch: ProjectPatch = {}): ProductProject {
  const def = PRODUCT_TYPES[productType];
  const now = new Date().toISOString();
  const base: ProductProject = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: newId(),
    name: `Untitled ${def.label}`,
    productType,
    dimensions: { sizePresetId: def.suggestedSizes[0], orientation: "portrait" },
    production: {
      bindingType: def.defaultBinding,
      printProfileId: def.defaultPrintProfile,
      includeBleed: false,
      duplex: false,
      sheetsPerPad: def.capabilities.supportsRepeatedSheets ? STUDIO_PAD.defaultSheets : undefined,
    },
    recipe: { items: [], ordering: "chronological" },
    wording: {},
    typography: { fonts: { ...DEFAULT_FONTS }, roleOverrides: {} },
    colors: { paletteId: "dove-signature", overrides: {} },
    spacing: { density: "balanced", overrides: {} },
    functionalPattern: { ...DEFAULT_FUNCTIONAL_PATTERN },
    decorativeTheme: { ...DEFAULT_DECORATIVE },
    layoutOptions: { ...DEFAULT_LAYOUT_OPTIONS },
    exportSettings: { scope: "full", repeatSheets: false, target: "print-pdf" },
    variants: [],
    activeVariantId: null,
    origin: { kind: "product-studio" },
    createdAt: now,
    updatedAt: now,
  };
  return {
    ...base,
    ...patch,
    dimensions: { ...base.dimensions, ...patch.dimensions },
    production: { ...base.production, ...patch.production },
    typography: { ...base.typography, ...patch.typography },
    colors: { ...base.colors, ...patch.colors },
    spacing: { ...base.spacing, ...patch.spacing },
    functionalPattern: { ...base.functionalPattern, ...patch.functionalPattern },
    decorativeTheme: { ...base.decorativeTheme, ...patch.decorativeTheme },
    layoutOptions: { ...base.layoutOptions, ...patch.layoutOptions },
    exportSettings: { ...base.exportSettings, ...patch.exportSettings },
  };
}

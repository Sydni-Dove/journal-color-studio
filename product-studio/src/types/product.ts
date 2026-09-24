export type ProductType =
  | "planner"
  | "journal"
  | "notebook"
  | "notepad"
  | "deskpad"
  | "insert"
  | "worksheet"
  | "tracker"
  | "custom";

export type ProductCapabilities = {
  supportsCalendar: boolean;
  supportsBinding: boolean;
  supportsPageRecipes: boolean;
  supportsRepeatedSheets: boolean;
  supportsMirroredPages: boolean;
  supportsPatterns: boolean;
  supportsSpreads: boolean;
};

export type ProductTypeDefinition = {
  id: ProductType;
  label: string;
  description: string;
  capabilities: ProductCapabilities;
  defaultBinding: import("./binding").BindingType;
  allowedBindings: import("./binding").BindingType[];
  defaultPrintProfile: string;
  /** Size preset ids offered first for this product type. */
  suggestedSizes: string[];
};

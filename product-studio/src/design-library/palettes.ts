/**
 * Journal Color Studio palettes — one-way snapshot (JCS PALETTES table at
 * commit 8282a74), adapted to Product Studio's semantic color tokens.
 *
 * JCS role → Product Studio token
 *   stone     → decorBase        (marble stone / floral leaves)
 *   vein      → decorativeAccent (marble veins)
 *   highlight → decorHighlight   (marble highlights / soft flowers)
 *   plate     → primary          (headings, deep flowers)
 *   frame     → border           (rules and boxes)
 *   trim      → accent           (gold detail)
 *   paper     → background
 *   line      → line             (already a light tint; drawn at full strength)
 *   text      = darkest of frame / stone / plate / title (legible ink on paper)
 */
import type { ColorPalette, ColorTokens } from "../types/tokens";

type JcsPalette = { name: string; stone: string; vein: string; highlight: string; plate: string; frame: string; trim: string; title: string; paper: string; line: string };

const JCS_PALETTES: JcsPalette[] = [
  { name: "Your Canva Cover", stone: "#050505", vein: "#C8A769", highlight: "#FFFFFF", plate: "#131313", frame: "#111111", trim: "#D4B06A", title: "#FFFFFF", paper: "#FFFFFF", line: "#B8A58A" },
  { name: "Blush Watercolor", stone: "#F7CACC", vein: "#C8AE70", highlight: "#3A1519", plate: "#FFF7F6", frame: "#8E4B57", trim: "#C8AE70", title: "#8E2F3F", paper: "#FFFBFA", line: "#E3B7BC" },
  { name: "Gold Leaf", stone: "#FBF8F3", vein: "#C9A55E", highlight: "#FFFFFF", plate: "#FFFFFF", frame: "#1E1B18", trim: "#C9A55E", title: "#1E1B18", paper: "#FFFFFF", line: "#D8CBB4" },
  { name: "White Marble", stone: "#F8F8F7", vein: "#8C8C90", highlight: "#FFFFFF", plate: "#FFFFFF", frame: "#222222", trim: "#BFA06A", title: "#222222", paper: "#FFFFFF", line: "#CFCFCF" },
  { name: "Floral Garden", stone: "#718365", vein: "#CBA15F", highlight: "#F0B5AA", plate: "#8C1830", frame: "#63202E", trim: "#CBA15F", title: "#FFFFFF", paper: "#FFFFFF", line: "#E3C4C9" },
  { name: "Original Black + Gold", stone: "#141212", vein: "#C9A05A", highlight: "#F1E6CC", plate: "#2A070E", frame: "#151313", trim: "#CBA15F", title: "#FFFFFF", paper: "#FFFFFF", line: "#B8948C" },
  { name: "White Carrara", stone: "#EDEAE4", vein: "#8F8B86", highlight: "#CFCAC3", plate: "#FFFFFF", frame: "#2B2B2B", trim: "#B8955A", title: "#630000", paper: "#FFFFFF", line: "#C9C1B6" },
  { name: "Emerald + Gold", stone: "#0F2A22", vein: "#C89543", highlight: "#E7D8BD", plate: "#175B49", frame: "#0B1F19", trim: "#C89543", title: "#FFFDF8", paper: "#FFFDF8", line: "#B3C4B5" },
  { name: "Midnight Blue", stone: "#0E1626", vein: "#C3A15E", highlight: "#B9CBD8", plate: "#263D6A", frame: "#0A0F1A", trim: "#C3A15E", title: "#FDFDFC", paper: "#FDFDFC", line: "#AEBCCC" },
  { name: "Plum", stone: "#1E1224", vein: "#C5A45E", highlight: "#D9C2DE", plate: "#5C3568", frame: "#140B18", trim: "#C5A45E", title: "#FFFEFC", paper: "#FFFEFC", line: "#C6B2CB" },
  { name: "Blush Rose", stone: "#E9CFCB", vein: "#BB9167", highlight: "#FFF6F2", plate: "#82445E", frame: "#5A2B3F", trim: "#BB9167", title: "#FFFCFC", paper: "#FFFCFC", line: "#D5A9B4" },
  { name: "Teal + Coral", stone: "#0D2F33", vein: "#D19A4A", highlight: "#E7A18E", plate: "#155D66", frame: "#09201F", trim: "#D19A4A", title: "#FFFDFC", paper: "#FFFDFC", line: "#AFC7C4" },
  { name: "Terracotta", stone: "#2A140E", vein: "#BD8B43", highlight: "#DDAA86", plate: "#914631", frame: "#1C0D09", trim: "#BD8B43", title: "#FFFCF8", paper: "#FFFCF8", line: "#D2B39C" },
];

export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

const toRgba = (hex: string, a: number) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

/** Pick the most legible ink for text on paper among the palette's dark roles. */
function ink(p: JcsPalette): string {
  return [p.frame, p.stone, p.plate, p.title].sort((a, b) => contrast(b, p.paper) - contrast(a, p.paper))[0];
}

/** Headings need contrast on paper too; fall back to ink when the plate is pale. */
function heading(p: JcsPalette): string {
  return contrast(p.plate, p.paper) >= 3 ? p.plate : ink(p);
}

function adapt(p: JcsPalette): ColorPalette {
  const text = ink(p);
  const colors: ColorTokens = {
    primary: heading(p),
    secondary: p.frame,
    accent: p.trim,
    background: p.paper,
    text,
    mutedText: toRgba(text, 0.68),
    line: p.line,
    border: contrast(p.frame, p.paper) >= 3 ? p.frame : text,
    decorativeAccent: p.vein,
    decorBase: p.stone,
    decorHighlight: p.highlight,
    lineOpacity: 1,
  };
  return {
    id: `jcs-${p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
    label: p.name,
    brandPalette: false,
    source: "journal-color-studio snapshot",
    colors,
    note: "Approved in Journal Color Studio (snapshot).",
  };
}

export const JCS_PALETTES_ADAPTED: ColorPalette[] = JCS_PALETTES.map(adapt);

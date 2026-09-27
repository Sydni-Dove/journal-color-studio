/**
 * Journal Color Studio palettes — one-way snapshot (JCS PALETTES table and
 * PRESET_FAMILIES at `main` ba916ad; previously 14e4e75 on
 * integration/multi-journal-plus-patterns, 8282a74 before that), adapted to
 * Product Studio's semantic color tokens.
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
 *   accent    → lineArt          (line-art color; JCS default = trim)
 *   stripeBackground / stripePrimary (JCS paletteVariants[0]) → patternGround / patternInk
 *   text      = darkest of frame / stone / plate / title (legible ink on paper)
 */
import type { ColorPalette, ColorTokens } from "../types/tokens";

type JcsPalette = {
  name: string;
  stone: string;
  vein: string;
  highlight: string;
  plate: string;
  frame: string;
  trim: string;
  title: string;
  paper: string;
  line: string;
  /** Line-art color (JCS `accent`; defaults to trim). */
  accent?: string;
  /** Source colors of a palette pack / color family (JCS `swatches` / `swatch`). */
  swatches?: string[];
  /** A JCS color family (four colors, roles filled by one generic rule). */
  family?: boolean;
};

const JCS_PALETTES: JcsPalette[] = [
  { name: "Your Canva Cover", stone: "#050505", vein: "#C8A769", highlight: "#FFFFFF", plate: "#131313", frame: "#111111", trim: "#D4B06A", title: "#FFFFFF", paper: "#FFFFFF", line: "#B8A58A" },
  { name: "Blush Watercolor", stone: "#F7CACC", vein: "#C8AE70", highlight: "#3A1519", plate: "#FFF7F6", frame: "#8E4B57", trim: "#C8AE70", title: "#8E2F3F", paper: "#FFFBFA", line: "#E3B7BC" },
  { name: "Gold Leaf", stone: "#FBF8F3", vein: "#C9A55E", highlight: "#FFFFFF", plate: "#FFFFFF", frame: "#1E1B18", trim: "#C9A55E", title: "#1E1B18", paper: "#FFFFFF", line: "#D8CBB4" },
  { name: "White Marble", stone: "#F8F8F7", vein: "#8C8C90", highlight: "#FFFFFF", plate: "#FFFFFF", frame: "#222222", trim: "#BFA06A", title: "#222222", paper: "#FFFFFF", line: "#CFCFCF" },
  { name: "Floral Garden", stone: "#718365", vein: "#CBA15F", highlight: "#E3A69D", plate: "#860B03", frame: "#63202E", trim: "#A87C2D", title: "#FFFFFF", paper: "#FFFFFF", line: "#EBE3E2" },
  { name: "Abstract Watercolor", stone: "#63101A", vein: "#D7A04D", highlight: "#E89F97", plate: "#F4EDE6", frame: "#63101A", trim: "#D7A04D", title: "#63101A", paper: "#F4EDE6", line: "#E3CBC3", accent: "#B8471C" },
  { name: "Original Black + Gold", stone: "#141212", vein: "#C9A05A", highlight: "#F1E6CC", plate: "#2A070E", frame: "#151313", trim: "#CBA15F", title: "#FFFFFF", paper: "#FFFFFF", line: "#B8948C" },
  { name: "White Carrara", stone: "#EDEAE4", vein: "#8F8B86", highlight: "#CFCAC3", plate: "#FFFFFF", frame: "#2B2B2B", trim: "#B8955A", title: "#630000", paper: "#FFFFFF", line: "#C9C1B6" },
  { name: "Emerald + Gold", stone: "#0F2A22", vein: "#C89543", highlight: "#E7D8BD", plate: "#175B49", frame: "#0B1F19", trim: "#C89543", title: "#FFFDF8", paper: "#FFFDF8", line: "#B3C4B5" },
  { name: "Midnight Blue", stone: "#0E1626", vein: "#C3A15E", highlight: "#B9CBD8", plate: "#263D6A", frame: "#0A0F1A", trim: "#C3A15E", title: "#FDFDFC", paper: "#FDFDFC", line: "#AEBCCC" },
  { name: "Plum", stone: "#1E1224", vein: "#C5A45E", highlight: "#D9C2DE", plate: "#5C3568", frame: "#140B18", trim: "#C5A45E", title: "#FFFEFC", paper: "#FFFEFC", line: "#C6B2CB" },
  { name: "Blush Rose", stone: "#E9CFCB", vein: "#BB9167", highlight: "#FFF6F2", plate: "#82445E", frame: "#5A2B3F", trim: "#BB9167", title: "#FFFCFC", paper: "#FFFCFC", line: "#D5A9B4" },
  { name: "Teal + Coral", stone: "#0D2F33", vein: "#D19A4A", highlight: "#E7A18E", plate: "#155D66", frame: "#09201F", trim: "#D19A4A", title: "#FFFDFC", paper: "#FFFDFC", line: "#AFC7C4" },
  // Kintsugi marbles' own colors ("As designed"; JCS main d7068ea / 6c973e2).
  { name: "Rose Marble", stone: "#FAB3B5", vein: "#F68F22", highlight: "#FCDFE0", plate: "#FFF7F6", frame: "#B5485E", trim: "#D98A2B", title: "#8E2F3F", paper: "#FFFBFA", line: "#EDC3C6" },
  { name: "Burgundy Blush Marble", stone: "#9C2933", vein: "#D9834F", highlight: "#F9DCCF", plate: "#4E0812", frame: "#4E0812", trim: "#D9834F", title: "#F9DCCF", paper: "#FFFBF8", line: "#EF9C93", accent: "#EF9C93" },
  { name: "Black Ember Marble", stone: "#0B0A09", vein: "#E97318", highlight: "#413B37", plate: "#141210", frame: "#0B0A09", trim: "#E97318", title: "#FFF4E6", paper: "#FFFFFF", line: "#C9B8A6" },
  { name: "Peach Marble", stone: "#FEB89F", vein: "#F28F30", highlight: "#FBE1D3", plate: "#FFF8F3", frame: "#C0664A", trim: "#D98A2B", title: "#8A3D24", paper: "#FFFCF9", line: "#F1CDBE" },
  { name: "Terracotta", stone: "#2A140E", vein: "#BD8B43", highlight: "#DDAA86", plate: "#914631", frame: "#1C0D09", trim: "#BD8B43", title: "#FFFCF8", paper: "#FFFCF8", line: "#D2B39C" },
  // Orange pack (JCS palettes/orange-palettes-for-journal-color-studio.json via the JCS PALETTES table). `swatches`
  // keeps the source colors and `accent` the pack's own line-art color (both feed the pattern roles, as in JCS).
  { name: "Orange Light", swatches: ["#FFFFFF", "#FFD7B5", "#FFB38A", "#FF9248", "#FF6700"], stone: "#FFD7B5", vein: "#FF6700", highlight: "#FFFFFF", plate: "#FFFFFF", frame: "#FF6700", trim: "#FF9248", title: "#993E00", paper: "#FFFFFF", line: "#FFB38A", accent: "#FF9248" },
  { name: "Halloween Orange", swatches: ["#FFEDE4", "#FFD3BE", "#FBB38F", "#F18B57", "#EB6521"], stone: "#EB6521", vein: "#FFD3BE", highlight: "#FFEDE4", plate: "#FFEDE4", frame: "#8C380D", trim: "#F18B57", title: "#8C380D", paper: "#FFFAF7", line: "#FBB38F", accent: "#FFD3BE" },
  { name: "Ultra Orange", swatches: ["#FFE0D7", "#FFC2AF", "#FF9C7E", "#FF7B53", "#FF3B00"], stone: "#FF3B00", vein: "#FFE0D7", highlight: "#FFC2AF", plate: "#FFE0D7", frame: "#992300", trim: "#FF7B53", title: "#992300", paper: "#FFFAF8", line: "#FF9C7E", accent: "#FFC2AF" },
  { name: "Pure Orange", swatches: ["#F6BC76", "#FBB766", "#FDAB49", "#FD9B26", "#FF8C00"], stone: "#FF8C00", vein: "#F6BC76", highlight: "#FFF3E4", plate: "#FFF3E4", frame: "#995400", trim: "#FDAB49", title: "#995400", paper: "#FFFBF5", line: "#FBB766", accent: "#FD9B26" },
  { name: "Amber Orange", swatches: ["#F9A709", "#EDA211", "#E19D1A", "#D79920", "#CE972B"], stone: "#CE972B", vein: "#F9A709", highlight: "#FDF2DC", plate: "#FDF2DC", frame: "#7F5D1A", trim: "#E19D1A", title: "#7F5D1A", paper: "#FFFCF5", line: "#EDA211", accent: "#F9A709" },
  { name: "Orange Spectrum", swatches: ["#FFD106", "#FFA500", "#F9A12D", "#FF5600", "#FF3400"], stone: "#FF5600", vein: "#FFD106", highlight: "#FFA500", plate: "#FFFFFF", frame: "#991F00", trim: "#FFD106", title: "#991F00", paper: "#FFFFFF", line: "#F9A12D", accent: "#FFD106" },
  { name: "Tropical Sunrise", swatches: ["#FF9F1C", "#FFBF69", "#FFFFFF", "#CBF3F0", "#2EC4B6"], stone: "#2EC4B6", vein: "#FF9F1C", highlight: "#CBF3F0", plate: "#FFFFFF", frame: "#1D7C73", trim: "#FF9F1C", title: "#1D7C73", paper: "#FFFFFF", line: "#FFBF69", accent: "#FFBF69" },
  { name: "Peach Cloud", swatches: ["#FFDCDC", "#FFF2EB", "#FFE8CD", "#FFD6BA"], stone: "#FFD6BA", vein: "#FFDCDC", highlight: "#FFF2EB", plate: "#FFF2EB", frame: "#DE9D78", trim: "#FFDCDC", title: "#6F4A33", paper: "#FFF2EB", line: "#FFD6BA", accent: "#FFE8CD" },
  { name: "Tiger Amber & Blues", swatches: ["#8ECAE6", "#219EBC", "#021433", "#FFB703", "#FB8500"], stone: "#021433", vein: "#FFB703", highlight: "#8ECAE6", plate: "#219EBC", frame: "#021433", trim: "#FB8500", title: "#FFFFFF", paper: "#FFFFFF", line: "#8ECAE6", accent: "#FFB703" },
];

/**
 * JCS color families (PRESET_FAMILIES): four colors each, offered on every
 * journal. Roles are filled by JCS's one generic rule (paletteFromColors).
 */
const JCS_FAMILIES: [string, string[]][] = [
  ["Sage & Honey", ["#606C5D", "#FFF4F4", "#F7E6C4", "#F1C376"]],
  ["Creamsicle Noir", ["#FAF3E1", "#F5E7C6", "#FA8112", "#222222"]],
  ["Blush Rose (Soft)", ["#FCF8F8", "#FBEFEF", "#F9DFDF", "#F5AFAF"]],
  ["Terracotta Sage", ["#DB9558", "#FCF9EA", "#97A87A", "#A8BBA3"]],
  ["Dusty Rose Charcoal", ["#FFF5F5", "#F7D6D0", "#E2B4BD", "#4A4A4A"]],
  ["Navy Pop Pink", ["#021A54", "#FF85BB", "#FFCEE3", "#F5F5F5"]],
  ["Berry Pink", ["#D6336C", "#FF4081", "#FFB6C1", "#FFF5F8"]],
  ["Orchid Gradient", ["#B33791", "#C562AF", "#DB8DD0", "#FEC5F6"]],
  ["Plum Fuchsia", ["#462C7D", "#831C91", "#D552A3", "#FF70BF"]],
  ["Blush Lavender", ["#FBEFEF", "#FFE2E2", "#F5CBCB", "#C5B3D3"]],
  ["Burgundy Cream", ["#800020", "#F3E6D5", "#FFF9F2", "#D45060"]],
];

const rgbOf = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (c: number[]) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();

/** JCS paletteFromColors: darkest → main, most vivid of the rest → second color, remaining tint → highlight, lightest → paper. */
export function paletteFromColors(name: string, colors: string[]): JcsPalette {
  const lum = (h: string) => {
    const [r, g, b] = rgbOf(h);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const chroma = (h: string) => Math.max(...rgbOf(h)) - Math.min(...rgbOf(h));
  const blend = (a: string, b: string, t: number) => hex(rgbOf(a).map((v, i) => v + (rgbOf(b)[i] - v) * t));
  const byLum = [...colors].sort((a, b) => lum(a) - lum(b));
  const lightest = byLum[byLum.length - 1], dark = byLum[0];
  const paper = lum(lightest) >= 235 ? lightest : blend(lightest, "#FFFFFF", 0.8);
  const rest = byLum.slice(1).filter((c) => c !== lightest || lum(lightest) < 235);
  const second = [...rest].sort((a, b) => chroma(b) - chroma(a))[0] || dark;
  const tint = rest.find((c) => c !== second) || blend(second, paper, 0.5);
  return { name, family: true, swatches: colors, stone: dark, vein: second, highlight: tint, plate: dark, frame: dark, trim: second, title: paper, paper, line: blend(dark, paper, 0.75), accent: second };
}

const JCS_FAMILY_PALETTES: JcsPalette[] = JCS_FAMILIES.map(([name, colors]) => paletteFromColors(name, colors));

// ─── Pattern roles (JCS paletteVariants, variation 0 = each palette's designed default) ───
const relLum = (hexStr: string) => {
  const c = rgbOf(hexStr).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const jcsContrast = (a: string, b: string) => {
  const x = relLum(a), y = relLum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const rgbDist = (a: string, b: string) => Math.hypot(...rgbOf(a).map((v, i) => v - rgbOf(b)[i]));
const deepen = (h: string, k: number) => hex(rgbOf(h).map((v) => Math.round(v * k)));
/** A stripe must read as a separate stripe on its ground (JCS STRIPE_MIN_CONTRAST). */
const STRIPE_MIN_CONTRAST = 1.5;

/**
 * Pattern roles of a palette: the ground between the stripes, the stripe ink
 * and the border line. A faithful port of JCS paletteVariants(pl)[0] — the
 * candidate order favours paper / stone for the ground and the strong roles
 * for the stripes; soft all-pastel palettes deepen their stripe colors (same
 * hue) until they clear the minimum contrast.
 */
export function patternRoles(pl: JcsPalette): { ground: string; ink: string; border: string } {
  const accent = (pl.accent ?? pl.trim).toUpperCase();
  const uniq = (arr: (string | undefined)[]) => arr.filter((c): c is string => !!c).map((c) => c.toUpperCase()).filter((c, i, a) => a.indexOf(c) === i);
  const sw = pl.swatches ?? [];
  const bgs = uniq([pl.paper, pl.stone, pl.highlight, pl.plate, ...sw]);
  const inks = uniq([pl.stone, pl.plate, pl.frame, pl.vein, pl.trim, accent, pl.title, pl.highlight, ...sw, pl.line]);
  const groups = bgs
    .map((bg) => {
      const ok = inks.filter((c) => c !== bg && jcsContrast(bg, c) >= STRIPE_MIN_CONTRAST);
      const out: string[][] = [];
      for (const a of ok) for (const b of ok) if (a !== b && rgbDist(a, b) >= 40) out.push([bg, a, b]);
      return out;
    })
    .filter((g) => g.length);
  let pick: string[] | undefined = groups[0]?.[0];
  if (!pick) {
    const byLum = uniq([pl.paper, pl.stone, pl.highlight, pl.plate, pl.trim, pl.vein, accent, ...sw]).sort((a, b) => relLum(b) - relLum(a));
    const bg = byLum[0];
    const lift = (c: string) => {
      let k = 1, out = c;
      while (jcsContrast(bg, out) < STRIPE_MIN_CONTRAST && k > 0.3) {
        k -= 0.04;
        out = deepen(c, k);
      }
      return out;
    };
    const i = byLum.length - 1;
    const a = lift(byLum[i]), b = lift(byLum[i === 1 ? byLum.length - 1 : i - 1]);
    pick = [bg, a, rgbDist(a, b) >= 20 ? b : deepen(b, 0.8)];
  }
  const [ground, ink, second] = pick;
  const border = inks.filter((c) => c !== ground && c !== ink && c !== second).sort((x, y) => jcsContrast(ground, y) - jcsContrast(ground, x))[0] || ink;
  return { ground, ink, border };
}

/** Product Studio palette id of a snapshotted JCS palette (e.g. a marble's "As designed" palette). */
export function jcsPaletteId(name: string): string {
  return `jcs-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

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
  const pattern = patternRoles(p);
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
    lineArt: p.accent ?? p.trim,
    patternGround: pattern.ground,
    patternInk: pattern.ink,
    lineOpacity: 1,
  };
  return {
    id: jcsPaletteId(p.name),
    label: p.name,
    brandPalette: false,
    source: "journal-color-studio snapshot",
    group: p.family ? "family" : "journal",
    colors,
    note: p.family ? "Journal Color Studio color family (snapshot): four colors, roles filled by its generic rule." : "Approved in Journal Color Studio (snapshot).",
  };
}

export const JCS_PALETTES_ADAPTED: ColorPalette[] = [...JCS_PALETTES, ...JCS_FAMILY_PALETTES].map(adapt);

/** A snapshotted JCS palette's raw roles (used to recognise an artwork's own colourway). */
export function jcsPaletteRoles(name: string): JcsPalette | undefined {
  return [...JCS_PALETTES, ...JCS_FAMILY_PALETTES].find((p) => p.name === name);
}

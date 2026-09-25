/**
 * RECOLOR MATH — pure pixel functions (no DOM), Product Studio's own
 * implementation of the recolor formats in the Journal Color Studio snapshot
 * (source commit recorded in design-library/SNAPSHOT.md).
 *
 * Artwork is recolored in CIE Lab: every component of an artwork keeps its own
 * per-pixel lightness deviation (texture, shading, veins), a scaled share of
 * its colour variation and its alpha; only the component's average colour
 * moves to the chosen colour. Source pixels stay the source of truth.
 */

export type Rgb = [number, number, number];
export type Lab = [number, number, number];

export const hexRgb = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
export const toHex = (rgb: number[]) => "#" + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("").toUpperCase();

const LIN = new Float32Array(256).map((_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});
const labF = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
const labInv = (t: number) => {
  const t3 = t * t * t;
  return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787;
};
const toSrgb = (v: number) => {
  v = Math.max(0, v);
  return Math.max(0, Math.min(255, 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)));
};

export function rgb2lab(r: number, g: number, b: number): Lab {
  const R = LIN[r | 0], G = LIN[g | 0], B = LIN[b | 0];
  const fx = labF((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047);
  const fy = labF(R * 0.2126 + G * 0.7152 + B * 0.0722);
  const fz = labF((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function lab2rgb(L: number, a: number, b: number): Rgb {
  const fy = (L + 16) / 116, x = labInv(fy + a / 500) * 0.95047, y = labInv(fy), z = labInv(fy - b / 200) * 1.08883;
  return [toSrgb(x * 3.2406 - y * 1.5372 - z * 0.4986), toSrgb(-x * 0.9689 + y * 1.8758 + z * 0.0415), toSrgb(x * 0.0557 - y * 0.204 + z * 1.057)];
}

export const hexLab = (hex: string): Lab => rgb2lab(...hexRgb(hex));
const labL = (hex: string) => hexLab(hex)[0];
const labC = (hex: string) => {
  const [, a, b] = hexLab(hex);
  return Math.hypot(a, b);
};
const dL = (x: string, y: string) => Math.abs(labL(x) - labL(y));
const dE = (x: string, y: string) => {
  const p = hexLab(x), q = hexLab(y);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};

/** Target lightness + deviation, compressed smoothly near black/white instead of clipping. */
export function softL(t: number, d: number): number {
  if (d >= 0) {
    const room = Math.max(0.5, 99.5 - t);
    return t + room * Math.tanh(d / room);
  }
  const room = Math.max(0.5, t - 0.5);
  return t - room * Math.tanh(-d / room);
}
export const ramp01 = (x: number, a: number, b: number) => Math.min(1, Math.max(0, (x - a) / (b - a)));
export const hueBand = (h: number, lo: number, hi: number, soft = 12) => {
  const d = h < lo ? lo - h : h > hi ? h - hi : 0;
  return Math.max(0, 1 - d / soft);
};

type Preset = { comps: string[]; weights: (L: number, a: number, b: number, C: number, H: number) => number[] };

/** How an artwork splits into independently coloured components (soft weights, no seams). */
export const TONE_PRESETS = {
  /** Marble veins from the original artwork: gold, white/cream highlights, and the stone between them. */
  veins: {
    comps: ["gold", "light", "stone"],
    weights: (L, _a, _b, C, H) => {
      const col = ramp01(C, 6, 16), gold = col * hueBand(H, 50, 105, 12), light = (1 - col) * ramp01(L, 55, 75);
      return [gold, light, Math.max(0, 1 - gold - light)];
    },
  },
  /** Floral artwork: deep blooms, soft blooms, leaves, gold; page white and greys stay put ('keep'). */
  floral: {
    comps: ["keep", "paper", "gold", "leaf", "blush", "deep"],
    weights: (L, _a, _b, C, H) => {
      const col = ramp01(C, 5, 12), paper = (1 - col) * ramp01(L, 90, 96), keep = 1 - col - paper;
      const gold = col * hueBand(H, 62, 100, 10), leaf = col * hueBand(H, 110, 205, 12) * (1 - hueBand(H, 62, 100, 10));
      const rest = Math.max(0, col - gold - leaf), light = ramp01(L, 50, 64);
      return [keep, paper, gold, leaf, rest * light, rest * (1 - light)];
    },
  },
} satisfies Record<string, Preset>;
export type TonePreset = keyof typeof TONE_PRESETS;

/**
 * Tone-transfer RGBA pixels in place. `targets` maps component name → hex;
 * a component without a target keeps its painted colour.
 */
export function toneTransferPixels(d: Uint8ClampedArray, preset: TonePreset, targets: Record<string, string | undefined>): void {
  const P: Preset = TONE_PRESETS[preset];
  const K = P.comps.length;
  const px = (i: number) => {
    const [L, a, b] = rgb2lab(d[i], d[i + 1], d[i + 2]);
    const C = Math.hypot(a, b);
    let H = (Math.atan2(b, a) * 180) / Math.PI;
    if (H < 0) H += 360;
    return [L, a, b, C, H] as const;
  };
  const norm = (ws: number[]) => {
    let t = 0;
    for (const v of ws) t += Math.max(0, v);
    return t > 0 ? ws.map((v) => Math.max(0, v) / t) : ws.map((_, i) => (i ? 0 : 1));
  };
  // Pass 1 (sampled): each component's own average colour, weighted by coverage and alpha.
  const sum = new Float64Array(K * 4);
  const pixels = d.length / 4;
  const step = Math.max(1, Math.round(Math.sqrt(pixels / 90000))) * 4;
  for (let i = 0; i < d.length; i += step) {
    const al = d[i + 3] / 255;
    if (al < 0.05) continue;
    const [L, a, b, C, H] = px(i);
    const ws = norm(P.weights(L, a, b, C, H));
    for (let k = 0; k < K; k++) {
      const wk = ws[k] * al;
      sum[k * 4] += wk;
      sum[k * 4 + 1] += wk * L;
      sum[k * 4 + 2] += wk * a;
      sum[k * 4 + 3] += wk * b;
    }
  }
  const T = P.comps.map((name, k) => {
    const hex = targets[name];
    const n = sum[k * 4];
    if (!hex || n < 1e-6) return null;
    const m = [sum[k * 4 + 1] / n, sum[k * 4 + 2] / n, sum[k * 4 + 3] / n];
    const t = hexLab(hex);
    const Cm = Math.hypot(m[1], m[2]), Ct = Math.hypot(t[1], t[2]);
    // Colour variation scales with how vivid the new colour is.
    return { m, t, sC: Math.min(1.25, Math.max(0.35, (Ct + 8) / (Cm + 8))), gold: name === "gold" };
  });
  // Pass 2: every pixel keeps its deviation from its component's average.
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const [L, a, b, C, H] = px(i);
    const ws = norm(P.weights(L, a, b, C, H));
    let oL = 0, oa = 0, ob = 0;
    for (let k = 0; k < K; k++) {
      const wk = ws[k];
      if (!wk) continue;
      const t = T[k];
      if (!t) {
        oL += wk * L;
        oa += wk * a;
        ob += wk * b;
        continue;
      }
      const nL = softL(t.t[0], L - t.m[0]);
      let na = t.t[1] + (a - t.m[1]) * t.sC, nb = t.t[2] + (b - t.m[2]) * t.sC;
      if (t.gold) {
        // Metal: bright glints go pale, shadows stay rich.
        const f = 1 - 0.5 * ramp01(nL, t.t[0], 100);
        na *= f;
        nb *= f;
      }
      oL += wk * nL;
      oa += wk * na;
      ob += wk * nb;
    }
    const [r, g, bb] = lab2rgb(oL, oa, ob);
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = bb;
  }
}

/**
 * Floral soft blooms must stay defined on the page: a bloom colour too close
 * to the paper takes a pale tint of the palette's own hue (a neutral white
 * borrows a whisper of the deep-bloom hue). Never darkened for contrast.
 */
export function floralSoftFill(soft: string, paper: string, deep: string): string {
  if (dL(soft, paper) >= 10 || dE(soft, paper) >= 14) return soft;
  const neutral = labC(soft) < 4;
  const [, a, b] = hexLab(neutral ? deep : soft);
  const k = neutral ? 0.22 : 1;
  return toHex(lab2rgb(Math.max(60, labL(paper) - 12), a * k, b * k));
}

// ─── Marble ────────────────────────────────────────────────────────────────
export type MarbleStats = { stone: number; p5: number; p95: number; gold: number; hi: number };

/**
 * Statistics of a marble layer map (R = stone detail, G = vein coverage,
 * B = highlight coverage), sampled from a ~240 px-wide copy.
 */
export function marbleStats(d: Uint8ClampedArray): MarbleStats {
  const acc = { s: [] as number[], g: [] as number[], h: [] as number[] };
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 1] > 200) acc.g.push(d[i]);
    else if (d[i + 2] > 200) acc.h.push(d[i]);
    else if (d[i + 1] < 8 && d[i + 2] < 8) acc.s.push(d[i]);
  }
  const q = (arr: number[], f: number, dflt: number) => {
    if (!arr.length) return dflt;
    arr.sort((a, b) => a - b);
    return arr[Math.min(arr.length - 1, Math.floor(arr.length * f))] / 255;
  };
  return { stone: q(acc.s, 0.5, 0.3), p5: q(acc.s, 0.05, 0.1), p95: q(acc.s, 0.95, 0.6), gold: q(acc.g, 0.5, 0.75), hi: q(acc.h, 0.5, 0.9) };
}

/** Stone / gold / highlight lookup tables indexed by the map's R value (×3 for RGB). */
export function marbleLUTs(st: MarbleStats, roles: { stone: string; vein: string; highlight: string }, texture: number) {
  const S = hexLab(roles.stone), G = hexLab(roles.vein), Hc = hexLab(roles.highlight);
  // Stone texture strength (L* per unit of source luminance); calibrated so the original colourway matches its source.
  const A = 50 * texture;
  // A very pale (or dark) stone settles slightly (max 16 L*) so the texture has room instead of clipping flat.
  let Ls = S[0];
  const up = (st.p95 - st.stone) * A, down = (st.stone - st.p5) * A;
  if (Ls + up > 97) Ls = Math.max(S[0] - 16, 97 - up);
  if (Ls - down < 3) Ls = Math.min(S[0] + 16, 3 + down);
  const stoneLUT = new Float32Array(768), goldLUT = new Float32Array(768), hiLUT = new Float32Array(768);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    stoneLUT.set(lab2rgb(softL(Ls, (v - st.stone) * A), S[1], S[2]), i * 3);
    // Gold keeps the source gold's luminance spread (bronze → bright → pale glint) with metallic chroma falloff.
    const gL = softL(G[0], (v - st.gold) * 100), gf = 1 - 0.5 * ramp01(gL, G[0], 100), gd = 1 + 0.15 * ramp01(G[0] - gL, 0, 30);
    goldLUT.set(lab2rgb(gL, G[1] * gf * gd, G[2] * gf * gd), i * 3);
    hiLUT.set(lab2rgb(softL(Hc[0], (v - st.hi) * 60), Hc[1], Hc[2]), i * 3);
  }
  return { stoneLUT, goldLUT, hiLUT };
}

/**
 * Paint a marble from its layer map in place. When the texture has real vein
 * artwork (`ownVeins` = false), the map's own vein/highlight channels are not
 * painted — the overlay supplies them.
 */
export function paintMarblePixels(
  d: Uint8ClampedArray,
  luts: ReturnType<typeof marbleLUTs>,
  veinStrength: number,
  ownVeins: boolean,
): void {
  const own = ownVeins ? 1 : 0;
  const { stoneLUT, goldLUT, hiLUT } = luts;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] * 3, g = (d[i + 1] / 255) * veinStrength * own, cr = (d[i + 2] / 255) * veinStrength * own;
    for (let k = 0; k < 3; k++) {
      let v = stoneLUT[r + k] * (1 - g) + goldLUT[r + k] * g;
      v = v * (1 - cr) + hiLUT[r + k] * cr;
      d[i + k] = v;
    }
    d[i + 3] = 255;
  }
}

/**
 * Limit a vein overlay to its coverage: a transparent original (gold leaf)
 * carries its own crisp coverage; an opaque one (photo) uses the map's
 * vein/highlight channels. `map` is the layer map at the same size.
 */
export function veinCoverage(overlay: Uint8ClampedArray, map: Uint8ClampedArray, veinsAlpha: boolean, veinStrength: number): void {
  for (let i = 0; i < overlay.length; i += 4) {
    overlay[i + 3] = overlay[i + 3] * (veinsAlpha ? veinStrength : Math.max((map[i + 1] / 255) * veinStrength, (map[i + 2] / 255) * veinStrength));
  }
}

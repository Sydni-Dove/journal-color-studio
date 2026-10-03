/* Journal Color Studio — shared color engine (ColorCore).
 *
 * The ONE recolor engine for every page of the site: Journal Color Studio (index.html) and Print Prep
 * (print-prep.html) both load this file before their own scripts and use window.ColorCore. It holds:
 *   - CIE Lab conversion (rgb2lab, lab2rgb, hexLab) and its helpers (softL, ramp01, hueBand, LIN);
 *   - toneTransfer, the fidelity recolor: an image splits into soft-weighted components (TONE_PRESETS, or color
 *     families found in the image), each pixel keeps its own deviation from its component's average, and only the
 *     average moves to the new color — texture, shading and anti-aliased edges are kept, nothing is flattened;
 *   - findFamilies (k-means color families from Lab samples) and familiesPreset (families as a toneTransfer preset).
 * The studio's calls pass no options and get exactly the results they always did; the options (preset objects,
 * lut, noCache) are only for pages that recolor uploaded images.
 */
(function () {
  'use strict';
  const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  // ---------- Fidelity recoloring (shared by every background / artwork recolor) ----------
  // Artwork is recolored in CIE Lab, where lightness is separate from color. Each component of an artwork keeps its
  // OWN per-pixel lightness deviations (texture, shading, veins, highlights), its own color variation (scaled to the new
  // color's vividness) and its alpha; only the component's average color moves to the chosen color. Nothing is flattened
  // to a single color and no detail is regenerated: the source pixels stay the source of truth.
  const LIN = new Float32Array(256).map((_, i) => { const c = i / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });
  const labF = (t) => (t > .008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  function rgb2lab(r, g, b) {
    const R = LIN[r | 0], G = LIN[g | 0], B = LIN[b | 0];
    const fx = labF((R * .4124 + G * .3576 + B * .1805) / .95047), fy = labF(R * .2126 + G * .7152 + B * .0722), fz = labF((R * .0193 + G * .1192 + B * .9505) / 1.08883);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }
  const labInv = (t) => { const t3 = t * t * t; return t3 > .008856 ? t3 : (t - 16 / 116) / 7.787; };
  const toSrgb = (v) => { v = Math.max(0, v); return Math.max(0, Math.min(255, 255 * (v <= .0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - .055))); };
  function lab2rgb(L, a, b) {
    const fy = (L + 16) / 116, x = labInv(fy + a / 500) * .95047, y = labInv(fy), z = labInv(fy - b / 200) * 1.08883;
    return [toSrgb(x * 3.2406 - y * 1.5372 - z * .4986), toSrgb(-x * .9689 + y * 1.8758 + z * .0415), toSrgb(x * .0557 - y * .204 + z * 1.057)];
  }
  const hexLab = (hex) => rgb2lab(...hexRgb(hex));
  // Target lightness + the pixel's own deviation, compressed smoothly (and monotonically) near black/white instead of
  // clipping — so brighter stays brighter and texture never flattens into a solid block at the extremes.
  function softL(t, d) {
    if (d >= 0) { const room = Math.max(.5, 99.5 - t); return t + room * Math.tanh(d / room); }
    const room = Math.max(.5, t - .5); return t - room * Math.tanh(-d / room);
  }
  const ramp01 = (x, a, b) => Math.min(1, Math.max(0, (x - a) / (b - a)));
  const hueBand = (h, lo, hi, soft = 12) => { const d = h < lo ? lo - h : h > hi ? h - hi : 0; return Math.max(0, 1 - d / soft); };
  // How an artwork splits into independently colored components (soft weights, so there are no seams between them).
  // 'keep' = leave as painted (whites, greys, paper).
  const TONE_PRESETS = {
    all: { comps: ['main'], weights: () => [1] },
    // Washes: neutral whites/greys stay as painted; gold glitter follows its own color; the colored paint is the wash.
    // pigment: the wash is treated as paper + pigment at varying strength. Each pixel keeps its pigment strength
    // (so pale stays pale, dense paint takes the chosen color, every gradient in between survives); glitter keeps its own tones.
    wash: { pigment: ['main'], comps: ['keep', 'gold', 'main'], weights: (L, a, b, C, H) => {
      // Only true whites/greys (chroma under ~3) stay as painted; pale paint is still paint and must follow the new color.
      // Gold = gold hue + real chroma at ANY lightness (37% of the glitter's flecks are dark gold; no rose paint falls in this hue band).
      const col = ramp01(C, 1.5, 4), g = col * hueBand(H, 66, 100, 8) * ramp01(C, 16, 26);
      return [1 - col, g, col - g];
    } },
    // Marble veins from the original artwork: gold, white/cream highlights, and the stone showing between them.
    veins: { comps: ['gold', 'light', 'stone'], weights: (L, a, b, C, H) => {
      const col = ramp01(C, 6, 16), gold = col * hueBand(H, 50, 105, 12), light = (1 - col) * ramp01(L, 55, 75);
      return [gold, light, Math.max(0, 1 - gold - light)];
    } },
    // Violet + peach watercolor cloud: the cool (violet / lilac) paint and the warm (peach / coral) paint each follow their
    // own color, as pigment on paper (pale stays pale, dense paint takes the full color); near-whites stay as painted.
    cloud: { pigment: ['violet', 'peach'], comps: ['keep', 'violet', 'peach'], weights: (L, a, b, C, H) => {
      const col = ramp01(C, 2, 6), warm = ramp01(Math.cos((H - 50) * Math.PI / 180), -.15, .35);
      return [1 - col, col * (1 - warm), col * warm];
    } },
    // Colored ink on paper (e.g. a flattened page): only the ink changes.
    ink: { comps: ['keep', 'main'], weights: (L, a, b, C) => { const c = ramp01(C, 8, 20); return [1 - c, c]; } },
    // Floral artwork: deep blooms, soft blooms, leaves, gold; page white and greys stay put.
    floral: { comps: ['keep', 'paper', 'gold', 'leaf', 'blush', 'deep'], weights: (L, a, b, C, H) => {
      const col = ramp01(C, 5, 12), paper = (1 - col) * ramp01(L, 90, 96), keep = 1 - col - paper;
      const gold = col * hueBand(H, 62, 100, 10), leaf = col * hueBand(H, 110, 205, 12) * (1 - hueBand(H, 62, 100, 10));
      const rest = Math.max(0, col - gold - leaf), light = ramp01(L, 50, 64);
      return [keep, paper, gold, leaf, rest * light, rest * (1 - light)];
    } },
  };
  const toneCache = new Map();
  // targets: { componentName: hex }  (a component without a target is left exactly as painted).
  // opts (all optional, never used by the studio's own calls): noCache — don't cache (canvas sources); lut — apply
  // pass 2 through a 64³ color lookup table (same math, 3–4× faster). Only for presets whose weights change smoothly
  // with color (familiesPreset, 'all': within 2/255 of the exact path). Presets with sharp thresholds near neutral
  // colors (wash, cloud, floral) can flip component inside one grid cell, so they must keep the exact path.
  function toneTransfer(img, w, h, preset, targets, cover = false, opts = {}) {
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    const key = `${img._key || img.src}|${w}x${h}|${typeof preset === 'string' ? preset : preset.id}|${JSON.stringify(targets)}|${cover}`;
    if (!opts.noCache && toneCache.has(key)) return toneCache.get(key);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    if (cover) {
      const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, ir = iw / ih, r = w / h;
      let sx = 0, sy = 0, sw = iw, sh = ih;
      if (ir > r) { sw = sh * r; sx = (iw - sw) / 2; } else { sh = sw / r; sy = (ih - sh) / 2; }
      x.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    } else x.drawImage(img, 0, 0, w, h);
    const id = x.getImageData(0, 0, w, h), d = id.data, P = typeof preset === 'string' ? TONE_PRESETS[preset] : preset, K = P.comps.length;
    const px = (i) => { const [L, a, b] = rgb2lab(d[i], d[i + 1], d[i + 2]); const C = Math.hypot(a, b); let H = Math.atan2(b, a) * 180 / Math.PI; if (H < 0) H += 360; return [L, a, b, C, H]; };
    const norm = (ws) => { let t = 0; for (const v of ws) t += Math.max(0, v); return t > 0 ? ws.map((v) => Math.max(0, v) / t) : ws.map((_, i) => (i ? 0 : 1)); };
    // Pass 1 (sampled): each component's own average color, weighted by coverage and alpha.
    const sum = new Float64Array(K * 4), hist = new Float64Array(K * 101), histA = new Float64Array(K * 101), histB = new Float64Array(K * 101), step = Math.max(1, Math.round(Math.sqrt(w * h / 90000))) * 4;
    for (let i = 0; i < d.length; i += step) {
      const al = d[i + 3] / 255; if (al < .05) continue;
      const [L, a, b, C, H] = px(i), ws = norm(P.weights(L, a, b, C, H));
      for (let k = 0; k < K; k++) {
        const wk = ws[k] * al; sum[k * 4] += wk; sum[k * 4 + 1] += wk * L; sum[k * 4 + 2] += wk * a; sum[k * 4 + 3] += wk * b;
        const bin = k * 101 + Math.max(0, Math.min(100, Math.round(L)));
        hist[bin] += wk; histA[bin] += wk * a; histB[bin] += wk * b;
      }
    }
    const quantL = (k, f) => { let acc = 0; const tot = sum[k * 4]; for (let v = 0; v <= 100; v++) { acc += hist[k * 101 + v]; if (acc >= tot * f) return v; } return 50; };
    const T = P.comps.map((name, k) => {
      const hex = targets[name], n = sum[k * 4];
      if (!hex || n < 1e-6) return null;
      const m = P.means ? P.means[k] : [sum[k * 4 + 1] / n, sum[k * 4 + 2] / n, sum[k * 4 + 3] / n], t = hexLab(hex);
      const Cm = Math.hypot(m[1], m[2]), Ct = Math.hypot(t[1], t[2]);
      // Color variation scales with how vivid the new color is (a pastel keeps a gentle version of the painted variation).
      const out = { m, t, sC: P.keepChroma ? 1 : Math.min(1.25, Math.max(.35, (Ct + 8) / (Cm + 8))), gold: name === 'gold' };
      if (P.pigment?.includes(name)) {
        // Paper = the lightest paint, dense pigment = the darkest tenth; its color = the average hue scaled to that density.
        out.Lp = Math.max(92, quantL(k, .995)); out.Ld = Math.min(out.Lp - 6, quantL(k, .1));
        // The dense pigment's own color, measured from the densest pixels themselves.
        let wS = 0, aS = 0, bS = 0;
        for (let v = 0; v <= Math.min(100, out.Ld + 5); v++) { wS += hist[k * 101 + v]; aS += histA[k * 101 + v]; bS += histB[k * 101 + v]; }
        out.pd = wS > 0 ? [aS / wS, bS / wS] : [m[1], m[2]];
        // Color variation is judged against the dense pigment's vividness, not the (mostly pale) average.
        out.sC = Math.min(1.25, Math.max(.35, (Ct + 8) / (Math.hypot(out.pd[0], out.pd[1]) + 8)));
      }
      return out;
    });
    // Pass 2: every pixel keeps its deviation from its component's average.
    const mapLab = (L, a, b, C, H) => {
      const ws = norm(P.weights(L, a, b, C, H));
      let oL = 0, oa = 0, ob = 0;
      for (let k = 0; k < K; k++) {
        const wk = ws[k]; if (!wk) continue;
        const t = T[k];
        if (!t) { oL += wk * L; oa += wk * a; ob += wk * b; continue; }
        let nL, na, nb;
        if (t.Lp) {
          // Pigment strength of this pixel (can exceed 1 slightly where paint pooled darker than usual).
          // Pigment strength shows both as darkening and as color intensity; use both so the estimate follows the paint.
          const alL = (t.Lp - L) / (t.Lp - t.Ld), alC = C / Math.max(4, Math.hypot(t.pd[0], t.pd[1]));
          const al = Math.max(0, Math.min(1.2, .5 * alL + .5 * alC));
          const aL = Math.max(0, Math.min(1.2, alL));                  // lightness follows the painted light/dark exactly
          nL = Math.max(1, Math.min(99.5, t.Lp + (t.t[0] - t.Lp) * aL));
          // Keep a gentle share of the painted hue variation (blooms, edges), not the old hue itself.
          const ra = a - t.pd[0] * al, rb = b - t.pd[1] * al, rs = .35 * t.sC;
          na = t.t[1] * al + ra * rs; nb = t.t[2] * al + rb * rs;
        } else if (P.keepChroma && Math.hypot(t.m[1], t.m[2]) >= 5) {
          // Color families of flattened artwork: the WHOLE family takes the new color. Each pixel keeps its lightness
          // offset from its family (shading, texture) and its colorfulness relative to the family (pale stays pale), and
          // takes the new hue with only a trace of its own hue variation, so a changed family recolors instead of tinting.
          nL = softL(t.t[0], L - t.m[0]);
          const Cm = Math.hypot(t.m[1], t.m[2]), Ct = Math.hypot(t.t[1], t.t[2]), Ht = Math.atan2(t.t[2], t.t[1]);
          let dh = Math.atan2(b, a) - Math.atan2(t.m[2], t.m[1]); dh -= Math.round(dh / (2 * Math.PI)) * 2 * Math.PI;
          const nc = Ct * Math.min(2.5, C / Cm), nh = Ct < 3 ? Ht : Ht + dh * .3;
          na = nc * Math.cos(nh); nb = nc * Math.sin(nh);
        } else {
          nL = softL(t.t[0], L - t.m[0]);
          na = t.t[1] + (a - t.m[1]) * t.sC; nb = t.t[2] + (b - t.m[2]) * t.sC;
        }
        if (t.gold) { const f = 1 - .5 * ramp01(nL, t.t[0], 100); na *= f; nb *= f; }     // metal: bright glints go pale, shadows stay rich
        oL += wk * nL; oa += wk * na; ob += wk * nb;
      }
      return lab2rgb(oL, oa, ob);
    };
    if (opts.lut) {
      // The mapping depends only on a pixel's color (plus this image's statistics above), so it is computed once on a
      // 65³ grid (every 4th level, 0–255) and stored as a change; each pixel adds the change blended (trilinear) from
      // the 8 grid points around its color, so smooth gradients stay smooth (no blocky steps between grid cells).
      const N = 65, S = 4, del = new Float32Array(N * N * N * 3);
      for (let r = 0; r < N; r++) for (let g = 0; g < N; g++) for (let bl = 0; bl < N; bl++) {
        const R = Math.min(255, r * S), G = Math.min(255, g * S), B = Math.min(255, bl * S), [L, a, b] = rgb2lab(R, G, B), C = Math.hypot(a, b);
        let H = Math.atan2(b, a) * 180 / Math.PI; if (H < 0) H += 360;
        const o = mapLab(L, a, b, C, H), j = ((r * N + g) * N + bl) * 3;
        del[j] = o[0] - R; del[j + 1] = o[1] - G; del[j + 2] = o[2] - B;
      }
      for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        const fr = d[i] / S, fg = d[i + 1] / S, fb = d[i + 2] / S, r0 = Math.min(N - 2, fr | 0), g0 = Math.min(N - 2, fg | 0), b0 = Math.min(N - 2, fb | 0);
        const tr = fr - r0, tg = fg - g0, tb = fb - b0;
        let o0 = 0, o1 = 0, o2 = 0;
        for (let q = 0; q < 8; q++) {
          const dr = q & 1, dg = (q >> 1) & 1, db = q >> 2, w = (dr ? tr : 1 - tr) * (dg ? tg : 1 - tg) * (db ? tb : 1 - tb);
          if (!w) continue;
          const j = (((r0 + dr) * N + (g0 + dg)) * N + (b0 + db)) * 3;
          o0 += w * del[j]; o1 += w * del[j + 1]; o2 += w * del[j + 2];
        }
        d[i] += o0; d[i + 1] += o1; d[i + 2] += o2;
      }
    } else {
      for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        const [r, g, bb] = mapLab(...px(i));
        d[i] = r; d[i + 1] = g; d[i + 2] = bb;
      }
    }
    x.putImageData(id, 0, 0);
    if (!opts.noCache) {
      if (toneCache.size > 48) toneCache.delete(toneCache.keys().next().value);
      toneCache.set(key, c);
    }
    return c;
  }
  // ---------- Color families (uploaded, flattened artwork) ----------
  // k-means++ (seeded, so the same image always gives the same families) over Lab samples, then: merge near-duplicates
  // (ΔE < 9), fold in the in-between shades where two colors meet (a cluster on the line between two other main
  // colors), and drop colors under minShare of the samples. Returns [{ lab, hex, share }], most used first.
  function findFamilies(px, { k = 10, minShare = .0008 } = {}) {
    if (!px.length) return [];
    let seed = 7; const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const K = k, dist = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
    let cent = [px[Math.floor(px.length / 2)]];
    while (cent.length < K) {
      const ds = px.map((p) => Math.min(...cent.map((c) => dist(p, c)))), tot = ds.reduce((a, b) => a + b, 0);
      if (!tot) break; let r = rand() * tot, i = 0; while ((r -= ds[i]) > 0 && i < ds.length - 1) i++; cent.push(px[i]);
    }
    const lab = new Array(px.length).fill(0);
    for (let it = 0; it < 12; it++) {
      const sum = cent.map(() => [0, 0, 0, 0]);
      px.forEach((p, i) => { let best = 0, bd = Infinity; cent.forEach((c, kk) => { const d = dist(p, c); if (d < bd) { bd = d; best = kk; } }); lab[i] = best; const s2 = sum[best]; s2[0] += p[0]; s2[1] += p[1]; s2[2] += p[2]; s2[3]++; });
      cent = sum.map((s2, kk) => (s2[3] ? [s2[0] / s2[3], s2[1] / s2[3], s2[2] / s2[3]] : cent[kk]));
    }
    const counts = cent.map((_, kk) => lab.filter((v) => v === kk).length);
    const list = cent.map((c, kk) => ({ lab: c, n: counts[kk] })).filter((c) => c.n).sort((a, b) => b.n - a.n);
    const merged = [];
    for (const c of list) { const m = merged.find((o) => Math.sqrt(dist(o.lab, c.lab)) < 9); if (m) m.n += c.n; else merged.push({ ...c }); }
    const segDist = (p, a, b) => { const ab = [0, 1, 2].map((i) => b[i] - a[i]), ap = [0, 1, 2].map((i) => p[i] - a[i]), L2 = ab.reduce((t, v) => t + v * v, 0) || 1;
      const t = ab.reduce((u, v, i) => u + v * ap[i], 0) / L2; return t < .08 || t > .92 ? Infinity : Math.sqrt(dist(p, a.map((v, i) => v + t * ab[i]))); };
    const kept = [];
    for (const c of merged) {
      const big = kept.filter((o) => o.n > c.n * .5);
      const blend = big.some((a, i) => big.some((b2, j) => j > i && segDist(c.lab, a.lab, b2.lab) < 12 && Math.sqrt(dist(c.lab, a.lab)) > 6 && Math.sqrt(dist(c.lab, b2.lab)) > 6));
      if (blend) { const near = kept.reduce((m, o) => (dist(o.lab, c.lab) < dist(m.lab, c.lab) ? o : m)); near.n += c.n; } else kept.push({ ...c });
    }
    const hex = (lab3) => '#' + lab2rgb(...lab3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
    return kept.filter((c) => c.n / px.length >= minShare).map((c) => ({ lab: c.lab, hex: hex(c.lab), share: c.n / px.length }));
  }
  // Families as a toneTransfer preset: component f<i> = family i, soft membership by Lab distance (so edge pixels blend
  // between their two colors instead of snapping to one), the family's own center as its average, color variation
  // kept as is. toneTransfer(img, w, h, familiesPreset(fams), { f2: '#hex', … }) recolors families f2 …
  function familiesPreset(fams) {
    const C = fams.map((f) => f.lab), K = C.length;
    return {
      id: 'families:' + fams.map((f) => f.hex).join(''), comps: C.map((_, i) => 'f' + i), means: C, keepChroma: true,
      weights: (L, a, b) => { const w = new Array(K); for (let i = 0; i < K; i++) { const d = (L - C[i][0]) ** 2 + (a - C[i][1]) ** 2 + (b - C[i][2]) ** 2; w[i] = 1 / (d * d * d + 1e-9); } return w; },
    };
  }

  // ---------- Palette → color families (flattened artwork) ----------
  // A palette onto an artwork's color families (findFamilies): paper → the main light color, the darkest → lettering (only
  // if it stays dark enough to read), gold → gold/trim, other colored ones → the palette color nearest their lightness,
  // pale greys → lines; in-between shades follow the two colors they sit between. turn: another click on the same palette
  // picks the next suitable palette color for the colored areas. Returns { familyHex: newHex }. Used by Print Prep and
  // the Recolor page.
  const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const rgb2hex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
  function familyMapForPalette(colors, pl, turn = 0) {
    // Another click on the same palette picks the next suitable palette color for the journal's colored areas.
    const map = {}, used = new Set(), chroma = (c) => Math.hypot(c.lab[1], c.lab[2]), Lof = (h) => rgb2lab(...hex2rgb(h))[0];
    const take = (c, hex) => { if (c && hex && /^#[0-9a-f]{6}$/i.test(hex) && !used.has(c.hex)) { map[c.hex] = hex.toUpperCase(); used.add(c.hex); } };
    const light = colors.filter((c) => c.lab[0] > 80).sort((a, b) => b.share - a.share)[0];
    take(light, pl.paper);
    const dark = [...colors].sort((a, b) => a.lab[0] - b.lab[0])[0];
    const ink = [pl.title, pl.stone, pl.frame, pl.plate].filter(Boolean).sort((a, b) => Lof(a) - Lof(b))[0];
    if (dark && dark.lab[0] < 35 && ink && Lof(ink) < 45) take(dark, ink);
    // Gold-like (yellow-orange hue, mid lightness) → the palette's gold/trim; the other colored ones by how much they
    // cover: the biggest is usually bars and backgrounds (→ background color), then accent, highlight, veins.
    const hue = (c) => (Math.atan2(c.lab[2], c.lab[1]) * 180 / Math.PI + 360) % 360;
    const gold = colors.filter((c) => !used.has(c.hex) && chroma(c) > 15 && hue(c) > 50 && hue(c) < 105 && c.lab[0] > 45 && c.lab[0] < 88).sort((a, b) => chroma(b) - chroma(a))[0];
    take(gold, pl.trim);
    // Each remaining colored area takes the unused palette color closest to its own lightness, so dark bars stay dark
    // and pale fills stay pale on any palette (another click picks the next-closest).
    const colored = colors.filter((c) => !used.has(c.hex) && chroma(c) > 12).sort((a, b) => b.share - a.share);
    const cands = [...new Set([pl.stone, pl.accent, pl.highlight, pl.vein, pl.frame, pl.plate, pl.title, pl.trim].filter((h) => h && /^#[0-9a-f]{6}$/i.test(h) && h.toUpperCase() !== (pl.paper || '').toUpperCase()).map((h) => h.toUpperCase()))];
    const usedCand = new Set();
    colored.forEach((c, i) => {
      const ranked = cands.filter((h) => !usedCand.has(h)).sort((a, b) => Math.abs(Lof(a) - c.lab[0]) - Math.abs(Lof(b) - c.lab[0]));
      const near = ranked.filter((h) => Math.abs(Lof(h) - c.lab[0]) < Math.abs(Lof(ranked[0]) - c.lab[0]) + 25);
      const h = near.length ? near[(turn + i) % near.length] : ranked[0];
      if (h) { take(c, h); usedCand.add(h); }
    });
    colors.filter((c) => !used.has(c.hex) && chroma(c) <= 12 && c.lab[0] > 55 && c.lab[0] <= 95).forEach((c) => take(c, pl.line));
    // In-between shades (thin lines melting into the paper) follow the two colors they sit between, at the same mix,
    // so lines keep their weight instead of turning solid.
    const D = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]), tgt = (c) => rgb2lab(...hex2rgb(map[c.hex] || c.hex));
    for (const c of colors) {
      let best = null;
      for (const a2 of colors) for (const b2 of colors) {
        if (a2 === c || b2 === c || a2 === b2 || a2.share < c.share * .5 || b2.share < c.share * .5) continue;
        const ab = [0, 1, 2].map((i) => b2.lab[i] - a2.lab[i]), L2 = ab.reduce((u, v) => u + v * v, 0) || 1, t = ab.reduce((u, v, i) => u + v * (c.lab[i] - a2.lab[i]), 0) / L2;
        if (t < .1 || t > .9) continue;
        const d = D(c.lab, a2.lab.map((v, i) => v + t * ab[i]));
        if (d < 15 && (!best || d < best.d)) best = { d, a: a2, b: b2, t };
      }
      if (best) { const A = tgt(best.a), B = tgt(best.b); map[c.hex] = rgb2hex(lab2rgb(...A.map((v, i) => v + best.t * (B[i] - v)))); }
    }
        return map;
  }
  // { familyHex: newHex } → toneTransfer targets for familiesPreset(colors) (changed families only).
  function familyTargets(colors, map) {
    const targets = {};
    colors.forEach((f, i) => { const to = map?.[f.hex]; if (to && to !== f.hex) targets['f' + i] = to; });
    return targets;
  }

  window.ColorCore = { LIN, rgb2lab, lab2rgb, hexLab, softL, ramp01, hueBand, TONE_PRESETS, toneTransfer, findFamilies, familiesPreset, familyMapForPalette, familyTargets, hex2rgb, rgb2hex };
})();

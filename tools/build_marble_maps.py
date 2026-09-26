"""Build recolorable marble maps from Canva marble exports (Design Elements, pages 68-71).

Usage: python3 tools/build_marble_maps.py <canva-page.png> <key> [--light L0,L1] [--gold C0,C1] [--hue H0,H1] [--pale C0,C1] [--tex K] [--soften R] [--photo]

Settings used (Design Elements page -> key):
  68 rose     --light 84,90 --gold 32,46 --hue 44,52
  69 burgundy --light 40,62 --gold 36,50 --hue 44,52 --tex 2 --soften 4 --photo
  70 ember    --light 8,22  --gold 22,36 --hue 36,44
  71 peach    --light 84,90 --gold 36,48 --hue 50,56

Export the page from Canva as a transparent PNG at 3264 px wide (the marble's frame is found from the
alpha channel and its soft edge trimmed). Writes, next to index.html:

  marble-layers-<key>.png  the layer map paintMarble() recolors, same channel layout as the other marbles:
                           R = the source's lightness, encoded around each layer's own middle tone at the
                               slope that layer's tone curve uses (stone 30, highlight 60, gold 100 L* per unit
                               at the default Stone texture of 60%), so the palette's own colors reproduce the
                               marble's light/dark texture instead of a flat tint;
                           G = gold vein coverage (soft edges kept);
                           B = second-stone coverage (the pale slabs / smoky wisps -> Highlights color).
  marble-<key>-gold.png    the original gold veins only (transparent elsewhere). The studio draws these exact
                           pixels in the marble's own colors and tone-transfers them for any other vein color,
                           so the metallic depth always comes from the real artwork.

Prints each layer's median color, used for the marble's "As designed" palette.
"""
import sys
import numpy as np
from PIL import Image, ImageFilter

STONE_SLOPE, HI_SLOPE, GOLD_SLOPE = 30.0, 60.0, 100.0   # L* per unit of R, from marbleLUTs() at texture 60%


def srgb_to_lab(rgb):
    c = rgb.astype(np.float64) / 255
    c = np.where(c <= .04045, c / 12.92, ((c + .055) / 1.055) ** 2.4)
    x = (c @ np.array([[.4124, .3576, .1805], [.2126, .7152, .0722], [.0193, .1192, .9505]]).T) / np.array([.95047, 1, 1.08883])
    f = np.where(x > .008856, np.cbrt(x), 7.787 * x + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def ramp(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def blur(a, r):
    return np.asarray(Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))).astype(np.float64) / 255


PRINT_W = 2666   # the studio's 300 DPI cover width (PAGE_W / 72 * 300): no need to store more than this


def main(src, key, light=(62, 78), gold=(30, 44), huestart=(44, 54), tex_scale=1.0, pale=None, soften=2.5, photo=False):
    im = Image.open(src).convert('RGBA')
    x0, y0, x1, y1 = im.getchannel('A').point(lambda a: 255 if a > 250 else 0).getbbox()
    im = im.crop((x0 + 6, y0 + 6, x1 - 6, y1 - 6))
    if im.width > PRINT_W:
        im = im.resize((PRINT_W, round(PRINT_W * im.height / im.width)), Image.LANCZOS)
    rgb = np.asarray(im.convert('RGB'))
    lab = srgb_to_lab(rgb)
    L, a, b = lab[..., 0], lab[..., 1], lab[..., 2]
    C, H = np.hypot(a, b), (np.degrees(np.arctan2(b, a)) + 360) % 360

    # Gold / ember veins: orange-to-yellow hue with metallic chroma. The pink, coral and peach stones sit below
    # ~50 deg or well under this chroma, so they never read as gold. Soft edges are kept.
    hue = ramp(H, *huestart) * (1 - ramp(H, 98, 110))
    g = hue * ramp(C, *gold)
    g = np.maximum(g, blur(g, 1.2) * .6)          # keep the dark bronze rims of the seams with the vein

    # Second stone (Highlights): the pale slabs (or smoky wisps on black) by lightness, away from the veins.
    h = ramp(L, *light) * (1 - g)
    if pale:
        # Only low-chroma (cream) areas are the second stone; saturated light areas (rose pinks) stay with the
        # stone, whose color at a lighter tone IS that pink. Mixing the two layers there would turn them grey.
        h = h * (1 - ramp(C, *pale))
    h = blur(h, soften) * (1 - g)

    s = np.clip(1 - g - h, 0, 1)
    med = lambda m: float(np.median(L[m])) if m.any() else 50.0
    mS, mH = med((g < .03) & (h < .03)), med((h > .8) & (g < .8))
    # R, solved so paintMarble reproduces each pixel's own lightness. Under the real-vein overlay the base is
    # stone*(1-B) + highlight*B, each curve centered on its layer's median at its own slope, so a blended edge
    # pixel gets the blended center and slope (the veins themselves come from the overlay's real pixels).
    sS = STONE_SLOPE * tex_scale
    center, slope = (1 - h) * mS + h * mH, (1 - h) * sS + h * HI_SLOPE
    r = .5 + (L - center) / slope
    layers = np.stack([np.clip(r, 0, 1), g, h], -1)
    Image.fromarray((layers * 255 + .5).astype(np.uint8)).save(f'marble-layers-{key}.png', optimize=True)

    if photo:
        # The source photo covers the whole marble (B = 1): its own pixels in its own colors, and a per-pixel
        # tone transfer for other palettes. The tone curves are only the fallback when Highlights are hidden.
        h = np.ones_like(h) * (1 - g)
        layers = np.stack([np.clip(.5 + (L - mS) / (STONE_SLOPE * tex_scale), 0, 1), g, np.ones_like(g)], -1)
        Image.fromarray((layers * 255 + .5).astype(np.uint8)).save(f'marble-layers-{key}.png', optimize=True)
        # Three-tone marbles (wine / rose / cream): the whole original at the map's exact frame, used like the Canva
        # cover's source (TEXTURES.veins without veinsAlpha): exact pixels over the G/B areas in the marble's own
        # colors, per-pixel tone transfer (each pixel keeps its offset from its tone group) for any other palette.
        im.convert('RGB').save(f'marble-{key}-source.jpg', quality=92)
        return report(rgb, r, g, h, im, key, mS, mH)
    alpha = (np.clip(g, 0, 1) * 255 + .5).astype(np.uint8)
    gold_px = np.dstack([np.where(alpha[..., None] > 0, rgb, 0).astype(np.uint8), alpha])   # color only where the veins are
    Image.fromarray(gold_px).save(f'marble-{key}-gold.png', optimize=True)
    report(rgb, r, g, h, im, key, mS, mH)


def report(rgb, r, g, h, im, key, mS, mH):
    def hexmed(m):
        px = rgb[m]
        return '#%02X%02X%02X' % tuple(np.median(px, 0).astype(int)) if len(px) else None
    body = g < .5
    clip = lambda m: float((((r < 0) | (r > 1)) & m & body).sum() / max(1, (m & body).sum()))
    print(f'{key}: {im.size[0]}x{im.size[1]}  gold {float((g > .5).mean()):.3f}  second stone {float((h > .5).mean()):.3f}')
    print(f'  texture out of range: stone {clip(h < .5):.2%}  second stone {clip(h >= .5):.2%}  (stone median L {mS:.0f}, second {mH:.0f})')
    print(f'  stone {hexmed((g < .03) & (h < .03))}  highlight {hexmed((h > .8) & (g < .8))}  vein {hexmed(g > .9)}')


if __name__ == '__main__':
    opt = lambda name, d: tuple(float(v) for v in sys.argv[sys.argv.index(name) + 1].split(',')) if name in sys.argv else d
    main(sys.argv[1], sys.argv[2], opt('--light', (62, 78)), opt('--gold', (30, 44)), opt('--hue', (44, 54)),
         opt("--tex", (1.0,))[0], opt("--pale", None), opt("--soften", (2.5,))[0], '--photo' in sys.argv)

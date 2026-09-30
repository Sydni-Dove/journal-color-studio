"""Rebuild the recolorable pattern maps from Canva "Design Elements" page exports.

Usage:  python3 tools/build_pattern_maps.py <dir-with-page-pngs>
Expects p30.png, p33.png, p34.png, p36.png, p37.png, p38.png (full-page exports, any resolution).

Crop boxes are page fractions, so a full-resolution export produces the same crops as the
temporary 1545 px page images. The mask method is unchanged from the placeholders:
  - two-tone designs: ink map = projection of each pixel onto (light tone -> dark tone)
  - abstract arches: per-shape coverage, blended across the two nearest source colors on AA edges
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image

OUT = Path(__file__).resolve().parent.parent
# Crop boxes (left, top, right, bottom) in fractions of the 1545 x 2000 page render.
PAGE = (1545, 2000)
TWO_TONE = {
    'cabana':    ('p30.png', (155, 386, 1391, 1614)),
    'pinstripe': ('p33.png', (158, 593, 1362, 1407)),
    'bias':      ('p34.png', (158, 593, 1388, 1407)),
    'candy':     ('p36.png', (154, 655, 1391, 1346)),
    'scribble':  ('p37.png', (130, 310, 1415, 1690)),
}
ABSTRACT = ('p38.png', (154, 382, 1391, 1619))
# ground, lines, leaf, arc, striped circle, sun, sun-over-leaf overlap, loop (channel order is part of the role model)
ABSTRACT_COLORS = ['#F5D9D5', '#010101', '#304C35', '#C16A4E', '#A7642F', '#D8805C', '#964F25', '#E9D5CF']


def load(src, name, box):
    im = Image.open(src / name).convert('RGB')
    sx, sy = im.width / PAGE[0], im.height / PAGE[1]
    l, t, r, b = box
    return np.asarray(im.crop((round(l * sx), round(t * sy), round(r * sx), round(b * sy)))).astype(float)


def two_tone(a):
    lum = a @ [.2126, .7152, .0722]
    lo, hi = np.percentile(lum, 2), np.percentile(lum, 98)
    light, dark = a[lum >= hi].mean(0), a[lum <= lo].mean(0)
    d = dark - light
    return np.clip(((a - light) @ d) / (d @ d), 0, 1), light, dark


def abstract(a):
    C = np.array([[int(h[i:i + 2], 16) for i in (1, 3, 5)] for h in ABSTRACT_COLORS], float)
    px = a.reshape(-1, 3)
    d = ((px[:, None, :] - C[None]) ** 2).sum(2)
    o = np.argsort(d, 1)
    i1, i2 = o[:, 0], o[:, 1]
    c1, seg = C[i1], C[i2] - C[i1]
    w = np.clip(((px - c1) * seg).sum(1) / np.maximum((seg * seg).sum(1), 1e-6), 0, 1)
    w[np.linalg.norm(px - (c1 + seg * w[:, None]), axis=1) > 40] = 0
    cov = np.zeros((len(px), 9))
    cov[np.arange(len(px)), i1] += 1 - w
    cov[np.arange(len(px)), i2] += w
    err = np.abs(cov[:, :8] @ C - px).mean()
    return (cov * 255).round().astype('uint8').reshape(*a.shape[:2], 9), err


def main(src):
    src = Path(src)
    for key, (name, box) in TWO_TONE.items():
        t, light, dark = two_tone(load(src, name, box))
        Image.fromarray((t * 255).round().astype('uint8'), 'L').save(OUT / f'pattern-{key}.png', optimize=True)
        print(f'{key}: {t.shape[1]}x{t.shape[0]}  light #{"%02X%02X%02X" % tuple(light.round().astype(int))}  dark #{"%02X%02X%02X" % tuple(dark.round().astype(int))}')
    cov, err = abstract(load(src, *ABSTRACT))
    for k in range(3):
        Image.fromarray(cov[:, :, 3 * k:3 * k + 3], 'RGB').save(OUT / f'pattern-abstract-{k}.png', optimize=True)
    print(f'abstract: {cov.shape[1]}x{cov.shape[0]}  reconstruction error {err:.2f}/255')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')

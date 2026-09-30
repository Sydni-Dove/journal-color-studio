"""Split the Prayer Journal cover's flattened Canva element into background art and overlay art.

Usage: python3 tools/split_prayer_cover_wash.py

canva/elements/prayer-cover-wash.png is one flattened image: a pink watercolor wash (background art) with the
gold double frame, the glitter swipe and the gold dots (overlay art) painted on top of it. When a replacement
background is chosen the pink wash has to go while the gold stays, so this writes the gold on its own:

  canva/elements/prayer-cover-gold.png   the gold frame, glitter swipe and dots only, original pixels, transparent
                                         elsewhere, same size and position as prayer-cover-wash.png.

Gold is found the same way as the Studio's 'wash' tone preset: gold hue (Lab hue 58-108 deg) with real chroma.
The glitter's darkest flecks fall below that chroma, so dark pixels inside the glitter's own footprint are kept too.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(__file__))
from build_marble_maps import srgb_to_lab  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), '..', 'canva', 'elements')


def ramp(x, a, b):
    return np.clip((x - a) / (b - a), 0, 1)


def main():
    src = Image.open(os.path.join(ROOT, 'prayer-cover-wash.png')).convert('RGBA')
    px = np.array(src)
    lab = srgb_to_lab(px[..., :3])
    L, C = lab[..., 0], np.hypot(lab[..., 1], lab[..., 2])
    H = (np.degrees(np.arctan2(lab[..., 2], lab[..., 1])) + 360) % 360
    gold = ramp(H, 58, 66) * (1 - ramp(H, 100, 108)) * ramp(C, 12, 20)
    # The glitter's footprint: gold closed over its gaps (the thin frame lines stay thin: closing only fills small holes).
    core = Image.fromarray(((gold > .4) * 255).astype(np.uint8))
    closed = np.array(core.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(9))) > 127
    dark = closed * (1 - ramp(L, 45, 60))                   # dark glitter flecks, never the pale pink paint
    weight = np.maximum(gold, dark)
    out = px.copy()
    out[..., 3] = np.round(px[..., 3] * weight).astype(np.uint8)
    out[out[..., 3] == 0, :3] = 0
    Image.fromarray(out).save(os.path.join(ROOT, 'prayer-cover-gold.png'), optimize=True)
    print('gold coverage', round(float((out[..., 3] > 0).mean()), 4))


if __name__ == '__main__':
    main()

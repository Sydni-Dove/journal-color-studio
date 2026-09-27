"""Build small picker thumbnails from the design-library snapshot.

Usage: python3 tools/build_thumbs.py  (from product-studio/)

Thumbnails are DERIVED files (a centre crop of the snapshot artwork, resized
with Lanczos). The editor recolors them with the same recolor engine as the
page, so a thumbnail shows the design in the current palette without decoding
the multi-megabyte print artwork. Pages and print always use the full files.

Layer maps keep their channel meaning (R = stone detail, G = veins,
B = second stone), so they recolor exactly like the originals. Transparent
overlays keep their alpha.
"""
from pathlib import Path
from PIL import Image

SRC = Path(__file__).resolve().parent.parent / "src" / "design-library" / "assets"
OUT = SRC / "thumbs"
SIZE = 160  # px, square

FILES = [
    "marble-layers.png", "marble-layers-canva.png", "marble-canva-source.png",
    "marble-layers-goldleaf.png", "marble-goldleaf-gold.png", "marble-layers-white.png",
    "marble-layers-rose.png", "marble-rose-gold.png",
    "marble-layers-burgundy.png", "marble-burgundy-source.jpg",
    "marble-layers-ember.png", "marble-ember-gold.png",
    "marble-layers-peach.png", "marble-peach-gold.png",
    "pattern-cabana.png", "pattern-pinstripe.png", "pattern-bias.png",
    "floral-bouquet.png", "floral-corner.png", "floral-header.png",
]


def thumb(name):
    im = Image.open(SRC / name)
    w, h = im.size
    if name.startswith(("marble", "pattern")):
        # Centre square crop: materials are shown as a swatch.
        s = min(w, h)
        im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s)).resize((SIZE, SIZE), Image.LANCZOS)
    else:
        # Objects keep their whole silhouette.
        k = SIZE / max(w, h)
        im = im.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
    out = OUT / (Path(name).stem + (".jpg" if name.endswith(".jpg") else ".png"))
    if name.endswith(".jpg"):
        im.convert("RGB").save(out, quality=90)
    else:
        im.save(out, optimize=True)


STATS_W = 240  # JCS marbleStats samples a 240 px-wide copy of the whole map


def stats_sample(name):
    """Whole-frame 240 px copy of a marble layer map: thumbnails compute their tone statistics from it
    instead of decoding the multi-megabyte print map. (Pages still measure the full map.)"""
    im = Image.open(SRC / name).convert("RGB")
    w, h = im.size
    im.resize((STATS_W, round(STATS_W * h / w)), Image.LANCZOS).save(OUT / (Path(name).stem + "-stats.png"), optimize=True)


ABSTRACT_SCALE = 0.25  # layer copies for the picker: a 144 px page thumbnail needs ~0.15 of the layers' own resolution


def abstract_layers():
    """Abstract watercolor: every layer scaled by the SAME factor, so the Canva transforms still place them
    (the renderer sizes each layer from its original pixel size, not the copy's)."""
    out = OUT / "abstract64"
    out.mkdir(exist_ok=True)
    for f in sorted((SRC / "abstract64").glob("layer-*.png")):
        im = Image.open(f)
        w, h = im.size
        im.resize((max(1, round(w * ABSTRACT_SCALE)), max(1, round(h * ABSTRACT_SCALE))), Image.LANCZOS).save(out / f.name, optimize=True)


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    for f in FILES:
        thumb(f)
        if f.startswith("marble-layers"):
            stats_sample(f)
    abstract_layers()
    print(f"wrote {len(FILES)} thumbnails to {OUT}")

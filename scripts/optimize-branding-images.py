from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
TARGETS = [
    ROOT / "assets/images/icon.png",
    ROOT / "assets/images/splash-icon.png",
    ROOT / "assets/images/favicon.png",
    ROOT / "assets/images/android-icon-foreground.png",
]

for target in TARGETS:
    with Image.open(target) as source:
        image = source.convert("RGBA")
        image.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
        palette = image.quantize(colors=192, method=Image.Quantize.FASTOCTREE)
        palette.save(target, format="PNG", optimize=True, compress_level=9)
        print(f"optimized {target.name}: {target.stat().st_size} bytes")

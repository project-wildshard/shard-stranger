#!/usr/bin/env python3
"""The stranger shard's curated hero: three plain title cards at the sizes upload's hero gate wants.

    python3 hero.py <out dir> <edition>

The edition is printed small on each card, so every new version's hero differs (upload refuses an unchanged hero).
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

SIZES = {"thumb": (640, 360), "portrait": (804, 1626), "landscape": (1600, 900)}
out, edition = Path(sys.argv[1]), sys.argv[2]
out.mkdir(parents=True, exist_ok=True)


def font(size):
    for name in ("/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"):
        if Path(name).exists():
            return ImageFont.truetype(name, size)
    return ImageFont.load_default(size)


for slot, (w, h) in SIZES.items():
    image = Image.new("RGB", (w, h))
    draw = ImageDraw.Draw(image)
    for y in range(h):  # dusk: deep teal at the top to warm clay at the foot
        t = y / h
        draw.line([(0, y), (w, y)], fill=(int(18 + 150 * t * t), int(52 + 60 * t), int(64 + 10 * t)))
    unit = min(w, h)
    for i in range(9):  # nine placeholder bodies on the horizon, one per fixture family
        x = w * (i + 1) / 10
        r = unit * (0.03 + 0.015 * (i % 3))
        ground = h * 0.78
        draw.ellipse([x - r, ground - 2 * r, x + r, ground], fill=(30, 26, 30))
    draw.rectangle([0, h * 0.78, w, h], fill=(44, 34, 30))
    title, sub = "Stranger", "ten fixtures, a wolf pack, a horse and a dragon"
    big, small = font(int(unit * 0.16)), font(int(unit * 0.045))
    tw = draw.textlength(title, font=big)
    draw.text(((w - tw) / 2, h * 0.3), title, font=big, fill=(240, 232, 214))
    sw = draw.textlength(sub, font=small)
    if sw > w * 0.92:
        small = font(int(unit * 0.045 * w * 0.92 / sw))
        sw = draw.textlength(sub, font=small)
    draw.text(((w - sw) / 2, h * 0.3 + unit * 0.2), sub, font=small, fill=(220, 210, 190))
    draw.text((unit * 0.03, h - unit * 0.06), edition, font=font(int(unit * 0.03)), fill=(150, 140, 125))
    image.save(out / f"{slot}.jpg", quality=88)

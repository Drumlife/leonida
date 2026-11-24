"""Assemble les tuiles d'un niveau de zoom en une seule mosaïque (tableau numpy).

Usage : .venv/Scripts/python.exe tools/assemble.py [z]
Sortie : tools/cache/mosaic_z{z}.npy  (+ un aperçu réduit en PNG)
"""
import json
import re
import sys

import numpy as np
from PIL import Image

from roads_common import CACHE, TILE, TILES

OCEAN = (47, 144, 176)


def main(z=4):
    folder = TILES / str(z)
    tiles = {}
    for f in folder.glob("*.jpg"):
        m = re.fullmatch(rf"{z},(\d+),(\d+)\.jpg", f.name)
        if m:
            tiles[(int(m.group(1)), int(m.group(2)))] = f
    ys = [k[0] for k in tiles]
    xs = [k[1] for k in tiles]
    y0, y1, x0, x1 = min(ys), max(ys), min(xs), max(xs)
    h, w = (y1 - y0 + 1) * TILE, (x1 - x0 + 1) * TILE
    print(f"z{z}: {len(tiles)} tuiles, lignes {y0}-{y1}, colonnes {x0}-{x1} -> {w}x{h} px")

    mosaic = np.empty((h, w, 3), dtype=np.uint8)
    mosaic[:] = OCEAN
    for (ty, tx), f in tiles.items():
        img = np.asarray(Image.open(f).convert("RGB"))
        oy, ox = (ty - y0) * TILE, (tx - x0) * TILE
        mosaic[oy:oy + TILE, ox:ox + TILE] = img

    CACHE.mkdir(parents=True, exist_ok=True)
    np.save(CACHE / f"mosaic_z{z}.npy", mosaic)
    meta = {"z": z, "origin": [x0 * TILE, y0 * TILE], "size": [w, h]}
    (CACHE / f"mosaic_z{z}.json").write_text(json.dumps(meta))
    preview = Image.fromarray(mosaic).resize((w // 8, h // 8), Image.LANCZOS)
    preview.save(CACHE / f"mosaic_z{z}_preview.png")
    print("ok", meta)


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 4)

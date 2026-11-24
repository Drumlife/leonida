"""Étape 1 : masque binaire des routes à partir de la mosaïque.

Les routes sont claires et peu saturées (gris très clair ou crème pour les autoroutes),
alors que la ville est gris moyen, la végétation verte et l'eau bleue.

Usage : .venv/Scripts/python.exe tools/road_mask.py [z]
Sortie : tools/cache/mask_z{z}.npy + aperçus PNG
"""
import json
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage import morphology

from roads_common import CACHE

BRIGHT_MIN = 192      # moyenne R,G,B minimale
SAT_MAX = 32          # écart max-min maximal (peu saturé)
MIN_AREA_M2 = 2500    # composantes plus petites = bruit (bâtiments clairs, étiquettes)


def main(z=4):
    meta = json.loads((CACHE / f"mosaic_z{z}.json").read_text())
    m_per_px = 32768 / (2 ** (z + 2) * 256)
    img = np.load(CACHE / f"mosaic_z{z}.npy")

    rgb = img.astype(np.int16)
    bright = rgb.mean(axis=2)
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    mask = (bright >= BRIGHT_MIN) & (sat <= SAT_MAX)
    del rgb, bright, sat

    # Petits trous (marquages, compression JPEG) et micro-coupures.
    mask = ndi.binary_closing(mask, structure=np.ones((3, 3)), iterations=1)
    min_px = int(MIN_AREA_M2 / (m_per_px ** 2))
    mask = morphology.remove_small_objects(mask, min_size=min_px)
    mask = morphology.remove_small_holes(mask, area_threshold=int(400 / (m_per_px ** 2)))

    np.save(CACHE / f"mask_z{z}.npy", mask)
    print(f"masque : {mask.mean() * 100:.2f} % des pixels, seuil bruit {min_px} px")

    h, w = mask.shape
    Image.fromarray((mask[::4, ::4] * 255).astype(np.uint8)).save(CACHE / f"mask_z{z}_preview.png")
    # Gros plan sur Vice City pour juger la qualité.
    cy, cx = h * 60 // 100, w * 68 // 100
    crop_img = img[cy - 700:cy + 700, cx - 900:cx + 900].copy()
    crop_mask = mask[cy - 700:cy + 700, cx - 900:cx + 900]
    crop_img[crop_mask] = (crop_img[crop_mask] * 0.3 + np.array([255, 0, 90]) * 0.7).astype(np.uint8)
    Image.fromarray(crop_img).save(CACHE / f"mask_z{z}_crop.png")
    print("aperçus écrits", meta)


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 4)

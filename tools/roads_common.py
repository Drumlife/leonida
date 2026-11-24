"""Constantes et utilitaires partagés pour l'extraction du réseau routier.

Repère gtadb.org : mètres, centré sur (0, 0), y vers le nord.
Niveau z : n = 2**(z+2) tuiles de 256 px par côté, couvrant 32768 m.
Fichiers : maps/tiles/6/day/{z}/{z},{y},{x}.jpg
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TILES = ROOT / "vendor" / "gtadb" / "maps" / "tiles" / "6" / "day"
CACHE = ROOT / "tools" / "cache"
OUT = ROOT / "app" / "data"

HALF = 16384
TILE = 256


def mppx(z):
    """Mètres par pixel au niveau z."""
    return 32768 / (2 ** (z + 2) * TILE)


def px_to_world(px, py, z, origin):
    """Pixel de la mosaïque -> coordonnées monde (x, y) en mètres.

    origin = (px0, py0) : position de la mosaïque dans l'image complète du niveau.
    """
    m = mppx(z)
    return ((px + origin[0]) * m - HALF, HALF - (py + origin[1]) * m)


def world_to_px(x, y, z, origin):
    m = mppx(z)
    return ((x + HALF) / m - origin[0], (HALF - y) / m - origin[1])

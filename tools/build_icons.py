"""Regroupe les SVG d'icônes de vendor/ dans app/data/material-icons.js.

- Material Symbols (vendor/material-symbols/rounded/*-fill.svg) : clé = nom, valeur = tracé
  (grille 960, viewBox 0 -960 960 960).
- Font Awesome Free (vendor/fontawesome/solid/*.svg) : clé = "fa:nom", valeur = [viewBox, tracé].

L'app dessine ses pastilles en SVG en ligne : on n'a besoin que des tracés (attribut d).
Usage : python tools/build_icons.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "vendor" / "material-symbols" / "rounded"
OUT = ROOT / "app" / "data" / "material-icons.js"

icons = {}
for f in sorted(SRC.glob("*-fill.svg")):
    text = f.read_text(encoding="utf-8")
    paths = re.findall(r'<path[^>]*\sd="([^"]+)"', text)
    if not paths:
        raise SystemExit(f"aucun tracé dans {f.name}")
    icons[f.name[: -len("-fill.svg")]] = " ".join(paths)

for f in sorted((ROOT / "vendor" / "fontawesome" / "solid").glob("*.svg")):
    text = f.read_text(encoding="utf-8")
    vb = re.search(r'viewBox="([^"]+)"', text).group(1)
    paths = re.findall(r'<path[^>]*\sd="([^"]+)"', text)
    icons["fa:" + f.stem] = [vb, " ".join(paths)]

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(
    "/* Généré par tools/build_icons.py. Material Symbols (Apache 2.0, Google), style « rounded »,\n"
    " * grille 960 ; entrées « fa:… » : Font Awesome Free (CC BY 4.0), [viewBox, tracé]. */\n"
    "window.MATERIAL_ICONS = " + json.dumps(icons, separators=(",", ":")) + ";\n",
    encoding="utf-8",
)
print(f"{len(icons)} icônes -> {OUT} ({OUT.stat().st_size / 1024:.0f} Ko)")

# Crédits

## Tuiles de la carte et données de lieux — gtadb.org

- GTA VI Map Tiles (CC BY 4.0) — https://map.gtadb.org
- GTA VI Landmarks Data (CC BY 4.0) — https://map.gtadb.org

© 2025-2026 GTADB.ORG and contributors.
Licence : Creative Commons Attribution 4.0 International — https://creativecommons.org/licenses/by/4.0/
Source : https://github.com/rolux/gtadb.org (commit cloné le 2026-11-23, copie locale dans `vendor/gtadb/`)

Fichiers utilisés :
- `maps/tiles/6/day/**` — tuiles officielles de la carte de Leonida
- `map/data/6/landmarks.json` — lieux et repères du jeu

Modifications :
- `app/data/roads.json` est une œuvre dérivée des tuiles : les tuiles du niveau 4 ont été
  assemblées, les routes isolées par leur couleur puis converties automatiquement en graphe
  (scripts dans `tools/`). Ce réseau est donc lui aussi sous CC BY 4.0, avec le même crédit.
- Les tuiles elles-mêmes sont utilisées telles quelles.

Ce crédit doit aussi être affiché dans l'application, par exemple dans le coin de la carte.

## Icônes — Material Symbols (Google)

- Licence : Apache License 2.0 — copie dans `vendor/material-symbols/LICENSE`
- Source : paquet npm `@material-symbols/svg-400` v0.49.0, style « rounded », plein
  (seuls les SVG utilisés sont copiés dans `vendor/material-symbols/rounded/`)
- `app/data/material-icons.js` regroupe leurs tracés (généré par `tools/build_icons.py`) ;
  les pastilles de couleur, lettres et coches autour des pictogrammes sont propres à ce projet.

## Icônes — Font Awesome Free

- Icônes « solid » de Font Awesome Free 7.3.1 (Fonticons, Inc.) — https://fontawesome.com
  (armes, animaux, coffre-fort, journal, etc. : entrées « fa:… » dans `app/icons.js`)
- Licence des icônes : CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/
  (licence complète dans `vendor/fontawesome/LICENSE.txt`)
- Utilisées telles quelles, recolorées en blanc sur la pastille du groupe.

## Jeu

Grand Theft Auto VI et toute l'imagerie du jeu © Rockstar Games.
Ce projet est un outil personnel non officiel, sans lien avec Rockstar Games.

"""Étape 2 : squelette du masque -> graphe routier (intersections + tronçons).

1. Squelettisation : chaque route devient une ligne d'un pixel.
2. Les pixels avec 1 voisin (cul-de-sac) ou 3+ voisins (intersection) forment les nœuds ;
   les pixels collés sont regroupés en un seul nœud.
3. On suit le squelette d'un nœud à l'autre pour obtenir les tronçons.
4. Nettoyage : petits ergots supprimés, petites coupures recousues, nœuds de passage fusionnés,
   îlots minuscules retirés.

Usage : .venv/Scripts/python.exe tools/build_graph.py [z]
Sortie : app/data/roads.json  {nodes: [[x, y]], edges: [[a, b, longueur_m, [[x, y], ...]]]}
"""
import json
import math
import sys
from collections import defaultdict

import numpy as np
from scipy import ndimage as ndi
from scipy.spatial import cKDTree
from skimage.measure import approximate_polygon
from skimage.morphology import skeletonize

from roads_common import CACHE, OUT, px_to_world

SPUR_MAX_M = 30        # ergots (impasses courtes) supprimés
GAP_MAX_M = 25         # impasses recousues au nœud voisin le plus proche
MIN_COMPONENT_M = 300  # réseaux isolés plus courts que ça : supprimés
SIMPLIFY_PX = 1.0      # tolérance de simplification des tracés

NEIGH = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def trace(skel, node_lab):
    """Suit le squelette entre les nœuds. Retourne [(nœud_a, nœud_b, [(r, c), ...])]."""
    h, w = skel.shape
    visited = np.zeros_like(skel, dtype=bool)
    edges = []
    rows, cols = np.nonzero(node_lab)
    for r0, c0 in zip(rows.tolist(), cols.tolist()):
        a = int(node_lab[r0, c0])
        for dr, dc in NEIGH:
            r, c = r0 + dr, c0 + dc
            if not (0 <= r < h and 0 <= c < w) or not skel[r, c]:
                continue
            if node_lab[r, c] or visited[r, c]:
                continue
            path = [(r0, c0), (r, c)]
            visited[r, c] = True
            prev = (r0, c0)
            end = None
            while True:
                cr, cc = path[-1]
                nxt = None
                for er, ec in NEIGH:
                    nr, nc = cr + er, cc + ec
                    if not (0 <= nr < h and 0 <= nc < w) or not skel[nr, nc]:
                        continue
                    if (nr, nc) == prev:
                        continue
                    lab = node_lab[nr, nc]
                    if lab and not (lab == a and len(path) <= 2):
                        end = (int(lab), (nr, nc))
                        break
                    if not lab and not visited[nr, nc]:
                        nxt = (nr, nc)
                if end:
                    path.append(end[1])
                    break
                if nxt is None:
                    break  # boucle fermée ou fin anormale : abandon
                visited[nxt] = True
                prev = path[-1]
                path.append(nxt)
            if end:
                edges.append((a, end[0], path))
    return edges


def path_length_px(path):
    total = 0.0
    for (r1, c1), (r2, c2) in zip(path, path[1:]):
        total += math.hypot(r2 - r1, c2 - c1)
    return total


class Graph:
    def __init__(self):
        self.nodes = {}                 # id -> (x, y)
        self.edges = {}                 # id -> [a, b, length, coords]
        self.adj = defaultdict(set)     # node -> {edge ids}
        self._next = 0

    def add_edge(self, a, b, length, coords):
        eid = self._next
        self._next += 1
        self.edges[eid] = [a, b, length, coords]
        self.adj[a].add(eid)
        self.adj[b].add(eid)
        return eid

    def remove_edge(self, eid):
        a, b, _, _ = self.edges.pop(eid)
        self.adj[a].discard(eid)
        self.adj[b].discard(eid)

    def remove_node_if_isolated(self, n):
        if not self.adj.get(n):
            self.adj.pop(n, None)
            self.nodes.pop(n, None)

    def degree(self, n):
        return len(self.adj.get(n, ()))

    def other(self, eid, n):
        a, b, _, _ = self.edges[eid]
        return b if a == n else a


def dedupe(g):
    """Supprime boucles sur place et doublons (garde le plus court)."""
    best = {}
    for eid, (a, b, length, _) in list(g.edges.items()):
        if a == b and length < 60:
            g.remove_edge(eid)
            continue
        key = (min(a, b), max(a, b))
        if key in best and a != b:
            other = best[key]
            if g.edges[other][2] <= length:
                g.remove_edge(eid)
                continue
            g.remove_edge(other)
        best[key] = eid


def prune_spurs(g):
    changed = True
    removed = 0
    while changed:
        changed = False
        for n in list(g.nodes):
            if g.degree(n) == 1:
                eid = next(iter(g.adj[n]))
                if g.edges[eid][2] < SPUR_MAX_M and g.degree(g.other(eid, n)) >= 3:
                    other = g.other(eid, n)
                    g.remove_edge(eid)
                    g.remove_node_if_isolated(n)
                    g.remove_node_if_isolated(other)
                    removed += 1
                    changed = True
    return removed


def stitch_gaps(g):
    """Relie chaque impasse au nœud le plus proche s'il est assez près et pas déjà voisin."""
    ids = list(g.nodes)
    pts = np.array([g.nodes[i] for i in ids])
    tree = cKDTree(pts)
    added = 0
    for n in ids:
        if n not in g.nodes or g.degree(n) != 1:
            continue
        x, y = g.nodes[n]
        neighbours = {g.other(e, n) for e in g.adj[n]}
        for d, j in zip(*tree.query((x, y), k=6, distance_upper_bound=GAP_MAX_M)):
            if math.isinf(d) or j >= len(ids):
                continue
            m = ids[j]
            if m == n or m in neighbours or m not in g.nodes:
                continue
            g.add_edge(n, m, float(d), [(x, y), g.nodes[m]])
            added += 1
            break
    return added


def contract_degree2(g):
    """Fusionne les tronçons qui se suivent sans intersection."""
    merged = 0
    for n in list(g.nodes):
        if g.degree(n) != 2:
            continue
        e1, e2 = list(g.adj[n])
        a1, b1, l1, c1 = g.edges[e1]
        a2, b2, l2, c2 = g.edges[e2]
        p = a1 if b1 == n else b1
        q = b2 if a2 == n else a2
        if p == n or q == n or p == q:
            continue
        c1 = c1 if b1 == n else c1[::-1]   # p -> n
        c2 = c2 if a2 == n else c2[::-1]   # n -> q
        g.remove_edge(e1)
        g.remove_edge(e2)
        g.add_edge(p, q, l1 + l2, c1 + c2[1:])
        g.remove_node_if_isolated(n)
        merged += 1
    return merged


def drop_small_components(g):
    seen = set()
    dropped = 0
    for start in list(g.nodes):
        if start in seen:
            continue
        comp, stack, comp_edges = [], [start], set()
        seen.add(start)
        while stack:
            n = stack.pop()
            comp.append(n)
            for e in g.adj[n]:
                comp_edges.add(e)
                m = g.other(e, n)
                if m not in seen:
                    seen.add(m)
                    stack.append(m)
        total = sum(g.edges[e][2] for e in comp_edges)
        if total < MIN_COMPONENT_M:
            for e in comp_edges:
                g.remove_edge(e)
            for n in comp:
                g.remove_node_if_isolated(n)
            dropped += 1
    return dropped


def main(z=4):
    meta = json.loads((CACHE / f"mosaic_z{z}.json").read_text())
    origin = tuple(meta["origin"])
    m_per_px = 32768 / (2 ** (z + 2) * 256)
    mask = np.load(CACHE / f"mask_z{z}.npy")

    # Recadrage sur la zone utile pour économiser la mémoire.
    rows = np.any(mask, axis=1)
    cols = np.any(mask, axis=0)
    r0, r1 = np.nonzero(rows)[0][[0, -1]]
    c0, c1 = np.nonzero(cols)[0][[0, -1]]
    r0, c0 = max(r0 - 2, 0), max(c0 - 2, 0)
    mask = mask[r0:r1 + 3, c0:c1 + 3]
    origin = (origin[0] + c0, origin[1] + r0)
    print("zone", mask.shape)

    skel = skeletonize(mask)
    del mask
    nb = ndi.convolve(skel.astype(np.uint8), np.ones((3, 3), np.uint8), mode="constant") - 1
    node_px = skel & (nb != 2)
    node_lab, n_nodes = ndi.label(node_px, structure=np.ones((3, 3)))
    print(f"squelette : {int(skel.sum())} px, {n_nodes} nœuds bruts")

    centroids = ndi.center_of_mass(node_px, node_lab, range(1, n_nodes + 1))
    g = Graph()
    for i, (r, c) in enumerate(centroids, start=1):
        g.nodes[i] = px_to_world(c, r, z, origin)

    raw = trace(skel, node_lab)
    print(f"tronçons bruts : {len(raw)}")
    for a, b, path in raw:
        arr = np.array(path, dtype=float)
        simple = approximate_polygon(arr, tolerance=SIMPLIFY_PX)
        coords = [px_to_world(c, r, z, origin) for r, c in simple]
        coords[0], coords[-1] = g.nodes[a], g.nodes[b]
        g.add_edge(a, b, path_length_px(path) * m_per_px, coords)
    for n in list(g.nodes):
        g.remove_node_if_isolated(n)

    dedupe(g)
    print("ergots supprimés :", prune_spurs(g))
    dedupe(g)
    print("nœuds de passage fusionnés :", contract_degree2(g))
    print("coupures recousues :", stitch_gaps(g))
    dedupe(g)
    print("ergots supprimés (2e passe) :", prune_spurs(g))
    print("nœuds de passage fusionnés (2e passe) :", contract_degree2(g))
    print("îlots retirés :", drop_small_components(g))

    # Renumérotation compacte et export.
    ids = {n: i for i, n in enumerate(sorted(g.nodes))}
    r1d = lambda v: round(v, 1)
    out = {
        "source": "Extrait automatiquement des tuiles gtadb.org (CC BY 4.0), niveau %d" % z,
        "nodes": [[r1d(g.nodes[n][0]), r1d(g.nodes[n][1])] for n in sorted(g.nodes)],
        "edges": [
            [ids[a], ids[b], r1d(length), [[r1d(x), r1d(y)] for x, y in coords]]
            for a, b, length, coords in g.edges.values()
        ],
    }
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / "roads.json"
    path.write_text(json.dumps(out, separators=(",", ":")))
    total_km = sum(e[2] for e in out["edges"]) / 1000
    print(f"OK : {len(out['nodes'])} nœuds, {len(out['edges'])} tronçons, {total_km:.0f} km, "
          f"{path.stat().st_size / 1e6:.1f} Mo -> {path}")


if __name__ == "__main__":
    sys.setrecursionlimit(10000)
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 4)

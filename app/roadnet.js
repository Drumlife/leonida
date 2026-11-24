/*
 * Réseau routier : accroche des points aux routes et plus courts chemins (Dijkstra).
 *
 * Données (app/data/roads.json) :
 *   nodes: [[x, y], ...]                      intersections et impasses, en mètres
 *   edges: [[a, b, longueur, [[x, y], ...]]]  tracé de chaque tronçon, de a vers b
 *
 * Un point hors route est relié à la route la plus proche par une ligne droite
 * (« accès »), puis suit le réseau.
 */
(function (global) {
  "use strict";

  const CELL = 250; // taille des cases de l'index spatial, en mètres

  class MinHeap {
    constructor() { this.k = []; this.v = []; }
    get size() { return this.k.length; }
    push(key, val) {
      const k = this.k, v = this.v;
      let i = k.length;
      k.push(key); v.push(val);
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (k[p] <= key) break;
        k[i] = k[p]; v[i] = v[p]; i = p;
      }
      k[i] = key; v[i] = val;
    }
    pop() {
      const k = this.k, v = this.v;
      const topK = k[0], topV = v[0];
      const lastK = k.pop(), lastV = v.pop();
      const n = k.length;
      if (n) {
        let i = 0;
        while (true) {
          let c = 2 * i + 1;
          if (c >= n) break;
          if (c + 1 < n && k[c + 1] < k[c]) c++;
          if (k[c] >= lastK) break;
          k[i] = k[c]; v[i] = v[c]; i = c;
        }
        k[i] = lastK; v[i] = lastV;
      }
      return [topK, topV];
    }
  }

  const NODE_SNAP_M = 15; // une accroche à moins de 15 m d'une extrémité réutilise ce nœud

  class RoadNetwork {
    constructor(data) {
      this.nodes = data.nodes.slice(); // copie : les modifications ajoutent des nœuds
      this.edges = [];
      this.adj = this.nodes.map(() => []);
      this.grid = new Map();
      this._log = null;
      for (const [a, b, , coords] of data.edges) this.addEdge(a, b, coords, false);
    }

    get totalLength() { return this.edges.reduce((s, e) => s + (e.dead ? 0 : e.len), 0); }

    /** Ajoute un tronçon (a, b : indices de nœuds ; coords : tracé de a vers b). */
    addEdge(a, b, coords, user) {
      const cum = new Float64Array(coords.length);
      for (let i = 1; i < coords.length; i++) {
        cum[i] = cum[i - 1] + Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1]);
      }
      const ei = this.edges.length;
      this.edges.push({ a, b, coords, cum, len: cum[cum.length - 1], user: !!user, dead: false });
      this.adj[a].push(ei);
      if (b !== a) this.adj[b].push(ei);
      this._indexEdge(ei);
      if (this._log) this._log.added.push(ei);
      return ei;
    }

    addNode(x, y) {
      this.nodes.push([x, y]);
      this.adj.push([]);
      return this.nodes.length - 1;
    }

    removeEdge(ei) {
      const e = this.edges[ei];
      if (!e || e.dead) return;
      e.dead = true;
      this.adj[e.a] = this.adj[e.a].filter((i) => i !== ei);
      this.adj[e.b] = this.adj[e.b].filter((i) => i !== ei);
      if (this._log) this._log.removed.push(ei);
    }

    degree(n) { return this.adj[n].length; }

    /** Identifiant stable d'un tronçon (extrémités arrondies au mètre + longueur). */
    edgeKey(ei) {
      const e = this.edges[ei];
      const p = e.coords[0], q = e.coords[e.coords.length - 1];
      const s1 = Math.round(p[0]) + "," + Math.round(p[1]);
      const s2 = Math.round(q[0]) + "," + Math.round(q[1]);
      return (s1 < s2 ? s1 + "|" + s2 : s2 + "|" + s1) + "|" + Math.round(e.len);
    }

    findEdge(key) {
      for (let i = 0; i < this.edges.length; i++) {
        if (!this.edges[i].dead && this.edgeKey(i) === key) return i;
      }
      return -1;
    }

    /** Coupe un tronçon à une distance donnée et retourne le nœud créé (ou l'extrémité proche). */
    splitEdge(ei, along) {
      const e = this.edges[ei];
      if (along <= NODE_SNAP_M) return e.a;
      if (e.len - along <= NODE_SNAP_M) return e.b;
      const c1 = this._slice(ei, 0, along);
      const c2 = this._slice(ei, along, e.len);
      const p = c1[c1.length - 1];
      const n = this.addNode(p[0], p[1]);
      this.removeEdge(ei);
      this.addEdge(e.a, n, c1, e.user);
      this.addEdge(n, e.b, c2, e.user);
      return n;
    }

    /** Nœud du réseau à cet endroit : existant, créé en coupant une route, ou nouveau nœud isolé. */
    attach(x, y, tol) {
      const sp = this.snap(x, y);
      if (sp && sp.off <= tol) return this.splitEdge(sp.edge, sp.along);
      return this.addNode(x, y);
    }

    /**
     * Applique une modification enregistrée :
     *   {t: "add", c: [[x, y, relié?], ...]}  nouvelle route ; les extrémités et les sommets
     *                                         marqués « relié » se raccordent au réseau
     *   {t: "del", k: clé}                    suppression d'un tronçon (voir edgeKey)
     * Retourne {ok, added, removed} (indices de tronçons) pour mettre à jour l'affichage.
     */
    apply(op) {
      this._log = { added: [], removed: [] };
      let ok = true;
      if (op.t === "del") {
        const ei = this.findEdge(op.k);
        if (ei < 0) ok = false;
        else this.removeEdge(ei);
      } else if (op.t === "add" && op.c.length >= 2) {
        const c = op.c;
        const nodeAt = c.map((v, i) => (i === 0 || i === c.length - 1 || v[2] ? this.attach(v[0], v[1], 3) : -1));
        let start = 0;
        for (let i = 1; i < c.length; i++) {
          if (nodeAt[i] < 0) continue;
          const a = nodeAt[start], b = nodeAt[i];
          const coords = [this.nodes[a].slice()];
          for (let j = start + 1; j < i; j++) coords.push([c[j][0], c[j][1]]);
          coords.push(this.nodes[b].slice());
          if (a !== b || coords.length > 2) this.addEdge(a, b, coords, true);
          start = i;
        }
      } else {
        ok = false;
      }
      const log = this._log;
      this._log = null;
      const removed = new Set(log.removed);
      return {
        ok,
        added: log.added.filter((i) => !removed.has(i)),
        removed: log.removed.filter((i) => !log.added.includes(i)),
      };
    }

    _indexEdge(ei) {
      const e = this.edges[ei];
      for (let s = 0; s < e.coords.length - 1; s++) {
        const [x1, y1] = e.coords[s];
        const [x2, y2] = e.coords[s + 1];
        const cx0 = Math.floor(Math.min(x1, x2) / CELL), cx1 = Math.floor(Math.max(x1, x2) / CELL);
        const cy0 = Math.floor(Math.min(y1, y2) / CELL), cy1 = Math.floor(Math.max(y1, y2) / CELL);
        for (let cx = cx0; cx <= cx1; cx++) {
          for (let cy = cy0; cy <= cy1; cy++) {
            const key = cx + "," + cy;
            let list = this.grid.get(key);
            if (!list) this.grid.set(key, (list = []));
            list.push(ei, s);
          }
        }
      }
    }

    /** Point le plus proche sur le réseau : {edge, along, x, y, off}. */
    snap(x, y) {
      const gx = Math.floor(x / CELL), gy = Math.floor(y / CELL);
      let best = null;
      for (let r = 0; r <= 40; r++) {
        for (let cx = gx - r; cx <= gx + r; cx++) {
          for (let cy = gy - r; cy <= gy + r; cy++) {
            if (r && Math.abs(cx - gx) !== r && Math.abs(cy - gy) !== r) continue; // anneau seulement
            const list = this.grid.get(cx + "," + cy);
            if (!list) continue;
            for (let i = 0; i < list.length; i += 2) {
              const e = this.edges[list[i]];
              if (e.dead) continue;
              const s = list[i + 1];
              const [x1, y1] = e.coords[s];
              const [x2, y2] = e.coords[s + 1];
              const dx = x2 - x1, dy = y2 - y1;
              const l2 = dx * dx + dy * dy;
              let t = l2 ? ((x - x1) * dx + (y - y1) * dy) / l2 : 0;
              t = Math.max(0, Math.min(1, t));
              const px = x1 + t * dx, py = y1 + t * dy;
              const d = Math.hypot(x - px, y - py);
              if (!best || d < best.off) {
                best = { edge: list[i], along: e.cum[s] + t * Math.sqrt(l2), x: px, y: py, off: d };
              }
            }
          }
        }
        // Tout point d'un anneau plus lointain est à au moins r*CELL.
        if (best && best.off <= r * CELL) break;
      }
      return best;
    }

    /** Dijkstra depuis un point accroché. Retourne les distances à chaque nœud. */
    fromSnap(sp) {
      const n = this.nodes.length;
      const dist = new Float64Array(n).fill(Infinity);
      const prevEdge = new Int32Array(n).fill(-2); // -1 = atteint directement depuis l'accroche
      const heap = new MinHeap();
      const e0 = this.edges[sp.edge];
      const seed = (node, d) => {
        if (d < dist[node]) { dist[node] = d; prevEdge[node] = -1; heap.push(d, node); }
      };
      seed(e0.a, sp.off + sp.along);
      seed(e0.b, sp.off + (e0.len - sp.along));
      while (heap.size) {
        const [d, u] = heap.pop();
        if (d > dist[u]) continue;
        for (const ei of this.adj[u]) {
          const e = this.edges[ei];
          const v = e.a === u ? e.b : e.a;
          const nd = d + e.len;
          if (nd < dist[v]) { dist[v] = nd; prevEdge[v] = ei; heap.push(nd, v); }
        }
      }
      return { sp, dist, prevEdge };
    }

    /** Coût depuis le résultat d'un Dijkstra jusqu'à un autre point accroché. */
    cost(res, tq) {
      return this._bestEnd(res, tq).cost;
    }

    _bestEnd(res, tq) {
      const f = this.edges[tq.edge];
      const opts = [
        { cost: res.dist[f.a] + tq.along + tq.off, via: f.a },
        { cost: res.dist[f.b] + (f.len - tq.along) + tq.off, via: f.b },
      ];
      if (res.sp.edge === tq.edge) {
        opts.push({ cost: res.sp.off + Math.abs(res.sp.along - tq.along) + tq.off, via: -1 });
      }
      return opts.reduce((m, o) => (o.cost < m.cost ? o : m));
    }

    /** Tracé complet [[x, y], ...] du point de départ (P) au point d'arrivée (Q). */
    path(res, P, tq, Q) {
      const sp = res.sp;
      const end = this._bestEnd(res, tq);
      if (!isFinite(end.cost)) return null;
      const out = [[P.x, P.y], [sp.x, sp.y]];
      if (end.via === -1) {
        out.push(...this._slice(sp.edge, sp.along, tq.along));
      } else {
        // Remonte de `via` jusqu'à l'accroche de départ.
        const chain = [];
        let node = end.via;
        while (res.prevEdge[node] >= 0) {
          const ei = res.prevEdge[node];
          const e = this.edges[ei];
          const from = e.a === node ? e.b : e.a;
          chain.push([ei, from, node]);
          node = from;
        }
        const e0 = this.edges[sp.edge];
        out.push(...this._slice(sp.edge, sp.along, node === e0.a ? 0 : e0.len));
        for (let i = chain.length - 1; i >= 0; i--) {
          const [ei, from] = chain[i];
          const e = this.edges[ei];
          out.push(...(from === e.a ? e.coords : e.coords.slice().reverse()));
        }
        const f = this.edges[tq.edge];
        out.push(...this._slice(tq.edge, end.via === f.a ? 0 : f.len, tq.along));
      }
      out.push([tq.x, tq.y], [Q.x, Q.y]);
      return { coords: out, cost: end.cost };
    }

    /** Portion du tracé d'un tronçon entre deux distances (dans un sens ou dans l'autre). */
    _slice(ei, d0, d1) {
      const e = this.edges[ei];
      const at = (d) => {
        let i = 1;
        while (i < e.cum.length - 1 && e.cum[i] < d) i++;
        const seg = e.cum[i] - e.cum[i - 1] || 1;
        const t = Math.max(0, Math.min(1, (d - e.cum[i - 1]) / seg));
        const [x1, y1] = e.coords[i - 1], [x2, y2] = e.coords[i];
        return { i, p: [x1 + t * (x2 - x1), y1 + t * (y2 - y1)] };
      };
      const s = at(d0), t = at(d1);
      const pts = [s.p];
      if (d0 <= d1) {
        for (let i = s.i; i < t.i; i++) pts.push(e.coords[i]);
      } else {
        for (let i = s.i - 1; i >= t.i; i--) pts.push(e.coords[i]);
      }
      pts.push(t.p);
      return pts;
    }
  }

  global.RoadNetwork = RoadNetwork;
})(typeof window !== "undefined" ? window : globalThis);

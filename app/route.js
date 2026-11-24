/*
 * Ordre de passage le plus court entre des points (problème du voyageur de commerce, chemin ouvert).
 * 1. Plus proche voisin depuis le départ, pour une première solution.
 * 2. Amélioration 2-opt : on inverse des segments tant que ça raccourcit le trajet.
 *
 * La distance est fournie par l'appelant : aujourd'hui en ligne droite, plus tard par la route.
 */
(function (global) {
  "use strict";

  function euclid(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function nearestNeighbour(start, points, dist) {
    const remaining = points.slice();
    const path = [start];
    let current = start;
    while (remaining.length) {
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const d = dist(current, remaining[i]);
        if (d < bestD) { bestD = d; best = i; }
      }
      current = remaining.splice(best, 1)[0];
      path.push(current);
    }
    return path;
  }

  // 2-opt pour un chemin ouvert dont le départ (index 0) est fixe.
  function twoOpt(path, dist, maxMillis) {
    const n = path.length - 1;
    const deadline = Date.now() + maxMillis;
    let improved = true;
    while (improved && Date.now() < deadline) {
      improved = false;
      for (let i = 1; i < n; i++) {
        for (let k = i + 1; k <= n; k++) {
          const a = path[i - 1], b = path[i], c = path[k];
          const removed = dist(a, b) + (k < n ? dist(c, path[k + 1]) : 0);
          const added = dist(a, c) + (k < n ? dist(b, path[k + 1]) : 0);
          if (added < removed - 1e-6) {
            reverse(path, i, k);
            improved = true;
          }
        }
      }
    }
    return path;
  }

  function reverse(arr, i, k) {
    while (i < k) {
      const t = arr[i];
      arr[i] = arr[k];
      arr[k] = t;
      i++;
      k--;
    }
  }

  function pathLength(path, dist) {
    let total = 0;
    for (let i = 1; i < path.length; i++) total += dist(path[i - 1], path[i]);
    return total;
  }

  /**
   * @param {{x:number,y:number}} start  Point de départ (non inclus dans `points`).
   * @param {Array<{x:number,y:number}>} points  Points à visiter.
   * @param {object} [opts]  { dist: function(a,b), maxMillis: number }
   * @returns {{order: Array, length: number}}  `order` exclut le départ.
   */
  function planRoute(start, points, opts) {
    const dist = (opts && opts.dist) || euclid;
    const maxMillis = (opts && opts.maxMillis) || 1500;
    if (!points.length) return { order: [], length: 0 };
    const path = twoOpt(nearestNeighbour(start, points, dist), dist, maxMillis);
    return { order: path.slice(1), length: pathLength(path, dist) };
  }

  global.LeonidaRoute = { planRoute, euclid, pathLength };
})(typeof window !== "undefined" ? window : globalThis);

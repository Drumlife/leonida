/*
 * Synchronisation des points entre appareils, via Supabase, sans compte.
 *
 * Tout appareil qui connaît le même « code de synchro » partage la même sauvegarde.
 * Le serveur ne stocke qu'une empreinte (SHA-256) du code et n'est accessible que par
 * deux fonctions : leonida_load(code) et leonida_save(code, données, version).
 *
 * Partagé entre appareils : points, catégories, corrections de routes.
 * Propre à chaque appareil : vue de la carte, catégories masquées, réglages d'affichage.
 *
 * Conflits (deux appareils modifiés hors ligne) : fusion point par point, la modification
 * la plus récente l'emporte ; les suppressions sont gardées 90 jours (« pierres tombales »).
 */
(function (global) {
  "use strict";

  const META_KEY = "leonida.sync";
  const TOMBSTONE_MS = 90 * 24 * 3600 * 1000;
  const PUSH_DELAY = 1500;

  const cfg = global.LEONIDA_CONFIG || {};
  const enabled = !!(cfg.supabaseUrl && cfg.supabaseKey);

  let meta = { key: "", version: 0, dirty: false, hash: "" };
  try { meta = { ...meta, ...JSON.parse(localStorage.getItem(META_KEY) || "{}") }; } catch (e) { /* ignoré */ }
  const storeMeta = () => { try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) { /* ignoré */ } };

  let hooks = null;          // {getState, applyRemote, onStatus}
  let timer = null;
  let busy = false;
  let again = false;
  let status = "off";

  function setStatus(s, detail) {
    status = s;
    hooks?.onStatus?.(s, detail);
  }

  // --- Appels au serveur -----------------------------------------------------
  async function rpc(name, body) {
    const headers = { "Content-Type": "application/json", apikey: cfg.supabaseKey };
    if (!cfg.supabaseKey.startsWith("sb_")) headers.Authorization = "Bearer " + cfg.supabaseKey;
    const r = await fetch(cfg.supabaseUrl.replace(/\/$/, "") + "/rest/v1/rpc/" + name, {
      method: "POST", headers, body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`${r.status} ${await r.text().catch(() => "")}`.trim());
    return r.json();
  }

  // --- Document partagé ------------------------------------------------------
  /** Partie partagée de l'état, avec horodatage des points modifiés et des suppressions. */
  function sharedDoc(state) {
    return {
      points: state.points,
      categories: state.categories,
      roadEdits: state.roadEdits || [],
      roadEditsAt: state.roadEditsAt || 0,
      deleted: state.deleted || {},
    };
  }

  function hashOf(doc) {
    // Assez pour savoir si quelque chose a changé (pas un usage cryptographique).
    const s = JSON.stringify(doc);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36) + ":" + s.length;
  }

  const stamp = (p) => p.updated || p.created || 0;

  /** Fusionne deux documents : le plus récent gagne, point par point. */
  function merge(local, remote) {
    const deleted = { ...(remote.deleted || {}) };
    for (const [id, t] of Object.entries(local.deleted || {})) deleted[id] = Math.max(deleted[id] || 0, t);
    const now = Date.now();
    for (const [id, t] of Object.entries(deleted)) if (now - t > TOMBSTONE_MS) delete deleted[id];

    const byId = new Map();
    for (const p of remote.points || []) byId.set(p.id, p);
    for (const p of local.points || []) {
      const q = byId.get(p.id);
      if (!q || stamp(p) >= stamp(q)) byId.set(p.id, p);
    }
    const points = [...byId.values()].filter((p) => !(deleted[p.id] && deleted[p.id] >= stamp(p)));

    const cats = new Map();
    for (const c of remote.categories || []) cats.set(c.id, c);
    for (const c of local.categories || []) cats.set(c.id, c);

    const localRoadsNewer = (local.roadEditsAt || 0) >= (remote.roadEditsAt || 0);
    return {
      points,
      categories: [...cats.values()],
      roadEdits: localRoadsNewer ? local.roadEdits : remote.roadEdits || [],
      roadEditsAt: Math.max(local.roadEditsAt || 0, remote.roadEditsAt || 0),
      deleted,
    };
  }

  // --- Suivi des modifications locales ----------------------------------------
  let snapshot = null; // id -> JSON du point (sans « updated »)
  const pointKey = (p) => { const { updated, ...rest } = p; return JSON.stringify(rest); };

  /**
   * À appeler après chaque modification de l'état : horodate les points modifiés,
   * note les suppressions, puis programme l'envoi si la partie partagée a changé.
   */
  function noteChange(state) {
    const now = Date.now();
    state.deleted = state.deleted || {};
    if (snapshot) {
      const seen = new Set();
      for (const p of state.points) {
        seen.add(p.id);
        const k = pointKey(p);
        if (snapshot.get(p.id) !== k) {
          if (snapshot.has(p.id) || !p.created || now - p.created > 5000) p.updated = now;
          delete state.deleted[p.id];
        }
      }
      for (const id of snapshot.keys()) if (!seen.has(id)) state.deleted[id] = now;
      const roadsKey = JSON.stringify(state.roadEdits || []);
      if (snapshot.roads !== undefined && snapshot.roads !== roadsKey) state.roadEditsAt = now;
    }
    takeSnapshot(state);
    if (!enabled || !meta.key) return;
    const h = hashOf(sharedDoc(state));
    if (h !== meta.hash) {
      meta.dirty = true;
      storeMeta();
      schedulePush();
    }
  }

  function takeSnapshot(state) {
    snapshot = new Map(state.points.map((p) => [p.id, pointKey(p)]));
    snapshot.roads = JSON.stringify(state.roadEdits || []);
  }

  function schedulePush() {
    clearTimeout(timer);
    timer = setTimeout(push, PUSH_DELAY);
  }

  // --- Envoi / réception -------------------------------------------------------
  async function push() {
    if (!enabled || !meta.key || !meta.dirty) return;
    if (busy) { again = true; return; }
    busy = true;
    setStatus("saving");
    try {
      let state = hooks.getState();
      let doc = sharedDoc(state);
      let res = await rpc("leonida_save", { p_key: meta.key, p_data: doc, p_version: meta.version });
      if (!res.ok) {
        // Un autre appareil a enregistré entre-temps : on fusionne et on réessaie.
        const merged = merge(doc, res.data || {});
        hooks.applyRemote(merged);
        state = hooks.getState();
        takeSnapshot(state);
        doc = sharedDoc(state);
        res = await rpc("leonida_save", { p_key: meta.key, p_data: doc, p_version: res.version });
        if (!res.ok) throw new Error("conflit répété");
      }
      meta.version = res.version;
      meta.hash = hashOf(doc);
      meta.dirty = hashOf(sharedDoc(hooks.getState())) !== meta.hash;
      storeMeta();
      setStatus("ok");
    } catch (e) {
      setStatus(navigator.onLine === false ? "offline" : "error", String(e.message || e));
      clearTimeout(timer);
      timer = setTimeout(push, 15000); // nouvel essai plus tard
    } finally {
      busy = false;
      if (again) { again = false; if (meta.dirty) schedulePush(); }
    }
  }

  /** Récupère la sauvegarde distante et l'applique (ou la fusionne si on a des changements locaux). */
  async function pull() {
    if (!enabled || !meta.key || busy) return;
    busy = true;
    setStatus("loading");
    try {
      const res = await rpc("leonida_load", { p_key: meta.key });
      const state = hooks.getState();
      if (!res) {
        // Code tout neuf : on envoie ce qu'on a.
        meta.version = 0;
        meta.dirty = true;
      } else if (res.version !== meta.version || meta.dirty) {
        const remote = res.data || {};
        const next = meta.dirty ? merge(sharedDoc(state), remote) : remote;
        hooks.applyRemote(next);
        takeSnapshot(hooks.getState());
        meta.version = res.version;
        meta.hash = hashOf(remote);
        meta.dirty = hashOf(sharedDoc(hooks.getState())) !== meta.hash;
      }
      storeMeta();
      setStatus(meta.dirty ? "saving" : "ok");
    } catch (e) {
      setStatus(navigator.onLine === false ? "offline" : "error", String(e.message || e));
    } finally {
      busy = false;
    }
    if (meta.dirty) schedulePush();
  }

  // --- Code de synchro ---------------------------------------------------------
  const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans 0/O ni 1/I
  function newCode() {
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    let s = "";
    for (const b of bytes) s += ALPHABET[b % 32];
    return s.match(/.{5}/g).join("-"); // 4 groupes de 5 = 100 bits
  }
  const normalizeCode = (c) => (c || "").toUpperCase().replace(/[^A-Z0-9]/g, "").match(/.{1,5}/g)?.join("-") || "";

  function setCode(code) {
    meta = { key: normalizeCode(code), version: 0, dirty: true, hash: "" };
    storeMeta();
    return pull();
  }

  function disable() {
    clearTimeout(timer);
    meta = { key: "", version: 0, dirty: false, hash: "" };
    storeMeta();
    setStatus("off");
  }

  function init(h) {
    hooks = h;
    takeSnapshot(hooks.getState());
    // Un lien « …#sync=CODE » configure l'appareil d'un coup (le fragment n'est jamais envoyé au serveur web).
    const m = /[#&]sync=([A-Za-z0-9-]+)/.exec(location.hash);
    if (m) {
      history.replaceState(null, "", location.pathname + location.search);
      if (enabled && normalizeCode(m[1]).length >= 20) {
        meta = { key: normalizeCode(m[1]), version: 0, dirty: true, hash: "" };
        storeMeta();
        hooks.onLinked?.();
      }
    }
    if (!enabled) { setStatus("unconfigured"); return; }
    // Récupère les changements faits sur un autre appareil quand on revient sur l'app.
    document.addEventListener("visibilitychange", () => { if (!document.hidden) pull(); });
    global.addEventListener("online", () => (meta.dirty ? push() : pull()));
    if (!meta.key) { setStatus("off"); return; }
    pull();
  }

  global.LeonidaSync = {
    init, noteChange, pull, push, setCode, disable, newCode, normalizeCode, merge,
    get enabled() { return enabled; },
    get code() { return meta.key; },
    get status() { return status; },
  };
})(window);

/*
 * Synchronisation des points entre appareils, via Firebase (Firestore), sans compte.
 *
 * Tout appareil qui connaît le même « code de synchro » partage la même sauvegarde.
 * Le serveur ne voit qu'une empreinte (SHA-256) du code, qui sert de nom au document.
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
  const enabled = !!(cfg.firebaseProjectId && cfg.firebaseApiKey);

  let meta = { key: "", version: "", dirty: false, hash: "" };
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

  // --- Appels au serveur (Firestore, API REST) --------------------------------
  // Une sauvegarde = un document leonida_saves/{SHA-256 du code}, avec un seul champ « json ».
  // Le code lui-même ne quitte jamais l'appareil ; les règles Firestore interdisent de lister
  // la collection, donc il faut connaître le code pour retrouver le document.
  // « version » = updateTime du document, utilisé comme verrou optimiste.
  const DOCS = enabled
    ? `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(cfg.firebaseProjectId)}/databases/(default)/documents/leonida_saves/`
    : "";
  const docIds = new Map();
  async function docId(key) {
    if (!docIds.has(key)) {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
      docIds.set(key, [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join(""));
    }
    return docIds.get(key);
  }

  async function request(method, key, query, body) {
    const params = new URLSearchParams({ key: cfg.firebaseApiKey, ...query });
    const r = await fetch(DOCS + (await docId(key)) + "?" + params, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await r.json().catch(() => ({}));
    return { r, json };
  }

  /** {version, data} ou null si ce code n'a encore rien enregistré. */
  async function load(key) {
    const { r, json } = await request("GET", key, {});
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`${r.status} ${json.error?.message || ""}`.trim());
    return { version: json.updateTime, data: JSON.parse(json.fields?.json?.stringValue || "{}") };
  }

  /** Enregistre si la version distante est toujours « version » ; sinon renvoie la version actuelle. */
  async function save(key, data, version) {
    const precondition = version ? { "currentDocument.updateTime": version } : { "currentDocument.exists": "false" };
    const { r, json } = await request("PATCH", key, precondition, { fields: { json: { stringValue: JSON.stringify(data) } } });
    if (r.ok) return { ok: true, version: json.updateTime };
    const st = json.error?.status;
    if (st === "FAILED_PRECONDITION" || st === "ALREADY_EXISTS" || st === "NOT_FOUND" || r.status === 409) {
      const cur = await load(key);
      return { ok: false, version: cur?.version || "", data: cur?.data || {} };
    }
    throw new Error(`${r.status} ${json.error?.message || ""}`.trim());
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
      let res = await save(meta.key, doc, meta.version);
      if (!res.ok) {
        // Un autre appareil a enregistré entre-temps : on fusionne et on réessaie.
        const merged = merge(doc, res.data || {});
        hooks.applyRemote(merged);
        state = hooks.getState();
        takeSnapshot(state);
        doc = sharedDoc(state);
        res = await save(meta.key, doc, res.version);
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
      const res = await load(meta.key);
      const state = hooks.getState();
      if (!res) {
        // Code tout neuf : on envoie ce qu'on a.
        meta.version = "";
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
    meta = { key: normalizeCode(code), version: "", dirty: true, hash: "" };
    storeMeta();
    return pull();
  }

  function disable() {
    clearTimeout(timer);
    meta = { key: "", version: "", dirty: false, hash: "" };
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
        meta = { key: normalizeCode(m[1]), version: "", dirty: true, hash: "" };
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

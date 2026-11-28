/*
 * Cartes partagées en lecture seule (Firestore, sans compte).
 *
 * Le propriétaire publie ses points (sans ses crochets) dans leonida_shares/{sid}.
 * Quiconque a le lien « #map=sid » peut lire la carte ; seul le propriétaire peut la
 * modifier, car chaque publication s'accompagne d'une preuve (leonida_proofs/{sid},
 * jamais lisible) contenant le secret d'écriture w, vérifiée par les règles Firestore.
 *
 * sid et w sont dérivés du code de synchro du propriétaire et d'un « sel » aléatoire :
 * changer le sel (arrêter puis reprendre le partage) donne un nouveau lien.
 */
(function (global) {
  "use strict";

  const cfg = global.LEONIDA_CONFIG || {};
  const enabled = !!(cfg.firebaseProjectId && cfg.firebaseApiKey);
  const DB = `projects/${cfg.firebaseProjectId}/databases/(default)/documents`;
  const API = "https://firestore.googleapis.com/v1/";

  async function sha256hex(s) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  const randomHex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");

  /** Identifiant public (sid) et secret d'écriture (w) d'une carte partagée. */
  async function ids(code, salt) {
    const sid = await sha256hex(`leonida-share-read:${code}:${salt}`);
    const w = await sha256hex(`leonida-share-write:${code}:${salt}`);
    return { sid, w };
  }

  const isSid = (s) => /^[0-9a-f]{64}$/.test(s || "");

  /** Lit une carte partagée : son contenu, ou null si elle n'existe pas. */
  async function fetchShare(sid) {
    const r = await fetch(`${API}${DB}/leonida_shares/${sid}?key=${encodeURIComponent(cfg.firebaseApiKey)}`);
    if (r.status === 404) return null;
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${r.status} ${json.error?.message || ""}`.trim());
    return JSON.parse(json.fields?.json?.stringValue || "{}");
  }

  /** Publie (ou remplace) la carte : preuve + contenu dans le même lot. */
  async function publish(sid, w, data) {
    const wh = await sha256hex(w);
    const n = randomHex(16);
    const str = (v) => ({ stringValue: v });
    const body = {
      writes: [
        { update: { name: `${DB}/leonida_proofs/${sid}`, fields: { w: str(w), n: str(n) } } },
        { update: { name: `${DB}/leonida_shares/${sid}`, fields: { json: str(JSON.stringify(data)), wh: str(wh), n: str(n) } } },
      ],
    };
    const r = await fetch(`${API}${DB}:commit?key=${encodeURIComponent(cfg.firebaseApiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const json = await r.json().catch(() => ({}));
      throw new Error(`${r.status} ${json.error?.message || ""}`.trim());
    }
  }

  global.LeonidaShare = { enabled, ids, isSid, fetchShare, publish, randomHex, sha256hex };
})(window);

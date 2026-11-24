(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Carte : repère gtadb.org (mètres, centré sur 0,0, y vers le nord).
  // Niveau 0 = 32 m/px, chaque niveau divise par 2 (niveau 5 = 1 m/px, 6 = 0,5 m/px).
  // Les tuiles sont nommées {z}/{z},{y},{x}.jpg.
  // ---------------------------------------------------------------------------
  const HALF = 16384;
  const MPPX0 = 32;
  const TILE_URL = "../vendor/gtadb/maps/tiles/6/day/{z}/{z},{y},{x}.jpg";
  const LANDMARKS_URL = "../vendor/gtadb/map/data/6/landmarks.json";
  const ROADS_URL = "data/roads.json";
  const STORAGE_KEY = "leonida.v1";

  const CRS = L.extend({}, L.CRS.Simple, {
    transformation: new L.Transformation(1 / MPPX0, HALF / MPPX0, -1 / MPPX0, HALF / MPPX0),
  });

  const toLatLng = (p) => L.latLng(p.y, p.x);
  const fromLatLng = (ll) => ({ x: Math.round(ll.lng * 10) / 10, y: Math.round(ll.lat * 10) / 10 });

  // Catégories : une par icône (icons.js), regroupées comme dans icons.js, plus un groupe
  // « Personnalisées » pour celles que l'utilisateur crée (pastille simple, sans pictogramme).
  const ICONS = window.LeonidaIcons;
  const CUSTOM_GROUP = { id: "custom", name: "Personnalisées", color: "#a855f7" };
  const GROUPS = [...ICONS.GROUPS, CUSTOM_GROUP];
  const iconCategory = (ic) => ({ id: ic.id, name: ic.fr, game: ic.name, icon: ic.id, group: ic.group, color: ICONS.groupById[ic.group].color });
  const DEFAULT_CATEGORIES = [
    ...ICONS.ICONS.map(iconCategory),
    { id: "other", name: "Autre", group: "custom", color: CUSTOM_GROUP.color },
  ];
  // Anciennes catégories de départ (avant les icônes) : retirées si aucun point ne les utilise.
  const LEGACY_IDS = new Set(["collectible", "activity", "weapon", "vehicle", "shop"]);

  /** Ajoute les catégories à icône manquantes et range les anciennes dans « Personnalisées ». */
  function migrateCategories(s) {
    const used = new Set(s.points.map((p) => p.cat));
    s.categories = s.categories.filter((c) => !LEGACY_IDS.has(c.id) || used.has(c.id));
    const have = new Map(s.categories.map((c) => [c.id, c]));
    for (const c of s.categories) {
      const ic = ICONS.byId[c.icon || c.id];
      if (ic) { c.icon = ic.id; c.group = ic.group; c.game = ic.name; }
      else c.group = "custom";
    }
    for (const def of DEFAULT_CATEGORIES) if (!have.has(def.id)) s.categories.push({ ...def });
    // Ordre : celui des icônes, puis les personnalisées.
    const order = new Map(DEFAULT_CATEGORIES.map((c, i) => [c.id, i]));
    s.categories.sort((a, b) => (order.get(a.id) ?? 1e6) - (order.get(b.id) ?? 1e6));
    return s;
  }

  // ---------------------------------------------------------------------------
  // État et sauvegarde locale (pas de compte : tout reste dans ce navigateur).
  // ---------------------------------------------------------------------------
  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (Array.isArray(s.points) && Array.isArray(s.categories)) {
          s.hidden = s.hidden || {};
          s.prefs = s.prefs || {};
          return migrateCategories(s);
        }
      }
    } catch (e) { /* stockage indisponible : on repart à vide */ }
    return { categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })), points: [], hidden: {}, prefs: { collapsed: {} } };
  }

  function save() {
    // Horodate les changements et programme l'envoi vers la sauvegarde en ligne (si activée).
    window.LeonidaSync?.noteChange(state);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { toast("Impossible de sauvegarder dans ce navigateur."); }
  }

  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const catById = (id) => state.categories.find((c) => c.id === id) || state.categories[state.categories.length - 1];
  const isVisible = (p) => !state.hidden[p.cat] && !(state.prefs.hideFound && p.found);

  // ---------------------------------------------------------------------------
  // Carte Leaflet
  // ---------------------------------------------------------------------------
  const map = L.map("map", {
    crs: CRS,
    minZoom: 0,
    maxZoom: 8,
    zoomSnap: 0.5,
    preferCanvas: false,
    maxBounds: L.latLngBounds([-HALF, -HALF], [HALF, HALF / 2]).pad(0.1),
    attributionControl: true,
  });

  L.tileLayer(TILE_URL, {
    tileSize: 256,
    minZoom: 0,
    maxZoom: 8,
    maxNativeZoom: 6,
    noWrap: true,
    bounds: L.latLngBounds([-HALF, -HALF], [HALF, HALF]),
    errorTileUrl: "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==",
    attribution:
      'Tuiles : <a href="https://map.gtadb.org" target="_blank" rel="noopener">gtadb.org</a> et contributeurs ' +
      '(<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>) · GTA VI © Rockstar Games',
  }).addTo(map);
  map.attributionControl.setPrefix(false);

  const view = state.prefs.view;
  if (view) map.setView([view.lat, view.lng], view.zoom);
  else map.setView([0, -3000], 0.5);

  map.on("moveend", () => {
    const c = map.getCenter();
    state.prefs.view = { lat: c.lat, lng: c.lng, zoom: map.getZoom() };
    save();
  });

  const cursorEl = document.getElementById("cursor-pos");
  map.on("mousemove", (e) => {
    cursorEl.textContent = `x ${Math.round(e.latlng.lng)}  y ${Math.round(e.latlng.lat)}`;
  });

  // ---------------------------------------------------------------------------
  // Points de l'utilisateur
  // ---------------------------------------------------------------------------
  const pointLayer = L.layerGroup().addTo(map);
  const markers = new Map();

  function pinIcon(p) {
    const cat = catById(p.cat);
    const hl = routeIds.has(p.id) && !p.found;
    if (cat.icon) {
      return L.divIcon({
        className: "",
        html: `<div class="pin-icon${hl ? " highlight" : ""}${p.found ? " found" : ""}">` +
          ICONS.svg(cat.icon, { size: 30, found: p.found, color: cat.color }) + `</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -15],
      });
    }
    const cls = "pin" + (p.found ? " found" : "") + (hl ? " highlight" : "");
    return L.divIcon({
      className: "",
      html: `<div class="${cls}" style="background:${cat.color}">${p.found ? "✓" : ""}</div>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
      popupAnchor: [0, -12],
    });
  }

  function renderPoints() {
    pointLayer.clearLayers();
    markers.clear();
    for (const p of state.points) {
      if (!isVisible(p)) continue;
      const m = L.marker(toLatLng(p), { icon: pinIcon(p), title: p.name, riseOnHover: true });
      m.bindPopup(() => popupView(p), { minWidth: 230 });
      m.addTo(pointLayer);
      markers.set(p.id, m);
    }
    renderCategories();
    renderProgress();
  }

  function el(tag, attrs, ...children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") e.className = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    for (const c of children) e.append(c);
    return e;
  }

  /**
   * Petite fenêtre dans la page, à la place de confirm()/prompt() (bloqués par certains
   * navigateurs intégrés). Résout avec true / le texte saisi / la valeur d'un bouton, ou null.
   */
  function ask(message, { input = null, ok = "OK", cancel = "Annuler", choices = [], extra = null } = {}) {
    return new Promise((resolve) => {
      const d = el("dialog", { class: "ask" });
      const field = input !== null ? el("input", { type: "text", value: input, spellcheck: "false" }) : null;
      const done = (v) => { d.close(); d.remove(); resolve(v); };
      const row = el("div", { class: "btn-row" });
      if (cancel) row.append(el("button", { class: "btn", type: "button", onclick: () => done(null) }, cancel));
      for (const c of choices) row.append(el("button", { class: "btn", type: "button", onclick: () => done(c.value) }, c.label));
      const okBtn = el("button", { class: "btn primary", type: "button", onclick: () => done(field ? field.value : true) }, ok);
      row.append(okBtn);
      d.append(el("p", {}, message), ...(extra ? [extra] : []), ...(field ? [field] : []), row);
      d.addEventListener("cancel", (e) => { e.preventDefault(); done(null); });
      field?.addEventListener("keydown", (e) => { if (e.key === "Enter") done(field.value); });
      document.body.append(d);
      d.showModal();
      if (field) { field.focus(); field.select(); } else okBtn.focus();
    });
  }
  const showText = (message, text) => ask(message, { input: text, ok: "Fermer", cancel: null });

  function popupView(p) {
    const cat = catById(p.cat);
    const box = el("div", { class: "popup" },
      el("h3", {}, p.name || "Sans nom"),
      el("div", { class: "meta" }, `${cat.name} · x ${Math.round(p.x)}, y ${Math.round(p.y)}`),
    );
    if (p.note) box.append(el("div", { class: "note" }, p.note));
    box.append(el("div", { class: "actions" },
      el("button", { class: "btn primary", onclick: () => toggleFound(p) }, p.found ? "Non trouvé" : "Trouvé ✓"),
      el("button", { class: "btn", onclick: () => openEditor(p) }, "Modifier"),
      el("button", { class: "btn", onclick: () => copyLink(p) }, "Copier le lien"),
      el("button", { class: "btn", onclick: () => { setStart(toLatLng(p)); map.closePopup(); } }, "Départ d'ici"),
      el("button", { class: "btn", onclick: () => { map.closePopup(); startCloning(p); } }, "Placer des copies"),
      el("button", { class: "btn danger", onclick: () => removePoint(p) }, "Supprimer"),
    ));
    return box;
  }

  function editorForm(p, onSave, onCancel, opts = {}) {
    const name = el("input", { type: "text", value: p.name || "", placeholder: "Nom", maxlength: "120" });
    const cat = el("select", {});
    for (const g of GROUPS) {
      const cats = state.categories.filter((c) => c.group === g.id);
      if (!cats.length) continue;
      const og = el("optgroup", { label: g.name });
      for (const c of cats) {
        const o = el("option", { value: c.id }, c.name);
        if (c.id === p.cat) o.selected = true;
        og.append(o);
      }
      cat.append(og);
    }
    const preview = el("span", { class: "cat-preview" });
    const showPreview = () => { preview.innerHTML = catBadge(catById(cat.value), 26); };
    cat.addEventListener("change", showPreview);
    showPreview();
    const note = el("textarea", { placeholder: "Note (facultatif)", maxlength: "1000" });
    note.value = p.note || "";
    const repeat = el("input", { type: "checkbox" });
    repeat.checked = !!state.prefs.repeatAdd;
    const form = el("form", {},
      el("label", {}, "Nom"), name,
      el("label", {}, "Catégorie"), el("div", { class: "cat-select" }, preview, cat),
      el("label", {}, "Note"), note,
      opts.repeat ? el("label", { class: "check repeat" }, repeat, " Ensuite, placer d'autres points identiques en cliquant sur la carte") : "",
      el("div", { class: "actions" },
        el("button", { class: "btn primary", type: "submit" }, "Enregistrer"),
        el("button", { class: "btn", type: "button", onclick: onCancel }, "Annuler"),
      ),
    );
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (opts.repeat) { state.prefs.repeatAdd = repeat.checked; }
      onSave({ name: name.value.trim(), cat: cat.value, note: note.value.trim() }, repeat.checked);
    });
    setTimeout(() => name.focus(), 50);
    return el("div", { class: "popup" }, form);
  }

  function openEditor(p) {
    const m = markers.get(p.id);
    const content = editorForm(p, (v) => {
      Object.assign(p, v);
      save();
      renderPoints();
      markers.get(p.id)?.openPopup();
    }, () => map.closePopup());
    L.popup({ minWidth: 240 }).setLatLng(m ? m.getLatLng() : toLatLng(p)).setContent(content).openOn(map);
  }

  function createPointAt(latlng) {
    const draft = { ...fromLatLng(latlng), name: "", cat: state.prefs.lastCat || state.categories[0].id, note: "" };
    const content = editorForm(draft, (v, repeat) => {
      const p = { id: uid("p"), ...draft, ...v, found: false, created: Date.now() };
      state.points.push(p);
      state.prefs.lastCat = p.cat;
      state.hidden[p.cat] = false;
      save();
      map.closePopup();
      renderPoints();
      if (repeat) startCloning(p);
      else toast("Point ajouté.");
    }, () => map.closePopup(), { repeat: true });
    L.popup({ minWidth: 240 }).setLatLng(latlng).setContent(content).openOn(map);
  }

  function toggleFound(p) {
    p.found = !p.found;
    save();
    map.closePopup();
    renderPoints();
    if (routeIds.has(p.id)) redrawRoute();
  }

  async function removePoint(p) {
    if (!(await ask(`Supprimer « ${p.name || "Sans nom"} » ?`, { ok: "Supprimer" }))) return;
    state.points = state.points.filter((q) => q.id !== p.id);
    save();
    map.closePopup();
    renderPoints();
  }

  function copyLink(p) {
    const url = new URL(location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("point", p.id);
    navigator.clipboard?.writeText(url.toString()).then(
      () => toast("Lien copié."),
      () => showText("Copie ce lien :", url.toString()),
    );
  }

  function focusPoint(p) {
    state.hidden[p.cat] = false;
    if (p.found && state.prefs.hideFound) {
      state.prefs.hideFound = false;
      document.getElementById("hide-found").checked = false;
    }
    renderPoints();
    map.setView(toLatLng(p), Math.max(map.getZoom(), 4));
    markers.get(p.id)?.openPopup();
  }

  // ---------------------------------------------------------------------------
  // Catégories et progression
  // ---------------------------------------------------------------------------
  const catList = document.getElementById("categories");

  /** Petite pastille de catégorie (icône si elle en a une, sinon rond de couleur). */
  function catBadge(c, size) {
    if (c.icon) return ICONS.svg(c.icon, { size, color: c.color });
    return `<span class="swatch" style="background:${c.color};width:${size * 0.6}px;height:${size * 0.6}px;margin:${size * 0.2}px"></span>`;
  }

  /** Catégories regroupées et repliables ; une case par groupe pour tout cocher ou décocher. */
  function renderCategories() {
    catList.replaceChildren();
    const collapsed = (state.prefs.collapsed = state.prefs.collapsed || {});
    for (const g of GROUPS) {
      const cats = state.categories.filter((c) => c.group === g.id);
      if (!cats.length) continue;
      const pts = state.points.filter((p) => cats.some((c) => c.id === p.cat));
      const found = pts.filter((p) => p.found).length;
      const visible = cats.filter((c) => !state.hidden[c.id]).length;

      const gcb = el("input", { type: "checkbox", title: "Tout afficher / masquer" });
      gcb.checked = visible === cats.length;
      gcb.indeterminate = visible > 0 && visible < cats.length;
      gcb.addEventListener("change", () => {
        for (const c of cats) state.hidden[c.id] = !gcb.checked;
        save();
        renderPoints();
      });
      const isOpen = collapsed[g.id] === false; // groupes repliés par défaut
      const head = el("div", { class: "group-head" + (isOpen ? " open" : "") },
        gcb,
        el("button", {
          class: "group-toggle",
          onclick: () => { collapsed[g.id] = isOpen; save(); renderCategories(); },
        }, el("span", { class: "caret" }, "▸"), el("span", { class: "dot", style: `background:${g.color}` }), el("span", { class: "name" }, g.name)),
        el("span", { class: "count" }, `${found}/${pts.length}`),
      );
      const li = el("li", { class: "group" }, head);
      if (isOpen) {
        const ul = el("ul", { class: "group-items" });
        for (const c of cats) {
          const cpts = pts.filter((p) => p.cat === c.id);
          const cb = el("input", { type: "checkbox" });
          cb.checked = !state.hidden[c.id];
          cb.addEventListener("change", () => {
            state.hidden[c.id] = !cb.checked;
            save();
            renderPoints();
          });
          const color = el("input", { type: "color", value: c.color, title: "Changer la couleur" });
          color.addEventListener("change", () => { c.color = color.value; save(); renderPoints(); });
          const badge = el("span", { class: "cat-icon" });
          badge.innerHTML = catBadge(c, 22);
          ul.append(el("li", {},
            el("label", { title: c.game ? `${c.name} (${c.game})` : c.name }, cb, badge, el("span", { class: "name" }, c.name)),
            el("span", { class: "count" }, `${cpts.filter((p) => p.found).length}/${cpts.length}`),
            color,
          ));
        }
        li.append(ul);
      }
      catList.append(li);
    }
  }

  function renderProgress() {
    const total = state.points.length;
    const found = state.points.filter((p) => p.found).length;
    const pct = total ? Math.round((found / total) * 100) : 0;
    document.getElementById("progress-text").textContent = `${found} / ${total} trouvés`;
    document.getElementById("progress-pct").textContent = `${pct} %`;
    document.getElementById("progress-fill").style.width = pct + "%";
  }

  document.getElementById("cat-all").addEventListener("click", () => { state.hidden = {}; save(); renderPoints(); });
  document.getElementById("cat-none").addEventListener("click", () => {
    for (const c of state.categories) state.hidden[c.id] = true;
    save();
    renderPoints();
  });
  document.getElementById("add-category").addEventListener("click", async () => {
    const name = await ask("Nom de la nouvelle catégorie :", { input: "", ok: "Créer" });
    if (!name || !name.trim()) return;
    const hue = Math.floor(Math.random() * 360);
    state.categories.push({ id: uid("c"), name: name.trim(), group: "custom", color: hslToHex(hue, 75, 55) });
    state.prefs.collapsed = { ...(state.prefs.collapsed || {}), custom: false };
    save();
    renderCategories();
  });

  const hideFound = document.getElementById("hide-found");
  hideFound.checked = !!state.prefs.hideFound;
  hideFound.addEventListener("change", () => { state.prefs.hideFound = hideFound.checked; save(); renderPoints(); });

  function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
    return "#" + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, "0")).join("");
  }

  // ---------------------------------------------------------------------------
  // Repères gtadb.org (bâtiments et lieux, pas des objets à collectionner)
  // ---------------------------------------------------------------------------
  const landmarkRenderer = L.canvas({ padding: 0.3 });
  const landmarkLayer = L.layerGroup();
  let landmarks = [];

  fetch(LANDMARKS_URL)
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((data) => {
      for (const [id, v] of Object.entries(data)) {
        const xy = v[1];
        if (!Array.isArray(xy) || xy.length !== 2) continue;
        const lm = { id, name: v[0], x: xy[0], y: xy[1], real: v[3], tags: v[6] || [] };
        landmarks.push(lm);
        L.circleMarker(toLatLng(lm), {
          renderer: landmarkRenderer,
          radius: 3,
          weight: 1,
          color: "#fff",
          fillColor: "#1f2937",
          fillOpacity: 0.85,
        })
          .bindTooltip(lm.name, { className: "landmark-tip", direction: "top" })
          .addTo(landmarkLayer);
      }
      document.getElementById("landmark-count").textContent = landmarks.length;
      if (state.prefs.showLandmarks) landmarkLayer.addTo(map);
    })
    .catch(() => {
      document.getElementById("landmark-count").textContent = "indisponibles";
    });

  const showLandmarks = document.getElementById("show-landmarks");
  showLandmarks.checked = !!state.prefs.showLandmarks;
  showLandmarks.addEventListener("change", () => {
    state.prefs.showLandmarks = showLandmarks.checked;
    save();
    if (showLandmarks.checked) landmarkLayer.addTo(map);
    else landmarkLayer.remove();
  });

  // ---------------------------------------------------------------------------
  // Réseau routier (extrait des tuiles par tools/build_graph.py)
  // Les corrections manuelles sont une liste d'opérations (state.roadEdits) rejouées
  // par-dessus roads.json au chargement : le fichier d'origine n'est jamais modifié.
  // ---------------------------------------------------------------------------
  const ROAD_COLOR = "#7c3aed";
  const USER_ROAD_COLOR = "#f97316";
  let roadsData = null;
  let roads = null;
  let roadLayer = null;
  let roadLines = new Map();      // indice de tronçon -> polyline
  const roadRenderer = L.canvas({ padding: 0.3 });
  const deadEndLayer = L.layerGroup();
  const editLayer = L.layerGroup().addTo(map);
  const showRoads = document.getElementById("show-roads");
  showRoads.checked = !!state.prefs.showRoads;
  state.roadEdits = state.roadEdits || [];

  fetch(ROADS_URL)
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((data) => {
      roadsData = data;
      rebuildRoads(true);
    })
    .catch(() => {
      document.getElementById("road-count").textContent = "indisponible";
      showRoads.disabled = true;
      document.getElementById("road-edit").disabled = true;
    });

  /** Recharge le réseau d'origine et rejoue toutes les corrections. */
  function rebuildRoads(initial) {
    if (!roadsData) return;
    roads = new RoadNetwork(roadsData);
    let failed = 0;
    for (const op of state.roadEdits) if (!roads.apply(op).ok) failed++;
    if (failed) toast(`${failed} correction(s) de route n'ont pas pu être réappliquées.`);
    if (roadLayer) { roadLayer.remove(); roadLayer = null; }
    roadLines = new Map();
    updateRoadStats();
    if (showRoads.checked || roadEditing) drawRoads();
    if (lastRoute && (initial || !roadEditing)) redrawRoute();
  }

  function roadStyle(e) {
    return { renderer: roadRenderer, color: e.user ? USER_ROAD_COLOR : ROAD_COLOR, weight: e.user ? 3 : 2, opacity: 0.85, interactive: false };
  }

  function roadLine(ei) {
    const e = roads.edges[ei];
    const line = L.polyline(e.coords.map(([x, y]) => [y, x]), roadStyle(e));
    roadLines.set(ei, line);
    return line;
  }

  function drawRoads() {
    if (!roads) return;
    if (!roadLayer) {
      roadLayer = L.layerGroup();
      roads.edges.forEach((e, ei) => { if (!e.dead) roadLine(ei).addTo(roadLayer); });
    }
    roadLayer.addTo(map);
  }

  function updateRoadStats() {
    document.getElementById("road-count").textContent = Math.round(roads.totalLength / 1000) + " km";
    const n = state.roadEdits.length;
    document.getElementById("road-edit-count").textContent =
      n ? `${n} correction${n > 1 ? "s" : ""} enregistrée${n > 1 ? "s" : ""} dans ce navigateur.` : "Aucune correction pour l'instant.";
    document.getElementById("road-undo").disabled = !n;
    document.getElementById("road-reset").disabled = !n;
    drawDeadEnds();
  }

  /** Impasses (nœuds reliés à une seule route) : là où une coupure est probable. */
  function drawDeadEnds() {
    deadEndLayer.clearLayers();
    let count = 0;
    roads.nodes.forEach((p, n) => {
      if (roads.degree(n) !== 1) return;
      count++;
      L.circleMarker([p[1], p[0]], {
        renderer: roadRenderer, radius: 3, weight: 1, color: "#fff", fillColor: "#ef4444", fillOpacity: 1, interactive: false,
      }).addTo(deadEndLayer);
    });
    document.getElementById("deadend-count").textContent = count;
  }

  showRoads.addEventListener("change", () => {
    state.prefs.showRoads = showRoads.checked;
    save();
    if (showRoads.checked || roadEditing) drawRoads();
    else roadLayer?.remove();
  });

  // --- Mode édition --------------------------------------------------------
  let roadEditing = false;
  let roadTool = null;          // "draw" | "delete" | null
  let draft = [];               // sommets en cours de tracé : [x, y, relié (0/1)]
  let hoverEdge = -1;
  const roadEditBtn = document.getElementById("road-edit");
  const roadTools = document.getElementById("road-tools");
  const roadHint = document.getElementById("road-hint");
  const showDeadEnds = document.getElementById("show-deadends");

  const HINTS = {
    draw: "Clique pour poser les points de la route. Près d'une route existante, le point s'y raccroche (cercle jaune). " +
          "Double-clic ou Entrée pour terminer, Retour arrière pour retirer le dernier point, Échap pour abandonner.",
    delete: "Survole un tronçon (il passe en rouge) puis clique pour le supprimer.",
    none: "Choisis un outil. Les routes ajoutées sont en orange, les impasses en rouge.",
  };

  const mPerPx = () => MPPX0 / Math.pow(2, map.getZoom());

  function setRoadEditing(on) {
    if (on && !roads) return;
    roadEditing = on;
    roadEditBtn.classList.toggle("active", on);
    roadEditBtn.textContent = on ? "Terminer l'édition" : "Modifier les routes";
    roadTools.hidden = !on;
    if (on) {
      setPickMode(null);
      drawRoads();
      if (showDeadEnds.checked) deadEndLayer.addTo(map);
      setRoadTool("draw");
    } else {
      setRoadTool(null);
      deadEndLayer.remove();
      if (!showRoads.checked) roadLayer?.remove();
      if (lastRoute) redrawRoute();
    }
  }

  function setRoadTool(tool) {
    roadTool = tool;
    draft = [];
    hoverEdge = -1;
    editLayer.clearLayers();
    document.getElementById("road-draw").classList.toggle("active", tool === "draw");
    document.getElementById("road-delete").classList.toggle("active", tool === "delete");
    roadHint.textContent = HINTS[tool || "none"];
    mapEl.classList.toggle("picking", !!tool);
    if (tool === "draw") map.doubleClickZoom.disable();
    else map.doubleClickZoom.enable();
  }

  /** Position accrochée à la route la plus proche si elle est à moins de 12 pixels. */
  function snapForDraw(latlng) {
    const x = latlng.lng, y = latlng.lat;
    const sp = roads.snap(x, y);
    const tol = 12 * mPerPx();
    if (!sp || sp.off > tol) return [x, y, 0];
    const e = roads.edges[sp.edge];
    // Près d'une extrémité : on prend le nœud lui-même.
    for (const [n, d] of [[e.a, sp.along], [e.b, e.len - sp.along]]) {
      if (d <= Math.max(tol, 15)) return [roads.nodes[n][0], roads.nodes[n][1], 1];
    }
    return [sp.x, sp.y, 1];
  }

  function applyRoadEdit(op) {
    const res = roads.apply(op);
    if (!res.ok) { toast("Modification impossible."); return; }
    state.roadEdits.push(op);
    save();
    for (const ei of res.removed) { roadLines.get(ei)?.remove(); roadLines.delete(ei); }
    if (roadLayer) for (const ei of res.added) roadLine(ei).addTo(roadLayer);
    updateRoadStats();
  }

  function renderDraft(cursor) {
    editLayer.clearLayers();
    if (roadTool === "draw") {
      const pts = draft.map(([x, y]) => [y, x]);
      if (cursor && draft.length) pts.push([cursor[1], cursor[0]]);
      if (pts.length > 1) L.polyline(pts, { color: USER_ROAD_COLOR, weight: 3, dashArray: "6 6", interactive: false }).addTo(editLayer);
      for (const v of draft) {
        L.circleMarker([v[1], v[0]], { radius: v[2] ? 6 : 4, color: v[2] ? "#ffd23f" : USER_ROAD_COLOR, weight: 2, fillOpacity: 0.6, interactive: false }).addTo(editLayer);
      }
      if (cursor && cursor[2]) {
        L.circleMarker([cursor[1], cursor[0]], { radius: 7, color: "#ffd23f", weight: 2, fill: false, interactive: false }).addTo(editLayer);
      }
    } else if (roadTool === "delete" && hoverEdge >= 0) {
      const e = roads.edges[hoverEdge];
      L.polyline(e.coords.map(([x, y]) => [y, x]), { color: "#ef4444", weight: 7, opacity: 0.9, interactive: false }).addTo(editLayer);
    }
  }

  function finishDraft() {
    // Un double-clic ajoute deux fois le dernier point : on retire les doublons.
    const tol = 3 * mPerPx();
    const pts = draft.filter((v, i) => i === 0 || Math.hypot(v[0] - draft[i - 1][0], v[1] - draft[i - 1][1]) > tol);
    draft = [];
    if (pts.length >= 2) {
      applyRoadEdit({ t: "add", c: pts.map(([x, y, j]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10, j]) });
      toast("Route ajoutée.");
    }
    renderDraft();
  }

  roadEditBtn.addEventListener("click", () => setRoadEditing(!roadEditing));
  document.getElementById("road-draw").addEventListener("click", () => setRoadTool(roadTool === "draw" ? null : "draw"));
  document.getElementById("road-delete").addEventListener("click", () => setRoadTool(roadTool === "delete" ? null : "delete"));
  showDeadEnds.addEventListener("change", () => {
    if (showDeadEnds.checked && roadEditing) deadEndLayer.addTo(map);
    else deadEndLayer.remove();
  });
  document.getElementById("road-undo").addEventListener("click", () => {
    if (!state.roadEdits.length) return;
    state.roadEdits.pop();
    save();
    rebuildRoads();
    toast("Dernière correction annulée.");
  });
  document.getElementById("road-reset").addEventListener("click", async () => {
    const n = state.roadEdits.length;
    if (!n || !(await ask(`Effacer les ${n} corrections de routes et revenir au réseau d'origine ?`, { ok: "Effacer" }))) return;
    state.roadEdits = [];
    save();
    rebuildRoads();
    toast("Réseau d'origine rétabli.");
  });

  map.on("mousemove", (e) => {
    if (!roadEditing || !roadTool) return;
    if (roadTool === "draw") {
      renderDraft(snapForDraw(e.latlng));
    } else {
      const sp = roads.snap(e.latlng.lng, e.latlng.lat);
      const ei = sp && sp.off <= 10 * mPerPx() ? sp.edge : -1;
      if (ei !== hoverEdge) { hoverEdge = ei; renderDraft(); }
    }
  });

  map.on("dblclick", () => { if (roadEditing && roadTool === "draw") finishDraft(); });

  document.addEventListener("keydown", (e) => {
    if (!roadEditing || roadTool !== "draw") return;
    if (e.target.matches("input, textarea, select")) return;
    if (e.key === "Enter") finishDraft();
    else if (e.key === "Escape") { draft = []; renderDraft(); }
    else if (e.key === "Backspace") { e.preventDefault(); draft.pop(); renderDraft(); }
  });

  function roadEditClick(e) {
    if (roadTool === "draw") {
      draft.push(snapForDraw(e.latlng));
      renderDraft();
    } else if (roadTool === "delete" && hoverEdge >= 0) {
      const ei = hoverEdge;
      hoverEdge = -1;
      applyRoadEdit({ t: "del", k: roads.edgeKey(ei) });
      renderDraft();
    }
  }

  // ---------------------------------------------------------------------------
  // Recherche
  // ---------------------------------------------------------------------------
  const searchInput = document.getElementById("search");
  const searchResults = document.getElementById("search-results");
  const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  searchInput.addEventListener("input", () => {
    const q = norm(searchInput.value.trim());
    searchResults.replaceChildren();
    if (q.length < 2) { searchResults.hidden = true; return; }
    const mine = state.points.filter((p) => norm(p.name).includes(q) || norm(p.note).includes(q)).slice(0, 15);
    const lms = landmarks.filter((l) => norm(l.name).includes(q)).slice(0, 15);
    for (const p of mine) {
      searchResults.append(el("li", { onclick: () => { focusPoint(p); searchResults.hidden = true; } },
        p.name || "Sans nom", el("small", {}, catById(p.cat).name + (p.found ? " · trouvé" : ""))));
    }
    for (const l of lms) {
      searchResults.append(el("li", {
        onclick: () => {
          map.setView(toLatLng(l), Math.max(map.getZoom(), 5));
          L.popup().setLatLng(toLatLng(l)).setContent(el("div", { class: "popup" },
            el("h3", {}, l.name), el("div", { class: "meta" }, "Repère gtadb.org"),
            el("div", { class: "note" }, l.real && l.real !== "?" ? "Inspiré de : " + l.real : ""),
            el("div", { class: "actions" }, el("button", {
              class: "btn primary",
              onclick: () => createPointAt(toLatLng(l)),
            }, "Créer un point ici")),
          )).openOn(map);
          searchResults.hidden = true;
        },
      }, l.name, el("small", {}, "Repère gtadb.org")));
    }
    if (!searchResults.children.length) searchResults.append(el("li", {}, el("small", {}, "Aucun résultat")));
    searchResults.hidden = false;
  });

  // ---------------------------------------------------------------------------
  // Modes de clic sur la carte : ajout d'un point, choix du départ
  // ---------------------------------------------------------------------------
  let pickMode = null;
  const mapEl = document.getElementById("map");
  const addBtn = document.getElementById("add-point");
  const startBtn = document.getElementById("set-start");

  // --- Copies en série : chaque clic sur la carte pose un point avec la même configuration ---
  let cloneTpl = null;
  let clonePlaced = [];
  const cloneBar = document.getElementById("clone-bar");

  /** Nom de la copie suivante : « Carte 3 » devient « Carte 4 », sinon le nom est repris tel quel. */
  function nextCloneName() {
    const m = /^(.*?)(\d+)$/.exec(cloneTpl.name);
    if (!m) return cloneTpl.name;
    cloneTpl.name = m[1] + String(Number(m[2]) + 1).padStart(m[2].length, "0");
    return cloneTpl.name;
  }

  /** Nom qu'aura la prochaine copie (sans rien modifier). */
  function nextPreview() {
    const m = /^(.*?)(\d+)$/.exec(cloneTpl.name);
    return m ? m[1] + String(Number(m[2]) + 1).padStart(m[2].length, "0") : cloneTpl.name;
  }

  function startCloning(p) {
    cloneTpl = { name: p.name || "", cat: p.cat, note: p.note || "" };
    clonePlaced = [];
    setPickMode("clone");
    renderCloneBar();
  }

  function stopCloning() {
    if (pickMode === "clone") setPickMode(null);
  }

  function placeClone(latlng) {
    const p = { id: uid("p"), ...fromLatLng(latlng), name: nextCloneName(), cat: cloneTpl.cat, note: cloneTpl.note, found: false, created: Date.now() };
    state.points.push(p);
    state.hidden[p.cat] = false;
    clonePlaced.push(p.id);
    save();
    renderPoints();
    renderCloneBar();
  }

  function undoClone() {
    const id = clonePlaced.pop();
    if (!id) return;
    state.points = state.points.filter((q) => q.id !== id);
    // Le nom suivant redevient celui du point retiré.
    const m = /^(.*?)(\d+)$/.exec(cloneTpl.name);
    if (m) cloneTpl.name = m[1] + String(Number(m[2]) - 1).padStart(m[2].length, "0");
    save();
    renderPoints();
    renderCloneBar();
  }

  function renderCloneBar() {
    if (!cloneTpl) { cloneBar.hidden = true; return; }
    const c = catById(cloneTpl.cat);
    const icon = el("span", { class: "cat-icon" });
    icon.innerHTML = catBadge(c, 24);
    const n = clonePlaced.length;
    cloneBar.replaceChildren(
      icon,
      el("div", { class: "clone-text" },
        el("strong", {}, `Copies : ${c.name}` + (nextPreview() ? ` · prochain « ${nextPreview()} »` : "")),
        el("small", {}, `Clique sur la carte pour placer. ${n} placé${n > 1 ? "s" : ""}. Échap pour terminer.`)),
      el("button", { class: "btn", onclick: undoClone, ...(n ? {} : { disabled: "" }) }, "Annuler le dernier"),
      el("button", { class: "btn primary", onclick: stopCloning }, "Terminer"),
    );
    cloneBar.hidden = false;
  }

  function setPickMode(mode) {
    if (mode && roadEditing) setRoadEditing(false);
    if (mode !== "clone" && cloneTpl) {
      if (clonePlaced.length) toast(`${clonePlaced.length} copie${clonePlaced.length > 1 ? "s" : ""} ajoutée${clonePlaced.length > 1 ? "s" : ""}.`);
      cloneTpl = null;
      cloneBar.hidden = true;
    }
    pickMode = mode;
    mapEl.classList.toggle("picking", !!mode);
    addBtn.classList.toggle("active", mode === "add");
    startBtn.classList.toggle("active", mode === "start");
    document.getElementById("add-hint").hidden = mode !== "add";
  }

  addBtn.addEventListener("click", () => setPickMode(pickMode === "add" ? null : "add"));
  startBtn.addEventListener("click", () => {
    setPickMode(pickMode === "start" ? null : "start");
    if (pickMode === "start") toast("Clique sur la carte pour choisir le départ.");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setPickMode(null);
    else if (pickMode === "clone" && !e.target.matches("input, textarea, select") &&
      (e.key === "Backspace" || (e.key === "z" && (e.ctrlKey || e.metaKey)))) {
      e.preventDefault();
      undoClone();
    }
  });

  map.on("click", (e) => {
    if (roadEditing && roadTool && !pickMode) { roadEditClick(e); return; }
    if (pickMode === "add") { setPickMode(null); createPointAt(e.latlng); }
    else if (pickMode === "start") { setPickMode(null); setStart(e.latlng); }
    else if (pickMode === "clone") placeClone(e.latlng);
  });

  // ---------------------------------------------------------------------------
  // Itinéraire
  // ---------------------------------------------------------------------------
  const routeLayer = L.layerGroup().addTo(map);
  let startMarker = null;
  let routeIds = new Set();
  let lastRoute = null;

  function setStart(latlng) {
    state.prefs.start = fromLatLng(latlng);
    save();
    drawStart();
    toast("Départ défini.");
  }

  function drawStart() {
    if (startMarker) startMarker.remove();
    startMarker = null;
    const s = state.prefs.start;
    if (!s) return;
    startMarker = L.marker(toLatLng(s), {
      icon: L.divIcon({ className: "", html: '<div class="start-pin"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
      title: "Départ",
      zIndexOffset: 1000,
    }).bindTooltip("Départ").addTo(map);
  }

  function computeRoute() {
    const targets = state.points.filter((p) => !p.found && !state.hidden[p.cat]);
    if (!targets.length) { toast("Aucun point visible à visiter."); return; }
    const start = state.prefs.start || fromLatLng(map.getCenter());
    const t0 = performance.now();
    let order;
    if (roads) {
      // Matrice des distances par la route entre tous les points (un Dijkstra par point).
      const all = [start, ...targets];
      const K = all.length;
      const snaps = all.map((p) => roads.snap(p.x, p.y));
      const M = new Float64Array(K * K);
      for (let i = 0; i < K; i++) {
        const run = roads.fromSnap(snaps[i]);
        for (let j = 0; j < K; j++) {
          if (i === j) continue;
          const c = roads.cost(run, snaps[j]);
          // Réseaux non reliés (île sans pont détecté) : on retombe sur la ligne droite, pénalisée.
          M[i * K + j] = isFinite(c) ? c : 3 * LeonidaRoute.euclid(all[i], all[j]);
        }
      }
      const items = all.map((p, i) => ({ p, i, x: p.x, y: p.y }));
      const res = LeonidaRoute.planRoute(items[0], items.slice(1), {
        dist: (a, b) => M[a.i * K + b.i],
        maxMillis: 3000,
      });
      order = res.order.map((w) => w.p);
    } else {
      order = LeonidaRoute.planRoute(start, targets).order;
    }
    lastRoute = { start, order, ms: Math.round(performance.now() - t0) };
    redrawRoute();
    map.fitBounds(L.latLngBounds([toLatLng(start), ...order.map(toLatLng)]).pad(0.15));
  }

  /** Tracé et longueur d'une étape, par la route si possible. */
  function legPath(from, to) {
    if (roads) {
      const leg = roads.path(roads.fromSnap(roads.snap(from.x, from.y)), from, roads.snap(to.x, to.y), to);
      if (leg) return { coords: leg.coords, length: leg.cost, road: true };
    }
    return { coords: [[from.x, from.y], [to.x, to.y]], length: LeonidaRoute.euclid(from, to), road: false };
  }

  function redrawRoute() {
    routeLayer.clearLayers();
    routeIds = new Set();
    const info = document.getElementById("route-info");
    const clearBtn = document.getElementById("clear-route");
    if (!lastRoute) {
      info.hidden = true;
      clearBtn.hidden = true;
      renderPoints();
      return;
    }
    const { start, order } = lastRoute;
    const remaining = order.filter((p) => !p.found && state.points.includes(p));
    let len = 0;
    let allRoad = true;
    const line = [];
    let prev = start;
    remaining.forEach((p, i) => {
      const leg = legPath(prev, p);
      len += leg.length;
      allRoad = allRoad && leg.road;
      const pts = leg.coords.map(([x, y]) => L.latLng(y, x));
      line.push(...(i ? pts.slice(1) : pts));
      // L'étape suivante en surbrillance, le reste plus discret.
      if (i === 0) L.polyline(pts, { color: "#22c55e", weight: 9, opacity: 0.35 }).addTo(routeLayer);
      prev = p;
    });
    L.polyline(line, { color: "#000", weight: 7, opacity: 0.35 }).addTo(routeLayer);
    L.polyline(line, { color: "#ffd23f", weight: 4, opacity: 0.95 }).addTo(routeLayer);
    remaining.forEach((p, i) => {
      routeIds.add(p.id);
      L.marker(toLatLng(p), {
        icon: L.divIcon({ className: "", html: `<div class="route-num">${i + 1}</div>`, iconSize: [20, 14], iconAnchor: [-6, 20] }),
        interactive: false,
        zIndexOffset: 500,
      }).addTo(routeLayer);
    });
    info.replaceChildren(
      el("div", {}, el("strong", {}, `${remaining.length}`), " points restants"),
      el("div", {}, el("strong", {}, formatDistance(len)), allRoad ? " par la route" : " (en partie à vol d'oiseau)"),
      el("div", { class: "hint" }, remaining.length ? `Prochain : ${remaining[0].name || "Sans nom"} (étape en vert)` : "Itinéraire terminé !"),
      el("div", { class: "hint" }, `Calculé en ${lastRoute.ms} ms.`),
    );
    info.hidden = false;
    clearBtn.hidden = false;
    renderPoints();
  }

  const formatDistance = (m) => (m >= 1000 ? (m / 1000).toFixed(1).replace(".", ",") + " km" : Math.round(m) + " m");

  document.getElementById("route").addEventListener("click", computeRoute);
  document.getElementById("clear-route").addEventListener("click", () => { lastRoute = null; redrawRoute(); });

  // ---------------------------------------------------------------------------
  // Export / import JSON
  // ---------------------------------------------------------------------------
  document.getElementById("export").addEventListener("click", () => {
    const data = { app: "leonida-tracker", version: 1, exported: new Date().toISOString(), categories: state.categories, points: state.points, roadEdits: state.roadEdits };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = el("a", { href: URL.createObjectURL(blob), download: `leonida-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  const importFile = document.getElementById("import-file");
  document.getElementById("import").addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", async () => {
    const file = importFile.files[0];
    importFile.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.points) || !Array.isArray(data.categories)) throw new Error("format");
      const mode = await ask(
        `Fichier : ${data.points.length} points, ${data.categories.length} catégories.\n\n` +
        "Fusionner avec tes données actuelles, ou les remplacer ?",
        { ok: "Fusionner", choices: [{ label: "Remplacer", value: "replace" }] },
      );
      if (!mode) return;
      if (mode === "replace") {
        state.categories = data.categories;
        state.points = data.points;
        state.roadEdits = Array.isArray(data.roadEdits) ? data.roadEdits : [];
      } else {
        const catIds = new Set(state.categories.map((c) => c.id));
        for (const c of data.categories) if (!catIds.has(c.id)) state.categories.push(c);
        const ptIds = new Set(state.points.map((p) => p.id));
        for (const p of data.points) if (!ptIds.has(p.id)) state.points.push(p);
        if (Array.isArray(data.roadEdits)) state.roadEdits.push(...data.roadEdits);
      }
      migrateCategories(state);
      save();
      rebuildRoads();
      lastRoute = null;
      redrawRoute();
      toast("Import terminé.");
    } catch (e) {
      toast("Fichier invalide.");
    }
  });

  // ---------------------------------------------------------------------------
  // Divers
  // ---------------------------------------------------------------------------
  let toastTimer = null;
  function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2500);
  }

  function setSidebar(visible) {
    document.body.classList.toggle("sidebar-hidden", !visible);
    document.getElementById("show-sidebar").hidden = visible;
    setTimeout(() => map.invalidateSize(), 0);
  }
  document.getElementById("toggle-sidebar").addEventListener("click", () => setSidebar(false));
  document.getElementById("show-sidebar").addEventListener("click", () => setSidebar(true));

  // Démarrage
  drawStart();
  renderPoints();
  const linked = new URLSearchParams(location.search).get("point");
  if (linked) {
    const p = state.points.find((q) => q.id === linked);
    if (p) focusPoint(p);
    else toast("Point introuvable dans ce navigateur.");
  }

  // ---------------------------------------------------------------------------
  // Synchronisation entre appareils (sync.js + config.js)
  // ---------------------------------------------------------------------------
  const Sync = window.LeonidaSync;
  const syncText = document.getElementById("sync-text");
  const syncDot = document.getElementById("sync-dot");
  const syncActions = document.getElementById("sync-actions");
  const syncHint = document.getElementById("sync-hint");
  let syncDetail = "";

  /** Remplace la partie partagée de l'état par celle reçue d'un autre appareil. */
  function applyRemote(doc) {
    const roadsChanged = JSON.stringify(doc.roadEdits || []) !== JSON.stringify(state.roadEdits || []);
    state.points = doc.points || [];
    if (Array.isArray(doc.categories) && doc.categories.length) state.categories = doc.categories;
    state.roadEdits = doc.roadEdits || [];
    state.roadEditsAt = doc.roadEditsAt || 0;
    state.deleted = doc.deleted || {};
    migrateCategories(state);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignoré */ }
    if (lastRoute) {
      const byId = new Map(state.points.map((p) => [p.id, p]));
      lastRoute.order = lastRoute.order.map((p) => byId.get(p.id)).filter(Boolean);
    }
    if (roadsChanged) rebuildRoads();
    if (lastRoute) redrawRoute();
    else renderPoints();
  }

  const SYNC_LABELS = {
    unconfigured: ["Synchronisation non configurée", "off"],
    off: ["Désactivée sur cet appareil", "off"],
    loading: ["Récupération…", "busy"],
    saving: ["Enregistrement…", "busy"],
    ok: ["Synchronisé", "ok"],
    offline: ["Hors ligne : envoi dès le retour du réseau", "warn"],
    error: ["Erreur de synchronisation, nouvel essai bientôt", "err"],
  };

  function renderSync() {
    const st = Sync ? Sync.status : "unconfigured";
    const [label, tone] = SYNC_LABELS[st] || [st, "off"];
    syncText.textContent = label;
    syncDot.className = "sync-dot " + tone;
    syncText.title = syncDetail;
    syncActions.replaceChildren();
    if (st === "unconfigured") {
      syncHint.textContent = "Les points restent dans ce navigateur. Renseigne app/config.js pour activer la sauvegarde en ligne.";
      return;
    }
    if (!Sync.code) {
      syncHint.textContent = "Active la synchro sur un premier appareil, puis ouvre le lien obtenu sur les autres (ton cell, par exemple).";
      syncActions.append(
        el("button", { class: "btn primary", onclick: async () => {
          if (!(await ask("Créer un nouveau code de synchro et y envoyer les points de cet appareil ?", { ok: "Activer" }))) return;
          Sync.setCode(Sync.newCode()).then(renderSync);
          renderSync();
        } }, "Activer"),
        el("button", { class: "btn", onclick: async () => {
          const code = await ask("Colle ton code de synchro (ex. ABCDE-FGHJK-LMNPQ-RSTUV) :", { input: "", ok: "Relier" });
          if (!code) return;
          if (Sync.normalizeCode(code).replace(/-/g, "").length < 20) { toast("Code invalide."); return; }
          Sync.setCode(code).then(() => { toast("Appareil relié à ta sauvegarde."); renderSync(); });
          renderSync();
        } }, "J'ai un code"),
      );
      return;
    }
    syncHint.textContent = "Ton code de synchro donne accès à tes points : ne le partage pas.";
    // Depuis localhost, le lien pointe vers le site publié (le seul joignable depuis le cell).
    const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    const base = local && window.LEONIDA_CONFIG?.publicUrl ? window.LEONIDA_CONFIG.publicUrl : location.origin + location.pathname;
    const link = base + "#sync=" + Sync.code;
    syncActions.append(
      el("button", { class: "btn", onclick: () => showPairing(link) }, "Lien pour un autre appareil"),
      el("button", { class: "btn", onclick: () => showText("Ton code de synchro :", Sync.code) }, "Voir le code"),
      el("button", { class: "link-btn", onclick: async () => {
        if (!(await ask("Arrêter la synchro sur cet appareil ? Tes points restent ici et en ligne.", { ok: "Désactiver" }))) return;
        Sync.disable();
        renderSync();
      } }, "Désactiver ici"),
    );
  }

  let qrLib = null;
  const loadQr = () => (qrLib ||= new Promise((ok, fail) => {
    const sc = el("script", { src: "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js" });
    sc.onload = () => ok(window.QRCode);
    sc.onerror = () => { qrLib = null; fail(); };
    document.head.append(sc);
  }));

  /** Code QR + lien à copier, pour relier un autre appareil (ton cell). */
  async function showPairing(link) {
    const box = el("div", { class: "qr" });
    try {
      const QR = await loadQr();
      new QR(box, { text: link, width: 220, height: 220, correctLevel: QR.CorrectLevel.M });
    } catch (e) { box.remove(); }
    navigator.clipboard?.writeText(link).catch(() => {});
    ask("Scanne ce code avec ton cell (ou ouvre le lien, déjà copié) pour le relier à ta sauvegarde. Ne le partage pas : il donne accès à tes points.",
      { input: link, ok: "Fermer", cancel: null, extra: box });
  }

  if (Sync) {
    Sync.init({
      getState: () => state,
      applyRemote,
      onStatus: (s, detail) => { syncDetail = detail || ""; renderSync(); },
      onLinked: () => toast("Appareil relié à ta sauvegarde en ligne."),
    });
  }
  renderSync();

  // Accès pour le débogage dans la console.
  window.leonida = { map, state, CRS, get roads() { return roads; } };
})();

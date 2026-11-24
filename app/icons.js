/*
 * Icônes de Leonida Tracker : pictogrammes Material Symbols (Google, Apache 2.0)
 * et Font Awesome Free (CC BY 4.0, entrées « fa:… »),
 * style « rounded » plein, posés sur une pastille de la couleur de leur groupe.
 * Variante « trouvé » : pastille grise + coche verte.
 *
 * Les tracés viennent de data/material-icons.js (généré par tools/build_icons.py,
 * sources dans vendor/material-symbols/). Ce fichier doit être chargé avant celui-ci.
 *
 * Par icône : ms = nom Material Symbols, badge = lettre(s) ou « ★ » en pastille secondaire,
 * text = initiales seules (quand aucun pictogramme ne convient).
 */
(function (global) {
  "use strict";

  const GROUPS = [
    { id: "poi", name: "Points d'intérêt", color: "#2563eb" },
    { id: "robbery", name: "Braquages", color: "#dc2626" },
    { id: "vehicles", name: "Véhicules", color: "#d97706" },
    { id: "style", name: "Style", color: "#db2777" },
    { id: "food", name: "Boire et manger", color: "#ea580c" },
    { id: "waink", name: "Lieux WAiNK", color: "#9333ea" },
    { id: "explore", name: "Exploration", color: "#0d9488" },
    { id: "cards", name: "Cartes à collectionner", color: "#ca8a04" },
    { id: "sports", name: "Sports", color: "#65a30d" },
    { id: "activities", name: "Activités", color: "#0891b2" },
    { id: "stunts", name: "Cascades", color: "#4f46e5" },
    { id: "racing", name: "Courses", color: "#15803d" },
    { id: "illegal", name: "Opérations illégales", color: "#374151" },
    { id: "wildlife", name: "Faune", color: "#4d7c0f" },
  ];

  const I = [
    // Points d'intérêt
    ["atm", "poi", "ATM", "Guichet automatique", { ms: "fa:money-check-dollar" }],
    ["gym", "poi", "Gym", "Salle de sport", { ms: "fitness_center" }],
    ["club", "poi", "Club", "Boîte de nuit", { ms: "nightlife" }],
    ["ammunation", "poi", "Ammu-Nation", "Armurerie", { ms: "fa:gun" }],

    // Braquages
    ["bank", "robbery", "Bank", "Banque", { ms: "account_balance" }],
    ["big_bank", "robbery", "Big Bank", "Grande banque", { ms: "apartment" }],
    ["payday_loans", "robbery", "Payday Loans", "Prêteur sur salaire", { ms: "payments" }],
    ["jewelry_low", "robbery", "Low-End Jewelry Store", "Bijouterie bas de gamme", { ms: "watch" }],
    ["jewelry_high", "robbery", "High-End Jewelry Store", "Bijouterie haut de gamme", { ms: "diamond" }],
    ["pawn_shop", "robbery", "Pawn Shop", "Prêteur sur gages", { ms: "sell" }],
    ["atm_towable", "robbery", "ATM (Towable)", "Guichet à arracher", { ms: "atm" }],
    ["convenience_store", "robbery", "Convenience Store", "Dépanneur", { ms: "local_convenience_store" }],
    ["fast_food", "robbery", "Fast Food", "Restauration rapide", { ms: "fastfood" }],
    ["liquor_store", "robbery", "Liquor Store", "Magasin d'alcool", { ms: "liquor" }],
    ["contact", "robbery", "Contact", "Contact (contrats)", { ms: "call" }],
    ["safe", "robbery", "Safe", "Coffre-fort", { ms: "fa:vault" }],

    // Véhicules
    ["pay_n_spray", "vehicles", "Pay 'N' Spray", "Peinture (perte de l'avis de recherche)", { ms: "fa:spray-can-sparkles" }],
    ["mod_shop", "vehicles", "Mod Shop", "Garage de personnalisation", { ms: "car_repair" }],
    ["gas_station", "vehicles", "Gas Station", "Station-service", { ms: "local_gas_station" }],
    ["car_wash", "vehicles", "Car Wash", "Lave-auto", { ms: "local_car_wash" }],
    ["electric_charger", "vehicles", "Electric Charger", "Borne de recharge", { ms: "bolt" }],
    ["bus_stop", "vehicles", "Bus Stop", "Arrêt d'autobus", { ms: "directions_bus" }],
    ["train_station", "vehicles", "Train Station", "Gare", { ms: "train" }],
    ["ferry_terminal", "vehicles", "Ferry Terminal", "Terminal de traversier", { ms: "directions_boat" }],
    ["rental_vehicle", "vehicles", "Rental Vehicle", "Location de véhicule", { ms: "car_rental" }],
    ["purchasable_garage", "vehicles", "Purchasable Garage", "Garage à acheter", { ms: "garage_home" }],
    ["garage", "vehicles", "Garage", "Garage", { ms: "garage_door" }],
    ["standout_vehicle", "vehicles", "Standout Vehicle", "Véhicule rare", { ms: "directions_car", badge: "★" }],
    ["randy_vehicle", "vehicles", "Randy Vehicle", "Véhicule pour Randy", { ms: "directions_car", badge: "R" }],
    ["moses_vehicle", "vehicles", "Moses Vehicle", "Véhicule pour Moses", { ms: "directions_car", badge: "M" }],

    // Style
    ["casual_street", "style", "Casual & Street", "Vêtements décontractés", { ms: "apparel" }],
    ["sportswear", "style", "Sportswear", "Vêtements de sport", { ms: "directions_run" }],
    ["formal", "style", "Formal", "Tenues habillées", { ms: "styler" }],
    ["souvenir_swimwear", "style", "Souvenir & Swimwear", "Souvenirs et maillots", { ms: "beach_access" }],
    ["thrift", "style", "Thrift", "Friperie", { ms: "checkroom" }],
    ["footwear", "style", "Footwear", "Chaussures", { ms: "steps" }],
    ["hair_beauty", "style", "Hair & Beauty", "Coiffure et beauté", { ms: "content_cut" }],
    ["tattoos", "style", "Tattoos", "Tatouages", { ms: "fa:pen-nib" }],
    ["electronics", "style", "Electronics", "Électronique", { ms: "devices" }],

    // Boire et manger
    ["cafes_takeout", "food", "Cafes & Takeout", "Cafés et plats à emporter", { ms: "local_cafe" }],
    ["bar", "food", "Bar", "Bar", { ms: "local_bar" }],
    ["street_food", "food", "Street Food", "Cuisine de rue", { ms: "lunch_dining" }],

    // Lieux WAiNK
    ["landmark", "waink", "Landmark", "Lieu emblématique à photographier", { ms: "photo_camera" }],
    ["curiosity", "waink", "Curiosity", "Curiosité", { ms: "explore" }],
    ["sculpture", "waink", "Sculpture", "Sculpture", { ms: "fa:chess-queen" }],

    // Exploration
    ["book_swap", "explore", "Book Swap", "Boîte d'échange de livres", { ms: "menu_book" }],
    ["magazine", "explore", "Magazine", "Magazine", { ms: "fa:newspaper" }],
    ["unique_playlist", "explore", "Unique Playlist", "Liste de musique unique", { ms: "queue_music" }],
    ["mural_1010", "explore", "1010 Mural", "Murale 1010", { ms: "palette" }],

    // Cartes à collectionner
    ["card_jack_of_hearts", "cards", "Jack of Hearts", "Carte : série Jack of Hearts", { ms: "style", badge: "J" }],
    ["card_delights", "cards", "Delights", "Carte : série Delights", { ms: "style", badge: "D" }],
    ["card_nine1nine", "cards", "Nine1Nine", "Carte : série Nine1Nine", { ms: "style", badge: "9" }],

    // Sports
    ["basketball_hoop", "sports", "Basketball Hoop", "Panier de basketball", { ms: "sports_basketball" }],
    ["golf_course", "sports", "Golf Course", "Terrain de golf", { ms: "golf_course" }],
    ["minigolf_course", "sports", "Mini-Golf Course", "Mini-golf", { ms: "flag" }],
    ["pool_table", "sports", "Pool Table", "Table de billard", { ms: "counter_8" }],

    // Activités
    ["shooting_range", "activities", "Shooting Range", "Champ de tir", { ms: "target" }],
    ["arcade_machine", "activities", "Arcade Machine", "Borne d'arcade", { ms: "joystick" }],
    ["fishing_hotspot", "activities", "Fishing Hotspot", "Bon coin de pêche", { ms: "phishing" }],

    // Cascades
    ["stunt_jump", "stunts", "Stunt Jump", "Saut en véhicule", { ms: "airline_stops" }],
    ["base_jump", "stunts", "Base Jump", "Saut en parachute", { ms: "paragliding" }],
    ["knife_flight", "stunts", "Knife Flight", "Vol sur la tranche", { ms: "flight" }],
    ["under_the_bridge", "stunts", "Under the Bridge", "Passer sous un pont", { ms: "airlines" }],

    // Courses
    ["racing_intro", "racing", "Racing Introduction", "Initiation aux courses", { ms: "sports_score" }],
    ["racing_challenge", "racing", "Racing Challenge", "Défi de course", { ms: "trophy" }],
    ["thrillbilly_mud_club", "racing", "Thrillbilly Mud Club", "Courses dans la boue", { ms: "agriculture" }],
    ["animal_crackers", "racing", "Animal Crackers", "Série de courses Animal Crackers", { ms: "fa:kiwi-bird" }],
    ["hit_n_run_vc", "racing", "Hit 'n' Run VC", "Série Hit 'n' Run", { ms: "car_crash" }],
    ["hamlet_boone_speedway", "racing", "Hamlet Boone Speedway", "Circuit Hamlet Boone", { ms: "speed", badge: "HB" }],
    ["ambrosia_raceway", "racing", "Ambrosia Raceway", "Circuit Ambrosia", { ms: "speed", badge: "A" }],
    ["gellhorn_raceway", "racing", "Gellhorn Raceway", "Circuit Gellhorn", { ms: "speed", badge: "G" }],
    ["top_fun_drones", "racing", "Top Fun Drones", "Courses de drones", { ms: "drone" }],

    // Opérations illégales : pas de pictogramme propre à chaque groupe, on affiche ses initiales.
    ["op_kingfishers", "illegal", "Kingfishers", "Opérations : Kingfishers", { text: "KF" }],
    ["op_kolt", "illegal", "Kolt & Associates", "Opérations : Kolt & Associates", { text: "K&A" }],
    ["op_m7", "illegal", "M7", "Opérations : M7", { text: "M7" }],
    ["op_polilla_negra", "illegal", "La Polilla Negra", "Opérations : La Polilla Negra", { text: "LPN" }],
    ["op_final_chapter", "illegal", "Final Chapter", "Opérations : Final Chapter", { text: "FC" }],
    ["op_san4san", "illegal", "San4San", "Opérations : San4San", { text: "S4S" }],
    ["op_ptt_youngins", "illegal", "PTT Youngin$", "Opérations : PTT Youngin$", { text: "PTT" }],
    ["op_guardia_brothers", "illegal", "The Guardia Brothers", "Opérations : The Guardia Brothers", { text: "GB" }],
    ["criminals", "illegal", "Criminals", "Criminels", { ms: "fa:user-secret" }],

    // Faune
    ["wildlife", "wildlife", "Wildlife", "Animal sauvage", { ms: "fa:frog" }],
    ["wildlife_unique", "wildlife", "Unique animal", "Animal unique (rare)", { ms: "fa:dragon" }],
    ["fish", "wildlife", "Fish", "Poisson", { ms: "fa:fish" }],
    ["bird", "wildlife", "Bird", "Oiseau", { ms: "fa:dove" }],
    ["domestic", "wildlife", "Domestic animal", "Animal domestique", { ms: "fa:dog" }],
  ];


  // Propositions de remplacement pour les icônes refusées (à choisir dans la galerie).
  const ALTS = {};
  // "nom" ou "nom:badge" (le nom peut lui-même commencer par « fa: »).
  const parseAlt = (s) => {
    const parts = s.split(":");
    const fa = parts[0] === "fa";
    const name = fa ? "fa:" + parts[1] : parts[0];
    const badge = parts[fa ? 2 : 1];
    return badge ? { ms: name, badge } : { ms: name };
  };

  const ICONS = I.map(([id, group, name, fr, art], i) => ({
    id, group, name, fr, art, n: i + 1, alts: (ALTS[id] || []).map(parseAlt),
  }));
  const byId = Object.fromEntries(ICONS.map((ic) => [ic.id, ic]));
  const groupById = Object.fromEntries(GROUPS.map((g) => [g.id, g]));

  const FOUND_COLOR = "#6b7280";
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

  /** Pictogramme seul, dans un carré de 24 unités placé en (x, y). */
  function glyph(ic, x = 8, y = 8, size = 24) {
    const a = ic.art;
    if (a.ms) {
      const v = (global.MATERIAL_ICONS || {})[a.ms];
      if (!v) return "";
      // Material : tracé seul (grille 960) ; autres librairies : [viewBox, tracé], centré un peu plus petit.
      const [vb, d] = Array.isArray(v) ? v : ["0 -960 960 960", v];
      const k = Array.isArray(v) ? 0.85 : 1;
      const s = size * k, o = (size - s) / 2;
      return `<svg x="${x + o}" y="${y + o}" width="${s}" height="${s}" viewBox="${vb}"><path fill="#fff" d="${d}"/></svg>`;
    }
    const t = esc(a.text || "?");
    const fs = t.length >= 3 ? 10.5 : 13;
    return `<text x="20" y="20.5" font-size="${fs}" text-anchor="middle" dominant-baseline="central" ` +
      `font-family="Arial Black, Arial, sans-serif" font-weight="900" fill="#fff">${t}</text>`;
  }

  /** Icône complète : pastille + pictogramme (+ coche si trouvé). Retourne une chaîne SVG (viewBox 40×40). */
  function svg(id, opts = {}) {
    let ic = byId[id];
    if (!ic) return "";
    if (opts.art) ic = { ...ic, art: opts.art };
    const size = opts.size || 30;
    const groupColor = opts.color || groupById[ic.group].color;
    const color = opts.found ? FOUND_COLOR : groupColor;
    const badge = ic.art.badge
      ? `<circle cx="31.5" cy="31.5" r="7.5" fill="#fff"/>` +
        `<text x="31.5" y="32" font-size="${ic.art.badge.length > 1 ? 7 : 9.5}" text-anchor="middle" dominant-baseline="central" ` +
        `font-family="Arial Black, Arial, sans-serif" font-weight="900" fill="${color}">${esc(ic.art.badge)}</text>`
      : "";
    const check = opts.found
      ? '<circle cx="31" cy="9" r="7" fill="#22c55e" stroke="#fff" stroke-width="2"/>' +
        '<path d="M27.8 9.2l2.2 2.2 4-4.2" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'
      : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="${size}" height="${size}" role="img" aria-label="${esc(ic.fr)}">` +
      `<circle cx="20" cy="21" r="17" fill="#000" opacity=".3"/>` +
      `<circle cx="20" cy="20" r="17" fill="${color}" stroke="#fff" stroke-width="2.5"/>` +
      glyph(ic) + badge + check + `</svg>`;
  }

  global.LeonidaIcons = { GROUPS, ICONS, byId, groupById, svg, glyph };
})(typeof window !== "undefined" ? window : globalThis);

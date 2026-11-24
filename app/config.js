/*
 * Configuration de la synchronisation (Firebase / Firestore).
 * La clé d'API web de Firebase est faite pour être publique : ce sont les règles
 * (firebase/firestore.rules) qui protègent les données, et il faut ton code de synchro
 * pour retrouver ta sauvegarde.
 * Laisse vide pour désactiver la synchronisation.
 */
window.LEONIDA_CONFIG = {
  firebaseProjectId: "leonida-81c6f",
  firebaseApiKey: "AIzaSyBusq5dloxdanFiTsomnUQK2xH0P-uH860",
  // Adresse du site publié, utilisée pour le lien « autre appareil » depuis localhost.
  publicUrl: "https://drumlife.github.io/leonida/app/",
};

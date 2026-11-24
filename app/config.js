/*
 * Configuration de la synchronisation (Supabase).
 * La clé « publishable » (ou « anon ») est faite pour être publique : elle ne donne accès
 * qu'aux deux fonctions leonida_load / leonida_save, qui exigent ton code de synchro.
 * Laisse vide pour désactiver la synchronisation.
 */
window.LEONIDA_CONFIG = {
  supabaseUrl: "",
  supabaseKey: "",
};

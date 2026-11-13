/* CUPISSA | Estadísticas de visitantes de la tienda pública (no administración). */
(() => {
  'use strict';
  // Un identificador anónimo por navegador; no utiliza datos personales del cliente.
  const STORAGE_KEY = 'cupissa_shop_visitor_id_v1';
  const UPDATE_MS = 25000;
  function getVisitorId() {
    try {
      let id = localStorage.getItem(STORAGE_KEY);
      if (!id || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(id)) {
        id = crypto.randomUUID();
        localStorage.setItem(STORAGE_KEY, id);
      }
      return id;
    } catch (_) {
      // Sin almacenamiento: este identificador dura solo mientras siga abierta la página.
      return window.__cupissaShopVisitorId ||= crypto.randomUUID();
    }
  }
  let busy = false;
  async function heartbeat() {
    if (document.visibilityState !== 'visible' || busy || typeof supabaseClient === 'undefined' || !supabaseClient) return;
    busy = true;
    try {
      const { error } = await supabaseClient.rpc('cupissa_registrar_visitante', { p_visitante: getVisitorId() });
      if (error) console.warn('[CUPISSA vistas] Ejecuta el SQL de estadísticas para habilitar el registro:', error.message);
    } catch (error) {
      console.warn('[CUPISSA vistas] No se pudo registrar la visita:', error);
    } finally { busy = false; }
  }
  heartbeat();
  const timer = setInterval(heartbeat, UPDATE_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) heartbeat(); });
  window.addEventListener('pageshow', heartbeat);
  window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
})();

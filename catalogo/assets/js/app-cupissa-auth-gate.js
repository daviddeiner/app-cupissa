/* CUPISSA App: sesión obligatoria, verificada con Supabase Auth. */
(() => {
  'use strict';
  document.body.classList.add('app-session-pending');
  const gate = document.getElementById('app-auth-gate');
  const frame = document.getElementById('app-auth-frame');
  const loading = document.getElementById('app-auth-loading');
  const retry = document.getElementById('app-auth-retry');
  let currentCheck = 0;
  let loginLoaded = false;
  let catalogStarted = false;

  function lock(message) {
    document.body.classList.remove('app-session-pending');
    document.body.classList.add('app-session-locked');
    gate.hidden = false;
    loading.textContent = message || '';
    loading.hidden = !message;
    retry.hidden = true;
    if (!loginLoaded) {
      frame.src = '/perfil/?embedded=1&mode=login';
      loginLoaded = true;
    }
    frame.style.display = 'block';
  }
  function unlock() {
    document.body.classList.remove('app-session-pending', 'app-session-locked');
    gate.hidden = true;
    frame.style.display = 'none';
    loading.hidden = true;
    if (!catalogStarted) {
      catalogStarted = true;
      window.CUPISSA_APP_AUTH_READY = true;
      window.dispatchEvent(new Event('cupissa:authenticated'));
    }
  }
  async function verify() {
    const check = ++currentCheck;
    try {
      const result = await Promise.race([
        window.CUPISSAAuth.getLinkedAccount(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Tiempo de espera agotado')), 14000))
      ]);
      if (check !== currentCheck) return;
      // Una sesión de Supabase no basta: la cuenta debe estar registrada
      // completamente y vinculada a un cliente CUPISSA.
      if (!result?.user || !result?.client?.id) lock();
      else unlock();
    } catch (_) {
      if (check !== currentCheck) return;
      lock('No se pudo comprobar tu conexión. Intenta nuevamente.');
      frame.style.display = 'none';
      retry.hidden = false;
    }
  }
  retry.addEventListener('click', () => { retry.hidden = true; verify(); });
  window.addEventListener('message', event => {
    if (event.origin === location.origin && event.data?.type === 'CUPISSA_PROFILE_AUTH_CHANGED') verify();
  });
  supabaseClient.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') {
      ++currentCheck;
      loginLoaded = false;
      frame.src = 'about:blank';
      lock();
    }
    else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') setTimeout(verify, 50);
  });
  window.addEventListener('pageshow', verify);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) verify(); });
  verify();
})();

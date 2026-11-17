/* CUPISSA APP | Invitación inicial a activar avisos; sin interruptor permanente. */
(() => {
  'use strict';
  const supported = 'serviceWorker' in navigator &&
    'PushManager' in window && 'Notification' in window;
  const INTRO_KEY = 'cupissa_push_intro_20261117';
  const SESSION_KEY = 'cupissa_push_intro_shown_this_visit';
  let working = false;

  const invoke = async payload => {
    const {data, error} = await supabaseClient.functions.invoke('cupissa-push', {body:payload});
    if (error || !data?.ok) throw new Error(data?.error || error?.message || 'No se pudieron configurar los avisos.');
    return data;
  };
  const decodeKey = value => {
    const base64 = String(value).replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(base64 + '='.repeat((4 - base64.length % 4) % 4));
    return Uint8Array.from(decoded, char => char.charCodeAt(0));
  };

  async function subscribeCurrentAccount() {
    if (!supported || Notification.permission !== 'granted' || working) return;
    working = true;
    try {
      const registration = await navigator.serviceWorker.ready;
      const {vapidPublicKey} = await invoke({action:'config'});
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly:true,
          applicationServerKey:decodeKey(vapidPublicKey)
        });
      }
      await invoke({action:'subscribe', subscription:subscription.toJSON()});
      localStorage.setItem(INTRO_KEY, 'activadas');
    } catch (error) {
      console.warn('[CUPISSA PUSH] No se pudo registrar la suscripción:', error);
    } finally {
      working = false;
    }
  }

  function showPermissionWelcome() {
    if (!supported || document.getElementById('cupissa-push-welcome')) return;
    if (sessionStorage.getItem(SESSION_KEY) === '1') return;
    sessionStorage.setItem(SESSION_KEY, '1');

    const overlay = document.createElement('div');
    overlay.id = 'cupissa-push-welcome';
    overlay.className = 'fixed inset-0 z-[999990] flex items-center justify-center px-5 py-8 bg-slate-950/60';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'cupissa-push-welcome-title');
    overlay.innerHTML = `
      <div class="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl text-center border border-pink-100">
        <div class="mx-auto w-16 h-16 rounded-2xl bg-pink-50 flex items-center justify-center text-pink-600 mb-4">
          <i class="fa-regular fa-bell text-2xl" aria-hidden="true"></i>
        </div>
        <p class="text-[10px] uppercase tracking-[.2em] font-extrabold text-pink-600 mb-2">CUPISSA</p>
        <h2 id="cupissa-push-welcome-title" class="text-xl font-extrabold text-slate-900">Recibe novedades de tus pedidos</h2>
        <p id="cupissa-push-description" class="text-sm text-slate-500 leading-relaxed mt-3 mb-5">
          Activa las notificaciones para conocer cambios de estado y noticias de CUPISSA.
        </p>
        <button id="cupissa-push-allow" type="button" class="w-full rounded-xl bg-pink-600 py-3.5 text-white font-extrabold text-sm">Permitir notificaciones</button>
        <button id="cupissa-push-later" type="button" class="w-full mt-2 py-3 text-slate-500 font-bold text-xs">Ahora no</button>
      </div>`;
    document.body.appendChild(overlay);
    const message = overlay.querySelector('#cupissa-push-description');
    const allow = overlay.querySelector('#cupissa-push-allow');
    const later = overlay.querySelector('#cupissa-push-later');
    const close = () => { overlay.remove(); };
    later.addEventListener('click', close);
    if (Notification.permission === 'denied') {
      message.textContent = 'Las notificaciones están bloqueadas. Puedes habilitarlas desde los ajustes de notificaciones de tu celular o navegador.';
      allow.hidden = true;
      later.textContent = 'Entendido';
      localStorage.setItem(INTRO_KEY, 'bloqueadas');
      return;
    }
    allow.addEventListener('click', async () => {
      allow.disabled = true;
      allow.textContent = 'Configurando notificaciones…';
      try {
        // Los navegadores exigen un toque voluntario para mostrar el permiso del sistema.
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          await subscribeCurrentAccount();
          localStorage.setItem(INTRO_KEY, 'activadas');
          close();
        } else {
          if (permission === 'denied') localStorage.setItem(INTRO_KEY, 'bloqueadas');
          message.textContent = permission === 'denied'
            ? 'Puedes habilitarlas más adelante desde los ajustes de tu celular.'
            : 'Podrás activar los avisos cuando vuelvas a entrar.';
          allow.hidden = true;
          later.textContent = 'Entendido';
        }
      } catch (error) {
        console.warn('[CUPISSA PUSH]', error);
        message.textContent = 'No pudimos configurar los avisos ahora. Podrás intentarlo en tu próxima visita.';
        allow.hidden = true;
        later.textContent = 'Entendido';
      } finally {
        allow.disabled = false;
      }
    });
  }

  function onAuthenticated() {
    const url = new URL(location.href);
    if (url.searchParams.get('seccion') === 'perfil') {
      url.searchParams.delete('seccion');
      history.replaceState(history.state, '', url.pathname + url.search + url.hash);
      setTimeout(() => window.openProfileModal?.(), 300);
    }
    if (!supported) return;
    if (Notification.permission === 'granted') {
      subscribeCurrentAccount();
      return;
    }
    if (Notification.permission === 'denied' &&
        localStorage.getItem(INTRO_KEY) === 'bloqueadas') return;
    // Esta versión no existía en instalaciones anteriores: todos la verán
    // al siguiente ingreso, incluso si llevan tiempo usando la app.
    setTimeout(showPermissionWelcome, 650);
  }

  supabaseClient.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT' && supported) {
      navigator.serviceWorker.ready.then(async registration => {
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) return;
        try { await invoke({action:'unsubscribe', endpoint:subscription.endpoint}); }
        catch (_) { /* Puede haber cerrado sesión: cancelar local igualmente. */ }
        await subscription.unsubscribe();
      }).catch(error => console.warn('[CUPISSA PUSH]', error));
    }
    if (event === 'SIGNED_IN' && window.CUPISSA_APP_AUTH_READY) {
      if (Notification.permission === 'granted') subscribeCurrentAccount();
    }
  });
  window.addEventListener('cupissa:authenticated', onAuthenticated, {once:true});
  if (window.CUPISSA_APP_AUTH_READY) onAuthenticated();
})();

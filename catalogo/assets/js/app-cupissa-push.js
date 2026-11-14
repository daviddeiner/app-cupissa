/* CUPISSA APP | Permiso voluntario y suscripción Web Push por cuenta. */
(() => {
  'use strict';
  const button = document.getElementById('cupissa-enable-push');
  if (!button) return;
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const status = message => { button.textContent = message; };
  const invoke = async payload => {
    const {data,error} = await supabaseClient.functions.invoke('cupissa-push',{body:payload});
    if (error || !data?.ok) throw new Error(data?.error || error?.message || 'No se pudo configurar el aviso.');
    return data;
  };
  const decodeKey = value => {
    const base64 = String(value).replace(/-/g,'+').replace(/_/g,'/');
    const raw = atob(base64 + '='.repeat((4-base64.length%4)%4));
    return Uint8Array.from(raw,character=>character.charCodeAt(0));
  };
  async function updateButton() {
    if (!supported) {status('Avisos no compatibles');button.disabled=true;return;}
    if (Notification.permission==='denied') {status('Avisos bloqueados en el celular');button.disabled=true;return;}
    const registration=await navigator.serviceWorker.ready;
    const active=await registration.pushManager.getSubscription();
    status(active ? 'Desactivar notificaciones' : 'Activar notificaciones');
    button.dataset.active=active?'true':'false';
  }
  button.addEventListener('click', async () => {
    button.disabled=true;
    status('Configurando avisos…');
    try {
      if (!supported) throw new Error('Este dispositivo no admite notificaciones push.');
      if (button.dataset.active==='true') {
        const registration=await navigator.serviceWorker.ready;
        const active=await registration.pushManager.getSubscription();
        if (active) {
          await invoke({action:'unsubscribe',endpoint:active.endpoint});
          await active.unsubscribe();
        }
        button.dataset.active='false';
        status('Activar notificaciones');
        return;
      }
      if (Notification.permission!=='granted') {
        const choice=await Notification.requestPermission();
        if (choice!=='granted') throw new Error('Debes permitir las notificaciones en tu celular.');
      }
      const registration=await navigator.serviceWorker.ready;
      const {vapidPublicKey}=await invoke({action:'config'});
      let subscription=await registration.pushManager.getSubscription();
      if (!subscription) subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decodeKey(vapidPublicKey)});
      await invoke({action:'subscribe',subscription:subscription.toJSON()});
      status('Desactivar notificaciones');
      button.dataset.active='true';
    } catch(error) {
      console.warn('[CUPISSA PUSH]',error);
      status(String(error.message || 'No se pudieron activar los avisos'));
    } finally {button.disabled=false;}
  });
  supabaseClient.auth.onAuthStateChange(event => {
    if (event==='SIGNED_OUT' && supported) {
      navigator.serviceWorker.ready.then(async registration => {
        const current=await registration.pushManager.getSubscription();
        if(current) await current.unsubscribe();
        button.dataset.active='false';
        status('Activar notificaciones');
      }).catch(()=>{});
    }
  });
  function onReady() {
    button.hidden=false;
    updateButton().catch(()=>{});
    const url=new URL(location.href);
    if(url.searchParams.get('seccion')==='perfil') {
      url.searchParams.delete('seccion');
      history.replaceState(history.state,'',url.pathname+url.search+url.hash);
      setTimeout(()=>window.openProfileModal?.(),300);
    }
  }
  window.addEventListener('cupissa:authenticated',onReady,{once:true});
  if(window.CUPISSA_APP_AUTH_READY) onReady();
})();

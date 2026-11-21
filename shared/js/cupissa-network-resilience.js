/* Aviso discreto, sin bloquear navegación ni invalidar datos en conexión débil. */
(()=>{'use strict';const init=()=>{
 const n=document.createElement('div');n.id='cupissa-network-status';n.setAttribute('role','status');n.setAttribute('aria-live','polite');n.hidden=true;
 document.body.append(n);let timer=0;
 const update=()=>{
  const offline=!navigator.onLine;
  const slow=navigator.connection&&(/(^|-)2g$/.test(navigator.connection.effectiveType||'')||navigator.connection.saveData);
  if(!offline&&!slow){n.hidden=true;return;}
  n.textContent=offline?'Sin conexión. Conservamos la información cargada; los cambios se actualizarán al volver internet.':'La conexión está lenta. Las imágenes y productos pueden tardar un poco en aparecer.';
  n.hidden=false;
 };
 window.addEventListener('online',()=>{update();});window.addEventListener('offline',update);
 navigator.connection?.addEventListener?.('change',update);
 update();clearTimeout(timer);
 };if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
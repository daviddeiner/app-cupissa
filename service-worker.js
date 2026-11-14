/* CUPISSA | PWA ONLINE. Sin caché offline de páginas, pedidos, productos ni credenciales. */
const ONLINE_VERSION='cupissa-online-20261114-push-image-v2';
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key => /^(cupissa-shell-|cupissa-data-|cupissa-media-)/.test(key)).map(key=>caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener('message',event=>{if(event.data?.type==='CUPISSA_SKIP_WAITING')self.skipWaiting();});
// No interceptamos fetch: la web utiliza la red y Supabase directamente.

self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { payload = {body:event.data?.text() || ''}; }
  const title = 'Cupissa';
  const url = String(payload.url || 'https://app.cupissa.com/catalogo/');
  event.waitUntil(self.registration.showNotification(title, {
    body:[payload.title,payload.body].filter(Boolean).join(' — ') || 'Tienes una novedad en CUPISSA.',
    icon:String(payload.icon || '/catalogo/assets/images/favicon.png'),
    image:payload.imageUrl ? String(payload.imageUrl) : undefined,
    badge:'/catalogo/assets/images/favicon.png',
    tag:String(payload.tag || 'cupissa-novedad'),
    data:{url},
    vibrate:[90,50,90],
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/catalogo/',self.location.origin).toString();
  event.waitUntil((async () => {
    const windows = await clients.matchAll({type:'window',includeUncontrolled:true});
    const ownWindow = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (ownWindow && new URL(url).origin === self.location.origin) { await ownWindow.navigate(url); return ownWindow.focus(); }
    return clients.openWindow(url);
  })());
});

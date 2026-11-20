/* CUPISSA | Perfil editorial, pedidos, mensajes, reseñas e historial. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const db = () => typeof supabaseClient !== 'undefined' ? supabaseClient : window.supabaseClient;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cop = v => '$' + Math.round(Number(v)||0).toLocaleString('es-CO');
  const date = v => v ? new Date(v.length === 10 ? v+'T12:00:00' : v).toLocaleDateString('es-CO', {day:'numeric',month:'short',year:'numeric'}) : 'Por confirmar';
  const label = s => ({'EN PRODUCCIÓN':'En fabricación','EN FABRICACIÓN':'En fabricación','LISTO PARA ENVIAR':'En departamento de despacho','EN DEPARTAMENTO DE DESPACHO':'En departamento de despacho','EN RUTA':'En camino','EN CAMINO':'En camino','AGENDADO':'Agendado','PENDIENTE':'Agendado','ENTREGADO':'Entregado','CANCELADO':'Cancelado'})[String(s||'').trim().toUpperCase()] || s;
  const state = s => ({'EN PRODUCCIÓN':'fabricacion','EN FABRICACIÓN':'fabricacion','LISTO PARA ENVIAR':'despacho','EN DEPARTAMENTO DE DESPACHO':'despacho','EN RUTA':'camino','EN CAMINO':'camino','AGENDADO':'agendado','PENDIENTE':'agendado','ENTREGADO':'entregado','CANCELADO':'cancelado'})[String(s||'').trim().toUpperCase()] || 'todos';
  const itemId = p => String(p?.productId || p?.producto_id || p?.product_id || p?.id || '');
  const photo = p => String(p?.foto || p?.imagen_url || p?.image_url || p?.imagen || p?.fotos?.[0] || p?.imagenes?.[0] || '');
  const catalogUrl = id => '/catalogo/?cupissa_product=' + encodeURIComponent(id);
  let profile, account, current = 'inicio', activeFilter = 'todos', refreshInterval, eventChannel, proofIds = new Set();
  let orders = [], navigationHistory = [];
  const isApp = Boolean(window.CUPISSA_IS_APP);

  const homeMarkup = () => `
    <section class="cupissa-profile-home" id="cupissa-profile-home">
      <nav class="cupissa-profile-links" aria-label="Mi cuenta">
        <button data-cupissa-page="pedidos"><i class="fa-solid fa-box"></i>Tus pedidos<i class="fa-solid fa-chevron-right"></i></button>
        <button data-cupissa-page="mensajes"><i class="fa-regular fa-bell"></i>Notificaciones <span id="cupissa-message-badge"></span><i class="fa-solid fa-chevron-right"></i></button>
        <button data-cupissa-page="resenas"><i class="fa-regular fa-star"></i>Reseñas<i class="fa-solid fa-chevron-right"></i></button>
      </nav>
      <nav class="cupissa-profile-shortcuts" aria-label="Más opciones de cuenta">
        <button data-cupissa-page="historial"><i class="fa-regular fa-clock"></i>Historial</button>
        ${isApp ? '<button data-cupissa-page="juega"><i class="fa-solid fa-gift"></i>Juega y gana</button>' : ''}
        <button data-cupissa-page="direccion"><i class="fa-solid fa-location-dot"></i>Dirección</button>
      </nav>
      <section class="cupissa-profile-recommendations">
        <h2>Descubre más en Cupissa</h2>
        <p>Productos que pueden gustarte</p>
        <div id="cupissa-profile-product-grid" class="cupissa-profile-products"></div>
      </section>
    </section>`;
  const panelMarkup = () => `
    <section id="cupissa-profile-page" class="cupissa-profile-page" hidden>
      <header class="cupissa-page-heading"><button class="cupissa-back" data-cupissa-back type="button" aria-label="Regresar al paso anterior"><i class="fa-solid fa-arrow-left"></i><span>Regresar</span></button><h2 id="cupissa-page-title"></h2></header>
      <div id="cupissa-page-body"></div>
      <section class="cupissa-profile-recommendations"><h3>Más productos Cupissa</h3><div id="cupissa-profile-page-products" class="cupissa-profile-products"></div></section>
    </section>`;

  function init() {
    const root = $('profile-account-section');
    if (!root || $('cupissa-profile-home')) return;
    const header = root.firstElementChild;
    if (header) {
      header.classList.add('cupissa-account-header');
      const logout = header.querySelector('button[onclick="logoutProfile()"]');
      if (logout) {
        logout.setAttribute('onclick',"cupissaProfileSection('config')");
        logout.className = 'cupissa-settings-gear';
        logout.innerHTML = '<i class="fa-solid fa-gear" aria-hidden="true"></i><span class="sr-only">Configuración</span>';
        logout.setAttribute('aria-label','Configuración');
      }
      $('profile-heading-phone')?.classList.add('hidden');
    }
    const info = $('profile-data-view')?.closest('section');
    if (info) { info.id='cupissa-profile-data-panel'; info.hidden=true; }
    $('tus-pedidos').hidden = true;
    header.insertAdjacentHTML('afterend',homeMarkup()+panelMarkup());
    root.addEventListener('click', event => {
      if (event.target.closest('[data-cupissa-back]')) {event.preventDefault();goBack();return;}
      const button = event.target.closest('[data-cupissa-page]');
      if (button) { event.preventDefault(); go(button.dataset.cupissaPage); }
    });
    const tabs = document.createElement('nav');
    tabs.id = 'cupissa-order-filters';
    tabs.className = 'cupissa-order-tabs';
    tabs.setAttribute('aria-label','Filtrar pedidos');
    ['Todos','Agendado','En fabricación','En departamento de despacho','En camino','Entregado','Cancelado']
      .forEach((name,i) => {
        const key=['todos','agendado','fabricacion','despacho','camino','entregado','cancelado'][i];
        const btn=document.createElement('button');
        btn.type='button'; btn.dataset.orderFilter=key; btn.textContent=name;
        btn.addEventListener('click',()=>{ activeFilter=key; paintOrders(); });
        tabs.appendChild(btn);
      });
    $('profile-orders-list')?.before(tabs);
    $('tus-pedidos')?.insertAdjacentHTML('afterbegin',
      '<button type="button" class="cupissa-info-back" data-cupissa-back><i class="fa-solid fa-arrow-left"></i> Regresar</button>');
    $('profile-orders-list')?.insertAdjacentHTML('afterend',
      '<section class="cupissa-profile-recommendations"><h3>También te puede gustar</h3><div id="cupissa-profile-order-products" class="cupissa-profile-products"></div></section>');
  }
  function goBack() {
    go(navigationHistory.pop() || 'inicio',true);
  }
  function go(section,back=false) {
    if (section==='juega') {
      if (isApp) window.parent.postMessage({type:'CUPISSA_OPEN_JUEGA'},location.origin);
      return;
    }
    if (!back && section!==current) navigationHistory.push(current);
    current=section;
    const home=$('cupissa-profile-home'), page=$('cupissa-profile-page');
    const info=$('cupissa-profile-data-panel'), pedido=$('tus-pedidos');
    home.hidden=section!=='inicio';
    pedido.hidden=section!=='pedidos';
    info.hidden=!['datos','direccion'].includes(section);
    page.hidden=['inicio','pedidos','datos','direccion'].includes(section);
    if (section==='datos' || section==='direccion') {
      window.toggleProfileEdit?.(section==='direccion');
      let back=info.querySelector('.cupissa-info-back');
      if (!back) {
        back=document.createElement('button');
        back.className='cupissa-info-back'; back.type='button';
        back.innerHTML='<i class="fa-solid fa-arrow-left"></i> Regresar';
        back.addEventListener('click',goBack);
        info.prepend(back);
      }
    }
    if (section==='pedidos') paintOrders();
    else if (section==='mensajes') renderMessages();
    else if (section==='resenas') renderPendingReviews();
    else if (section==='historial') renderHistory();
    else if (section==='config') renderSettings();
    else if (section==='metodos') renderPaymentMethods();
    else if (section==='politicas') renderPolicies();
    window.scrollTo({top:0,behavior:'smooth'});
  }
  window.cupissaProfileSection = go;
  function page(title,content) {
    $('cupissa-page-title').textContent=title;
    $('cupissa-page-body').innerHTML=content;
  }
  function settingsRow(icon, title, pageId) {
    return `<button data-cupissa-page="${pageId}" class="cupissa-settings-row"><i class="${icon}"></i>${title}<i class="fa-solid fa-chevron-right"></i></button>`;
  }
  function prettyDialog({title,message,confirmText='Aceptar',info=false}) {
    return new Promise(resolve=>{
      const backdrop=document.createElement('div');
      backdrop.className='cupissa-pretty-backdrop';
      backdrop.innerHTML=`<section class="cupissa-pretty-dialog" role="alertdialog" aria-modal="true" aria-label="Confirmación">
        <div class="cupissa-pretty-icon"><i class="fa-solid fa-heart"></i></div>
        <h3></h3><p></p>
        <div class="cupissa-pretty-actions">
          ${info?'':'<button type="button" class="cupissa-pretty-cancel">Regresar</button>'}
          <button type="button" class="cupissa-pretty-accept"></button>
        </div></section>`;
      backdrop.querySelector('h3').textContent=title;
      backdrop.querySelector('p').textContent=message;
      backdrop.querySelector('.cupissa-pretty-accept').textContent=confirmText;
      const finish=answer=>{
        document.removeEventListener('keydown',onKey);
        backdrop.remove();resolve(answer);
      };
      const onKey=e=>{if(e.key==='Escape'){e.preventDefault();finish(false);}};
      document.addEventListener('keydown',onKey);
      backdrop.querySelector('.cupissa-pretty-accept').onclick=()=>finish(true);
      backdrop.querySelector('.cupissa-pretty-cancel')?.addEventListener('click',()=>finish(false));
      backdrop.addEventListener('click',e=>{if(e.target===backdrop)finish(false);});
      document.body.appendChild(backdrop);
      backdrop.querySelector('.cupissa-pretty-accept').focus();
    });
  }
  function renderSettings() {
    page('Configuración',`
      <div class="cupissa-protection"><i class="fa-solid fa-shield-heart"></i><div><strong>Tu cuenta está protegida</strong><p>Cupissa protege tu información con acceso verificado por correo y mantiene tus datos privados y seguros.</p></div></div>
      <div class="cupissa-settings-list">
        ${settingsRow('fa-regular fa-user','Datos de la cuenta','datos')}
        ${settingsRow('fa-regular fa-credit-card','Métodos de pago','metodos')}
        ${settingsRow('fa-solid fa-scale-balanced','Términos y políticas de Cupissa','politicas')}
        <button id="cupissa-profile-share" class="cupissa-settings-row"><i class="fa-solid fa-share-nodes"></i>Compartir Cupissa<i class="fa-solid fa-chevron-right"></i></button>
        <button id="cupissa-profile-change-account" class="cupissa-settings-row"><i class="fa-solid fa-users"></i>Cambiar de cuenta<i class="fa-solid fa-chevron-right"></i></button>
        <button id="cupissa-profile-logout" class="cupissa-settings-row"><i class="fa-solid fa-right-from-bracket"></i>Cerrar sesión<i class="fa-solid fa-chevron-right"></i></button>
      </div>`);
    $('cupissa-profile-share').onclick=share;
    $('cupissa-profile-change-account').onclick=async()=>{
      if(await prettyDialog({title:'Cambiar de cuenta',message:'Puedes utilizar otra cuenta de Cupissa con su correo y código de acceso. Tus pedidos y favoritos estarán protegidos en cada cuenta.',confirmText:'Cambiar cuenta'})) window.logoutProfile?.();
    };
    $('cupissa-profile-logout').onclick=async()=>{
      if(await prettyDialog({title:'Cerrar sesión',message:'¿Quieres salir de tu cuenta de Cupissa? Podrás iniciar sesión de nuevo cuando quieras.',confirmText:'Cerrar sesión'})) window.logoutProfile?.();
    };
  }
  function renderPaymentMethods() {
    page('Métodos de pago',`<div class="cupissa-static-list cupissa-payment-methods"><p>Los mismos medios de pago disponibles en nuestra página:</p>
      <div><i class="fa-solid fa-mobile-screen"></i>Nequi</div>
      <div><i class="fa-solid fa-credit-card"></i>Wompi</div>
      <div><i class="fa-solid fa-bolt"></i>Addi</div>
      <div><i class="fa-solid fa-shield-halved"></i>Crédito Cupissa</div>
      <div><i class="fa-solid fa-money-bill-wave"></i>Efectivo</div>
      <small>La disponibilidad de cada medio de pago depende de las condiciones de tu pedido.</small></div>`);
  }
  function renderPolicies() {
    page('Términos y políticas',`<div class="cupissa-static-list">
      <a href="/terminos-y-condiciones/" target="_blank" rel="noopener">Términos y condiciones generales</a>
      <a href="/politica-de-datos-personales/" target="_blank" rel="noopener">Política de tratamiento de datos personales</a>
      <a href="/politica-de-compras-y-garantias/" target="_blank" rel="noopener">Compras, pagos, anticipos, envíos y garantías</a>
      <a href="/politica-y-condiciones-de-alquileres/" target="_blank" rel="noopener">Condiciones de alquileres</a>
    </div>`);
  }
  async function share() {
    const url=isApp ? 'https://app.cupissa.com/' : 'https://cupissa.com/';
    const text='¡Descubre Cupissa! Todo lo que puedas imaginar, aquí existe. Visita nuestro catálogo: '+url;
    try {
      if (navigator.share) await navigator.share({title:'Cupissa',text,url});
      else { await navigator.clipboard.writeText(text);prettyDialog({title:'¡Listo para compartir!',message:'Copiamos tu invitación de Cupissa. Ahora puedes pegarla donde quieras.',confirmText:'Entendido',info:true}); }
    } catch(e) { if (e?.name!=='AbortError') prettyDialog({title:'No se pudo compartir',message:'Inténtalo nuevamente o copia el enlace desde tu navegador.',confirmText:'Entendido',info:true}); }
  }
  function orderProducts(o) { return Array.isArray(o.productos) ? o.productos : []; }
  function orderPhotos(o) {
    const images=[...(Array.isArray(o.imagenes)?o.imagenes:[]),...orderProducts(o).flatMap(p=>[photo(p),...(Array.isArray(p.fotos)?p.fotos:[])])];
    return images.map(v=>typeof v==='object'?v?.url||v?.imagen_url:v).filter(Boolean).slice(0,4);
  }
  function remaining(o) {
    const shipping=Number(o.domicilio_valor??o.valor_domicilio??o.costo_domicilio??o.envio??o.domicilio_envio??0)||0;
    const subtotal=Number(o.total||0), advance=Number(o.anticipo||0);
    // El campo restante del pedido suele contener solo los artículos.
    // No sumar domicilio dos veces cuando el total ya lo incluye.
    const base=o.restante!=null?Number(o.restante):Math.max(0,subtotal-advance);
    const includesShipping=Number(o.total_con_domicilio||0)>0 && subtotal>=Number(o.total_con_domicilio);
    return Math.max(0,base+(includesShipping?0:shipping));
  }
  window.cupissaRemainingOrderV2=remaining;
  function paintOrders() {
    if (!$('profile-orders-list')) return;
    document.querySelectorAll('[data-order-filter]').forEach(el=>el.classList.toggle('active',el.dataset.orderFilter===activeFilter));
    const list=orders.filter(o=>activeFilter==='todos'||state(o.estado)===activeFilter);
    $('profile-orders-list').innerHTML=list.length ? list.map(o=>{
      const s=state(o.estado), id=esc(o.id), canCancel=s==='agendado', delivery=s==='entregado';
      return `<article class="cupissa-order-tile">
        <button type="button" class="cupissa-order-title" onclick="openProfileOrder('${id}')"><strong>${esc(o.codigo||o.numero_pedido||'Pedido CUP')}</strong><span class="cupissa-order-pill ${s}">${esc(label(o.estado))}</span><i class="fa-solid fa-chevron-right"></i></button>
        <p class="cupissa-order-delivery"><i class="fa-regular fa-calendar"></i> Entrega: ${esc(date(o.fecha_entrega))}</p>
        <div class="cupissa-order-middle"><div class="cupissa-order-photos">${orderPhotos(o).map(img=>`<img src="${esc(img)}" alt="Producto del pedido" loading="lazy">`).join('')||'<span class="fa-solid fa-bag-shopping"></span>'}</div><div><small>Restante por pagar</small><strong>${cop(remaining(o))}</strong><small>${orderProducts(o).length} artículo(s)</small></div></div>
        <p class="cupissa-cancel-note"><i class="fa-solid fa-circle-info"></i> Ten en cuenta que una vez los artículos se empiecen a fabricar tu pedido no puede ser cancelado.</p>
        <div class="cupissa-order-actions">
          <details class="cupissa-order-more"><summary aria-label="Opciones del pedido">•••</summary><div>${canCancel?`<button data-cancel-order="${id}">Cancelar pedido</button>`:'<span>No se puede cancelar después de agendamiento en fabricación</span>'}</div></details>
          <button type="button" data-reorder="${id}">Comprar de nuevo</button>
          ${delivery && proofIds.has(String(o.id)) ? `<button type="button" data-proof="${id}">Ver foto de entrega</button>` : ''}
          <button type="button" onclick="openProfileOrder('${id}')">Ver pedido</button>
        </div>
      </article>`;
    }).join('') : '<div class="cupissa-empty">No tienes pedidos en este estado.</div>';
  }
  async function cancel(id) {
    const order=orders.find(o=>String(o.id)===String(id));
    if (!order || state(order.estado)!=='agendado') return prettyDialog({title:'Pedido en proceso',message:'Este pedido ya no se puede cancelar desde tu cuenta.',confirmText:'Entendido',info:true});
    if (!(await prettyDialog({title:'¿Cancelar pedido?',message:'El pedido '+(order.codigo||'Cupissa')+' se cancelará. Esta acción no se puede deshacer. Los anticipos se gestionan según las políticas de Cupissa.',confirmText:'Cancelar pedido'}))) return;
    const {error}=await db().rpc('cupissa_cancelar_pedido_cliente',{p_pedido_id:id});
    if(error) return prettyDialog({title:'No se pudo cancelar',message:error.message||'Verifica si ya comenzó la fabricación.',confirmText:'Entendido',info:true});
    order.estado='CANCELADO'; paintOrders(); await fetchMessages();
  }
  function reorder(id) {
    const o=orders.find(o=>String(o.id)===String(id));
    const ids=[...new Set(orderProducts(o).map(itemId).filter(Boolean))];
    if(!ids.length) return prettyDialog({title:'Estamos para ayudarte',message:'No encontramos las referencias para repetir este pedido. Escríbenos y te ayudaremos.',confirmText:'Entendido',info:true});
    sessionStorage.setItem('cupissa_reorder_products',JSON.stringify(ids));
    if(window.parent!==window){
      window.parent.postMessage({type:'CUPISSA_REORDER',ids},location.origin);
      return;
    }
    location.href=catalogUrl(ids[0]);
  }
  async function verifyProofs() {
    try {
      const {data,error}=await db().rpc('cupissa_domicilios_entregas_cliente');
      if(error) throw error;
      const rows=typeof data==='string'?JSON.parse(data):data;
      proofIds=new Set((Array.isArray(rows)?rows:[]).map(row=>String(row.pedido_id)));
    } catch(e) { proofIds=new Set(); }
    paintOrders();
  }
  window.cupissaRenderOrdersV2=async (rows)=>{
    orders=rows||[]; $('profile-orders-count').textContent=orders.length+' pedidos';
    recordObservedOrderStates();
    paintOrders();
    await verifyProofs();
    if(current==='resenas') renderPendingReviews();
    if(current==='mensajes') renderMessages();
    fetchMessages();
  };
  function notificationKey(){return 'cupissa_order_notifications_v3:'+(profile?.id||account?.id||'sin-cuenta');}
  function readNotifications(){
    try{const rows=JSON.parse(localStorage.getItem(notificationKey())||'[]');return Array.isArray(rows)?rows:[];}catch(e){return [];}
  }
  function saveNotifications(rows){
    try{localStorage.setItem(notificationKey(),JSON.stringify(rows));}catch(e){}
  }
  function mergeNotifications(rows){
    const combined=new Map();
    [...readNotifications(),...rows].forEach(r=>{
      const key=r.source_id?('db:'+r.source_id):r.key||('pedido:'+r.pedido_id+':'+r.estado+':'+r.created_at);
      combined.set(key,{...r,key});
    });
    const sorted=[...combined.values()].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
    saveNotifications(sorted);window.__cupissaMessages=sorted;
    if(current==='mensajes')paintMessages();
    return sorted;
  }
  function recordObservedOrderStates(){
    const key=notificationKey()+':estados';
    let prior={};try{prior=JSON.parse(localStorage.getItem(key)||'{}')||{};}catch(e){}
    const additions=[];
    orders.forEach(o=>{
      if(!o?.id||!o.estado)return;
      const id=String(o.id),estado=String(o.estado);
      if(prior[id]!==estado){
        additions.push({pedido_id:id,codigo:o.codigo||o.numero_pedido||('CUP'+id.slice(0,8)),
          estado,created_at:new Date().toISOString(),key:'observado:'+id+':'+estado+':'+Date.now()});
        prior[id]=estado;
      }
    });
    try{localStorage.setItem(key,JSON.stringify(prior));}catch(e){}
    if(additions.length)mergeNotifications(additions);
  }
  async function fetchMessages() {
    if(!orders.length)return mergeNotifications([]);
    const ids=orders.map(o=>o.id).filter(Boolean);
    const {data,error}=await db().from('cupissa_pedido_eventos')
      .select('pedido_id,codigo,estado,created_at,id').in('pedido_id',ids.slice(0,150))
      .order('created_at',{ascending:false}).limit(500);
    if(error) {
      // Si todavía no se instaló la migración, no inventar estados históricos.
      window.__cupissaMessagesError=error.message;
      return mergeNotifications([]);
    }
    window.__cupissaMessagesError='';
    const combined=mergeNotifications((data||[]).map(r=>({...r,source_id:r.id})));
    const badge=$('cupissa-message-badge');
    if(badge) badge.textContent=combined.length ? combined.length+' novedades' : '';
    if(current==='mensajes') paintMessages();
    return combined;
  }
  function renderMessages() {
    page('Notificaciones','<div id="cupissa-profile-events" class="cupissa-event-list"><div class="cupissa-empty">Cargando notificaciones…</div></div>');
    paintMessages();
    fetchMessages();
  }
  function paintMessages() {
    const el=$('cupissa-profile-events'); if(!el) return;
    const messages=window.__cupissaMessages||readNotifications();
    el.innerHTML=messages.length?messages.map(m=>`<button data-open-order="${esc(m.pedido_id)}" class="cupissa-event-item">
      <i class="fa-solid fa-box-open"></i><span><strong>Tu pedido ${esc(m.codigo)} cambió a ${esc(label(m.estado))}</strong><small>${esc(date(m.created_at))}</small></span><i class="fa-solid fa-chevron-right"></i>
    </button>`).join(''):`<div class="cupissa-empty">${window.__cupissaMessagesError?'Aún no pudimos sincronizar todas las notificaciones.':'Aún no hay notificaciones de tus pedidos.'}</div>`;
    if(messages.length)el.lastElementChild?.scrollIntoView?.({block:'nearest'});
  }
  async function renderPendingReviews() {
    page('Reseñas','<div class="cupissa-empty">Cargando productos entregados…</div>');
    const delivered=orders.filter(o=>state(o.estado)==='entregado');
    const items=new Map();
    delivered.forEach(o=>orderProducts(o).forEach(p=>{
      const id=itemId(p); if(id&&!items.has(id)) items.set(id,{id,order:o,product:p});
    }));
    if(!items.size) {page('Reseñas','<div class="cupissa-empty">Aquí aparecerán los productos de tus pedidos entregados para que puedas calificarlos.</div>');return;}
    const {data:written,error}=await db().rpc('cupissa_mis_resenas',
      {p_producto_ids:[...items.keys()].slice(0,100)});
    const owned=new Set((written||[]).map(r=>r.producto_id));
    const list=[...items.values()];
    page('Reseñas',`${error?'<p class="cupissa-inline-alert">Para publicar reseñas, primero ejecuta el SQL incluido.</p>':''}
    <div class="cupissa-review-pending">${list.map(({id,order,product})=>`<article class="cupissa-review-product">
      ${photo(product)?`<img src="${esc(photo(product))}" alt="" loading="lazy">`:''}
      <div><strong>${esc(product.nombre||productoName(product))}</strong><small>Pedido ${esc(order.codigo||'CUP')} · Entregado</small>
      ${owned.has(id)?'<span class="cupissa-review-done"><i class="fa-solid fa-circle-check"></i> Reseña publicada</span>':`<form class="cupissa-review-form" data-review-order="${esc(order.id)}" data-review-product="${esc(id)}">
        <label>Tu calificación <select name="rating" required><option value="5">★★★★★ 5 estrellas</option><option value="4">★★★★☆ 4 estrellas</option><option value="3">★★★☆☆ 3 estrellas</option><option value="2">★★☆☆☆ 2 estrellas</option><option value="1">★☆☆☆☆ 1 estrella</option></select></label>
        <textarea name="comment" required minlength="3" maxlength="400" placeholder="Cuéntanos tu experiencia con este producto"></textarea>
        <button type="submit">Publicar reseña verificada</button>
      </form>`}</div></article>`).join('')}</div>`);
  }
  function productoName(p) {return p.producto||'Producto Cupissa';}
  async function submitReview(form) {
    const button=form.querySelector('button'); button.disabled=true; button.textContent='Publicando…';
    const {error}=await db().rpc('cupissa_publicar_resena',{
      p_pedido_id:form.dataset.reviewOrder,p_producto_id:form.dataset.reviewProduct,
      p_calificacion:Number(form.elements.rating.value),p_comentario:form.elements.comment.value.trim()
    });
    if(error) {button.disabled=false;button.textContent='Publicar reseña verificada';prettyDialog({title:'Revisa tu reseña',message:error.message||'No se pudo publicar tu reseña.',confirmText:'Entendido',info:true});return;}
    await renderPendingReviews();
  }
  async function renderHistory() {
    let history=[];
    try {history=JSON.parse(localStorage.getItem('cupissa_product_history_v2:'+account?.id)||'[]');} catch(e){}
    if(!Array.isArray(history)) history=[];
    page('Historial',history.length?`<div class="cupissa-history-products">${history.slice(0,80).map(p=>`
      <a href="${catalogUrl(p.id)}" class="cupissa-history-item">${p.foto?`<img src="${esc(p.foto)}" alt="">`:''}<span><strong>${esc(p.nombre||'Producto Cupissa')}</strong><small>Ver producto</small></span></a>`).join('')}</div>`:'<div class="cupissa-empty">Los productos que visites desde tu cuenta aparecerán aquí.</div>');
  }
  async function loadProducts() {
    if(!profile) return;
    let history=[];try {history=JSON.parse(localStorage.getItem('cupissa_product_history_v2:'+account?.id)||'[]');}catch(e){}
    if(!Array.isArray(history))history=[];
    const last=history[0];
    const fields='id,nombre,fotos,precio_detal,mundo,categoria,subcategoria,temporada,oculto';
    const queries=[db().from('productos').select(fields).eq('oculto',false).limit(1000)];
    if(last?.subcategoria) queries.push(db().from('productos').select(fields)
      .eq('oculto',false).eq('subcategoria',last.subcategoria).limit(45));
    if(last?.categoria) queries.push(db().from('productos').select(fields)
      .eq('oculto',false).eq('categoria',last.categoria).limit(35));
    const results=await Promise.all(queries);
    const data=[...new Map(results.flatMap(r=>r.data||[]).map(p=>[String(p.id),p])).values()];
    const error=results.every(r=>r.error);
    if(error || !data?.length) return;
    const visited=new Set(history.map(h=>String(h.id)));
    const tags=history.slice(0,20).flatMap(h=>[h.subcategoria,h.categoria,h.mundo].filter(Boolean).map(t=>String(t).toUpperCase()));
    const ranked=data.slice().sort((a,b)=>{
      const weight=p=>[p.subcategoria,p.categoria,p.mundo].reduce((n,t)=>n+(tags.filter(v=>v===String(t||'').toUpperCase()).length*3),0)+(visited.has(String(p.id))?-2:0);
      return weight(b)-weight(a);
    });
    // Conservar la variedad del escaparate; el historial influye solo un poco.
    const similar=ranked.slice(0,4), selected=new Set(similar.map(p=>String(p.id)));
    const varied=data.filter(p=>!selected.has(String(p.id)))
      .sort(()=>Math.random()-.5);
    const mixed=[];let j=0;
    varied.forEach((p,i)=>{mixed.push(p);if(i%4===3&&j<similar.length)mixed.push(similar[j++]);});
    while(j<similar.length)mixed.push(similar[j++]);
    const demo=sessionStorage.getItem('cupissa_owner_preview')!=='0';
    const demoHash=id=>[...String(id)].reduce((a,c)=>(a*31+c.charCodeAt(0))>>>0,17);
    const card=p=>`<a class="cupissa-mini-product" href="${catalogUrl(p.id)}" aria-label="Ver ${esc(p.nombre)}">
      <div class="cupissa-mini-photo"><img src="${esc(p.fotos?.[0]||'')}" alt="${esc(p.nombre)}" loading="lazy"></div>
      <div class="cupissa-mini-details">
        <small class="cupissa-mini-season">${esc(p.temporada||p.categoria||'Cupissa')}</small>
        <strong>${esc(p.nombre)}</strong>
        <span class="cupissa-mini-stars ${demo?'is-rated':''}" aria-label="${demo?'Cinco estrellas en vista de presentación':'Calificación disponible al abrir producto'}">${demo?'★★★★★ · '+(10+demoHash(p.id)%9)+' opiniones':'☆☆☆☆☆'}</span>
        ${demo?`<small class="cupissa-mini-demo-tag">${demoHash(p.id)%2?'Último día':'🔥 Más vendido'}</small>`:''}
        <div class="cupissa-mini-footer"><span>${demo?`<del class="cupissa-mini-old-price">${cop(Math.ceil(Number(p.precio_detal||0)*(1.24+demoHash(p.id)%11/100)/100)*100)}</del>`:'<small>Desde</small>'}${cop(p.precio_detal)}</span><span class="cupissa-mini-cart" aria-hidden="true"><i class="fa-solid fa-cart-shopping"></i></span></div>
      </div></a>`;
    ['cupissa-profile-product-grid','cupissa-profile-page-products','cupissa-profile-order-products'].forEach(id=>{
      const grid=$(id);if(!grid)return;
      let count=0;
      const section=grid.closest('.cupissa-profile-recommendations');
      const existing=section?.querySelector('.cupissa-profile-load-more');
      existing?.remove();grid.innerHTML='';
      const append=()=>{
        const next=mixed.slice(count,count+16);count+=next.length;
        grid.insertAdjacentHTML('beforeend',next.map(card).join(''));
        if(button)button.hidden=count>=mixed.length;
      };
      const button=document.createElement('button');
      button.type='button';button.className='cupissa-profile-load-more';button.textContent='Ver más productos';
      button.addEventListener('click',append);section?.appendChild(button);
      append();
    });
  }
  window.cupissaExperienceProfileUpdated=(currentProfile,currentAccount)=>{
    profile=currentProfile;account=currentAccount;orders=[];proofIds=new Set();navigationHistory=[];
    window.__cupissaMessages=[];window.__cupissaMessagesError='';
    init();go('inicio');loadProducts();
    if(refreshInterval) clearInterval(refreshInterval);
    refreshInterval=setInterval(()=>{
      if(document.visibilityState!=='visible') return;
      if(current==='pedidos'||current==='resenas'||current==='mensajes') window.cupissaReloadOrders?.();
      else fetchMessages();
    },25000);
    if(eventChannel) db().removeChannel(eventChannel);
    if(profile?.id) {
      eventChannel=db().channel('cupissa-pedido-actualizacion-'+profile.id)
        .on('postgres_changes',{event:'INSERT',schema:'public',table:'cupissa_pedido_eventos'},()=>{
          fetchMessages();
          // El listado se actualiza también si la cuenta está mirando pedidos.
          if(current==='pedidos'||current==='resenas'||current==='mensajes') window.cupissaReloadOrders?.();
        }).subscribe();
    }
  };
  document.addEventListener('click', e=>{
    const productLink=e.target.closest('a[href*="cupissa_product="]');
    if(productLink&&window.parent!==window){
      e.preventDefault();
      window.parent.postMessage({
        type:'CUPISSA_OPEN_PRODUCT',
        id:new URL(productLink.href,location.origin).searchParams.get('cupissa_product')
      },location.origin);
      return;
    }
    const cancel=e.target.closest('[data-cancel-order]');
    const again=e.target.closest('[data-reorder]');
    const proof=e.target.closest('[data-proof]');
    const order=e.target.closest('[data-open-order]');
    if(cancel) cancelOrderClicked(cancel);
    else if(again) reorder(again.dataset.reorder);
    else if(proof) window.cupissaVerEntregaCliente?.(proof.dataset.proof);
    else if(order) {go('pedidos');window.openProfileOrder?.(order.dataset.openOrder);}
  });
  function cancelOrderClicked(button) {button.disabled=true;cancel(button.dataset.cancelOrder).finally(()=>{button.disabled=false;});}
  document.addEventListener('submit', e=>{
    if(e.target.matches('.cupissa-review-form')) {e.preventDefault();submitReview(e.target);}
  });
})();

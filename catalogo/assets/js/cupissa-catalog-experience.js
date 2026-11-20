/* CUPISSA | Reseñas reales verificadas, historial, promociones comprobables y carrito flotante. */
(() => {
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  const cash=n=>'$'+Math.round(Number(n)||0).toLocaleString('es-CO');
  const oldPrices=new Map(), ratings=new Map(), requestedRatingIds=new Set();
  let pendingRatingTimer=0;
  const inCatalog=()=>typeof rawProducts!=='undefined'&&Array.isArray(rawProducts);
  const productById=id=>inCatalog()?rawProducts.find(p=>String(p.id)===String(id)):null;
  const isFeatured=p=>{
    const season=typeof featuredSeasonName==='string'?featuredSeasonName:'';
    return season&&[p.temporada,...(Array.isArray(p.temporadas)?p.temporadas:[])].some(t=>String(t||'').trim().toUpperCase()===season.trim().toUpperCase());
  };
  function comparePrice(p) {
    const before=Number(oldPrices.get(String(p?.id))??p?.precio_anterior);
    const current=Number(p?.precio_detal);
    return before>current&&current>0?before:0;
  }
  function stars(score) {
    const round=Math.max(0,Math.min(5,Math.round(Number(score)||0)));
    return '★'.repeat(round)+'☆'.repeat(5-round);
  }
  function decorate(card,p) {
    if(!card||!p) return;
    const price=comparePrice(p);
    const rating=ratings.get(String(p.id));
    const priceBox=card.querySelector('.font-black.text-slate-900.text-xs');
    if(priceBox&&!card.querySelector('.cupissa-special-price')) {
      const node=document.createElement('div');node.className='cupissa-special-price';
      node.innerHTML=price
        ? '<del>'+cash(price)+'</del><span>Descuento especial</span>'
        : '<span>Precio especial Cupissa</span>';
      priceBox.before(node);
    } else if(price&&priceBox) {
      const node=card.querySelector('.cupissa-special-price');
      if(node && !node.querySelector('del'))node.innerHTML='<del>'+cash(price)+'</del><span>Descuento especial</span>';
    }
    let ratingEl=card.querySelector('.cupissa-card-rating');
    if(!ratingEl) {
      const title=card.querySelector('.product-card-title');
      if(title) {
        ratingEl=document.createElement('p');ratingEl.className='cupissa-card-rating';
        title.after(ratingEl);
      }
    }
    if(ratingEl) {
      const html=rating?.count
        ? '<span>'+stars(rating.total/rating.count)+'</span> <small>('+rating.count+' reseñas de clientes)</small>'
        : '<span class="cupissa-unrated-stars">☆☆☆☆☆</span> <small>Sin calificaciones aún</small>';
      if(ratingEl.innerHTML!==html)ratingEl.innerHTML=html;
    }
    if(isFeatured(p)&&!card.querySelector('.cupissa-season-tag')) {
      const tag=document.createElement('span');tag.className='cupissa-season-tag';tag.textContent='Temporada destacada';
      card.querySelector('.relative')?.appendChild(tag);
    }
    if(isFeatured(p)&&Number(window.CUPISSA_PRODUCT_POPULARITY?.[String(p.id)]?.total_compras||0)>0) {
      const count=Number(window.CUPISSA_PRODUCT_POPULARITY?.[String(p.id)]?.total_compras||0);
      const others=(typeof featuredSeasonProducts!=='undefined'?featuredSeasonProducts:[])
        .map(item=>Number(window.CUPISSA_PRODUCT_POPULARITY?.[String(item.id)]?.total_compras||0));
      if(count===Math.max(...others,0)&&!card.querySelector('.cupissa-best-seller')) {
        const el=document.createElement('span');el.className='cupissa-best-seller';el.textContent='Más vendido';
        card.querySelector('.relative')?.appendChild(el);
      }
    }
    // "Último día" solo cuando la campaña tenga una fecha real de fin.
    if(isFeatured(p)&&window.CUPISSA_SEASON_END_DATE&&!card.querySelector('.cupissa-last-day')) {
      const end=String(window.CUPISSA_SEASON_END_DATE).slice(0,10);
      const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'})
        .format(new Date());
      if(end===today){
        const el=document.createElement('span');el.className='cupissa-last-day';el.textContent='Último día';
        card.querySelector('.relative')?.appendChild(el);
      }
    }
  }
  const oldCard=window.catalogProductCard;
  if(typeof oldCard==='function') window.catalogProductCard=function(product,options){
    const card=oldCard.apply(this,arguments);decorate(card,product);return card;
  };
  function decorateVisibleCards(){
    document.querySelectorAll('[data-cupissa-product-id]').forEach(card=>{
      const prod=productById(card.dataset.cupissaProductId);
      if(prod) decorate(card,prod);
    });
    scheduleVerifiedRatings();
  }
  // El catálogo dibuja sus tarjetas dentro de columnas anidadas; sincronizar
  // también después del renderizado real, no únicamente con la carga inicial.
  const previousGridRender=window.renderProductsGrid;
  if(typeof previousGridRender==='function')window.renderProductsGrid=function(){
    const result=previousGridRender.apply(this,arguments);
    queueMicrotask(decorateVisibleCards);
    return result;
  };
  const previousFeaturedRender=window.renderSeasonFeatured;
  if(typeof previousFeaturedRender==='function')window.renderSeasonFeatured=function(){
    const result=previousFeaturedRender.apply(this,arguments);
    queueMicrotask(decorateVisibleCards);
    return result;
  };
  function mixHistoryRecommendations(products) {
    if(!Array.isArray(products)||products.length<12)return products;
    let user;
    try{user=JSON.parse(localStorage.getItem('cupissa_client_session')||'null');}catch(e){}
    if(!user?.id)return products;
    let visits=[];
    try{visits=JSON.parse(localStorage.getItem('cupissa_product_history_v2:'+user.id)||'[]');}catch(e){}
    if(!Array.isArray(visits)||!visits.length)return products;
    const recent=visits.slice(0,18), favoriteIds=new Set(recent.map(p=>String(p.id)));
    const score=p=>recent.reduce((total,seen,i)=>{
      const closeness=1/(1+i*.1);
      const matches=(key,points)=>String(p[key]||'').trim().toUpperCase()
        && String(p[key]||'').trim().toUpperCase()===String(seen[key]||'').trim().toUpperCase()?points:0;
      return total+closeness*(matches('subcategoria',7)+matches('categoria',4)+matches('mundo',1));
    },0);
    const suggested=products.filter(p=>!favoriteIds.has(String(p.id)))
      .map(p=>({product:p,weight:score(p)})).filter(x=>x.weight>=4)
      .sort((a,b)=>b.weight-a.weight).slice(0,Math.min(24,Math.floor(products.length*.15)));
    if(!suggested.length)return products;
    const featured=new Set(suggested.map(x=>String(x.product.id)));
    const remaining=products.filter(p=>!featured.has(String(p.id)));
    const result=[],boosted=suggested.map(x=>x.product);
    let i=0,j=0;
    while(i<remaining.length || j<boosted.length){
      for(let n=0;n<5&&i<remaining.length;n++) result.push(remaining[i++]);
      if(j<boosted.length)result.push(boosted[j++]);
    }
    return result;
  }
  window.cupissaMixHistoryRecommendations=mixHistoryRecommendations;
  function scheduleVerifiedRatings() {
    if(pendingRatingTimer)return;
    pendingRatingTimer=setTimeout(async()=>{
      pendingRatingTimer=0;
      const ids=[...new Set([...document.querySelectorAll('[data-cupissa-product-id]')]
        .map(el=>el.dataset.cupissaProductId).filter(Boolean))]
        .filter(id=>!requestedRatingIds.has(id)).slice(0,90);
      if(!ids.length)return;
      ids.forEach(id=>requestedRatingIds.add(id));
      try {
        const {data,error}=await supabaseClient.rpc('cupissa_resumen_resenas',{p_product_ids:ids});
        if(error) return;
        (data||[]).forEach(r=>ratings.set(String(r.producto_id),
          {count:Number(r.cantidad||0),total:Number(r.promedio||0)*Number(r.cantidad||0)}));
        decorateVisibleCards();
      } catch(e){}
    },500);
  }
  async function loadReferencePrices() {
    try {
      const {data,error}=await supabaseClient.from('productos')
        .select('id,precio_anterior').not('precio_anterior','is',null).limit(1500);
      if(error) return; // Migración SQL aún no aplicada.
      (data||[]).forEach(r=>oldPrices.set(String(r.id),Number(r.precio_anterior)));
      decorateVisibleCards();
    } catch(e){}
  }
  async function loadSeasonEndDate() {
    try {
      const {data,error}=await supabaseClient.from('configuracion_destacados_web')
        .select('fecha_fin_temporada').eq('id',1).maybeSingle();
      if(error || !data?.fecha_fin_temporada)return;
      window.CUPISSA_SEASON_END_DATE=data.fecha_fin_temporada;
      decorateVisibleCards();
    } catch(e){}
  }
  const originalActivity=window.loadCupissaProductPopularity;
  if(typeof originalActivity==='function')window.loadCupissaProductPopularity=async function(){
    const result=await originalActivity.apply(this,arguments);
    decorateVisibleCards();return result;
  };
  function recordVisit(p) {
    let account; try {account=JSON.parse(localStorage.getItem('cupissa_client_session')||'null');}catch(e){}
    if(!account?.id) return;
    const key='cupissa_product_history_v2:'+account.id;
    let history=[];try{history=JSON.parse(localStorage.getItem(key)||'[]');}catch(e){}
    if(!Array.isArray(history))history=[];
    history=history.filter(h=>String(h.id)!==String(p.id));
    history.unshift({id:p.id,nombre:p.nombre,foto:p.fotos?.[0]||'',mundo:p.mundo,categoria:p.categoria,subcategoria:p.subcategoria,when:Date.now()});
    try{localStorage.setItem(key,JSON.stringify(history.slice(0,100)));}catch(e){}
  }
  function ensureFloatingCart(){
    let float=document.getElementById('cupissa-floating-cart');
    if(float)return float;
    float=document.createElement('button');float.type='button';float.id='cupissa-floating-cart';
    float.setAttribute('aria-label','Abrir carrito de compras');
    float.innerHTML='<i class="fa-solid fa-bag-shopping"></i><span>Carrito</span>';
    float.onclick=()=>{
      window.closeOptionsModal?.();window.openCartModal?.();
    };
    document.body.appendChild(float);return float;
  }
  function ensureReviewSection(){
    const inner=document.querySelector('#modal-product-options .product-modal-inner');
    if(!inner)return null;
    let section=document.getElementById('cupissa-product-reviews');
    if(!section){
      section=document.createElement('section');section.id='cupissa-product-reviews';
      section.innerHTML='<div class="cupissa-review-head"><h3>Opiniones de nuestros clientes</h3><span>Compras verificadas</span></div><div id="cupissa-product-review-list" aria-live="polite"></div><button type="button" id="cupissa-show-more-reviews" hidden>Ver más reseñas</button>';
    }
    const similar=document.getElementById('cupissa-related-products');
    const actions=inner.querySelector('.product-modal-actions');
    if(similar&&similar.parentElement===inner)similar.before(section);
    else if(actions?.parentElement===inner)actions.before(section);
    else inner.querySelector('.product-modal-grid')?.after(section);
    return section;
  }
  let reviewToken=0;
  async function renderReviews(p){
    const token=++reviewToken,section=ensureReviewSection();
    if(!section)return;
    const list=section.querySelector('#cupissa-product-review-list'),more=section.querySelector('#cupissa-show-more-reviews');
    list.innerHTML='<p class="cupissa-review-empty">Cargando reseñas verificadas…</p>';more.hidden=true;
    const {data,error}=await supabaseClient.from('cupissa_resenas_verificadas')
      .select('calificacion,comentario,created_at').eq('producto_id',String(p.id))
      .order('calificacion',{ascending:false}).order('created_at',{ascending:false}).limit(1000);
    if(token!==reviewToken)return;
    if(error) {list.innerHTML='<p class="cupissa-review-empty">Las reseñas estarán disponibles cuando se active esta sección.</p>';return;}
    const reviews=data||[];
    if(!reviews.length) {list.innerHTML='<p class="cupissa-review-empty">Este producto todavía no tiene reseñas. Las primeras opiniones llegarán de compras entregadas.</p>';return;}
    const average=reviews.reduce((sum,r)=>sum+Number(r.calificacion||0),0)/reviews.length;
    const summary=document.createElement('p');summary.className='cupissa-review-summary';
    summary.textContent=stars(average)+'  '+average.toFixed(1)+'/5 · '+reviews.length+' opiniones de compradores verificados';
    list.replaceChildren(summary);
    const nodes=reviews.map((r,i)=>{
      const article=document.createElement('article');article.className='cupissa-review-entry';
      if(i>=5)article.hidden=true;
      article.innerHTML='<strong>'+stars(r.calificacion)+'</strong><span>Compra verificada</span><p>'+esc(r.comentario)+'</p>';
      list.appendChild(article);return article;
    });
    if(nodes.length>5){
      more.hidden=false;more.textContent='Ver más reseñas ('+(nodes.length-5)+')';
      more.onclick=()=>{nodes.forEach(node=>node.hidden=false);more.hidden=true;};
    }
  }
  function renderReferenceInModal(p) {
    let el=document.getElementById('cupissa-modal-reference-price');
    if(!el){
      el=document.createElement('div');el.id='cupissa-modal-reference-price';
      document.getElementById('opt-modal-total-price')?.parentElement?.after(el);
    }
    const value=comparePrice(p);
    el.hidden=!value; el.innerHTML=value?'<del>Antes: '+cash(value)+'</del> <strong>Descuento especial aplicado</strong>':'';
  }
  function renderCartReferences(){
    const container=document.getElementById('cart-items-container');
    if(!container||typeof cart==='undefined'||!Array.isArray(cart))return;
    const cards=container.children;
    cart.forEach((line,index)=>{
      const product=productById(line.productId); const previous=comparePrice(product);
      if(!previous||String(line.modalidad).toUpperCase()==='ALQUILER')return;
      const box=cards[index]?.querySelector('.fuchsia-text');
      if(box&&!box.querySelector('.cupissa-special-cart')){
        const note=document.createElement('small');note.className='cupissa-special-cart';
        note.textContent='Descuento especial · Antes desde '+cash(previous)+' por unidad';
        box.appendChild(note);
      }
    });
  }
  const oldRenderCart=window.renderCartItems;
  if(typeof oldRenderCart==='function')window.renderCartItems=function(){
    const result=oldRenderCart.apply(this,arguments);renderCartReferences();return result;
  };
  const oldOpen=window.openOptionsModal;
  if(typeof oldOpen==='function')window.openOptionsModal=function(id){
    const result=oldOpen.apply(this,arguments);
    const product=productById(id);
    if(product){
      recordVisit(product);
      renderReferenceInModal(product);
      renderReviews(product);
      const float=ensureFloatingCart();float.hidden=false;
    }
    return result;
  };
  const oldClose=window.closeOptionsModal;
  if(typeof oldClose==='function')window.closeOptionsModal=function(){
    const float=document.getElementById('cupissa-floating-cart');if(float)float.hidden=true;
    ++reviewToken;
    return oldClose.apply(this,arguments);
  };
  function openById(id) {
    if(!id)return;
    const open=p=>{if(!p)return; window.openOptionsModal?.(p.id);};
    if(productById(id)){setTimeout(()=>open(productById(id)),300);return;}
    // Permite abrir un producto desde historial incluso si no está en el lote actual.
    supabaseClient.from('productos').select('id,nombre,mundo,mundos,categoria,categorias,subcategoria,subcategorias,temporada,temporadas,precio_detal,precio_mayorista,cant_min_mayorista,porcentaje_anticipo,dias_preparacion,pago_contraentrega,produccion_express,personalizable,al_por_mayor,venta,alquiler,credito,precio_alquiler,valor_deposito,tallas,colores,fotos,created_at,descripcion,accesorios,oculto')
      .eq('id',id).eq('oculto',false).maybeSingle().then(({data})=>{
        if(!data)return;
        if(inCatalog()&&!productById(id))rawProducts.push(data);
        setTimeout(()=>open(productById(id)),800);
      });
  }
  function tryOpenDeepLink() {
    openById(new URLSearchParams(location.search).get('cupissa_product'));
  }
  function restoreReorder(){
    let ids=[];try{ids=JSON.parse(sessionStorage.getItem('cupissa_reorder_products')||'[]');}catch(e){}
    if(!Array.isArray(ids)||!ids.length)return;
    sessionStorage.removeItem('cupissa_reorder_products');
    const panel=document.createElement('aside');panel.id='cupissa-reorder-tray';
    panel.innerHTML='<strong>Volver a comprar</strong><p>Selecciona tus productos y confirma tallas, colores y cantidades antes de agregarlos al carrito.</p>';
    ids.forEach(id=>{
      const button=document.createElement('button');button.textContent='Ver producto CUP-'+String(id).slice(-4);
      button.onclick=()=>{
        const match=productById(id);
        if(match)window.openOptionsModal?.(match.id);
        else location.href='/catalogo/?cupissa_product='+encodeURIComponent(id);
      };
      panel.appendChild(button);
    });
    const close=document.createElement('button');close.textContent='Cerrar';close.onclick=()=>panel.remove();
    panel.appendChild(close);document.body.appendChild(panel);
  }
  function observeCatalogCards(){
    ['products-grid','season-featured-grid'].forEach(id=>{
      const grid=document.getElementById(id);if(!grid)return;
      new MutationObserver(mutations=>{
        if(mutations.some(m=>[...m.addedNodes].some(node=>
          node.nodeType===1 && (
            node.matches?.('[data-cupissa-product-id]') ||
            node.querySelector?.('[data-cupissa-product-id]')
          ))))decorateVisibleCards();
      }).observe(grid,{childList:true,subtree:true});
    });
  }
  document.addEventListener('DOMContentLoaded',()=>{
    ensureFloatingCart().hidden=true;
    observeCatalogCards();
    scheduleVerifiedRatings();loadReferencePrices();loadSeasonEndDate();tryOpenDeepLink();restoreReorder();
    window.addEventListener('message',event=>{
      if(event.origin!==location.origin)return;
      if(event.data?.type==='CUPISSA_OPEN_JUEGA'&&window.CUPISSA_IS_APP) {
        window.cupissaOpenTasks?.();
      } else if(event.data?.type==='CUPISSA_OPEN_PRODUCT') {
        window.closeProfileModal?.();openById(event.data.id);
      } else if(event.data?.type==='CUPISSA_REORDER') {
        window.closeProfileModal?.();
        sessionStorage.setItem('cupissa_reorder_products',JSON.stringify(event.data.ids||[]));
        restoreReorder();openById(event.data.ids?.[0]);
      }
    });
  });
})();

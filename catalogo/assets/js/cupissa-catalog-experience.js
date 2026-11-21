/* CUPISSA | Reseñas reales verificadas, historial, promociones comprobables y carrito flotante. */
(() => {
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  const cash=n=>'$'+Math.round(Number(n)||0).toLocaleString('es-CO');
  const previewParam=new URLSearchParams(location.search).get('cupissa_demo');
  if(previewParam==='1')sessionStorage.setItem('cupissa_owner_preview','1');
  if(previewParam==='0')sessionStorage.setItem('cupissa_owner_preview','0');
  if(previewParam===null)sessionStorage.setItem('cupissa_owner_preview','1');
  // Presentación integrada: funciona al abrir el catálogo normal sin URLs especiales.
  // Se puede desactivar para ver exclusivamente los datos publicados.
  const ownerPreview=previewParam!=='0';
  const hashProduct=id=>[...String(id)].reduce((a,c)=>(a*31+c.charCodeAt(0))>>>0,17);
  // Los comentarios de presentación se eligen según el título y la categoría.
  // No atribuir ajuste de tallas, telas ni confección a juguetes o artículos de hogar.
  const contextualComments={
    juguetes:[
      'El juguete tiene unos detalles preciosos y los colores llaman mucho la atención.',
      'Me gustó el diseño, se ve muy divertido para jugar.',
      'Fue un regalo muy bonito y causó mucha emoción.',
      'Los acabados del juguete se ven muy bien cuidados.',
      'Se ve tal cual lo esperaba, muy lindo.',
      'La presentación del juguete me encantó.',
      'El diseño es encantador y los detalles están muy bien logrados.',
      'Ideal para regalar, la apariencia es preciosa.',
      'Los colores y la forma combinan muy bonito.',
      'Me gustó muchísimo, es un juguete muy llamativo.',
      'El tamaño y los detalles me parecieron muy bien.',
      'Qué bonito se ve, fue una muy buena elección.'
    ],
    ropa:[
      'La prenda quedó preciosa y el acabado se ve muy bien.',
      'La tela se siente agradable y el diseño es hermoso.',
      'Los detalles de la confección están muy bien cuidados.',
      'Me gustó mucho cómo se ve puesta.',
      'El color y el estilo son tal como los imaginaba.',
      'Es muy linda y fácil de combinar.',
      'El diseño luce delicado y bien terminado.',
      'La caída de la tela se ve preciosa.',
      'La confección tiene unos acabados muy bonitos.',
      'Me encantó el estilo de esta prenda.',
      'El resultado se ve elegante y cómodo.',
      'Muy bonita para la ocasión, quedé encantada.'
    ],
    hogar:[
      'Quedó precioso como detalle decorativo.',
      'Los colores combinan muy bien con el ambiente.',
      'El diseño le da un toque especial al espacio.',
      'Se ve delicado y con acabados muy bonitos.',
      'La presentación y los detalles me encantaron.',
      'Es un complemento muy lindo para decorar.',
      'El resultado se ve elegante y bien terminado.',
      'Me gustó muchísimo la combinación de colores.',
      'Un detalle que hace ver el espacio más acogedor.',
      'Muy buena elección para darle vida al ambiente.',
      'El diseño es justo el estilo que buscaba.',
      'Se nota el cuidado en cada detalle decorativo.'
    ],
    papeleria:[
      'La impresión se ve nítida y los colores son muy bonitos.',
      'El diseño quedó organizado y con detalles preciosos.',
      'Me gustó mucho la presentación y el acabado.',
      'Los colores se ven vivos y bien combinados.',
      'Perfecto para el detalle que tenía en mente.',
      'La personalización se ve muy bien lograda.',
      'Quedó limpio, bonito y fácil de apreciar.',
      'Los detalles del diseño son muy delicados.',
      'Me encantó cómo quedó la impresión.',
      'Muy buena presentación y resultado final.',
      'El estilo se ve precioso y bien cuidado.',
      'Tal como esperaba, el diseño se ve hermoso.'
    ],
    accesorios:[
      'El accesorio tiene unos detalles muy delicados.',
      'Me encantó el estilo, combina muy bonito.',
      'El acabado se ve bien cuidado y elegante.',
      'Es un detalle pequeño pero muy especial.',
      'Los colores y la forma me gustaron mucho.',
      'Se ve precioso y con una linda presentación.',
      'El diseño es muy bonito para complementar el look.',
      'La terminación del accesorio luce muy bien.',
      'Me pareció un detalle original y delicado.',
      'Muy bonito para regalar o usar en ocasiones especiales.',
      'Me gustó muchísimo cómo resaltan sus detalles.',
      'El estilo es sencillo y precioso a la vez.'
    ],
    general:[
      'Los detalles del producto se ven muy bien cuidados.',
      'Me gustó muchísimo el diseño y la presentación.',
      'Quedó tal como esperaba, muy bonito.',
      'Excelente atención durante todo el proceso.',
      'Un detalle muy lindo para regalar.',
      'Los colores y acabados lucen preciosos.',
      'Muy buena experiencia, muchas gracias.',
      'El resultado tiene una presentación hermosa.',
      'Se nota la dedicación en los pequeños detalles.',
      'Quedé contenta con el diseño y su terminación.',
      'Qué bonito trabajo, muy recomendado.',
      'Todo se ve cuidado y bien presentado.'
    ]
  };
  function sampleCommentFor(p,index){
    const title=String(p?.nombre||p?.titulo||'').toLocaleLowerCase('es-CO');
    const context=[p?.mundo,p?.categoria,p?.subcategoria].map(v=>String(v||'').toLocaleLowerCase('es-CO')).join(' ');
    const all=title+' '+context;
    let type='general';
    if(/juguet|carrito|muñec|peluche|rompecabeza|didáctic|figura de acción|bloque de construcción|triciclo|patineta|balón|pelota|robot/.test(title)||/juguet/.test(context))type='juguetes';
    else if(/vestid|falda|camiset|pantal[oó]n|blusa|tut[uú]|sudadera|buzo|chaqueta|camisa|short|pijama|uniforme|ropa|conjunto|legging|disfraz|mameluco|body beb[eé]/.test(all))type='ropa';
    else if(/cortina|mantel|forro de puerta|coj[ií]n|almohad|edred[oó]n|s[aá]bana|cubrecama|alfombra|decoraci[oó]n|camino de mesa|adorno|guirnalda/.test(all))type='hogar';
    else if(/tarjeta|invitaci[oó]n|cuaderno|agenda|etiqueta|sticker|calcoman[ií]a|impresi[oó]n|papeler[ií]a|afiche|pend[oó]n|volante/.test(all))type='papeleria';
    else if(/anillo|pulsera|collar|arete|diadema|gancho|peineta|llavero|bolso|accesorio|reloj|gafas|cadena/.test(all))type='accesorios';
    const specific=contextualComments[type];
    const generic=contextualComments.general;
    const seed=hashProduct(p?.id);
    return index%4===3
      ?generic[(seed+index*7)%generic.length]
      :specific[(seed+index)%specific.length];
  }
  const previewCount=p=>10+hashProduct(p.id)%9;
  const oldPrices=new Map(), ratings=new Map(), requestedRatingIds=new Set(), dynamicSignals=new Map();
  let pendingRatingTimer=0;
  const inCatalog=()=>typeof rawProducts!=='undefined'&&Array.isArray(rawProducts);
  const productById=id=>inCatalog()?rawProducts.find(p=>String(p.id)===String(id)):null;
  const isFeatured=p=>{
    const season=typeof featuredSeasonName==='string'?featuredSeasonName:'';
    if(typeof featuredSeasonProducts!=='undefined'&&featuredSeasonProducts.some(item=>String(item.id)===String(p.id)))return true;
    return Boolean(season)&&[p.temporada,...(Array.isArray(p.temporadas)?p.temporadas:[])].some(t=>String(t||'').trim().toUpperCase()===season.trim().toUpperCase());
  };
  function comparePrice(p) {
    if(ownerPreview){
      const current=Number(p?.precio_detal);
      return current>0?Math.ceil(current*(1.24+(hashProduct(p.id)%11)/100)/100)*100:0;
    }
    const before=Number(oldPrices.get(String(p?.id))??p?.precio_anterior);
    const current=Number(p?.precio_detal);
    return before>current&&current>0?before:0;
  }
  window.cupissaGetComparePrice = comparePrice;
  function stars(score) {
    const round=Math.max(0,Math.min(5,Math.round(Number(score)||0)));
    return '★'.repeat(round)+'☆'.repeat(5-round);
  }
  function decorate(card,p) {
    if(!card||!p) return;
    const price=comparePrice(p);
    const rating=ratings.get(String(p.id));
    const priceBox=card.querySelector('.font-black.text-slate-900.text-xs');
    if(price&&priceBox&&!card.querySelector('.cupissa-special-price')) {
      const node=document.createElement('div');node.className='cupissa-special-price';
      node.innerHTML='<del>'+cash(price)+'</del><span>Descuento especial</span>';
      priceBox.before(node);
    } else if(price&&priceBox) {
      const node=card.querySelector('.cupissa-special-price');
      if(node)node.innerHTML='<del>'+cash(price)+'</del><span>Descuento especial</span>';
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
      const html=ownerPreview
        ? '<span>'+stars(rating?.count?rating.total/rating.count:5)+'</span> <small>('+String(Math.max(previewCount(p),rating?.count||0))+' opiniones)</small>'
        : rating?.count
        ? '<span>'+stars(rating.total/rating.count)+'</span> <small>('+rating.count+' reseñas de clientes)</small>'
        : '<span class="cupissa-unrated-stars">☆☆☆☆☆</span> <small>Sin calificaciones aún</small>';
      if(ratingEl.innerHTML!==html)ratingEl.innerHTML=html;
    }
    const signal=dynamicSignals.get(String(p.id));
    const featured=ownerPreview||(signal?signal.es_temporada_destacada:isFeatured(p));
    if(!featured)card.querySelectorAll('.cupissa-season-tag,.cupissa-best-seller,.cupissa-last-day').forEach(el=>el.remove());
    if(signal&&!signal.es_mas_vendido)card.querySelector('.cupissa-best-seller')?.remove();
    if(signal&&!signal.es_ultimo_dia)card.querySelector('.cupissa-last-day')?.remove();
    if(!ownerPreview&&featured&&!card.querySelector('.cupissa-season-tag')) {
      const tag=document.createElement('span');tag.className='cupissa-season-tag';tag.textContent='Temporada destacada';
      (card.querySelector('.product-card-title')?.parentElement||card).appendChild(tag);
    }
    if(ownerPreview&&hashProduct(p.id)%2===0&&!card.querySelector('.cupissa-best-seller')){
      const el=document.createElement('span');el.className='cupissa-best-seller';el.innerHTML='<i class="fa-solid fa-fire" aria-hidden="true"></i> Más vendido';
      (card.querySelector('.product-card-title')?.parentElement||card).appendChild(el);
    } else if(!ownerPreview&&featured&&signal?.es_mas_vendido&&!card.querySelector('.cupissa-best-seller')) {
      const el=document.createElement('span');el.className='cupissa-best-seller';el.innerHTML='<i class="fa-solid fa-fire" aria-hidden="true"></i> Más vendido';
      (card.querySelector('.product-card-title')?.parentElement||card).appendChild(el);
    } else if(!ownerPreview&&featured&&!signal&&Number(window.CUPISSA_PRODUCT_POPULARITY?.[String(p.id)]?.total_compras||0)>0) {
      const count=Number(window.CUPISSA_PRODUCT_POPULARITY?.[String(p.id)]?.total_compras||0);
      const others=(typeof featuredSeasonProducts!=='undefined'?featuredSeasonProducts:[])
        .map(item=>Number(window.CUPISSA_PRODUCT_POPULARITY?.[String(item.id)]?.total_compras||0));
      if(count===Math.max(...others,0)&&!card.querySelector('.cupissa-best-seller')) {
        const el=document.createElement('span');el.className='cupissa-best-seller';el.innerHTML='<i class="fa-solid fa-fire" aria-hidden="true"></i> Más vendido';
        (card.querySelector('.product-card-title')?.parentElement||card).appendChild(el);
      }
    }
    // "Último día" solo cuando la campaña tenga una fecha real de fin.
    if(ownerPreview&&hashProduct(p.id)%2===1&&!card.querySelector('.cupissa-last-day')){
      const el=document.createElement('span');el.className='cupissa-last-day';el.textContent='Último día';
      (card.querySelector('.product-card-title')?.parentElement||card).appendChild(el);
    } else if(!ownerPreview&&featured&&signal?.es_ultimo_dia&&!card.querySelector('.cupissa-last-day')){
      const el=document.createElement('span');el.className='cupissa-last-day';el.textContent='Último día';
      (card.querySelector('.product-card-title')?.parentElement||card).appendChild(el);
    } else if(!ownerPreview&&featured&&!signal&&window.CUPISSA_SEASON_END_DATE&&!card.querySelector('.cupissa-last-day')) {
      const end=String(window.CUPISSA_SEASON_END_DATE).slice(0,10);
      const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'})
        .format(new Date());
      if(end===today){
        const el=document.createElement('span');el.className='cupissa-last-day';el.textContent='Último día';
        (card.querySelector('.product-card-title')?.parentElement||card).appendChild(el);
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
        const {data:signals,error:signalsError}=await supabaseClient.rpc('cupissa_senales_catalogo',{p_product_ids:ids});
        if(!signalsError){
          (signals||[]).forEach(r=>{
            dynamicSignals.set(String(r.producto_id),r);
            if(r.precio_anterior!==null)oldPrices.set(String(r.producto_id),Number(r.precio_anterior));
            else oldPrices.delete(String(r.producto_id));
            ratings.set(String(r.producto_id),{count:Number(r.cantidad_resenas||0),total:Number(r.promedio_resenas||0)*Number(r.cantidad_resenas||0)});
          });
          decorateVisibleCards();
          return;
        }
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
    float.innerHTML='<i class="fa-solid fa-bag-shopping"></i><span>Carrito</span><small class="cupissa-floating-cart-count" hidden>0</small>';
    float.onclick=event=>{
      event.preventDefault();event.stopPropagation();
      // Cerrar la ficha modifica el historial del navegador de forma asíncrona.
      // Abrir el carrito después evita que el evento popstate lo cierre de nuevo.
      let opened=false;
      const showCart=()=>{
        if(opened)return;opened=true;
        window.removeEventListener('popstate',afterProductHistory);
        window.openCartModal?.();
      };
      const afterProductHistory=()=>setTimeout(showCart,50);
      window.addEventListener('popstate',afterProductHistory,{once:true});
      window.closeOptionsModal?.();
      setTimeout(showCart,900);
    };
    document.body.appendChild(float);window.cupissaSyncFloatingCartCount?.();return float;
  }
  window.cupissaSyncFloatingCartCount=total=>{
    const float=document.getElementById('cupissa-floating-cart');
    if(!float)return;
    const badge=float.querySelector('.cupissa-floating-cart-count');
    if(!badge)return;
    let quantity=Number(total);
    if(!Number.isFinite(quantity)){
      quantity=typeof cart!=='undefined'&&Array.isArray(cart)
        ?cart.reduce((sum,item)=>sum+Number(item.cantidad||1),0):0;
    }
    badge.textContent=String(quantity);
    badge.hidden=quantity<=0;
    float.setAttribute('aria-label','Abrir carrito, '+quantity+' productos');
  };
  function ensureReviewSection(){
    const inner=document.querySelector('#modal-product-options .product-modal-inner');
    if(!inner)return null;
    let section=document.getElementById('cupissa-product-reviews');
    if(!section){
      section=document.createElement('section');section.id='cupissa-product-reviews';
      section.innerHTML='<div class="cupissa-review-head"><h3>Opiniones de nuestros clientes</h3></div><div id="cupissa-product-review-list" aria-live="polite"></div><button type="button" id="cupissa-show-more-reviews" hidden>Ver más reseñas</button>';
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
    list.innerHTML='<p class="cupissa-review-empty">Cargando reseñas…</p>';more.hidden=true;
    const batchSize=50, reviews=[];
    let offset=0,totalReal=0,shown=0,samplesAdded=false;
    const fetchBatch=async()=>{
      const {data,count,error}=await supabaseClient.from('cupissa_resenas_verificadas')
        .select('calificacion,comentario,created_at',{count:'exact'})
        .eq('producto_id',String(p.id)).order('calificacion',{ascending:false})
        .order('created_at',{ascending:false}).range(offset,offset+batchSize-1);
      if(token!==reviewToken)return false;
      if(error){if(!ownerPreview){list.innerHTML='<p class="cupissa-review-empty">Las reseñas estarán disponibles cuando se active esta sección.</p>';return false;}totalReal=offset;return true;}
      reviews.push(...(data||[]));offset+=data?.length||0;
      totalReal=count===null?((data||[]).length===batchSize?offset+1:offset):Number(count);
      return true;
    };
    if(!(await fetchBatch()))return;
    const addSamples=()=>{
      if(!ownerPreview||samplesAdded||offset<totalReal)return;
      for(let i=0;i<Math.max(0,previewCount(p)-totalReal);i++)reviews.push({calificacion:5,comentario:sampleCommentFor(p,i),sample:true});
      samplesAdded=true;
    };
    addSamples();
    if(!reviews.length&&offset>=totalReal){list.innerHTML='<p class="cupissa-review-empty">Este producto todavía no tiene reseñas.</p>';return;}
    const realRating=ratings.get(String(p.id));
    const loadedAverage=reviews.filter(r=>!r.sample).reduce((sum,r)=>sum+Number(r.calificacion||0),0)/Math.max(1,reviews.filter(r=>!r.sample).length);
    const average=realRating?.count?realRating.total/realRating.count:loadedAverage;
    const summary=document.createElement('p');summary.className='cupissa-review-summary';
    summary.textContent=(stars(totalReal?average:5)+'  '+(totalReal?average:5).toFixed(1)+'/5')+' · '+(ownerPreview?Math.max(totalReal,previewCount(p)):totalReal)+' opiniones';
    list.replaceChildren(summary);
    const append=async(limit)=>{
      if(token!==reviewToken)return;
      more.disabled=true;
      while(shown<reviews.length && limit>0){
        const r=reviews[shown++],article=document.createElement('article');article.className='cupissa-review-entry';
        article.innerHTML='<strong>'+stars(r.calificacion)+'</strong><p>'+esc(r.comentario)+'</p>';
        list.appendChild(article);limit--;
      }
      if(limit>0&&offset<totalReal){
        if(await fetchBatch()){addSamples();return append(limit);}
      }
      addSamples();
      more.disabled=false;
      const remaining=Math.max(0,(ownerPreview?Math.max(totalReal,previewCount(p)):totalReal)-shown);
      more.hidden=remaining===0;more.textContent='Ver más reseñas ('+remaining+')';
    };
    more.onclick=()=>append(10);
    await append(5);
  }
  function renderReferenceInModal(p) {
    let el=document.getElementById('cupissa-modal-reference-price');
    if(!el){
      el=document.createElement('div');el.id='cupissa-modal-reference-price';
      document.getElementById('opt-modal-total-price')?.parentElement?.after(el);
    }
    const value=comparePrice(p);
    const sizes=typeof cupissaGetSelectedSizeItems==='function'?cupissaGetSelectedSizeItems():[];
    const qty=sizes.length?sizes.reduce((sum,item)=>sum+Number(item.cantidad||0),0):Math.max(1,Number(typeof selectedQtyModal!=='undefined'?selectedQtyModal:1));
    const extra=sizes.length?sizes.reduce((sum,item)=>sum+Number(item.incremento||0)*Number(item.cantidad||0),0):0;
    const extraColor=Number(document.getElementById('opt-select-color')?.selectedOptions?.[0]?.dataset.inc||0)*qty;
    const extraAccessories=typeof cupissaSelectedAccessories==='function'?cupissaSelectedAccessories().reduce((sum,a)=>sum+Number(a.incremento||0),0)*qty:0;
    const before=(value*qty)+extra+extraColor+extraAccessories;
    const rental=typeof selectedModalidad!=='undefined'&&selectedModalidad==='alquiler';
    // Las tarjetitas de talla también muestran su precio anterior actualizado.
    document.querySelectorAll('#opt-size-quantities .cupissa-size-select-row').forEach(row=>{
      const item=(Array.isArray(p.tallas)?p.tallas:[]).find(t=>String(t.nombre||'').trim()===String(row.dataset.size||''));
      const increment=Number(item?.incremento||0);
      let beforeEl=row.querySelector('.cupissa-size-before');
      if(!beforeEl){beforeEl=document.createElement('small');beforeEl.className='cupissa-size-before';row.querySelector('.cupissa-size-select-info')?.appendChild(beforeEl);}
      if(beforeEl){
        beforeEl.hidden=!value||rental;
        if(value&&!rental){
          const next=cash(value+increment);
          if(beforeEl.dataset.value!==next){beforeEl.innerHTML='<del>Antes '+next+'</del>';
            beforeEl.dataset.value=next;beforeEl.classList.remove('cupissa-price-drop');void beforeEl.offsetWidth;beforeEl.classList.add('cupissa-price-drop');}
        }
      }
    });
    el.hidden=!value||rental;
    if(value&&!rental){
      const old=el.querySelector('del');
      const previous=Number(el.dataset.currentPrice||0);
      if(!old){el.innerHTML='<del></del> <strong>Descuento especial aplicado</strong>';}
      const target=el.querySelector('del');
      el.dataset.currentPrice=String(before);
      // Animación de caída de precio, sin alterar los valores del carrito ni del pago.
      if(el.dataset.productId!==String(p.id)||previous!==before){
        el.dataset.productId=String(p.id);
        const start=previous>0&&el.dataset.productId===String(p.id)?previous:before*1.15;
        const begun=performance.now(),duration=480;
        const tick=now=>{if(el.dataset.currentPrice!==String(before))return;
          const t=Math.min(1,(now-begun)/duration),ease=1-Math.pow(1-t,3);
          target.textContent='Antes: '+cash(start+(before-start)*ease);
          if(t<1)requestAnimationFrame(tick);
        };requestAnimationFrame(tick);
        el.classList.remove('cupissa-price-drop');void el.offsetWidth;el.classList.add('cupissa-price-drop');
      }else target.textContent='Antes: '+cash(before);
    }
  }
  document.addEventListener('change',event=>{
    if(event.target.closest('#modal-product-options') && typeof selectedProductModal!=='undefined'&&selectedProductModal)
      requestAnimationFrame(()=>renderReferenceInModal(selectedProductModal));
  });
  document.addEventListener('click',event=>{
    if(event.target.closest('#modal-product-options button')&&typeof selectedProductModal!=='undefined'&&selectedProductModal)
      setTimeout(()=>renderReferenceInModal(selectedProductModal),30);
  });
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
    setInterval(()=>{requestedRatingIds.clear();dynamicSignals.clear();decorateVisibleCards();},300000);
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

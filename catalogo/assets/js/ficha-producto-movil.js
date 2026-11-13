/* Solo UI móvil: utiliza las fotos, variantes y precios que ya aporta el catálogo. */
(()=>{'use strict';
const modal=document.getElementById('modal-product-options');if(!modal)return;
if(!window.matchMedia('(max-width:767px)').matches)return;
document.body.classList.add('cupissa-web-product');
const inner=modal.querySelector('.product-modal-inner');
const grid=modal.querySelector('.product-modal-grid');
const actions=modal.querySelector('.product-modal-actions');
const gallery=modal.querySelector('.product-modal-media');
if(actions&&grid&&actions.parentElement!==inner){inner.appendChild(actions)}
const details=modal.querySelector('#product-modal-details');
let detailsButton=modal.querySelector('#cupissa-mobile-view-details');
if(!detailsButton){
  detailsButton=document.createElement('button');
  detailsButton.id='cupissa-mobile-view-details';
  detailsButton.type='button';
  detailsButton.hidden=true;
  detailsButton.innerHTML='<span>Ver detalles</span><i class="fa-solid fa-arrow-down" aria-hidden="true"></i>';
  detailsButton.setAttribute('aria-label','Bajar a la descripción y opciones del producto');
  modal.appendChild(detailsButton);
}
function syncDetailsButton(){
  if(!detailsButton||modal.classList.contains('hidden')||!details)return;
  const innerTop=inner.getBoundingClientRect().top;
  const detailsTop=details.getBoundingClientRect().top-innerTop;
  detailsButton.hidden=detailsTop<=110;
}
detailsButton.addEventListener('click',()=>{
  if(!details||!inner)return;
  const top=details.getBoundingClientRect().top-inner.getBoundingClientRect().top+inner.scrollTop-12;
  inner.scrollTo({top:Math.max(0,top),behavior:'smooth'});
  detailsButton.hidden=true;
});
inner?.addEventListener('scroll',()=>requestAnimationFrame(syncDetailsButton),{passive:true});
let count=gallery?.querySelector('.app-gallery-count');
if(gallery&&!count){count=document.createElement('div');count.className='app-gallery-count';count.setAttribute('aria-live','polite');gallery.appendChild(count)}
let stickyPrice=actions?.querySelector('.app-sticky-price');
if(actions&&!stickyPrice){stickyPrice=document.createElement('div');stickyPrice.className='app-sticky-price';stickyPrice.innerHTML='<small>Total</small><strong aria-live="polite">$ 0</strong>';actions.insertBefore(stickyPrice,actions.lastElementChild)}
const totalPrice=document.getElementById('opt-modal-total-price');
if(totalPrice&&stickyPrice){const sync=()=>{stickyPrice.querySelector('strong').textContent=totalPrice.textContent||'$ 0'};new MutationObserver(sync).observe(totalPrice,{childList:true,subtree:true,characterData:true});sync()}
const thumbs=document.getElementById('opt-modal-thumbs');
const img=document.getElementById('opt-modal-img');
function updateCount(){const len=window.selectedProductModal?.fotos?.length||thumbs?.querySelectorAll('img').length||0;const active=Math.max(0,[...thumbs?.querySelectorAll('img')||[]].findIndex(node=>node.classList.contains('fuchsia-border')));if(count){count.textContent=len>1?`${Math.min(len,active+1)}/${len}`:'';count.hidden=len<2}}
function variantChips(kind){
  if(kind==='size')return; // Mantener solamente el selector original de tallas.
  const wrapper=document.getElementById(kind==='size'?'wrapper-tallas':'wrapper-colores');
  const select=document.getElementById(kind==='size'?'opt-select-talla':'opt-select-color');
  if(!wrapper||!select)return;
  const old=wrapper.querySelector('.app-variant-choices');if(old)old.remove();
  if(wrapper.classList.contains('hidden')||!select.options.length){wrapper.classList.remove('app-has-variant-chips');return}
  const choices=document.createElement('div');choices.className='app-variant-choices';choices.setAttribute('role','group');choices.setAttribute('aria-label',kind==='size'?'Tallas disponibles':'Colores disponibles');
  [...select.options].forEach((option,i)=>{
    if(!option.value)return;
    const button=document.createElement('button');button.type='button';button.className='app-variant-choice'+(kind==='color'?' app-color-choice':'');button.dataset.value=option.value;
    const product=typeof selectedProductModal!=='undefined'?selectedProductModal:null;
    const colors=product?.colores||[];
    const photos=product?.fotos||[];
    const photo=kind==='color'&&(option.dataset.photo||(colors.length===photos.length?photos[i]:''));
    if(photo){const picture=document.createElement('img');picture.src=photo;picture.alt='';picture.loading='lazy';button.appendChild(picture)}
    const label=document.createElement('span');label.textContent=option.textContent.trim();button.appendChild(label);
    button.addEventListener('click',()=>{
      select.value=option.value;
      // La lógica original cambia la foto al seleccionar un color y recalcula el total.
      if(kind==='color'&&typeof window.handleProductColorChange==='function')window.handleProductColorChange();
      else if(typeof window.recalculateProductPrice==='function')window.recalculateProductPrice();
      updateChoices();
    });
    choices.appendChild(button)
  });
  wrapper.appendChild(choices);wrapper.classList.add('app-has-variant-chips');
  function updateChoices(){choices.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.value===select.value)))}
  select.addEventListener('change',updateChoices);
  // Las miniaturas del producto sincronizan el color mediante el select original.
  const observer=new MutationObserver(updateChoices);observer.observe(select,{attributes:true,attributeFilter:['value']});
  choices._update=updateChoices;updateChoices();
}
function syncColorChoice(){const wrap=document.getElementById('wrapper-colores');wrap?.querySelector('.app-variant-choices')?._update?.()}
const oldSelectPhoto=window.cupissaSelectColorForPhoto;
if(typeof oldSelectPhoto==='function')window.cupissaSelectColorForPhoto=function(...args){const result=oldSelectPhoto(...args);syncColorChoice();return result};
const oldColorChange=window.handleProductColorChange;
if(typeof oldColorChange==='function')window.handleProductColorChange=function(...args){const result=oldColorChange(...args);syncColorChoice();updateCount();return result};
const oldOpen=window.openOptionsModal;
if(typeof oldOpen==='function')window.openOptionsModal=function(...args){
  const result=oldOpen(...args);
  document.getElementById('wrapper-tallas')?.querySelector('.app-variant-choices')?.remove();
  document.getElementById('wrapper-tallas')?.classList.remove('app-has-variant-chips');
  // Los colores usan el desplegable compacto existente, no tarjetas grandes.
  const colorWrapper=document.getElementById('wrapper-colores');
  colorWrapper?.querySelector('.app-variant-choices')?.remove();
  colorWrapper?.classList.remove('app-has-variant-chips');
  document.body.classList.add('cupissa-product-open');
  if(inner)inner.scrollTop=0;
  requestAnimationFrame(()=>{updateCount();syncDetailsButton()});
  return result;
};
const oldClose=window.closeOptionsModal;
if(typeof oldClose==='function')window.closeOptionsModal=function(...args){
  const result=oldClose(...args);
  if(detailsButton)detailsButton.hidden=true;
  document.body.classList.remove('cupissa-product-open');return result
};
thumbs?.addEventListener('click',()=>requestAnimationFrame(()=>{updateCount();syncColorChoice()}));
let swipeStart=null;
img?.addEventListener('touchstart',ev=>{swipeStart=ev.changedTouches?.[0]?.clientX??null},{passive:true});
img?.addEventListener('touchend',ev=>{if(swipeStart===null)return;const distance=(ev.changedTouches?.[0]?.clientX??swipeStart)-swipeStart;swipeStart=null;if(Math.abs(distance)<55)return;const items=[...thumbs.querySelectorAll('img')];if(!items.length)return;const current=Math.max(0,items.findIndex(t=>t.classList.contains('fuchsia-border')));const next=Math.max(0,Math.min(items.length-1,current+(distance<0?1:-1)));items[next]?.click();items[next]?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'})},{passive:true});
})();

/* CUPISSA | Selector de calificación accesible con estrellas. */
(()=>{'use strict';
const find=()=>document.querySelectorAll('select');
function enhance(select){
 if(select.dataset.cupissaStarsEnhanced)return;
 const name=[select.id,select.name,select.getAttribute('aria-label'),select.closest('label')?.textContent].join(' ').toLowerCase();
 const options=Array.from(select.options);
 const valid=options.filter(o=>/^[1-5]$/.test(o.value.trim()));
 if(!/calific|rating|estrell|reseñ/.test(name)||valid.length!==5)return;
 select.dataset.cupissaStarsEnhanced='1';
 select.classList.add('cupissa-rating-native');
 const container=document.createElement('div');container.className='cupissa-rating-input';
 container.setAttribute('role','group');container.setAttribute('aria-label','Calificación de 1 a 5 estrellas');
 const buttons=[];
 const paint=value=>buttons.forEach((button,i)=>{button.textContent=i<value?'★':'☆';button.classList.toggle('active',i<value);button.setAttribute('aria-pressed',String(i+1===value));});
 for(let i=1;i<=5;i++){
   const btn=document.createElement('button');btn.type='button';btn.className='cupissa-rating-star';btn.textContent='☆';
   btn.setAttribute('aria-label',i+' de 5 estrellas');
   btn.addEventListener('click',()=>{select.value=String(i);select.dispatchEvent(new Event('change',{bubbles:true}));paint(i);});
   btn.addEventListener('mouseenter',()=>paint(i));btn.addEventListener('focus',()=>paint(i));
   buttons.push(btn);container.appendChild(btn);
 }
 container.addEventListener('mouseleave',()=>paint(Number(select.value)||0));
 container.addEventListener('focusout',e=>{if(!container.contains(e.relatedTarget))paint(Number(select.value)||0)});
 select.addEventListener('change',()=>paint(Number(select.value)||0));
 select.after(container);paint(Number(select.value)||0);
}
const scan=()=>find().forEach(enhance);
document.addEventListener('DOMContentLoaded',()=>{scan();new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});});
})();
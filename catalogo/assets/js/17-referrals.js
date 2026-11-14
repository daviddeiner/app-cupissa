/* CUPISSA · Invitaciones. El servidor decide los conteos y el premio. */
(() => {
  'use strict';
  const el = id => document.getElementById(id);
  let tasksOpen = false;
  let latest = null;
  let previousCount = null;
  let activeUser = null;
  let pollTimer = null;
  const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  function notifyAccepted(name) {
    const box = document.createElement('aside');
    box.className = 'cupissa-invite-toast';
    box.setAttribute('role','status');
    box.innerHTML = `<strong>${safe(name || 'Un amigo')}</strong>Tu amigo ha aceptado la invitación. ¡Sigue así!`;
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 5200);
  }

  async function refresh(showErrors = false) {
    try {
      const {data:session} = await supabaseClient.auth.getSession();
      const userId = session?.session?.user?.id || null;
      if (!userId) {
        activeUser = null;
        latest = null;
        previousCount = null;
        window.cupissaReferralReward = {active:false,expiresAt:null};
        if (showErrors) el('cupissa-tasks-feedback').textContent = 'Inicia sesión para ver tus tareas.';
        return;
      }
      if (activeUser !== userId) { activeUser = userId; previousCount = null; latest = null; window.cupissaReferralReward={active:false,expiresAt:null}; }
      const {data, error} = await supabaseClient.rpc('cupissa_referral_status');
      if (error) throw error;
      if (!data) return;
      latest = data;
      const count = Math.min(20, Number(data.accepted_count || 0));
      el('cupissa-tasks-count').textContent = `${count}/20 amigos invitados`;
      el('cupissa-tasks-percent').textContent = `${count * 5} %`;
      el('cupissa-tasks-progress').setAttribute('aria-valuenow', String(count));
      el('cupissa-tasks-fill').style.width = `${count * 5}%`;
      el('cupissa-tasks-code').textContent = data.code || '—';
      el('cupissa-tasks-accept-form').hidden = !!data.invited_by;
      el('cupissa-tasks-accepted').hidden = !data.invited_by;
      const reward = el('cupissa-tasks-reward');
      if (data.reward_active) {
        const expiry = new Date(data.reward_expires_at).toLocaleString('es-CO',{timeZone:'America/Bogota',dateStyle:'medium',timeStyle:'short'});
        reward.textContent = `¡Completaste tus 20 invitaciones! Tienes 20 % de descuento para una sola compra, válido hasta el ${expiry}. Al usarlo se desactiva inmediatamente.`;
      } else if (count === 20) {
        reward.textContent = 'Ya has completado todas las tareas disponibles. ' + (data.reward_used_at ? 'Tu descuento ya fue utilizado.' : 'La vigencia de tu descuento terminó.');
      } else {
        reward.textContent = 'Al completar 20 amigos recibirás un único 20 % de descuento para tu próxima compra. Tendrás 7 días para usarlo.';
      }
      // La primera consulta solo establece la línea base, nunca crea una alerta ficticia.
      if (previousCount !== null && count > previousCount && data.latest_friend_name) notifyAccepted(data.latest_friend_name);
      previousCount = count;
      window.cupissaReferralReward = { active: !!data.reward_active, expiresAt: data.reward_expires_at || null };
      window.dispatchEvent(new CustomEvent('cupissa:reward-updated', {detail:window.cupissaReferralReward}));
      document.querySelectorAll('.cupissa-reward-price').forEach(node => {
        const regular = Number(node.dataset.original || 0);
        if (!regular) return;
        node.replaceChildren();
        if (data.reward_active) {
          const old = document.createElement('del'); old.className='text-slate-400 text-[10px] mr-1'; old.textContent=window.formatCOP(regular);
          const updated = document.createElement('span'); updated.className='text-pink-600'; updated.textContent=window.formatCOP(Math.round(regular*.8));
          node.append(old,updated);
        } else node.textContent=window.formatCOP(regular);
      });
    } catch (error) {
      if (showErrors) el('cupissa-tasks-feedback').textContent = 'No fue posible consultar las invitaciones. Inténtalo de nuevo.';
      console.warn('[CUPISSA] Estado de invitaciones:',error?.message || error);
    }
  }

  window.cupissaOpenTasks = async () => {
    if (!window.cupissaRequireAccount?.()) return;
    window.closeProfileModal?.();
    window.closeCartModal?.();
    window.closeFavoritesModal?.();
    window.closeMobileFilters?.();
    window.closeOptionsModal?.();
    el('cupissa-tasks-view').hidden = false;
    tasksOpen = true;
    window.setMobileNavSection?.('tasks');
    await refresh(true);
  };
  window.cupissaCloseTasks = () => {
    if (!tasksOpen) return;
    el('cupissa-tasks-view').hidden = true;
    tasksOpen = false;
    window.setMobileNavSection?.('home');
  };
  function inviteText() {
    const code = latest?.code || '';
    return `¡Te invito a conocer CUPISSA! Descarga la app, regístrate y escribe mi código ${code} en la sección Tareas para aceptar mi invitación. Descubre nuestros productos: https://app.cupissa.com/`;
  }
  window.cupissaCopyInvite = async () => {
    const code = latest?.code;
    if (!code) return;
    try { await navigator.clipboard.writeText(code); el('cupissa-tasks-feedback').textContent='Código copiado.'; }
    catch (_) { el('cupissa-tasks-feedback').textContent='Mantén pulsado tu código para copiarlo.'; }
  };
  window.cupissaShareInvite = async () => {
    if (!latest?.code) { await refresh(true); return; }
    const text = inviteText();
    try {
      if (navigator.share) await navigator.share({title:'Invitación CUPISSA',text});
      else { await navigator.clipboard.writeText(text); el('cupissa-tasks-feedback').textContent='Invitación copiada para compartir.'; }
    } catch (error) { if (error?.name !== 'AbortError') el('cupissa-tasks-feedback').textContent='No se pudo compartir. Prueba copiar el código.'; }
  };
  el('cupissa-tasks-accept-form')?.addEventListener('submit',async event => {
    event.preventDefault();
    const field = el('cupissa-tasks-enter-code');
    const code = (field.value || '').trim().toUpperCase();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const {data,error} = await supabaseClient.rpc('cupissa_referral_accept',{p_code:code});
      if (error) throw error;
      el('cupissa-tasks-feedback').textContent = data?.message || 'Invitación aceptada.';
      await refresh();
    } catch (error) { el('cupissa-tasks-feedback').textContent = error?.message || 'No fue posible aceptar el código.'; }
    finally { button.disabled = false; }
  });
  document.querySelectorAll('#mobile-app-nav [data-mobile-section]:not([data-mobile-section="tasks"])').forEach(button => {
    button.addEventListener('click', () => window.cupissaCloseTasks(), {capture:true});
  });
  // Consulta ligera mientras está abierta; evita mostrar avisos atrasados como nuevos.
  document.addEventListener('visibilitychange',() => { if (!document.hidden) void refresh(); });
  pollTimer = setInterval(() => { if (!document.hidden && activeUser) void refresh(); },12000);
  void refresh();
})();

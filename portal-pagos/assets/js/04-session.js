/** CUPISSA | Portal de Pagos.
 * Restaurar la misma sesión Supabase que ya abrió el cliente desde Perfil.
 * No se inicia otra sesión ni se copian/renuevan tokens de un iframe a otro.
 * La información financiera siempre se obtiene desde Supabase con una sesión validada.
 */
let cupissaPortalRestoreRunning = null;
let cupissaPortalRestoreTimeout = null;

function cupissaPortalShowSignInNotice() {
  currentClient = null;
  activeCredits = [];
  document.getElementById('client-dashboard')?.classList.add('hidden');
  const card = document.getElementById('client-login-card');
  if (!card) return;
  const heading = card.querySelector('h2');
  const description = card.querySelector('h2 + p');
  if (heading) heading.textContent = 'Tu información, en un solo lugar';
  if (description) description.innerHTML = 'Inicia sesión desde <strong>Perfil</strong> para consultar aquí tus créditos, cuotas y pagos de forma segura.';
  card.classList.remove('hidden');
}

function cupissaPortalShowLoadError(error) {
  console.warn('[CUPISSA PORTAL] Cuenta autenticada sin datos disponibles:', error);
  const card = document.getElementById('client-login-card');
  if (!card) return;
  document.getElementById('client-dashboard')?.classList.add('hidden');
  const title = card.querySelector('h2');
  const desc = card.querySelector('h2 + p');
  if (title) title.textContent = 'No pudimos cargar tus créditos';
  if (desc) desc.textContent = 'Tu sesión está activa. Comprueba tu conexión y vuelve a abrir el Portal.';
  card.classList.remove('hidden');
}

async function cupissaPortalRestore() {
  if (cupissaPortalRestoreRunning) return cupissaPortalRestoreRunning;
  cupissaPortalRestoreRunning = (async function () {
    // Volver al mecanismo original: Supabase comparte su sesión por origen.
    // getUser confirma en el servidor que el token realmente pertenece al cliente.
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError) throw sessionError;
    const session = sessionData?.session;
    if (!session?.user?.id) {
      cupissaPortalShowSignInNotice();
      return false;
    }
    const { data: userData, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !userData?.user?.id || userData.user.id !== session.user.id) {
      cupissaPortalShowSignInNotice();
      return false;
    }

    let client = null;
    let lastError = null;
    try {
      // Método que utilizaba el Portal antes de cambiar su inicio de sesión.
      const linked = await window.CUPISSAAuth.getLinkedAccount();
      client = linked?.client || null;
    } catch (error) { lastError = error; }

    // Respaldo existente en CUPISSA para la relación entre clientes_web y clientes.
    if (!client && typeof resolveCreditClientByEmail === 'function') {
      try {
        client = await resolveCreditClientByEmail(userData.user.email, userData.user.id);
      } catch (error) { lastError = error; }
    }

    // La sesión de Perfil guarda el cliente vinculado. Nunca confiar solo en
    // localStorage: antes se comprueba Auth y se consulta la ficha de Supabase.
    if (!client) {
      try {
        const saved = JSON.parse(localStorage.getItem('cupissa_client_session') || 'null');
        if (saved?.id && String(saved.correo || '').trim().toLowerCase() === String(userData.user.email || '').trim().toLowerCase()) {
          const result = await supabaseClient.from('clientes').select('*')
            .eq('id', saved.id).ilike('correo', userData.user.email).maybeSingle();
          if (!result.error && result.data) client = result.data;
        }
      } catch (error) { lastError = error; }
    }

    if (!client?.id) {
      cupissaPortalShowLoadError(lastError || new Error('No se encontró el cliente vinculado a esta sesión.'));
      return false;
    }

    // No modificar la lógica de cuotas, deuda total, saldo ni Wompi.
    // Esta es la misma función que utilizaba el Portal original.
    await showClientDashboard(client);
    return true;
  })().catch(error => {
    cupissaPortalShowLoadError(error);
    return false;
  }).finally(() => { cupissaPortalRestoreRunning = null; });
  return cupissaPortalRestoreRunning;
}

function cupissaPortalScheduleRestore() {
  clearTimeout(cupissaPortalRestoreTimeout);
  cupissaPortalRestoreTimeout = setTimeout(cupissaPortalRestore, 120);
}

window.addEventListener('DOMContentLoaded', () => {
  // Programar fuera del callback de auth: evita bloqueos internos de Supabase.
  supabaseClient.auth.onAuthStateChange((event) => {
    if (['INITIAL_SESSION', 'SIGNED_IN', 'SIGNED_OUT', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event)) {
      cupissaPortalScheduleRestore();
    }
  });
  cupissaPortalScheduleRestore();
});
window.addEventListener('pageshow', cupissaPortalScheduleRestore);
window.addEventListener('focus', cupissaPortalScheduleRestore);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) cupissaPortalScheduleRestore();
});
window.addEventListener('storage', event => {
  // Perfil y Portal guardan su sesión de Auth en el mismo origen.
  if (event.key?.includes('auth-token') || event.key === 'cupissa_client_session') {
    cupissaPortalScheduleRestore();
  }
});
window.addEventListener('message', event => {
  if (event.origin === location.origin &&
      ['CUPISSA_PROFILE_AUTH_CHANGED', 'CUPISSA_PORTAL_REFRESH'].includes(event.data?.type)) {
    cupissaPortalScheduleRestore();
  }
});

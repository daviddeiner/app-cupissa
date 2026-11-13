/** CUPISSA | Autenticación compartida por OTP/Google. */
let pendingPortalLoginEmail = '';

async function resolveCreditClientByEmail(email, authUserId = null) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (window.CUPISSAAuth?.getLinkedAccount) {
        const linked = await window.CUPISSAAuth.getLinkedAccount();
        if (linked?.client) return { ...linked.client, correo: normalizedEmail || linked.client.correo, clientes_web_id: linked.profile?.id || null };
    }

    // Respaldo para sesiones existentes mientras se instala el RPC de vinculación.
    let webQuery = supabaseClient.from('clientes_web').select('*');
    if (authUserId) webQuery = webQuery.eq('auth_user_id', authUserId);
    else webQuery = webQuery.ilike('correo', normalizedEmail);
    const { data: webClient, error: webError } = await webQuery.limit(1).maybeSingle();
    if (webError) throw webError;

    let creditClient = null;
    if (webClient?.cliente_id) {
        const result = await supabaseClient.from('clientes').select('*').eq('id', webClient.cliente_id).limit(1).maybeSingle();
        if (result.error) throw result.error;
        creditClient = result.data;
    }
    if (!creditClient && normalizedEmail) {
        const result = await supabaseClient.from('clientes').select('*').ilike('correo', normalizedEmail).limit(1).maybeSingle();
        if (result.error) throw result.error;
        creditClient = result.data;
    }
    if (!creditClient && webClient?.telefono) {
        const result = await supabaseClient.from('clientes').select('*').eq('telefono', webClient.telefono).limit(1).maybeSingle();
        if (result.error) throw result.error;
        creditClient = result.data;
    }
    if (!creditClient) throw new Error('No encontramos una cuenta CUPISSA asociada a este correo. Verifica que sea el correo registrado en tus compras.');
    return { ...creditClient, correo: normalizedEmail || webClient?.correo || creditClient.correo, clientes_web_id: webClient?.id || null };
}

async function handleClientLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const errorDiv = document.getElementById('login-error');
    const errorText = errorDiv.querySelector('span');
    try {
        await window.CUPISSAAuth.sendEmailLoginOtp(email, new URL('/perfil/', window.location.origin).toString());
        pendingPortalLoginEmail = email;
        document.getElementById('client-login-otp-email').textContent = email;
        document.getElementById('client-login-otp-panel').classList.remove('hidden');
        document.getElementById('client-login-form').classList.add('hidden');
        errorDiv.classList.add('hidden');
    } catch (error) {
        console.error('[CUPISSA PORTAL] Error enviando OTP:', error);
        errorText.textContent = error?.message || 'No fue posible enviar el código de acceso.';
        errorDiv.classList.remove('hidden');
    }
}

async function handleClientOtpVerify() {
    const code = String(document.getElementById('client-login-otp-code').value || '').replace(/\D/g, '').slice(0, 6);
    const errorDiv = document.getElementById('login-error');
    const errorText = errorDiv.querySelector('span');
    try {
        await window.CUPISSAAuth.verifyEmailLoginOtp(pendingPortalLoginEmail, code);
        const linked = await window.CUPISSAAuth.getLinkedAccount();
        if (!linked?.client) throw new Error('El correo quedó verificado, pero no encontramos una cuenta CUPISSA vinculada. Contacta a atención.');
        await showClientDashboard(linked.client);
    } catch (error) {
        console.error('[CUPISSA PORTAL] Error verificando OTP:', error);
        errorText.textContent = error?.message || 'El código no es válido o venció.';
        errorDiv.classList.remove('hidden');
    }
}

async function resendClientLoginOtp() {
    const errorDiv = document.getElementById('login-error');
    const errorText = errorDiv.querySelector('span');
    try {
        await window.CUPISSAAuth.sendEmailLoginOtp(pendingPortalLoginEmail, new URL('/perfil/', window.location.origin).toString());
        errorText.textContent = 'Enviamos un nuevo código a tu correo.';
        errorDiv.classList.remove('hidden');
    } catch (error) {
        errorText.textContent = error?.message || 'No fue posible enviar otro código.';
        errorDiv.classList.remove('hidden');
    }
}

function backToClientEmailLogin() {
    document.getElementById('client-login-otp-panel').classList.add('hidden');
    document.getElementById('client-login-form').classList.remove('hidden');
    document.getElementById('client-login-otp-code').value = '';
}

async function handleClientGoogleLogin() {
    // Google no permite OAuth dentro del iframe del catálogo móvil.
    if (window.self !== window.top) {
        const url = new URL('/portal-pagos/', window.location.origin);
        url.searchParams.set('cupissa_google_popup', 'login');
        url.searchParams.set('cupissa_mobile_return', '1');
        window.parent.postMessage({ type: 'CUPISSA_PORTAL_GOOGLE_TOP_LEVEL', url: url.toString() }, window.location.origin);
        return;
    }
    try {
        const redirect = new URL('/portal-pagos/', window.location.origin);
        redirect.searchParams.set('cupissa_google_return', '1');
        if (new URLSearchParams(window.location.search).get('cupissa_mobile_return') === '1') redirect.searchParams.set('cupissa_mobile_return', '1');
        await window.CUPISSAAuth.signInGoogle('login', redirect.toString());
    } catch (error) {
        const errorDiv = document.getElementById('login-error');
        errorDiv.querySelector('span').textContent = error?.message || 'No fue posible iniciar sesión con Google.';
        errorDiv.classList.remove('hidden');
    }
}

async function showClientDashboard(client) {
    currentClient = client;
    localStorage.setItem('cupissa_client_session', JSON.stringify(client));
    document.getElementById('login-error')?.classList.add('hidden');
    document.getElementById('client-login-card').classList.add('hidden');
    document.getElementById('client-dashboard').classList.remove('hidden');
    await loadClientDashboard();
}

async function handleLogout() {
    currentClient = null;
    activeCredits = [];
    if (cupissaCreditRealtimeChannel) {
        try { await supabaseClient.removeChannel(cupissaCreditRealtimeChannel); } catch (_) {}
        cupissaCreditRealtimeChannel = null;
    }
    localStorage.removeItem('cupissa_client_session');
    try { await window.CUPISSAAuth.signOut(); } catch (error) { console.warn(error); }
    document.getElementById('client-dashboard').classList.add('hidden');
    document.getElementById('client-login-card').classList.remove('hidden');
    document.getElementById('client-login-form')?.reset();
    // El acceso se gestiona únicamente desde Perfil.
}

// Continuación de Google en navegación principal (nunca dentro del iframe).
document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('cupissa_google_popup') !== 'login') return;
    if (window.self !== window.top) return;
    handleClientGoogleLogin();
});

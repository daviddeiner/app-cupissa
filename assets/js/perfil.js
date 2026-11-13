
/* ============================================================
   CUPISSA | PERFIL DE CLIENTES
   Autenticación Supabase + OTP + Google + cuentas anteriores
   Conserva pedidos, fotografías y detalles de compra.
   ============================================================ */

(() => {
  'use strict';

  const $ = id => document.getElementById(id);

  const clientDb =
    typeof supabaseClient !== 'undefined'
      ? supabaseClient
      : window.supabaseClient;

  const AUTH = () => window.CUPISSAAuth;

  const money = value =>
    '$ ' + new Intl.NumberFormat('es-CO').format(Number(value || 0));

  const safe = value =>
    String(value ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[c]);

  const DUPLICATE_PHONE =
    'Este teléfono ya está registrado. Inicia sesión o utiliza otro número.';

  let currentClient = null;
  let currentProfile = null;
  let pendingSignup = null;
  let pendingGoogleEmail = '';
  let pendingRecoveryEmail = '';
  let pendingEmailLogin = ''; 
  let googleOtpVerified = false;

  /* ============================================================
     MENSAJES
     ============================================================ */

  function showMessage(id, message, success = false) {
    const el = $(id);
    if (!el) return;

    el.textContent = message;
    el.classList.remove('hidden', 'error', 'success');
    el.classList.add(success ? 'success' : 'error');
  }

  function hideMessage(id) {
    const el = $(id);
    if (el) el.classList.add('hidden');
  }

  function showFlowMessage(id, message, success = false) {
    const el = $(id);
    if (!el) return;

    el.textContent = message;
    el.style.display = 'block';
    el.classList.remove('hidden');
    el.classList.toggle('profile-flow-success', success);
    el.classList.toggle('profile-flow-error', !success);
  }

  function hideFlowMessage(id) {
    const el = $(id);
    if (!el) return;
    el.style.display = 'none';
    el.textContent = '';
  }

  function friendlyError(error) {
    const original = String(error?.message || '').toLowerCase();
    const code = String(error?.code || '');

    if (
      original.includes('phone') ||
      original.includes('telefono') ||
      original.includes('teléfono') ||
      code === '23505'
    ) {
      return DUPLICATE_PHONE;
    }

    if (
      original.includes('invalid login credentials') ||
      original.includes('invalid credentials')
    ) {
      return 'No fue posible validar el acceso. Comprueba el correo.';
    }

    if (
      original.includes('expired') ||
      original.includes('otp_expired')
    ) {
      return 'El código venció. Solicita uno nuevo.';
    }

    if (
      original.includes('invalid otp') ||
      original.includes('invalid token')
    ) {
      return 'El código no es correcto. Verifica los seis dígitos.';
    }

    if (
      original.includes('rate limit') ||
      original.includes('too many requests')
    ) {
      return 'Has solicitado varios códigos. Espera unos minutos e inténtalo nuevamente.';
    }

    return error?.message ||
      'No fue posible completar la operación. Inténtalo nuevamente.';
  }

  function handleError(id, error, fallback) {
    console.error('[CUPISSA PERFIL]', error);
    showMessage(id, friendlyError(error) || fallback);
  }

  function disableButton(button, disabled, text) {
    if (!button) return;

    button.disabled = disabled;
    button.classList.toggle('opacity-60', disabled);

    if (text !== undefined) {
      if (disabled) {
        button.dataset.originalText = button.innerHTML;
        button.textContent = text;
      } else if (button.dataset.originalText) {
        button.innerHTML = button.dataset.originalText;
        delete button.dataset.originalText;
      }
    }
  }

  function cleanEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function cleanPhone(value) {
    return String(value || '').trim().replace(/\s+/g, '');
  }

  function cleanName(value) {
    return String(value || '').trim().toLocaleUpperCase('es-CO');
  }

  function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail(value));
  }

  function validOtp(value) {
    return /^\d{6}$/.test(String(value || '').trim());
  }

  function splitName(full = '') {
    const bits = String(full).trim().split(/\s+/).filter(Boolean);
    return {
      nombres: bits.shift() || '',
      apellidos: bits.join(' ')
    };
  }

  /* ============================================================
     SESIÓN Y PERFIL
     ============================================================ */

  function setSession(client) {
    currentClient = {
      id: client.id,
      nombre: client.nombre,
      telefono: client.telefono,
      correo: client.correo,
      cupo_disponible: client.cupo_disponible,
      cupo_total: client.cupo_total,
      password: client.password || ''
    };

    localStorage.setItem(
      'cupissa_client_session',
      JSON.stringify(currentClient)
    );
  }

  function showAccount() {
    $('profile-auth-section')?.classList.add('hidden');
    $('profile-account-section')?.classList.remove('hidden');
  }

  function showAuth() {
    $('profile-account-section')?.classList.add('hidden');
    $('profile-auth-section')?.classList.remove('hidden');
  }

  function hideAllAuthPanels() {
    [
      'profile-login-form',
      'profile-email-login-otp-panel',
      'profile-register-form',
      'profile-signup-otp-panel',
      'profile-google-otp-panel',
      'profile-google-register-panel',
      'profile-recovery-panel',
      'profile-legacy-link-panel'
    ].forEach(id => {
      $(id)?.classList.remove('active');
      $(id)?.classList.add('hidden');
    });
  }

  function showPanel(id) {
    hideAllAuthPanels();

    const panel = $(id);
    if (!panel) return;

    panel.classList.remove('hidden');
    panel.classList.add('active');
  }

  window.showProfileFlow = function (flow) {
    const panels = {
      recovery: 'profile-recovery-panel',
      legacy: 'profile-legacy-link-panel',
      signupOtp: 'profile-signup-otp-panel',
      googleOtp: 'profile-google-otp-panel',
      googleRegister: 'profile-google-register-panel'
    };

    if (panels[flow]) {
      showPanel(panels[flow]);
    }
  };

  window.showAuthMode = function (mode) {
    const login = mode === 'login';

    hideAllAuthPanels();

    $(login ? 'profile-login-form' : 'profile-register-form')
      ?.classList.remove('hidden');

    $('auth-login-tab')?.classList.toggle('active', login);
    $('auth-register-tab')?.classList.toggle('active', !login);

    hideMessage('profile-login-error');
    hideMessage('profile-register-error');


  };

  /* ============================================================
     CARGA DEL PERFIL
     ============================================================ */

  async function ensureProfile(client) {
    // Priorizar el perfil que devuelve la RPC segura; evita depender de una lectura
    // directa de clientes_web cuando RLS restringe el SELECT del navegador.
    try {
      const linked = await AUTH().getLinkedAccount();
      if (linked?.profile && String(linked.profile.cliente_id || '') === String(client.id)) {
        return linked.profile;
      }
    } catch (error) {
      console.warn('[CUPISSA PERFIL] No se pudo recuperar el perfil mediante la vinculación segura:', error);
    }

    const { data, error } = await clientDb
      .from('clientes_web')
      .select('*')
      .eq('cliente_id', String(client.id))
      .maybeSingle();

    if (error) throw error;
    if (data) return data;

    const byPhone = await clientDb
      .from('clientes_web')
      .select('*')
      .eq('telefono', client.telefono || '')
      .maybeSingle();

    if (byPhone.error) throw byPhone.error;

    if (byPhone.data) {
      const linked = await clientDb
        .from('clientes_web')
        .update({
          cliente_id: String(client.id),
          correo: client.correo || byPhone.data.correo || ''
        })
        .eq('id', byPhone.data.id)
        .select('*')
        .single();

      if (linked.error) throw linked.error;
      return linked.data;
    }

    const parsed = splitName(client.nombre || '');

    const newProfile = {
      cliente_id: String(client.id),
      nombres: parsed.nombres,
      apellidos: parsed.apellidos,
      telefono: client.telefono || '',
      correo: client.correo || '',
      direccion: '',
      barrio: '',
      ciudad: ''
    };

    const inserted = await clientDb
      .from('clientes_web')
      .insert([newProfile])
      .select('*')
      .single();

    if (inserted.error) throw inserted.error;

    return inserted.data;
  }

  function renderProfile() {
    if (!currentClient || !currentProfile) return;

    const fullName = [
      currentProfile.nombres,
      currentProfile.apellidos
    ].filter(Boolean).join(' ').toLocaleUpperCase('es-CO');

    $('profile-heading-name').textContent =
      fullName ||
      String(currentClient.nombre || 'Mi perfil').toLocaleUpperCase('es-CO');

    $('profile-heading-phone').textContent =
      currentProfile.telefono || currentClient.telefono || '';

    $('profile-avatar').textContent =
      (currentProfile.nombres || currentClient.nombre || 'CU')
        .slice(0, 2)
        .toUpperCase();

    const fields = [
      ['Nombres', cleanName(currentProfile.nombres)],
      ['Apellidos', cleanName(currentProfile.apellidos)],
      ['Teléfono', currentProfile.telefono],
      ['Correo', cleanEmail(currentProfile.correo)],
      ['Dirección', cleanName(currentProfile.direccion)],
      ['Barrio', cleanName(currentProfile.barrio)],
      ['Ciudad', cleanName(currentProfile.ciudad)]
    ];

    $('profile-data-view').innerHTML = fields.map(([label, value]) => `
      <div class="profile-field">
        <span>${safe(label)}</span>
        <strong>${safe(value || 'No registrado')}</strong>
      </div>
    `).join('');

    $('locked-profile-name').textContent =
      fullName || currentClient.nombre || '—';

    $('locked-profile-phone').textContent =
      currentProfile.telefono || currentClient.telefono || '—';

    $('edit-correo').value =
      cleanEmail(currentProfile.correo);
    $('edit-correo').readOnly = true;
    $('edit-correo').disabled = true;
    $('edit-correo').setAttribute('aria-readonly', 'true');
    $('edit-correo').classList.add('bg-slate-100', 'text-slate-500', 'cursor-not-allowed');

    $('edit-direccion').value =
      cleanName(currentProfile.direccion);

    $('edit-barrio').value =
      cleanName(currentProfile.barrio);

    $('edit-ciudad').value =
      cleanName(currentProfile.ciudad);

    const phone =
      currentProfile.telefono || currentClient.telefono || '';

    const identityChange = $('profile-request-identity-change');

    if (identityChange) {
      const requestText =
        `Hola CUPISSA, solicito actualizar los datos fijos de mi cuenta. ` +
        `Nombre registrado: ${fullName || currentClient.nombre || 'No indicado'}. ` +
        `Teléfono registrado: ${phone || 'No indicado'}.`;

      identityChange.href =
        `https://wa.me/${window.CUPISSA_WHATSAPP || '573245680018'}` +
        `?text=${encodeURIComponent(requestText)}`;
    }
  }

  async function loadProfile(client) {
    if (!client?.id) {
      throw new Error('No encontramos los datos de tu cuenta CUPISSA.');
    }

    currentProfile = await ensureProfile(client);
    const authUser = await AUTH().getCurrentUser().catch(() => null);
    const verifiedEmail = cleanEmail(authUser?.email || client.correo || currentProfile.correo);
    if (verifiedEmail && cleanEmail(currentProfile.correo) !== verifiedEmail) {
      const { data: syncedProfile, error: syncError } = await clientDb
        .from('clientes_web')
        .update({ correo: verifiedEmail, auth_user_id: authUser?.id || currentProfile.auth_user_id || null })
        .eq('id', currentProfile.id)
        .select('*')
        .maybeSingle();
      if (!syncError && syncedProfile) currentProfile = syncedProfile;
      else currentProfile.correo = verifiedEmail;
    }

    setSession(client);
    // Avisar al Portal que Perfil ya validó y vinculó una cuenta.
    try {
      if (window.parent !== window) {
        window.parent.postMessage({ type: 'CUPISSA_PROFILE_AUTH_CHANGED' }, location.origin);
      }
    } catch (_) {}
    renderProfile();
    showAccount();

    await loadOrders();

    const requestedOrder =
      new URLSearchParams(location.search).get('pedidoId');

    if (requestedOrder) {
      const found = (window.__cupissaWebOrders || [])
        .find(order => String(order.id) === String(requestedOrder));

      if (found) {
        $('tus-pedidos')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });

        window.openProfileOrder(found.id);
      }
    }

    if (!notifyCatalogGoogleFinished()) redirectToCheckoutIfRequested();
  }

  function redirectToCheckoutIfRequested() {
    const params = new URLSearchParams(location.search);

    if (params.get('next') !== 'checkout') return;

    if (
      params.get('embedded') === '1' &&
      window.parent !== window
    ) {
      window.parent.postMessage(
        { type: 'CUPISSA_PROFILE_CHECKOUT' },
        location.origin
      );
    } else {
      location.href = '/checkout';
    }
  }

  /* ============================================================
     INICIO DE SESIÓN CON CORREO
     ============================================================ */

  window.loginProfile = async function (event) {
    event.preventDefault();
    hideMessage('profile-login-error');
    const email = cleanEmail($('login-email-profile')?.value);
    if (!validEmail(email)) {
      showMessage('profile-login-error', 'Escribe un correo válido.');
      return;
    }
    const button = $('profile-login-form')?.querySelector('button[type="submit"]');
    disableButton(button, true, 'Enviando código...');
    try {
      await AUTH().sendEmailLoginOtp(email, new URL('/perfil/', location.origin).href);
      pendingEmailLogin = email;
      $('profile-email-login-destination').textContent = email;
      $('profile-email-login-code').value = '';
      showPanel('profile-email-login-otp-panel');
    } catch (error) {
      handleError('profile-login-error', error, 'No fue posible enviar el código.');
    } finally {
      disableButton(button, false);
    }
  };

  window.verifyProfileEmailLoginOtp = async function (event) {
    event.preventDefault();
    const code = String($('profile-email-login-code')?.value || '').replace(/\D/g, '').slice(0, 6);
    try {
      await AUTH().verifyEmailLoginOtp(pendingEmailLogin, code);
      const linked = await AUTH().getLinkedAccount();
      if (!linked?.client) {
        showFlowMessage('profile-email-login-otp-error', 'El correo quedó autenticado, pero no encontramos una cuenta CUPISSA vinculada. Contacta a atención para asociarla.');
        return;
      }
      await loadProfile(linked.client);
    } catch (error) {
      console.error('[CUPISSA PERFIL OTP]', error);
      showFlowMessage('profile-email-login-otp-error', friendlyError(error));
    }
  };

  window.resendProfileEmailLoginOtp = async function () {
    try {
      await AUTH().sendEmailLoginOtp(pendingEmailLogin, new URL('/perfil/', location.origin).href);
      showFlowMessage('profile-email-login-otp-error', 'Enviamos un nuevo código a tu correo.', true);
    } catch (error) {
      showFlowMessage('profile-email-login-otp-error', friendlyError(error));
    }
  };

  /* ============================================================
     GOOGLE: INICIAR SESIÓN
     ============================================================ */

  // Google rechaza OAuth dentro de iframes. En móvil salimos solo
  // durante la autenticación y regresamos automáticamente al catálogo.
  function startGoogleFromProfile(intent) {
    // Detectar el iframe REAL, incluso si una redirección eliminó ?embedded=1.
    if (window.self !== window.top) {
      const params = new URLSearchParams(location.search);
      const url = new URL('/perfil/', location.origin);
      url.searchParams.set('cupissa_google_popup', intent);
      url.searchParams.set('cupissa_mobile_return', '1');
      if (params.get('next') === 'checkout') url.searchParams.set('next', 'checkout');
      // La navegación la realiza el catálogo, no el iframe de perfil.
      try {
        window.parent.postMessage({ type: 'CUPISSA_GOOGLE_TOP_LEVEL', url: url.toString() }, location.origin);
      } catch (_) {
        window.top.location.assign(url.toString());
      }
      return true;
    }
    return false;
  }

  function notifyCatalogGoogleFinished() {
    const params = new URLSearchParams(location.search);
    if (params.get('cupissa_google_return') !== '1') return false;
    if (params.get('cupissa_mobile_return') === '1') {
      if (params.get('next') === 'checkout') location.replace('/checkout/');
      else location.replace('/catalogo/');
      return true;
    }
    if (!window.opener || window.opener.closed) return false;
    window.opener.postMessage({
      type: 'CUPISSA_GOOGLE_FINISHED',
      next: params.get('next') === 'checkout' ? 'checkout' : ''
    }, location.origin);
    window.close();
    return true;
  }

  window.loginWithGoogle = async function () {
    if (startGoogleFromProfile('login')) return;
    hideMessage('profile-login-error');

    try {
      await AUTH().signInGoogle('login', new URL('/perfil/?cupissa_google_return=1' + (new URLSearchParams(location.search).get('cupissa_mobile_return') === '1' ? '&cupissa_mobile_return=1' : '') + (new URLSearchParams(location.search).get('next') === 'checkout' ? '&next=checkout' : ''), location.origin).toString());
    } catch (error) {
      handleError(
        'profile-login-error',
        error,
        'No fue posible iniciar sesión con Google.'
      );
    }
  };

  /* ============================================================
     GOOGLE: REGISTRO
     ============================================================ */

  window.registerWithGoogle = async function () {
    if (!$('profile-consent-register')?.checked) {
      showMessage('profile-register-error', 'Debes autorizar el tratamiento de datos y el envío de correos antes de registrarte.');
      $('profile-consent-register')?.focus();
      return;
    }
    if (startGoogleFromProfile('register')) return;
    hideMessage('profile-register-error');

    try {
      await AUTH().signInGoogle('register', new URL('/perfil/?cupissa_google_return=1' + (new URLSearchParams(location.search).get('cupissa_mobile_return') === '1' ? '&cupissa_mobile_return=1' : '') + (new URLSearchParams(location.search).get('next') === 'checkout' ? '&next=checkout' : ''), location.origin).toString());
    } catch (error) {
      handleError(
        'profile-register-error',
        error,
        'No fue posible iniciar el registro con Google.'
      );
    }
  };

  async function processGoogleReturn() {
    const intent = AUTH().getGoogleIntent();

    if (!intent) return false;

    const user = await AUTH().getCurrentUser();

    if (!user) {
      AUTH().clearGoogleIntent();
      return false;
    }

    // El Google anterior ya no puede recuperar una cuenta cuyo correo cambió.
    if (typeof AUTH().verifyGoogleEmailIsCurrent === 'function' &&
        !(await AUTH().verifyGoogleEmailIsCurrent())) {
      AUTH().clearGoogleIntent();
      showAuth();
      showAuthMode('register');
      showMessage('profile-register-error', 'Este correo de Google ya no está asociado a la cuenta anterior. Para crear una cuenta nueva con él, primero debe quedar desvinculado de la identidad anterior en Supabase. No se reutilizarán los datos del cliente anterior.');
      return true;
    }

    const linked = await AUTH().getLinkedAccount();

    // Google OAuth ya verificó la titularidad del correo; nunca solicitar segundo OTP.
    if (linked?.client) {
      AUTH().clearGoogleIntent();
      await loadProfile(linked.client);
      return true;
    }
    pendingGoogleEmail = cleanEmail(user.email);
    const metadata = user.user_metadata || {};
    const parsed = splitName(metadata.full_name || metadata.name || '');
    $('google-reg-email').value = pendingGoogleEmail;
    $('google-reg-nombres').value = metadata.given_name || metadata.nombres || parsed.nombres || '';
    $('google-reg-apellidos').value = metadata.family_name || metadata.apellidos || parsed.apellidos || '';
    $('google-reg-telefono').value = metadata.telefono || '';
    googleOtpVerified = true;
    AUTH().clearGoogleIntent();
    showAuth();
    showPanel('profile-google-register-panel');
    return true;

    return false;
  }

  window.verifyGoogleRegistrationOtp = async function (event) {
    event.preventDefault();

    hideFlowMessage('profile-google-otp-error');
    hideFlowMessage('profile-google-otp-success');

    const code = $('profile-google-otp-code')?.value.trim();

    if (!validOtp(code)) {
      showFlowMessage(
        'profile-google-otp-error',
        'Escribe los seis dígitos del código.'
      );
      return;
    }

    try {
      await AUTH().verifyGoogleRegistrationOtp(
        pendingGoogleEmail,
        code
      );

      googleOtpVerified = true;

      const googleData = await AUTH().getGoogleUserData();

      $('google-reg-email').value = googleData.email;

      const name = splitName(googleData.nombres);

      $('google-reg-nombres').value =
        googleData.nombres || name.nombres;

      $('google-reg-apellidos').value =
        googleData.apellidos || name.apellidos;

      showPanel('profile-google-register-panel');

      AUTH().clearGoogleIntent();

    } catch (error) {
      console.error('[CUPISSA GOOGLE OTP]', error);

      showFlowMessage(
        'profile-google-otp-error',
        friendlyError(error)
      );
    }
  };

  window.resendGoogleRegistrationOtp = async function () {
    hideFlowMessage('profile-google-otp-error');
    hideFlowMessage('profile-google-otp-success');

    try {
      if (!pendingGoogleEmail) {
        const user = await AUTH().getCurrentUser();
        pendingGoogleEmail = cleanEmail(user?.email);
      }

      await AUTH().sendGoogleRegistrationOtp(pendingGoogleEmail);

      showFlowMessage(
        'profile-google-otp-success',
        'Te enviamos un nuevo código. Revisa tu correo.',
        true
      );

    } catch (error) {
      showFlowMessage(
        'profile-google-otp-error',
        friendlyError(error)
      );
    }
  };

  window.completeGoogleRegistration = async function () {
    if (!$('profile-consent-google')?.checked) {
      showFlowMessage('profile-google-register-error', 'Debes autorizar el tratamiento de datos y el envío de correos antes de crear la cuenta.');
      $('profile-consent-google')?.focus();
      return;
    }
    hideFlowMessage('profile-google-register-error');

    if (!googleOtpVerified) {
      showFlowMessage(
        'profile-google-register-error',
        'Primero debes verificar el código enviado a tu correo.'
      );
      return;
    }

    const nombres = cleanName($('google-reg-nombres')?.value);
    const apellidos = cleanName($('google-reg-apellidos')?.value);
    const telefono = cleanPhone($('google-reg-telefono')?.value);

    if (!nombres || !apellidos || !telefono) {
      showFlowMessage(
        'profile-google-register-error',
        'Completa tus nombres, apellidos y número de teléfono.'
      );
      return;
    }

    const button = $('profile-google-create-client');
    disableButton(button, true, 'Creando cuenta...');

    try {
      await AUTH().checkPhoneAvailable(telefono);

      await AUTH().createNewClient({
        telefono,
        nombres,
        apellidos
      });

      const linked = await AUTH().getLinkedAccount();

      if (!linked?.client) {
        throw new Error(
          'No pudimos cargar tu cuenta. Inicia sesión nuevamente.'
        );
      }

      googleOtpVerified = false;
      pendingGoogleEmail = '';

      await loadProfile(linked.client);

    } catch (error) {
      console.error('[CUPISSA GOOGLE REGISTRO]', error);

      showFlowMessage(
        'profile-google-register-error',
        friendlyError(error)
      );
    } finally {
      disableButton(button, false);
    }
  };

  window.cancelGoogleRegistration = async function () {
    pendingGoogleEmail = '';
    googleOtpVerified = false;

    try {
      await AUTH().signOut();
    } catch (error) {
      console.warn(error);
    }

    AUTH().clearGoogleIntent();

    $('profile-google-otp-code').value = '';

    showAuth();
    showAuthMode('register');
  };

  /* ============================================================
     REGISTRO TRADICIONAL
     ============================================================ */

  window.registerProfile = async function (event) {
    event.preventDefault();
    if (!$('profile-consent-register')?.checked) {
      showMessage('profile-register-error', 'Debes autorizar el tratamiento de datos y el envío de correos antes de crear la cuenta.');
      $('profile-consent-register')?.focus();
      return;
    }

    hideMessage('profile-register-error');
    hideMessage('profile-register-success');

    const nombres = cleanName($('reg-nombres')?.value);
    const apellidos = cleanName($('reg-apellidos')?.value);
    const telefono = cleanPhone($('reg-telefono')?.value);
    const email = cleanEmail($('reg-email')?.value);


    if (!nombres || !apellidos || !telefono || !email) {
      showMessage(
        'profile-register-error',
        'Completa todos los campos para registrarte.'
      );
      return;
    }

    if (!validEmail(email)) {
      showMessage(
        'profile-register-error',
        'Escribe un correo electrónico válido.'
      );
      return;
    }


    const button = $('profile-register-form')
      ?.querySelector('button[type="submit"]');

    disableButton(button, true, 'Enviando código...');

    try {
      // La validación de duplicados se hace después del OTP, con sesión verificada.
      const result = await AUTH().signUp({
        email,
        nombres,
        apellidos,
        telefono
      });

      pendingSignup = {
        email,
        telefono,
        nombres,
        apellidos
      };

      sessionStorage.setItem(
        'cupissa_pending_signup',
        JSON.stringify(pendingSignup)
      );

      $('profile-signup-otp-email').textContent = email;

      $('profile-signup-otp-code').value = '';

      $('profile-register-form').reset();

      showPanel('profile-signup-otp-panel');

      showFlowMessage(
        'profile-signup-otp-success',
        'Te enviamos un código de seis dígitos. Revisa tu correo.',
        true
      );

      if (result?.session) {
        console.info(
          '[CUPISSA] Supabase devolvió sesión al registrar.'
        );
      }

    } catch (error) {
      console.error('[CUPISSA REGISTRO]', error);

      showMessage(
        'profile-register-error',
        friendlyError(error)
      );
    } finally {
      disableButton(button, false);
    }
  };

  window.verifyProfileSignupOtp = async function (event) {
    event.preventDefault();

    hideFlowMessage('profile-signup-otp-error');
    hideFlowMessage('profile-signup-otp-success');

    if (!pendingSignup) {
      try {
        pendingSignup = JSON.parse(
          sessionStorage.getItem('cupissa_pending_signup') || 'null'
        );
      } catch (_) {
        pendingSignup = null;
      }
    }

    if (!pendingSignup?.email) {
      showFlowMessage(
        'profile-signup-otp-error',
        'No encontramos los datos del registro. Inicia nuevamente el proceso.'
      );
      return;
    }

    const code = $('profile-signup-otp-code')?.value.trim();

    if (!validOtp(code)) {
      showFlowMessage(
        'profile-signup-otp-error',
        'Escribe los seis dígitos del código.'
      );
      return;
    }

    const button = $('profile-signup-otp-form')
      ?.querySelector('button[type="submit"]');

    disableButton(button, true, 'Verificando...');

    try {
      await AUTH().verifySignupOtp(
        pendingSignup.email,
        code
      );

      // Si el correo ya pertenece a un cliente existente (incluido invitado
      // creado por el administrador), entrar en esa ficha SIN duplicarla.
      let alreadyLinked = await AUTH().getLinkedAccount();
      if (!alreadyLinked?.client) {
        // La cuenta está verificada. El RPC comprueba teléfonos en AMBAS
        // tablas con privilegios de servidor, sin exponer registros ajenos.
        await AUTH().checkPhoneAvailable(pendingSignup.telefono);
        await AUTH().createNewClient({
          telefono: pendingSignup.telefono,
          nombres: pendingSignup.nombres,
          apellidos: pendingSignup.apellidos
        });
      }

      sessionStorage.removeItem('cupissa_pending_signup');
      pendingSignup = null;

      const linked = await AUTH().getLinkedAccount();

      if (!linked?.client) {
        throw new Error(
          'Tu correo fue verificado, pero no pudimos cargar el perfil. Inicia sesión para continuar.'
        );
      }

      await loadProfile(linked.client);

    } catch (error) {
      console.error('[CUPISSA VERIFICAR REGISTRO]', error);

      showFlowMessage(
        'profile-signup-otp-error',
        friendlyError(error)
      );
    } finally {
      disableButton(button, false);
    }
  };

  window.resendProfileSignupOtp = async function () {
    hideFlowMessage('profile-signup-otp-error');
    hideFlowMessage('profile-signup-otp-success');

    if (!pendingSignup) {
      try {
        pendingSignup = JSON.parse(
          sessionStorage.getItem('cupissa_pending_signup') || 'null'
        );
      } catch (_) {
        pendingSignup = null;
      }
    }

    if (!pendingSignup?.email) {
      showFlowMessage(
        'profile-signup-otp-error',
        'No encontramos el correo del registro. Inicia nuevamente.'
      );
      return;
    }

    const button = $('profile-signup-otp-resend');
    disableButton(button, true, 'Enviando...');

    try {
      await AUTH().resendSignupOtp(pendingSignup.email);

      showFlowMessage(
        'profile-signup-otp-success',
        'Te enviamos un nuevo código. Revisa tu correo.',
        true
      );

    } catch (error) {
      showFlowMessage(
        'profile-signup-otp-error',
        friendlyError(error)
      );
    } finally {
      disableButton(button, false);
    }
  };

  window.cancelProfileSignupOtp = async function () {
    pendingSignup = null;

    sessionStorage.removeItem('cupissa_pending_signup');

    try {
      await AUTH().signOut();
    } catch (error) {
      console.warn(error);
    }

    showAuth();
    showAuthMode('register');
  };

  /* ============================================================
     RECUPERACIÓN DE CONTRASEÑA
     ============================================================ */

  window.sendProfileRecoveryOtp = async function (event) {
    event.preventDefault();

    hideFlowMessage('profile-recovery-error');
    hideFlowMessage('profile-recovery-success');

    const email = cleanEmail($('profile-recovery-email')?.value);

    if (!validEmail(email)) {
      showFlowMessage(
        'profile-recovery-error',
        'Escribe un correo electrónico válido.'
      );
      return;
    }

    const button = $('profile-recovery-form')
      ?.querySelector('button[type="submit"]');

    disableButton(button, true, 'Enviando...');

    try {
      await AUTH().sendPasswordRecoveryOtp(email);

      pendingRecoveryEmail = email;

      $('profile-recovery-verify-form')?.classList.remove('hidden');

      showFlowMessage(
        'profile-recovery-success',
        'Si el correo está registrado, recibirás un código para recuperar tu contraseña.',
        true
      );

    } catch (error) {
      showFlowMessage(
        'profile-recovery-error',
        friendlyError(error)
      );
    } finally {
      disableButton(button, false);
    }
  };

  window.verifyProfileRecoveryOtp = async function (event) {
    event.preventDefault();

    hideFlowMessage('profile-recovery-error');
    hideFlowMessage('profile-recovery-success');

    const code = $('profile-recovery-code')?.value.trim();
    const password = $('profile-new-password')?.value || '';
    const confirm = $('profile-new-password-confirm')?.value || '';

    if (!pendingRecoveryEmail) {
      showFlowMessage(
        'profile-recovery-error',
        'Primero solicita el código de recuperación.'
      );
      return;
    }

    if (!validOtp(code)) {
      showFlowMessage(
        'profile-recovery-error',
        'Escribe el código de seis dígitos.'
      );
      return;
    }

    if (password.length < 6) {
      showFlowMessage(
        'profile-recovery-error',
        'La contraseña debe tener al menos seis caracteres.'
      );
      return;
    }

    if (password !== confirm) {
      showFlowMessage(
        'profile-recovery-error',
        'Las contraseñas no coinciden.'
      );
      return;
    }

    const button = $('profile-recovery-verify-form')
      ?.querySelector('button[type="submit"]');

    disableButton(button, true, 'Verificando...');

    try {
      await AUTH().verifyPasswordRecoveryOtp(
        pendingRecoveryEmail,
        code
      );

      await AUTH().updatePassword(password);

      pendingRecoveryEmail = '';

      $('profile-recovery-form')?.reset();
      $('profile-recovery-verify-form')?.reset();

      $('profile-recovery-verify-form')?.classList.add('hidden');

      showFlowMessage(
        'profile-recovery-success',
        'Tu contraseña fue actualizada. Ya puedes iniciar sesión.',
        true
      );

      setTimeout(() => {
        showAuthMode('login');
      }, 1800);

    } catch (error) {
      showFlowMessage(
        'profile-recovery-error',
        friendlyError(error)
      );
    } finally {
      disableButton(button, false);
    }
  };

  /* ============================================================
     VINCULAR CUENTA ANTERIOR
     ============================================================ */

  window.submitLegacyAccountLink = async function (event) {
    event.preventDefault();

    hideFlowMessage('profile-legacy-link-error');

    const telefono = cleanPhone($('legacy-link-telefono')?.value);
    const password = $('legacy-link-password')?.value || '';
    const nombres = cleanName($('legacy-link-nombres')?.value);
    const apellidos = cleanName($('legacy-link-apellidos')?.value);

    if (!telefono || !password || !nombres || !apellidos) {
      showFlowMessage(
        'profile-legacy-link-error',
        'Completa todos los datos para vincular tu cuenta anterior.'
      );
      return;
    }

    const button = $('profile-legacy-link-form')
      ?.querySelector('button[type="submit"]');

    disableButton(button, true, 'Vinculando...');

    try {
      await AUTH().linkLegacyAccount({
        telefono,
        password,
        nombres,
        apellidos
      });

      const linked = await AUTH().getLinkedAccount();

      if (!linked?.client) {
        throw new Error(
          'No pudimos recuperar tu perfil. Vuelve a iniciar sesión.'
        );
      }

      await loadProfile(linked.client);

    } catch (error) {
      console.error('[CUPISSA VINCULACIÓN]', error);

      showFlowMessage(
        'profile-legacy-link-error',
        friendlyError(error)
      );
    } finally {
      disableButton(button, false);
    }
  };

  /* ============================================================
     EDICIÓN DE PERFIL
     ============================================================ */

  window.toggleProfileEdit = function (show) {
    $('profile-data-view')?.classList.toggle('hidden', show);
    $('profile-edit-form')?.classList.toggle('hidden', !show);
    $('profile-edit-button')?.classList.toggle('hidden', show);

    hideMessage('profile-edit-error');
  };

  window.saveProfileChanges = async function (event) {
    event.preventDefault();

    hideMessage('profile-edit-error');

    if (!currentProfile) {
      showMessage(
        'profile-edit-error',
        'No encontramos tu perfil. Inicia sesión nuevamente.'
      );
      return;
    }

    const values = {
      direccion: cleanName($('edit-direccion')?.value),
      barrio: cleanName($('edit-barrio')?.value),
      ciudad: cleanName($('edit-ciudad')?.value)
    };

    const newEmail = cleanEmail($('edit-correo')?.value);
    const oldEmail = cleanEmail(currentProfile.correo);
    $('edit-correo').readOnly = true;
    $('edit-correo').disabled = true;
    $('edit-correo').setAttribute('aria-readonly', 'true');
    $('edit-correo').classList.add('bg-slate-100', 'text-slate-500', 'cursor-not-allowed');

    if (newEmail && !validEmail(newEmail)) {
      showMessage(
        'profile-edit-error',
        'Escribe un correo electrónico válido.'
      );
      return;
    }

    try {
      if (newEmail && newEmail !== oldEmail) {
        await AUTH().sendEmailChangeOtp(newEmail);

        $('profile-email-otp-panel')?.classList.remove('hidden');

        showMessage(
          'profile-edit-error',
          'Enviamos un código de confirmación a tu nuevo correo. Verifícalo para completar el cambio.',
          true
        );
      }

      const { error } = await clientDb
        .from('clientes_web')
        .update(values)
        .eq('id', currentProfile.id);

      if (error) throw error;

      currentProfile = {
        ...currentProfile,
        ...values
      };

      renderProfile();
      toggleProfileEdit(false);

    } catch (error) {
      handleError(
        'profile-edit-error',
        error,
        'No se pudieron guardar los cambios.'
      );
    }
  };

  window.closeProfileEmailChange = function () {
    $('profile-email-otp-panel')?.classList.add('hidden');
    $('profile-email-otp-panel')?.classList.remove('flex');
  };
  let emailChangeOld = '';
  let emailChangeNew = '';
  window.startProfileEmailChange = async function () {
    const oldEmail = cleanEmail(currentProfile?.correo);
    if (!oldEmail) { showMessage('profile-edit-error', 'No encontramos el correo actual.'); return; }
    try {
      await AUTH().sendEmailLoginOtp(oldEmail, new URL('/perfil/', location.origin).href);
      emailChangeOld = oldEmail;
      $('profile-email-old-code').value = '';
      $('profile-email-new-address').value = '';
      $('profile-email-otp-code').value = '';
      $('profile-email-old-stage').classList.remove('hidden');
      $('profile-email-new-stage').classList.add('hidden');
      $('profile-email-otp-panel').classList.remove('hidden');
      $('profile-email-otp-panel').classList.add('flex');
      $('profile-email-new-request').classList.remove('hidden');
      $('profile-email-otp-form').style.display = 'none';
      hideFlowMessage('profile-email-otp-error');
      showFlowMessage('profile-email-otp-success', 'Enviamos un código a tu correo actual.', true);
    } catch (error) { showMessage('profile-edit-error', friendlyError(error)); }
  };
  window.verifyProfileOldEmail = async function (event) {
    event.preventDefault();
    try {
      const code = $('profile-email-old-code').value.replace(/\D/g, '').slice(0,6);
      await AUTH().verifyEmailLoginOtp(emailChangeOld, code);
      $('profile-email-old-stage').classList.add('hidden');
      $('profile-email-new-stage').classList.remove('hidden');
      showFlowMessage('profile-email-otp-success', 'Correo actual verificado. Escribe el nuevo correo.', true);
    } catch(error) { showFlowMessage('profile-email-otp-error', friendlyError(error)); }
  };
  window.requestProfileNewEmail = async function (event) {
    event.preventDefault();
    try {
      const address = cleanEmail($('profile-email-new-address').value);
      if (!validEmail(address) || address === emailChangeOld) throw new Error('Introduce otro correo válido.');
      await AUTH().checkEmailAvailable(address);
      await AUTH().sendEmailChangeOtp(address);
      emailChangeNew = address;
      $('profile-email-new-request').classList.add('hidden');
      $('profile-email-otp-form').style.display = 'block';
      showFlowMessage('profile-email-otp-success', 'Enviamos el código al nuevo correo.', true);
    } catch(error) { showFlowMessage('profile-email-otp-error', friendlyError(error)); }
  };
  window.verifyProfileEmailChange = async function (event) {
    event.preventDefault();

    hideFlowMessage('profile-email-otp-error');
    hideFlowMessage('profile-email-otp-success');

    const email = emailChangeNew;
    const code = $('profile-email-otp-code')?.value.trim();

    if (!validOtp(code)) {
      showFlowMessage(
        'profile-email-otp-error',
        'Escribe los seis dígitos del código.'
      );
      return;
    }

    try {
      const cambioConfirmado = await AUTH().verifyEmailChangeOtp(email, code);
      if (cleanEmail(cambioConfirmado?.user?.email) !== email) throw new Error('El correo aún no está confirmado en Authentication.');

      currentProfile.correo = email;
      currentClient.correo = email;
      $('edit-correo').value = email;
      $('profile-email-new-request').classList.remove('hidden');
      $('profile-email-otp-form').style.display = 'none';
      renderProfile();

      closeProfileEmailChange();

      showFlowMessage(
        'profile-email-otp-success',
        'Tu correo fue actualizado correctamente.',
        true
      );

    } catch (error) {
      showFlowMessage(
        'profile-email-otp-error',
        friendlyError(error)
      );
    }
  };

  /* ============================================================
     CARGA DE PEDIDOS
     Conserva las tres vías de búsqueda:
     - cliente_web_id
     - cliente_id
     - teléfono
     ============================================================ */

  async function loadOrders() {
    const container = $('profile-orders-list');

    if (!container || !currentProfile || !currentClient) return;

    container.innerHTML = `
      <div class="bg-white p-5 rounded-2xl text-sm text-slate-500">
        Cargando tus pedidos...
      </div>
    `;

    const queries = [];

    if (currentProfile.id) {
      queries.push(
        clientDb
          .from('pedidos_web')
          .select('*')
          .eq('cliente_web_id', String(currentProfile.id))
          .order('created_at', { ascending: false })
      );
    }

    if (currentClient.id) {
      queries.push(
        clientDb
          .from('pedidos_web')
          .select('*')
          .eq('cliente_id', String(currentClient.id))
          .order('created_at', { ascending: false })
      );
    }

    const phone = cleanPhone(
      currentProfile.telefono || currentClient.telefono
    );

    if (phone) {
      queries.push(
        clientDb
          .from('pedidos_web')
          .select('*')
          .eq('telefono', phone)
          .order('created_at', { ascending: false })
      );
    }

    if (!queries.length) {
      container.innerHTML =
        '<div class="bg-white p-5 rounded-2xl text-sm text-slate-500">No encontramos pedidos.</div>';
      return;
    }

    const results = await Promise.all(queries);

    const errors = results
      .filter(result => result.error)
      .map(result => result.error);

    const successfulResults = results.filter(
      result => !result.error
    );

    if (!successfulResults.length) {
      console.error('[CUPISSA PEDIDOS]', errors);

      container.innerHTML = `
        <div class="bg-white p-5 rounded-2xl text-sm text-rose-600">
          No fue posible cargar tus pedidos. Inténtalo más tarde.
        </div>
      `;

      return;
    }

    const ordersById = new Map();

    for (const result of successfulResults) {
      for (const order of result.data || []) {
        if (order?.id) {
          ordersById.set(String(order.id), order);
        }
      }
    }

    const orders = [...ordersById.values()].sort((a, b) =>
      new Date(b.created_at || b.updated_at || 0).getTime() -
      new Date(a.created_at || a.updated_at || 0).getTime()
    );

    $('profile-orders-count').textContent =
      `${orders.length} pedido${orders.length === 1 ? '' : 's'}`;

    window.__cupissaWebOrders = orders;

    if (!orders.length) {
      if (errors.length) {
        console.warn('[CUPISSA PEDIDOS] Algunas búsquedas fallaron:', errors);
      }

      container.innerHTML = `
        <div class="bg-white p-7 rounded-2xl border border-slate-100 text-center">
          <i class="fa-solid fa-box-open text-3xl text-pink-200"></i>
          <p class="font-bold text-slate-700 mt-3">
            Todavía no tienes pedidos registrados
          </p>
          <p class="text-xs text-slate-400 mt-1">
            Cuando realices una compra, aparecerá aquí.
          </p>
        </div>
      `;

      return;
    }

    container.innerHTML = orders.map(order => {
      const products = Array.isArray(order.productos)
        ? order.productos
        : [];

      const collectedPhotos = [];

      function imageUrl(value) {
        if (!value) return '';

        if (typeof value === 'string') {
          return value.trim();
        }

        if (typeof value === 'object') {
          return String(
            value.url ||
            value.imagen_url ||
            value.src ||
            value.path ||
            value.publicUrl ||
            ''
          ).trim();
        }

        return '';
      }

      function addPhoto(value) {
        const url = imageUrl(value);

        if (url && !collectedPhotos.includes(url)) {
          collectedPhotos.push(url);
        }
      }

      if (Array.isArray(order.imagenes)) {
        order.imagenes.forEach(addPhoto);
      } else if (order.imagenes) {
        addPhoto(order.imagenes);
      }

      products.forEach(item => {
        if (!item || typeof item !== 'object') return;

        [
          item.imagen_url,
          item.imagen,
          item.foto_url,
          item.foto,
          item.image_url,
          item.image,
          item.url_imagen,
          item.url
        ].forEach(addPhoto);

        if (Array.isArray(item.imagenes)) {
          item.imagenes.forEach(addPhoto);
        }

        if (Array.isArray(item.fotos)) {
          item.fotos.forEach(addPhoto);
        }
      });

      const photos = collectedPhotos.slice(0, 4);

      const photoTiles = photos.length
        ? photos.map(url => `
            <img
              class="profile-order-photo"
              src="${safe(url)}"
              alt="Producto del pedido"
              loading="lazy"
              onerror="this.style.display='none'"
            >
          `).join('')
        : `
            <div class="profile-order-photo grid place-items-center text-slate-300">
              <i class="fa-solid fa-image"></i>
            </div>
          `;

      const remaining = order.restante != null
        ? order.restante
        : Math.max(
            0,
            Number(order.total || 0) +
            Number(order.envio ?? order.domicilio_envio ?? 0) -
            Number(order.anticipo || 0)
          );

      return `
        <button
          type="button"
          class="profile-order-card"
          onclick="openProfileOrder('${safe(order.id)}')"
        >
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="flex items-center gap-3 min-w-0">
              <div class="grid grid-cols-2 gap-1">
                ${photoTiles}
              </div>

              <div class="min-w-0">
                <p class="font-black text-slate-900">
                  ${safe(order.codigo || order.numero_pedido || 'Pedido CUP')}
                </p>

                <p class="text-[11px] text-slate-400 mt-1">
                  ${products.length} producto(s) ·
                  ${safe(order.tipo_pedido || order.tipo_servicio || 'VENTA')}
                </p>

                <p class="text-xs font-bold text-slate-700 mt-2">
                  Restante: ${money(remaining)}
                </p>
                ${String(order.nota || '').trim() ? `
                  <div class="profile-order-sticky-note mt-3">
                    <span><i class="fa-regular fa-note-sticky"></i> Nota de CUPISSA</span>
                    <p>${safe(order.nota)}</p>
                  </div>
                ` : ''}
              </div>
            </div>

            <div class="flex sm:flex-col items-center sm:items-end justify-between gap-2">
              <span class="profile-status">
                ${safe(order.estado || 'AGENDADO')}
              </span>

              <span class="text-[10px] text-pink-600 font-black">
                Ver detalle
                <i class="fa-solid fa-chevron-right"></i>
              </span>
            </div>
          </div>
        </button>
      `;
    }).join('');
    // Comprobantes privados: consultar en una sola llamada. Las consultas del
    // cliente NO contienen rutas privadas ni enlaces públicos de Storage.
    window.__cupissaDeliveryOrderIds = new Set();
    const deliveredCards = orders.map((order, index) => ({order, index}))
      .filter(({order}) => String(order.estado || '').trim().toUpperCase() === 'ENTREGADO');
    if (deliveredCards.length) {
      try {
        const {data:deliveries,error:deliveryError} = await clientDb.rpc('cupissa_domicilios_entregas_cliente');
        if (deliveryError) throw deliveryError;
        const ids = Array.isArray(deliveries) ? deliveries :
          (typeof deliveries === 'string' ? JSON.parse(deliveries) : []);
        window.__cupissaDeliveryOrderIds = new Set(ids.map(row => String(row.pedido_id)));
        deliveredCards.forEach(({order,index}) => {
          if (!window.__cupissaDeliveryOrderIds.has(String(order.id))) return;
          const card = container.querySelectorAll('.profile-order-card')[index];
          if (!card || card.nextElementSibling?.classList.contains('cupissa-delivery-client-button')) return;
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'cupissa-delivery-client-button';
          button.innerHTML = '<i class="fa-solid fa-camera"></i> Ver entrega · Foto y firma';
          button.addEventListener('click', () => window.cupissaVerEntregaCliente(order.id));
          card.insertAdjacentElement('afterend', button);
        });
      } catch (error) {
        console.warn('[CUPISSA] No se pudieron comprobar las entregas:',error?.message||error);
        const note = document.createElement('p');
        note.className = 'cupissa-delivery-proof-notice';
        note.textContent = 'No se pudieron consultar los comprobantes de entrega. Actualiza la página o intenta más tarde.';
        container.appendChild(note);
      }
    }
  }

  /* ============================================================
     DETALLE DE PEDIDO
     ============================================================ */

  window.openProfileOrder = function (id) {
    const order = (window.__cupissaWebOrders || [])
      .find(item => String(item.id) === String(id));

    if (!order) return;

    const products = Array.isArray(order.productos)
      ? order.productos
      : [];

    const images = Array.isArray(order.imagenes)
      ? order.imagenes
      : [];

    $('profile-order-modal-title').textContent =
      order.codigo ||
      order.numero_pedido ||
      'Detalle del pedido';

    const fields = [
      ['Tipo', order.tipo_pedido || order.tipo_servicio],
      ['Fecha de entrega', order.fecha_entrega],
      ['Estado', order.estado],
      ['Total', money(order.total)],
      ['Domicilio / envío', money(order.envio ?? order.domicilio_envio)],
      ['Anticipo', money(order.anticipo)],
      ['Restante', money(order.restante)],
      ['Contacto', order.telefono || order.contacto],
      [
        'Ubicación',
        [
          order.direccion,
          order.barrio,
          order.ciudad
        ].filter(Boolean).join(', ') || order.ubicacion
      ]
    ];

    $('profile-order-detail').innerHTML = `
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
        ${fields.map(([label, value]) => `
          <div class="profile-field">
            <span>${safe(label)}</span>
            <strong>${safe(value || '—')}</strong>
          </div>
        `).join('')}
      </div>

      ${String(order.nota || '').trim() ? `
        <section class="profile-order-sticky-note profile-order-sticky-note-detail mb-5" aria-label="Nota de CUPISSA">
          <span><i class="fa-regular fa-note-sticky"></i> Nota de CUPISSA</span>
          <p>${safe(order.nota)}</p>
        </section>
      ` : ''}

      <h3 class="text-sm font-black text-slate-900 mb-3">
        Productos solicitados
      </h3>

      <div class="space-y-3">
        ${
          products.map((product, index) => {
            const productImage =
              product.imagen_url ||
              product.foto_url ||
              product.image_url ||
              product.imagen ||
              '';

            return `
              <div class="border border-slate-100 rounded-xl p-3 flex gap-3">
                ${
                  productImage
                    ? `
                      <img
                        src="${safe(productImage)}"
                        alt="Producto"
                        class="w-20 h-20 rounded-lg object-cover"
                      >
                    `
                    : ''
                }

                <div class="min-w-0 flex-1">
                  <p class="font-black text-sm text-slate-900">
                    ${index + 1}. ${safe(product.nombre || product.producto || 'Producto')}
                  </p>

                  <p class="text-xs text-slate-500 mt-1">
                    ${safe(product.referencia || '')}
                    · Talla: ${safe(product.talla || '—')}
                    · Color: ${safe(product.color || '—')}
                  </p>

                  <p class="text-xs text-slate-600 mt-1">
                    Cantidad: ${safe(product.cantidad || 1)}
                    · Precio: ${money(product.precio)}
                    ${
                      product.dias_alquiler
                        ? ` · Alquiler: ${safe(product.dias_alquiler)} día(s)`
                        : ''
                    }
                  </p>
                </div>
              </div>
            `;
          }).join('')
          || '<p class="text-xs text-slate-400">Sin detalle de productos.</p>'
        }
      </div>

      ${
        images.length
          ? `
            <h3 class="text-sm font-black text-slate-900 mt-5 mb-3">
              Fotografías del pedido
            </h3>

            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
              ${images.map(value => {
                const url = typeof value === 'string'
                  ? value
                  : value?.url || value?.imagen_url || '';

                return url ? `
                  <a href="${safe(url)}" target="_blank" rel="noopener">
                    <img
                      src="${safe(url)}"
                      alt="Fotografía del pedido"
                      class="w-full aspect-square object-cover rounded-xl"
                    >
                  </a>
                ` : '';
              }).join('')}
            </div>
          `
          : ''
      }
    `;

    if (String(order.estado||'').trim().toUpperCase()==='ENTREGADO'
        && window.__cupissaDeliveryOrderIds?.has(String(order.id))) {
      const b=document.createElement('button');b.type='button';
      b.className='cupissa-delivery-client-button';
      b.textContent='Ver entrega · Fotografía y firma del cliente';
      b.onclick=()=>window.cupissaVerEntregaCliente(order.id);
      $('profile-order-detail').appendChild(b);
    }
    $('profile-order-modal').classList.remove('hidden');
  };

  window.closeProfileOrder = function () {
    $('profile-order-modal')?.classList.add('hidden');
  };

  // Las URLs privadas expiran después de 5 minutos; se solicitan únicamente
  // cuando el cliente autenticado abre su propio comprobante.
  window.cupissaVerEntregaCliente=async function(pedidoId) {
    try {
      const {data,error}=await clientDb.functions.invoke('cupissa-domicilios',{
        body:{action:'view_delivery',pedido_id:String(pedidoId)}
      });
      if(error||!data?.ok) throw new Error(data?.error||error?.message||'No se pudo consultar la entrega.');
      document.getElementById('cupissa-delivery-client-proof')?.remove();
      const overlay=document.createElement('div');overlay.id='cupissa-delivery-client-proof';
      overlay.className='cupissa-delivery-client-overlay';
      overlay.innerHTML=`<div role="dialog" aria-modal="true" aria-label="Entrega de tu pedido" class="cupissa-delivery-client-panel"><button type="button" class="cupissa-delivery-client-close">Cerrar ×</button><h2>Tu pedido fue entregado</h2><p>Comprobante de entrega · ${safe(new Date(data.entregado_en).toLocaleString('es-CO'))}</p><h3>Fotografía de la entrega</h3><img src="${safe(data.foto_url)}" alt="Fotografía de la entrega"><h3>Firma del cliente</h3><img src="${safe(data.firma_url)}" alt="Firma del cliente"></div>`;
      overlay.querySelector('button').onclick=()=>overlay.remove();
      overlay.addEventListener('click',event=>{if(event.target===overlay)overlay.remove();});
      document.body.appendChild(overlay);
    }catch(error){alert('No pudimos mostrar tu comprobante de entrega: '+(error.message||error));}
  };

  /* ============================================================
     CERRAR SESIÓN
     ============================================================ */

  window.logoutProfile = async function () {
    try {
      await AUTH().signOut();
    } catch (error) {
      console.error('[CUPISSA CIERRE SESIÓN]', error);
    }

    currentClient = null;
    currentProfile = null;

    localStorage.removeItem('cupissa_client_session');

    showAuth();
    showAuthMode('login');

    $('profile-login-form')?.reset();
  };

  /* ============================================================
     VOLVER AL CATÁLOGO
     ============================================================ */

  window.returnToCatalog = function () {
    if (
      new URLSearchParams(location.search).get('embedded') === '1' &&
      window.parent !== window
    ) {
      window.parent.postMessage(
        { type: 'CUPISSA_PROFILE_CLOSE' },
        '*'
      );
    } else {
      location.href = '/catalogo';
    }
  };

  /* ============================================================
     NORMALIZAR CAMPOS
     ============================================================ */

  function configureInputs() {
    document.querySelectorAll(
      '#profile-register-form input:not([type="password"]):not([type="email"]), ' +
      '#profile-edit-form input:not([type="password"]):not([type="email"]), ' +
      '#profile-google-register-panel input:not([type="email"])'
    ).forEach(input => {
      input.setAttribute('autocapitalize', 'characters');

      input.addEventListener('input', () => {
        const start = input.selectionStart;
        const end = input.selectionEnd;

        input.value = input.value.toLocaleUpperCase('es-CO');

        try {
          input.setSelectionRange(start, end);
        } catch (_) {}
      });
    });

    document.querySelectorAll(
      '#profile-register-form input[type="email"], ' +
      '#profile-edit-form input[type="email"]'
    ).forEach(input => {
      input.setAttribute('autocapitalize', 'none');

      input.addEventListener('input', () => {
        const start = input.selectionStart;
        const end = input.selectionEnd;

        input.value = input.value.toLowerCase();

        try {
          input.setSelectionRange(start, end);
        } catch (_) {}
      });
    });

    document.querySelectorAll(
      '#profile-signup-otp-code, ' +
      '#profile-google-otp-code, ' +
      '#profile-recovery-code, ' +
      '#profile-email-otp-code'
    ).forEach(input => {
      input.addEventListener('input', () => {
        input.value = input.value.replace(/\D/g, '').slice(0, 6);
      });
    });
  }

  /* ============================================================
     INICIALIZACIÓN Y RETORNO DE GOOGLE
     ============================================================ */

  document.addEventListener('DOMContentLoaded', async () => {
    if (
      new URLSearchParams(location.search).get('embedded') === '1'
    ) {
      document.body.classList.add('profile-embedded');
    }

    configureInputs();

    // Ventana abierta desde el perfil integrado: empezar OAuth desde una
    // página principal, nunca desde el iframe (Google lo bloquea).
    const googlePopupIntent = new URLSearchParams(location.search).get('cupissa_google_popup');
    if (googlePopupIntent === 'login' || googlePopupIntent === 'register') {
      if (window.self !== window.top) {
        startGoogleFromProfile(googlePopupIntent);
        return;
      }
      const redirect = new URL('/perfil/', location.origin);
      redirect.searchParams.set('cupissa_google_return', '1');
      if (new URLSearchParams(location.search).get('cupissa_mobile_return') === '1') redirect.searchParams.set('cupissa_mobile_return', '1');
      if (new URLSearchParams(location.search).get('next') === 'checkout') redirect.searchParams.set('next', 'checkout');
      try {
        await AUTH().signInGoogle(googlePopupIntent, redirect.toString());
      } catch (error) {
        showMessage('profile-login-error', friendlyError(error));
      }
      return;
    }

    if (!clientDb || !AUTH()) {
      console.error(
        '[CUPISSA] No se inicializó Supabase o CUPISSAAuth.'
      );

      showMessage(
        'profile-login-error',
        'No pudimos conectar con el servicio. Inténtalo nuevamente más tarde.'
      );

      return;
    }

    try {
      const googleProcessed = await processGoogleReturn();

      if (googleProcessed) return;

      const linked = await AUTH().getLinkedAccount();

      if (linked?.client) {
        await loadProfile(linked.client);
        return;
      }

      if (linked?.user) {
        showAuth();
        showPanel('profile-google-register-panel');
        googleOtpVerified = true;
        $('google-reg-email').value = cleanEmail(linked.user.email);

        const metadata = linked.user.user_metadata || {};
        const parsed = splitName(
          metadata.full_name || metadata.name || ''
        );

        $('google-reg-nombres').value =
          metadata.nombres ||
          metadata.given_name ||
          parsed.nombres;

        $('google-reg-apellidos').value =
          metadata.apellidos ||
          metadata.family_name ||
          parsed.apellidos;

        $('google-reg-telefono').value =
          metadata.telefono || '';

        return;
      }

    } catch (error) {
      console.error(
        '[CUPISSA] No se pudo restaurar la sesión:',
        error
      );
    }

    localStorage.removeItem('cupissa_client_session');

    showAuth();

    const requestedMode =
      new URLSearchParams(location.search).get('mode');

    showAuthMode(
      requestedMode === 'register'
        ? 'register'
        : 'login'
    );
  });

})();

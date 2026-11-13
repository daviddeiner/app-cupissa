
/* ============================================================
   CUPISSA AUTH
   Autenticación centralizada para Perfil y Portal de Pagos.
   Requiere:
   - supabase-config.js
   - Supabase JS v2
   ============================================================ */

(function () {
  'use strict';

  const db =
    window.supabaseClient ||
    (typeof supabaseClient !== 'undefined' ? supabaseClient : null);

  if (!db) {
    console.error('[CUPISSA AUTH] No se encontró el cliente Supabase.');
    return;
  }

  const REDIRECT_URL = new URL('/perfil/', window.location.origin).toString();

  const DUPLICATE_PHONE =
    'Este teléfono ya está registrado. Inicia sesión con tu correo o utiliza otro número.';

  function cleanEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  function cleanPhone(phone) {
    return String(phone || '').trim().replace(/\s+/g, '');
  }

  function cleanName(name) {
    return String(name || '').trim().toLocaleUpperCase('es-CO');
  }

  function friendlyError(error) {
    const message = String(
      error?.message ||
      error?.details ||
      error?.hint ||
      ''
    ).toLowerCase();

    const code = String(error?.code || '').toLowerCase();

    if (
      message.includes('phone') ||
      message.includes('telefono') ||
      message.includes('teléfono') ||
      message.includes('duplicate key') ||
      code === '23505'
    ) {
      return DUPLICATE_PHONE;
    }

    if (
      message.includes('user already registered') ||
      message.includes('already registered') ||
      message.includes('already exists')
    ) {
      return 'Este correo ya está registrado. Inicia sesión con tu código de acceso.';
    }

    if (
      message.includes('invalid login credentials') ||
      message.includes('invalid credentials')
    ) {
      return 'No fue posible validar el acceso. Comprueba el correo e inténtalo nuevamente.';
    }

    if (
      message.includes('email not confirmed')
    ) {
      return 'Debes verificar tu correo electrónico antes de ingresar.';
    }

    if (
      message.includes('expired') ||
      message.includes('otp_expired') ||
      message.includes('token has expired')
    ) {
      return 'El código ha vencido. Solicita uno nuevo.';
    }

    if (
      message.includes('invalid otp') ||
      message.includes('token is invalid') ||
      message.includes('invalid token')
    ) {
      return 'El código ingresado no es correcto. Verifícalo e inténtalo nuevamente.';
    }

    if (
      message.includes('rate limit') ||
      message.includes('too many requests')
    ) {
      return 'Has solicitado varios códigos. Espera unos minutos e inténtalo nuevamente.';
    }

    if (
      message.includes('password should be at least') ||
      message.includes('weak password')
    ) {
      return 'La contraseña debe tener al menos 6 caracteres.';
    }

    if (
      message.includes('email') &&
      (
        message.includes('valid') ||
        message.includes('format')
      )
    ) {
      return 'Escribe un correo electrónico válido.';
    }

    if (message.includes('smtp') || message.includes('535') || message.includes('username and password not accepted') || message.includes('error sending') || message.includes('sending email')) {
      return 'Supabase no pudo enviar el código por correo (SMTP). Revisa Authentication → SMTP Settings. Detalle: ' + (error?.message || 'Error de envío');
    }
    if (message.includes('email rate limit exceeded')) {
      return 'Supabase alcanzó el límite de envío de correos. Intenta nuevamente cuando se restablezca el límite.';
    }
    return error?.message ? `Supabase: ${error.message}${error?.code ? ' (' + error.code + ')' : ''}` : 'No fue posible conectar con Supabase Authentication. Revisa la conexión.';
  }

  function throwFriendly(error) {
    console.error('[CUPISSA AUTH]', error);
    const friendly = new Error(friendlyError(error));
    friendly.originalError = error;
    throw friendly;
  }

  function validateEmail(email) {
    const value = cleanEmail(email);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      throw new Error('Escribe un correo electrónico válido.');
    }

    return value;
  }

  function validateOtp(code) {
    const value = String(code || '').trim();

    if (!/^\d{6}$/.test(value)) {
      throw new Error('Escribe el código de seis dígitos que recibiste.');
    }

    return value;
  }

  /* ============================================================
     USUARIO ACTUAL
     ============================================================ */

  async function getCurrentUser() {
    const { data: sessionData, error: sessionError } = await db.auth.getSession();
    if (sessionError) throwFriendly(sessionError);
    if (!sessionData?.session) return null;
    const { data, error } = await db.auth.getUser();
    if (error?.name === 'AuthSessionMissingError') return null;
    if (error) throwFriendly(error);
    return data?.user || null;
  }

  /* ============================================================
     CUENTA CUPISSA VINCULADA
     ============================================================ */

  async function getLinkedAccount() {
    const user = await getCurrentUser();
    if (!user) return null;

    // RPC SECURITY DEFINER vincula clientes_web con el cliente legado por correo.
    // Si aún no está instalada, se intenta la resolución directa como respaldo.
    try {
      const resolved = await db.rpc('cupissa_resolve_my_account');
      if (!resolved.error && resolved.data) {
        const payload = resolved.data;
        if (payload.client) {
          const profileEmail = cleanEmail(payload.profile?.correo || user.email);
          return {
            user,
            profile: payload.profile || null,
            client: { ...payload.client, correo: cleanEmail(payload.client.correo || profileEmail) }
          };
        }
        if (payload.profile || payload.client === null) {
          return { user, profile: payload.profile || null, client: null };
        }
      }
    } catch (error) {
      console.warn('[CUPISSA AUTH] RPC de vinculación no disponible; se intentará resolver por correo.', error);
    }

    const email = cleanEmail(user.email);
    let profile = null;
    const byAuth = await db.from('clientes_web').select('*').eq('auth_user_id', user.id).limit(1).maybeSingle();
    if (byAuth.error) throwFriendly(byAuth.error);
    profile = byAuth.data;

    if (!profile && email) {
      const byEmail = await db.from('clientes_web').select('*').ilike('correo', email).limit(1).maybeSingle();
      if (byEmail.error) throwFriendly(byEmail.error);
      profile = byEmail.data;
    }

    let client = null;
    if (profile?.cliente_id) {
      const result = await db.from('clientes').select('*').eq('id', profile.cliente_id).limit(1).maybeSingle();
      if (result.error) throwFriendly(result.error);
      client = result.data;
    }

    if (!client && email) {
      const result = await db.from('clientes').select('*').ilike('correo', email).limit(1).maybeSingle();
      if (result.error) throwFriendly(result.error);
      client = result.data;
    }

    if (!client && profile?.telefono) {
      const result = await db.from('clientes').select('*').eq('telefono', cleanPhone(profile.telefono)).limit(1).maybeSingle();
      if (result.error) throwFriendly(result.error);
      client = result.data;
    }

    if (!client) return { user, profile: profile || null, client: null };

    const nameParts = String(client.nombre || '').trim().split(/\s+/).filter(Boolean);
    const patch = {
      auth_user_id: user.id,
      cliente_id: client.id,
      correo: email || profile?.correo || client.correo || '',
      telefono: profile?.telefono || client.telefono || ''
    };

    if (profile) {
      const updated = await db.from('clientes_web').update(patch).eq('id', profile.id).select('*').maybeSingle();
      if (!updated.error && updated.data) profile = updated.data;
      else if (updated.error) console.warn('[CUPISSA AUTH] No se pudo actualizar el vínculo del perfil:', updated.error);
    } else {
      const inserted = await db.from('clientes_web').insert([{
        ...patch,
        nombres: nameParts.shift() || 'CLIENTE',
        apellidos: nameParts.join(' '),
        direccion: '', barrio: '', ciudad: ''
      }]).select('*').maybeSingle();
      if (!inserted.error) profile = inserted.data;
      else console.warn('[CUPISSA AUTH] No se pudo crear el perfil web:', inserted.error);
    }

    return {
      user,
      profile,
      client: { ...client, correo: cleanEmail(client.correo || profile?.correo || email) }
    };
  }

  /* ============================================================
     COMPROBAR TELÉFONO REGISTRADO
     ============================================================ */

  // Las políticas RLS de clientes y clientes_web impiden consultar datos
  // privados antes de autenticar. Por tanto, estas validaciones solo se
  // ejecutan DESPUÉS de acreditar la propiedad del correo mediante OTP.
  async function checkPhoneAvailable(phone) {
    const telefono = cleanPhone(phone);
    if (!telefono) throw new Error('Ingresa tu número de teléfono.');
    const user = await getCurrentUser();
    if (!user) throw new Error('Primero verifica el código enviado a tu correo.');
    const { data, error } = await db.rpc('cupissa_check_registration_contact', { p_telefono: telefono });
    if (error) throwFriendly(error);
    if (data?.phone_used_by_other) throw new Error(DUPLICATE_PHONE);
    if (data?.email_existing) throw new Error('Este correo ya existe en CUPISSA pero su perfil aún no está vinculado. Inicia sesión o solicita que se vincule tu cuenta; no se crearán datos duplicados.');
    return true;
  }

  async function checkEmailAvailable(email) {
    const correo = validateEmail(email);
    const user = await getCurrentUser();
    if (!user || cleanEmail(user.email) !== correo) {
      throw new Error('Primero verifica tu correo mediante el código OTP.');
    }
    const { data, error } = await db.rpc('cupissa_check_registration_contact', { p_telefono: null });
    if (error) throwFriendly(error);
    return !data?.email_existing;
  }

  /* ============================================================
     REGISTRO TRADICIONAL
     Crea el usuario Auth y envía OTP de registro.
     El cliente CUPISSA se crea DESPUÉS de verificar el OTP.
     ============================================================ */

  async function signUp({
    email,
    nombres,
    apellidos,
    telefono
  }) {
    const correo = validateEmail(email);
    const celular = cleanPhone(telefono);

    if (!cleanName(nombres)) {
      throw new Error('Ingresa tus nombres.');
    }

    if (!cleanName(apellidos)) {
      throw new Error('Ingresa tus apellidos.');
    }

    if (!celular) {
      throw new Error('Ingresa tu número de teléfono.');
    }

    // No consultar tablas protegidas antes del OTP. Supabase reconoce
    // tanto cuentas confirmadas como cuentas Auth invitadas pendientes.
    const { data, error } = await db.auth.signInWithOtp({
      email: correo,
      options: { shouldCreateUser: true, emailRedirectTo: REDIRECT_URL,
        data: { nombres: cleanName(nombres), apellidos: cleanName(apellidos), telefono: celular, cupissa_registration: true }
      }
    });

    if (error) throwFriendly(error);

    return {
      user: data.user,
      session: data.session,
      email: correo,
      telefono: celular,
      nombres: cleanName(nombres),
      apellidos: cleanName(apellidos),
      otpRequired: true
    };
  }

  /* ============================================================
     VERIFICAR OTP DE REGISTRO
     ============================================================ */

  async function verifySignupOtp(email, code) {
    const correo = validateEmail(email);
    const token = validateOtp(code);

    const { data, error } = await db.auth.verifyOtp({
      email: correo,
      token,
      type: 'email'
    });

    if (error) throwFriendly(error);

    return data;
  }

  /* ============================================================
     REENVIAR OTP DE REGISTRO
     ============================================================ */

  async function resendSignupOtp(email) {
    const correo = validateEmail(email);

    const { data, error } = await db.auth.signInWithOtp({
      email: correo,
      options: { shouldCreateUser: false, emailRedirectTo: REDIRECT_URL }
    });

    if (error) throwFriendly(error);

    return data;
  }

  /* ============================================================
     CREAR CLIENTE CUPISSA DESPUÉS DE VERIFICAR OTP
     Requiere RPC cupissa_create_new_client.
     ============================================================ */

  async function createNewClient({
    telefono,
    nombres,
    apellidos
  }) {
    const celular = cleanPhone(telefono);

    const { data, error } = await db.rpc(
      'cupissa_create_new_client',
      {
        p_telefono: celular,
        p_nombres: cleanName(nombres),
        p_apellidos: cleanName(apellidos)
      }
    );

    if (error) throwFriendly(error);

    if (data?.ok === false) {
      throw new Error(
        data.message || 'No fue posible crear tu cuenta CUPISSA.'
      );
    }

    return data;
  }

  /* ============================================================
     INICIAR SESIÓN CON CORREO (CÓDIGO OTP, SIN CONTRASEÑA)
     ============================================================ */

  async function sendEmailLoginOtp(email, redirectTo = REDIRECT_URL) {
    const correo = validateEmail(email);
    // Supabase entrega el mismo OTP a cualquier proveedor de correo válido.
    // No se filtra por dominio (Gmail, Hotmail/Outlook, Yahoo o correo corporativo).
    const { data, error } = await db.auth.signInWithOtp({
      email: correo,
      options: {
        shouldCreateUser: true, // El usuario se vincula solo tras comprobar el correo y perfil.
        emailRedirectTo: redirectTo || REDIRECT_URL
      }
    });
    if (error) throwFriendly(error);
    return data;
  }

  async function verifyEmailLoginOtp(email, code) {
    const correo = validateEmail(email);
    const token = validateOtp(code);
    const { data, error } = await db.auth.verifyOtp({ email: correo, token, type: 'email' });
    if (error) throwFriendly(error);
    if (data?.user && cleanEmail(data.user.email) !== correo) {
      await db.auth.signOut();
      throw new Error('Este correo ya no corresponde a la cuenta. Utiliza el correo actualizado.');
    }
    return data;
  }

  /* ============================================================
     INICIAR SESIÓN LEGADO (se conserva para compatibilidad)
     ============================================================ */

  async function signIn(email, password) {
    const correo = validateEmail(email);

    if (!password) {
      throw new Error('Ingresa tu contraseña.');
    }

    const { data, error } = await db.auth.signInWithPassword({
      email: correo,
      password: String(password)
    });

    if (error) throwFriendly(error);

    return data;
  }

  /* ============================================================
     GOOGLE: INICIAR AUTENTICACIÓN
     ============================================================ */

  async function signInGoogle(intent = 'login', redirectTo = REDIRECT_URL) {
    const validIntent = intent === 'register' ? 'register' : 'login';

    sessionStorage.setItem(
      'cupissa_google_intent',
      validIntent
    );

    const { data, error } = await db.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectTo || REDIRECT_URL,
        queryParams: {
          access_type: 'offline',
          prompt: 'select_account'
        }
      }
    });

    if (error) throwFriendly(error);

    return data;
  }

  async function signUpGoogle() {
    return signInGoogle('register');
  }

  function getGoogleIntent() {
    return sessionStorage.getItem('cupissa_google_intent') || '';
  }

  function clearGoogleIntent() {
    sessionStorage.removeItem('cupissa_google_intent');
  }

  async function getGoogleUserData() {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error('No se pudo recuperar tu cuenta de Google.');
    }

    const metadata = user.user_metadata || {};

    return {
      user,
      email: cleanEmail(user.email),
      nombres: cleanName(
        metadata.full_name ||
        metadata.name ||
        metadata.given_name ||
        ''
      ),
      apellidos: cleanName(
        metadata.family_name || ''
      )
    };
  }

  /* ============================================================
     GOOGLE: ENVIAR SEGUNDO OTP
     Este paso es obligatorio para el registro CUPISSA con Google.
     ============================================================ */

  async function sendGoogleRegistrationOtp(email) {
    const correo = validateEmail(email);

    const user = await getCurrentUser();

    if (!user || cleanEmail(user.email) !== correo) {
      throw new Error(
        'No pudimos validar tu cuenta de Google. Inténtalo nuevamente.'
      );
    }

    const { data, error } = await db.auth.signInWithOtp({
      email: correo,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: REDIRECT_URL,
        data: {
          cupissa_google_registration: true
        }
      }
    });

    if (error) throwFriendly(error);

    return data;
  }

  /* ============================================================
     GOOGLE: VERIFICAR SEGUNDO OTP
     ============================================================ */

  async function verifyGoogleRegistrationOtp(email, code) {
    const correo = validateEmail(email);
    const token = validateOtp(code);

    const { data, error } = await db.auth.verifyOtp({
      email: correo,
      token,
      type: 'email'
    });

    if (error) throwFriendly(error);

    return data;
  }

  /* ============================================================
     RECUPERAR CUENTA ANTIGUA
     Vincula el usuario autenticado con el cliente anterior.
     ============================================================ */

  async function linkLegacyAccount({
    telefono,
    password,
    nombres,
    apellidos
  }) {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error(
        'Primero debes iniciar sesión con tu correo electrónico.'
      );
    }

    const celular = cleanPhone(telefono);

    if (!celular || !password) {
      throw new Error(
        'Completa el teléfono y la contraseña de tu cuenta anterior.'
      );
    }

    const { data, error } = await db.rpc(
      'cupissa_link_legacy_account',
      {
        p_telefono: celular,
        p_password_anterior: String(password),
        p_nombres: cleanName(nombres),
        p_apellidos: cleanName(apellidos)
      }
    );

    if (error) throwFriendly(error);

    if (data?.ok === false) {
      throw new Error(
        data.message ||
        'No fue posible vincular tu cuenta anterior. Verifica tus datos.'
      );
    }

    return data;
  }

  /* ============================================================
     RECUPERACIÓN DE CONTRASEÑA POR OTP
     ============================================================ */

  async function sendPasswordRecoveryOtp(email) {
    const correo = validateEmail(email);

    const { data, error } = await db.auth.resetPasswordForEmail(
      correo,
      {
        redirectTo: REDIRECT_URL
      }
    );

    if (error) throwFriendly(error);

    return data;
  }

  async function verifyPasswordRecoveryOtp(email, code) {
    const correo = validateEmail(email);
    const token = validateOtp(code);

    const { data, error } = await db.auth.verifyOtp({
      email: correo,
      token,
      type: 'recovery'
    });

    if (error) throwFriendly(error);

    return data;
  }

  async function updatePassword(password) {
    if (!password || String(password).length < 6) {
      throw new Error(
        'La nueva contraseña debe tener al menos 6 caracteres.'
      );
    }

    const { data, error } = await db.auth.updateUser({
      password: String(password)
    });

    if (error) throwFriendly(error);

    return data;
  }

  /* ============================================================
     CAMBIO DE CORREO CON OTP
     ============================================================ */

  async function sendEmailChangeOtp(newEmail) {
    const correo = validateEmail(newEmail);

    const user = await getCurrentUser();

    if (!user) {
      throw new Error(
        'Debes iniciar sesión para cambiar tu correo.'
      );
    }

    if (cleanEmail(user.email) === correo) {
      throw new Error(
        'Este ya es el correo asociado a tu cuenta.'
      );
    }

    const { data, error } = await db.auth.updateUser({
      email: correo
    });

    if (error) throwFriendly(error);

    return data;
  }

  // Al cambiar el correo, una identidad Google con la dirección anterior
  // no debe seguir ligada a la misma ficha de cliente.
  async function unlinkOutdatedGoogleIdentities(currentEmail) {
    const { data, error } = await db.auth.getUserIdentities();
    if (error) throwFriendly(error);
    let identities = data?.identities || [];
    for (const identity of identities.filter(i => i.provider === 'google')) {
      const identityEmail = cleanEmail(identity.identity_data?.email || identity.email);
      if (!identityEmail || identityEmail === cleanEmail(currentEmail)) continue;
      if (identities.length < 2) {
        throw new Error('El correo se actualizó, pero falta desvincular el acceso anterior de Google. Contacta al equipo CUPISSA para completar la desvinculación.');
      }
      const removal = await db.auth.unlinkIdentity(identity);
      if (removal.error) throwFriendly(removal.error);
      identities = identities.filter(i => i.id !== identity.id);
    }
    return true;
  }

  // Se llama únicamente después de volver de Google. Si Google pertenece a
  // un correo anterior, se cierra la sesión antes de cargar datos del cliente.
  async function verifyGoogleEmailIsCurrent() {
    const { data, error } = await db.auth.getUser();
    if (error) throwFriendly(error);
    const current = data?.user;
    if (!current) return false;
    const email = cleanEmail(current.email);
    const { data: identitiesData, error: identitiesError } = await db.auth.getUserIdentities();
    if (identitiesError) throwFriendly(identitiesError);
    const identities = identitiesData?.identities || [];
    const googleIds = identities.filter(i => i.provider === 'google');
    // Solo se invoca tras un retorno OAuth explícito.
    const stale = googleIds.filter(i => {
      const address = cleanEmail(i.identity_data?.email || i.email);
      return address && email && address !== email;
    });
    if (!stale.length) return true;
    try { await unlinkOutdatedGoogleIdentities(email); }
    catch (e) { console.warn('[CUPISSA] Google anterior pendiente de desvincular',e); }
    await db.auth.signOut();
    return false;
  }

  async function verifyEmailChangeOtp(email, code) {
    const correo = validateEmail(email);
    const token = validateOtp(code);

    // Un OTP aceptado no significa necesariamente que Supabase ya haya
    // cambiado el correo (puede estar pendiente una segunda confirmación).
    const { error } = await db.auth.verifyOtp({
      email: correo,
      token,
      type: 'email_change'
    });
    if (error) throwFriendly(error);

    let { data: current, error: userError } = await db.auth.getUser();
    if (userError) throwFriendly(userError);
    if (cleanEmail(current?.user?.email) !== correo) {
      const refreshed = await db.auth.refreshSession();
      if (refreshed.error) throwFriendly(refreshed.error);
      const latest = await db.auth.getUser();
      if (latest.error) throwFriendly(latest.error);
      current = latest.data;
    }
    if (cleanEmail(current?.user?.email) !== correo) {
      throw new Error('El código fue recibido, pero Supabase aún no confirmó el cambio de correo. Revisa si falta confirmar el mensaje enviado al correo anterior y vuelve a entrar al perfil.');
    }

    // Esta RPC es SECURITY DEFINER y sincroniza las dos fichas del cliente.
    // No confirmamos visualmente el cambio si dicha sincronización falla.
    const sync = await db.rpc('cupissa_sync_my_email');
    if (sync.error || sync.data !== true) {
      console.error('[CUPISSA AUTH] Sincronización de correo:', sync.error || sync.data);
      throw new Error('El correo ya cambió en Authentication, pero falta sincronizar las fichas de CUPISSA. Solicita al equipo que revise la sincronización antes de continuar.');
    }
    await unlinkOutdatedGoogleIdentities(correo);
    return { user: current.user, email: correo };
  }

  /* ============================================================
     CERRAR SESIÓN
     ============================================================ */

  async function signOut() {
    const { error } = await db.auth.signOut();

    if (error) throwFriendly(error);

    localStorage.removeItem('cupissa_client_session');
    sessionStorage.removeItem('cupissa_google_intent');

    return true;
  }

  /* ============================================================
     EXPORTAR FUNCIONES
     ============================================================ */

  window.CUPISSAAuth = {
    getCurrentUser,
    getLinkedAccount,

    checkPhoneAvailable,
    checkEmailAvailable,

    signUp,
    verifySignupOtp,
    resendSignupOtp,
    createNewClient,

    signIn,
    sendEmailLoginOtp,
    verifyEmailLoginOtp,

    signInGoogle,
    signUpGoogle,
    getGoogleIntent,
    clearGoogleIntent,
    getGoogleUserData,
    sendGoogleRegistrationOtp,
    verifyGoogleRegistrationOtp,

    linkLegacyAccount,

    sendPasswordRecoveryOtp,
    verifyPasswordRecoveryOtp,
    updatePassword,

    sendEmailChangeOtp,
    verifyEmailChangeOtp,
    verifyGoogleEmailIsCurrent,

    signOut,

    friendlyError
  };

  console.info('[CUPISSA AUTH] Sistema de autenticación cargado.');
})();

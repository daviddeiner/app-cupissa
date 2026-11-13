/**
 * CUPISSA | Portal de pagos / servicio de pago con Wompi
 * Usa la Edge Function propia de créditos (credit-payments), con las
 * acciones propias del crédito: create_credit_payment y confirm_credit_payment.
 * El navegador no modifica créditos: el servidor verifica con Wompi y aplica.
 *
 * Orden de carga: 02-date-and-late-fees.js -> 04-checkout.js -> este archivo.
 */
(function (global) {
  'use strict';

  const EDGE_FUNCTION = 'credit-payments';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  /** Llama a la función y devuelve el motivo real del error (no el genérico de supabase-js). */
  async function callEdge(body) {
    if (typeof supabaseClient === 'undefined' || !supabaseClient?.functions?.invoke) {
      throw new Error('No está disponible la conexión con el servidor de CUPISSA.');
    }

    const { data, error } = await supabaseClient.functions.invoke(
      EDGE_FUNCTION,
      { body }
    );

    if (data?.error) throw new Error(String(data.error));

    if (error) {
      let detail = '';
      try {
        const payload = await error.context?.json?.();
        detail = payload?.error || payload?.message || '';
      } catch (_) {}
      console.error('[CUPISSA] Error de la función de pagos:', error, detail);
      throw new Error(detail || 'No fue posible comunicarse con el servidor de pagos.');
    }

    if (!data || typeof data !== 'object') {
      throw new Error('El servidor de CUPISSA devolvió una respuesta vacía.');
    }

    return data;
  }

  /**
   * Pide al servidor la referencia, el monto y la firma; abre el widget de Wompi
   * y devuelve la transacción que reporta el widget.
   */
  async function payWithWompi({ amount, paymentType, client }) {
    if (!client?.id || !client?.password) {
      throw new Error('Tu cuenta está autenticada, pero el registro de crédito no tiene la credencial heredada que requiere actualmente la función segura de pagos. Contacta a CUPISSA para actualizar la vinculación.');
    }

    const prepared = await callEdge({
      action: 'create_credit_payment',
      clientId: String(client.id),
      clientPassword: String(client.password),
      paymentType: paymentType === 'tot' ? 'tot' : 'min',
      // Informativo: el servidor calcula el valor real.
      amount: Number(amount)
    });

    if (
      !prepared.reference ||
      !prepared.amountInCents ||
      !prepared.publicKey ||
      !prepared.signature
    ) {
      throw new Error('El servidor no devolvió los datos necesarios para abrir Wompi.');
    }

    const transaction = await global.CUPISSA_WOMPI.openCheckout(prepared, client);

    // El widget responde en camelCase (amountInCents). Se agrega el alias
    // amount_in_cents que usa la validación de 08-payment-gateway.js.
    const normalized = { ...transaction };
    if (normalized.amount_in_cents == null && normalized.amountInCents != null) {
      normalized.amount_in_cents = normalized.amountInCents;
    }

    return {
      reference: String(prepared.reference),
      amount: Number(prepared.amount ?? amount),
      amountInCents: Number(prepared.amountInCents),
      transaction: normalized
    };
  }

  /**
   * Pide al servidor confirmar el pago. Reintenta mientras Wompi lo tenga PENDING.
   * pending = { reference, transactionId, clientId }
   */
  async function confirmCreditPayment(pending, options = {}) {
    const attempts = Math.max(1, Number(options.attempts || 8));
    const delay = Number(options.delay || 2500);

    const session = (() => {
      try { return JSON.parse(localStorage.getItem('cupissa_client_session') || 'null'); }
      catch (_) { return null; }
    })();

    const clientPassword = String(
      (typeof currentClient !== 'undefined' ? currentClient?.password : '') || session?.password || ''
    );

    if (!clientPassword) {
      throw new Error('Tu sesión expiró. Ingresa nuevamente al Portal de Pagos.');
    }

    let last = { status: 'PENDING' };

    for (let attempt = 1; attempt <= attempts; attempt++) {
      last = await callEdge({
        action: 'confirm_credit_payment',
        clientId: String(pending.clientId),
        clientPassword,
        reference: String(pending.reference),
        transactionId: String(pending.transactionId)
      });

      const status = String(last.status || '').toUpperCase();
      if (status !== 'PENDING') return last;
      if (attempt < attempts) await sleep(delay);
    }

    return last;
  }

  global.payWithWompi = payWithWompi;
  global.confirmCreditPayment = confirmCreditPayment;
})(window);
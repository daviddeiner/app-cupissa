/**
 * CUPISSA | Wompi Checkout
 * La firma y la referencia son generadas por Supabase.
 * No almacenar claves privadas ni secretos de integridad aquí.
 */
(function (global) {
  'use strict';

  const CURRENCY = 'COP';

  function openCheckout(payment, customer = {}) {
    return new Promise((resolve, reject) => {
      if (typeof global.WidgetCheckout !== 'function') {
        reject(new Error(
          'No se cargó Wompi. Recarga la página e inténtalo nuevamente.'
        ));
        return;
      }

      const amountInCents = Number(payment?.amountInCents);
      const reference = String(payment?.reference || '');
      const publicKey = String(payment?.publicKey || '');
      const signature = String(payment?.signature || '');

      if (
        !Number.isSafeInteger(amountInCents) ||
        amountInCents <= 0 ||
        !reference ||
        !publicKey ||
        !signature
      ) {
        reject(new Error(
          'El servidor no devolvió los datos necesarios para iniciar el pago.'
        ));
        return;
      }

      const phone = String(
        customer.telefono || customer.phoneNumber || ''
      ).replace(/\D/g, '').replace(/^57/, '');

      const fullName = String(
        customer.fullName ||
        [customer.nombres, customer.apellidos].filter(Boolean).join(' ') ||
        customer.nombre ||
        'Cliente CUPISSA'
      ).trim();

      const email = String(
        customer.correo || customer.email || ''
      ).trim();

      try {
        const checkout = new global.WidgetCheckout({
          currency: payment.currency || CURRENCY,
          amountInCents,
          reference,
          publicKey,
          signature: {
            integrity: signature
          },
          customerData: {
            email,
            fullName,
            phoneNumber: phone,
            phoneNumberPrefix: '+57'
          }
        });

        checkout.open(result => {
          const transaction =
            result?.transaction ||
            (result?.id ? result : null);

          if (!transaction?.id) {
            // El cliente cerró la ventana sin pagar.
            const closed = new Error(
              'Cerraste la ventana de pago. Si no completaste el pago, no se realizó ningún cobro.'
            );
            closed.code = 'WIDGET_CLOSED';
            reject(closed);
            return;
          }

          resolve(transaction);
        });
      } catch (error) {
        reject(error instanceof Error
          ? error
          : new Error('No fue posible abrir Wompi.'));
      }
    });
  }

  global.CUPISSA_WOMPI = Object.freeze({
    openCheckout
  });
})(window);
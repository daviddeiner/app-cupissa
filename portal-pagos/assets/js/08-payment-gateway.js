/**
 * CUPISSA | Portal de pagos / apertura de Wompi y confirmación.
 * El navegador NO modifica créditos: el servidor verifica el pago con Wompi
 * y aplica el abono. Aquí solo se abre el widget y se consulta el resultado.
 */

const PENDING_CREDIT_KEY = 'cupissa_pending_credit_payment';
let recoveringCreditPayment = false;

function savePendingCreditPayment(data) {
    try { localStorage.setItem(PENDING_CREDIT_KEY, JSON.stringify(data)); } catch (_) {}
}

function clearPendingCreditPayment() {
    try { localStorage.removeItem(PENDING_CREDIT_KEY); } catch (_) {}
}

/** Muestra el resultado y refresca el panel. Devuelve true si el pago quedó aplicado. */
async function handleCreditPaymentResult(result) {
    const status = String(result?.status || 'PENDING').toUpperCase();

    if (status === 'APPROVED') {
        clearPendingCreditPayment();
        try {
            await loadClientDashboard();
        } catch (refreshError) {
            console.warn('El abono quedó aplicado, pero no se pudo refrescar el panel:', refreshError);
        }
        showToast(result.duplicate
            ? 'Este pago ya estaba aplicado. Tu crédito está actualizado.'
            : '¡Pago aprobado! Tu abono se aplicó y se actualizó tu próxima fecha de pago.', false);
        return true;
    }

    if (status === 'PENDING') {
        showToast('Estamos verificando tu pago con Wompi. No pagues de nuevo: recarga el portal en unos minutos.', true);
        return false;
    }

    clearPendingCreditPayment();
    showToast(`El pago no fue aprobado por Wompi (${status}). Tu crédito no se modificó.`, true);
    return false;
}

/** Si quedó un pago sin confirmar (cierre de pestaña, falla de red), lo reintenta sin cobrar otra vez. */
async function recoverApprovedCreditPayment() {
    if (recoveringCreditPayment) return false;

    let pending = null;
    try {
        pending = JSON.parse(localStorage.getItem(PENDING_CREDIT_KEY) || 'null');
    } catch (_) {}

    if (!pending?.transactionId || !pending?.reference) return false;
    if (!currentClient?.id || String(currentClient.id) !== String(pending.clientId)) return false;

    recoveringCreditPayment = true;
    try {
        const result = await confirmCreditPayment(pending, { attempts: 1 });
        return await handleCreditPaymentResult(result);
    } catch (error) {
        console.error('No fue posible confirmar el pago pendiente:', error);
        showToast('No pudimos confirmar tu pago todavía. Recarga el portal para reintentar; no es necesario pagar de nuevo.', true);
        return false;
    } finally {
        recoveringCreditPayment = false;
    }
}

async function openPaymentGateway() {
    const amountToPay = selectedOption === 'min'
        ? Math.min(Number(minAmountWithMora), Number(totalAmount))
        : Number(totalAmount);

    if (!currentClient || !currentClient.id) {
        showToast('Tu sesión expiró. Ingresa nuevamente al Portal de Pagos.', true);
        return;
    }
    if (!Number.isFinite(amountToPay) || amountToPay <= 0) {
        showToast('No tienes deudas pendientes por pagar.', true);
        return;
    }

    const button = document.querySelector('button[onclick="openPaymentGateway()"]');
    if (button?.dataset.processing === '1') return;
    if (button) {
        button.dataset.processing = '1';
        button.disabled = true;
        button.classList.add('opacity-70', 'cursor-wait');
        const text = document.getElementById('btn-pay-text');
        if (text) text.innerText = 'Abriendo Wompi...';
    }

    let pending = null;
    try {
        const payment = await payWithWompi({
            amount: amountToPay,
            paymentType: selectedOption,
            client: currentClient
        });
        const transaction = payment.transaction;

        if (
            String(transaction.reference || '') !== payment.reference ||
            Number(transaction.amount_in_cents) !== payment.amountInCents ||
            String(transaction.currency || 'COP') !== 'COP'
        ) {
            throw new Error('Los datos de la transacción no coinciden con el pago solicitado. Contacta a CUPISSA antes de pagar de nuevo.');
        }

        // Se guarda ya: si algo falla después, el pago se puede confirmar sin cobrar otra vez.
        pending = {
            reference: payment.reference,
            transactionId: String(transaction.id),
            clientId: String(currentClient.id),
            createdAt: new Date().toISOString(),
            amount: Number(payment.amount || 0),
            amountInCents: Number(payment.amountInCents || 0)
        };
        savePendingCreditPayment(pending);

        if (button) {
            const text = document.getElementById('btn-pay-text');
            if (text) text.innerText = 'Verificando tu pago...';
        }

        // La página de resultado consulta al servidor y muestra éxito, rechazo o pendiente.
        // La referencia e ID permiten recuperar el mismo pago sin crear otro cobro.
        const resultUrl = new URL('/portal-pagos/resultado.html', window.location.origin);
        resultUrl.searchParams.set('reference', pending.reference);
        resultUrl.searchParams.set('id', pending.transactionId);
        window.location.assign(resultUrl.toString());
        return;
    } catch (error) {
        console.error('No fue posible completar el pago Wompi:', error);
        if (error?.code === 'WIDGET_CLOSED') {
            showToast(error.message, true);
        } else if (pending) {
            showToast('Wompi registró el pago, pero no pudimos confirmarlo aún. Recarga el portal: se reintentará sin cobrarte de nuevo.', true);
        } else {
            showToast(error?.message || 'No fue posible completar el pago. Inténtalo nuevamente.', true);
        }
    } finally {
        if (button) {
            button.dataset.processing = '0';
            button.disabled = false;
            button.classList.remove('opacity-70', 'cursor-wait');
            selectPaymentOption(selectedOption);
        }
    }
}
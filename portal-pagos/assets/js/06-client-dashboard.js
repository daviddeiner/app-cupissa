/**
 * CUPISSA | Portal de pagos / panel del cliente.
 * Mantiene los datos en las tablas actuales clientes y creditos.
 */

let cupissaCreditRealtimeChannel = null;
let cupissaCreditRealtimeReloadTimer = null;
// Respaldo para proyectos donde Realtime no está publicado o está restringido por RLS.
setInterval(() => {
    if (!document.hidden && typeof currentClient !== 'undefined' && currentClient?.id) {
        loadClientDashboard().catch(error => console.warn('No se pudo actualizar el crédito:', error));
    }
}, 20000);

function subscribeClientCreditRealtime(clientId) {
    if (!clientId || !supabaseClient.channel) return;
    if (cupissaCreditRealtimeChannel) {
        supabaseClient.removeChannel(cupissaCreditRealtimeChannel);
        cupissaCreditRealtimeChannel = null;
    }
    cupissaCreditRealtimeChannel = supabaseClient
        .channel(`cupissa-credit-client-${clientId}`)
        .on('postgres_changes', {
            event: '*', schema: 'public', table: 'creditos',
            filter: `cliente_id=eq.${clientId}`
        }, () => {
            clearTimeout(cupissaCreditRealtimeReloadTimer);
            cupissaCreditRealtimeReloadTimer = setTimeout(() => loadClientDashboard(), 350);
        })
        .on('postgres_changes', {
            event: 'UPDATE', schema: 'public', table: 'clientes',
            filter: `id=eq.${clientId}`
        }, () => {
            clearTimeout(cupissaCreditRealtimeReloadTimer);
            cupissaCreditRealtimeReloadTimer = setTimeout(() => loadClientDashboard(), 350);
        })
        .on('postgres_changes', {
            event: '*', schema: 'public', table: 'cuotas_credito',
            filter: `cliente_id=eq.${clientId}`
        }, () => {
            clearTimeout(cupissaCreditRealtimeReloadTimer);
            cupissaCreditRealtimeReloadTimer = setTimeout(() => loadClientInstallments(), 350);
        })
        .subscribe();
}

async function loadClientInstallments() {
    const container = document.getElementById('client-installments-list');
    if (!container || !currentClient?.id) return;
    const { data, error } = await supabaseClient
        .from('cuotas_credito')
        .select('id,credito_id,numero_cuota,valor_cuota,monto_pagado,fecha_vencimiento,fecha_pago,estado')
        .eq('cliente_id', currentClient.id)
        .order('fecha_vencimiento', { ascending: true });
    if (error) {
        console.warn('[CUPISSA] No se pudieron cargar las cuotas:', error);
        container.innerHTML = '<p class="py-6 text-center text-xs text-slate-400">No fue posible cargar el detalle de cuotas.</p>';
        return;
    }
    // Mostrar todas las cuotas, incluidas las pagadas, mientras exista una deuda activa.
    // Ocultar la sección completa únicamente cuando el cliente no deba nada.
    const liveCreditIds = new Set((activeCredits || []).map(c => String(c.id)));
    const installments = (data || []).filter(item => liveCreditIds.has(String(item.credito_id)));
    const installmentsSection = container.closest('section') || container.parentElement;
    const hasActiveDebt = (activeCredits || []).some(c => Number(c.deuda_actual || 0) > 0.009);
    if (installmentsSection) installmentsSection.classList.toggle('hidden', !hasActiveDebt);
    if (!hasActiveDebt) {
        container.innerHTML = '';
        return;
    }
    if (!installments.length) {
        container.innerHTML = '<p class="py-6 text-center text-xs text-slate-400">No hay cuotas registradas para las deudas activas.</p>';
        return;
    }
    const rows = installments.map(item => {
        const paid = ['PAGADO', 'PAGADA'].includes(String(item.estado || '').trim().toUpperCase()) || Number(item.monto_pagado || 0) >= Number(item.valor_cuota || 0) && Number(item.valor_cuota || 0) > 0;
        const statusClass = paid ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700';
        const status = paid ? 'PAGADA' : 'PENDIENTE';
        const due = item.fecha_vencimiento ? formatDate(item.fecha_vencimiento) : '—';
        const paidDate = item.fecha_pago ? formatDate(item.fecha_pago) : '—';
        const amount = formatCOP(item.valor_cuota || 0);
        return `<tr class="border-b border-slate-100 last:border-0">
          <td class="px-3 py-3 text-xs font-bold text-slate-700">${Number(item.numero_cuota || 0) || '—'}</td>
          <td class="px-3 py-3 text-xs text-slate-600">${due}</td>
          <td class="px-3 py-3 text-xs font-bold text-slate-800">${amount}</td>
          <td class="px-3 py-3 text-xs text-slate-600">${paidDate}</td>
          <td class="px-3 py-3"><span class="inline-flex rounded-full px-2.5 py-1 text-[9px] font-black ${statusClass}">${status}</span></td>
        </tr>`;
    }).join('');
    container.innerHTML = `<table class="min-w-full text-left"><thead><tr class="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400"><th class="px-3 py-2">Cuota</th><th class="px-3 py-2">Vencimiento</th><th class="px-3 py-2">Valor</th><th class="px-3 py-2">Fecha de pago</th><th class="px-3 py-2">Estado</th></tr></thead><tbody>${rows}</tbody></table>`;
}

async function loadClientDashboard() {
    if (!currentClient) return;
    subscribeClientCreditRealtime(currentClient.id);

    const { data: updatedClient, error: clientError } = await supabaseClient
        .from('clientes')
        .select('*')
        .eq('id', currentClient.id)
        .maybeSingle();

    if (clientError) {
        console.warn('[CUPISSA PORTAL] No se pudo refrescar el registro de clientes; se conserva la cuenta autenticada:', clientError);
    } else if (updatedClient) {
        currentClient = { ...currentClient, ...updatedClient };
        localStorage.setItem('cupissa_client_session', JSON.stringify(currentClient));
    }

    const clientName = String(currentClient.nombre || 'Cliente CUPISSA');
    document.getElementById('client-name').innerText = `Hola, ${clientName}`;
    document.getElementById('client-phone').innerHTML = `<i class="fa-solid fa-phone text-[10px] mr-1"></i>${String(currentClient.telefono || '')}`;
    document.getElementById('client-email').innerText = currentClient.correo || '';
    document.getElementById('client-avatar').innerText = clientName.substring(0, 2).toUpperCase();
    document.getElementById('val-cupo-disponible').innerText = formatCOP(currentClient.cupo_disponible || 0);

    const { data: creditos, error: creditsError } = await supabaseClient
        .from('creditos')
        .select('*')
        .eq('cliente_id', currentClient.id)
        .eq('estado', 'ACTIVO');

    if (creditsError) throw creditsError;

    // Un crédito con saldo cero no debe mostrar fecha próxima ni seguir apareciendo como deuda.
    activeCredits = (creditos || []).filter(credit => Number(credit.deuda_actual || 0) > 0.009);
    activeCredits.sort((a, b) => String(a.proximo_vencimiento || '9999-12-31').localeCompare(String(b.proximo_vencimiento || '9999-12-31')));

    if (activeCredits.length > 0) {
        totalAmount = activeCredits.reduce((acc, credit) => acc + Math.max(0, Number(credit.deuda_actual || 0)), 0);
        baseMinAmount = activeCredits.reduce((acc, credit) => acc + Math.max(0, Number(credit.valor_cuota || 0)), 0);

        const firstDueDate = activeCredits.find(credit => credit.proximo_vencimiento)?.proximo_vencimiento || null;
        let moraCalc = { totalWithMora: baseMinAmount, latePeriods: 0, daysLate: 0, moraPercentage: 0, moraAmount: 0 };
        if (typeof calculateMoraDetails === 'function') {
            moraCalc = calculateMoraDetails(firstDueDate, baseMinAmount);
        }

        // Nunca permitir que la cuota mínima supere el saldo total pendiente.
        minAmountWithMora = Math.min(Number(moraCalc.totalWithMora || baseMinAmount), totalAmount);

        document.getElementById('val-deuda-total').innerText = formatCOP(totalAmount);
        document.getElementById('val-creditos-count').innerText = `${activeCredits.length} Crédito(s) Activo(s)`;
        document.getElementById('val-proximo-vencimiento').innerText = totalAmount > 0 ? formatDate(firstDueDate) : 'N/A';

        document.getElementById('opt-val-min').innerText = formatCOP(minAmountWithMora);
        document.getElementById('opt-fecha-min').innerText = totalAmount > 0 ? formatDate(firstDueDate) : 'N/A';
        document.getElementById('opt-val-tot').innerText = formatCOP(totalAmount);

        const moraDetailElem = document.getElementById('opt-mora-detail-min');
        if (moraCalc.latePeriods > 0 && moraCalc.moraAmount > 0) {
            moraDetailElem.innerText = `Incluye +${moraCalc.moraPercentage}% recargo por ${moraCalc.daysLate} días de mora (${formatCOP(moraCalc.moraAmount)})`;
            moraDetailElem.classList.remove('hidden');
        } else {
            moraDetailElem.classList.add('hidden');
        }
    } else {
        totalAmount = 0;
        baseMinAmount = 0;
        minAmountWithMora = 0;
        document.getElementById('val-deuda-total').innerText = '$ 0';
        document.getElementById('val-creditos-count').innerText = '0 Créditos Activos';
        document.getElementById('val-proximo-vencimiento').innerText = 'N/A';
        document.getElementById('opt-val-min').innerText = '$ 0';
        document.getElementById('opt-val-tot').innerText = '$ 0';
        document.getElementById('opt-fecha-min').innerText = 'N/A';
        document.getElementById('opt-mora-detail-min').classList.add('hidden');
    }

    selectPaymentOption('min');
    await loadClientInstallments();

    // Si el usuario cerró o recargó la página después de una aprobación,
    // reintenta aplicar el abono guardado sin abrir otro cobro en Wompi.
    if (typeof recoverApprovedCreditPayment === 'function') {
        await recoverApprovedCreditPayment();
    }
}

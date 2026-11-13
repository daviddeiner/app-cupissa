/**
 * CUPISSA | Portal de pagos / selección de modalidad de pago
 * Código extraído de la versión original sin cambiar la lógica.
 */

function selectPaymentOption(type) {
            selectedOption = type;
            const minCard = document.getElementById('opt-min-card');
            const totCard = document.getElementById('opt-tot-card');
            const radioMin = document.getElementById('radio-min');
            const radioTot = document.getElementById('radio-tot');
            const btnText = document.getElementById('btn-pay-text');

            if (type === 'min') {
                minCard.className = "p-5 rounded-2xl border-2 fuchsia-border bg-pink-50/20 cursor-pointer flex flex-col justify-between";
                totCard.className = "p-5 rounded-2xl border-2 border-slate-200 bg-white cursor-pointer flex flex-col justify-between";
                radioMin.checked = true;
                btnText.innerText = `Pagar Cuota Mínima (${formatCOP(minAmountWithMora)})`;
            } else {
                totCard.className = "p-5 rounded-2xl border-2 fuchsia-border bg-pink-50/20 cursor-pointer flex flex-col justify-between";
                minCard.className = "p-5 rounded-2xl border-2 border-slate-200 bg-white cursor-pointer flex flex-col justify-between";
                radioTot.checked = true;
                btnText.innerText = `Pagar Deuda Total (${formatCOP(totalAmount)})`;
            }
        }

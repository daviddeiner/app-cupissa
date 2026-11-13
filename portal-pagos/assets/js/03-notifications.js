/**
 * CUPISSA | Portal de pagos / notificaciones toast
 * Código extraído de la versión original sin cambiar la lógica.
 */

function showToast(message = "Tu pago ha sido procesado con éxito", isError = false) {
            const toast = document.getElementById('toast-notification');
            const toastMsg = document.getElementById('toast-message');
            const toastIconContainer = document.getElementById('toast-icon-container');
            const toastIcon = document.getElementById('toast-icon');

            toastMsg.innerText = message;

            if (isError) {
                toastIconContainer.className = "w-10 h-10 rounded-xl bg-pink-100 fuchsia-text flex items-center justify-center font-bold text-lg flex-shrink-0";
                toastIcon.className = "fa-solid fa-circle-exclamation";
            } else {
                toastIconContainer.className = "w-10 h-10 rounded-xl bg-pink-100 fuchsia-text flex items-center justify-center font-bold text-lg flex-shrink-0";
                toastIcon.className = "fa-solid fa-circle-check";
            }
            
            toast.classList.remove('hidden');
            setTimeout(() => {
                toast.classList.add('hidden');
            }, 4000);
        }


// Conserva las llamadas alert() existentes y las presenta con el aviso visual CUPISSA.
window.alert = function (message) {
    showToast(String(message ?? ''), true);
};

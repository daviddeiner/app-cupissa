/**
 * CUPISSA | Checkout en página independiente.
 * Mantiene el carrito original y exige una sesión de cliente para comprar.
 */
function checkoutCart() {
    if (!Array.isArray(cart) || cart.length === 0) {
        alert('Tu carrito está vacío.');
        return;
    }

    if (cart.reduce((sum, item) => sum + Number(item.total || 0), 0) < 10000) {
        alert('La compra mínima es de $10.000 en productos.');
        return;
    }

    let session = null;
    try { session = JSON.parse(localStorage.getItem('cupissa_client_session') || 'null'); }
    catch (_) { session = null; }

    closeCartModal();
    closeFavoritesModal();
    closePortalModal();
    if (typeof closeProfileModal === 'function') closeProfileModal();

    // El perfil conserva el catálogo en móvil y vuelve a checkout tras autenticarse.
    if (!session || !session.id) {
        if (window.matchMedia('(max-width: 767px)').matches && typeof openProfileModal === 'function') {
            const frame = document.getElementById('profile-frame');
            if (frame) {
                frame.removeAttribute('src');
                frame.dataset.src = '/perfil?embedded=1&next=checkout&mode=register';
            }
            openProfileModal();
        } else {
            window.location.href = '/perfil?next=checkout&mode=register';
        }
        return;
    }

    window.location.href = '/checkout';
}

// Conserva compatibilidad con llamadas antiguas desde otros módulos.
function closeCheckoutFormModal() {
    const modal = document.getElementById('modal-checkout-form');
    if (modal) modal.classList.add('hidden');
}

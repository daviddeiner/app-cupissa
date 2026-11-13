/**
 * CUPISSA | Catálogo / animación de agregar al carrito
 * Efecto visual independiente: no abre el carrito ni cambia la sección actual.
 */
function animateProductToCart(imageUrl) {
    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    const cartButton = document.getElementById(isMobile ? 'mobile-cart-trigger' : 'desktop-cart-trigger');
    const sourceImage = document.getElementById('opt-modal-img');

    if (!cartButton || !sourceImage) return;

    const sourceRect = sourceImage.getBoundingClientRect();
    const targetNode = cartButton.querySelector('.mobile-nav-icon-wrap, i') || cartButton;
    const targetRect = targetNode.getBoundingClientRect();
    if (!sourceRect.width || !sourceRect.height || !targetRect.width || !targetRect.height) return;

    const imageSize = Math.max(44, Math.min(76, Math.min(sourceRect.width, sourceRect.height) * 0.34));
    const startX = sourceRect.left + (sourceRect.width - imageSize) / 2;
    const startY = sourceRect.top + (sourceRect.height - imageSize) / 2;
    const targetX = targetRect.left + targetRect.width / 2;
    const targetY = targetRect.top + targetRect.height / 2;

    const flyer = document.createElement('img');
    flyer.className = 'cart-flight-image';
    flyer.src = imageUrl || sourceImage.currentSrc || sourceImage.src;
    flyer.alt = '';
    flyer.setAttribute('aria-hidden', 'true');
    flyer.style.left = `${startX}px`;
    flyer.style.top = `${startY}px`;
    flyer.style.width = `${imageSize}px`;
    flyer.style.height = `${imageSize}px`;
    flyer.style.transform = 'translate3d(0, 0, 0) scale(1)';
    document.body.appendChild(flyer);

    const deltaX = targetX - (startX + imageSize / 2);
    const deltaY = targetY - (startY + imageSize / 2);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion) {
        flyer.remove();
    } else {
        requestAnimationFrame(() => {
            flyer.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0) scale(.22) rotate(12deg)`;
            flyer.style.opacity = '0.25';
        });
        window.setTimeout(() => flyer.remove(), 760);
    }

    cartButton.classList.remove('cart-target-adding');
    // Reiniciar el pulso al agregar varios productos seguidos.
    void cartButton.offsetWidth;
    cartButton.classList.add('cart-target-adding');
    window.setTimeout(() => cartButton.classList.remove('cart-target-adding'), 760);

    // En escritorio el encabezado normalmente queda detrás de la ficha modal.
    // Lo elevamos brevemente para que el icono sea visible al recibir la imagen.
    if (!isMobile) {
        document.body.classList.add('cart-flight-desktop');
        if (window.cupissaCartHeaderTimer) window.clearTimeout(window.cupissaCartHeaderTimer);
        window.cupissaCartHeaderTimer = window.setTimeout(() => {
            document.body.classList.remove('cart-flight-desktop');
        }, 780);
    }
}

function showCartAddedFeedback() {
    let feedback = document.getElementById('cart-add-feedback');
    if (!feedback) {
        feedback = document.createElement('div');
        feedback.id = 'cart-add-feedback';
        feedback.className = 'cart-add-feedback';
        feedback.setAttribute('role', 'status');
        feedback.setAttribute('aria-live', 'polite');
        feedback.innerHTML = '<i class="fa-solid fa-check-circle" aria-hidden="true"></i><span>¡Producto agregado al carrito!</span>';
        document.body.appendChild(feedback);
    }

    if (window.cupissaCartFeedbackTimer) window.clearTimeout(window.cupissaCartFeedbackTimer);
    feedback.classList.add('is-visible');
    window.cupissaCartFeedbackTimer = window.setTimeout(() => {
        feedback.classList.remove('is-visible');
    }, 1900);
}

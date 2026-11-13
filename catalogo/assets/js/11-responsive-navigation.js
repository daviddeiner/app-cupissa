/**
 * CUPISSA | Navegación responsive del catálogo.
 * Controla únicamente la presentación; los filtros y sus callbacks originales se conservan.
 */

/** Marca en rosado la sección activa de la navegación inferior móvil. */
function setMobileNavSection(section) {
    document.body.dataset.appSection = section;
    document.querySelectorAll('#mobile-app-nav .mobile-nav-item[data-mobile-section]').forEach(button => {
        const isActive = button.dataset.mobileSection === section && !button.disabled;
        button.classList.toggle('active', isActive);
        if (isActive) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
    });
}


/** Abre el perfil como página independiente en escritorio. */
function goToProfilePage() {
    window.location.href = '/perfil';
}

/** En móvil, el perfil se abre en una ventana sobre el catálogo sin perder su estado. */
function openProfileModal() {
    const existingModal = document.getElementById('modal-profile');
    if (existingModal && !existingModal.classList.contains('hidden')) {
        closeProfileModal();
        return;
    }
    closeCartModal();
    closeFavoritesModal();
    closeCheckoutFormModal();
    closePortalModal();
    closeOptionsModal();
    closeMobileFilters();

    const modal = document.getElementById('modal-profile');
    const frame = document.getElementById('profile-frame');
    if (!modal || !frame) return;
    if (!frame.getAttribute('src')) {
        frame.setAttribute('src', frame.dataset.src || '/perfil?embedded=1');
    }
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('profile-open');
    const profileButton = document.querySelector('#mobile-app-nav [data-mobile-section="profile"]');
    if (profileButton) profileButton.setAttribute('aria-expanded', 'true');
    setMobileNavSection('profile');
}

/** Regresa al catálogo desde el perfil móvil. */
function closeProfileModal() {
    const modal = document.getElementById('modal-profile');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('profile-open');
    setMobileNavSection('home');
    const profileButton = document.querySelector('#mobile-app-nav [data-mobile-section="profile"]');
    if (profileButton) profileButton.setAttribute('aria-expanded', 'false');
}

window.addEventListener('message', event => {
    if (event.origin !== window.location.origin || !event.data) return;
    if (event.data.type === 'CUPISSA_PORTAL_GOOGLE_TOP_LEVEL') {
        const target = new URL(event.data.url, window.location.origin);
        if (target.origin !== window.location.origin || target.pathname !== '/portal-pagos/' || target.searchParams.get('cupissa_google_popup') !== 'login') return;
        window.location.assign(target.toString());
        return;
    }
    if (event.data.type === 'CUPISSA_GOOGLE_TOP_LEVEL') {
        const target = new URL(event.data.url, window.location.origin);
        if (target.origin !== window.location.origin || target.pathname !== '/perfil/' || !['login', 'register'].includes(target.searchParams.get('cupissa_google_popup'))) return;
        window.location.assign(target.toString());
        return;
    }
    if (event.data.type === 'CUPISSA_GOOGLE_FINISHED') {
        if (event.data.next === 'checkout') {
            window.location.href = '/checkout';
            return;
        }
        const frame = document.getElementById('profile-frame');
        if (frame) {
            // Recargar únicamente el perfil integrado para leer la sesión nueva.
            frame.src = frame.dataset.src || '/perfil?embedded=1';
        }
        const modal = document.getElementById('modal-profile');
        if (modal) {
            modal.classList.remove('hidden');
            modal.setAttribute('aria-hidden', 'false');
            document.body.classList.add('profile-open');
        }
        return;
    }
    if (event.data.type === 'CUPISSA_PROFILE_AUTH_CHANGED') cupissaShareProfileSessionToPortal();
    if (event.data.type === 'CUPISSA_PROFILE_CLOSE') closeProfileModal();
    if (event.data.type === 'CUPISSA_PROFILE_CHECKOUT') {
        closeProfileModal();
        window.location.href = '/checkout';
    }
});

/** Perfil y Portal usan la misma sesión de Supabase en este dominio.
 * No copiar ni volver a establecer tokens: ambos clientes leen la sesión
 * existente y el Portal valida la identidad antes de mostrar los créditos. */
function cupissaShareProfileSessionToPortal() {
    const portalWindow = document.getElementById('portal-frame')?.contentWindow;
    if (!portalWindow) return;
    try {
        if (typeof portalWindow.cupissaPortalScheduleRestore === 'function') {
            portalWindow.cupissaPortalScheduleRestore();
        } else {
            portalWindow.postMessage({ type: 'CUPISSA_PORTAL_REFRESH' }, location.origin);
        }
    } catch (error) {
        console.warn('[CUPISSA] No se pudo avisar al Portal:', error);
    }
}

/** Abre el Portal de Pagos dentro del catálogo, sin cambiar la página actual. */
function openPortalModal() {
    closeProfileModal();
    closeCartModal();
    closeFavoritesModal();
    closeCheckoutFormModal();

    const modal = document.getElementById('modal-portal');
    const frame = document.getElementById('portal-frame');
    if (!modal || !frame) return;

    if (!frame.getAttribute('src')) {
        frame.addEventListener('load', cupissaShareProfileSessionToPortal, { once: true });
        frame.setAttribute('src', frame.dataset.src || '/portal-pagos');
    } else {
        cupissaShareProfileSessionToPortal();
    }
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('portal-open');
    setMobileNavSection('portal');
}

/** Cierra el Portal y devuelve al catálogo sin recargarlo. */
function closePortalModal() {
    const modal = document.getElementById('modal-portal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('portal-open');
    setMobileNavSection('home');
}

/** Inicio conserva la página viva y solo cierra paneles para volver al catálogo. */
function goToCatalogHome() {
    setMobileNavSection('home');
    closeProfileModal();
    closeCartModal();
    closeFavoritesModal();
    closePortalModal();
    closeOptionsModal();
    closeMobileFilters();
    const target = document.getElementById('catalog-main');
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function toggleMobileFilters() {
    closeProfileModal();
    closeCartModal();
    closeFavoritesModal();
    closePortalModal();
    const isOpen = document.body.classList.toggle('mobile-filters-open');
    const toggle = document.getElementById('mobile-filter-toggle');
    if (toggle) toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

function closeMobileFilters() {
    document.body.classList.remove('mobile-filters-open');
    const toggle = document.getElementById('mobile-filter-toggle');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
}

function toggleCatalogDropdown(button) {
    if (!button) return;
    const group = button.closest('.filter-dropdown-group');
    if (!group) return;
    const isOpen = group.classList.toggle('is-open');
    button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

function updateCatalogStickyOffset() {
    const banner = document.querySelector('.catalog-promo-banner');
    if (!banner) return;
    const height = Math.ceil(banner.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--promo-sticky-height', `${height}px`);
}

window.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
            closeMobileFilters();
            closeProfileModal();
            closePortalModal();
            closeCartModal();
            closeFavoritesModal();
        }
});

window.addEventListener('resize', () => {
    updateCatalogStickyOffset();
    if (window.innerWidth >= 768) closeMobileFilters();
});

window.addEventListener('load', updateCatalogStickyOffset, { once: true });
if ('ResizeObserver' in window) {
    const banner = document.querySelector('.catalog-promo-banner');
    if (banner) new ResizeObserver(updateCatalogStickyOffset).observe(banner);
}

// Después de Google, recuperar el Portal integrado sin alterar la navegación móvil.
window.addEventListener('load', () => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('cupissa_open_portal') !== '1') return;
    url.searchParams.delete('cupissa_open_portal');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    openPortalModal();
});

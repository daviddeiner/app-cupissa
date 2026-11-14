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

// Los filtros deben estar presentes desde el primer fotograma del catálogo.
document.body.dataset.appSection = 'home';


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
    if (event.data.type === 'CUPISSA_PROFILE_CLOSE') closeProfileModal();
    if (event.data.type === 'CUPISSA_PROFILE_CHECKOUT') {
        closeProfileModal();
        window.location.href = '/checkout';
    }
});

/** Inicio conserva la página viva y solo cierra paneles para volver al catálogo. */
function goToCatalogHome() {
    if (typeof window.cupissaCloseTasks === 'function') window.cupissaCloseTasks();
    setMobileNavSection('home');
    closeProfileModal();
    closeCartModal();
    closeFavoritesModal();
    closeOptionsModal();
    closeMobileFilters();
    const target = document.getElementById('catalog-main');
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function toggleMobileFilters() {
    if (typeof window.cupissaCloseTasks === 'function') window.cupissaCloseTasks();
    closeProfileModal();
    closeCartModal();
    closeFavoritesModal();
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


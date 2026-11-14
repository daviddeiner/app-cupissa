/** CUPISSA | 1000 registros por consulta; tarjetas progresivas por proximidad al scroll. */
let productsBatchPending = false;
let productsAutoLoadTimer = null;
let catalogScrollObserver = null;
let nextCatalogRetryAt = 0;

async function loadNextProductsBatch() {
    if (productsBatchPending || isLoadingMore || document.hidden || Date.now() < nextCatalogRetryAt) return;
    productsBatchPending = true;
    isLoadingMore = true;
    const loadingMsg = document.getElementById('scroll-loading-msg');
    const endMsg = document.getElementById('scroll-end-msg');
        if (loadingMsg) loadingMsg.classList.add('hidden');
    if (endMsg) endMsg.classList.add('hidden');
    try {
        if (displayLimit < filteredProducts.length) {
            displayLimit = Math.min(displayLimit + CUPISSA_PRODUCT_BATCH_SIZE, filteredProducts.length);
            renderProductsGrid();
            return;
        }
        if (typeof window.hasMoreCupissaCatalogProducts === 'function' &&
            window.hasMoreCupissaCatalogProducts() &&
            typeof window.loadNextCupissaCatalogPage === 'function') {
            const previousCount = filteredProducts.length;
            // No competir con otra consulta; reintentar cuando termine si hace falta.
            const loaded = await window.loadNextCupissaCatalogPage();
            if (!loaded) nextCatalogRetryAt = Date.now() + 2500;
            else nextCatalogRetryAt = 0;
            if (filteredProducts.length > previousCount) {
                displayLimit = Math.min(displayLimit + CUPISSA_PRODUCT_BATCH_SIZE, filteredProducts.length);
                renderProductsGrid();
            }
        }
    } catch (error) {
        nextCatalogRetryAt = Date.now() + 2500;
        console.error('[CUPISSA] Error durante la carga progresiva:', error);
    } finally {
        productsBatchPending = false;
        isLoadingMore = false;
        if (loadingMsg) loadingMsg.classList.add('hidden');
        if (endMsg && !(typeof window.hasMoreCupissaCatalogProducts === 'function' && window.hasMoreCupissaCatalogProducts())) {
            endMsg.classList.toggle('hidden', displayLimit < filteredProducts.length);
            if (displayLimit >= filteredProducts.length) endMsg.textContent = 'Has llegado al final del catálogo';
        }
        // Si aún está a la vista el final, continuar sin obligar al cliente a desplazar otra vez.
        if (nextCatalogRetryAt > Date.now()) {
            window.setTimeout(scheduleCatalogNearEnd, Math.max(100, nextCatalogRetryAt - Date.now()));
        } else scheduleCatalogNearEnd();
    }
}

function catalogNearEnd() {
    const sentinel = document.getElementById('scroll-status-container');
    return !!sentinel && sentinel.getBoundingClientRect().top < window.innerHeight + 2600;
}
function scheduleCatalogNearEnd() {
    if (productsAutoLoadTimer !== null || productsBatchPending || document.hidden || Date.now() < nextCatalogRetryAt) return;
    if (!catalogNearEnd()) return;
    if (displayLimit >= filteredProducts.length &&
        !(typeof window.hasMoreCupissaCatalogProducts === 'function' && window.hasMoreCupissaCatalogProducts())) return;
    productsAutoLoadTimer = window.setTimeout(() => {
        productsAutoLoadTimer = null;
        if (catalogNearEnd()) loadNextProductsBatch();
    }, 90);
}
function setupAutomaticProductLoading() {
    if (catalogScrollObserver) return;
    const sentinel = document.getElementById('scroll-status-container');
    if (!sentinel) return;
    if ('IntersectionObserver' in window) {
        catalogScrollObserver = new IntersectionObserver(() => scheduleCatalogNearEnd(),
            {rootMargin: '2600px 0px', threshold: 0});
        catalogScrollObserver.observe(sentinel);
    } else {
        window.addEventListener('scroll', scheduleCatalogNearEnd, {passive: true});
    }
    window.addEventListener('resize', scheduleCatalogNearEnd, {passive: true});
    document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleCatalogNearEnd(); });
    scheduleCatalogNearEnd();
}

function startAuthenticatedCatalog() {
    updateBadges();
    fetchCatalogProducts();
    if (typeof initializeCatalogAccountState === 'function') {
        Promise.resolve(initializeCatalogAccountState()).catch(error => {
            console.warn('No fue posible restaurar el carrito y favoritos:', error);
        });
    }
}
window.addEventListener('cupissa:authenticated', startAuthenticatedCatalog, { once: true });
if (window.CUPISSA_APP_AUTH_READY) startAuthenticatedCatalog();

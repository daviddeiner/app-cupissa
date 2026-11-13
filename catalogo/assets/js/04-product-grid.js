/** CUPISSA | Grilla principal y destacados de temporada. */

// Textos alternativos descriptivos para las imágenes de productos existentes y nuevos.
// No modifica nombres, fotos ni registros de Supabase.
function catalogPhotoAlt(prod) {
    const name = String(prod?.nombre || 'Producto').trim();
    const candidates = [prod?.subcategoria, prod?.categoria, prod?.mundo];
    const category = candidates.map(value => String(value || '').trim())
        .find(value => value && value.toLowerCase() !== 'general' && !name.toLowerCase().includes(value.toLowerCase()));
    const categoryLabel = category ? (category === category.toUpperCase() ? category.charAt(0) + category.slice(1).toLowerCase() : category) : '';
    return [name, categoryLabel, 'Cupissa'].filter(Boolean).join(' — ');
}
function escapeCatalogImageAttribute(value) {
    return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function catalogProductCard(prod, options = {}) {
    const isFav = favorites.some(f => String(f.id) === String(prod.id));
    const mainFoto = prod.fotos && prod.fotos.length > 0 ? prod.fotos[0] : 'https://via.placeholder.com/400x400?text=Cupissa';
    const hasRentalPrice = Boolean(prod.alquiler && Number(prod.precio_alquiler) > 0);
    const basePrice = hasRentalPrice ? Number(prod.precio_alquiler) : Number(prod.precio_detal || 0);
    const basePriceLabel = 'Desde';
    const card = document.createElement('div');
    const productPermalink = `/producto/${encodeURIComponent(String(prod.id))}/`;
    const seoImageAlt = escapeCatalogImageAttribute(catalogPhotoAlt(prod));
    card.className = options.featured
        ? 'bg-white rounded-2xl overflow-hidden border border-pink-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group cursor-pointer'
        : 'bg-white rounded-2xl sm:rounded-3xl overflow-hidden border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group cursor-pointer';
    card.dataset.cupissaProductId = String(prod.id);
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `Ver opciones de ${prod.nombre}`);
    card.title = `Ver ${prod.nombre}`;
    card.addEventListener('click', event => {
        const titleLink = event.target.closest('a[data-cupissa-seo-link]');
        if (titleLink) {
            // Mantener el href SEO, pero en la tienda el clic normal abre el modal.
            // Ctrl/Cmd/clic central permite abrir el enlace público en otra pestaña.
            if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
            event.preventDefault();
            openOptionsModal(prod.id);
            return;
        }
        if (event.target.closest('[data-card-ignore-open]')) return;
        openOptionsModal(prod.id);
    });
    card.addEventListener('keydown', event => {
        if (event.target !== card || !['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        openOptionsModal(prod.id);
    });
    card.innerHTML = `
        <div>
            <div class="relative bg-slate-50 overflow-hidden flex items-center justify-center">
                <img src="${mainFoto}" alt="${seoImageAlt}" title="${seoImageAlt}" loading="lazy" decoding="async" fetchpriority="low" class="product-card-photo block w-full h-auto max-h-[380px] object-contain transition-transform duration-300">
                <button data-card-ignore-open type="button" onclick="toggleFavorite('${prod.id}', event)" class="absolute top-2 right-2 sm:top-3 sm:right-3 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/80 backdrop-blur-md text-slate-400 hover:text-pink-600 flex items-center justify-center transition-colors shadow-sm" data-favorite-product-id="${String(prod.id)}" aria-label="Agregar a favoritos" aria-pressed="${isFav}">
                    <i class="${isFav ? 'fa-solid fa-heart text-pink-600 text-xs sm:text-sm' : 'fa-regular fa-heart text-xs sm:text-sm'}"></i>
                </button>
            </div>
            <div class="p-2.5 sm:p-4 space-y-1 sm:space-y-2">
                <span class="text-[9px] sm:text-[10px] font-black uppercase text-pink-600 tracking-wider">${(prod.temporadas?.length ? prod.temporadas : [prod.temporada]).filter(Boolean).join(' - ')}</span>
                <h3 class="product-card-title font-extrabold text-slate-900 text-[10px] leading-snug sm:text-xs tracking-tight"><a data-cupissa-seo-link href="${productPermalink}" title="${seoImageAlt}" class="hover:text-pink-700 hover:underline" aria-label="Ver ficha de ${prod.nombre}">${prod.nombre}</a></h3>
                <div class="product-activity" data-activity-product="${String(prod.id)}" hidden aria-live="polite">
                    <span><i class="fa-regular fa-eye"></i><strong data-activity-viewers>20+</strong> personas viendo</span>
                    <small class="activity-disclaimer"></small>
                </div>
            </div>
        </div>
        <div class="p-2.5 sm:p-4 pt-0 flex flex-col sm:flex-row sm:items-center justify-between border-t border-slate-50 mt-1 sm:mt-2 gap-1.5 sm:gap-2">
            <div>
                <span class="text-[8px] sm:text-[10px] text-slate-400 block font-semibold">${basePriceLabel}</span>
                <span class="font-black text-slate-900 text-xs sm:text-base">${formatCOP(basePrice)}</span>
            </div>
            <button type="button" class="product-card-cart-button w-10 h-9 sm:w-12 sm:h-11 fuchsia-btn font-extrabold rounded-xl sm:rounded-2xl shadow-md transition-all flex items-center justify-center" aria-label="Ver opciones y agregar ${prod.nombre} al carrito" title="Agregar al carrito">
                <i class="fa-solid fa-cart-shopping text-sm sm:text-base" aria-hidden="true"></i>
            </button>
        </div>`;
    const cardPhoto = card.querySelector('.product-card-photo');
    if (cardPhoto) {
        const setNaturalSize = () => {
            if (!cardPhoto.naturalWidth || !cardPhoto.naturalHeight) return;
            cardPhoto.style.removeProperty('aspect-ratio');
            cardPhoto.style.objectFit = 'contain';
        };
        cardPhoto.addEventListener('load', setNaturalSize, { once: true });
        if (cardPhoto.complete) setNaturalSize();
    }
    return card;
}

function renderSeasonFeatured() {
    updateFeaturedSeasonProducts(false);
    const section = document.getElementById('season-featured');
    const name = document.getElementById('season-featured-name');
    const grid = document.getElementById('season-featured-grid');
    if (!section || !grid) return;
    if (!featuredSeasonProducts.length) {
        section.classList.add('hidden');
        grid.innerHTML = '';
        return;
    }
    section.classList.remove('hidden');
    const selectFeaturedSeason = () => {
        if (!featuredSeasonName) return;
        activeMundo = 'TODOS';
        activeCategoria = 'TODAS';
        activeSubcategoria = 'TODAS';
        const search = document.getElementById('smart-search-input');
        if (search) search.value = '';
        filterByTemporada(String(featuredSeasonName).trim().toUpperCase());
    };
    // El encabezado completo selecciona la temporada; las tarjetas conservan su modal.
    const heading = section.querySelector('h1, h2, h3, [data-season-heading]') || section.querySelector('header');
    [heading, name].filter(Boolean).forEach(target => {
        target.style.cursor = 'pointer';
        target.title = 'Ver todos los productos de la temporada destacada';
        target.setAttribute('role', 'button');
        target.tabIndex = 0;
        target.onclick = selectFeaturedSeason;
        target.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectFeaturedSeason(); } };
    });
    section.onclick = event => {
        // Favoritos, carrito, tarjetas y fotografías mantienen su comportamiento.
        if (event.target.closest('#season-featured-grid, button, a, input')) return;
        selectFeaturedSeason();
    };
    if (name) {
        name.textContent = featuredSeasonName ? `· ${featuredSeasonName}` : '';
        name.style.cursor = featuredSeasonName ? 'pointer' : '';
        name.setAttribute('role', 'button');
        name.tabIndex = 0;
        name.title = 'Ver todos los productos de esta temporada';
    }
    // Conservar las tarjetas destacadas existentes cuando se añade otro lote.
    // No borrar la grilla antes de comparar la lista actual.
    const featuredKey = featuredSeasonProducts.map(product => String(product.id)).join('|');
    if (grid.dataset.featuredKey !== featuredKey || grid.children.length !== featuredSeasonProducts.length) {
        grid.replaceChildren();
        featuredSeasonProducts.forEach(product => grid.appendChild(catalogProductCard(product, { featured:true })));
        grid.dataset.featuredKey = featuredKey;
    }
}

function renderProductsGrid() {
    const grid = document.getElementById('products-grid');
    // Conservar tarjetas ya dibujadas durante la carga progresiva: no reordenar al hacer scroll.
    const mobileMosaic = window.matchMedia('(max-width: 767px)').matches;
    const catalogKey = filteredProducts.map(p => String(p.id)).join('|');
    const previousCatalogKey = grid.dataset.catalogKey || '';
    const sameLayout = grid.dataset.mobileMosaic === String(mobileMosaic);
    const sameCatalog = previousCatalogKey === catalogKey && sameLayout;
    // Si solo se agregaron productos al final, conservar las tarjetas existentes.
    // Si cambió el orden por filtros o búsqueda, reconstruir la grilla para no mezclar resultados.
    const appendedCatalog = !!previousCatalogKey && sameLayout && catalogKey.startsWith(previousCatalogKey + '|');
    if (!sameCatalog && !appendedCatalog) {
        grid.replaceChildren();
        grid.dataset.renderedCount = '0';
    }
    grid.dataset.catalogKey = catalogKey;
    grid.dataset.mobileMosaic = String(mobileMosaic);
    let columns = null;
    if (mobileMosaic) {
        columns = Array.from(grid.querySelectorAll(':scope > .cupissa-mosaic-column'));
        if (columns.length !== 2) {
            grid.replaceChildren();
            columns = [document.createElement('div'), document.createElement('div')];
            columns.forEach(col => { col.className = 'cupissa-mosaic-column'; grid.appendChild(col); });
            grid.dataset.renderedCount = '0';
        }
    }

    const statusContainer = document.getElementById('scroll-status-container');
    const loadingMsg = document.getElementById('scroll-loading-msg');
    const endMsg = document.getElementById('scroll-end-msg');

    const searchValue = (document.getElementById('smart-search-input')?.value || '').trim();
    const hasActiveFilters = activeMundo !== 'TODOS'
        || activeTemporada !== 'TODAS'
        || activeCategoria !== 'TODAS'
        || activeSubcategoria !== 'TODAS'
        || searchValue.length > 0;

    const featuredSection = document.getElementById('season-featured');
    if (hasActiveFilters) {
        if (featuredSection) featuredSection.classList.add('hidden');
    } else {
        renderSeasonFeatured();
    }

    if (filteredProducts.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full cupissa-empty-state cupissa-empty-catalog">
                <div class="cupissa-empty-state-icon"><i class="fa-solid fa-box-open" aria-hidden="true"></i></div>
                <h3>Por aquí todavía no hay productos</h3>
                <p>Prueba con otro mundo o ajusta los filtros para descubrir más de CUPISSA.</p>
            </div>`;
        statusContainer.classList.add('hidden');
        return;
    }

    const productsToShow = filteredProducts.slice(0, displayLimit);
    const query = searchValue;

    const alreadyRendered = Math.min(Number(grid.dataset.renderedCount || 0), productsToShow.length);
    productsToShow.slice(alreadyRendered).forEach((prod, offset) => {
        const index = alreadyRendered + offset;
        if (query && currentNonMatches.length > 0 && index === currentMatches.length) {
            const separator = document.createElement('div');
            separator.className = 'col-span-full my-4 flex items-center justify-center';
            separator.innerHTML = `
                <div class="flex-grow border-t border-slate-300"></div>
                <span class="flex-shrink mx-4 text-xs font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-4 py-1.5 rounded-full shadow-xs">Más productos del catálogo</span>
                <div class="flex-grow border-t border-slate-300"></div>`;
            if (columns) { columns[index % 2].appendChild(separator); } else grid.appendChild(separator);
        }
        const card = catalogProductCard(prod);
        if (columns) columns[index % 2].appendChild(card);
        else grid.appendChild(card);
    });
    grid.dataset.renderedCount = String(productsToShow.length);
    if (typeof scheduleCatalogNearEnd === 'function') scheduleCatalogNearEnd();

    if (typeof window.loadProductActivityMetrics === 'function') {
        const activityProducts = hasActiveFilters
            ? productsToShow
            : [...featuredSeasonProducts, ...productsToShow];
        window.loadProductActivityMetrics(activityProducts);
    }
    statusContainer.classList.remove('hidden');
    loadingMsg.classList.toggle('hidden', displayLimit >= filteredProducts.length);
    if (displayLimit >= filteredProducts.length) endMsg.classList.remove('hidden');
    else endMsg.classList.add('hidden');
}

/**
 * CUPISSA | Catálogo / filtros encadenados y buscador inteligente
 * Mundos permanecen visibles. La selección avanza: Temporada > Categoría > Subcategoría.
 */

function cupissaFilterValues(product, plural, singular) {
    const source = Array.isArray(product?.[plural]) && product[plural].length
        ? product[plural]
        : [product?.[singular]];
    return source
        .map(value => String(value ?? '').trim().toUpperCase())
        .filter(Boolean);
}

function cupissaProductsForActiveSeason() {
    return rawProducts.filter(product => {
        const worldMatch = activeMundo === 'TODOS' || cupissaFilterValues(product, 'mundos', 'mundo').includes(String(activeMundo).toUpperCase());
        const seasonMatch = activeTemporada === 'TODAS' || cupissaFilterValues(product, 'temporadas', 'temporada').includes(String(activeTemporada).toUpperCase());
        return worldMatch && seasonMatch;
    });
}

function cupissaBuildFilterButton(container, label, id, active, callback, baseClass, activeClass) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = id;
    button.className = active ? activeClass : baseClass;
    button.textContent = label;
    button.onclick = callback;
    container.appendChild(button);
    return button;
}

function renderFilters() {
    const worldContainer = document.getElementById('mundos-container');
    const mobileWorldContainer = document.getElementById('mobile-mundos-container');
    const seasonContainer = document.getElementById('temporadas-container');
    const categoryContainer = document.getElementById('categorias-container');
    const subcategoryContainer = document.getElementById('subcategorias-container');
    const categorySection = document.getElementById('category-filter-section');
    const subcategorySection = document.getElementById('subcategory-filter-section');
    if (!worldContainer || !seasonContainer || !categoryContainer || !subcategoryContainer) return;

    const baseWorld = 'px-2.5 py-1 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all shrink-0';
    const activeWorld = 'px-2.5 py-1 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all bg-pink-600 text-white shrink-0 shadow-sm';
    const base = 'px-2 py-1 sm:px-3 sm:py-1.5 rounded-md sm:rounded-lg font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all shrink-0';
    const active = 'px-2 py-1 sm:px-3 sm:py-1.5 rounded-md sm:rounded-lg font-black text-white bg-pink-600 shadow-sm transition-all shrink-0';
    const worlds = new Set();
    rawProducts.forEach(product => cupissaFilterValues(product, 'mundos', 'mundo').forEach(value => worlds.add(value)));

    // Los mundos se muestran arriba en escritorio y también dentro del panel móvil.
    [worldContainer, mobileWorldContainer].filter(Boolean).forEach((container, index) => {
        container.innerHTML = '';
        cupissaBuildFilterButton(container, 'Todos los mundos', `btn-mundo-todos-${index}`, activeMundo === 'TODOS', () => filterByMundo('TODOS'), baseWorld, activeWorld);
        [...worlds].sort((a,b) => a.localeCompare(b,'es')).forEach(world =>
            cupissaBuildFilterButton(container, world, `btn-mundo-${index}-${world}`, activeMundo === world, () => filterByMundo(world), baseWorld, activeWorld));
    });

    const worldProducts = activeMundo === 'TODOS' ? rawProducts : rawProducts.filter(product =>
        cupissaFilterValues(product, 'mundos', 'mundo').includes(String(activeMundo).toUpperCase()));

    // Categorías inmediatamente debajo del mundo seleccionado.
    const categories = new Set();
    worldProducts.forEach(product => cupissaFilterValues(product, 'categorias', 'categoria').forEach(value => categories.add(value)));
    if (categorySection) categorySection.hidden = activeMundo === 'TODOS' || categories.size === 0;
    const categoryTitle = document.getElementById('category-filter-title');
    if (categoryTitle) categoryTitle.textContent = activeMundo === 'TODOS' ? 'Categorías disponibles' : `Categorías de ${activeMundo}`;
    categoryContainer.innerHTML = '';
    cupissaBuildFilterButton(categoryContainer, 'Todas las categorías', 'btn-cat-todas', activeCategoria === 'TODAS', () => filterByCategoria('TODAS'), base, active);
    [...categories].sort((a,b) => a.localeCompare(b,'es')).forEach(category =>
        cupissaBuildFilterButton(categoryContainer, category, `btn-cat-${category}`, activeCategoria === category, () => filterByCategoria(category), base, active));

    // Subcategorías debajo de la categoría específica elegida.
    const selectedCategoryProducts = activeCategoria === 'TODAS' ? [] : worldProducts.filter(product =>
        cupissaFilterValues(product, 'categorias', 'categoria').includes(String(activeCategoria).toUpperCase()));
    const subcategories = new Set();
    selectedCategoryProducts.forEach(product => cupissaFilterValues(product, 'subcategorias', 'subcategoria').forEach(value => subcategories.add(value)));
    if (subcategorySection) subcategorySection.hidden = activeCategoria === 'TODAS' || subcategories.size === 0;
    const subcategoryTitle = document.getElementById('subcategory-filter-title');
    if (subcategoryTitle) subcategoryTitle.textContent = `Subcategorías de ${activeCategoria}`;
    subcategoryContainer.innerHTML = '';
    cupissaBuildFilterButton(subcategoryContainer, 'Todas las subcategorías', 'btn-subcat-todas', activeSubcategoria === 'TODAS', () => filterBySubcategoria('TODAS'), base, active);
    [...subcategories].sort((a,b) => a.localeCompare(b,'es')).forEach(subcategory =>
        cupissaBuildFilterButton(subcategoryContainer, subcategory, `btn-subcat-${subcategory}`, activeSubcategoria === subcategory, () => filterBySubcategoria(subcategory), base, active));

    // Temporadas quedan como filtro independiente, al final del panel.
    const seasons = new Set();
    rawProducts.forEach(product => cupissaFilterValues(product, 'temporadas', 'temporada').forEach(value => seasons.add(value)));
    seasonContainer.innerHTML = '';
    cupissaBuildFilterButton(seasonContainer, 'Todas', 'btn-temp-todas', activeTemporada === 'TODAS', () => filterByTemporada('TODAS'), base, active);
    [...seasons].sort((a,b) => a.localeCompare(b,'es')).forEach(season =>
        cupissaBuildFilterButton(seasonContainer, season, `btn-temp-${season}`, activeTemporada === season, () => filterByTemporada(season), base, active));
}

function cupissaScrollCatalogToTop() {
    requestAnimationFrame(() => {
        const catalog = document.getElementById('catalog-main');
        if (!catalog) return;
        const header = document.querySelector('header');
        const headerHeight = header && getComputedStyle(header).position === 'sticky' ? header.getBoundingClientRect().height : 0;
        const top = Math.max(0, window.scrollY + catalog.getBoundingClientRect().top - headerHeight - 8);
        window.scrollTo({ top, behavior: 'instant' });
    });
}

function filterByMundo(mundo) {
    activeMundo = mundo;
    activeCategoria = 'TODAS';
    activeSubcategoria = 'TODAS';
    renderFilters();
    displayLimit = CUPISSA_PRODUCT_BATCH_SIZE;
    applyFiltersAndSearch();
    cupissaScrollCatalogToTop();
}

function filterByTemporada(temp) {
    activeTemporada = temp;
    displayLimit = CUPISSA_PRODUCT_BATCH_SIZE;
    renderFilters();
    applyFiltersAndSearch();
    cupissaScrollCatalogToTop();
}

function filterByCategoria(cat) {
    activeCategoria = cat;
    activeSubcategoria = 'TODAS';
    renderFilters();
    displayLimit = CUPISSA_PRODUCT_BATCH_SIZE;
    applyFiltersAndSearch();
    cupissaScrollCatalogToTop();
}

function filterBySubcategoria(subcat) {
    activeSubcategoria = subcat;
    displayLimit = CUPISSA_PRODUCT_BATCH_SIZE;
    renderFilters();
    applyFiltersAndSearch();
    cupissaScrollCatalogToTop();
}

        function handleSmartSearch() {
            displayLimit = CUPISSA_PRODUCT_BATCH_SIZE;
            if (window.cupissaSearchTimer) window.clearTimeout(window.cupissaSearchTimer);
            window.cupissaSearchTimer = window.setTimeout(() => {
                applyFiltersAndSearch();
                // Al buscar, presentar inmediatamente el inicio de los resultados.
                // No quitar el foco del campo ni alterar filtros, productos o paginación.
                cupissaScrollCatalogToTop();
            }, 90);
        }

        // BUSCADOR INTELIGENTE: tolera tildes, plurales, errores de escritura
        // y ordena todos los productos desde el más parecido hasta el menos parecido.
        function normalizeSearchText(value) {
            return String(value || '')
                .toLocaleLowerCase('es-CO')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/ñ/g, 'n')
                .replace(/[^a-z0-9]+/g, ' ')
                .trim();
        }

        function searchTokens(value) {
            const stopWords = new Set(['de','del','la','las','el','los','un','una','para','por','con','y','en','a','al']);
            return normalizeSearchText(value).split(/\s+/).filter(word => word.length > 1 && !stopWords.has(word));
        }

        function boundedEditDistance(a, b, maxDistance) {
            if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;
            if (a === b) return 0;
            let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
            for (let i = 1; i <= a.length; i++) {
                const current = [i];
                let rowMinimum = i;
                for (let j = 1; j <= b.length; j++) {
                    const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                    current[j] = Math.min(
                        current[j - 1] + 1,
                        previous[j] + 1,
                        previous[j - 1] + cost
                    );
                    rowMinimum = Math.min(rowMinimum, current[j]);
                }
                if (rowMinimum > maxDistance) return maxDistance + 1;
                previous = current;
            }
            return previous[b.length];
        }

        function tokenSimilarity(queryToken, candidateToken) {
            if (!queryToken || !candidateToken) return 0;
            if (queryToken === candidateToken) return 100;
            if (candidateToken.startsWith(queryToken) || queryToken.startsWith(candidateToken)) return 82;
            if (candidateToken.includes(queryToken) || queryToken.includes(candidateToken)) return 68;

            const longest = Math.max(queryToken.length, candidateToken.length);
            const tolerance = longest >= 10 ? 3 : (longest >= 6 ? 2 : (longest >= 4 ? 1 : 0));
            if (tolerance) {
                const distance = boundedEditDistance(queryToken, candidateToken, tolerance);
                if (distance <= tolerance) return distance === 1 ? 58 : 42;
            }

            // Coincidencia suave por grupos de letras: permite ordenar sugerencias
            // incluso cuando el cliente escribió un nombre bastante distinto.
            const grams = value => {
                const padded = ` ${value} `;
                const set = new Set();
                for (let i = 0; i < padded.length - 2; i++) set.add(padded.slice(i, i + 3));
                return set;
            };
            const a = grams(queryToken);
            const b = grams(candidateToken);
            let common = 0;
            a.forEach(gram => { if (b.has(gram)) common++; });
            const dice = (2 * common) / Math.max(1, a.size + b.size);
            return dice >= 0.18 ? Math.round(dice * 34) : 0;
        }

        const productSearchIndex = new WeakMap();

        function getIndexedProductFields(product) {
            if (productSearchIndex.has(product)) return productSearchIndex.get(product);
            const fields = [
                { value: product.nombre, weight: 1.00 },
                { value: (product.subcategorias || [product.subcategoria]).join(' '), weight: 0.82 },
                { value: (product.categorias || [product.categoria]).join(' '), weight: 0.70 },
                { value: (product.mundos || [product.mundo]).join(' '), weight: 0.55 },
                { value: (product.temporadas || [product.temporada]).join(' '), weight: 0.45 },
                { value: product.descripcion, weight: 0.40 },
                { value: (product.colores || []).map(x => typeof x === 'string' ? x : x?.nombre).join(' '), weight: 0.18 },
                { value: (product.accesorios || []).map(x => typeof x === 'string' ? x : x?.nombre).join(' '), weight: 0.14 }
            ].map(field => ({
                text: normalizeSearchText(field.value),
                words: searchTokens(field.value),
                weight: field.weight
            }));
            productSearchIndex.set(product, fields);
            return fields;
        }

        function calculateProductRelevance(product, query) {
            const phrase = normalizeSearchText(query);
            const queryWords = searchTokens(query);
            if (!phrase || !queryWords.length) return 0;
            const fields = getIndexedProductFields(product);

            let score = 0;
            const nameText = fields[0].text;
            if (nameText === phrase) score += 1000;
            else if (nameText.startsWith(phrase)) score += 760;
            else if (nameText.includes(phrase)) score += 620;

            for (const queryWord of queryWords) {
                let bestForWord = 0;
                fields.forEach((field, fieldIndex) => {
                    const fieldFactor = field.weight;
                    let fieldBest = 0;
                    field.words.forEach(candidate => {
                        fieldBest = Math.max(fieldBest, tokenSimilarity(queryWord, candidate));
                    });
                    if (field.text.includes(queryWord)) fieldBest = Math.max(fieldBest, fieldIndex === 0 ? 90 : 62);
                    bestForWord = Math.max(bestForWord, fieldBest * fieldFactor);
                });
                score += bestForWord;
            }

            // Bonificación moderada para nombres que cubren todos los términos.
            if (queryWords.length > 1) {
                const matchedNameWords = queryWords.filter(word =>
                    fields[0].words.some(candidate => tokenSimilarity(word, candidate) >= 42)
                ).length;
                score += (matchedNameWords / queryWords.length) * 55;
            }
            return Math.round(score);
        }

        function applyFiltersAndSearch() {
            const searchElement = document.getElementById('smart-search-input');
            const query = (searchElement?.value || '').trim();
            if (!query && typeof window.flushCupissaNewCatalogProducts === 'function') {
                // Cargar publicaciones recibidas mientras el usuario buscaba.
                // Evitar recursión: la cola se vacía antes de aplicar filtros.
                window.flushCupissaNewCatalogProducts();
            }

            const results = rawProducts.filter(p => {
                const valuesFor = (plural, singular) => (Array.isArray(p[plural]) && p[plural].length ? p[plural] : [p[singular]])
                    .map(value => String(value || '').toUpperCase().trim()).filter(Boolean);
                const targetMundo = activeMundo.toString().toUpperCase().trim();
                const targetTemp = activeTemporada.toString().toUpperCase().trim();
                const targetCat = activeCategoria.toString().toUpperCase().trim();
                const targetSubcat = activeSubcategoria.toString().toUpperCase().trim();
                const matchMundo = activeMundo === 'TODOS' || valuesFor('mundos', 'mundo').includes(targetMundo);
                const matchTemp = activeTemporada === 'TODAS' || valuesFor('temporadas', 'temporada').includes(targetTemp);
                const matchCat = activeCategoria === 'TODAS' || valuesFor('categorias', 'categoria').includes(targetCat);
                const matchSubcat = activeSubcategoria === 'TODAS' || valuesFor('subcategorias', 'subcategoria').includes(targetSubcat);
                return matchMundo && matchTemp && matchCat && matchSubcat;
            });

            if (query) {
                const scored = results.map((product, index) => ({
                    product,
                    score: calculateProductRelevance(product, query),
                    originalIndex: index
                }));
                scored.sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex);

                // Las coincidencias claras quedan primero; el resto también se ordena
                // por cercanía para que nunca se pierdan productos por un error de escritura.
                currentMatches = scored.filter(item => item.score >= 38).map(item => item.product);
                currentNonMatches = scored.filter(item => item.score < 38).map(item => item.product);
                filteredProducts = [...currentMatches, ...currentNonMatches];
            } else {
                currentMatches = results;
                currentNonMatches = [];
                filteredProducts = results;
            }

            renderProductsGrid();
        }

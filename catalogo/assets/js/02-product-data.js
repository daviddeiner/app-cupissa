/**
 * CUPISSA | Catálogo / carga, normalización y datos SEO
 * Código extraído de la versión original sin cambiar la lógica.
 */

function shuffleArray(array) {
            for (let i = array.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [array[i], array[j]] = [array[j], array[i]];
            }
            return array;
        }

        const CUPISSA_CATALOG_PAGE_SIZE = 1000;
        // Diversidad editorial: evita secuencias extensas del mismo mundo,
        // categoría, subcategoría o temporada sin esconder publicaciones.
        // Opera en memoria sobre cada lote: no cambia SQL, precios ni filtros.
        function catalogDiversityValues(product, singular, plural) {
            const collect = value => {
                if (Array.isArray(value)) return value;
                if (typeof value === 'string') {
                    try {
                        const parsed = JSON.parse(value);
                        if (Array.isArray(parsed)) return parsed;
                    } catch (_) { /* texto simple */ }
                    return value.split(/[,;|]/);
                }
                return [];
            };
            return [...collect(product?.[singular]), ...collect(product?.[plural])]
                .map(value => String(value ?? '').trim().toLocaleUpperCase('es-CO'))
                .filter(Boolean);
        }

        // Mezcla equilibrada por TODAS las dimensiones, a través de todos los lotes.
        // Evalúa candidatos acotados para evitar la búsqueda cuadrática costosa en móviles.
        function spreadCatalogDiversity(rows, preceding = []) {
            const dimensions = [
                ['mundo', 'mundos', 24],
                ['categoria', 'categorias', 16],
                ['subcategoria', 'subcategorias', 11],
                ['temporada', 'temporadas', 8]
            ];
            const describe = product => dimensions.map(([singular, plural]) =>
                catalogDiversityValues(product, singular, plural));
            const pending = shuffleArray(rows.map(row => ({ row, tags: describe(row) })));
            const counts = dimensions.map(() => new Map());
            const recent = preceding.slice(-20).map(describe);
            const output = [];
            // La frecuencia global limita los bloques monótonos incluso después de
            // cientos de publicaciones; la cercanía penaliza categorías repetidas.
            const register = tags => tags.forEach((values, d) => {
                for (const value of new Set(values)) {
                    counts[d].set(value, (counts[d].get(value) || 0) + 1);
                }
            });
            preceding.forEach(product => register(describe(product)));
            while (pending.length) {
                const candidates = Math.min(64, pending.length);
                let best = 0, bestScore = Infinity;
                for (let i = 0; i < candidates; i++) {
                    const tags = pending[i].tags;
                    let score = Math.random() * 0.35;
                    tags.forEach((values, d) => {
                        if (!values.length) return;
                        score += Math.min(...values.map(value => counts[d].get(value) || 0)) * [0.55, 0.4, 0.3, 0.2][d];
                        recent.forEach((other, position) => {
                            if (values.some(value => other[d].includes(value))) {
                                const distance = recent.length - position;
                                score += dimensions[d][2] / Math.pow(distance, 0.72);
                            }
                        });
                    });
                    if (score < bestScore) { bestScore = score; best = i; }
                }
                const [chosen] = pending.splice(best, 1);
                output.push(chosen.row);
                register(chosen.tags);
                recent.push(chosen.tags);
                if (recent.length > 20) recent.shift();
                // Barajar la ventana de candidatos a medida que avanza la selección.
                // Así todo el lote compite, no solamente sus primeras filas.
                if (pending.length > 64) {
                    const from = Math.floor(Math.random() * (pending.length - 63)) + 63;
                    const to = Math.floor(Math.random() * 64);
                    [pending[from], pending[to]] = [pending[to], pending[from]];
                }
            }
            return output;
        }

        // Todos los mundos representados en la primera carga de 500 productos.
        const CUPISSA_INITIAL_WORLDS = [
            'INFANTIL', 'DAMAS', 'CABALLEROS', 'HOGAR', 'PUBLICIDAD Y EVENTOS',
            'DETALLES', 'PERSONALIZADOS', 'CONFECCIONES', 'ACCESORIOS',
            'JUGUETES', 'CALZADO', 'PAPELERÍA', 'FERRETERÍA', 'OTROS'
        ];
        let catalogInitialWorldsPending = true;

        // Garantiza que la selección del administrador esté disponible en la
        // primera carga, independientemente de la página aleatoria consultada.
        async function fetchInitialFeaturedSeasonRows() {
            const season = String(configuredFeaturedSeason || '').trim();
            if (!season || !hasFeaturedSeasonConfiguration) return [];
            const base = () => supabaseClient.from('productos')
                .select(CUPISSA_CATALOG_PRODUCT_FIELDS).eq('oculto', false);
            const [single, multiple] = await Promise.all([
                base().ilike('temporada', season).limit(90),
                base().contains('temporadas', [season]).limit(90)
            ]);
            if (single.error) console.warn('Temporada singular:', single.error);
            if (multiple.error) console.warn('Temporadas múltiples:', multiple.error);
            const unique = new Map();
            [...(single.data || []), ...(multiple.data || [])].forEach(row => {
                if (row?.id != null) unique.set(String(row.id), row);
            });
            return selectVariedFeaturedProducts([...unique.values()], 5).map(p => p);
        }
        // Leer etiquetas ligeras de todas las publicaciones para obtener representantes
        // de cada mundo, categoría, subcategoría y temporada desde la primera carga.
        async function fetchInitialTaxonomyRepresentatives(currentRows) {
            const fields = 'id,mundo,mundos,categoria,categorias,subcategoria,subcategorias,temporada,temporadas';
            const pages = catalogSupabasePageOffsets.slice();
            const metadata = [];
            let next = 0;
            async function worker() {
                while (next < pages.length) {
                    const start = pages[next++];
                    const { data, error } = await supabaseClient.from('productos')
                        .select(fields).eq('oculto', false)
                        .order('created_at', { ascending: false })
                        .range(start, start + CUPISSA_CATALOG_PAGE_SIZE - 1);
                    if (error) throw error;
                    metadata.push(...(data || []));
                }
            }
            try { await Promise.all(Array.from({length: Math.min(4, pages.length)}, worker)); }
            catch (error) { console.warn('Representantes de filtros:', error); return []; }
            const dimensions = [['mundo','mundos'],['categoria','categorias'],['subcategoria','subcategorias'],['temporada','temporadas']];
            const tags = row => dimensions.map(([one,many]) => catalogDiversityValues(row,one,many));
            const seen = dimensions.map(() => new Set());
            const accept = row => tags(row).forEach((values, i) => values.forEach(value => seen[i].add(value)));
            currentRows.forEach(accept);
            const added = [];
            const known = new Set(currentRows.map(row => String(row.id)));
            const candidates = metadata.filter(row => row?.id != null && !known.has(String(row.id)));
            while (candidates.length && added.length < CUPISSA_CATALOG_PAGE_SIZE) {
                let bestIndex = -1, bestScore = 0;
                candidates.forEach((row, index) => {
                    const score = tags(row).reduce((sum, values, i) => sum + values.filter(value => !seen[i].has(value)).length * [8,5,4,3][i], 0);
                    if (score > bestScore) {bestScore = score; bestIndex = index;}
                });
                if (bestIndex < 0) break;
                const [row] = candidates.splice(bestIndex, 1);
                added.push(row.id);
                accept(row);
            }
            const full = [];
            for (let i = 0; i < added.length; i += 100) {
                const {data,error} = await supabaseClient.from('productos')
                    .select(CUPISSA_CATALOG_PRODUCT_FIELDS).eq('oculto',false)
                    .in('id', added.slice(i, i + 100));
                if (error) { console.warn('Productos de filtros:',error); continue; }
                full.push(...(data || []));
            }
            return full;
        }

        let catalogRealtimeChannel = null;
        const catalogRealtimeQueue = [];

        let catalogSupabasePageOffsets = [];
        let catalogSupabasePageIndex = 0;
        let catalogSupabaseHasMore = true;
        let catalogSupabaseLoading = false;
        let catalogSupabaseInitialized = false;
        let catalogLoadedProductIds = new Set();
        const CUPISSA_CATALOG_PRODUCT_FIELDS = 'id,nombre,mundo,mundos,categoria,categorias,subcategoria,subcategorias,temporada,temporadas,precio_detal,precio_mayorista,cant_min_mayorista,porcentaje_anticipo,dias_preparacion,personalizable,al_por_mayor,venta,alquiler,credito,precio_alquiler,valor_deposito,tallas,colores,fotos,created_at,descripcion,accesorios,oculto';

        function tryOpenCatalogProductFromLink() {
            if (window.__cupissaProductLinkOpened) return;
            const productFromLink = new URLSearchParams(window.location.search).get('producto');
            if (!productFromLink) return;
            const product = rawProducts.find(item => String(item.id) === productFromLink);
            if (!product) return;
            window.__cupissaProductLinkOpened = true;
            openOptionsModal(product.id);
        }

        function finishCatalogSupabaseLoading() {
            updateFeaturedSeasonProducts(true);
            renderSeasonFeatured();
            updateSEOStructuredData();
            tryOpenCatalogProductFromLink();
            catalogSupabaseHasMore = false;
        }

        async function loadNextCatalogProductsPage() {
            if (catalogSupabaseLoading || !catalogSupabaseHasMore || !catalogSupabaseInitialized) return false;
            catalogSupabaseLoading = true;
            try {
                const from = catalogSupabasePageOffsets[catalogSupabasePageIndex];
                if (from == null) {
                    finishCatalogSupabaseLoading();
                    return false;
                }
                const to = from + CUPISSA_CATALOG_PAGE_SIZE - 1;
                const { data, error } = await supabaseClient
                    .from('productos')
                    .select(CUPISSA_CATALOG_PRODUCT_FIELDS)
                    .eq('oculto', false)
                    .order('created_at', { ascending: false })
                    .range(from, to);

                if (error) throw error;
                const rows = Array.isArray(data) ? data : [];
                catalogSupabasePageIndex += 1;
                catalogSupabaseHasMore = catalogSupabasePageIndex < catalogSupabasePageOffsets.length;
                if (!rows.length) {
                    if (!catalogSupabaseHasMore) finishCatalogSupabaseLoading();
                    return false;
                }

                // Desordenar cada lote recibido, además de las páginas consultadas aleatoriamente.
                // No reordenar productos ya visibles ni modificar el scroll.
                let selectedRows = shuffleArray([...rows]);
                if (catalogInitialWorldsPending) {
                    catalogInitialWorldsPending = false;
                    // Publicar inmediatamente el lote recibido: ninguna consulta
                    // adicional de mundos, destacados o popularidad debe impedir
                    // utilizar las tarjetas, filtros, carrito y modal existentes.
                    const readyRows = spreadCatalogDiversity(
                        selectedRows.filter(row => row?.id != null && !catalogLoadedProductIds.has(String(row.id))),
                        rawProducts.slice(-8)
                    ).map(normalizeProduct);
                    readyRows.forEach(product => catalogLoadedProductIds.add(String(product.id)));
                    if (readyRows.length) {
                        rawProducts.push(...readyRows);
                        renderFilters();
                        applyFiltersAndSearch();
                        updateFeaturedSeasonProducts(false);
                        tryOpenCatalogProductFromLink();
                        if (typeof window.loadCupissaProductPopularity === 'function') {
                            Promise.resolve().then(() => window.loadCupissaProductPopularity(readyRows))
                                .catch(err => console.warn('Popularidad opcional:', err));
                        }
                    }
                    // Consultas paralelas: la primera muestra incluye 1 producto de cada
                    // mundo con publicaciones disponibles, incluso fuera del rango de 500.
                    const worldRows = await Promise.all(CUPISSA_INITIAL_WORLDS.map(async world => {
                        if (rows.some(row => catalogDiversityValues(row, 'mundo', 'mundos').includes(world))) return null;
                        let response = await supabaseClient.from('productos')
                            .select(CUPISSA_CATALOG_PRODUCT_FIELDS)
                            .eq('oculto', false).eq('mundo', world)
                            .order('created_at', { ascending: false }).limit(1);
                        if (!response.error && response.data?.length) return response.data[0];
                        response = await supabaseClient.from('productos')
                            .select(CUPISSA_CATALOG_PRODUCT_FIELDS)
                            .eq('oculto', false).contains('mundos', [world])
                            .order('created_at', { ascending: false }).limit(1);
                        return (!response.error && response.data?.length) ? response.data[0] : null;
                    }));
                    const representatives = worldRows.filter(Boolean);
                    const taxonomyRows = await fetchInitialTaxonomyRepresentatives([...rows, ...representatives]);
                    const featuredRows = await fetchInitialFeaturedSeasonRows();
                    // Mostrar los representantes desde la primera pantalla, no esperar
                    // a que la carga automática complete los primeros 10 elementos.
                    displayLimit = Math.max(displayLimit, representatives.length + taxonomyRows.length + featuredRows.length);
                    // Reservar siempre los cinco espacios de destacados y uno
                    // por mundo antes de completar el grupo con productos aleatorios.
                    const reserved = new Map();
                    [...featuredRows, ...shuffleArray(representatives), ...shuffleArray(taxonomyRows)].forEach(row => {
                        if (row?.id != null) reserved.set(String(row.id), row);
                    });
                    const rest = spreadCatalogDiversity(rows.filter(row => !reserved.has(String(row.id))));
                    selectedRows = [
                        ...reserved.values(),
                        ...rest.slice(0, Math.max(0, CUPISSA_CATALOG_PAGE_SIZE - reserved.size))
                    ];
                }
                const diversifiedRows = spreadCatalogDiversity(
                    selectedRows.filter(row => row?.id != null && !catalogLoadedProductIds.has(String(row.id))),
                    rawProducts.slice(-8)
                );
                const uniqueBatch = diversifiedRows
                    .filter(row => row?.id != null && !catalogLoadedProductIds.has(String(row.id)))
                    .map(normalizeProduct);

                uniqueBatch.forEach(product => catalogLoadedProductIds.add(String(product.id)));

                if (uniqueBatch.length) {
                    if (typeof window.loadCupissaProductPopularity === 'function') {
                        Promise.resolve().then(() => window.loadCupissaProductPopularity(uniqueBatch))
                            .catch(err => console.warn('Popularidad opcional:', err));
                    }
                    // El lote viene mezclado desde arriba. No depender de una función opcional
                    // de recomendaciones que puede volver a agrupar o alterar la secuencia.
                    const mixedBatch = uniqueBatch;
                    rawProducts.push(...mixedBatch);

                    renderFilters();
                    applyFiltersAndSearch();
                    updateFeaturedSeasonProducts(false);
                    tryOpenCatalogProductFromLink();
                }

                if (!catalogSupabaseHasMore) {
                    finishCatalogSupabaseLoading();
                }
                return uniqueBatch.length > 0;
            } catch (err) {
                console.error('No fue posible cargar el siguiente grupo de productos desde Supabase:', err);
                // Error transitorio: se conservan los productos visibles y
                // la posición de paginación para volver a intentar en el siguiente ciclo.
                const status = document.getElementById('scroll-end-msg');
                if (status && !rawProducts.length) {
                    status.textContent = 'Conexión lenta. Se volverá a intentar cargar los productos.';
                    status.classList.remove('hidden');
                }
                return false;
            } finally {
                catalogSupabaseLoading = false;
            }
        }

        // Descarga progresiva continua de páginas de 1000 después del primer lote.
        // Un único request simultáneo para mantener receptiva la tienda.
        let catalogPrefetchScheduled = false;
        function prefetchRemainingCatalogPages() {
            if (catalogPrefetchScheduled) return;
            catalogPrefetchScheduled = true;
            const step = async () => {
                if (!catalogSupabaseHasMore || !catalogSupabaseInitialized) {
                    catalogPrefetchScheduled = false;
                    return;
                }
                if (document.hidden || !navigator.onLine || catalogSupabaseLoading) {
                    window.setTimeout(step, 750);
                    return;
                }
                await loadNextCatalogProductsPage();
                if (catalogSupabaseHasMore) window.setTimeout(step, 120);
                else catalogPrefetchScheduled = false;
            };
            window.setTimeout(step, 180);
        }

        window.loadNextCupissaCatalogPage = loadNextCatalogProductsPage;
        window.hasMoreCupissaCatalogProducts = () => catalogSupabaseHasMore;

        async function fetchCatalogProducts() {
            rawProducts = [];
            filteredProducts = [];
            catalogSupabasePageOffsets = [];
            catalogSupabasePageIndex = 0;
            catalogSupabaseHasMore = true;
            catalogSupabaseLoading = false;
            catalogSupabaseInitialized = false;
            catalogLoadedProductIds = new Set();
            catalogInitialWorldsPending = true;
            catalogRealtimeQueue.length = 0;
            window.__cupissaProductLinkOpened = false;
            displayLimit = CUPISSA_PRODUCT_BATCH_SIZE;

            await loadConfiguredFeaturedSeason();
            try {
                const { count, error } = await supabaseClient
                    .from('productos')
                    .select('id', { count: 'exact', head: true })
                    .eq('oculto', false);
                if (error) throw error;
                const totalPages = Math.ceil(Number(count || 0) / CUPISSA_CATALOG_PAGE_SIZE);
                catalogSupabasePageOffsets = shuffleArray(
                    Array.from({ length: totalPages }, (_, index) => index * CUPISSA_CATALOG_PAGE_SIZE)
                );
                catalogSupabaseHasMore = catalogSupabasePageOffsets.length > 0;
                catalogSupabaseInitialized = true;
            } catch (error) {
                console.error('No fue posible preparar la paginación aleatoria del catálogo:', error);
                catalogSupabaseHasMore = false;
                renderFilters();
                applyFiltersAndSearch();
                return;
            }
            const loaded = await loadNextCatalogProductsPage();
            if (!loaded && !rawProducts.length) {
                renderFilters();
                applyFiltersAndSearch();
            }
            if (typeof setupAutomaticProductLoading === 'function') setupAutomaticProductLoading();
            prefetchRemainingCatalogPages();
            setupCatalogRealtimeAppendOnly();
        }

        // INSERT: solo anexar al final; DELETE/UPDATE: conservar vista hasta recarga manual.
        // No se restablece rawProducts, displayLimit, filtros ni posición de scroll.
        function setupCatalogRealtimeAppendOnly() {
            if (catalogRealtimeChannel || !supabaseClient?.channel) return;
            catalogRealtimeChannel = supabaseClient.channel('cupissa-catalog-append-only')
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'productos' },
                    async payload => {
                        const id = String(payload.new?.id || '');
                        if (!id || catalogLoadedProductIds.has(id)) return;
                        const { data, error } = await supabaseClient.from('productos')
                            .select(CUPISSA_CATALOG_PRODUCT_FIELDS)
                            .eq('id', id).eq('oculto', false).maybeSingle();
                        if (error || !data || catalogLoadedProductIds.has(id)) return;
                        catalogRealtimeQueue.push(normalizeProduct(data));
                        // No alterar la clasificación de los resultados durante la búsqueda.
                        if (document.getElementById('smart-search-input')?.value?.trim()) return;
                        flushCatalogRealtimeQueue();
                    })
                .subscribe();
        }
        function flushCatalogRealtimeQueue() {
            if (document.getElementById('smart-search-input')?.value?.trim()) return;
            const appended = catalogRealtimeQueue.splice(0).filter(product => {
                if (catalogLoadedProductIds.has(String(product.id))) return false;
                catalogLoadedProductIds.add(String(product.id));
                return true;
            });
            if (!appended.length) return;
            rawProducts.push(...appended);
            renderFilters();
            applyFiltersAndSearch();
        }
        window.flushCupissaNewCatalogProducts = flushCatalogRealtimeQueue;

        async function loadConfiguredFeaturedSeason() {
            hasFeaturedSeasonConfiguration = false;
            configuredFeaturedSeason = '';
            try {
                const { data, error } = await supabaseClient
                    .from('configuracion_destacados_web')
                    .select('temporada_destacada')
                    .eq('id', 1)
                    .maybeSingle();
                if (error) throw error;
                hasFeaturedSeasonConfiguration = true;
                configuredFeaturedSeason = String(data?.temporada_destacada || '')
                    .trim().toUpperCase();
            } catch (error) {
                console.warn('No fue posible leer la temporada elegida por CUPISSA ADMIN:', error);
                // Si la tabla aún no se ha creado, mantiene el comportamiento anterior del catálogo.
                hasFeaturedSeasonConfiguration = false;
                configuredFeaturedSeason = '';
            }
        }

        function parseProductArray(value) {
            if (Array.isArray(value)) return [...value];
            if (typeof value !== 'string' || !value.trim()) return [];
            try {
                const parsed = JSON.parse(value);
                return Array.isArray(parsed) ? parsed : [];
            } catch (_) {
                return [];
            }
        }

        function normalizeProductFilterValues(arrayValue, legacyValue = '') {
            let values = [];
            if (Array.isArray(arrayValue)) {
                values = arrayValue;
            } else if (typeof arrayValue === 'string' && arrayValue.trim()) {
                try {
                    const parsed = JSON.parse(arrayValue);
                    values = Array.isArray(parsed) ? parsed : [arrayValue];
                } catch (_) {
                    values = [arrayValue];
                }
            }
            if (!values.length && legacyValue != null && String(legacyValue).trim()) {
                values = [legacyValue];
            }
            const unique = [];
            values.forEach(value => {
                const clean = String(value ?? '').trim().toUpperCase();
                if (clean && !unique.includes(clean)) unique.push(clean);
            });
            return unique;
        }

        function normalizeProduct(p) {
            let fotosParsed = [];
            if (p.fotos) {
                if (Array.isArray(p.fotos)) fotosParsed = [...p.fotos];
                else if (typeof p.fotos === 'string') {
                    try {
                        const parsed = JSON.parse(p.fotos);
                        fotosParsed = Array.isArray(parsed) ? parsed : [p.fotos];
                    } catch(e) { fotosParsed = [p.fotos]; }
                }
            }

            let coloresParsed = [];
            if (Array.isArray(p.colores)) coloresParsed = [...p.colores];
            else if (typeof p.colores === 'string' && p.colores.trim()) {
                try {
                    const parsed = JSON.parse(p.colores);
                    coloresParsed = Array.isArray(parsed) ? parsed : [];
                } catch (_) { coloresParsed = []; }
            }
            coloresParsed = coloresParsed.map(color =>
                typeof color === 'string'
                    ? { nombre: color, incremento: 0, foto: '' }
                    : {
                        nombre: String(color.nombre || color.color || '').trim(),
                        incremento: Number(color.incremento || 0),
                        foto: String(color.foto || color.imagen || color.imagen_url || '').trim()
                    }
            );

            // Productos antiguos: si cada color tiene una foto correspondiente por orden,
            // vincularla automáticamente para que la selección sea bidireccional.
            if (coloresParsed.length > 0 && fotosParsed.length === coloresParsed.length) {
                coloresParsed = coloresParsed.map((color, index) => ({
                    ...color,
                    foto: color.foto || String(fotosParsed[index] || '')
                }));
            }

            // Cada foto asignada a un color también forma parte de la galería principal.
            coloresParsed.forEach(color => {
                const photo = String(color.foto || color.imagen || color.imagen_url || '').trim();
                if (photo && !fotosParsed.includes(photo)) fotosParsed.push(photo);
            });

            if (fotosParsed.length === 0) {
                fotosParsed = ['https://via.placeholder.com/400x400?text=Cupissa'];
            }

            let fotosOriginalesParsed = [];
            if (Array.isArray(p.fotos_originales)) fotosOriginalesParsed = [...p.fotos_originales];
            else if (typeof p.fotos_originales === 'string' && p.fotos_originales.trim()) {
                try {
                    const parsed = JSON.parse(p.fotos_originales);
                    fotosOriginalesParsed = Array.isArray(parsed) ? parsed : [p.fotos_originales];
                } catch (_) { fotosOriginalesParsed = [p.fotos_originales]; }
            }
            // Las fotos originales se conservan en la base para administración, nunca se exponen al cliente.
            fotosOriginalesParsed = [];

            const mundos = normalizeProductFilterValues(p.mundos, p.mundo || 'GENERAL');
            const categorias = normalizeProductFilterValues(p.categorias, p.categoria || 'GENERAL');
            const subcategorias = normalizeProductFilterValues(p.subcategorias, p.subcategoria || '');
            const temporadas = normalizeProductFilterValues(p.temporadas, p.temporada || '');

            return {
                id: p.id || 'p_' + Math.random().toString(36).substr(2, 9),
                fechaRegistro: p.created_at || p.fecha_creacion || '',
                nombre: (p.nombre || p.title || 'Producto Sin Nombre').toString(),
                descripcion: (p.descripcion || p.description || '').toString(),
                mundos,
                categorias,
                subcategorias,
                temporadas,
                // Campos singulares conservados para compatibilidad con el resto del catálogo.
                mundo: mundos[0] || 'GENERAL',
                categoria: categorias[0] || 'GENERAL',
                subcategoria: subcategorias[0] || '',
                temporada: temporadas[0] || '', 
                precio_detal: parseFloat(p.precio_detal || p.precio || p.price || 0),
                precio_mayorista: parseFloat(p.precio_mayorista || 0),
                precio_alquiler: parseFloat(p.precio_alquiler || 0),
                valor_deposito: parseFloat(p.valor_deposito || 0),
                cant_min_mayorista: parseInt(p.cant_min_mayorista || 6),
                porcentaje_anticipo: parseFloat(p.porcentaje_anticipo || 20),
                dias_preparacion: parseInt(p.dias_preparacion || 0),
                personalizable: !!p.personalizable,
                alquiler: (p.alquiler === true || p.alquiler === 1 || p.alquiler === '1' || String(p.alquiler).toLowerCase() === 'true') && parseFloat(p.precio_alquiler || 0) > 0,
                venta: true,
                fotos: fotosParsed,
                fotos_originales: [],
                tallas: parseProductArray(p.tallas),
                colores: coloresParsed,
                accesorios: parseProductArray(p.accesorios)
            };
        }

        function updateSEOStructuredData() {
            if (!rawProducts || rawProducts.length === 0) return;
            
            const schemaData = {
                '@context': 'https://schema.org',
                '@type': 'CollectionPage',
                name: 'Cupissa',
                url: 'https://cupissa.com/catalogo/',
                mainEntity: {
                    '@type': 'ItemList',
                    itemListElement: rawProducts.map((p, index) => ({
                        '@type': 'ListItem',
                        position: index + 1,
                        name: p.nombre,
                        url: `https://cupissa.com/producto/${encodeURIComponent(String(p.id))}/`
                    }))
                }
            };

            const scriptElem = document.getElementById('seo-schema-script');
            if (scriptElem) {
                scriptElem.textContent = JSON.stringify(schemaData);
            }
        }


function selectVariedFeaturedProducts(products, count = 5) {
    const remaining = shuffleArray([...products]);
    const selected = [];
    const normalized = name => String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(word => word.length > 2 && !['PARA','CON','LOS','LAS','DEL','UNA','UNO','CUPISSA','PERSONALIZADO','PERSONALIZADA'].includes(word));
    const names = [];
    while (remaining.length && selected.length < count) {
        let best = 0, score = -Infinity;
        remaining.forEach((product, index) => {
            const words = new Set(normalized(product.nombre));
            const similarity = Math.max(0, ...names.map(prior => {
                const common = [...words].filter(word => prior.has(word)).length;
                return common / Math.max(1, Math.min(words.size, prior.size));
            }));
            const diversity = [product.mundo, product.categoria, product.subcategoria].reduce((sum, value, i) =>
                sum + (selected.some(item => String([item.mundo,item.categoria,item.subcategoria][i]) === String(value)) ? 0 : [8,6,4][i]), 0);
            const candidateScore = diversity - similarity * 35 + Math.random() * .05;
            if (candidateScore > score) { score = candidateScore; best = index; }
        });
        const [chosen] = remaining.splice(best, 1);
        selected.push(chosen);
        names.push(new Set(normalized(chosen.nombre)));
    }
    return selected;
}

function updateFeaturedSeasonProducts(forceShuffle = false) {
    const seasonal = rawProducts.filter(product => (product.temporadas || [product.temporada]).some(value => String(value || '').trim()));
    if (!seasonal.length) {
        featuredSeasonProducts = [];
        featuredSeasonName = '';
        return;
    }

    const seasonGroups = new Map();
    seasonal.forEach(product => {
        const productSeasons = product.temporadas?.length ? product.temporadas : [product.temporada];
        productSeasons.forEach(season => {
            const name = String(season || '').trim().toUpperCase();
            if (!name) return;
            if (!seasonGroups.has(name)) seasonGroups.set(name, []);
            if (!seasonGroups.get(name).some(item => String(item.id) === String(product.id))) {
                seasonGroups.get(name).push(product);
            }
        });
    });

    let chosenName = '';

    // Si ADMIN ya guardó una selección, esa temporada tiene prioridad absoluta.
    // Un valor NULL guardado significa que no se mostrarán destacados.
    if (hasFeaturedSeasonConfiguration) {
        chosenName = configuredFeaturedSeason && seasonGroups.has(configuredFeaturedSeason)
            ? configuredFeaturedSeason
            : '';
    } else {
        // Compatibilidad temporal con el catálogo anterior si la tabla aún no existe.
        const month = new Date().getMonth() + 1;
        const seasonalMonthRules = [
            { months:[11,12], words:['NAVIDAD','DICIEMBRE','CHRISTMAS'] },
            { months:[9,10], words:['HALLOWEEN','DISFRACES'] },
            { months:[4,5], words:['MADRES','DIA DE LA MADRE'] },
            { months:[5,6], words:['PADRES','DIA DEL PADRE'] },
            { months:[1,2], words:['CARNAVAL','SAN VALENTIN','AMOR'] },
            { months:[8,9], words:['AMOR Y AMISTAD','AMISTAD'] },
            { months:[1,7], words:['REGRESO A CLASES','ESCOLAR'] }
        ];
        const preferred = seasonalMonthRules.find(rule => rule.months.includes(month));
        if (preferred) {
            chosenName = [...seasonGroups.keys()].find(name => preferred.words.some(word => name.includes(word))) || '';
        }
        if (!chosenName) {
            chosenName = [...seasonGroups.entries()]
                .sort((a,b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'es'))[0][0];
        }
    }

    if (!chosenName) {
        featuredSeasonProducts = [];
        featuredSeasonName = '';
        return;
    }

    const group = seasonGroups.get(chosenName) || [];
    if (forceShuffle || chosenName !== featuredSeasonName || !featuredSeasonProducts.length) {
        featuredSeasonName = chosenName;
        featuredSeasonProducts = selectVariedFeaturedProducts(group, 5);
    }
}

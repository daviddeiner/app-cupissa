/* CUPISSA | Indicadores simulados de lanzamiento por producto.
   Valores ilustrativos, estables durante el día y diferentes por producto.
   La actualización se ejecuta únicamente cuando el catálogo dibuja las tarjetas. */
(() => {
  const metricCache = new Map();
  let dayKey = '';

  function currentDayKey() {
    if (dayKey) return dayKey;
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    dayKey = `${values.year}-${values.month}-${values.day}`;
    return dayKey;
  }

  function hashText(value) {
    let hash = 2166136261;
    const text = String(value || 'CUPISSA');
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function simulatedMetrics(productId) {
    const seed = `${productId}|${currentDayKey()}|CUPISSA-LAUNCH`;
    const first = hashText(seed);
    const second = hashText(`${seed}|POPULARIDAD`);
    const viewers = 20 + (first % 61); // 20 a 80
    const maxPurchases = Math.max(10, Math.min(45, viewers - 1));
    const purchases = 10 + (second % (maxPurchases - 9)); // 10 a 45, menor que las vistas
    return { viewers, purchases };
  }

  function updateVisibleCards() {
    document.querySelectorAll('[data-activity-product]').forEach(card => {
      const productId = String(card.dataset.activityProduct || '');
      if (!productId) return;

      let metrics = metricCache.get(productId);
      if (!metrics) {
        metrics = simulatedMetrics(productId);
        metricCache.set(productId, metrics);
      }

      const views = card.querySelector('[data-activity-viewers]');
      const purchases = card.querySelector('[data-activity-purchases]');
      const viewsText = `${metrics.viewers}+`;
      const purchasesText = `${metrics.purchases}+`;

      // Evita escrituras DOM innecesarias.
      if (views && views.textContent !== viewsText) views.textContent = viewsText;
      if (purchases && purchases.textContent !== purchasesText) purchases.textContent = purchasesText;
      if (card.hidden) card.hidden = false;
    });
  }

  // renderProductsGrid llama esta función después de insertar las tarjetas.
  // No usar MutationObserver: modificar textContent genera nuevas mutaciones
  // y puede provocar un ciclo continuo que bloquee el catálogo.
  window.loadProductActivityMetrics = function(products) {
    if (!Array.isArray(products)) return;
    products.forEach(product => {
      const id = String(product?.id || '');
      if (id && !metricCache.has(id)) {
        metricCache.set(id, simulatedMetrics(id));
      }
    });
    updateVisibleCards();
  };

  /*
   * Actividad real para las recomendaciones.
   * Las cifras simuladas anteriores se mantienen intactas y no se usan como ventas.
   */
  const OPEN_COUNTS_KEY = 'cupissa_product_open_counts_v1';
  const VISITOR_KEY = 'cupissa_product_visitor_id_v1';

  function readLocalOpenCounts() {
    try {
      const parsed = JSON.parse(localStorage.getItem(OPEN_COUNTS_KEY) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function getVisitorId() {
    try {
      let visitorId = localStorage.getItem(VISITOR_KEY);
      if (visitorId) return visitorId;
      visitorId = window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : `cupissa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
      localStorage.setItem(VISITOR_KEY, visitorId);
      return visitorId;
    } catch (_) {
      return `cupissa-session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }
  }

  function getPopularityStore() {
    if (!window.CUPISSA_PRODUCT_POPULARITY || typeof window.CUPISSA_PRODUCT_POPULARITY !== 'object') {
      window.CUPISSA_PRODUCT_POPULARITY = Object.create(null);
    }
    return window.CUPISSA_PRODUCT_POPULARITY;
  }

  window.loadCupissaProductPopularity = async function(products) {
    if (!Array.isArray(products) || !products.length) return;
    const ids = [...new Set(products.map(product => String(product?.id || '').trim()).filter(Boolean))];
    if (!ids.length) return;

    try {
      if (typeof supabaseClient === 'undefined' || !supabaseClient?.rpc) return;
      const { data, error } = await supabaseClient.rpc('cupissa_obtener_ranking_productos_web', {
        p_product_ids: ids
      });
      if (error) throw error;

      const store = getPopularityStore();
      (Array.isArray(data) ? data : []).forEach(row => {
        const id = String(row?.product_id || '').trim();
        if (!id) return;
        store[id] = {
          total_vistas: Math.max(0, Number(row.total_vistas || 0)),
          total_compras: Math.max(0, Number(row.total_compras || 0)),
          aperturas_locales: Number(readLocalOpenCounts()[id] || 0)
        };
      });
    } catch (error) {
      // El catálogo sigue funcionando y usa el historial local si la función SQL
      // todavía no se ha instalado en Supabase.
      console.info('[CUPISSA] Ranking global no disponible; se conserva el orden local.', error?.message || error);
    }
  };

  window.registerCupissaProductOpen = function(productId) {
    const id = String(productId || '').trim();
    if (!id) return;

    const localCounts = readLocalOpenCounts();
    localCounts[id] = Math.max(0, Number(localCounts[id] || 0)) + 1;
    try { localStorage.setItem(OPEN_COUNTS_KEY, JSON.stringify(localCounts)); } catch (_) {}

    const store = getPopularityStore();
    const current = store[id] || { total_vistas: 0, total_compras: 0, aperturas_locales: 0 };
    current.aperturas_locales = localCounts[id];
    store[id] = current;

    // El RPC existente registra una visita real del producto abierto, no de toda la grilla.
    try {
      if (typeof supabaseClient !== 'undefined' && supabaseClient?.rpc) {
        supabaseClient.rpc('cupissa_registrar_actividad_productos_web', {
          p_product_ids: [id],
          p_visitante_id: getVisitorId()
        }).then(({ error }) => {
          if (error) console.info('[CUPISSA] No se pudo registrar la apertura del producto:', error.message);
        }).catch(error => console.info('[CUPISSA] Actividad de producto no disponible:', error?.message || error));
      }
    } catch (_) {
      // La apertura del producto no depende del servicio de métricas.
    }
  };

  window.mixCupissaRecommendedProducts = function(products) {
    if (!Array.isArray(products) || products.length < 3) return products || [];
    const store = getPopularityStore();
    const localCounts = readLocalOpenCounts();
    const scored = products.map((product, index) => {
      const id = String(product?.id || '');
      const metrics = store[id] || {};
      const views = Math.max(Number(metrics.total_vistas || 0), Number(localCounts[id] || 0));
      const purchases = Number(metrics.total_compras || 0);
      // Las compras pesan más; las visitas también ayudan a descubrir interés.
      const score = Math.log1p(views) + 2.4 * Math.log1p(purchases);
      return { product, index, score };
    });

    const ranked = scored.filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index);
    if (!ranked.length) return products;

    // Solo se recomienda una fracción del catálogo. Los productos recomendados
    // aparecen intercalados con el resto, no como un bloque de los más vendidos.
    const recommendationCount = Math.min(ranked.length, Math.max(1, Math.ceil(products.length * 0.20)));
    const recommended = ranked.slice(0, recommendationCount);
    const recommendedIds = new Set(recommended.map(item => String(item.product.id)));
    const otherProducts = products.filter(product => !recommendedIds.has(String(product.id)));
    const mixed = [];
    let recommendedIndex = 0;
    let otherIndex = 0;

    while (recommendedIndex < recommended.length || otherIndex < otherProducts.length) {
      if (recommendedIndex < recommended.length) mixed.push(recommended[recommendedIndex++].product);
      for (let slot = 0; slot < 2 && otherIndex < otherProducts.length; slot++) {
        mixed.push(otherProducts[otherIndex++]);
      }
    }
    return mixed;
  };
})();

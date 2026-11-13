/* CUPISSA | Checkout de compras y alquileres con Wompi
   Integración Widget Checkout Web
   Build: 2026-11-05-fixed
*/
(() => {
  'use strict';

  console.info('[CUPISSA] Checkout de pedidos con Wompi inicializado');

  const $ = id => document.getElementById(id);

  const money = value =>
    '$ ' + new Intl.NumberFormat('es-CO', {
      maximumFractionDigits: 0
    }).format(Number(value || 0));

  const escapeHtml = value =>
    String(value ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));

  const SESSION_KEY = 'cupissa_client_session';
  const CART_KEY = 'cupissa_cart';

  // Se conserva la clave antigua para recuperar pagos anteriores.
  const PENDING_KEY = 'cupissa_pending_web_payment';

  // Cada referencia de Wompi tiene su propio registro.
  const PENDING_PREFIX = 'cupissa_pending_web_payment_';
  const LAST_PENDING_KEY = 'cupissa_last_pending_web_payment';

  let clientSession = null;
  let clientProfile = null;
  let currentCart = [];
  let productsById = new Map();
  let productLines = [];
  let cartTotal = 0;
  let advanceTotal = 0;
  let deliveryRates = {};
  let deliveryFee = 0;
  let deliveryIsNational = false;
  let deliveryQuoteStatus = 'UNSELECTED';
  let deliveryQuoteMessage = 'Selecciona tu ciudad y barrio para calcular el domicilio.';
  const DELIVERY_CITY_FALLBACK_MAX = {
    BARRANQUILLA: 15000,
    SOLEDAD: 12000,
    MALAMBO: 15000,
    GALAPA: 15000,
    'LA PLAYA': 18000,
    'PUERTO COLOMBIA': 30000
  };
  const DELIVERY_CITY_LABELS = [
    'BARRANQUILLA', 'SOLEDAD', 'MALAMBO', 'GALAPA', 'LA PLAYA', 'PUERTO COLOMBIA', 'OTRO'
  ];
  let preparedDays = 0;
  let earliestDelivery = '';
  let saleDatePicker = null;
  let rentalDatePicker = null;
  let fullSaleDates = new Set();
  let rentalDays = 1;
  let selectedPaymentMode = '';
  let paymentInProgress = false;

  /* =====================================================
     MENSAJES
  ===================================================== */

  function showAlert(message, kind = 'error') {
    const el = $('checkout-alert');
    if (!el) return;

    const technicalTerms = [
      'swift',
      'supabase',
      'invoke',
      'signature',
      'token',
      'functions'
    ];

    const textMessage = String(message || '');

    const isTechnical = technicalTerms.some(term =>
      textMessage.toLowerCase().includes(term)
    );

    const displayMessage =
      kind === 'error' && isTechnical
        ? 'No pudimos procesar tu solicitud en este momento. Por favor, inténtalo nuevamente o comunícate con CUPISSA.'
        : textMessage;

    el.className = `checkout-alert ${kind === 'success' ? 'success' : ''}`;
    el.textContent = displayMessage;
    el.classList.remove('hidden');

    el.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest'
    });
  }

  function hideAlert() {
    const el = $('checkout-alert');

    if (el) {
      el.classList.add('hidden');
      el.innerHTML = '';
    }
  }

  /* =====================================================
     SESIÓN
  ===================================================== */

  function sessionFromStorage() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    } catch (_) {
      return null;
    }
  }

  function redirectToProfile() {
    const returnUrl = encodeURIComponent('/checkout');

    location.replace(
      `/perfil?next=checkout&mode=register&return=${returnUrl}`
    );
  }

  /* =====================================================
     FECHAS
  ===================================================== */

  function localDateKey(date = new Date()) {
    const p = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date);

    const v = Object.fromEntries(
      p.map(x => [x.type, x.value])
    );

    return `${v.year}-${v.month}-${v.day}`;
  }

  function addDays(key, count) {
    const [y, m, d] = key.split('-').map(Number);

    const date = new Date(
      Date.UTC(y, m - 1, d + count, 12)
    );

    return [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, '0'),
      String(date.getUTCDate()).padStart(2, '0')
    ].join('-');
  }

  function weekday(key) {
    const [y, m, d] = key.split('-').map(Number);

    return new Date(
      Date.UTC(y, m - 1, d, 12)
    ).getUTCDay();
  }

  function fmtKey(key) {
    if (!key) return '';

    const [y, m, d] = key.split('-').map(Number);

    return new Intl.DateTimeFormat('es-CO', {
      dateStyle: 'long',
      timeZone: 'UTC'
    }).format(
      new Date(Date.UTC(y, m - 1, d, 12))
    );
  }

  function easterDate(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a - b + d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);

    const month = Math.floor(
      (h + l - 7 * m + 114) / 31
    );

    const day =
      ((h + l - 7 * m + 114) % 31) + 1;

    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function moveToMonday(key) {
    return weekday(key) === 1
      ? key
      : addDays(key, (8 - weekday(key)) % 7 || 7);
  }

  function colombianHolidays(year) {
    const set = new Set();

    const fixed = [
      `${year}-01-01`,
      `${year}-05-01`,
      `${year}-07-20`,
      `${year}-08-07`,
      `${year}-12-08`,
      `${year}-12-25`
    ];

    fixed.forEach(x => set.add(x));

    const moved = [
      `${year}-01-06`,
      `${year}-03-19`,
      `${year}-06-29`,
      `${year}-08-15`,
      `${year}-10-12`,
      `${year}-11-01`,
      `${year}-11-11`
    ];

    moved.forEach(x => set.add(moveToMonday(x)));

    const easter = easterDate(year);

    set.add(addDays(easter, -3));
    set.add(addDays(easter, -2));

    [39, 60, 68].forEach(n =>
      set.add(moveToMonday(addDays(easter, n)))
    );

    return set;
  }

  const holidayCache = new Map();

  function isHoliday(key) {
    const year = Number(key.slice(0, 4));

    if (!holidayCache.has(year)) {
      holidayCache.set(year, colombianHolidays(year));
    }

    return holidayCache.get(year).has(key);
  }

  function isBlockedDate(date) {
    const key = date instanceof Date
      ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      : date;

    return weekday(key) === 0 || isHoliday(key);
  }

  function isProductionDay(key) {
    return !isBlockedDate(key);
  }

  function getEarliestDelivery(days) {
    const today = localDateKey();

    let candidate = today;
    let remaining = Math.max(0, Number(days || 0));

    if (remaining > 0) {
      candidate = addDays(candidate, 1);

      while (remaining > 0) {
        if (isProductionDay(candidate)) {
          remaining--;
        }

        candidate = addDays(candidate, 1);
      }
    }

    while (
      isBlockedDate(candidate) ||
      candidate < today
    ) {
      candidate = addDays(candidate, 1);
    }

    return candidate;
  }

  /* =====================================================
     PRODUCTOS Y OPCIONES
  ===================================================== */

  function parseJsonArray(value) {
    if (Array.isArray(value)) return value;

    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        return [];
      }
    }

    return [];
  }

  function optionExtra(options, selected) {
    if (!selected) return 0;

    const match = parseJsonArray(options).find(o =>
      String(o.nombre ?? o.name ?? '') === String(selected)
    );

    if (!match) {
      throw new Error(
        `La opción “${selected}” ya no está disponible en uno de tus productos. Regresa al catálogo y actualiza el carrito.`
      );
    }

    return Number(
      match.incremento || match.adicional || 0
    );
  }

  // Suma todas las variantes del producto con la misma modalidad,
  // en correspondencia con la validación de precios del servidor.
  let checkoutQuantityByProductMode = new Map();
  function updateCheckoutWholesaleQuantities(items) {
    checkoutQuantityByProductMode = new Map();
    for (const item of items) {
      const key = `${String(item.productId || '')}::${String(item.modalidad || 'VENTA').toUpperCase()}`;
      const quantity = Math.max(1, Math.floor(Number(item.cantidad || 1)));
      checkoutQuantityByProductMode.set(key, (checkoutQuantityByProductMode.get(key) || 0) + quantity);
    }
  }

  function baseUnitPrice(product, item) {
    const rental =
      String(item.modalidad || '').toUpperCase() === 'ALQUILER';

    let unit = rental
      ? Number(product.precio_alquiler || 0)
      : Number(
          product.precio_detal ||
          product.precio ||
          product.price ||
          0
        );

    const quantityKey = `${String(item.productId || '')}::${String(item.modalidad || 'VENTA').toUpperCase()}`;
    const qty = checkoutQuantityByProductMode.get(quantityKey) ||
      Math.max(1, Number(item.cantidad || 1));

    if (
      !rental &&
      Number(product.cant_min_mayorista || 0) > 0 &&
      qty >= Number(product.cant_min_mayorista) &&
      Number(product.precio_mayorista || 0) > 0
    ) {
      unit = Number(product.precio_mayorista);
    }

    if (!rental) unit += optionExtra(product.tallas, item.talla);
    unit += optionExtra(product.colores, item.color);
    unit += optionExtra(product.accesorios, item.accesorio);

    return unit;
  }

  function safeProductPhotos(product) {
    const photos = parseJsonArray(product.fotos);

    if (photos.length) {
      return photos
        .filter(x =>
          typeof x === 'string' &&
          /^https?:\/\//i.test(x)
        )
        .slice(0, 6);
    }

    if (
      typeof product.fotos === 'string' &&
      /^https?:\/\//i.test(product.fotos)
    ) {
      return [product.fotos];
    }

    return [];
  }

  function rentalPriceFactor(days = rentalDays) {
    return 1 +
      (Math.max(1, Math.min(5, Number(days || 1))) - 1) * 0.5;
  }

  /* =====================================================
     CARRITO
  ===================================================== */

  function renderMiniCart() {
    const container = $('checkout-mini-cart');

    if (!container) return;

    if (!Array.isArray(productLines) || !productLines.length) {
      container.innerHTML =
        '<p class="text-xs text-slate-400">No hay productos en el pedido.</p>';

      if ($('cart-item-count')) {
        $('cart-item-count').textContent = '0 productos';
      }

      if ($('checkout-mini-total')) {
        $('checkout-mini-total').textContent = orderTotalLabel();
      }

      return;
    }

    container.innerHTML = productLines.map(line => `
      <article class="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
        <img
          src="${escapeHtml(line.foto || 'catalogo/assets/images/favicon.png')}"
          alt="${escapeHtml(line.nombre)}"
          class="w-14 h-14 rounded-xl object-cover bg-slate-100 flex-shrink-0"
          loading="lazy"
        >

        <div class="min-w-0 flex-1">
          <strong class="block text-xs font-extrabold text-slate-900 line-clamp-2">
            ${escapeHtml(line.nombre)}
          </strong>

          <p class="text-[10px] text-slate-500 mt-1">
            ${line.cantidad} unidad(es) ·
            ${line.modalidad === 'ALQUILER'
              ? `ALQUILER · ${line.diasAlquiler || rentalDays} día(s)`
              : 'VENTA'}
            ${line.accesorio
              ? ` · Accesorio: ${escapeHtml(line.accesorio)}`
              : ''}
          </p>

          ${line.deposito
            ? `<p class="text-[10px] text-amber-700 font-semibold">Depósito reembolsable: ${money(line.deposito)}</p>`
            : ''}
        </div>

        <strong class="text-xs font-black text-slate-900 whitespace-nowrap">
          ${money(line.total)}
        </strong>
      </article>
    `).join('');

    const units = productLines.reduce(
      (sum, line) => sum + Number(line.cantidad || 0),
      0
    );

    if ($('cart-item-count')) {
      $('cart-item-count').textContent =
        `${units} producto${units === 1 ? '' : 's'}`;
    }

    if ($('checkout-mini-total')) {
      $('checkout-mini-total').textContent = orderTotalLabel();
    }
  }

  function recalculateCartAmounts() {
    productLines.forEach(line => {
      const factor =
        line.modalidad === 'ALQUILER'
          ? rentalPriceFactor(rentalDays)
          : 1;

      line.precioUnitario = Math.round(
        line.precioInicial * factor
      );

      line.total = Math.round(
        line.precioUnitario * line.cantidad
      );

      line.anticipoCalculado = Math.round(
        line.total * line.porcentajeAnticipo / 100
      );

      line.diasAlquiler =
        line.modalidad === 'ALQUILER'
          ? rentalDays
          : 0;
    });

    cartTotal = productLines.reduce(
      (sum, line) => sum + line.total,
      0
    );

    advanceTotal = productLines.reduce(
      (sum, line) => sum + line.anticipoCalculado,
      0
    );

    const saleLines = productLines.filter(
      line => line.modalidad !== 'ALQUILER'
    );

    const saleUnits = saleLines.reduce(
      (sum, line) => sum + line.cantidad,
      0
    );

    const longestPrep = saleLines.reduce(
      (max, line) => Math.max(max, line.diasPreparacion),
      0
    );

    preparedDays =
      saleUnits > 0
        ? longestPrep + saleUnits - 1
        : 0;

    earliestDelivery =
      saleUnits > 0
        ? getEarliestDelivery(preparedDays)
        : addDays(localDateKey(), 1);
  }

  function parseStoredCartValue(raw) {
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function resolveCheckoutCart() {
    const sharedCart = parseStoredCartValue(
      localStorage.getItem(CART_KEY)
    );

    if (sharedCart.length) return sharedCart;

    const candidates = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);

      if (
        !key ||
        !key.startsWith('cupissa_cart_account_')
      ) {
        continue;
      }

      const accountPart = key.slice(
        'cupissa_cart_account_'.length
      );

      const updatedKey =
        `cupissa_catalog_updated_account_${accountPart}`;

      const updatedValue = localStorage.getItem(updatedKey);
      const timestamp = updatedValue
        ? new Date(updatedValue).getTime()
        : 0;

      candidates.push({
        key,
        timestamp: Number.isFinite(timestamp) ? timestamp : 0
      });
    }

    candidates.sort((a, b) => b.timestamp - a.timestamp);

    for (const candidate of candidates) {
      const recovered = parseStoredCartValue(
        localStorage.getItem(candidate.key)
      );

      if (!recovered.length) continue;

      try {
        localStorage.setItem(
          CART_KEY,
          JSON.stringify(recovered)
        );
      } catch (error) {
        console.warn(
          'No fue posible guardar la migración del carrito:',
          error
        );
      }

      return recovered;
    }

    return [];
  }

  async function loadCartAndProducts() {
    currentCart = resolveCheckoutCart();

    if (!Array.isArray(currentCart) || !currentCart.length) {
      throw new Error(
        'Tu carrito está vacío. Regresa al catálogo, agrega los productos y vuelve a procesar el pedido.'
      );
    }

    currentCart = currentCart
      .map(item => ({
        ...item,
        productId: String(
          item.productId ??
          item.product_id ??
          item.producto_id ??
          ''
        )
      }))
      .filter(item => item.productId);

    if (!currentCart.length) {
      throw new Error(
        'Los productos guardados en tu carrito ya no tienen una referencia válida. Regresa al catálogo y agrégalos nuevamente.'
      );
    }

    const ids = [
      ...new Set(
        currentCart
          .map(item => String(item.productId))
          .filter(Boolean)
      )
    ];

    const { data, error } = await supabaseClient
      .from('productos')
      .select('*')
      .in('id', ids)
      .eq('oculto', false);

    if (error) throw error;

    productsById = new Map(
      (data || []).map(product => [
        String(product.id),
        product
      ])
    );

    if (productsById.size !== ids.length) {
      throw new Error(
        'Uno o más productos ya no están disponibles. Regresa al catálogo y actualiza el carrito.'
      );
    }

    updateCheckoutWholesaleQuantities(currentCart);
    productLines = currentCart.map(item => {
      const product = productsById.get(
        String(item.productId)
      );

      const quantity = Math.max(
        1,
        Number(item.cantidad || 1)
      );

      const mode = String(
        item.modalidad || 'VENTA'
      ).toUpperCase();

      const initialUnit = baseUnitPrice(product, item);

      const percentage = Number(
        product.porcentaje_anticipo ||
        item.porcentajeAnticipo ||
        20
      );

      const rental = mode === 'ALQUILER';
      const photos = safeProductPhotos(product);

      return {
        productId: String(item.productId),
        nombre: String(
          product.nombre ||
          item.nombre ||
          'Producto CUPISSA'
        ),
        modalidad: mode,
        cantidad: quantity,
        cantidadMayorista: Math.max(quantity, Number(item.cantidadMayorista || quantity)),
        talla: item.talla || '',
        color: item.color || '',
        accesorio: item.accesorio || '',
        customText: item.customText || '',
        precioInicial: initialUnit,
        precioUnitario: initialUnit,
        total: Math.round(initialUnit * quantity),
        porcentajeAnticipo: Math.max(
          0,
          Math.min(100, percentage)
        ),
        anticipoCalculado: Math.round(
          initialUnit * quantity * percentage / 100
        ),
        deposito: rental
          ? Math.max(0, Number(product.valor_deposito || 0)) * quantity
          : 0,
        diasPreparacion: rental
          ? 0
          : Math.max(
              0,
              Number(product.dias_preparacion || 0)
            ),
        diasAlquiler: rental ? rentalDays : 0,
        fotos: photos,
        foto: item.foto || photos[0] || ''
      };
    });

    recalculateCartAmounts();
  }

  /* =====================================================
     CALENDARIO
  ===================================================== */

  async function loadFullSaleDates() {
    const from = localDateKey();
    const to = addDays(from, 370);

    try {
      const { data, error } = await supabaseClient.rpc(
        'cupissa_fechas_sin_cupo',
        {
          p_desde: from,
          p_hasta: to
        }
      );

      if (error) throw error;

      fullSaleDates = new Set(
        (data || [])
          .map(row =>
            typeof row === 'string'
              ? row
              : row.fecha
          )
          .filter(Boolean)
      );

    } catch (error) {
      console.warn(
        'No fue posible consultar el cupo de las fechas:',
        error
      );

      fullSaleDates = new Set();
    }
  }

  function asDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  async function initCalendar() {
    const hasSale = productLines.some(
      line => line.modalidad !== 'ALQUILER'
    );

    const hasRental = productLines.some(
      line => line.modalidad === 'ALQUILER'
    );

    const saleField = $('sale-date-field');
    const rentalField = $('rental-date-field');
    const rentalDaysField = $('rental-days-field');
    const saleNote = $('delivery-date-note');
    const rentalNoteElement = $('rental-date-note');

    if (saleField) {
      saleField.classList.toggle('hidden', !hasSale);
    }

    if (rentalField) {
      rentalField.classList.toggle('hidden', !hasRental);
    }

    if (rentalDaysField) {
      rentalDaysField.classList.toggle('hidden', !hasRental);
    }

    if (saleNote) {
      saleNote.classList.toggle('hidden', !hasSale);
    }

    if (rentalNoteElement) {
      rentalNoteElement.classList.toggle('hidden', !hasRental);
    }

    if ($('delivery-date')) {
      $('delivery-date').required = hasSale;
    }

    if ($('rental-date')) {
      $('rental-date').required = hasRental;
    }

    if (hasSale) {
      await loadFullSaleDates();
    }

    if (!window.flatpickr) {
      showAlert(
        'No se pudo cargar el calendario. Recarga la página.'
      );
      return;
    }

    if (window.flatpickr.l10ns?.es) {
      window.flatpickr.localize(
        window.flatpickr.l10ns.es
      );
    }

    if (hasSale) {
      const note = $('delivery-date-note');

      if (note) {
        note.classList.remove('hidden');

        note.innerHTML = `
          <i class="fa-regular fa-calendar-check"></i>
          <span>
            ${preparedDays
              ? `Este pedido requiere ${preparedDays} día(s) hábil(es) de producción. Primera fecha disponible: ${escapeHtml(fmtKey(earliestDelivery))}.`
              : `Selecciona la fecha de entrega de tu compra. Primera fecha disponible: ${escapeHtml(fmtKey(earliestDelivery))}.`}
            Los domingos, festivos y fechas sin cupo no están disponibles.
          </span>
        `;
      }

      saleDatePicker = window.flatpickr(
        '#delivery-date',
        {
          dateFormat: 'Y-m-d',
          altInput: true,
          altFormat: 'l, j F Y',
          minDate: earliestDelivery,
          disable: [
            date =>
              isBlockedDate(date) ||
              fullSaleDates.has(asDateKey(date))
          ],
          allowInput: false,
          onChange: () =>
            $('delivery-date')?.setCustomValidity('')
        }
      );
    }

    if (hasRental) {
      const rentalNote = $('rental-date-note');

      if (rentalNote) {
        rentalNote.classList.remove('hidden');

        rentalNote.innerHTML = `
          <i class="fa-regular fa-calendar-check"></i>
          <span>
            EL ALQUILER ES POR 24 HORAS. SOLICITA TU PEDIDO PARA UN DÍA ANTES DE LA FECHA DEL EVENTO.
          </span>
        `;
      }

      rentalDatePicker = window.flatpickr(
        '#rental-date',
        {
          dateFormat: 'Y-m-d',
          altInput: true,
          altFormat: 'l, j F Y',
          minDate: addDays(localDateKey(), 1),
          allowInput: false,
          onChange: () => {
            $('rental-date')?.setCustomValidity('');
            void notifyRentalDateAvailability();
          }
        }
      );
    }
  }

  function updateRentalDays() {
    rentalDays = Math.max(
      1,
      Math.min(5, Number($('rental-days')?.value || 1))
    );

    recalculateCartAmounts();
    renderMiniCart();
    void notifyRentalDateAvailability();

    if (
      $('checkout-step-2') &&
      !$('checkout-step-2').classList.contains('hidden')
    ) {
      renderSummary();
    }
  }

  /* =====================================================
     CONEXIÓN CON EDGE FUNCTION
  ===================================================== */

  async function callCheckoutFunction(body) {
    if (!supabaseClient?.functions?.invoke) {
      throw new Error(
        'No está disponible la conexión segura con el servidor de CUPISSA.'
      );
    }

    const { data, error } =
      await supabaseClient.functions.invoke(
        'swift-endpoint',
        { body }
      );

    if (error) {
      let serverMessage = '';
      const response = error.context;

      // Supabase FunctionsHttpError conserva la respuesta HTTP en context.
      // Leer una copia permite mostrar el mensaje real del backend (400/409/500).
      if (response && typeof response.clone === 'function') {
        try {
          const payload = await response.clone().json();
          serverMessage = String(
            payload?.error || payload?.message || payload?.details || ''
          ).trim();
        } catch (_) {
          try {
            serverMessage = String(await response.clone().text()).trim();
          } catch (_) {
            serverMessage = '';
          }
        }
      }

      if (!serverMessage && data?.error) {
        serverMessage = String(data.error);
      }

      throw new Error(
        serverMessage || error.message ||
        'No fue posible comunicarse con el servidor de pagos.'
      );
    }

    if (data?.error) {
      throw new Error(String(data.error));
    }

    if (!data || typeof data !== 'object') {
      throw new Error(
        'El servidor de CUPISSA devolvió una respuesta vacía.'
      );
    }

    return data;
  }

  /* =====================================================
     DOMICILIOS Y ENVÍOS
  ===================================================== */

  function normalizeLocationText(value) {
    return String(value || '')
      .trim()
      .toLocaleUpperCase('es-CO')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  }

  function canonicalDeliveryCity(value) {
    const normalized = normalizeLocationText(value);
    return DELIVERY_CITY_LABELS.find(city => normalizeLocationText(city) === normalized && city !== 'OTRO') || '';
  }

  function currentCityInputValue() {
    return normalizeLocationText($('customer-city')?.value);
  }

  function currentNeighborhoodInputValue() {
    return normalizeLocationText($('customer-neighborhood')?.value);
  }

  function getFinalCityValue() {
    const selected = currentCityInputValue();
    if (selected === 'OTRO') return String($('customer-city-other')?.value || '').trim().toLocaleUpperCase('es-CO');
    return String($('customer-city')?.value || '').trim().toLocaleUpperCase('es-CO');
  }

  function getFinalNeighborhoodValue() {
    const selected = currentNeighborhoodInputValue();
    if (selected === 'OTRO') return String($('customer-neighborhood-other')?.value || '').trim().toLocaleUpperCase('es-CO');
    return String($('customer-neighborhood')?.value || '').trim().toLocaleUpperCase('es-CO');
  }

  async function loadDeliveryRates() {
    try {
      const response = await fetch('/assets/data/domicilios.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      deliveryRates = payload?.ciudades && typeof payload.ciudades === 'object' ? payload.ciudades : {};
    } catch (error) {
      console.error('[CUPISSA] No fue posible cargar el tarifario de domicilios:', error);
      deliveryRates = {};
    }
  }

  function getNeighborhoodOptions(cityKey) {
    const records = Array.isArray(deliveryRates[cityKey]) ? deliveryRates[cityKey] : [];
    const values = [...new Set(records.map(item => String(item.barrio || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'es'));
    return [...values, 'OTRO'];
  }

  function renderDeliverySuggestions(type) {
    const isCity = type === 'city';
    const input = $(isCity ? 'customer-city' : 'customer-neighborhood');
    const panel = $(isCity ? 'customer-city-suggestions' : 'customer-neighborhood-suggestions');
    if (!input || !panel) return;

    const cityKey = canonicalDeliveryCity(currentCityInputValue());
    const options = isCity ? DELIVERY_CITY_LABELS : getNeighborhoodOptions(cityKey);
    const query = normalizeLocationText(input.value);
    const filtered = options.filter(value => !query || normalizeLocationText(value).includes(query));
    // Permite elegir OTRO aunque no haya coincidencias con el texto escrito.
    if (!isCity && !filtered.includes('OTRO')) filtered.push('OTRO');
    const visible = filtered.slice(0, 45);

    if (!visible.length) {
      panel.innerHTML = '<p class="px-3 py-2 text-[11px] text-slate-400">Sin coincidencias. Puedes escribir el dato completo.</p>';
    } else {
      panel.innerHTML = visible.map(value => `
        <button type="button" role="option" aria-selected="false" data-delivery-option="${escapeHtml(value)}" class="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-pink-50 hover:text-pink-700 focus:bg-pink-50 focus:text-pink-700 focus:outline-none">
          ${escapeHtml(value)}
        </button>
      `).join('');
      panel.querySelectorAll('[data-delivery-option]').forEach(option => {
        option.addEventListener('mousedown', event => event.preventDefault());
        option.addEventListener('click', () => {
          input.value = option.dataset.deliveryOption || '';
          closeDeliverySuggestions(type);
          input.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });
    }

    panel.classList.remove('hidden');
    input.setAttribute('aria-expanded', 'true');
  }

  function closeDeliverySuggestions(type) {
    const isCity = type === 'city';
    const panel = $(isCity ? 'customer-city-suggestions' : 'customer-neighborhood-suggestions');
    const input = $(isCity ? 'customer-city' : 'customer-neighborhood');
    panel?.classList.add('hidden');
    input?.setAttribute('aria-expanded', 'false');
  }

  function updateDeliveryFieldVisibility() {
    const cityValue = currentCityInputValue();
    const isOtherCity = cityValue === 'OTRO';
    $('customer-city-other-wrap')?.classList.toggle('hidden', !isOtherCity);
    const cityOther = $('customer-city-other');
    if (cityOther) {
      cityOther.required = isOtherCity;
      if (!isOtherCity) cityOther.value = '';
    }

    const neighborhoodValue = currentNeighborhoodInputValue();
    const isOtherNeighborhood = neighborhoodValue === 'OTRO';
    $('customer-neighborhood-other-wrap')?.classList.toggle('hidden', !isOtherNeighborhood);
    const neighborhoodOther = $('customer-neighborhood-other');
    if (neighborhoodOther) {
      neighborhoodOther.required = isOtherNeighborhood;
      if (!isOtherNeighborhood) neighborhoodOther.value = '';
    }
  }

  function calculateDeliveryQuote() {
    const rawCity = currentCityInputValue();
    const city = rawCity === 'OTRO'
      ? normalizeLocationText($('customer-city-other')?.value)
      : rawCity;
    const neighborhoodRaw = currentNeighborhoodInputValue();
    const neighborhood = neighborhoodRaw === 'OTRO'
      ? normalizeLocationText($('customer-neighborhood-other')?.value)
      : neighborhoodRaw;
    const cityKey = canonicalDeliveryCity(city);

    if (!city) {
      return {
        fee: 0, national: false, status: 'UNSELECTED',
        message: 'Selecciona tu ciudad y barrio para calcular el domicilio.'
      };
    }

    if (!cityKey) {
      return {
        fee: 0, national: true, status: 'NATIONAL_TO_QUOTE',
        message: 'Envío nacional: el valor del envío será incluido en el total a cancelar al momento de recibir.'
      };
    }

    if (!neighborhood) {
      return {
        fee: 0, national: false, status: 'NEIGHBORHOOD_REQUIRED',
        message: `Selecciona o escribe el barrio de ${cityKey} para calcular el domicilio.`
      };
    }

    const records = Array.isArray(deliveryRates[cityKey]) ? deliveryRates[cityKey] : [];
    const matched = neighborhoodRaw !== 'OTRO'
      ? records.find(item => normalizeLocationText(item.barrio) === neighborhood)
      : null;

    if (matched && Number.isFinite(Number(matched.tarifa))) {
      const fee = Math.max(0, Number(matched.tarifa));
      return {
        fee, national: false, status: 'LOCAL_REGISTERED',
        message: `Domicilio para ${cityKey} - ${String(matched.barrio).toLocaleUpperCase('es-CO')}: ${money(fee)}. Se suma automáticamente al total de tu pedido.`
      };
    }

    const fallback = Number(DELIVERY_CITY_FALLBACK_MAX[cityKey] || 0);
    return {
      fee: fallback, national: false, status: 'LOCAL_OTHER_NEIGHBORHOOD',
      message: `Domicilio local: barrio no registrado en el tarifario. Se aplica la tarifa máxima registrada para ${cityKey} (${money(fallback)}) y se suma al total del pedido.`
    };
  }

  function refundableDepositTotal() {
    return productLines.reduce((sum, line) => sum +
      (line.modalidad === 'ALQUILER' ? Math.max(0, Number(line.deposito || 0)) : 0), 0);
  }

  function orderTotal() {
    return Math.max(0, Number(cartTotal || 0) + refundableDepositTotal() +
      (deliveryIsNational ? 0 : Number(deliveryFee || 0)));
  }

  function orderTotalLabel() {
    const amount = money(orderTotal());
    return deliveryIsNational ? `${amount} + envío por cotizar` : amount;
  }

  function updateDeliveryQuote() {
    const quote = calculateDeliveryQuote();
    deliveryFee = quote.fee;
    deliveryIsNational = quote.national;
    deliveryQuoteStatus = quote.status;
    deliveryQuoteMessage = quote.message;

    const note = $('delivery-fee-note');
    if (note) {
      const icon = quote.national ? 'fa-earth-americas' : 'fa-truck-fast';
      note.innerHTML = `<i class="fa-solid ${icon}"></i><span>${escapeHtml(quote.message)}</span>`;
    }

    const totalText = orderTotalLabel();
    if ($('checkout-mini-total')) $('checkout-mini-total').textContent = totalText;
    if ($('checkout-shipping')) {
      $('checkout-shipping').textContent = quote.national
        ? 'Por cotizar al recibir'
        : (quote.status === 'UNSELECTED' || quote.status === 'NEIGHBORHOOD_REQUIRED' ? 'Selecciona barrio' : money(deliveryFee));
    }
    if ($('checkout-grand-total')) $('checkout-grand-total').textContent = totalText;
    if ($('checkout-subtotal')) $('checkout-subtotal').textContent = money(cartTotal);
    if ($('checkout-refund-deposit')) $('checkout-refund-deposit').textContent = money(refundableDepositTotal());
    if ($('checkout-refund-deposit-row')) $('checkout-refund-deposit-row').classList.toggle('hidden', refundableDepositTotal() === 0);
    if ($('pay-total-value')) $('pay-total-value').textContent = money(orderTotal());

    const disclaimer = $('checkout-shipping-disclaimer');
    if (disclaimer) {
      disclaimer.textContent = quote.national
        ? 'El envío nacional se cotiza por separado y su valor se cobrará al recibir el pedido. El pago en línea corresponde a los productos.'
        : 'El domicilio local calculado con el tarifario se suma automáticamente al total del pedido.';
    }
  }

  /* =====================================================
     PERFIL DEL CLIENTE
  ===================================================== */

  async function loadCustomerProfile() {
    clientSession = sessionFromStorage();

    if (!clientSession?.id || !clientSession?.password) {
      localStorage.removeItem(SESSION_KEY);
      redirectToProfile();
      return false;
    }

    let profile = null;

    const phone = String(
      clientSession.telefono || ''
    ).trim();

    if (phone) {
      const { data, error } = await supabaseClient
        .from('clientes_web')
        .select('*')
        .eq('telefono', phone)
        .maybeSingle();

      if (error) throw error;

      profile = data;
    }

    const nameParts = String(
      clientSession.nombre || ''
    )
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    clientProfile = profile || {
      nombres: nameParts.shift() || '',
      apellidos: nameParts.join(' '),
      telefono: clientSession.telefono || '',
      correo: clientSession.correo || '',
      direccion: '',
      barrio: '',
      ciudad: ''
    };

    return true;
  }

  function fillCustomerForm(profile) {
    // Los datos de identidad provienen del perfil y no se editan durante el pedido.
    const fullName = (
      `${profile.nombres || ''} ${profile.apellidos || ''}`
    )
      .trim()
      .split(/\s+/);

    $('customer-first-name').value =
      String(
        profile.nombres ||
        fullName.shift() ||
        ''
      ).toLocaleUpperCase('es-CO');

    $('customer-last-name').value =
      String(
        profile.apellidos ||
        fullName.join(' ')
      ).toLocaleUpperCase('es-CO');

    $('customer-email').value =
      String(
        profile.correo ||
        clientSession?.correo ||
        ''
      ).toLowerCase();

    $('customer-phone').value =
      profile.telefono ||
      clientSession?.telefono ||
      '';

    ['customer-first-name','customer-last-name','customer-email','customer-phone'].forEach(id => {
      const field = $(id);
      if (field) { field.readOnly = true; field.setAttribute('aria-readonly', 'true'); }
    });

    $('customer-address').value =
      String(profile.direccion || '')
        .toLocaleUpperCase('es-CO');

    $('customer-city').value =
      String(profile.ciudad || '')
        .toLocaleUpperCase('es-CO');

    $('customer-neighborhood').value =
      String(profile.barrio || '')
        .toLocaleUpperCase('es-CO');
  }

  function getFormData() {
    const hasSale = productLines.some(
      line => line.modalidad !== 'ALQUILER'
    );

    const hasRental = productLines.some(
      line => line.modalidad === 'ALQUILER'
    );

    const saleDate = hasSale
      ? $('delivery-date').value.trim()
      : '';

    const rentalDate = hasRental
      ? $('rental-date').value.trim()
      : '';

    return {
      nombres: $('customer-first-name')
        .value.trim()
        .toLocaleUpperCase('es-CO'),

      apellidos: $('customer-last-name')
        .value.trim()
        .toLocaleUpperCase('es-CO'),

      correo: $('customer-email')
        .value.trim()
        .toLowerCase(),

      telefono: $('customer-phone')
        .value.trim(),

      direccion: $('customer-address')
        .value.trim()
        .toLocaleUpperCase('es-CO'),

      ciudad: getFinalCityValue(),

      barrio: getFinalNeighborhoodValue(),

      domicilio_valor: deliveryIsNational ? null : Number(deliveryFee || 0),
      domicilio_estado: deliveryQuoteStatus,
      domicilio_nota: deliveryQuoteMessage,
      envio_nacional: deliveryIsNational,
      total_pedido: orderTotal(),

      fecha_venta: saleDate,
      fecha_alquiler: rentalDate,
      fecha_entrega: saleDate || rentalDate
    };
  }

  /* =====================================================
     VALIDACIONES
  ===================================================== */

  function validateDeliveryDate(key, mode) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
      return mode === 'ALQUILER'
        ? 'Selecciona la fecha para tu alquiler.'
        : 'Selecciona una fecha de entrega para tu compra.';
    }

    if (mode === 'ALQUILER') {
      const minimumRental = addDays(localDateKey(), 1);

      return key < minimumRental
        ? `Para alquileres, solicita tu pedido con al menos un día de anticipación. Primera fecha disponible: ${fmtKey(minimumRental)}.`
        : '';
    }

    if (key < earliestDelivery) {
      return `La fecha más cercana disponible es ${fmtKey(earliestDelivery)}.`;
    }

    if (isBlockedDate(key)) {
      return 'No se puede agendar una compra para domingos ni festivos colombianos.';
    }

    if (fullSaleDates.has(key)) {
      return 'Esta fecha ya alcanzó la cantidad máxima de pedidos. Selecciona otra fecha.';
    }

    return '';
  }

  function validateForm() {
    const form = $('customer-details-form');

    if (!form) {
      showAlert('No se encontró el formulario de datos del cliente.');
      return false;
    }

    const visibleFields = Array.from(
      form.querySelectorAll('input[required]')
    ).filter(field =>
      field.id !== 'delivery-date' &&
      field.id !== 'rental-date' &&
      field.offsetParent !== null
    );

    for (const field of visibleFields) {
      if (!field.reportValidity()) return false;
    }

    updateDeliveryFieldVisibility();
    updateDeliveryQuote();
    const data = getFormData();

    const requiredFields = {
      nombres: 'Nombres',
      apellidos: 'Apellidos',
      correo: 'Correo',
      telefono: 'Teléfono',
      direccion: 'Dirección exacta',
      ciudad: 'Ciudad',
      barrio: 'Barrio'
    };

    for (const [key, label] of Object.entries(requiredFields)) {
      if (!data[key]) {
        showAlert(`El campo ${label} es obligatorio.`);
        return false;
      }
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.correo)) {
      showAlert('Escribe un correo electrónico válido.');
      return false;
    }

    const phoneDigits = data.telefono.replace(/\D/g, '');

    if (
      phoneDigits.length < 7 ||
      phoneDigits.length > 15
    ) {
      showAlert('Escribe un número de teléfono válido.');
      return false;
    }

    const hasSale = productLines.some(
      line => line.modalidad !== 'ALQUILER'
    );

    const hasRental = productLines.some(
      line => line.modalidad === 'ALQUILER'
    );

    if (hasSale) {
      const dateError = validateDeliveryDate(
        data.fecha_venta,
        'VENTA'
      );

      if (dateError) {
        showAlert(dateError);
        return false;
      }
    }

    if (hasRental) {
      const dateError = validateDeliveryDate(
        data.fecha_alquiler,
        'ALQUILER'
      );

      if (dateError) {
        showAlert(dateError);
        return false;
      }
    }

    hideAlert();
    return true;
  }

  /* =====================================================
     RESUMEN
  ===================================================== */

  function renderSummary() {
    const data = getFormData();

    const hasSale = productLines.some(
      line => line.modalidad !== 'ALQUILER'
    );

    const hasRental = productLines.some(
      line => line.modalidad === 'ALQUILER'
    );

    const dateSummary = [];

    if (hasSale) {
      dateSummary.push(`
        <div>
          <span>Fecha de entrega de la compra</span>
          <strong>${escapeHtml(fmtKey(data.fecha_venta))}</strong>
        </div>
      `);
    }

    if (hasRental) {
      dateSummary.push(`
        <div>
          <span>Fecha del alquiler</span>
          <strong>${escapeHtml(fmtKey(data.fecha_alquiler))}</strong>
        </div>
      `);
    }

    if ($('checkout-customer-summary')) {
      $('checkout-customer-summary').innerHTML = `
        <div>
          <span>Cliente</span>
          <strong>${escapeHtml(data.nombres)} ${escapeHtml(data.apellidos)}</strong>
        </div>

        <div>
          <span>Contacto</span>
          <strong>${escapeHtml(data.telefono)} · ${escapeHtml(data.correo)}</strong>
        </div>

        <div>
          <span>Entrega</span>
          <strong>${escapeHtml(data.direccion)}, ${escapeHtml(data.barrio)}, ${escapeHtml(data.ciudad)}</strong>
        </div>
        <div>
          <span>Domicilio / envío</span>
          <strong>${deliveryIsNational ? 'Envío nacional por cotizar y cobrar al recibir' : money(deliveryFee)}</strong>
        </div>

        ${dateSummary.join('')}
      `;
    }

    const orderGroups = [
      {
        type: 'VENTA',
        label: 'PEDIDO DE COMPRA',
        lines: productLines.filter(
          line => line.modalidad !== 'ALQUILER'
        )
      },
      {
        type: 'ALQUILER',
        label: 'PEDIDO DE ALQUILER',
        lines: productLines.filter(
          line => line.modalidad === 'ALQUILER'
        )
      }
    ].filter(group => group.lines.length);

    if ($('checkout-product-summary')) {
      $('checkout-product-summary').innerHTML =
        orderGroups.map(group => `
          <section class="rounded-xl border border-slate-100 p-3 space-y-2">
            <h3 class="text-[10px] font-black tracking-wider text-pink-700">
              ${group.label}
            </h3>

            ${group.lines.map(item => `
              <div class="flex gap-3 py-2 border-b border-slate-100 last:border-0">
                <img
                  src="${escapeHtml(item.foto || 'catalogo/assets/images/favicon.png')}"
                  class="w-16 h-16 object-cover rounded-xl bg-slate-100"
                  alt="${escapeHtml(item.nombre)}"
                >

                <div class="flex-1 min-w-0">
                  <strong class="text-sm text-slate-900">
                    ${escapeHtml(item.nombre)}
                  </strong>

                  <p class="text-[11px] text-slate-500 mt-1">
                    Cantidad: ${item.cantidad}
                    ${item.talla ? ` · Talla: ${escapeHtml(item.talla)}` : ''}
                    ${item.color ? ` · Color: ${escapeHtml(item.color)}` : ''}
                    ${item.accesorio ? ` · Accesorio: ${escapeHtml(item.accesorio)}` : ''}
                    ${item.modalidad === 'ALQUILER'
                      ? ` · ${item.diasAlquiler} día(s)`
                      : ''}
                  </p>

                  ${item.customText
                    ? `<p class="text-[11px] text-slate-500">Referencia: ${escapeHtml(item.customText)}</p>`
                    : ''}

                  ${item.deposito
                    ? `<p class="text-[10px] text-amber-700 font-semibold">Depósito: ${money(item.deposito)} (REEMBOLSABLE AL MOMENTO DE RECOGER)</p>`
                    : ''}

                  <p class="text-xs font-black text-slate-800 mt-1">
                    ${money(item.precioUnitario)} c/u · ${money(item.total)}
                  </p>
                </div>
              </div>
            `).join('')}
          </section>
        `).join('');
    }

    if ($('checkout-subtotal')) {
      $('checkout-subtotal').textContent = money(cartTotal);
    }
    if ($('checkout-refund-deposit')) $('checkout-refund-deposit').textContent = money(refundableDepositTotal());
    if ($('checkout-refund-deposit-row')) $('checkout-refund-deposit-row').classList.toggle('hidden', refundableDepositTotal() === 0);

    if ($('checkout-grand-total')) {
      $('checkout-grand-total').textContent = orderTotalLabel();
    }

    if ($('checkout-advance')) {
      $('checkout-advance').textContent = money(advanceTotal);
    }

    if ($('pay-total-value')) {
      $('pay-total-value').textContent = money(orderTotal());
    }

    if ($('pay-advance-value')) {
      $('pay-advance-value').textContent = money(advanceTotal);
    }

    const splitNote = $('split-orders-note');

    if (splitNote) {
      splitNote.classList.toggle(
        'hidden',
        !(hasSale && hasRental)
      );
    }
  }

  /* =====================================================
     PASOS DEL CHECKOUT
  ===================================================== */

  function showStep(step) {
    $('checkout-step-1')?.classList.toggle(
      'hidden',
      step !== 1
    );

    $('checkout-step-2')?.classList.toggle(
      'hidden',
      step !== 2
    );

    $('step-indicator-1')?.classList.toggle(
      'active',
      step === 1
    );

    $('step-indicator-2')?.classList.toggle(
      'active',
      step === 2
    );

    hideAlert();

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }

  let rentalAvailabilitySequence = 0;
  async function verifyRentalStock() {
    const rentals=getCheckoutItems().filter(item=>item.modalidad==='ALQUILER');
    if(!rentals.length)return true;
    const date=$('rental-date')?.value||'';
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return true;
    const {data,error}=await supabaseClient.rpc('cupissa_verificar_alquiler',{
      p_fecha:date,p_dias:Number(rentalDays||1),p_productos:rentals
    });
    if(error){showAlert('No se pudo verificar el inventario de alquiler. Inténtalo de nuevo.');return false}
    if(data?.disponible !== true){
      showAlert(rentals.length>1?'Uno de tus productos no tiene suficientes unidades disponibles en alquiler para esa fecha.':'Este producto no tiene suficientes unidades disponibles en alquiler para esa fecha.');
      return false;
    }
    return true;
  }
  async function notifyRentalDateAvailability(){
    const token=++rentalAvailabilitySequence;
    const ok=await verifyRentalStock();
    if(token!==rentalAvailabilitySequence)return;
    const note=$('rental-date-note');
    if(note&& !ok){note.classList.remove('hidden');note.textContent='No hay suficientes unidades en alquiler para la fecha seleccionada.'}
  }

  async function continueFromForm() {
    if (!(await verifyRentalStock())) return;
    if (!validateForm()) return;

    selectedPaymentMode = '';

    document.querySelectorAll('.checkout-pay-option')
      .forEach(button => {
        button.classList.remove('selected');
        button.setAttribute('aria-pressed', 'false');
      });

    const goButton = $('go-to-payment-button');

    if (goButton) {
      goButton.disabled = true;
    }

    renderSummary();
    showStep(2);
  }

  function selectPaymentMode(mode) {
    if (!['full', 'deposit'].includes(mode)) return;

    selectedPaymentMode = mode;

    document.querySelectorAll('.checkout-pay-option')
      .forEach(button => {
        const selected =
          button.id === (
            mode === 'full'
              ? 'pay-total-button'
              : 'pay-advance-button'
          );

        button.classList.toggle('selected', selected);

        button.setAttribute(
          'aria-pressed',
          selected ? 'true' : 'false'
        );
      });

    const goButton = $('go-to-payment-button');

    if (goButton) {
      goButton.disabled = false;

      const amount =
        mode === 'full'
          ? orderTotal()
          : advanceTotal;

      goButton.textContent =
        `Ir a pagar · ${money(amount)}`;
    }
  }

  function setProcessing(show, title = '', message = '') {
    const modal = $('payment-processing');

    if (!modal) return;

    const heading = modal.querySelector('h2');
    const description = modal.querySelector('p');

    if (heading && title) {
      heading.textContent = title;
    }

    if (description && message) {
      description.textContent = message;
    }

    modal.classList.toggle('hidden', !show);
  }

  /* =====================================================
     PAGOS PENDIENTES POR REFERENCIA
  ===================================================== */

  function pendingStorageKey(reference) {
    return PENDING_PREFIX + encodeURIComponent(
      String(reference || '')
    );
  }

  function savePendingPayment(paymentData) {
    if (!paymentData || !paymentData.reference) {
      console.error(
        '[CUPISSA] No se puede guardar un pago sin referencia.'
      );
      return false;
    }

    const reference = String(paymentData.reference);

    const pendingData = {
      ...paymentData,
      reference,
      updatedAt: new Date().toISOString()
    };

    try {
      localStorage.setItem(
        pendingStorageKey(reference),
        JSON.stringify(pendingData)
      );

      localStorage.setItem(
        LAST_PENDING_KEY,
        reference
      );

      return true;

    } catch (error) {
      console.error(
        '[CUPISSA] No fue posible guardar el pago pendiente:',
        error
      );

      return false;
    }
  }

  // Alias para conservar compatibilidad con las llamadas
  // que utiliza el resto de este checkout.
  function savePendingWebPayment(paymentData) {
    return savePendingPayment(paymentData);
  }

  function getPendingWebPayment(reference = '') {
    try {
      // Si se solicita una referencia específica,
      // recuperar exclusivamente ese pago.
      if (reference) {
        const raw = localStorage.getItem(
          pendingStorageKey(reference)
        );

        if (raw) return JSON.parse(raw);

        return null;
      }

      // Recuperar el último pago iniciado.
      const lastReference = localStorage.getItem(
        LAST_PENDING_KEY
      );

      if (lastReference) {
        const raw = localStorage.getItem(
          pendingStorageKey(lastReference)
        );

        if (raw) return JSON.parse(raw);
      }

      // Compatibilidad con pagos guardados por versiones anteriores.
      const legacy = localStorage.getItem(PENDING_KEY);

      if (legacy) {
        return JSON.parse(legacy);
      }

    } catch (error) {
      console.warn(
        '[CUPISSA] No fue posible recuperar el pago:',
        error
      );
    }

    return null;
  }

  function removePendingWebPayment(reference) {
    if (!reference) return;

    const normalizedReference = String(reference);

    try {
      localStorage.removeItem(
        pendingStorageKey(normalizedReference)
      );

      const lastReference = localStorage.getItem(
        LAST_PENDING_KEY
      );

      // Solo limpiar el puntero si corresponde
      // al pago que acabamos de resolver.
      if (lastReference === normalizedReference) {
        localStorage.removeItem(LAST_PENDING_KEY);
      }

      // Compatibilidad con la clave antigua.
      const legacy = getLegacyPendingPayment();

      if (
        legacy &&
        String(legacy.reference || '') === normalizedReference
      ) {
        localStorage.removeItem(PENDING_KEY);
      }

    } catch (error) {
      console.warn(
        '[CUPISSA] No fue posible limpiar el pago:',
        error
      );
    }
  }

  function getLegacyPendingPayment() {
    try {
      return JSON.parse(
        localStorage.getItem(PENDING_KEY) || 'null'
      );
    } catch (_) {
      return null;
    }
  }

  function getCheckoutItems() {
    return productLines.map(line => ({
      productId: String(line.productId),
      modalidad: String(
        line.modalidad || 'VENTA'
      ).toUpperCase(),
      cantidad: Math.max(
        1,
        Number(line.cantidad || 1)
      ),
      cantidadMayorista: Math.max(
        1,
        Number(line.cantidadMayorista || line.cantidad || 1)
      ),
      talla: String(line.talla || ''),
      color: String(line.color || ''),
      accesorio: String(line.accesorio || ''),
      customText: String(line.customText || '')
    }));
  }

  /* =====================================================
     INICIAR PAGO WOMPI
  ===================================================== */

  async function startWebPayment(mode) {
    if (paymentInProgress) return;

    if (!['full', 'deposit'].includes(mode)) return;

    if (!(await verifyRentalStock())) return;
    if (!validateForm()) {
      showStep(1);
      return;
    }

    const expectedAmount =
      mode === 'full'
        ? orderTotal()
        : advanceTotal;

    if (expectedAmount <= 0) {
      showAlert('El monto a pagar debe ser mayor a $0.');
      return;
    }

    if (typeof window.WidgetCheckout !== 'function') {
      showAlert(
        'No se pudo cargar el Widget oficial de Wompi. Verifica la conexión e inténtalo nuevamente.'
      );
      return;
    }

    /*
      IMPORTANTE:
      Ya no se bloquea un pedido nuevo porque exista
      una solicitud anterior en localStorage.

      Cada pedido recibe una referencia nueva del servidor.
      Las transacciones anteriores permanecen guardadas
      y pueden verificarse individualmente.
    */

    paymentInProgress = true;
    hideAlert();

    const button = $('go-to-payment-button');

    if (button) {
      button.disabled = true;
      button.textContent = 'Abriendo Wompi…';
    }

    setProcessing(
      true,
      'Preparando tu pago',
      'Estamos validando tu pedido y preparando el pago en Wompi.'
    );

    try {
      const customer = getFormData();

      const prepared = await callCheckoutFunction({
        action: 'create_web_payment',

        clientId: String(clientSession.id),
        clientPassword: String(clientSession.password),

        customer,
        items: getCheckoutItems(),

        rentalDays: Number(rentalDays || 1),

        saleDeliveryDate: customer.fecha_venta,
        rentalDeliveryDate: customer.fecha_alquiler,

        paymentMode: mode,

        // Informativos. El backend debe recalcular
        // los valores reales consultando Supabase.
        clientTotal: Number(orderTotal()),
        clientShipping: deliveryIsNational ? null : Number(deliveryFee || 0),
        clientAdvance: Number(advanceTotal)
      });

      if (
        !prepared.reference ||
        !prepared.amountInCents ||
        !prepared.publicKey ||
        !prepared.signature
      ) {
        throw new Error(
          'El servidor no devolvió todos los datos necesarios para abrir Wompi.'
        );
      }

      const signedAmount = Math.round(Number(prepared.amountInCents) / 100);
      if (signedAmount !== Math.round(expectedAmount)) {
        throw new Error(
          deliveryFee > 0 && mode === 'full'
            ? 'El servidor de pagos todavía no incluyó el domicilio en el valor firmado por Wompi. No se abrió el cobro para evitar cobrar un valor incorrecto; falta actualizar la función segura swift-endpoint para sumar clientShipping al total.'
            : 'El valor firmado por Wompi no coincide con el importe seleccionado. No se abrió el cobro para evitar una diferencia en el pago.'
        );
      }

      const payment = {
        reference: String(prepared.reference),
        amount: signedAmount,
        amountInCents: Number(prepared.amountInCents),
        currency: String(prepared.currency || 'COP'),
        publicKey: String(prepared.publicKey),
        signature: String(prepared.signature)
      };

      if (
        !Number.isSafeInteger(payment.amountInCents) ||
        payment.amountInCents <= 0
      ) {
        throw new Error(
          'El monto recibido para el pago no es válido.'
        );
      }

      if (payment.currency !== 'COP') {
        throw new Error(
          'La moneda de pago recibida no es válida.'
        );
      }

      const pending = {
        reference: payment.reference,
        amount: payment.amount,
        amountInCents: payment.amountInCents,
        currency: payment.currency,
        mode,
        customer,
        clientId: String(clientSession.id),
        createdAt: new Date().toISOString()
      };

      // Guardar esta transacción sin sobrescribir las anteriores.
      savePendingWebPayment(pending);

      const checkoutWidget = new window.WidgetCheckout({
        currency: payment.currency,
        amountInCents: payment.amountInCents,
        reference: payment.reference,
        publicKey: payment.publicKey,

        signature: {
          integrity: payment.signature
        },

        redirectUrl:
          `${window.location.origin}/pago-resultado.html`,

        customerData: {
          email: customer.correo,
          fullName:
            `${customer.nombres} ${customer.apellidos}`.trim(),
          phoneNumber: String(
            customer.telefono
          ).replace(/\D/g, ''),
          phoneNumberPrefix: '+57'
        }
      });

      setProcessing(false);

      // El Widget oficial se abre una sola vez.
      checkoutWidget.open(async function (result) {
        const transaction = result?.transaction;

        if (!transaction?.id) {
          // No declarar aprobado ni fallido.
          // El usuario puede regresar mediante redirectUrl.
          return;
        }

        pending.transaction = {
          id: String(transaction.id),
          status: String(
            transaction.status || 'PENDING'
          )
        };

        savePendingWebPayment(pending);

        await confirmPayment(transaction, pending);
      });

    } catch (error) {
      console.error(
        '[CUPISSA] Error iniciando pago:',
        error
      );

      setProcessing(false);

      showAlert(
        error?.message ||
        'No fue posible iniciar el pago. Inténtalo nuevamente.'
      );

    } finally {
      paymentInProgress = false;

      if (button) {
        const resultEl = $('payment-result');

        if (!resultEl || resultEl.classList.contains('hidden')) {
          button.disabled = false;
          button.textContent = 'Ir a pagar';
        }
      }
    }
  }


  async function askToSavePreferredAddress(customer) {
    if (!customer || !clientSession?.telefono) return;
    const phone = String(clientSession.telefono).trim();
    const { data: profile, error } = await supabaseClient
      .from('clientes_web')
      .select('id,direccion,barrio,ciudad')
      .eq('telefono', phone)
      .maybeSingle();
    if (error || !profile) {
      if (error) console.warn('[CUPISSA] No se pudo consultar la dirección del perfil:', error);
      return;
    }

    const nextAddress = {
      direccion: String(customer.direccion || '').trim(),
      barrio: String(customer.barrio || '').trim(),
      ciudad: String(customer.ciudad || '').trim()
    };
    if (!nextAddress.direccion) return;

    const hasSavedAddress = !!String(profile.direccion || '').trim();
    const sameAddress = ['direccion','barrio','ciudad'].every(key =>
      String(profile[key] || '').trim().toLocaleUpperCase('es-CO') ===
      String(nextAddress[key] || '').trim().toLocaleUpperCase('es-CO')
    );

    let shouldSave = !hasSavedAddress;
    if (hasSavedAddress && !sameAddress) {
      shouldSave = await new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'fixed inset-0 z-[9999] flex items-center justify-center p-4';
        overlay.style.cssText = 'background:rgba(15,23,42,.55);backdrop-filter:blur(5px)';
        overlay.innerHTML = `
          <div role="dialog" aria-modal="true" class="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl border border-pink-100">
            <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-pink-50 text-pink-600"><i class="fa-solid fa-location-dot text-xl"></i></div>
            <h3 class="text-center text-lg font-black text-slate-900">¿Guardar esta dirección?</h3>
            <p class="mt-2 text-center text-sm text-slate-500">Usaste una dirección diferente a la predeterminada. ¿Quieres dejarla como tu dirección principal?</p>
            <p class="mt-3 rounded-xl bg-pink-50 p-3 text-xs font-bold text-pink-800">${escapeHtml(nextAddress.direccion)}${nextAddress.barrio ? `, ${escapeHtml(nextAddress.barrio)}` : ''}${nextAddress.ciudad ? `, ${escapeHtml(nextAddress.ciudad)}` : ''}</p>
            <div class="mt-5 grid grid-cols-2 gap-2">
              <button type="button" data-choice="no" class="rounded-xl bg-slate-100 px-4 py-3 text-xs font-black text-slate-600">Cancelar</button>
              <button type="button" data-choice="yes" class="rounded-xl bg-pink-600 px-4 py-3 text-xs font-black text-white">Aceptar</button>
            </div>
          </div>`;
        overlay.addEventListener('click', event => {
          const choice = event.target.closest('[data-choice]')?.dataset.choice;
          if (!choice) return;
          overlay.remove();
          resolve(choice === 'yes');
        });
        document.body.appendChild(overlay);
      });
    }

    if (shouldSave) {
      const { error: updateError } = await supabaseClient
        .from('clientes_web')
        .update(nextAddress)
        .eq('id', profile.id);
      if (updateError) console.warn('[CUPISSA] No se pudo guardar la dirección predeterminada:', updateError);
      else clientProfile = { ...clientProfile, ...nextAddress };
    }
  }

  /* =====================================================
     CONSULTAR Y CONFIRMAR PAGO
  ===================================================== */

  async function confirmPayment(transaction, pending) {
    if (paymentInProgress) return;

    const currentSession =
      clientSession || sessionFromStorage();

    const clientPassword = String(
      currentSession?.password || ''
    );

    if (
      !pending?.reference ||
      !pending?.clientId ||
      !clientPassword
    ) {
      showAlert(
        'No fue posible identificar tu sesión para consultar el pago. Ingresa nuevamente a tu perfil.'
      );
      return;
    }

    const transactionId = String(
      transaction?.id ||
      pending.transaction?.id ||
      ''
    ).trim();

    if (!transactionId) {
      showAlert(
        'No tenemos el identificador de la transacción para consultar el pago.'
      );
      return;
    }

    paymentInProgress = true;

    setProcessing(
      true,
      'Verificando tu pago',
      'Estamos consultando el estado de tu transacción con Wompi.'
    );

    hideAlert();

    try {
      const result = await callCheckoutFunction({
        action: 'confirm_web_payment',

        clientId: String(pending.clientId),
        clientPassword,

        reference: String(pending.reference),
        transactionId
      });

      const status = String(
        result.status || ''
      ).toUpperCase();

      if (
        status === 'APPROVED' &&
        (result.order || result.orders?.length)
      ) {
        // La primera dirección de entrega se guarda como predeterminada.
        // Si ya existe otra, el cliente decide si desea reemplazarla.
        try { await askToSavePreferredAddress(pending.customer || {}); }
        catch (addressError) { console.warn('[CUPISSA] No se pudo actualizar la dirección del perfil:', addressError); }

        // Eliminar únicamente el pago confirmado.
        removePendingWebPayment(pending.reference);

        setProcessing(false);

        showSuccess({
          order:
            result.order ||
            result.orders?.[0] ||
            null,

          orders:
            result.orders ||
            (result.order ? [result.order] : []),

          pendingReference: pending.reference,
          testOrder: false
        });

        return;
      }

      if (
        ['DECLINED', 'ERROR', 'VOIDED'].includes(status)
      ) {
        // Estado terminal: esta transacción no fue aprobada.
        pending.transaction = {
          id: transactionId,
          status
        };

        removePendingWebPayment(pending.reference);

        setProcessing(false);

        showAlert(
          'Wompi informó que el pago no fue aprobado. No se confirmó tu pedido. Puedes iniciar un nuevo pago.'
        );

        return;
      }

      pending.transaction = {
        id: transactionId,
        status: status || 'PENDING'
      };

      savePendingWebPayment(pending);

      setProcessing(false);

      showAlert(
        'Tu transacción todavía está pendiente de confirmación. Puedes consultar nuevamente su estado.'
      );

      addRetryButton(
        {
          id: transactionId,
          status: pending.transaction.status
        },
        pending
      );

    } catch (error) {
      console.error(
        '[CUPISSA] Error verificando pago:',
        error
      );

      pending.transaction = {
        id: transactionId,
        status: String(
          transaction?.status || 'PENDING'
        )
      };

      savePendingWebPayment(pending);

      setProcessing(false);

      showAlert(
        'No pudimos consultar el estado de tu pago. Conservamos su referencia para que puedas verificarla nuevamente.'
      );

      addRetryButton(
        {
          id: transactionId,
          status: pending.transaction.status
        },
        pending
      );

    } finally {
      paymentInProgress = false;
    }
  }

  /* =====================================================
     BOTÓN PARA REINTENTAR CONSULTA
  ===================================================== */

  function addRetryButton(transaction, pending) {
    const alert = $('checkout-alert');

    if (
      !alert ||
      alert.querySelector('[data-retry-payment]')
    ) {
      return;
    }

    const buttonContainer =
      document.createElement('div');

    buttonContainer.className =
      'mt-3 pt-2 border-t border-red-200 flex justify-end';

    const button =
      document.createElement('button');

    button.type = 'button';
    button.dataset.retryPayment = '1';

    button.className =
      'bg-pink-600 hover:bg-pink-700 text-white text-xs font-black px-4 py-2 rounded-lg transition-colors cursor-pointer shadow-sm flex items-center gap-2';

    button.textContent =
      'Consultar pago nuevamente';

    button.addEventListener('click', async event => {
      event.preventDefault();

      if (paymentInProgress) return;

      button.disabled = true;
      button.textContent = 'Consultando…';

      await confirmPayment(transaction, pending);

      button.disabled = false;
      button.textContent =
        'Consultar pago nuevamente';
    });

    buttonContainer.appendChild(button);
    alert.appendChild(buttonContainer);
  }

  /* =====================================================
     RESULTADO DEL PEDIDO
  ===================================================== */

  function showSuccess(result) {
    if (result?.pendingReference) {
      removePendingWebPayment(result.pendingReference);
    }

    if (!result?.testOrder) {
      localStorage.setItem(CART_KEY, '[]');

      try {
        if (
          typeof cart !== 'undefined' &&
          Array.isArray(cart)
        ) {
          cart.length = 0;

          if (typeof saveCart === 'function') {
            saveCart();
          }
        }
      } catch (_) {}
    }

    const orders =
      Array.isArray(result?.orders) &&
      result.orders.length
        ? result.orders
        : (result?.order ? [result.order] : []);

    if ($('checkout-workflow')) {
      $('checkout-workflow').classList.add('hidden');
    }

    if ($('payment-result')) {
      $('payment-result').classList.remove('hidden');
    }

    if ($('payment-result-icon')) {
      $('payment-result-icon').innerHTML =
        '<i class="fa-solid fa-circle-check"></i>';
    }

    if ($('payment-result-title')) {
      $('payment-result-title').textContent =
        'Tu pedido fue registrado';
    }

    if ($('payment-result-message')) {
      $('payment-result-message').textContent =
        orders.length > 1
          ? 'Tus pedidos de compra y alquiler quedaron registrados por separado en tu perfil CUPISSA.'
          : 'Tu pedido ya está disponible en tu perfil CUPISSA.';
    }

    if ($('payment-result-order')) {
      $('payment-result-order').textContent =
        orders
          .map(order =>
            order.codigo ||
            order.numero_pedido ||
            order.id ||
            ''
          )
          .filter(Boolean)
          .map(code => `Pedido ${code}`)
          .join(' · ');
    }

    const firstOrder = orders[0];

    if ($('view-order-profile')) {
      $('view-order-profile').textContent =
        'Ver pedido en mi perfil';

      $('view-order-profile').href =
        firstOrder?.id
          ? `/perfil?pedidoId=${encodeURIComponent(firstOrder.id)}#tus-pedidos`
          : '/perfil#tus-pedidos';
    }

    if ($('back-catalog-after-payment')) {
      $('back-catalog-after-payment').href =
        '/catalogo';
    }

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }

  /* =====================================================
     RECUPERAR PAGO AL VOLVER
  ===================================================== */

  async function recoverApprovedPayment() {
    try {
      const params = new URLSearchParams(
        window.location.search
      );

      const transactionId = params.get('id');
      const pending = getPendingWebPayment();

      // Wompi devuelve el identificador mediante ?id=
      if (transactionId && pending?.reference) {
        pending.transaction = {
          id: transactionId,
          status: 'PENDING'
        };

        savePendingWebPayment(pending);

        await confirmPayment(
          pending.transaction,
          pending
        );

        return true;
      }

      // Recuperar si ya existe un identificador guardado.
      if (
        pending?.reference &&
        pending?.transaction?.id &&
        pending?.clientId
      ) {
        await confirmPayment(
          pending.transaction,
          pending
        );

        return true;
      }

    } catch (error) {
      console.warn(
        'No fue posible recuperar el pago pendiente:',
        error
      );
    }

    return false;
  }

  /* =====================================================
     INICIALIZACIÓN
  ===================================================== */

  async function init() {
    try {
      if (
        typeof supabaseClient === 'undefined' ||
        !supabaseClient
      ) {
        throw new Error(
          'No se pudo inicializar la conexión con CUPISSA.'
        );
      }

      if (!await loadCustomerProfile()) {
        return;
      }

      await loadCartAndProducts();
      await loadDeliveryRates();

      renderMiniCart();

      await initCalendar();

      $('rental-days')?.addEventListener(
        'change',
        updateRentalDays
      );

      $('customer-details-form')
        ?.querySelectorAll(
          'input:not([type="email"]):not([type="password"])'
        )
        .forEach(input => {
          input.addEventListener('input', () => {
            const start = input.selectionStart;
            const end = input.selectionEnd;

            input.value =
              input.value.toLocaleUpperCase('es-CO');

            try {
              input.setSelectionRange(start, end);
            } catch (_) {}
          });
        });

      $('customer-email')?.addEventListener(
        'input',
        () => {
          const start =
            $('customer-email').selectionStart;

          const end =
            $('customer-email').selectionEnd;

          $('customer-email').value =
            $('customer-email').value.toLowerCase();

          try {
            $('customer-email').setSelectionRange(
              start,
              end
            );
          } catch (_) {}
        }
      );

      $('customer-details-form')?.addEventListener(
        'submit',
        event => {
          event.preventDefault();
          continueFromForm();
        }
      );

      $('edit-details')?.addEventListener(
        'click',
        () => showStep(1)
      );

      $('pay-total-button')?.addEventListener(
        'click',
        () => selectPaymentMode('full')
      );

      $('pay-advance-button')?.addEventListener(
        'click',
        () => selectPaymentMode('deposit')
      );

      $('go-to-payment-button')?.addEventListener(
        'click',
        () => startWebPayment(selectedPaymentMode)
      );

      $('customer-city')?.addEventListener('focus', () => renderDeliverySuggestions('city'));
      $('customer-neighborhood')?.addEventListener('focus', () => renderDeliverySuggestions('neighborhood'));

      $('customer-city')?.addEventListener('change', () => {
        const previousCity = $('customer-city').dataset.previousValue || '';
        const currentCity = currentCityInputValue();
        if (previousCity !== currentCity) {
          $('customer-neighborhood').value = '';
          $('customer-neighborhood-other').value = '';
        }
        $('customer-city').dataset.previousValue = currentCity;
        updateDeliveryFieldVisibility();
        updateDeliveryQuote();
        renderMiniCart();
      });

      $('customer-city')?.addEventListener('input', () => {
        updateDeliveryFieldVisibility();
        updateDeliveryQuote();
        renderMiniCart();
        renderDeliverySuggestions('city');
      });

      $('customer-neighborhood')?.addEventListener('change', () => {
        updateDeliveryFieldVisibility();
        updateDeliveryQuote();
        renderMiniCart();
        closeDeliverySuggestions('neighborhood');
      });

      $('customer-neighborhood')?.addEventListener('input', () => {
        updateDeliveryFieldVisibility();
        updateDeliveryQuote();
        renderMiniCart();
        renderDeliverySuggestions('neighborhood');
      });

      document.addEventListener('click', event => {
        if (!event.target.closest('#customer-city') && !event.target.closest('#customer-city-suggestions')) {
          closeDeliverySuggestions('city');
        }
        if (!event.target.closest('#customer-neighborhood') && !event.target.closest('#customer-neighborhood-suggestions')) {
          closeDeliverySuggestions('neighborhood');
        }
      });

      ['customer-city-other', 'customer-neighborhood-other'].forEach(id => {
        $(id)?.addEventListener('input', () => {
          const input = $(id);
          const start = input.selectionStart;
          const end = input.selectionEnd;
          input.value = input.value.toLocaleUpperCase('es-CO');
          try { input.setSelectionRange(start, end); } catch (_) {}
          updateDeliveryQuote();
          renderMiniCart();
        });
      });

      fillCustomerForm(clientProfile);
      $('customer-city').dataset.previousValue = currentCityInputValue();
      updateDeliveryFieldVisibility();
      updateDeliveryQuote();
      closeDeliverySuggestions('city');
      closeDeliverySuggestions('neighborhood');

      /*
        Recuperamos el pago anterior si existe un identificador
        de transacción en la URL o en el almacenamiento.

        Si no hay una transacción recuperable, el usuario
        puede continuar normalmente con un pedido nuevo.
      */
      const recovered =
        await recoverApprovedPayment();

      if (recovered) return;

    } catch (error) {
      console.error(
        'Error inicializando checkout CUPISSA:',
        error
      );

      showAlert(
        error.message ||
        'No fue posible preparar tu compra.'
      );
    }
  }

  document.addEventListener(
    'DOMContentLoaded',
    init
  );

})();
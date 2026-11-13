/**
 * CUPISSA | Catálogo / estado del carrito y favoritos
 * Código extraído de la versión original sin cambiar la lógica.
 */

function addModalProductToCart() {
    if (!selectedProductModal) return;
    if (!cupissaRequireAccount()) return;

    const selectTalla = document.getElementById('opt-select-talla');
    const selectColor = document.getElementById('opt-select-color');
    const inputCustom = document.getElementById('opt-input-custom');
    const customText = inputCustom ? inputCustom.value.trim() : '';
    const accesoriosElegidos = typeof cupissaSelectedAccessories === 'function' ? cupissaSelectedAccessories() : [];
    const accesorio = accesoriosElegidos.map(item => item.nombre).join(', ') || null;
    const accesorioFoto = accesoriosElegidos[0]?.foto || '';
    const color = selectColor?.value || null;
    const colorFoto = selectColor?.selectedOptions?.[0]?.dataset.photo || '';
    const modalMainPhoto = document.getElementById('opt-modal-img')?.src || '';
    const sizeItems = typeof cupissaGetSelectedSizeItems === 'function' ? cupissaGetSelectedSizeItems() : [];
    const hasSizeOptions = typeof cupissaGetProductSizes === 'function' && cupissaGetProductSizes().length > 0;
    const totalQuantity = hasSizeOptions
        ? sizeItems.reduce((sum, item) => sum + item.cantidad, 0)
        : Math.max(1, Number(selectedQtyModal || 1));

    if (hasSizeOptions && totalQuantity < 1) {
        alert('Selecciona al menos una unidad en alguna talla.');
        return;
    }

    const wholesale = selectedModalidad === 'venta' &&
        Number(selectedProductModal.cant_min_mayorista || 0) > 0 &&
        totalQuantity >= Number(selectedProductModal.cant_min_mayorista) &&
        Number(selectedProductModal.precio_mayorista || 0) > 0;
    const baseUnitPrice = selectedModalidad === 'alquiler'
        ? Number(selectedProductModal.precio_alquiler || 0)
        : wholesale
            ? Number(selectedProductModal.precio_mayorista)
            : Number(selectedProductModal.precio_detal || 0);
    const colorExtra = selectColor?.selectedOptions?.[0] ? Number(selectColor.selectedOptions[0].dataset.inc || 0) : 0;
    const accessoryExtra = accesoriosElegidos.reduce((sum, item) => sum + Number(item.incremento || 0), 0);
    const commonPhoto = colorFoto || modalMainPhoto || selectedProductModal.fotos?.[0] || '';
    const percentage = Number(selectedProductModal.porcentaje_anticipo ?? 20);
    const rows = hasSizeOptions
        ? sizeItems
        : [{ talla: selectTalla?.value || null, cantidad: totalQuantity, incremento: Number(selectTalla?.selectedOptions?.[0]?.dataset.inc || 0) }];

    const newItems = rows.map((row, index) => {
        const quantity = Math.max(1, Number(row.cantidad || 1));
        const unitPrice = baseUnitPrice + (selectedModalidad === 'venta' ? Number(row.incremento || 0) : 0) + colorExtra + accessoryExtra;
        const lineTotal = unitPrice * quantity;
        return {
            cartId: `${selectedProductModal.id}_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`,
            productId: selectedProductModal.id,
            nombre: selectedProductModal.nombre,
            modalidad: selectedModalidad.toUpperCase(),
            foto: commonPhoto,
            fotoColor: colorFoto,
            talla: row.talla || null,
            color,
            accesorio,
            accesorios: accesoriosElegidos,
            accesorioFoto,
            customText,
            cantidad: quantity,
            cantidadMayorista: totalQuantity,
            precioUnitario: unitPrice,
            total: lineTotal,
            deposito: selectedModalidad === 'alquiler' ? Number(selectedProductModal.valor_deposito || 0) * quantity : 0,
            porcentajeAnticipo: percentage,
            valorAnticipo: Math.round(lineTotal * percentage / 100)
        };
    });

    cart.push(...newItems);
    saveCart();
    animateProductToCart(commonPhoto);
    showCartAddedFeedback();
}

        // Carrito y favoritos aislados por usuario; nunca compartir estados de otros perfiles.
        let cupissaAccountId = null;
        let cupissaAccountReady = false;
        let cupissaStateRevision = 0;
        let cupissaSaveTimer = null;
        const cupissaArray = raw => { try { const arr = JSON.parse(raw || '[]'); return Array.isArray(arr) ? arr : []; } catch (_) { return []; } };
        const cupissaScopedKey = (kind, id = cupissaAccountId) => `cupissa_${kind}_account_${id}`;
        const cupissaLocalRestore = () => {
            cart = cupissaAccountId ? cupissaArray(localStorage.getItem(cupissaScopedKey('cart'))) : [];
            favorites = cupissaAccountId ? cupissaArray(localStorage.getItem(cupissaScopedKey('favs'))) : [];
            // Checkout usa este nombre original: mantener únicamente el carrito de la sesión activa.
            localStorage.setItem('cupissa_cart', JSON.stringify(cart));
            localStorage.setItem('cupissa_favs', JSON.stringify(favorites));
            updateBadges();
            if (typeof syncCupissaFavoriteButtons === 'function') syncCupissaFavoriteButtons();
        };
        function cupissaRequireAccount() {
            if (cupissaAccountId && cupissaAccountReady) return true;
            if (typeof openProfileModal === 'function' && window.innerWidth < 768) openProfileModal();
            else window.location.href = '/perfil/';
            return false;
        }
        function cupissaPersistState(kind) {
            if (!cupissaAccountId || !cupissaAccountReady) return;
            ++cupissaStateRevision;
            localStorage.setItem(cupissaScopedKey('cart'), JSON.stringify(cart));
            localStorage.setItem(cupissaScopedKey('favs'), JSON.stringify(favorites));
            localStorage.setItem('cupissa_cart', JSON.stringify(cart));
            localStorage.setItem('cupissa_favs', JSON.stringify(favorites));
            clearTimeout(cupissaSaveTimer);
            const userId = cupissaAccountId;
            cupissaSaveTimer = setTimeout(async () => {
                if (userId !== cupissaAccountId) return;
                try {
                    const { error } = await supabaseClient.from('cliente_catalogo_estado').upsert({
                        auth_user_id:userId, carrito:cart, favoritos:favorites, updated_at:new Date().toISOString()
                    }, { onConflict:'auth_user_id' });
                    if (error) console.warn('[CUPISSA] No fue posible sincronizar la cuenta:',error.message);
                } catch (error) { console.warn('[CUPISSA] Sincronización pendiente:',error); }
            }, 450);
        }
        async function initializeCatalogAccountState() {
            const revision = ++cupissaStateRevision;
            try {
                const { data } = await supabaseClient.auth.getSession();
                const id = data?.session?.user?.id || null;
                cupissaAccountId = id;
                cupissaAccountReady = true;
                cupissaLocalRestore();
                if (!id) return { cart, favorites };
                const { data: remote, error } = await supabaseClient.from('cliente_catalogo_estado')
                    .select('carrito,favoritos').eq('auth_user_id',id).maybeSingle();
                if (error) console.warn('[CUPISSA] Estado remoto no disponible:',error.message);
                if (id !== cupissaAccountId || cupissaStateRevision !== revision) return {cart,favorites};
                if (remote) {
                    cart = Array.isArray(remote.carrito) ? remote.carrito : cart;
                    favorites = Array.isArray(remote.favoritos) ? remote.favoritos : favorites;
                    localStorage.setItem(cupissaScopedKey('cart'),JSON.stringify(cart));
                    localStorage.setItem(cupissaScopedKey('favs'),JSON.stringify(favorites));
                    localStorage.setItem('cupissa_cart',JSON.stringify(cart));
                    localStorage.setItem('cupissa_favs',JSON.stringify(favorites));
                    updateBadges(); syncCupissaFavoriteButtons();
                }
            } catch (error) { console.warn('[CUPISSA] Estado local disponible:',error); }
            return {cart,favorites};
        }
        supabaseClient.auth.onAuthStateChange((event, session) => {
            const nextId = session?.user?.id || null;
            if (nextId === cupissaAccountId && cupissaAccountReady) return;
            clearTimeout(cupissaSaveTimer);
            cupissaAccountId = nextId;
            cupissaAccountReady = !!nextId;
            cupissaStateRevision++;
            cupissaLocalRestore();
            initializeCatalogAccountState();
        });
        window.addEventListener('storage', event => {
            if (event.key?.startsWith('sb-') || event.key === 'cupissa_client_session') initializeCatalogAccountState();
        });
        function saveCart() {
            if (!cupissaRequireAccount()) return;
            cupissaPersistState('cart'); updateBadges();
        }
        function saveFavorites() {
            if (!cupissaRequireAccount()) return;
            cupissaPersistState('favs'); updateBadges(); syncCupissaFavoriteButtons();
        }

        function updateBadges() {
            const cartCount = cart.reduce((acc, c) => acc + c.cantidad, 0);
            const badgeValues = {
                'cart-badge-count': cartCount,
                'fav-badge-count': favorites.length,
                'mobile-cart-badge-count': cartCount,
                'mobile-fav-badge-count': favorites.length
            };
            Object.entries(badgeValues).forEach(([id, value]) => {
                const badge = document.getElementById(id);
                if (badge) badge.innerText = value;
            });
        }

        function toggleFavorite(prodId, e) {
            if (e) e.stopPropagation();
            if (!cupissaRequireAccount()) return;
            const prod = rawProducts.find(p => String(p.id) === String(prodId));
            if (!prod) return;
            const idx = favorites.findIndex(f => String(f.id) === String(prodId));
            if (idx >= 0) favorites.splice(idx, 1);
            else favorites.push(prod);
            saveFavorites();
        }

        function syncCupissaFavoriteButtons() {
            document.querySelectorAll('[data-favorite-product-id]').forEach(button => {
                const id = String(button.dataset.favoriteProductId);
                const isFav = favorites.some(item => String(item.id) === id);
                const icon = button.querySelector('i');
                if (icon) icon.className = isFav ? 'fa-solid fa-heart text-pink-600 text-xs sm:text-sm' : 'fa-regular fa-heart text-xs sm:text-sm';
                button.setAttribute('aria-label', isFav ? 'Quitar de favoritos' : 'Agregar a favoritos');
                button.setAttribute('aria-pressed', String(isFav));
            });
            const modalButton = document.getElementById('btn-modal-fav');
            if (modalButton && selectedProductModal) {
                const isFav = favorites.some(item => String(item.id) === String(selectedProductModal.id));
                modalButton.innerHTML = `<i class="${isFav ? 'fa-solid fa-heart text-pink-600' : 'fa-regular fa-heart'} text-xl"></i>`;
                modalButton.setAttribute('aria-pressed', String(isFav));
            }
        }
        window.syncCupissaFavoriteButtons = syncCupissaFavoriteButtons;

        function toggleFavoriteCurrent() {
            if (selectedProductModal) toggleFavorite(selectedProductModal.id);
        }

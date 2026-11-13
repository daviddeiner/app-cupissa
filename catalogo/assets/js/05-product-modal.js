/**
 * CUPISSA | Catálogo / ficha, opciones y precios de producto
 * Código extraído de la versión original sin cambiar la lógica.
 */

function cupissaNormalizePhotoUrl(value) {
    try {
        const url = new URL(String(value || ''), window.location.origin);
        return decodeURIComponent(url.pathname).replace(/\/+/g, '/').toLowerCase();
    } catch (_) { return String(value || '').trim().toLowerCase(); }
}

function cupissaFindColorForPhoto(product, photo) {
    const key = cupissaNormalizePhotoUrl(photo);
    return (product?.colores || []).find(color => {
        const linked = String(color?.foto || color?.imagen || color?.imagen_url || '').trim();
        return linked && cupissaNormalizePhotoUrl(linked) === key;
    }) || null;
}

function cupissaSelectColorForPhoto(product, photo) {
    const color = cupissaFindColorForPhoto(product, photo);
    const select = document.getElementById('opt-select-color');
    if (!color || !select) return;
    const option = Array.from(select.options).find(item =>
        String(item.value).trim().toUpperCase() === String(color.nombre || '').trim().toUpperCase()
    );
    if (option) {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
    }
}


let cupissaModalSizeQuantities = {};

function cupissaGetProductSizes(product = selectedProductModal) {
    const sizes = Array.isArray(product?.tallas) ? product.tallas.filter(size => size && String(size.nombre || '').trim()) : [];
    const rank = value => {
        const name = String(value || '').trim().toUpperCase();
        const known = ['PREMATURO','RN','RECIÉN NACIDO','RECIEN NACIDO','XXXS','3XS','XXS','2XS','XS','S','M','L','XL','XXL','2XL','XXXL','3XL','4XL','5XL'];
        const numeric = name.match(/^(?:TALLA\s*)?(\d+(?:[.,]\d+)?)(?:\s*(?:MESES|M|AÑOS|A))?$/);
        if (numeric) return Number(numeric[1].replace(',','.'));
        const index = known.indexOf(name);
        return index === -1 ? 10000 : 1000 + index;
    };
    return sizes.slice().sort((a,b) => rank(a.nombre)-rank(b.nombre));
}

function cupissaGetSelectedSizeItems() {
    return cupissaGetProductSizes().map(size => ({
        talla: String(size.nombre).trim(),
        cantidad: Math.max(0, Number(cupissaModalSizeQuantities[String(size.nombre).trim()] || 0)),
        incremento: Math.max(0, Number(size.incremento || 0))
    })).filter(item => item.cantidad > 0);
}

function cupissaGetTotalModalQuantity() {
    const sizeItems = cupissaGetSelectedSizeItems();
    return sizeItems.length ? sizeItems.reduce((total, item) => total + item.cantidad, 0) : Math.max(1, Number(selectedQtyModal || 1));
}

function cupissaRenderSizeQuantityRows(product = selectedProductModal) {
    const container = document.getElementById('opt-size-quantities');
    const wrapper = document.getElementById('wrapper-tallas');
    const globalQuantity = document.getElementById('wrapper-modal-global-qty');
    const select = document.getElementById('opt-select-talla');
    const sizes = cupissaGetProductSizes(product);

    if (!container || !wrapper || !globalQuantity || !select) return;

    container.innerHTML = '';

    if (!sizes.length) {
        wrapper.classList.add('hidden');
        globalQuantity.classList.remove('hidden');
        return;
    }

    wrapper.classList.remove('hidden');
    globalQuantity.classList.add('hidden');

    const dropdown = document.createElement('details');
    dropdown.className = 'cupissa-size-dropdown';

    const summary = document.createElement('summary');
    summary.className = 'cupissa-size-dropdown-summary';

    const totalSelected = cupissaGetSelectedSizeItems()
        .reduce((sum, item) => sum + item.cantidad, 0);

    summary.innerHTML = `
        <span>Seleccionar tallas y cantidades</span>
        <span class="cupissa-size-dropdown-count">
            ${totalSelected} seleccionadas
            <i class="fa-solid fa-chevron-down"></i>
        </span>
    `;

    const list = document.createElement('div');
    list.className = 'cupissa-size-dropdown-list';

    sizes.forEach(size => {
        const name = String(size.nombre).trim();
        const qty = Math.max(
            0,
            Number(cupissaModalSizeQuantities[name] || 0)
        );

        const row = document.createElement('div');
        row.className = 'cupissa-size-select-row';
        row.dataset.size = name;

        const info = document.createElement('span');
        info.className = 'cupissa-size-select-info';

        const title = document.createElement('strong');
        title.textContent = name;

        const extra = document.createElement('small');
        extra.textContent = selectedModalidad === 'alquiler' ? 'Sin incremento por talla' : Number(size.incremento || 0) > 0
            ? `+${formatCOP(Number(size.incremento || 0))} por unidad`
            : 'Precio estándar';

        info.append(title, extra);

        const controls = document.createElement('div');
        controls.className = 'cupissa-size-quantity-controls';

        const minus = document.createElement('button');
        minus.type = 'button';
        minus.textContent = '−';
        minus.setAttribute('aria-label', `Disminuir cantidad de talla ${name}`);
        minus.disabled = qty <= 0 || (qty === 1 && totalSelected === 1);

        const value = document.createElement('span');
        value.className = 'cupissa-size-quantity-value';
        value.textContent = String(qty);

        const plus = document.createElement('button');
        plus.type = 'button';
        plus.textContent = '+';
        plus.setAttribute('aria-label', `Aumentar cantidad de talla ${name}`);

        minus.addEventListener('click', () => {
            cupissaChangeSizeQuantity(name, -1);
        });

        plus.addEventListener('click', () => {
            cupissaChangeSizeQuantity(name, 1);
        });

        controls.append(minus, value, plus);
        row.append(info, controls);
        list.appendChild(row);
    });

    dropdown.append(summary, list);
    container.appendChild(dropdown);

    cupissaUpdateSizeQuantitySummary();
}

function cupissaUpdateSizeQuantitySummary() {
    const summary = document.getElementById('opt-size-quantity-summary');
    const total = cupissaGetSelectedSizeItems().reduce((sum, item) => sum + item.cantidad, 0);
    selectedQtyModal = total || 0;
    const qtyLabel = document.getElementById('opt-modal-qty');
    if (qtyLabel) qtyLabel.textContent = String(total);
    if (summary) summary.textContent = total > 0 ? `${total} unidad${total === 1 ? '' : 'es'} en total, sumando todas las tallas.` : 'Selecciona al menos una unidad para continuar.';
    const dropdownCount = document.querySelector('#opt-size-quantities .cupissa-size-dropdown-count');
    if (dropdownCount) dropdownCount.innerHTML = `${total} seleccionadas <i class="fa-solid fa-chevron-down"></i>`;
}

function cupissaChangeSizeQuantity(sizeName, delta) {
    const key = String(sizeName || '').trim();
    if (!key) return;

    const current = Math.max(
        0,
        Number(cupissaModalSizeQuantities[key] || 0)
    );

    if (Number(delta) < 0 && current <= 1 && cupissaGetSelectedSizeItems().reduce((sum, item) => sum + item.cantidad, 0) <= 1) return;

    cupissaModalSizeQuantities[key] = Math.max(
        0,
        current + Number(delta || 0)
    );

    const row = Array.from(
        document.querySelectorAll('.cupissa-size-select-row')
    ).find(item => item.dataset.size === key);

    if (row) {
        const value = row.querySelector('.cupissa-size-quantity-value');
        const buttons = row.querySelectorAll('.cupissa-size-quantity-controls button');

        if (value) {
            value.textContent = String(cupissaModalSizeQuantities[key]);
        }

        if (buttons.length) {
            buttons[0].disabled = cupissaModalSizeQuantities[key] <= 0 || (cupissaModalSizeQuantities[key] === 1 && cupissaGetSelectedSizeItems().reduce((sum, item) => sum + item.cantidad, 0) === 1);
            document.querySelectorAll('.cupissa-size-select-row').forEach(otherRow => {
                const minusButton = otherRow.querySelector('.cupissa-size-quantity-controls button');
                const otherQty = Number(cupissaModalSizeQuantities[otherRow.dataset.size] || 0);
                if (minusButton) minusButton.disabled = otherQty <= 0 || (otherQty === 1 && cupissaGetSelectedSizeItems().reduce((sum, item) => sum + item.cantidad, 0) === 1);
            });
        }
    }

    cupissaUpdateSizeQuantitySummary();
    recalculateProductPrice();
}

function openOptionsModal(prodId) {
            const prod = rawProducts.find(p => String(p.id) === String(prodId));
            if (!prod) return;

            if (typeof window.cupissaRememberProductNavigation === 'function') window.cupissaRememberProductNavigation(String(prod.id));
            selectedProductModal = prod;
            if (typeof window.syncCupissaFavoriteButtons === 'function') window.syncCupissaFavoriteButtons();
            if (typeof window.registerCupissaProductOpen === 'function') {
                window.registerCupissaProductOpen(prod.id);
            }
            const permalink = document.getElementById('cupissa-product-permalink');
            if (permalink) permalink.href = `/producto/${encodeURIComponent(String(prod.id))}/`;
            selectedQtyModal = 1;
            cupissaModalSizeQuantities = {};
            activePhotoIndex = 0;

            const wrapperModalidad = document.getElementById('wrapper-modalidad');
            if (prod.alquiler && prod.precio_alquiler > 0) {
                wrapperModalidad.classList.remove('hidden');
                selectedModalidad = 'venta';
            } else {
                wrapperModalidad.classList.add('hidden');
                selectedModalidad = 'venta';
            }

            updateModalidadUI();

            document.getElementById('opt-modal-title').innerText = prod.nombre;
            const creditLink = document.getElementById('cupissa-credit-whatsapp');
            if (creditLink) {
                const message = `Hola, quiero solicitar información para pedir a crédito este producto: ${prod.nombre}. Ref: CUP-${String(prod.id).slice(-4)}. ¿Me pueden ayudar?`;
                creditLink.href = `https://wa.me/573147671380?text=${encodeURIComponent(message)}`;
            }
            const wholesaleHint = document.getElementById('opt-wholesale-hint');
            if (wholesaleHint) {
                const minimum = Math.max(0, Number(prod.cant_min_mayorista || 0));
                wholesaleHint.textContent = minimum > 0
                    ? `Llévalo al por mayor a partir de ${minimum} unidades.`
                    : 'Consulta disponibilidad y condiciones para compras al por mayor.';
            }
            document.getElementById('opt-modal-subcat').innerText = (prod.subcategorias?.length ? prod.subcategorias : (prod.categorias?.length ? prod.categorias : [prod.subcategoria || prod.categoria || 'TEXTIL'])).join(' · ');
            document.getElementById('opt-modal-ref').innerText = `Ref: CUP-${prod.id.toString().slice(-4)}`;

            const wrapDesc = document.getElementById('wrapper-descripcion');
            const txtDesc = document.getElementById('opt-modal-desc');
            if (prod.descripcion && prod.descripcion.trim() !== '') {
                txtDesc.innerText = prod.descripcion;
                wrapDesc.classList.remove('hidden');
            } else {
                wrapDesc.classList.add('hidden');
            }

            const badgesContainer = document.getElementById('opt-modal-badges');
            badgesContainer.innerHTML = '';
            const modalFilterBadges = [
                ...(prod.subcategorias || []),
                ...(prod.temporadas || [])
            ];
            modalFilterBadges.forEach(value => {
                const badge = document.createElement('span');
                badge.className = 'bg-pink-600 text-white font-black text-[9px] uppercase px-2.5 py-1 rounded-full';
                badge.textContent = value;
                badgesContainer.appendChild(badge);
            });

            const mainImg = document.getElementById('opt-modal-img');
            const fotos = prod.fotos && prod.fotos.length > 0 ? prod.fotos : ['https://via.placeholder.com/400x400?text=Cupissa'];
            mainImg.onload = () => {
                if (mainImg.naturalWidth && mainImg.naturalHeight) {
                    mainImg.style.aspectRatio = `${mainImg.naturalWidth} / ${mainImg.naturalHeight}`;
                    mainImg.style.objectFit = 'contain';
                }
            };
            mainImg.src = fotos[0];
            mainImg.alt = `${prod.nombre} - CUPISSA`;
            mainImg.title = `${prod.nombre} - CUPISSA`;

            const thumbsContainer = document.getElementById('opt-modal-thumbs');
            thumbsContainer.innerHTML = '';
            const hasMultiplePhotos = fotos.length > 1;
            thumbsContainer.classList.toggle('hidden', !hasMultiplePhotos);
            thumbsContainer.setAttribute('aria-hidden', String(!hasMultiplePhotos));
            if (hasMultiplePhotos) {
                fotos.forEach((url, idx) => {
                    const thumb = document.createElement('img');
                    thumb.src = url;
                    thumb.alt = `${prod.nombre} vista ${idx+1} - CUPISSA`;
                    thumb.title = `${prod.nombre} vista ${idx+1}`;
                    thumb.className = `w-12 h-12 object-cover rounded-xl border-2 cursor-pointer ${idx === 0 ? 'fuchsia-border' : 'border-transparent'}`;
                    thumb.onclick = () => {
                        activePhotoIndex = idx;
                        mainImg.src = url;
                        document.querySelectorAll('#opt-modal-thumbs img').forEach(t => t.className = 'w-12 h-12 object-cover rounded-xl border-2 border-transparent');
                        thumb.className = 'w-12 h-12 object-cover rounded-xl border-2 fuchsia-border';
                        // Seleccionar una foto también selecciona el color que el administrador vinculó a ella.
                        const matchedColor = cupissaFindColorForPhoto(selectedProductModal, url);
                        if (matchedColor) {
                            cupissaSelectColorForPhoto(selectedProductModal, url);
                        } else {
                            const colors = selectedProductModal.colores || [];
                            if (colors.length === fotos.length && colors[idx]) {
                                const select = document.getElementById('opt-select-color');
                                if (select) {
                                    select.value = colors[idx].nombre;
                                    select.dispatchEvent(new Event('change', { bubbles: true }));
                                }
                            }
                        }
                    };
                    thumbsContainer.appendChild(thumb);
                });
            }

            const selectTalla = document.getElementById('opt-select-talla');
            selectTalla.innerHTML = '';
            const availableSizes = cupissaGetProductSizes(prod);
            availableSizes.forEach((size, index) => {
                const name = String(size.nombre).trim();
                const opt = document.createElement('option');
                opt.value = name;
                opt.dataset.inc = size.incremento || 0;
                opt.innerText = selectedModalidad === 'venta' && Number(size.incremento || 0) > 0 ? `${name} (+${formatCOP(size.incremento)})` : name;
                selectTalla.appendChild(opt);
                cupissaModalSizeQuantities[name] = 0;
            });
            if (availableSizes.length) cupissaModalSizeQuantities[String(availableSizes[0].nombre).trim()] = 1;
            selectTalla.value = availableSizes.length ? String(availableSizes[0].nombre).trim() : '';
            cupissaRenderSizeQuantityRows(prod);

            const wrapColores = document.getElementById('wrapper-colores');
            const selectColor = document.getElementById('opt-select-color');
            selectColor.innerHTML = '';
            if (prod.colores && prod.colores.length > 0) {
                prod.colores.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c.nombre;
                    opt.dataset.inc = c.incremento || 0;
                    opt.dataset.photo = String(c.foto || c.imagen || c.imagen_url || '').trim();
                    opt.innerText = c.incremento > 0 ? `${c.nombre} (+${formatCOP(c.incremento)})` : c.nombre;
                    selectColor.appendChild(opt);
                });
                wrapColores.classList.remove('hidden');
                if (typeof enhanceCupissaSelect === 'function') enhanceCupissaSelect(selectColor, 'Selecciona un color');
                selectColor.onchange = handleProductColorChange;
                handleProductColorChange();
            } else {
                selectColor.onchange = null;
                wrapColores.classList.add('hidden');
            }

            const wrapAccesorios = document.getElementById('wrapper-accesorios');
            const selectAccesorio = document.getElementById('opt-select-accesorio');
            const accessoryList = document.getElementById('accessory-options-list');
            if (selectAccesorio && accessoryList && wrapAccesorios) {
                selectAccesorio.innerHTML = '';
                accessoryList.innerHTML = '';
                // Sin opción artificial: cero accesorios seleccionados es el estado inicial.
                selectedCupissaAccessories.clear();
                const emptyOpt = document.createElement('option');
                emptyOpt.value = '';
                selectAccesorio.appendChild(emptyOpt);

                const accessories = Array.isArray(prod.accesorios) ? prod.accesorios : [];
                if (accessories.length) {
                    accessories.forEach((accessory, index) => {
                        const name = String(accessory.nombre || accessory.name || '').trim();
                        if (!name) return;
                        const extra = Number(accessory.incremento || accessory.adicional || 0);
                        const photo = String(accessory.foto || accessory.imagen || accessory.imagen_url || '').trim();
                        const opt = document.createElement('option');
                        opt.value = name;
                        opt.dataset.inc = String(extra);
                        opt.dataset.photo = photo;
                        selectAccesorio.appendChild(opt);

                        // La tarjeta exterior es un contenedor seleccionable; el botón interno abre la foto completa.
                        const choice = document.createElement('div');
                        choice.className = 'accessory-choice';
                        choice.dataset.accessoryIndex = String(index);
                        choice.dataset.accessoryValue = name;
                        choice.setAttribute('role', 'button');
                        choice.setAttribute('tabindex', '0');
                        choice.setAttribute('aria-pressed', 'false');

                        const imageWrap = document.createElement('span');
                        imageWrap.className = 'accessory-image-wrap';
                        if (photo) {
                            const image = document.createElement('img');
                            image.src = photo;
                            image.alt = `Accesorio ${name}`;
                            image.loading = 'lazy';
                            image.decoding = 'async';
                            image.className = 'accessory-choice-image';
                            imageWrap.appendChild(image);

                            const viewButton = document.createElement('button');
                            viewButton.type = 'button';
                            viewButton.className = 'accessory-view-trigger';
                            viewButton.setAttribute('aria-label', `Ver imagen completa de ${name}`);
                            viewButton.innerHTML = '<i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i><span class="accessory-view-label">Ver</span>';
                            viewButton.addEventListener('click', (event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                openAccessoryImageModal(photo, name);
                            });
                            imageWrap.appendChild(viewButton);
                        } else {
                            imageWrap.classList.add('accessory-image-empty');
                            imageWrap.innerHTML = '<i class="fa-solid fa-image" aria-hidden="true"></i>';
                        }

                        const details = document.createElement('span');
                        details.className = 'accessory-choice-details';
                        const title = document.createElement('strong');
                        title.className = 'accessory-choice-name';
                        title.textContent = name;
                        const price = document.createElement('small');
                        price.className = 'accessory-choice-price';
                        price.textContent = extra > 0 ? `+${formatCOP(extra)}` : 'Sin incremento';
                        details.append(title, price);
                        choice.append(imageWrap, details);

                        const selectChoice = () => {
                            if (selectedCupissaAccessories.has(name)) selectedCupissaAccessories.delete(name);
                            else selectedCupissaAccessories.add(name);
                            updateAccessoryChoiceState();
                            recalculateProductPrice();
                        };
                        choice.addEventListener('click', selectChoice);
                        choice.addEventListener('keydown', (event) => {
                            if (event.target === choice && (event.key === 'Enter' || event.key === ' ')) {
                                event.preventDefault();
                                selectChoice();
                            }
                        });
                        accessoryList.appendChild(choice);
                    });

                    wrapAccesorios.classList.remove('hidden');
                } else {
                    wrapAccesorios.classList.add('hidden');
                }

                updateAccessoryChoiceState();
            }

            const wrapCustom = document.getElementById('wrapper-custom');
            document.getElementById('opt-input-custom').value = '';
            if (prod.personalizable) wrapCustom.classList.remove('hidden');
            else wrapCustom.classList.add('hidden');

            recalculateProductPrice();
            document.getElementById('modal-product-options').classList.remove('hidden');
        }


const selectedCupissaAccessories = new Set();
function updateAccessoryChoiceState() {
    const select = document.getElementById('opt-select-accesorio');
    const list = document.getElementById('accessory-options-list');
    if (!select || !list) return;
    list.querySelectorAll('.accessory-choice').forEach(card => {
        const active = selectedCupissaAccessories.has(card.dataset.accessoryValue);
        card.classList.toggle('is-selected', active);
        card.setAttribute('aria-pressed', String(active));
    });
    // Conserva compatibilidad con el selector original, usado por otras secciones.
    select.value = selectedCupissaAccessories.size === 1 ? [...selectedCupissaAccessories][0] : '';
}
function cupissaSelectedAccessories() {
    return Array.from(document.querySelectorAll('#opt-select-accesorio option'))
        .filter(option => selectedCupissaAccessories.has(option.value))
        .map(option => ({ nombre: option.value, incremento: Number(option.dataset.inc || 0), foto: option.dataset.photo || '' }));
}

        function handleProductColorChange() {
            const selectColor = document.getElementById('opt-select-color');
            const mainImg = document.getElementById('opt-modal-img');
            if (!selectedProductModal || !selectColor || !mainImg) return;

            let selectedPhoto = String(selectColor.selectedOptions[0]?.dataset.photo || '').trim();
            if (!selectedPhoto) {
                const colors = selectedProductModal.colores || [];
                const selectedIndex = Array.from(selectColor.options).indexOf(selectColor.selectedOptions[0]);
                if (colors.length === (selectedProductModal.fotos || []).length) selectedPhoto = String(selectedProductModal.fotos[selectedIndex] || '').trim();
            }
            if (selectedPhoto) {
                const photos = selectedProductModal.fotos || [];
                const index = photos.findIndex(photo => cupissaNormalizePhotoUrl(photo) === cupissaNormalizePhotoUrl(selectedPhoto));
                activePhotoIndex = index >= 0 ? index : 0;
                mainImg.src = selectedPhoto;
                document.querySelectorAll('#opt-modal-thumbs img').forEach((thumb, thumbIndex) => {
                    const isActive = index >= 0 && thumbIndex === index;
                    thumb.className = `w-12 h-12 object-cover rounded-xl border-2 cursor-pointer ${isActive ? 'fuchsia-border' : 'border-transparent'}`;
                });
            } else {
                activePhotoIndex = 0;
                const firstPhoto = selectedProductModal.fotos?.[0];
                if (firstPhoto) mainImg.src = firstPhoto;
                document.querySelectorAll('#opt-modal-thumbs img').forEach((thumb, thumbIndex) => {
                    thumb.className = `w-12 h-12 object-cover rounded-xl border-2 cursor-pointer ${thumbIndex === 0 ? 'fuchsia-border' : 'border-transparent'}`;
                });
            }
            recalculateProductPrice();
        }

        function openFullImageModal() {
            if (!selectedProductModal) return;
            // El catálogo publica y conserva las versiones recortadas en fotos.
            // fotos_originales se reserva para administración y nunca se usa aquí.
            const publishedPhotos = Array.isArray(selectedProductModal.fotos) ? selectedProductModal.fotos : [];
            const publishedPhoto = publishedPhotos[activePhotoIndex] || publishedPhotos[0] || '';
            const fullImg = document.getElementById('full-modal-img');
            if (!publishedPhoto || !fullImg) return;
            fullImg.src = publishedPhoto;
            fullImg.alt = `${selectedProductModal.nombre} - CUPISSA`;
            document.getElementById('modal-full-image').classList.remove('hidden');
            setupCupissaImageMagnifier(fullImg);
        }

        function setupCupissaImageMagnifier(image) {
            const lens = document.getElementById('full-image-magnifier');
            if (!image || !lens || image.dataset.cupissaMagnifierReady) return;
            image.dataset.cupissaMagnifierReady = 'true';
            const zoom = 2.6;
            const update = event => {
                if (window.matchMedia('(max-width: 767px)').matches || event.pointerType === 'touch') return;
                const rect = image.getBoundingClientRect();
                const stageRect = image.parentElement.getBoundingClientRect();
                if (!rect.width || !rect.height) return;
                const lensSize = lens.offsetWidth || 180;
                const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
                const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
                const left = Math.max(0, Math.min(rect.width - lensSize, x - lensSize / 2));
                const top = Math.max(0, Math.min(rect.height - lensSize, y - lensSize / 2));
                lens.style.left = `${rect.left - stageRect.left + left}px`;
                lens.style.top = `${rect.top - stageRect.top + top}px`;
                lens.style.backgroundImage = `url("${image.currentSrc || image.src}")`;
                lens.style.backgroundSize = `${rect.width * zoom}px ${rect.height * zoom}px`;
                lens.style.backgroundPosition = `${-(x * zoom - lensSize / 2)}px ${-(y * zoom - lensSize / 2)}px`;
                lens.classList.add('is-visible');
            };
            image.addEventListener('pointermove', update);
            image.addEventListener('pointerleave', () => lens.classList.remove('is-visible'));
        }

        // Reutiliza la vista ampliada del catálogo para mostrar fotografías de accesorios.
        function openAccessoryImageModal(photo, accessoryName) {
            const fullImg = document.getElementById('full-modal-img');
            const overlay = document.getElementById('modal-full-image');
            if (!photo || !fullImg || !overlay) return;
            fullImg.src = photo;
            fullImg.alt = `${accessoryName || 'Accesorio'} - CUPISSA`;
            overlay.classList.remove('hidden');
            setupCupissaImageMagnifier(fullImg);
        }

        function closeFullImageModal() {
            document.getElementById('modal-full-image').classList.add('hidden');
            document.getElementById('full-image-magnifier')?.classList.remove('is-visible');
        }

        function setModalidad(mod) {
            selectedModalidad = mod;
            cupissaRenderSizeQuantityRows();
            updateModalidadUI();
            recalculateProductPrice();
        }

        function updateModalidadUI() {
            const lblVenta = document.getElementById('lbl-mod-venta');
            const lblAlquiler = document.getElementById('lbl-mod-alquiler');
            
            if (selectedModalidad === 'venta') {
                lblVenta.className = "flex items-center justify-center space-x-2 p-2.5 rounded-xl border-2 fuchsia-border bg-pink-50/20 cursor-pointer text-xs font-bold fuchsia-text";
                lblAlquiler.className = "flex items-center justify-center space-x-2 p-2.5 rounded-xl border-2 border-slate-200 bg-white cursor-pointer text-xs font-bold text-slate-600";
                document.querySelector('input[name="modalidadProd"][value="venta"]').checked = true;
            } else {
                lblAlquiler.className = "flex items-center justify-center space-x-2 p-2.5 rounded-xl border-2 fuchsia-border bg-pink-50/20 cursor-pointer text-xs font-bold fuchsia-text";
                lblVenta.className = "flex items-center justify-center space-x-2 p-2.5 rounded-xl border-2 border-slate-200 bg-white cursor-pointer text-xs font-bold text-slate-600";
                document.querySelector('input[name="modalidadProd"][value="alquiler"]').checked = true;
            }
        }

        function closeOptionsModal() {
            document.getElementById('modal-product-options').classList.add('hidden');
            if (typeof window.cupissaForgetProductNavigation === 'function') window.cupissaForgetProductNavigation();
        }

        function updateModalQty(delta) {
            selectedQtyModal = Math.max(1, selectedQtyModal + delta);
            document.getElementById('opt-modal-qty').innerText = selectedQtyModal;
            recalculateProductPrice();
        }

        function recalculateProductPrice() {
            if (!selectedProductModal) return;
            const p = selectedProductModal;
            const sizeItems = cupissaGetSelectedSizeItems();
            const hasSizeOptions = cupissaGetProductSizes(p).length > 0;
            const totalQty = hasSizeOptions ? sizeItems.reduce((sum, item) => sum + item.cantidad, 0) : Math.max(1, Number(selectedQtyModal || 1));
            selectedQtyModal = totalQty;
            const basePrice = selectedModalidad === 'alquiler' ? Number(p.precio_alquiler || 0) : Number(p.precio_detal || 0);
            const isMayorista = selectedModalidad === 'venta' && Number(p.cant_min_mayorista || 0) > 0 && totalQty >= Number(p.cant_min_mayorista) && Number(p.precio_mayorista || 0) > 0;
            const baseUnitPrice = isMayorista ? Number(p.precio_mayorista) : basePrice;
            const selectColor = document.getElementById('opt-select-color');
            const colorExtra = selectColor?.selectedOptions?.[0] ? Number(selectColor.selectedOptions[0].dataset.inc || 0) : 0;
            const accessoryExtra = cupissaSelectedAccessories().reduce((sum, accessory) => sum + Number(accessory.incremento || 0), 0);
            let totalProduct = 0;

            if (hasSizeOptions) {
                totalProduct = sizeItems.reduce((sum, item) => sum + (baseUnitPrice + (selectedModalidad === 'venta' ? item.incremento : 0) + colorExtra + accessoryExtra) * item.cantidad, 0);
            } else {
                totalProduct = (baseUnitPrice + colorExtra + accessoryExtra) * totalQty;
            }

            const pctAnticipo = Number(p.porcentaje_anticipo ?? 20);
            const valAnticipo = Math.round(totalProduct * (pctAnticipo / 100));
            const depInfo = document.getElementById('wrapper-deposito-info');
            if (selectedModalidad === 'alquiler' && Number(p.valor_deposito || 0) > 0) {
                document.getElementById('opt-val-deposito').innerText = formatCOP(Number(p.valor_deposito || 0) * totalQty);
                depInfo.classList.remove('hidden');
            } else {
                depInfo.classList.add('hidden');
            }

            const priceLabel = document.getElementById('opt-price-tag');
            if (priceLabel) priceLabel.innerText = selectedModalidad === 'alquiler' ? (Number(p.valor_deposito || 0) > 0 ? 'Alquiler + depósito reembolsable' : 'Precio Alquiler') : (isMayorista ? 'Precio Mayorista' : 'Precio Detal');
            const refundableDeposit = selectedModalidad === 'alquiler'
                ? Math.max(0, Number(p.valor_deposito || 0)) * totalQty : 0;
            document.getElementById('opt-modal-total-price').innerText = formatCOP(totalProduct + refundableDeposit);
            document.getElementById('opt-anticipo-pct').innerText = pctAnticipo;
            document.getElementById('opt-anticipo-val').innerText = formatCOP(valAnticipo);
            if (hasSizeOptions) cupissaUpdateSizeQuantitySummary();
        }

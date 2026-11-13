/**
 * CUPISSA | Catálogo / carrito
 * Código extraído de la versión original sin cambiar la lógica.
 */

function openCartModal() {
    if (!cupissaRequireAccount()) return;
            if (typeof closeProfileModal === 'function') closeProfileModal();
            // Cambiar directamente al carrito: evita que Favoritos u otro panel
            // quede superpuesto y bloquee los botones inferiores.
            closeFavoritesModal();
            closePortalModal();
            renderCartItems();
            document.getElementById('modal-cart').classList.remove('hidden');
            document.getElementById('modal-cart').setAttribute('aria-hidden', 'false');
            if (typeof setMobileNavSection === 'function') setMobileNavSection('cart');
        }

        function closeCartModal() {
            const modal = document.getElementById('modal-cart');
            if (modal) {
                modal.classList.add('hidden');
                modal.setAttribute('aria-hidden', 'true');
                if (typeof setMobileNavSection === 'function') setMobileNavSection('home');
            }
        }

        function renderCartItems() {
            const container = document.getElementById('cart-items-container');
            container.innerHTML = '';
            let grandTotal = 0;
            let grandAnticipo = 0;

            if (cart.length === 0) {
                container.innerHTML = `
                    <div class="cupissa-empty-state">
                        <div class="cupissa-empty-state-icon"><i class="fa-solid fa-bag-shopping" aria-hidden="true"></i></div>
                        <h4>Tu carrito está esperando</h4>
                        <p>Agrega tus productos favoritos y aquí podrás revisar tu pedido.</p>
                    </div>`;
                document.getElementById('cart-total-amount').innerText = '$ 0';
                document.getElementById('cart-total-anticipo').innerText = 'Faltan $10.000';
                const emptyCheckout = document.getElementById('cart-checkout-button');
                if (emptyCheckout) { emptyCheckout.disabled = true; emptyCheckout.style.opacity = '.45'; emptyCheckout.style.cursor = 'not-allowed'; }
                return;
            }

            cart.forEach((item, index) => {
                grandTotal += Number(item.total || 0);
                grandAnticipo += Number(item.valorAnticipo || 0);

                const card = document.createElement('div');
                card.className = "flex items-center space-x-3 bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs";
                card.innerHTML = `
                    <img src="${item.foto}" alt="${item.nombre} - CUPISSA" class="w-14 h-14 object-cover rounded-xl">
                    <div class="flex-1">
                        <h4 class="font-extrabold text-slate-900 uppercase">${item.nombre} <span class="text-[9px] bg-pink-100 fuchsia-text px-1.5 py-0.5 rounded">${item.modalidad}</span></h4>
                        <div class="text-[10px] text-slate-500 font-semibold space-x-1">
                            ${item.talla ? `<span>Talla: ${item.talla}</span>` : ''}
                            ${item.color ? `<span>Color: ${item.color}</span>` : ''}
                            ${item.accesorio ? `<span class="inline-flex items-center gap-1">${item.accesorioFoto ? `<img src="${item.accesorioFoto}" alt="${item.accesorio}" class="w-7 h-7 object-cover rounded-md border">` : ''}Accesorio: ${item.accesorio}</span>` : ''}
                        </div>
                        <div class="font-bold fuchsia-text mt-1">${formatCOP(item.total)} (Anticipo: ${formatCOP(item.valorAnticipo)})</div>
                        ${item.modalidad === 'ALQUILER' && Number(item.deposito || 0) > 0 ? `<div class="text-[10px] text-amber-700 font-semibold mt-1">Depósito reembolsable: ${formatCOP(item.deposito)}</div>` : ''}
                    </div>
                    <div class="flex items-center space-x-2">
                        <span class="font-black text-slate-700">x${item.cantidad}</span>
                        <button onclick="removeCartItem(${index})" class="text-slate-400 hover:text-red-600 p-1"><i class="fa-solid fa-trash"></i></button>
                    </div>
                `;
                container.appendChild(card);
            });

            const refundableDeposits = cart.reduce((sum, item) => sum +
                (item.modalidad === 'ALQUILER' ? Math.max(0, Number(item.deposito || 0)) : 0), 0);
            document.getElementById('cart-total-amount').innerText = formatCOP(grandTotal + refundableDeposits);
            document.getElementById('cart-total-anticipo').innerText = grandTotal >= 10000 ? 'Mínimo cumplido' : `Faltan ${formatCOP(10000 - grandTotal)}`;
            const checkoutButton = document.getElementById('cart-checkout-button');
            if (checkoutButton) { checkoutButton.disabled = grandTotal < 10000; checkoutButton.style.opacity = grandTotal < 10000 ? '.45' : ''; checkoutButton.style.cursor = grandTotal < 10000 ? 'not-allowed' : ''; }
        }

        function removeCartItem(index) {
            cart.splice(index, 1);
            saveCart();
            renderCartItems();
        }

        function checkoutCart() {
            if (cart.length === 0) {
                alert('Tu carrito está vacío.');
                return;
            }
            closeCartModal();
            openCheckoutFormModal();
        }

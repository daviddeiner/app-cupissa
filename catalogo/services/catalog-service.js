/**
 * CUPISSA - Catálogo & Carrito Service
 * Servicio independiente para gestión de productos, favoritos y carrito de compras en localStorage y Supabase
 */

const CatalogService = {
    /**
     * Obtiene todos los productos desde Supabase o por fallback desde localStorage
     */
    async getProducts(supabaseClient) {
        try {
            const { data, error } = await supabaseClient.from('productos').select('*').eq('oculto', false);
            if (error || !Array.isArray(data)) {
                return this.getLocalProducts().filter(product => {
                    const hidden = product?.oculto;
                    return hidden !== true && hidden !== 1 && String(hidden).toLowerCase() !== 'true' && String(hidden) !== '1';
                });
            }
            return data;
        } catch (e) {
            return this.getLocalProducts().filter(product => {
                const hidden = product?.oculto;
                return hidden !== true && hidden !== 1 && String(hidden).toLowerCase() !== 'true' && String(hidden) !== '1';
            });
        }
    },

    getLocalProducts() {
        return JSON.parse(localStorage.getItem('cupissa_local_products') || '[]');
    },

    saveLocalProduct(productData) {
        const products = this.getLocalProducts();
        productData.id = 'loc_' + Date.now();
        products.push(productData);
        localStorage.setItem('cupissa_local_products', JSON.stringify(products));
        return products;
    },

    deleteLocalProduct(prodId) {
        let products = this.getLocalProducts();
        products = products.filter(p => p.id !== prodId);
        localStorage.setItem('cupissa_local_products', JSON.stringify(products));
        return products;
    },

    /**
     * Gestión del Carrito
     */
    getCart() {
        return JSON.parse(localStorage.getItem('cupissa_cart') || '[]');
    },

    saveCart(cart) {
        localStorage.setItem('cupissa_cart', JSON.stringify(cart));
    },

    addToCart(item) {
        const cart = this.getCart();
        cart.push(item);
        this.saveCart(cart);
        return cart;
    },

    removeFromCart(index) {
        const cart = this.getCart();
        cart.splice(index, 1);
        this.saveCart(cart);
        return cart;
    },

    clearCart() {
        localStorage.removeItem('cupissa_cart');
    },

    /**
     * Gestión de Favoritos
     */
    getFavorites() {
        return JSON.parse(localStorage.getItem('cupissa_favs') || '[]');
    },

    toggleFavorite(product) {
        let favs = this.getFavorites();
        const index = favs.findIndex(f => f.id === product.id);
        
        if (index >= 0) {
            favs.splice(index, 1);
        } else {
            favs.push(product);
        }
        
        localStorage.setItem('cupissa_favs', JSON.stringify(favs));
        return favs;
    }
};
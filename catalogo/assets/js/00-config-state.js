/**
 * CUPISSA | Catálogo / configuración y estado global
 * Código extraído de la versión original sin cambiar la lógica.
 */

const SUPABASE_URL = window.CUPISSA_SUPABASE_URL;
const SUPABASE_ANON_KEY = window.CUPISSA_SUPABASE_ANON_KEY;
        const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        let rawProducts = [];
        let filteredProducts = [];
        let currentMatches = [];
        let currentNonMatches = [];
        const CUPISSA_PRODUCT_BATCH_SIZE = 24;
        let displayLimit = CUPISSA_PRODUCT_BATCH_SIZE;
        let featuredSeasonProducts = [];
        let featuredSeasonName = '';
        let configuredFeaturedSeason = '';
        let hasFeaturedSeasonConfiguration = false;
        let isLoadingMore = false;
        let activeMundo = 'TODOS';
        let activeTemporada = 'TODAS';
        let activeCategoria = 'TODAS';
        let activeSubcategoria = 'TODAS';
        // El carrito y los favoritos son compartidos en este navegador, sin depender de la cuenta.
        let cart = [];
        let favorites = [];

        let selectedProductModal = null;
        let selectedQtyModal = 1;
        let selectedModalidad = 'venta';
        let activePhotoIndex = 0;

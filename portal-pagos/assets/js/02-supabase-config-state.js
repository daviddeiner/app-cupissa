/**
 * CUPISSA | Portal de pagos / conexión Supabase y estado
 * Código extraído de la versión original sin cambiar la lógica.
 */

const SUPABASE_URL = window.CUPISSA_SUPABASE_URL;
const SUPABASE_ANON_KEY = window.CUPISSA_SUPABASE_ANON_KEY;
        const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        let currentClient = null;
        let activeCredits = [];
        let selectedOption = 'min';
        
        let baseMinAmount = 0;
        let minAmountWithMora = 0;
        let totalAmount = 0;

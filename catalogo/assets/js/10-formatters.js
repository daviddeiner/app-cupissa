/**
 * CUPISSA | Catálogo / formato de moneda y fechas
 * Código extraído de la versión original sin cambiar la lógica.
 */

function formatCOP(val) {
            return '$ ' + new Intl.NumberFormat('es-CO').format(val || 0);
        }

        function formatDate(str) {
            if (!str) return 'N/A';
            const parts = str.split('-');
            if (parts.length === 3) {
                const date = new Date(parts[0], parts[1] - 1, parts[2]);
                return date.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
            }
            return str;
        }

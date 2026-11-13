/**
 * CUPISSA | Wompi / cálculo de fechas y mora
 * Código extraído de la versión original sin cambiar la lógica.
 */

/**
 * Calcula la fecha de pago adaptada a cualquier frecuencia
 */
function calculateNextDueDate(currentDateStr, frequency) {
    if (!currentDateStr) {
        const today = new Date();
        return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    }

    const parts = String(currentDateStr).split('-').map(Number);
    if (parts.length !== 3 || parts.some(value => !Number.isFinite(value))) {
        throw new Error('La fecha de próximo pago del crédito no tiene un formato válido.');
    }

    const [year, month, day] = parts;
    let d = new Date(year, month - 1, day);
    const normalizedFrequency = String(frequency || 'Mensual')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();

    if (normalizedFrequency.includes('diari')) {
        d.setDate(d.getDate() + 1);
    } else if (normalizedFrequency.includes('seman')) {
        d.setDate(d.getDate() + 7);
    } else if (normalizedFrequency.includes('quinc') || normalizedFrequency.includes('15 dia') || normalizedFrequency.includes('cada 15')) {
        if (day <= 15) {
            const lastDayOfCurrentMonth = new Date(year, month, 0).getDate();
            d = new Date(year, month - 1, Math.min(day + 15, lastDayOfCurrentMonth));
        } else {
            const nextMonthFirstDay = new Date(year, month, 1);
            const nextYear = nextMonthFirstDay.getFullYear();
            const nextMonthIndex = nextMonthFirstDay.getMonth();
            const lastDayOfNextMonth = new Date(nextYear, nextMonthIndex + 1, 0).getDate();
            d = new Date(nextYear, nextMonthIndex, Math.min(day - 15, lastDayOfNextMonth));
        }
    } else {
        // Mensual es también el valor predeterminado si la base de datos no tiene frecuencia.
        // Se limita al último día del mes para evitar saltos (por ejemplo, 31 de enero -> 3 de marzo).
        const nextMonthFirstDay = new Date(year, month, 1);
        const nextYear = nextMonthFirstDay.getFullYear();
        const nextMonthIndex = nextMonthFirstDay.getMonth();
        const lastDayOfNextMonth = new Date(nextYear, nextMonthIndex + 1, 0).getDate();
        d = new Date(nextYear, nextMonthIndex, Math.min(day, lastDayOfNextMonth));
    }

    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

/**
 * Calcula la mora del 4% por cada 5 días de retraso
 */
function calculateMoraDetails(dueDateStr, baseAmount) {
    if (!dueDateStr || baseAmount <= 0) {
        return { daysLate: 0, latePeriods: 0, moraPercentage: 0, moraAmount: 0, totalWithMora: baseAmount };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [year, month, day] = dueDateStr.split('-').map(Number);
    const dueDate = new Date(year, month - 1, day);
    dueDate.setHours(0, 0, 0, 0);

    const diffTime = today - dueDate;
    const daysLate = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));

    const latePeriods = Math.floor(daysLate / 5);
    const moraPercentage = latePeriods * 4;
    const moraAmount = Math.round(baseAmount * (moraPercentage / 100));
    const totalWithMora = baseAmount + moraAmount;

    return {
        daysLate,
        latePeriods,
        moraPercentage,
        moraAmount,
        totalWithMora
    };
}

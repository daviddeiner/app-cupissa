/**
 * CUPISSA | Capa visual de notificaciones y selectores del catálogo.
 * No altera el estado, los precios ni las conexiones de datos.
 */
(function () {
    let toastTimer = null;
    const synchronizedSelects = new WeakSet();

    function ensureToast() {
        let toast = document.getElementById('cupissa-global-toast');
        if (toast) return toast;

        toast = document.createElement('div');
        toast.id = 'cupissa-global-toast';
        toast.className = 'cupissa-global-toast';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        toast.innerHTML = `
            <span class="cupissa-global-toast-icon"><i class="fa-solid fa-circle-info" aria-hidden="true"></i></span>
            <span class="cupissa-global-toast-message"></span>
            <button type="button" class="cupissa-global-toast-close" aria-label="Cerrar aviso"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>`;
        document.body.appendChild(toast);
        toast.querySelector('.cupissa-global-toast-close').addEventListener('click', () => {
            toast.classList.remove('is-visible');
        });
        return toast;
    }

    window.showCupissaToast = function (message, variant = 'info') {
        const toast = ensureToast();
        const icon = toast.querySelector('.cupissa-global-toast-icon i');
        const messageNode = toast.querySelector('.cupissa-global-toast-message');
        messageNode.textContent = String(message ?? '');
        icon.className = variant === 'success'
            ? 'fa-solid fa-circle-check'
            : variant === 'warning'
                ? 'fa-solid fa-triangle-exclamation'
                : 'fa-solid fa-circle-info';
        toast.dataset.variant = variant;
        toast.classList.remove('is-visible');
        void toast.offsetWidth;
        toast.classList.add('is-visible');
        if (toastTimer) window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 3800);
    };

    // Los avisos heredados conservan su llamada original, pero ahora usan la identidad CUPISSA.
    window.alert = function (message) {
        window.showCupissaToast(message, 'warning');
    };

    function refreshDropdown(select, placeholder) {
        const control = select.closest('.cupissa-select-control');
        if (!control) return;
        const trigger = control.querySelector('.cupissa-select-trigger');
        const menu = control.querySelector('.cupissa-select-menu');
        const selected = Array.from(select.options).find(option => option.value === select.value) || select.options[0];
        trigger.querySelector('.cupissa-select-value').textContent = selected ? selected.textContent : placeholder;
        trigger.disabled = select.disabled || select.options.length === 0;
        trigger.setAttribute('aria-expanded', control.classList.contains('is-open') ? 'true' : 'false');
        menu.innerHTML = '';

        Array.from(select.options).forEach((option, index) => {
            const choice = document.createElement('button');
            choice.type = 'button';
            choice.className = 'cupissa-select-option';
            choice.setAttribute('role', 'option');
            choice.setAttribute('aria-selected', option.selected ? 'true' : 'false');
            choice.innerHTML = `<span class="cupissa-select-option-check"><i class="fa-solid fa-check" aria-hidden="true"></i></span><span class="cupissa-select-option-label"></span>`;
            choice.querySelector('.cupissa-select-option-label').textContent = option.textContent;
            choice.addEventListener('click', () => {
                select.selectedIndex = index;
                select.dispatchEvent(new Event('change', { bubbles: true }));
                refreshDropdown(select, placeholder);
                control.classList.remove('is-open');
                trigger.setAttribute('aria-expanded', 'false');
                trigger.focus();
            });
            menu.appendChild(choice);
        });
    }

    window.enhanceCupissaSelect = function (select, placeholder = 'Selecciona una opción') {
        if (!select) return;
        let control = select.closest('.cupissa-select-control');
        if (!control) {
            control = document.createElement('div');
            control.className = 'cupissa-select-control';
            select.parentNode.insertBefore(control, select);
            control.appendChild(select);
            select.classList.add('cupissa-native-select');

            const trigger = document.createElement('button');
            trigger.type = 'button';
            trigger.className = 'cupissa-select-trigger';
            trigger.setAttribute('aria-haspopup', 'listbox');
            trigger.innerHTML = `<span class="cupissa-select-value"></span><i class="fa-solid fa-chevron-down cupissa-select-chevron" aria-hidden="true"></i>`;
            const menu = document.createElement('div');
            menu.className = 'cupissa-select-menu';
            menu.setAttribute('role', 'listbox');
            control.append(trigger, menu);

            trigger.addEventListener('click', () => {
                document.querySelectorAll('.cupissa-select-control.is-open').forEach(openControl => {
                    if (openControl !== control) {
                        openControl.classList.remove('is-open');
                        openControl.querySelector('.cupissa-select-trigger')?.setAttribute('aria-expanded', 'false');
                    }
                });
                const willOpen = !control.classList.contains('is-open');
                control.classList.toggle('is-open', willOpen);
                trigger.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
            });
        }
        if (!synchronizedSelects.has(select)) {
            select.addEventListener('change', () => refreshDropdown(select, placeholder));
            synchronizedSelects.add(select);
        }
        refreshDropdown(select, placeholder);
    };

    document.addEventListener('click', event => {
        if (event.target.closest('.cupissa-select-control')) return;
        document.querySelectorAll('.cupissa-select-control.is-open').forEach(control => {
            control.classList.remove('is-open');
            control.querySelector('.cupissa-select-trigger')?.setAttribute('aria-expanded', 'false');
        });
    });

    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        document.querySelectorAll('.cupissa-select-control.is-open').forEach(control => {
            control.classList.remove('is-open');
            control.querySelector('.cupissa-select-trigger')?.setAttribute('aria-expanded', 'false');
        });
    });
})();

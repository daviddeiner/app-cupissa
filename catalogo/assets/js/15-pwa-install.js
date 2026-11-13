/* CUPISSA | Instalación y actualización de la aplicación PWA */
(() => {
  let deferredInstallPrompt = null;
  let swRegistration = null;
  let updateAvailable = false;
  let applyingUpdate = false;
  let reloadAfterUpdate = false;

  const button = () => document.getElementById('install-app-button');
  const help = document.getElementById('install-app-help');
  const helpText = document.getElementById('install-app-help-text');

  function isInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  }

  function setButtonState(state) {
    const target = button();
    if (!target) return;
    const label = target.querySelector('span');
    const icon = target.querySelector('i');
    const config = {
      install: ['Descargar aplicación', 'fa-solid fa-download'],
      installed: ['Aplicación instalada', 'fa-solid fa-check'],
      update: ['Actualizar aplicación', 'fa-solid fa-rotate'],
      updating: ['Actualizando aplicación…', 'fa-solid fa-spinner fa-spin']
    }[state] || ['Descargar aplicación', 'fa-solid fa-download'];
    if (label) label.textContent = config[0];
    if (icon) icon.className = config[1];
    target.setAttribute('aria-label', config[0] + ' CUPISSA');
    target.dataset.appState = state;
  }

  function showHelp(message) {
    if (!help || !helpText) return;
    helpText.textContent = message;
    help.classList.remove('hidden');
    help.classList.add('flex');
  }

  window.closeInstallAppHelp = function() {
    if (!help) return;
    help.classList.add('hidden');
    help.classList.remove('flex');
  };

  function markUpdateAvailable() {
    updateAvailable = true;
    setButtonState('update');
  }

  function watchRegistration(registration) {
    swRegistration = registration;
    if (registration.waiting && navigator.serviceWorker.controller) {
      markUpdateAvailable();
    }

    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          markUpdateAvailable();
        }
      });
    });

    // Comprobar en cada apertura para que una versión publicada aparezca como actualización.
    registration.update().catch(error => {
      console.warn('No se pudo comprobar una actualización de CUPISSA:', error);
    });
  }

  async function applyAvailableUpdate() {
    const waiting = swRegistration?.waiting;
    if (!waiting) return false;
    applyingUpdate = true;
    reloadAfterUpdate = true;
    setButtonState('updating');
    waiting.postMessage({ type: 'CUPISSA_SKIP_WAITING' });
    return true;
  }

  window.handleInstallApp = async function() {
    if (updateAvailable && swRegistration?.waiting) {
      await applyAvailableUpdate();
      return;
    }

    if (isInstalled()) {
      if (swRegistration) {
        setButtonState('installed');
        try {
          await swRegistration.update();
          await new Promise(resolve => window.setTimeout(resolve, 1600));
          if (swRegistration.waiting) {
            markUpdateAvailable();
            showHelp('Hay una nueva versión de CUPISSA. Pulsa «Actualizar aplicación» para aplicar los cambios.');
          } else {
            setButtonState('installed');
            showHelp('Tu aplicación CUPISSA está actualizada.');
          }
        } catch (error) {
          console.warn('No se pudo comprobar la versión de CUPISSA:', error);
          showHelp('No fue posible comprobar si hay una actualización. Inténtalo cuando tengas conexión.');
        }
      } else {
        showHelp('CUPISSA ya está instalada en este dispositivo.');
      }
      return;
    }

    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      try {
        const choice = await deferredInstallPrompt.userChoice;
        if (choice && choice.outcome === 'accepted') {
          deferredInstallPrompt = null;
          setButtonState('installed');
        }
      } catch (error) {
        console.warn('No se pudo completar la instalación de CUPISSA:', error);
      }
      return;
    }

    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) {
      showHelp('En Safari, toca el botón Compartir, selecciona «Añadir a pantalla de inicio» y después pulsa «Añadir». CUPISSA aparecerá como una aplicación con su icono sobre fondo blanco.');
    } else if (/Android/i.test(ua)) {
      showHelp('Abre el menú de tu navegador (⋮) y selecciona «Instalar aplicación» o «Añadir a pantalla de inicio». Confirma la instalación para colocar CUPISSA en tu celular.');
    } else {
      showHelp('Para instalar CUPISSA como aplicación, abre esta página desde el navegador de tu celular. En Android podrás instalarla desde el menú del navegador; en iPhone, usa Safari y «Añadir a pantalla de inicio».');
    }
  };

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (!isInstalled() && !updateAvailable) setButtonState('install');
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    setButtonState('installed');
  });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadAfterUpdate && !window.__cupissaReloadedForUpdate) {
        window.__cupissaReloadedForUpdate = true;
        window.location.reload();
      }
    });

    window.addEventListener('load', () => {
      navigator.serviceWorker.register('../service-worker.js', { scope: '../' })
        .then(watchRegistration)
        .catch(error => console.warn('No se pudo registrar el modo aplicación de CUPISSA:', error));
    }, { once: true });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && swRegistration) {
        swRegistration.update().catch(() => {});
      }
    });
  }

  setButtonState(isInstalled() ? 'installed' : 'install');
})();

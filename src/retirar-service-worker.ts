// La versión publicada desactivó el service worker para evitar versiones antiguas.
// Se conserva IndexedDB: contiene registros pendientes y la sesión de Firebase.
export async function retirarServiceWorker(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;
  try {
    const controlado = Boolean(navigator.serviceWorker.controller);
    const registros = await navigator.serviceWorker.getRegistrations();
    const base = new URL(document.baseURI);
    await Promise.all(
      registros
        .filter((registro) => registro.scope === base.href)
        .map((registro) => registro.unregister()),
    );
    if ('caches' in window) {
      const nombres = await caches.keys();
      await Promise.all(
        nombres
          .filter((nombre) => nombre.startsWith('ngsw:'))
          .map((nombre) => caches.delete(nombre)),
      );
    }
    if (controlado && !sessionStorage.getItem('pav-sw-cleared-v1')) {
      sessionStorage.setItem('pav-sw-cleared-v1', '1');
      window.location.reload();
      return true;
    }
  } catch (error) {
    console.warn('No se pudo retirar el service worker anterior.', error);
  }
  return false;
}

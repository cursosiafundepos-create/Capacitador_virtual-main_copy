// Guarda en IndexedDB (no en el servidor) la grabación de un paso cuando la
// subida falla -por ejemplo, la sesión de administrador expiró justo al
// terminar de grabar, porque el servidor se reinició-. Así el video no se
// pierde: queda disponible para reintentar la subida sin volver a grabar,
// incluso si la persona recarga la página para volver a ingresar la
// contraseña.
const PendingUploads = (() => {
  const DB_NAME = 'cata-pending-uploads';
  const STORE = 'recordings';

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function save(record) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function get(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function remove(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  return { save, get, remove };
})();

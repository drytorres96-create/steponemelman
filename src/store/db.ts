/** Persistencia en IndexedDB, con respaldo en localStorage si IndexedDB no está disponible. */
const DB = 'step1-progreso', TIENDA = 'kv', VERSION = 1

function abrir(): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    try {
      const req = indexedDB.open(DB, VERSION)
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(TIENDA)) req.result.createObjectStore(TIENDA) }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch { resolve(null) }
  })
}

export async function leer<T>(clave: string): Promise<T | null> {
  const db = await abrir()
  if (!db) { try { const v = localStorage.getItem(`${DB}:${clave}`); return v ? JSON.parse(v) as T : null } catch { return null } }
  return new Promise(resolve => {
    const tx = db.transaction(TIENDA, 'readonly').objectStore(TIENDA).get(clave)
    tx.onsuccess = () => resolve((tx.result as T) ?? null)
    tx.onerror = () => resolve(null)
  })
}

export async function escribir(clave: string, valor: unknown): Promise<void> {
  const db = await abrir()
  if (!db) { try { localStorage.setItem(`${DB}:${clave}`, JSON.stringify(valor)) } catch { /* cuota */ } return }
  await new Promise<void>(resolve => {
    const tx = db.transaction(TIENDA, 'readwrite')
    tx.objectStore(TIENDA).put(valor, clave)
    tx.oncomplete = () => resolve(); tx.onerror = () => resolve(); tx.onabort = () => resolve()
  })
}

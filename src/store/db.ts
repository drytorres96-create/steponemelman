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

export async function leer<T>(clave: string, opciones: { estricto?: boolean } = {}): Promise<T | null> {
  const db = await abrir()
  if (!db) { try { const v = localStorage.getItem(`${DB}:${clave}`); return v ? JSON.parse(v) as T : null } catch (error) { if (opciones.estricto) throw error; return null } }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TIENDA, 'readonly').objectStore(TIENDA).get(clave)
    tx.onsuccess = () => resolve((tx.result as T) ?? null)
    tx.onerror = () => opciones.estricto ? reject(tx.error ?? new Error('No se pudo leer')) : resolve(null)
  })
}

export async function escribir(clave: string, valor: unknown, opciones: { estricto?: boolean } = {}): Promise<void> {
  const db = await abrir()
  if (!db) { try { localStorage.setItem(`${DB}:${clave}`, JSON.stringify(valor)) } catch (error) { if (opciones.estricto) throw error } return }
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(TIENDA, 'readwrite')
    tx.objectStore(TIENDA).put(valor, clave)
    tx.oncomplete = () => resolve()
    tx.onerror = tx.onabort = () => opciones.estricto ? reject(tx.error ?? new Error('No se pudo guardar')) : resolve()
  })
}

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

/** Claves guardadas que empiezan por el prefijo indicado. Nunca falla: devuelve [] si no puede leerlas. */
export async function clavesConPrefijo(prefijo: string): Promise<string[]> {
  const db = await abrir()
  if (!db) {
    try {
      return Object.keys(localStorage)
        .filter(clave => clave.startsWith(`${DB}:${prefijo}`))
        .map(clave => clave.slice(DB.length + 1))
    } catch { return [] }
  }
  return new Promise(resolve => {
    const tx = db.transaction(TIENDA, 'readonly').objectStore(TIENDA).getAllKeys()
    tx.onsuccess = () => resolve((tx.result as IDBValidKey[])
      .filter((clave): clave is string => typeof clave === 'string' && clave.startsWith(prefijo)))
    tx.onerror = () => resolve([])
  })
}

/** Elimina claves obsoletas. Liberar espacio nunca debe interrumpir el estudio: los errores se ignoran. */
export async function borrar(claves: string[]): Promise<void> {
  if (!claves.length) return
  const db = await abrir()
  if (!db) { try { for (const clave of claves) localStorage.removeItem(`${DB}:${clave}`) } catch { /* sin limpieza */ } return }
  await new Promise<void>(resolve => {
    const tx = db.transaction(TIENDA, 'readwrite')
    const tienda = tx.objectStore(TIENDA)
    for (const clave of claves) tienda.delete(clave)
    tx.oncomplete = () => resolve()
    tx.onerror = tx.onabort = () => resolve()
  })
}

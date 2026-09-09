/** Normalización y comparación de respuestas escritas — sin coincidencia exacta ciega. */
export function normalizar(s: string): string {
  return (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/(\d)[.,](\d)/g, '$1\u00b7$2')        // protege el separador decimal
    .replace(/[^a-z0-9\u03b1\u03b2\u03b3\u03b4\u03bc+\-/%\u00b7 ]/g, ' ')
    .replace(/\u00b7/g, '.')
    .replace(/\s+/g, ' ').trim()
}

/** Distancia de Levenshtein acotada, para distinguir error ortográfico de error conceptual. */
export function distancia(a: string, b: string): number {
  const m = a.length, n = b.length
  if (!m) return n; if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[n]
}

export type Veredicto = 'correcta' | 'parcial' | 'ortografia' | 'incorrecta'

/**
 * Compara la respuesta del estudiante con la canónica y sus sinónimos.
 * - `correcta`   coincide tras normalizar, o contiene el núcleo de la respuesta
 * - `ortografia` se parece mucho (≤2 ediciones o ≤15 % de la longitud) pero no es exacta
 * - `parcial`    acierta parte del contenido (≥60 % de las palabras significativas)
 */
export function evaluarTexto(entrada: string, canonica: string, sinonimos: string[] = [],
                             incorrectasCercanas: string[] = []): Veredicto {
  const e = normalizar(entrada)
  if (!e) return 'incorrecta'
  const candidatos = [canonica, ...sinonimos].map(normalizar).filter(Boolean)
  for (const c of candidatos) if (e === c) return 'correcta'

  // una escritura que produce OTRO término médico nunca se acepta como ortografía
  const trampa = incorrectasCercanas.map(normalizar).some(t => t && (t === e || distancia(e, t) <= 1))

  // 1) casi idéntico -> errata, no acierto: la ortografía de un término médico importa
  if (!trampa) {
    for (const c of candidatos) {
      const umbral = Math.max(2, Math.round(c.length * 0.15))
      if (distancia(e, c) <= umbral) return 'ortografia'
    }
  }
  // 2) el estudiante escribió el núcleo dentro de una frase (o al revés)
  for (const c of candidatos) {
    if (c.length < 7) continue
    const mayor = Math.max(e.length, c.length)
    if ((e.includes(c) || c.includes(e)) && Math.abs(e.length - c.length) <= mayor * 0.5) return 'correcta'
  }
  const stop = new Set(['de','la','el','los','las','del','en','y','a','un','una','por','con','que','se','al'])
  const palabras = normalizar(canonica).split(' ').filter(w => w.length > 3 && !stop.has(w))
  if (palabras.length) {
    const aciertos = palabras.filter(w => e.includes(w)).length
    if (aciertos / palabras.length >= 0.6) return 'parcial'
    if (aciertos > 0) return 'parcial'
  }
  return 'incorrecta'
}

export function evaluarNumero(entrada: string, esperado: string, tolerancia?: number | null): Veredicto {
  const num = (s: string) => {
    const m = String(s).replace(',', '.').match(/-?\d+(\.\d+)?(\/\d+(\.\d+)?)?/)
    if (!m) return NaN
    if (m[0].includes('/')) { const [a, b] = m[0].split('/').map(Number); return a / b }
    return Number(m[0])
  }
  const a = num(entrada), b = num(esperado)
  if (Number.isNaN(a) || Number.isNaN(b)) return evaluarTexto(entrada, esperado)
  const tol = tolerancia ?? Math.max(Math.abs(b) * 0.02, 0.01)
  if (Math.abs(a - b) <= tol) return 'correcta'
  if (Math.abs(a - b) <= tol * 5) return 'parcial'
  return 'incorrecta'
}

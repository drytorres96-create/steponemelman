/**
 * Registro mínimo del Worker.
 *
 * Antes, los cinco fallos posibles devolvían el mismo 503 y no dejaban ni una línea en los logs:
 * quedarse sin red y no poder guardar el progreso se veían idénticos desde el teléfono y desde
 * `wrangler tail`. Esto escribe una línea por fallo, con una etiqueta estable, y nunca incluye
 * credenciales, tokens ni respuestas del estudiante.
 */
const CREDENCIALES = [
  /sb_[A-Za-z0-9_-]{8,}/g,
  /Bearer\s+[A-Za-z0-9._-]{8,}/gi,
  /eyJ[A-Za-z0-9._-]{20,}/g,
]

export function mensajeSeguro(causa: unknown): string {
  const texto = causa instanceof Error ? `${causa.name}: ${causa.message}` : String(causa)
  return CREDENCIALES.reduce((t, patron) => t.replace(patron, '[oculto]'), texto).slice(0, 300)
}

/** `donde` identifica el punto del código, no el contenido: sirve para buscar en los logs. */
export function registrar(donde: string, causa: unknown, extra: Record<string, string | number> = {}): void {
  console.error(JSON.stringify({ evento: 'fallo', donde, mensaje: mensajeSeguro(causa), ...extra }))
}

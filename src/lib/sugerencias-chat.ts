import type { Concepto } from '../schema/concept'

const DIRECCION: Record<string, string> = { sube: 'sube', baja: 'baja', sin_cambio: 'no cambia' }

/**
 * Las preguntas que probablemente quieras hacer sobre este ítem, ya escritas.
 *
 * La duda casi nunca es «explícame el concepto»: es «¿por qué esta fila va hacia abajo?»
 * o «¿por qué no era esta otra opción?». Eso se puede deducir del propio ítem, así que la
 * primera pregunta está a un toque y no hay que redactarla con el teclado del móvil.
 *
 * Salen del material, nunca de la IA: son el enunciado del concepto reformulado.
 */
export function sugerenciasDePregunta(c: Concepto, maximo = 5): string[] {
  const sugerencias: string[] = []

  // Predicción direccional: cada variable del ítem es una duda potencial por sí sola.
  for (const f of (c.evaluacion.flechas ?? []).slice(0, 3)) {
    sugerencias.push(`¿Por qué ${f.variable} ${DIRECCION[f.direccion] ?? 'se comporta así'} en este caso?`)
  }
  for (const o of (c.evaluacion.opciones ?? []).filter(x => !x.correcta).slice(0, 2)) {
    sugerencias.push(`¿Por qué no es «${o.texto}»?`)
  }
  for (const x of c.confusiones.slice(0, 2)) {
    sugerencias.push(`¿Cómo lo distingo de ${x}?`)
  }
  sugerencias.push('Explícame el mecanismo paso a paso')

  const vistas = new Set<string>()
  return sugerencias.filter(s => s.length <= 120 && !vistas.has(s) && vistas.add(s)).slice(0, maximo)
}

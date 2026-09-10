import type { Concepto, Modulo } from '../schema/concept'
import type { ProgresoConcepto } from '../srs/tipos'
import { conceptosUnicos, conceptosVencidos, construirPlanDiario, erroresRecientesPendientes, limiteValido, ultimoIntentoResuelto } from './plan-estudio'

export type RutaId = 'guiada' | 'sistemas' | 'disciplinas' | 'mixta' | 'repaso' | 'debiles'
  | 'confusiones' | 'examen' | 'direccional' | 'terminos'

export interface DefRuta { id: RutaId; nombre: string; descripcion: string }
export const RUTAS: DefRuta[] = [
  { id: 'guiada', nombre: 'Ruta guiada', descripcion: 'Primero repasos pendientes y errores recientes; después fundamentos nuevos antes de su aplicación. Puedes cambiar de ruta.' },
  { id: 'sistemas', nombre: 'Por sistemas', descripcion: 'Estudia el material disponible de un sistema, empezando por lo que necesita repaso.' },
  { id: 'disciplinas', nombre: 'Por disciplinas', descripcion: 'Trabaja una disciplina a fondo (bioquímica, farmacología, patología…).' },
  { id: 'mixta', nombre: 'Integración mixta', descripcion: 'Alterna disciplinas de conceptos que ya estudiaste.' },
  { id: 'repaso', nombre: 'Repaso espaciado', descripcion: 'Repasos vencidos, ordenados por la prioridad del planificador.' },
  { id: 'debiles', nombre: 'Por reforzar', descripcion: 'Repasos pendientes y errores del último intento en los últimos siete días. Los fallos históricos ya superados no te mantienen aquí.' },
  { id: 'confusiones', nombre: 'Confusiones por revisar', descripcion: 'Conceptos cuyo último intento reciente registra una confusión aún sin resolver.' },
  { id: 'examen', nombre: 'Práctica sin ayuda', descripcion: 'Hasta 20 preguntas de opción múltiple o casos con opciones sobre material ya estudiado. Al terminar verás la corrección.' },
  { id: 'direccional', nombre: 'Predicción direccional', descripcion: 'Las preguntas de flechas: qué sube, qué baja, qué no cambia.' },
  { id: 'terminos', nombre: 'Términos difíciles', descripcion: 'Fijación ortográfica de fármacos, enzimas, epónimos y síndromes.' },
]

const barajar = <T,>(a: T[]): T[] => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]] } return b }

/**
 * El intercalado no es aleatorio: sólo mezcla disciplinas de las que ya hubo exposición previa.
 * Alterna los grupos mientras queden conceptos de varias disciplinas.
 */
export function intercalar(cs: Concepto[]): Concepto[] {
  const por = new Map<string, Concepto[]>()
  for (const c of cs) {
    const k = c.clasificacion.disciplina_primaria
    if (!por.has(k)) por.set(k, [])
    por.get(k)!.push(c)
  }
  const grupos = [...por.values()].map(barajar)
  const salida: Concepto[] = []
  let quedan = true
  while (quedan) {
    quedan = false
    for (const g of grupos) { const x = g.shift(); if (x) { salida.push(x); quedan = true } }
  }
  return salida
}

export function construirCola(
  ruta: RutaId, conceptos: Concepto[], progreso: Record<string, ProgresoConcepto>,
  limite: number, ahora = Date.now(),
): Concepto[] {
  conceptos = conceptosUnicos(conceptos)
  limite = limiteValido(limite)
  const p = (c: Concepto) => progreso[c.concept_id]
  const visto = (c: Concepto) => !!p(c)?.intentos.length

  switch (ruta) {
    case 'repaso':
      return conceptosVencidos(conceptos, progreso, ahora).slice(0, limite)
    case 'debiles':
      return conceptosUnicos([...conceptosVencidos(conceptos, progreso, ahora),
        ...erroresRecientesPendientes(conceptos, progreso, ahora)]).slice(0, limite)
    case 'confusiones':
      return erroresRecientesPendientes(conceptos, progreso, ahora)
        .filter(c => ultimoIntentoResuelto(p(c))?.tipo_error === 'confusion_conceptos').slice(0, limite)
    case 'direccional':
      return barajar(conceptos.filter(c => c.interaccion.recomendada === 'prediccion_direccional')).slice(0, limite)
    case 'terminos':
      return barajar(conceptos.filter(c => c.escritura_correctiva.elegible)).slice(0, limite)
    case 'examen':
      return barajar(conceptos.filter(c => visto(c)
        && ['opcion_multiple', 'caso_clinico'].includes(c.interaccion.recomendada)
        && (c.evaluacion.opciones?.length ?? 0) >= 2
        && c.evaluacion.opciones?.filter(o => o.correcta).length === 1)).slice(0, Math.min(20, limite))
    case 'mixta': {
      return intercalar(conceptos.filter(visto)).slice(0, limite)
    }
    default: {
      return construirPlanDiario(conceptos, progreso, limite, ahora).conceptos
    }
  }
}

export function modulosOrdenados(modulos: Modulo[]): Modulo[] {
  return [...modulos].sort((a, b) => a.orden - b.orden)
}

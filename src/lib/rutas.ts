import type { Concepto, Modulo } from '../schema/concept'
import type { ProgresoConcepto } from '../srs/tipos'
import { estaVencido, prioridad } from '../srs/fsrs'

export type RutaId = 'guiada' | 'sistemas' | 'disciplinas' | 'mixta' | 'repaso' | 'debiles'
  | 'confusiones' | 'examen' | 'direccional' | 'terminos'

export interface DefRuta { id: RutaId; nombre: string; descripcion: string }
export const RUTAS: DefRuta[] = [
  { id: 'guiada', nombre: 'Ruta guiada', descripcion: 'Sigue el orden de prerrequisitos: primero las ciencias básicas que sostienen el resto.' },
  { id: 'sistemas', nombre: 'Por sistemas', descripcion: 'Recorre un sistema completo, del mecanismo a la clínica.' },
  { id: 'disciplinas', nombre: 'Por disciplinas', descripcion: 'Trabaja una disciplina a fondo (bioquímica, farmacología, patología…).' },
  { id: 'mixta', nombre: 'Integración mixta', descripcion: 'Intercala disciplinas ya expuestas para forzar la discriminación.' },
  { id: 'repaso', nombre: 'Repaso espaciado', descripcion: 'Sólo lo que vence hoy, por prioridad de olvido.' },
  { id: 'debiles', nombre: 'Conceptos débiles', descripcion: 'Los que más veces has fallado.' },
  { id: 'confusiones', nombre: 'Confusiones frecuentes', descripcion: 'Conceptos donde confundiste una categoría cercana.' },
  { id: 'examen', nombre: 'Modo examen', descripcion: 'Sin pistas ni enseñanza previa: sólo recuperación.' },
  { id: 'direccional', nombre: 'Predicción direccional', descripcion: 'Las preguntas de flechas: qué sube, qué baja, qué no cambia.' },
  { id: 'terminos', nombre: 'Términos difíciles', descripcion: 'Fijación ortográfica de fármacos, enzimas, epónimos y síndromes.' },
]

const barajar = <T,>(a: T[]): T[] => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]] } return b }

/**
 * El intercalado no es aleatorio: sólo mezcla disciplinas de las que ya hubo exposición previa.
 * Reparte en round-robin para que dos conceptos consecutivos no sean de la misma disciplina.
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
  const p = (c: Concepto) => progreso[c.concept_id]
  const visto = (c: Concepto) => !!p(c)?.intentos.length

  switch (ruta) {
    case 'repaso':
      return conceptos.filter(c => p(c) && estaVencido(p(c)!, ahora))
        .sort((a, b) => prioridad(p(b)!, ahora) - prioridad(p(a)!, ahora)).slice(0, limite)
    case 'debiles':
      return conceptos.filter(c => (p(c)?.fallos ?? 0) > 0)
        .sort((a, b) => (p(b)!.fallos - p(b)!.aciertos) - (p(a)!.fallos - p(a)!.aciertos)).slice(0, limite)
    case 'confusiones':
      return conceptos.filter(c => p(c)?.intentos.some(i => i.tipo_error === 'confusion_conceptos')).slice(0, limite)
    case 'direccional':
      return barajar(conceptos.filter(c => c.interaccion.recomendada === 'prediccion_direccional')).slice(0, limite)
    case 'terminos':
      return barajar(conceptos.filter(c => c.escritura_correctiva.elegible)).slice(0, limite)
    case 'examen':
      return barajar(conceptos.filter(visto)).slice(0, limite)
    case 'mixta': {
      // sólo lo ya expuesto, más algunos nuevos de disciplinas ya iniciadas
      const disciplinasIniciadas = new Set(conceptos.filter(visto).map(c => c.clasificacion.disciplina_primaria))
      const base = conceptos.filter(c => visto(c) || disciplinasIniciadas.has(c.clasificacion.disciplina_primaria))
      return intercalar(base.length ? base : conceptos).slice(0, limite)
    }
    default: {
      // guiada / sistemas / disciplinas: primero lo vencido, luego lo nuevo en el orden del corpus
      const vencidos = conceptos.filter(c => p(c) && estaVencido(p(c)!, ahora))
        .sort((a, b) => prioridad(p(b)!, ahora) - prioridad(p(a)!, ahora))
      const nuevos = conceptos.filter(c => !p(c)?.intentos.length)
      const resto = conceptos.filter(c => p(c)?.intentos.length && !estaVencido(p(c)!, ahora))
      return [...vencidos, ...nuevos, ...resto].slice(0, limite)
    }
  }
}

export function modulosOrdenados(modulos: Modulo[]): Modulo[] {
  return [...modulos].sort((a, b) => a.orden - b.orden)
}

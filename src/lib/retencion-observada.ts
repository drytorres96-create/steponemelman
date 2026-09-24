import type { Concepto } from '../schema/concept'
import type { Intento, ProgresoConcepto } from '../srs/tipos'

const DIA = 86_400_000
export interface Fraccion { favorables: number; n: number }
export interface EvidenciaDiferida { retencion: Fraccion; repeticion: Fraccion }
export interface TopicEstado { id: number; name: string; status: number }
const vacia = (): EvidenciaDiferida => ({ retencion: { favorables: 0, n: 0 }, repeticion: { favorables: 0, n: 0 } })
const correcta = (i: Intento) => i.resultado === 'correcta' || i.resultado === 'ortografia'
const independiente = (i: Intento) => ['correcta', 'ortografia', 'parcial', 'incorrecta'].includes(i.resultado ?? '')
  && i.pistas_usadas === 0 && i.fuente_consultada === false && i.explicacion_previa === false

/** El intervalo parte del intento previo registrado, incluso si hubo ayuda.
 * No se presenta un repaso reciente asistido como 30 días sin exposición. */
export function evidenciaDiferida(progresos: ProgresoConcepto[], desde = 0, hasta = Date.now()): EvidenciaDiferida {
  const resultado = vacia()
  for (const p of progresos) {
    const intentos = [...p.intentos].filter(i => i.ts <= hasta).sort((a, b) => a.ts - b.ts)
    for (let n = 1; n < intentos.length; n++) {
      const actual = intentos[n], previo = intentos[n - 1]
      if (actual.ts < desde || !independiente(actual) || !independiente(previo)) continue
      // Un cambio conocido de contenido no se compara como el mismo instrumento.
      if (!actual.pregunta_version || !previo.pregunta_version || actual.pregunta_version !== previo.pregunta_version) continue
      const intervalo = actual.ts - previo.ts
      if (intervalo >= 30 * DIA) {
        resultado.retencion.n++
        if (correcta(actual)) resultado.retencion.favorables++
      }
      if (!correcta(previo) && intervalo >= DIA) {
        resultado.repeticion.n++
        if (!correcta(actual)) resultado.repeticion.favorables++
      }
    }
  }
  return resultado
}

export function porcentajeObservado(f: Fraccion): number | null {
  return f.n ? Math.round(100 * f.favorables / f.n) : null
}
const limpio = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
/** Correspondencia explícita con topics; desconocido nunca se trata como cerrado. */
export function topicDeConcepto(c: Concepto): string {
  const disciplina = c.clasificacion.disciplina_primaria
  if (['Bioquímica', 'Genética', 'Microbiología', 'Inmunología'].includes(disciplina)) return limpio(disciplina)
  if (['Ética médica', 'Bioestadística'].includes(disciplina)) return 'social sciences'
  const sistema = limpio(c.clasificacion.sistema_primario)
  return ({ 'hematologico y oncologico': 'hematologia/oncologia', neurologico: 'neurologia', multisistemico: 'multisystem' } as Record<string, string>)[sistema] ?? sistema
}
export function evidenciaPorTopic(conceptos: Concepto[], progresos: Record<string, ProgresoConcepto>, topics: TopicEstado[], desde = 0, hasta = Date.now()) {
  return topics.filter(t => t.status === 2).map(t => ({ nombre: t.name,
    ...evidenciaDiferida(conceptos.filter(c => topicDeConcepto(c) === limpio(t.name)).flatMap(c => progresos[c.concept_id] ? [progresos[c.concept_id]] : []), desde, hasta),
  }))
}

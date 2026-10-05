import type { Concepto } from '../schema/concept'
import type { Intento, ProgresoConcepto } from '../srs/tipos'
import { tipoEvidenciaDeIntento } from '../srs/mastery'

const DIA = 86_400_000
export interface Fraccion { favorables: number; n: number }
export type TipoEvidenciaObservada = 'recuerdo' | 'discriminacion' | 'aplicacion'
export interface EvidenciaPorTipo { retencion: Fraccion; repeticion: Fraccion }
export interface EvidenciaDiferida extends EvidenciaPorTipo { porTipo: Record<TipoEvidenciaObservada, EvidenciaPorTipo> }
export interface TopicEstado { id: number; name: string; status: number }
const fraccionesVacias = (): EvidenciaPorTipo => ({ retencion: { favorables: 0, n: 0 }, repeticion: { favorables: 0, n: 0 } })
const vacia = (): EvidenciaDiferida => ({ ...fraccionesVacias(), porTipo: {
  recuerdo: fraccionesVacias(), discriminacion: fraccionesVacias(), aplicacion: fraccionesVacias(),
} })
export const respuestaCorrectaObservada = (i: Intento) => i.resultado === 'correcta' || i.resultado === 'ortografia'
/** También admite fallos, necesarios para medir el resultado observado. La ayuda desconocida no se presupone ausente. */
export const intentoObservable = (i: Intento) => ['correcta', 'ortografia', 'parcial', 'incorrecta'].includes(i.resultado ?? '')
  && i.pistas_usadas === 0 && i.fuente_consultada === false && i.explicacion_previa === false
  && !!i.pregunta_version?.trim()

/** Misma lectura conservadora que el dominio; no reescribe los formatos históricos. */
export const tipoEvidenciaObservada = tipoEvidenciaDeIntento

/** El intervalo parte del intento previo registrado, incluso si hubo ayuda.
 * No se presenta un repaso reciente asistido como 30 días sin exposición. */
export function evidenciaDiferida(progresos: ProgresoConcepto[], desde = 0, hasta = Date.now()): EvidenciaDiferida {
  const resultado = vacia()
  for (const p of progresos) {
    const intentos = [...p.intentos].filter(i => i.ts <= hasta).sort((a, b) => a.ts - b.ts)
    for (let n = 1; n < intentos.length; n++) {
      const actual = intentos[n], previo = intentos[n - 1]
      if (actual.ts < desde || !intentoObservable(actual) || !intentoObservable(previo)) continue
      // Un cambio conocido de contenido no se compara como el mismo instrumento.
      if (!actual.pregunta_version || !previo.pregunta_version || actual.pregunta_version !== previo.pregunta_version) continue
      const intervalo = actual.ts - previo.ts
      const tipo = resultado.porTipo[tipoEvidenciaObservada(actual)]
      if (intervalo >= 30 * DIA) {
        resultado.retencion.n++
        tipo.retencion.n++
        if (respuestaCorrectaObservada(actual)) { resultado.retencion.favorables++; tipo.retencion.favorables++ }
      }
      if (!respuestaCorrectaObservada(previo) && intervalo >= DIA) {
        resultado.repeticion.n++
        tipo.repeticion.n++
        if (!respuestaCorrectaObservada(actual)) { resultado.repeticion.favorables++; tipo.repeticion.favorables++ }
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
  const porTopic = new Map<string, ProgresoConcepto[]>()
  const incluidos = new Set<string>()
  for (const c of conceptos) {
    const p = progresos[c.concept_id]
    if (!p || incluidos.has(c.concept_id)) continue
    incluidos.add(c.concept_id)
    const nombre = topicDeConcepto(c)
    const lista = porTopic.get(nombre) ?? []
    lista.push(p)
    porTopic.set(nombre, lista)
  }
  return topics.filter(t => t.status === 2).map(t => ({ nombre: t.name,
    ...evidenciaDiferida(porTopic.get(limpio(t.name)) ?? [], desde, hasta),
  }))
}

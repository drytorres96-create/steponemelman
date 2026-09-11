import type { Concepto } from '../schema/concept'

export type Correccion = { tema?: string; disciplina_primaria?: string; sistema_primario?: string; nota?: string }
export function celdaCSV(valor: string): string {
  // Las propuestas se exportan como texto incluso al abrirlas en una hoja de cálculo.
  const texto = /^[\t\r\n]|^[\s\u0000-\u001f]*[=+@-]/.test(valor) ? `'${valor}` : valor
  return `"${texto.replace(/"/g, '""')}"`
}
export function csvAuditoria(conceptos: Concepto[], notas: Record<string, Correccion>): string {
  const filas = [['concept_id', 'doc', 'page', 'pdf_page', 'disciplina', 'sistema', 'tipo', 'interaccion', 'confianza', 'alertas', 'afirmacion', 'respuesta', 'tema_propuesto', 'disciplina_propuesta', 'sistema_propuesto', 'nota_revision']]
  for (const c of conceptos) {
    const n = notas[c.concept_id] ?? {}
    filas.push([c.concept_id, c.source.doc, String(c.source.page), c.source.pdf_page ? String(c.source.pdf_page) : '',
      c.clasificacion.disciplina_primaria, c.clasificacion.sistema_primario, c.clasificacion.tipo_conocimiento,
      c.interaccion.recomendada, String(c.calidad.confianza), c.calidad.alertas.join(' | '), c.afirmacion, c.respuesta_canonica,
      n.tema ?? '', n.disciplina_primaria ?? '', n.sistema_primario ?? '', n.nota ?? ''])
  }
  return '\uFEFF' + filas.map(f => f.map(celdaCSV).join(',')).join('\r\n')
}
export function jsonNotas(correcciones: Record<string, Correccion>, fecha = new Date().toISOString()): string {
  return JSON.stringify({ version: 1, fecha, correcciones }, null, 2)
}

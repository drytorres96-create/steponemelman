import type { Concepto } from '../schema/concept'

/** La corrección es evidencia docente; el fragmento original conserva su procedencia. */
export function fundamentoEditorial(c: Concepto): string | null {
  const revision = c.revision_editorial
  const fundamento = revision?.fundamento
  if (!fundamento || fundamento.texto.trim().length < 15 || fundamento.texto.length > 1600
    || !/^\d+\.\d+\.\d+$/.test(fundamento.revision)
    || !revision.fuentes.length || revision.fuentes.some(f => !f.titulo.trim() || !/^https:\/\//i.test(f.url))) return null
  return fundamento.texto
}

export function materialAptoParaIA(c: Concepto): boolean {
  return c.calidad.estado === 'aprobado' && c.calidad.confianza >= 0.7 && c.step !== 'step2'
    && (!c.revision_editorial || fundamentoEditorial(c) !== null)
}

/** Una revisión incompleta nunca vuelve a usar el fragmento que necesitaba corregirse. */
export function fragmentoDocente(c: Concepto): string {
  return c.revision_editorial ? fundamentoEditorial(c) ?? '' : c.source.fragment
}

export function referenciaDocente(c: Concepto): { title: string; page: number } {
  return c.revision_editorial
    ? { title: `Revisión docente · ${c.source.doc_title}`, page: c.source.page }
    : { title: c.source.doc_title, page: c.source.pdf_page ?? c.source.page }
}

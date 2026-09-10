import type { Concepto } from '../schema/concept'

/** La página física verificada se conserva aparte del ancla de la extracción. */
export function referenciaPagina(source: Concepto['source']): string {
  if (!source.pdf_page) return `Página de la fuente: ${source.page}`
  const rango = source.pdf_page_fin && source.pdf_page_fin > source.pdf_page
    ? `${source.pdf_page}–${source.pdf_page_fin}` : String(source.pdf_page)
  return `Página PDF: ${rango}`
}

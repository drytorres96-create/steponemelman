import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { ConceptoZ } from '../schema/concept'
import { fragmentoDocente, fundamentoEditorial, materialAptoParaIA, referenciaDocente } from '../lib/fuente-docente'
import { PanelFuente } from '../components/comunes'
import { materialErrorConcepto } from '../server/correccion-error'
import { AyudaIA } from '../components/AyudaIA'

vi.mock('../lib/explicacion-ia', () => ({ explicarRespuesta: vi.fn(async () => ({ estado: 'ok',
  data: { diferencia: 'Synthetic difference.', explicacion: 'Synthetic explanation.', recordar: 'Recall alpha.',
    evidencia: 'Alpha is the corrected synthetic mechanism.' } })) }))

const original = ConceptoZ.parse({ concept_id: 'QA-CORRECCION',
  source: { doc: 'QA', doc_title: 'Fuente sintética', item_id: 'QA:1', page: 4, pdf_page: 5, fragment: 'The original synthetic assertion was incorrect.' },
  objetivo: 'Identify the corrected synthetic mechanism.', afirmacion: 'Alpha is the corrected synthetic mechanism.',
  respuesta_canonica: 'Alpha', explicacion: 'Alpha is the corrected synthetic mechanism.',
  clasificacion: { disciplina_primaria: 'Fisiología', sistema_primario: 'Multisistémico', tema: 'Synthetic QA', tipo_conocimiento: 'Mecanismo', dificultad: 1 },
  step: 'step1', interaccion: { recomendada: 'recuperacion_libre' }, evaluacion: { pregunta: 'Which synthetic mechanism is correct?' },
  pistas: ['One', 'Two', 'Three'], calidad: { estado: 'aprobado', confianza: 0.9, alertas: ['Internal audit alert'] },
  revision_editorial: { nota: 'Internal audit resolution', fuentes: [{ titulo: 'Synthetic authoritative reference', url: 'https://example.org/reference' }],
    fundamento: { texto: 'Alpha is the corrected synthetic mechanism. Beta is unrelated.', revision: '1.0.7' } },
})

describe('fuente docente corregida', () => {
  it('conserva la procedencia y usa únicamente la corrección como evidencia para IA', () => {
    const before = JSON.stringify(original)
    expect(materialAptoParaIA(original)).toBe(true)
    const material = materialErrorConcepto(original, 'Beta', 'incorrecta')
    expect(material.sourceFragment).toBe(original.revision_editorial!.fundamento!.texto)
    expect(material.reference).not.toContain(original.source.fragment)
    expect(material.source).toEqual({ title: 'Revisión docente · Fuente sintética', page: 4 })
    expect(JSON.stringify(original)).toBe(before)
  })
  it('bloquea revisiones antiguas sin evidencia corregida y conserva conceptos sin revisión', () => {
    const { fundamento: _, ...legacy } = original.revision_editorial!
    const antiguo = { ...original, revision_editorial: legacy }
    expect(fundamentoEditorial(antiguo)).toBeNull()
    expect(fragmentoDocente(antiguo)).toBe('')
    expect(materialAptoParaIA(antiguo)).toBe(false)
    const sinRevision = { ...original, revision_editorial: undefined }
    expect(fragmentoDocente(sinRevision)).toBe(original.source.fragment)
    expect(materialAptoParaIA(sinRevision)).toBe(true)
    expect(referenciaDocente(sinRevision)).toEqual({ title: 'Fuente sintética', page: 5 })
  })
  it('rechaza cuarentena, Step2, baja confianza, fuentes ausentes o sin HTTPS', () => {
    for (const c of [
      { ...original, calidad: { ...original.calidad, estado: 'cuarentena' as const } },
      { ...original, calidad: { ...original.calidad, confianza: 0.6 } },
      { ...original, step: 'step2' as const },
      { ...original, revision_editorial: { ...original.revision_editorial!, fuentes: [] } },
      { ...original, revision_editorial: { ...original.revision_editorial!, fuentes: [{ titulo: 'QA', url: 'http://example.org' }] } },
    ]) expect(materialAptoParaIA(c)).toBe(false)
  })
  it('muestra el fundamento y referencias sin porcentajes ni notas administrativas', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const host = document.createElement('div'), root = createRoot(host)
    try {
      await act(async () => root.render(<PanelFuente c={original} />))
      expect(host.textContent).toContain(original.revision_editorial!.fundamento!.texto)
      expect(host.textContent).toContain('Referencias')
      expect(host.querySelector('a')?.href).toBe('https://example.org/reference')
      for (const oculto of [original.source.fragment, 'Internal audit', 'Confianza', '90 %', 'verbatim']) expect(host.textContent).not.toContain(oculto)
    } finally { await act(async () => root.unmount()) }
  })
  it('atribuye una cita de ayuda al fundamento y referencias, sin convertir el ancla original en página PDF', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const host = document.createElement('div'), root = createRoot(host)
    try {
      await act(async () => root.render(<AyudaIA concepto={original} respuesta="Beta" preguntaId="qa-revised"
        indice={0} ruta="repaso" reintento={false} />))
      await act(async () => (host.querySelector('button') as HTMLButtonElement).click())
      expect(host.querySelector('blockquote')?.textContent).toContain('Alpha is the corrected synthetic mechanism.')
      expect(host.textContent).toContain('Revisión docente · Fuente sintética')
      expect(host.textContent).not.toContain('Página PDF')
      expect(host.querySelector('a')?.href).toBe('https://example.org/reference')
    } finally { await act(async () => root.unmount()) }
  })
})

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { NbmeContent } from './NbmeContent'
import { parseNbmeQuestion } from './api'

const question = {
  id: 'synthetic', revision: 'r1', form: '27', section: 1, item: 1, page: 1,
  systems: [], disciplines: [], topic: '', objective: null, status: 'ready', reasons: [],
  figureRequired: false, conceptLinks: [], stem: 'Synthetic source.',
  options: [{ id: 'A', text: 'One' }, { id: 'B', text: 'Two' }], answer: 'A', explanation: null,
  figures: [], provenance: { sourceFile: 'synthetic', sourceRecordId: '1', notes: [] },
}
const table = { type: 'table' as const, caption: 'Synthetic values', headers: ['Label', 'Value'], rows: [['Example', '1.25 ± 0.1']] }

describe('presentación del texto fuente', () => {
  it('separa párrafos y conserva signos, cifras y saltos internos sin inferir tablas', () => {
    const html = renderToStaticMarkup(<NbmeContent text={'First <example>.\n\nSecond: 1.25 ± 0.1\nA\tB'} />)
    expect(html.match(/<p>/g)).toHaveLength(2)
    expect(html).toContain('First &lt;example&gt;.')
    expect(html).toContain('Second: 1.25 ± 0.1\nA\tB')
    expect(html).not.toContain('<table')
  })
  it('presenta todas las celdas explícitas con encabezados y desplazamiento accesible', () => {
    const html = renderToStaticMarkup(<NbmeContent text="Original" blocks={[table]} />)
    expect(html).toContain('tabindex="0"')
    expect(html.match(/scope="col"/g)).toHaveLength(2)
    expect(html).toContain('<caption>Synthetic values</caption>')
    expect(html).toContain('<td>1.25 ± 0.1</td>')
  })
  it('conserva los bloques validados y rechaza tablas con celdas faltantes', () => {
    expect(parseNbmeQuestion({ ...question, display: { stem: [table] } })?.display?.stem).toEqual([table])
    expect(parseNbmeQuestion({ ...question, display: { stem: [{ ...table, rows: [['Missing value']] }] } })).toBeNull()
    expect(parseNbmeQuestion({ ...question, display: { stem: [] } })).toBeNull()
    expect(parseNbmeQuestion(question)?.answer).toBe('A')
  })
})

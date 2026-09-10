import { DISCIPLINAS, SISTEMAS, type Concepto, type Indice } from '../schema/concept'
import { conceptosUnicos } from '../lib/plan-estudio'

export function Cobertura({ conceptos, indice }: { conceptos: Concepto[]; indice: Indice }) {
  const base = conceptosUnicos(conceptos)
  const sistemas = SISTEMAS.map(nombre => ({ nombre, n: base.filter(c =>
    c.clasificacion.sistema_primario === nombre || c.clasificacion.sistemas_secundarios.includes(nombre)).length }))
  const disciplinas = DISCIPLINAS.map(nombre => ({ nombre, n: base.filter(c =>
    c.clasificacion.disciplina_primaria === nombre || c.clasificacion.disciplinas_secundarias.includes(nombre)).length }))

  const tabla = (titulo: string, filas: { nombre: string; n: number }[]) => (
    <div style={{ minWidth: 0, overflowX: 'auto' }}>
      <table className="tabla">
        <caption style={{ textAlign: 'left', fontWeight: 650, padding: '8px 10px' }}>{titulo}</caption>
        <thead><tr><th scope="col">Área</th><th scope="col">Conceptos</th><th scope="col">Estado</th></tr></thead>
        <tbody>{filas.map(f => <tr key={f.nombre}>
          <th scope="row" style={{ position: 'static', textTransform: 'none', letterSpacing: 'normal' }}>{f.nombre}</th>
          <td>{f.n.toLocaleString('es')}</td>
          <td>{f.n ? 'Material disponible; cobertura por revisar' : 'Sin conceptos publicados'}</td>
        </tr>)}</tbody>
      </table>
    </div>
  )

  return <section aria-label="Contenido disponible y cobertura pendiente" className="pila" style={{ gap: 14 }}>
    <div>
      <h2>Contenido disponible</h2>
      <p className="sutil">{base.length.toLocaleString('es')} conceptos publicados y {indice.cuarentena.toLocaleString('es')} apartados para revisión.
        La presencia de material en un área todavía no acredita que esté completo el temario de Step 1.</p>
      <p className="mini">Se cuentan las áreas primarias y secundarias: un concepto puede aparecer en varias filas.
        Esta tabla describe el material de la plataforma, no un porcentaje de cobertura del examen.</p>
    </div>
    <div className="rejilla r2">{tabla('Por sistema', sistemas)}{tabla('Por disciplina', disciplinas)}</div>
    <p className="mini">La correspondencia completa con los objetivos del{' '}
      <a href="https://www.usmle.org/exam-resources/step-1-materials/step-1-content-outline-and-specifications" target="_blank" rel="noreferrer">temario oficial de Step 1</a>{' '}
      sigue pendiente. Las etiquetas Step 1 y compartido con Step 2 son clasificaciones del contenido; no sustituyen la revisión médica.</p>
  </section>
}

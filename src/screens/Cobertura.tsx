import { DISCIPLINAS, SISTEMAS, type Concepto, type Indice } from '../schema/concept'
import { conceptosUnicos } from '../lib/plan-estudio'

export function Cobertura({ conceptos }: { conceptos: Concepto[]; indice: Indice }) {
  const base = conceptosUnicos(conceptos)
  const sistemas = SISTEMAS.map(nombre => ({ nombre, n: base.filter(c =>
    c.clasificacion.sistema_primario === nombre || c.clasificacion.sistemas_secundarios.includes(nombre)).length }))
  const disciplinas = DISCIPLINAS.map(nombre => ({ nombre, n: base.filter(c =>
    c.clasificacion.disciplina_primaria === nombre || c.clasificacion.disciplinas_secundarias.includes(nombre)).length }))

  const tabla = (titulo: string, filas: { nombre: string; n: number }[]) => (
    <div className="scroll-x" tabIndex={0} role="region" aria-label={titulo}>
      <table className="tabla">
        <caption style={{ textAlign: 'left', fontWeight: 650, padding: '8px 10px' }}>{titulo}</caption>
        <thead><tr><th scope="col">Área</th><th scope="col">Conceptos</th></tr></thead>
        <tbody>{filas.map(f => <tr key={f.nombre}>
          <th scope="row" style={{ position: 'static', textTransform: 'none', letterSpacing: 'normal' }}>{f.nombre}</th>
          <td>{f.n.toLocaleString('es')}</td>
        </tr>)}</tbody>
      </table>
    </div>
  )

  return <section aria-label="Contenido disponible por área" className="pila" style={{ gap: 14 }}>
    <div>
      <h2>Contenido disponible</h2>
      <p className="sutil">{base.length.toLocaleString('es')} {base.length === 1 ? 'concepto publicado' : 'conceptos publicados'}.</p>
    </div>
    <div className="rejilla r2">{tabla('Por sistema', sistemas)}{tabla('Por disciplina', disciplinas)}</div>
  </section>
}

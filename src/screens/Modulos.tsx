import { useMemo, useState } from 'react'
import { useApp } from '../store/estado'
import { Barra, Vacio } from '../components/comunes'
import type { Modulo } from '../schema/concept'
import { estaVencido } from '../srs/fsrs'
import { RUTAS, type RutaId } from '../lib/rutas'
import { dominioVigente } from '../srs/mastery'

export function Modulos({ onAbrir }: { onAbrir: (moduloId: string, ruta: RutaId, limite: number, sesion?: string) => void }) {
  const { indice, estado } = useApp()
  const [disciplina, setDisciplina] = useState('')
  const [sistema, setSistema] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [abierto, setAbierto] = useState<string | null>(null)

  const modulos = indice?.modulos ?? []
  const disciplinas = useMemo(() => [...new Set(modulos.flatMap(m => m.disciplinas))].sort(), [modulos])
  const sistemas = useMemo(() => [...new Set(modulos.flatMap(m => m.sistemas))].sort(), [modulos])

  const stats = (m: Modulo) => {
    const ids = m.sesiones.flatMap(s => s.conceptos)
    let nuevos = 0, aprendiendo = 0, dominados = 0, vencidos = 0
    for (const id of ids) {
      const p = estado.progreso[id]
      if (!p || !p.intentos.length) { nuevos++; continue }
      if (dominioVigente(p, estado.criterios)) dominados++; else aprendiendo++
      if (estaVencido(p)) vencidos++
    }
    return { total: ids.length, nuevos, aprendiendo, dominados, vencidos }
  }

  const visibles = modulos.filter(m => {
    if (disciplina && !m.disciplinas.includes(disciplina)) return false
    if (sistema && !m.sistemas.includes(sistema)) return false
    if (filtroEstado) {
      const s = stats(m)
      if (filtroEstado === 'sin_empezar' && s.nuevos !== s.total) return false
      if (filtroEstado === 'en_curso' && (s.nuevos === s.total || s.dominados === s.total)) return false
      if (filtroEstado === 'vencido' && s.vencidos === 0) return false
      if (filtroEstado === 'dominado' && s.dominados !== s.total) return false
    }
    return true
  })

  return (
    <div className="pila">
      <div>
        <h1>Explorador de módulos</h1>
        <p className="sutil">Explora el material disponible por disciplina y sistema. Puedes comenzar con una sesión pequeña y ampliar después.</p>
      </div>

      <div className="tarjeta fila" style={{ gap: 10 }}>
        <select value={disciplina} onChange={e => setDisciplina(e.target.value)} aria-label="Filtrar por disciplina" style={{ width: 'auto', minWidth: 190 }}>
          <option value="">Todas las disciplinas</option>
          {disciplinas.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={sistema} onChange={e => setSistema(e.target.value)} aria-label="Filtrar por sistema" style={{ width: 'auto', minWidth: 190 }}>
          <option value="">Todos los sistemas</option>
          {sistemas.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} aria-label="Filtrar por estado" style={{ width: 'auto', minWidth: 170 }}>
          <option value="">Cualquier estado</option>
          <option value="sin_empezar">Sin empezar</option>
          <option value="en_curso">En curso</option>
          <option value="vencido">Con repaso vencido</option>
          <option value="dominado">Dominado</option>
        </select>
        <span className="mini" style={{ marginLeft: 'auto' }}>{visibles.length} de {modulos.length} módulos</span>
      </div>

      {visibles.length === 0 && <Vacio titulo="Ningún módulo coincide" texto="Prueba con otros filtros." />}

      <div className="rejilla r2">
        {visibles.map(m => {
          const s = stats(m)
          const abiertoEste = abierto === m.module_id
          return (
            <div className="tarjeta" key={m.module_id}>
              <div className="fila" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <h3>{m.nombre}</h3>
                  <p className="mini" style={{ margin: '2px 0 8px' }}>{m.proposito}</p>
                </div>
                {s.vencidos > 0 && <span className="etq ambar">{s.vencidos} vencidos</span>}
              </div>

              <Barra valor={s.dominados} total={s.total} oro etiqueta={`Dominio vigente de ${m.nombre}`} />
              <div className="fila" style={{ gap: 12, marginTop: 8 }}>
                <span className="mini">{s.total} conceptos</span>
                <span className="mini">·</span>
                <span className="mini">{s.nuevos} nuevos</span>
                <span className="mini">·</span>
                <span className="mini">{s.aprendiendo} en curso</span>
                <span className="mini">·</span>
                <span className="mini" style={{ color: 'var(--oro)' }}>{s.dominados} dominados</span>
              </div>

              <div className="fila" style={{ gap: 6, marginTop: 10 }}>
                {m.disciplinas.slice(0, 3).map(d => (
                  <span key={d} className={`etq d-${d.replace(/ /g, '\\ ')}`}><i className="punto-d" />{d}</span>
                ))}
                {m.prerrequisitos.length > 0 && <span className="etq">Base sugerida: {m.prerrequisitos.map(id => modulos.find(m => m.module_id === id)?.nombre || id).join(', ')}</span>}
              </div>

              <hr className="sep" />
              <div className="fila">
                <button className="btn principal pequeno" onClick={() => onAbrir(m.module_id, 'guiada', 10)}>Hasta 10 conceptos</button>
                <button className="btn pequeno" onClick={() => onAbrir(m.module_id, 'guiada', 20)}>Hasta 20 conceptos</button>
                <button className="btn pequeno fantasma" aria-expanded={abiertoEste} onClick={() => setAbierto(abiertoEste ? null : m.module_id)}>
                  {abiertoEste ? 'Ocultar sesiones' : `Ver ${m.sesiones.length} sesiones`}
                </button>
              </div>

              {abiertoEste && (
                <div className="pila" style={{ gap: 6, marginTop: 12 }}>
                  {m.sesiones.map(ses => {
                    const hechos = ses.conceptos.filter(id => estado.progreso[id]?.intentos.length).length
                    return (
                      <button key={ses.session_id} className="tarjeta pulsable" style={{ padding: 11 }}
                        onClick={() => onAbrir(m.module_id, 'guiada', 999, ses.session_id)}>
                        <div className="fila" style={{ justifyContent: 'space-between' }}>
                          <b style={{ fontSize: '.92rem' }}>{ses.titulo}</b>
                          <span className="mini">{hechos}/{ses.conceptos.length}</span>
                        </div>
                        <div className="mini" style={{ marginTop: 2 }}>{ses.objetivo || 'Objetivos variados'}</div>
                      </button>
                    )
                  })}
                  <div className="mini">Cobertura documental: {m.cobertura_documental.join(', ')}</div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="tarjeta">
        <h2 style={{ marginBottom: 4 }}>Rutas de estudio</h2>
        <p className="sutil">Elige qué habilidad practicar. La selección considera tu historial y el material disponible.</p>
        <div className="rejilla r3" style={{ marginTop: 12 }}>
          {RUTAS.filter(r => r.id !== 'guiada').map(r => (
            <button key={r.id} className="tarjeta pulsable" style={{ padding: 13 }}
              onClick={() => onAbrir('', r.id, r.id === 'examen' ? 20 : 14)}>
              <b style={{ fontSize: '.93rem' }}>{r.nombre}</b>
              <div className="mini" style={{ marginTop: 3 }}>{r.descripcion}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

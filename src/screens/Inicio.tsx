import { useMemo } from 'react'
import { useApp } from '../store/estado'
import { Anillo, Barra, Vacio } from '../components/comunes'
import type { Modulo } from '../schema/concept'
import type { ProgresoConcepto } from '../srs/tipos'
import { estaVencido } from '../srs/fsrs'
import { NOMBRE_ETAPA, etapa, type Etapa } from '../srs/mastery'

const ETAPAS: Etapa[] = ['exposicion','comprension','recuperacion','consolidacion','dominio']
const COLOR_ETAPA: Record<Etapa, string> = {
  exposicion: '#6f7c99', comprension: '#48c4d8', recuperacion: '#8b7cf6',
  consolidacion: '#e05fa8', dominio: '#e3b23c',
}

export function Inicio({ onIr, onContinuar, onEmpezar }: {
  onIr: (v: string) => void
  onContinuar: () => void
  onEmpezar: (moduloId: string) => void
}) {
  const { indice, estado } = useApp()
  const modulos = indice?.modulos ?? []
  const total = indice?.n_conceptos ?? 0
  const progresos = useMemo(() => Object.values(estado.progreso) as ProgresoConcepto[], [estado.progreso])

  const vistos = progresos.filter(p => p.intentos.length > 0)
  const dominados = progresos.filter(p => p.dominado_en != null)
  const vencidos = progresos.filter(p => estaVencido(p))
  const recuperados = progresos.filter(p => p.aciertos > 0)
  const consolidacion = progresos.filter(p => p.aciertos >= 2 && p.dominado_en == null)

  const porEtapa = ETAPAS.map(e => ({ e, n: vistos.filter(p => etapa(p) === e).length }))
  const debiles = progresos.filter(p => p.fallos > 0).sort((a, b) => (b.fallos - b.aciertos) - (a.fallos - a.aciertos)).slice(0, 5)
  const recientes = dominados.sort((a, b) => (b.dominado_en! - a.dominado_en!)).slice(0, 5)

  const siguienteModulo: Modulo | undefined =
    modulos.find(m => {
      const ids = m.sesiones.flatMap(s => s.conceptos)
      return ids.some(id => !estado.progreso[id]?.intentos.length)
    }) ?? modulos[0]

  const metaN = Math.min(20, Math.max(5, Math.round((total - vistos.length) * 0.01) || 10))
  const horas = estado.msEstudio / 3_600_000

  return (
    <div className="pila" style={{ gap: 20 }}>
      <div className="fila" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1>Tu mapa de dominio</h1>
          <p className="sutil" style={{ margin: 0 }}>
            {total.toLocaleString('es')} conceptos auditados y trazables hasta la página de su PDF.
          </p>
        </div>
        {estado.reanudable && (
          <button className="btn principal" onClick={onContinuar}>Continuar donde lo dejaste</button>
        )}
      </div>

      <div className="rejilla" style={{ gridTemplateColumns: 'minmax(260px, 340px) 1fr', gap: 14 }}>
        <div className="tarjeta fila" style={{ gap: 18, justifyContent: 'center' }}>
          <Anillo valor={dominados.length} total={total || 1} etiqueta="dominados" oro tam={124} />
          <div className="pila" style={{ gap: 10 }}>
            <div><div className="cifra">{vistos.length}</div><div className="rotulo">vistos</div></div>
            <div><div className="cifra" style={{ color: 'var(--verde)' }}>{recuperados.length}</div><div className="rotulo">recuperados</div></div>
            <div><div className="cifra" style={{ color: vencidos.length ? 'var(--ambar)' : undefined }}>{vencidos.length}</div><div className="rotulo">vencidos hoy</div></div>
          </div>
        </div>

        <div className="tarjeta">
          <div className="fila" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
            <h2>Del primer contacto al dominio</h2>
            <span className="mini">{horas < 1 ? `${Math.round(estado.msEstudio / 60000)} min` : `${horas.toFixed(1)} h`} de estudio</span>
          </div>
          <div className="barras">
            {porEtapa.map(({ e, n }) => (
              <div className="b" key={e}>
                <span style={{ color: COLOR_ETAPA[e] }}>{NOMBRE_ETAPA[e]}</span>
                <div className="pista-b"><span style={{ width: `${vistos.length ? (n / vistos.length) * 100 : 0}%`, background: COLOR_ETAPA[e] }} /></div>
                <b>{n}</b>
              </div>
            ))}
          </div>
          <hr className="sep" />
          <div className="fila" style={{ justifyContent: 'space-between' }}>
            <span className="sutil">
              Próxima meta alcanzable: <b style={{ color: 'var(--texto)' }}>{metaN} conceptos nuevos</b> — unos {Math.round(metaN * 0.9)} minutos.
            </span>
            <button className="btn principal" onClick={() => siguienteModulo && onEmpezar(siguienteModulo.module_id)}>
              Empezar sesión corta
            </button>
          </div>
        </div>
      </div>

      <div className="rejilla r3">
        <button className="tarjeta pulsable" onClick={() => onIr('repaso')}>
          <h3>Repaso de hoy</h3>
          <div className="cifra" style={{ color: vencidos.length ? 'var(--ambar)' : 'var(--texto-3)' }}>{vencidos.length}</div>
          <p className="mini" style={{ margin: 0 }}>{vencidos.length ? 'conceptos vencidos, ordenados por olvido' : 'nada vencido: sigue con material nuevo'}</p>
        </button>
        <button className="tarjeta pulsable" onClick={() => onIr('modulos')}>
          <h3>Siguiente sesión</h3>
          <div style={{ fontWeight: 620, margin: '6px 0' }}>{siguienteModulo?.nombre ?? '—'}</div>
          <Barra valor={siguienteModulo ? siguienteModulo.sesiones.flatMap(s => s.conceptos).filter(id => estado.progreso[id]?.intentos.length).length : 0}
                 total={siguienteModulo?.n_conceptos ?? 1} />
          <p className="mini" style={{ marginTop: 6 }}>{siguienteModulo?.proposito}</p>
        </button>
        <button className="tarjeta pulsable" onClick={() => onIr('progreso')}>
          <h3>En consolidación</h3>
          <div className="cifra" style={{ color: 'var(--magenta)' }}>{consolidacion.length}</div>
          <p className="mini" style={{ margin: 0 }}>ya los recuperas, aún no cumplen los criterios de dominio</p>
        </button>
      </div>

      <div className="rejilla r2">
        <div className="tarjeta">
          <h2 style={{ marginBottom: 10 }}>Dominados recientemente</h2>
          {recientes.length === 0
            ? <Vacio titulo="Todavía ninguno" texto="Un concepto se marca como dominado tras varias recuperaciones correctas en sesiones distintas." />
            : recientes.map(p => (
              <div key={p.concept_id} className="fila" style={{ justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--linea-suave)' }}>
                <span className="sutil" style={{ fontFamily: 'var(--mono)', fontSize: '.78rem' }}>{p.concept_id}</span>
                <span className="etq oro">Dominado</span>
              </div>
            ))}
        </div>
        <div className="tarjeta">
          <h2 style={{ marginBottom: 10 }}>Áreas débiles</h2>
          {debiles.length === 0
            ? <Vacio titulo="Sin fallos registrados" texto="Cuando falles algo aparecerá aquí, con el tipo de error que cometiste." />
            : debiles.map(p => (
              <div key={p.concept_id} className="fila" style={{ justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--linea-suave)' }}>
                <span className="sutil" style={{ fontFamily: 'var(--mono)', fontSize: '.78rem' }}>{p.concept_id}</span>
                <span className="etq rojo">{p.fallos} {p.fallos === 1 ? 'fallo' : 'fallos'}</span>
              </div>
            ))}
          {debiles.length > 0 && <button className="btn pequeno fantasma" style={{ marginTop: 10 }} onClick={() => onIr('repaso')}>Practicar los débiles</button>}
        </div>
      </div>
    </div>
  )
}

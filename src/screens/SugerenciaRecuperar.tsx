import { useEffect, useMemo, useRef, useState } from 'react'
import { cargarConceptos } from '../data/corpus'
import type { Concepto, Modulo } from '../schema/concept'
import type { NbmeQuestionMeta } from '../nbme/types'
import type { MaterialNuevo } from '../lib/nuevo-hoy'
import { NOMBRE_SENAL, PESO_SENAL, type FichaInventario, type Senal } from '../lib/inventario'
import { decidirSugerencia, guardarSugerencia, leerSugerencia, type ItemSugerido, type SugerenciaDelDia } from '../lib/sugerencia-diaria'
import { etiquetaCorta, pedirHilo } from '../lib/sesion-claude'

/**
 * «Para reforzar hoy»: lo más frágil de lo que ya has visto, una sola vez al día y con techo.
 * Es opcional y no cuenta como deuda: si hoy no la usas, mañana se recalcula desde tu historial.
 * El inventario y la selección son de la plataforma; Claude sólo escribe, si puede, una frase.
 */

const principal = (senales: Senal[]): Senal => [...senales].sort((a, b) => PESO_SENAL[b] - PESO_SENAL[a])[0]

interface Fila { item: ItemSugerido; titulo: string; detalle: string }

function filaDeConcepto(item: ItemSugerido, c: Concepto | undefined): Fila {
  if (!c) return { item, titulo: 'Concepto', detalle: item.id }
  return { item, titulo: c.clasificacion.tema || c.objetivo, detalle: c.objetivo }
}

export function SugerenciaRecuperar({ usuario, ahora, candidatas, listo, modulos, listas, onRecuperar }: {
  usuario: string
  ahora: number
  /** Todo lo frágil que hoy podría sugerirse, ya sin lo que está en las cajas ni lo tocado hoy. */
  candidatas: FichaInventario[]
  /** El progreso de la cuenta y el banco ya llegaron: antes no se congela la lista del día. */
  listo: boolean
  modulos: Modulo[]
  listas: Map<string, NbmeQuestionMeta>
  onRecuperar: (material: MaterialNuevo) => void
}) {
  const [guardada, setGuardada] = useState<SugerenciaDelDia | null>(() => leerSugerencia(usuario))
  const decision = useMemo(() => decidirSugerencia({ ahora, guardada, candidatas, listo }), [ahora, guardada, candidatas, listo])
  const guardadaPor = useRef<string | null>(null)

  useEffect(() => {
    const nueva = decision.guardar
    if (!nueva || guardadaPor.current === nueva.dia) return
    guardadaPor.current = nueva.dia
    guardarSugerencia(usuario, nueva)
    setGuardada(nueva)
  }, [decision.guardar, usuario])

  const mostrar = decision.mostrar
  const [conceptos, setConceptos] = useState<Map<string, Concepto> | null>(null)
  const idsConcepto = useMemo(() => (mostrar?.items ?? []).filter(i => i.tipo === 'concepto').map(i => i.id), [mostrar])
  const clave = idsConcepto.join('|')
  useEffect(() => {
    if (!mostrar) return
    if (!idsConcepto.length) { setConceptos(new Map()); return }
    let vivo = true
    cargarConceptos(idsConcepto, modulos).then(m => { if (vivo) setConceptos(m) }).catch(() => { if (vivo) setConceptos(new Map()) })
    return () => { vivo = false }
    // La lista de ids es el contenido: la clave evita recargar si sólo cambia la identidad del arreglo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, modulos, !!mostrar])

  const filas: Fila[] = useMemo(() => (mostrar?.items ?? []).map(item => item.tipo === 'concepto'
    ? filaDeConcepto(item, conceptos?.get(item.id))
    : { item, titulo: listas.get(item.id)?.topic || 'Pregunta NBME', detalle: (listas.get(item.id)?.systems ?? []).join(' · ') }), [mostrar, conceptos, listas])

  // Una frase de Claude con el hilo común, una vez al día. Si no llega, la tarjeta ya está completa.
  const pidioHilo = useRef<string | null>(null)
  useEffect(() => {
    if (!mostrar || !conceptos || mostrar.hiloIntentado || pidioHilo.current === mostrar.dia) return
    pidioHilo.current = mostrar.dia
    const control = new AbortController()
    const dia = mostrar.dia
    let terminado = false
    void pedirHilo(filas.map(f => ({ tipo: f.item.tipo, id: f.item.id,
      etiqueta: etiquetaCorta(f.item.tipo === 'concepto' ? `${f.titulo}: ${f.detalle}` : f.titulo), senales: f.item.senales })), control.signal)
      .then(r => {
        // Una espera cancelada (la persona se fue de Hoy) no cuenta como intento: mañana, o al volver, se pide.
        if (control.signal.aborted) return
        terminado = true
        const base = leerSugerencia(usuario)
        if (!base || base.dia !== dia) return
        const siguiente: SugerenciaDelDia = { ...base, hiloIntentado: true, ...(r.estado === 'ok' ? { hilo: r.hilo } : {}) }
        guardarSugerencia(usuario, siguiente)
        setGuardada(siguiente)
      })
    return () => { control.abort(); if (!terminado) pidioHilo.current = null }
    // Se pide una vez por día y el resultado se guarda; filas ya está resuelto cuando `conceptos` existe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostrar?.dia, !!conceptos, mostrar?.hiloIntentado])

  if (!mostrar || !conceptos) return null

  const cambiarEstado = (estado: 'usada' | 'descartada') => {
    const base = leerSugerencia(usuario) ?? guardada
    if (!base) return
    const siguiente = { ...base, estado }
    guardarSugerencia(usuario, siguiente)
    setGuardada(siguiente)
  }
  const repasar = () => {
    const revisiones = new Map(candidatas.filter(c => c.tipo === 'pregunta' && c.revision).map(c => [c.id, c.revision!]))
    const ids = mostrar.items.filter(i => i.tipo === 'concepto').map(i => i.id)
    const preguntas = mostrar.items.filter(i => i.tipo === 'pregunta' && revisiones.has(i.id)).map(i => ({ id: i.id, revision: revisiones.get(i.id)! }))
    if (!ids.length && !preguntas.length) return
    cambiarEstado('usada')
    onRecuperar({ conceptIds: ids, preguntas, titulo: 'Para reforzar · hoy', nbmeSessionId: null,
      subtitulo: 'Lo que aún está frágil: la plataforma lo eligió de tu historial.',
      cada: Math.max(1, Math.round(ids.length / Math.max(1, preguntas.length))) })
  }

  return <section className="tarjeta sugerencia-recuperar" aria-labelledby="sugerencia-recuperar-titulo">
    <p className="rotulo">Opcional · una vez al día</p>
    <h2 id="sugerencia-recuperar-titulo">Para reforzar hoy</h2>
    {mostrar.hilo && <p className="sugerencia-hilo">{mostrar.hilo}</p>}
    <ul className="sugerencia-lista">
      {filas.map(f => <li key={`${f.item.tipo}:${f.item.id}`}>
        <span className="sugerencia-texto">
          <strong>{f.titulo}</strong>
          {f.detalle && f.detalle !== f.titulo && <span className="mini">{f.detalle.length > 110 ? `${f.detalle.slice(0, 109)}…` : f.detalle}</span>}
        </span>
        <span className="sugerencia-senal">{NOMBRE_SENAL[principal(f.item.senales)]}</span>
      </li>)}
    </ul>
    <div className="fila">
      <button type="button" className="btn principal" onClick={repasar}>
        {filas.length === 1 ? 'Repasar este' : `Repasar estos ${filas.length}`}</button>
      <button type="button" className="btn fantasma" onClick={() => cambiarEstado('descartada')}>Hoy no</button>
    </div>
    <p className="mini">Sale de tus fallos y aciertos con ayuda. Lo que no uses hoy no se acumula.</p>
  </section>
}

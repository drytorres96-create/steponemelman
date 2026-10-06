import { useEffect, useState } from 'react'
import { useApp } from '../store/estado'
import { useNbme } from '../nbme/NbmeProvider'
import { deriveNbmeSession } from '../nbme/model'
import { cargarHistorialSesiones } from '../semana/api'
import type { SesionSemanal } from '../semana/tipos'
import { cajasDelDia, TITULO_NBME_CAJAS } from '../lib/cajas'
import { estadoDelDia, limitesSemana, referenciaDelDia, temaDeLaSemana } from '../lib/dia'
import { recuperacionMeta } from '../lib/recuperacion-meta'
import { prepararNuevoDeHoy, tituloDeHoy, type MaterialNuevo } from '../lib/nuevo-hoy'
import type { ItemCaja } from '../lib/cajas'
import { primerasRespuestasNbme, resumenMeta } from '../lib/meta'
import { resumenProgresoAprendizaje } from '../lib/progreso-aprendizaje'
export interface AccionesRecuperacion { onNuevo?: (material: MaterialNuevo) => void; onCajas?: (items: ItemCaja[], titulo: string) => void; onRetomar?: () => void }

/** Sólo se monta al abrir la opción: usa metadatos y las mismas listas que Hoy. */
export function RecuperarMeta({ onNuevo, onCajas, onRetomar }: AccionesRecuperacion) {
  const { indice, estado, sincronizacion } = useApp()
  const nbme = useNbme()
  const [sesiones, setSesiones] = useState<SesionSemanal[] | null>(null)
  const [fallo, setFallo] = useState(false)
  const [semanaCargada, setSemanaCargada] = useState('')
  const [, tic] = useState(0)
  useEffect(() => { const timer = setInterval(() => tic(n => n + 1), 60_000); return () => clearInterval(timer) }, [])
  const semanaActual = limitesSemana(Date.now()).inicio
  useEffect(() => {
    let vivo = true
    setSesiones(null); setFallo(false)
    void cargarHistorialSesiones().then(s => { if (vivo) { setSesiones(s); setSemanaCargada(semanaActual) } })
      .catch(() => { if (vivo) setFallo(true) })
    return () => { vivo = false }
  }, [semanaActual])
  const calcular = () => {
    const ahora = Date.now(), limites = limitesSemana(ahora)
    const publicados = new Set(indice?.modulos.flatMap(m => m.sesiones.flatMap(s => s.conceptos)) ?? [])
    const listas = new Map((nbme.catalog?.questions ?? []).filter(q => q.status === 'ready').map(q => [q.id, q]))
    const tema = temaDeLaSemana(sesiones ?? [], limites.inicio, limites.fin)
    const intentosPreguntas = Object.values(nbme.state.attempts)
    const cajas = cajasDelDia({ progreso: estado.progreso, criterios: estado.criterios, intentosPreguntas,
      conceptoDisponible: id => publicados.has(id), preguntaDisponible: id => listas.has(id),
      referencia: referenciaDelDia(estado.progreso, intentosPreguntas, ahora), ahora })
    const entrada = { progreso: estado.progreso, intentosPreguntas, cajas, ahora,
      conceptosSemana: tema.conceptIds.filter(id => publicados.has(id)), preguntasSemana: tema.preguntaIds.filter(id => listas.has(id)) }
    const pendienteNbme = Object.values(nbme.state.sessions).some(s => s.title !== TITULO_NBME_CAJAS && deriveNbmeSession(nbme.state, s.id)?.phase !== 'complete')
    const esperandoCuenta = !sincronizacion?.ultima && sincronizacion?.estado !== 'sincronizado'
    const esperandoBanco = !nbme.syncStatus?.lastSyncedAt && nbme.syncStatus?.state !== 'synced'
    const aprendizaje = resumenProgresoAprendizaje([...publicados], estado.progreso, estado.criterios, ahora)
    const preguntas = primerasRespuestasNbme(nbme.state, nbme.catalog)
    const meta = resumenMeta({ ahora, dominadosEn: aprendizaje.dominadosEn, conceptosPublicados: aprendizaje.total,
      primerasRespuestas: preguntas.marcas, preguntasPublicadas: nbme.catalog ? preguntas.publicadas : Number.POSITIVE_INFINITY })
    const sesionPendiente = !!estado.reanudable || pendienteNbme
    return { ahora, meta, plan: recuperacionMeta({ meta, dia: estadoDelDia(entrada), datosListos: !!indice && !!nbme.catalog && !esperandoCuenta && !esperandoBanco,
      semanaLista: !!sesiones && semanaCargada === limites.inicio, sesionPendiente, cajas: cajas.items,
      nuevo: prepararNuevoDeHoy(entrada, listas, nbme.state) }) }
  }
  const { plan, meta } = calcular()
  const empezar = () => {
    const { ahora, plan: vigente } = calcular()
    if (vigente.accion?.tipo === 'cajas') onCajas?.(vigente.accion.items, tituloDeHoy('Cajas', ahora))
    if (vigente.accion?.tipo === 'nuevo') onNuevo?.(vigente.accion.material)
  }
  const accionDisponible = plan.accion?.tipo === 'cajas' ? !!onCajas : plan.accion?.tipo === 'nuevo' && !!onNuevo
  return <div className="recuperacion-meta pila">
    <p><b>Dominio en esta meta:</b> {meta.conceptos.hechos} frente a {meta.conceptos.linea} previstos al empezar hoy.
      {plan.faltaDominio > 0 && <> La diferencia exacta es de {plan.faltaDominio} conceptos con dominio demostrado.</>}</p>
    <p><b>Preguntas nuevas en esta meta:</b> {meta.preguntas.hechos} frente a {meta.preguntas.linea} previstas.
      {plan.faltanPreguntas > 0 && <> La diferencia es de {plan.faltanPreguntas} primeras respuestas.</>}</p>
    <p className="mini">{plan.motivo}</p>
    {plan.accion?.tipo === 'cajas' && <p>Primer bloque: hasta {Math.min(5, plan.accion.items.length)} repasos. El recorrido conserva el resto de pendientes válidos de Hoy.</p>}
    {plan.accion?.tipo === 'nuevo' && <p>Disponible hoy: {plan.accion.material.conceptIds.length} conceptos nuevos y {plan.accion.material.preguntas.length} preguntas.</p>}
    {accionDisponible && <button className="btn" onClick={empezar}>Empezar recuperación de Hoy</button>}
    {plan.retomar && onRetomar && <button className="btn" onClick={onRetomar}>Retomar mi sesión pendiente</button>}
    {!sesiones && !fallo && <p className="mini" role="status">Comprobando el material de la semana…</p>}
    <p className="mini">Intentar un concepto cuenta como trabajo; dominarlo exige tus criterios. Este recorrido conserva los techos de Hoy y los intervalos de repaso. La diferencia se cierra con aprendizaje demostrado a lo largo de varios días.</p>
  </div>
}

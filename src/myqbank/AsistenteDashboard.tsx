import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useApp } from '../store/estado'
import { useAuth } from '../auth/AuthProvider'
import { useNbme } from '../nbme/NbmeProvider'
import { reconstruirProgreso } from '../store/model'
import { isHiddenNbmeAttempt } from '../nbme/model'
import { cajasDelDia } from '../lib/cajas'
import { referenciaDelDia } from '../lib/dia'
import { sugerirRecuperar, type FichaInventario } from '../lib/inventario'
import type { MaterialNuevo } from '../lib/nuevo-hoy'
import type { DatosSesion } from '../screens/chat-sesion-flujo'

export interface DatosAsistente extends DatosSesion {
  usuario: string
  ahora: number
  listo: boolean
  candidatas: FichaInventario[]
  onNuevo: (material: MaterialNuevo) => void
  ocupado: boolean
}

/** Optional study tools remain available regardless of the daily goal or saved blocks.
 * Only finished Test results inform suggestions; the saved histories are never changed here.
 * No weekly plan is needed to open the chat or build a session from the published material.
 */
export function AsistenteDashboard({ onNuevo, busy = false, children }: {
  onNuevo: DatosAsistente['onNuevo']; busy?: boolean; children: (datos: DatosAsistente) => ReactNode
}) {
  const { indice, estado, sincronizacion } = useApp()
  const { session } = useAuth()
  const banco = useNbme()
  const [, tick] = useState(0)
  useEffect(() => { const timer = setInterval(() => tick(n => n + 1), 60_000); return () => clearInterval(timer) }, [])
  const ahora = Date.now()
  const progreso = useMemo(() => Object.fromEntries(Object.entries(estado.progreso).map(([id, p]) => {
    const intentos = p.intentos.filter(i => !i.session_id || estado.myqbankBlocks?.[i.session_id]?.mode !== 'test'
      || estado.myqbankBlocks[i.session_id].completedAt !== undefined)
    return [id, intentos.length === p.intentos.length ? p : reconstruirProgreso(id, intentos, estado.criterios)]
  })), [estado.progreso, estado.myqbankBlocks, estado.criterios])
  const nbme = useMemo(() => ({ ...banco.state, attempts: Object.fromEntries(Object.entries(banco.state.attempts)
    .filter(([, a]) => !isHiddenNbmeAttempt(banco.state, a) && (estado.myqbankBlocks?.[a.sessionId]?.mode !== 'test'
      || estado.myqbankBlocks[a.sessionId].completedAt !== undefined))) }), [banco.state, estado.myqbankBlocks])
  const publicados = useMemo(() => new Set(indice?.modulos.flatMap(m => m.sesiones.flatMap(s => s.conceptos)) ?? []), [indice])
  const listas = useMemo(() => new Map((banco.catalog?.questions ?? []).filter(q => q.status === 'ready').map(q => [q.id, q])), [banco.catalog])
  const intentosPreguntas = Object.values(nbme.attempts)
  const cajas = cajasDelDia({ progreso, criterios: estado.criterios, intentosPreguntas,
    conceptoDisponible: id => publicados.has(id), preguntaDisponible: id => listas.has(id),
    referencia: referenciaDelDia(progreso, intentosPreguntas, ahora), ahora })
  const candidatas = sugerirRecuperar({ progreso, nbme, ahora, conceptoDisponible: id => publicados.has(id),
    revisionDePregunta: id => listas.get(id)?.revision ?? null,
    enCajasHoy: new Set(cajas.items.map(i => `${i.tipo}:${i.id}`)) }, Infinity)
  const esperandoCuenta = !sincronizacion.ultima && ['inicializando', 'sincronizando'].includes(sincronizacion.estado)
  const esperandoBanco = !banco.syncStatus.lastSyncedAt && ['initializing', 'syncing'].includes(banco.syncStatus.state)
  return <>{children({ usuario: session?.user?.id ?? '', ahora,
    listo: !!banco.catalog && !esperandoCuenta && !esperandoBanco, candidatas, onNuevo, ocupado: busy,
    progreso, criterios: estado.criterios, nbme, listas, publicados, modulos: indice?.modulos ?? [],
    bancoDisponible: !!banco.catalog,
    enCajasHoy: new Set(cajas.items.filter(i => !i.hecho).map(i => `${i.tipo}:${i.id}`)),
  })}</>
}

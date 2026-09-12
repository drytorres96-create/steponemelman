import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { cargarIndice, cargarMigraciones } from '../data/corpus'
import type { Indice } from '../schema/concept'
import { intentoCorrecto, type Intento, type ProgresoConcepto } from '../srs/tipos'
import { nuevoProgreso } from '../srs/fsrs'
import { calcularEstado, evaluarDominio, type CriteriosDominio } from '../srs/mastery'
import { supabase } from '../lib/supabase'
import { leer, escribir } from './db'
import { ESTADO_INICIAL, crearUUID, leerEstadoDesconocido, migrarConceptIds, combinarEstados, reconstruirProgreso, serializarEstable, type EstadoApp, type Reanudable } from './model'
import { StudySyncEngine, leerSnapshot, diagnosticoSync, type CloudSnapshot, type SyncReply, type CodigoSync } from './sync'
export type { EstadoApp, RegistroSesion, Reanudable } from './model'

interface Ctx {
  listo: boolean
  indice: Indice | null
  estado: EstadoApp
  errorCarga: string | null
  sincronizacion: { estado: 'inicializando' | 'pendiente' | 'sincronizando' | 'sincronizado' | 'error'; mensaje: string; ultima: number | null; codigo?: CodigoSync }
  sincronizarAhora: () => Promise<boolean>
  registrarIntento: (id: string, intento: Intento) => ProgresoConcepto
  progresoDe: (id: string) => ProgresoConcepto
  guardarReanudable: (r: Reanudable | null) => void
  iniciarSesion: (modulo: string, ruta: string) => string
  cerrarSesion: (id: string, datos: { vistos: number; correctos: number; ms: number; msVisibles?: number }) => void
  actualizarCriterios: (c: CriteriosDominio) => void
  exportar: () => string
  importar: (json: string) => { ok: boolean; mensaje: string }
  reiniciar: () => Promise<void>
}
const C = createContext<Ctx | null>(null)
type Guardado = { state: EstadoApp; snapshot: CloudSnapshot | null; savedAt: number }

function leerGuardado(valor: unknown, userId: string): Guardado | null {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null
  const v = valor as Record<string, unknown>
  const state = leerEstadoDesconocido(v.state)
  const snapshot = v.snapshot === null ? null : leerSnapshot(v.snapshot)
  if (!state || typeof v.savedAt !== 'number' || !Number.isFinite(v.savedAt) || v.savedAt < 0
    || (v.snapshot !== null && !snapshot) || (snapshot?.user_id && snapshot.user_id !== userId)) return null
  return { state, snapshot, savedAt: v.savedAt }
}

export function ProveedorEstado({ children, userId }: { children: ReactNode; userId: string }) {
  const clave = `cuenta:${userId}`
  const [estado, setEstado] = useState<EstadoApp>(ESTADO_INICIAL)
  const [indice, setIndice] = useState<Indice | null>(null)
  const [listo, setListo] = useState(false)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [sincronizacion, setSync] = useState<Ctx['sincronizacion']>({ estado: 'inicializando', mensaje: 'Preparando tu progreso…', ultima: null })
  const actual = useRef(ESTADO_INICIAL)
  const motor = useRef<StudySyncEngine | null>(null)
  const mapa = useRef<Record<string, string>>({})
  const vivo = useRef(true)
  const cambio = useRef(0)
  const guardados = useRef(Promise.resolve())
  const [edicion, setEdicion] = useState(0)
  const reiniciando = useRef(false)
  const syncEnCurso = useRef<{ engine: StudySyncEngine; promise: Promise<boolean> } | null>(null)

  const persistir = useCallback(() => {
    const registro: Guardado = { state: actual.current, snapshot: motor.current?.snapshot ?? null, savedAt: Date.now() }
    // Respaldo inmediato para la última respuesta si se cierra la pestaña.
    try { localStorage.setItem(`step1-respaldo:${clave}`, JSON.stringify(registro)) } catch { /* IndexedDB conserva la copia principal. */ }
    guardados.current = guardados.current.catch(() => undefined).then(() => escribir(clave, registro))
    return guardados.current
  }, [clave])
  const reemplazar = useCallback((nuevo: EstadoApp) => {
    if (!vivo.current) return
    actual.current = nuevo
    setEstado(nuevo)
    void persistir().catch(() => {
      if (vivo.current) setSync(s => ({ ...s, estado: 'error', mensaje: 'No se pudo guardar la copia local. Mantén abierta la página y sincroniza.' }))
    })
  }, [persistir])
  const editar = useCallback((fn: (previo: EstadoApp) => EstadoApp) => {
    if (reiniciando.current || !vivo.current || !motor.current) return
    reemplazar(fn(actual.current))
    cambio.current++
    setEdicion(cambio.current)
    setSync(s => ({ ...s, estado: 'pendiente', mensaje: 'Guardando cambios…' }))
  }, [reemplazar])
  const sincronizarAhora = useCallback((): Promise<boolean> => {
    const engine = motor.current
    if (!engine || reiniciando.current || !vivo.current) return Promise.resolve(false)
    if (syncEnCurso.current?.engine === engine) return syncEnCurso.current.promise
    const esActual = () => vivo.current && motor.current === engine
    const promise = (async () => {
      setSync(s => ({ ...s, estado: 'sincronizando', mensaje: 'Sincronizando…' }))
      try {
        const lectura = await engine.fetchAndMerge()
        if (!esActual()) return false
        const resultado = await engine.flush()
        if (!esActual()) return false
        await persistir()
        if (!esActual()) return false
        // Una respuesta nueva también puede llegar mientras se escribe IndexedDB.
        if (serializarEstable(actual.current) !== serializarEstable(engine.snapshot?.state)) {
          setSync(s => ({ ...s, estado: 'pendiente', mensaje: 'Guardando los cambios más recientes…' }))
          setEdicion(++cambio.current)
          return false
        }
        setSync({ estado: 'sincronizado', ultima: Date.now(), mensaje: lectura.kind === 'reset' || resultado.kind === 'reset'
          ? 'Progreso actualizado tras el reinicio de tu cuenta' : 'Progreso sincronizado' })
        return true
      } catch (causa) {
        const { codigo, mensaje } = diagnosticoSync(causa)
        // Una línea en la consola para poder distinguir el fallo sin adivinar.
        console.warn('[sync]', codigo, causa)
        if (esActual()) setSync(s => ({ ...s, estado: 'error', mensaje, codigo }))
        return false
      }
    })()
    syncEnCurso.current = { engine, promise }
    void promise.then(() => { if (syncEnCurso.current?.promise === promise) syncEnCurso.current = null })
    return promise
  }, [persistir])

  useEffect(() => {
    vivo.current = true
    let cancelado = false
    setListo(false)
    setErrorCarga(null)
    reiniciando.current = false
    void (async () => {
      const crudo = await leer<unknown>(clave)
      let guardado = leerGuardado(crudo, userId)
      let respaldoCrudo: unknown = null
      try {
        respaldoCrudo = JSON.parse(localStorage.getItem(`step1-respaldo:${clave}`) || 'null')
        const respaldo = leerGuardado(respaldoCrudo, userId)
        if (respaldo && (!guardado || respaldo.savedAt > guardado.savedAt)) guardado = respaldo
      } catch { /* Un respaldo malformado no reemplaza IndexedDB. */ }
      // Una revisión corrupta nunca se convierte en "cuenta nueva": podría revivir un reinicio.
      if (!guardado && (crudo !== null || respaldoCrudo !== null)) throw new Error('La copia local no es válida.')
      const [idx, migraciones] = await Promise.all([cargarIndice(), cargarMigraciones()])
      if (cancelado) return
      mapa.current = migraciones
      actual.current = migrarConceptIds(leerEstadoDesconocido(guardado?.state) ?? ESTADO_INICIAL, migraciones)
      setEstado(actual.current)
      let engine: StudySyncEngine
      const esActual = () => !cancelado && vivo.current && motor.current === engine
      const verificarMontaje = () => { if (!esActual()) throw new Error('La cuenta ya no está activa.') }
      engine = new StudySyncEngine({
        load: async () => {
          verificarMontaje()
          const { data, error } = await supabase.from('study_state').select('*').eq('user_id', userId).maybeSingle()
          verificarMontaje()
          if (error) throw error
          if (!data) return null
          const validado = leerEstadoDesconocido(data.state)
          if (!validado) throw new Error('El progreso remoto no tiene un formato válido.')
          return { ...data, state: migrarConceptIds(validado, mapa.current) } as CloudSnapshot
        },
        save: async ({ state, expectedRevision, generation }) => {
          verificarMontaje()
          const { data, error } = await supabase.rpc('sync_study_state', { p_state: state, p_expected_revision: expectedRevision, p_generation: generation })
          verificarMontaje()
          if (error) throw error
          return data as SyncReply
        },
      }, { getLocal: () => actual.current, setLocal: s => { if (esActual()) reemplazar(s) },
        onSnapshot: () => { if (esActual()) void persistir().catch(() => undefined) } },
      guardado?.snapshot ? { ...guardado.snapshot, state: migrarConceptIds(guardado.snapshot.state, migraciones) } : null)
      motor.current = engine
      setIndice(idx)
      setListo(true)
      await sincronizarAhora()
    })().catch(() => {
      if (!cancelado) { setErrorCarga('No se pudo cargar tu cuenta o el material. Revisa la conexión y vuelve a cargar.'); setListo(true) }
    })
    return () => { cancelado = true; vivo.current = false; motor.current = null; syncEnCurso.current = null }
  }, [clave, userId, reemplazar, persistir, sincronizarAhora])
  useEffect(() => {
    if (!listo || !edicion) return
    const t = setTimeout(() => { void sincronizarAhora() }, 650)
    return () => clearTimeout(t)
  }, [listo, edicion, sincronizarAhora])
  useEffect(() => {
    const activar = () => { if (document.visibilityState === 'visible') void sincronizarAhora() }
    const salida = () => { if (listo) void persistir().catch(() => undefined) }
    window.addEventListener('online', activar)
    window.addEventListener('focus', activar)
    document.addEventListener('visibilitychange', activar)
    window.addEventListener('pagehide', salida)
    const t = setInterval(activar, 30_000)
    return () => {
      clearInterval(t)
      window.removeEventListener('online', activar)
      window.removeEventListener('focus', activar)
      document.removeEventListener('visibilitychange', activar)
      window.removeEventListener('pagehide', salida)
    }
  }, [listo, persistir, sincronizarAhora])
  const registrarIntento = useCallback((id: string, intento: Intento) => {
    let resultado = nuevoProgreso(id)
    editar(prev => {
      const anterior = prev.progreso[id] ?? nuevoProgreso(id)
      resultado = reconstruirProgreso(id, [...anterior.intentos, { ...intento, attempt_id: intento.attempt_id ?? crearUUID() }], prev.criterios, anterior.dominado_en)
      const progreso = { ...prev.progreso, [id]: resultado }
      const registros = Object.values(progreso).flatMap(p => p.intentos)
      const sesiones = prev.sesiones.map(s => {
        if (s.id !== intento.session_id) return s
        const propios = registros.filter(i => i.session_id === s.id)
        return { ...s, vistos: propios.length, correctos: propios.filter(intentoCorrecto).length,
          ms: propios.reduce((n, i) => n + i.ms, 0) }
      })
      const deltaMs = resultado.intentos.reduce((n, i) => n + i.ms, 0) - anterior.intentos.reduce((n, i) => n + i.ms, 0)
      return { ...prev, vistoAlguna: true, msEstudio: Math.max(0, prev.msEstudio + deltaMs), progreso, sesiones }
    })
    return resultado
  }, [editar])
  const api = useMemo<Ctx>(() => ({
    listo, indice, estado, errorCarga, sincronizacion, sincronizarAhora, registrarIntento,
    progresoDe: id => estado.progreso[id] ?? nuevoProgreso(id),
    guardarReanudable: r => editar(p => ({ ...p, reanudable: r, fieldUpdatedAt: { criterios: p.fieldUpdatedAt?.criterios ?? 0,
      reanudable: Math.max(Date.now(), (p.fieldUpdatedAt?.reanudable ?? p.reanudable?.ts ?? 0) + 1) } })),
    iniciarSesion: (modulo, ruta) => {
      const id = crearUUID()
      editar(p => ({ ...p, sesiones: [...p.sesiones, { id, inicio: Date.now(), fin: null, modulo, ruta, vistos: 0, correctos: 0, ms: 0 }] }))
      return id
    },
    cerrarSesion: (id, datos) => editar(p => ({ ...p, sesiones: p.sesiones.map(s => s.id === id ? { ...s, fin: Date.now(), ...datos } : s) })),
    actualizarCriterios: criterios => editar(p => {
      const progreso: Record<string, ProgresoConcepto> = {}
      for (const [k, v] of Object.entries(p.progreso)) {
        const ev = evaluarDominio(v, criterios)
        const conDominio = { ...v, dominado_en: v.dominado_en ?? (ev.cumple ? Date.now() : null) }
        progreso[k] = { ...conDominio, estado: calcularEstado(conDominio, criterios) }
      }
      return { ...p, criterios, progreso, fieldUpdatedAt: { criterios: Math.max(Date.now(), (p.fieldUpdatedAt?.criterios ?? 0) + 1), reanudable: p.fieldUpdatedAt?.reanudable ?? p.reanudable?.ts ?? 0 } }
    }),
    exportar: () => JSON.stringify({ ...actual.current, exportado: new Date().toISOString() }, null, 1),
    importar: json => {
      if (reiniciando.current || !motor.current || !vivo.current) return { ok: false, mensaje: 'Espera a que termine la operación de tu cuenta.' }
      try {
        const validado = leerEstadoDesconocido(JSON.parse(json))
        if (!validado) return { ok: false, mensaje: 'El archivo contiene un formato de progreso inválido. No se importó.' }
        const importado = migrarConceptIds(validado, mapa.current)
        editar(p => combinarEstados(importado, p))
        return { ok: true, mensaje: `Importados ${Object.keys(importado.progreso).length} conceptos. La copia se sincronizará con tu cuenta.` }
      } catch { return { ok: false, mensaje: 'No se pudo leer el archivo JSON.' } }
    },
    reiniciar: async () => {
      const engine = motor.current
      if (!engine || reiniciando.current) throw new Error('La cuenta todavía está cargando o reiniciándose.')
      const sincronizado = await sincronizarAhora()
      if (!sincronizado || !vivo.current || motor.current !== engine || reiniciando.current) throw new Error('Conéctate a internet y sincroniza antes de reiniciar.')
      const snapshot = engine.snapshot
      if (!snapshot) throw new Error('Conéctate a internet y sincroniza antes de reiniciar.')
      reiniciando.current = true
      try {
        const { data, error } = await supabase.rpc('reset_study_state', { p_state: ESTADO_INICIAL, p_expected_revision: snapshot.revision, p_generation: snapshot.generation })
        if (!vivo.current || motor.current !== engine) return
        if (error) throw error
        const respuesta = data as SyncReply
        if (!respuesta.ok || !respuesta.row) throw new Error('Hay cambios en otro dispositivo. Sincroniza y vuelve a intentarlo.')
        engine.acceptReset(respuesta.row)
        await persistir()
        if (vivo.current && motor.current === engine) setSync({ estado: 'sincronizado', ultima: Date.now(), mensaje: 'Progreso reiniciado en tu cuenta' })
      } finally { if (motor.current === engine) reiniciando.current = false }
    },
  }), [listo, indice, estado, errorCarga, sincronizacion, sincronizarAhora, registrarIntento, editar, persistir])
  return <C.Provider value={api}>{children}</C.Provider>
}
export function useApp() {
  const v = useContext(C)
  if (!v) throw new Error('useApp fuera del proveedor')
  return v
}

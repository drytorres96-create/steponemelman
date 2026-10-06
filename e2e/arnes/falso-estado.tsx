import { useSyncExternalStore } from 'react'
import { ESTADO_INICIAL, reconstruirProgreso } from '@app/store/model'
import { nuevoProgreso } from '@app/srs/fsrs'
import { CRITERIOS_POR_DEFECTO } from '@app/srs/mastery'
import { conceptos, progreso } from './escena'

// Doble del proveedor de progreso: el mismo contrato que useApp, en memoria y sin Supabase.
const reanudar = new URLSearchParams(location.search).get('retomar')
const guardada = reanudar?.startsWith('concepto') ? {
  versionFormato: 3, modulo: 'M', sesion: 'repaso', indice: 1, ts: Date.now(), sessionId: 'conceptos-guardados',
  conceptIds: ['C8', 'C4', 'C8'], variantes: [null, null, null], cantidadInicial: 2,
  titulo: 'Sesión sintética guardada', subtitulo: 'Cola exacta, incluidos reintentos.',
  paso: { indice: 1, pistas: 1, fuenteConsultada: false, explicacionPrevia: false, confianza: 2, msActivo: 7000 },
} : reanudar === 'nbme-resumen' ? {
  versionFormato: 3, modulo: 'M', sesion: 'repaso', indice: 2, ts: Date.now(), sessionId: 'conceptos-terminados',
  conceptIds: ['C8', 'C4'], variantes: [null, null], cantidadInicial: 2,
  titulo: 'Resumen sintético terminado', subtitulo: 'Sin pasos de concepto pendientes.',
} : null
let estado: any = { ...ESTADO_INICIAL, progreso, reanudable: guardada }
declare global { interface Window { __leerProgresoSintetico: () => any } }
window.__leerProgresoSintetico = () => estado
const oyentes = new Set<() => void>()
const avisar = () => { valor = { ...valor, estado }; oyentes.forEach(f => f()) }
let valor: any = {
  listo: true, errorCarga: null, estado,
  indice: { schema_version: '1', corpus_version: '1.0.5', n_conceptos: conceptos.length, modulos: [{ module_id: 'M', nombre: 'M', proposito: '', prerrequisitos: [], disciplinas: [], sistemas: [], temas: [], n_conceptos: conceptos.length, minutos_estimados: 0, cobertura_documental: [], orden: 1, sesiones: [{ session_id: 'S', titulo: 'S', objetivo: '', conceptos }] }], documentos: [], glosario: [], cuarentena: 0 },
  sincronizacion: { estado: 'sincronizado', mensaje: 'Progreso sincronizado', ultima: Date.now() },
  sincronizarAhora: async () => true,
  registrarIntento: (id: string, intento: any) => {
    const previo = estado.progreso[id]
    const p = reconstruirProgreso(id, [...(previo?.intentos ?? []), intento], CRITERIOS_POR_DEFECTO, previo?.dominado_en ?? null)
    estado = { ...estado, progreso: { ...estado.progreso, [id]: p } }; avisar(); return p
  },
  progresoDe: (id: string) => estado.progreso[id] ?? nuevoProgreso(id),
  guardarReanudable: (r: any) => { estado = { ...estado, reanudable: r }; avisar() },
  iniciarSesion: () => 'sesion', cerrarSesion: () => {}, actualizarCriterios: () => {},
  avisoLocal: null, descartarAvisoLocal: () => {},
  exportar: (extra?: Record<string, unknown>) => JSON.stringify({ ...extra, ...estado }), importar: () => ({ ok: true, mensaje: '' }), reiniciar: async () => {},
}
const suscribir = (f: () => void) => { oyentes.add(f); return () => oyentes.delete(f) }
export function useApp() { return useSyncExternalStore(suscribir, () => valor) }
export function ProveedorEstado({ children }: { children: unknown }) { return children }

import type { EstadoApp, RegistroSesion } from '../store/model'
export function cargaPorTiempo(minutos: number, sesiones: RegistroSesion[]): number {
  const muestras = sesiones.filter(s => s.msVisibles && s.vistos > 0).slice(-20)
    .map(s => s.msVisibles! / s.vistos).filter(ms => ms >= 15000 && ms <= 600000).sort((a, b) => a - b)
  const mediana = muestras.length >= 3 ? muestras[Math.floor(muestras.length / 2)] : 120000
  return Math.min(20, Math.max(1, Math.floor(minutos * 60000 / mediana)))
}
export function tiempoLegible(ms: number): string {
  const segundos = Math.floor(Math.max(0, ms) / 1000)
  return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`
}
export function contextoReanudacion(estado: EstadoApp): string {
  const r = estado.reanudable
  if (!r) return ''
  const ids = new Set(r.conceptIds?.slice(0, r.indice) ?? [])
  const pendientes = new Set(r.conceptIds?.slice(r.indice) ?? [])
  let errores = 0
  for (const id of pendientes) {
    const ultimo = estado.progreso[id]?.intentos.filter(t => t.session_id === r.sessionId).at(-1)
    if (ultimo && ['incorrecta', 'parcial'].includes(ultimo.resultado ?? '')) errores++
  }
  return `${ids.size} conceptos trabajados · ${pendientes.size} pendientes${errores ? `, incluidos ${errores} errores por corregir` : ''}${r.msVisibles ? ` · ${tiempoLegible(r.msVisibles)} de estudio` : ''}`
}

/** Lunes 00:00 local de la semana que contiene `fecha`. La semana de estudio empieza el lunes. */
export function lunesDe(fecha: Date | number = Date.now()): Date {
  const f = new Date(fecha)
  const d = new Date(f.getFullYear(), f.getMonth(), f.getDate())
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}
/** `2026-09-14` en hora local, sin el desplazamiento que introduce `toISOString`. */
export function fechaISO(f: Date): string {
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`
}

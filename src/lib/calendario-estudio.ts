/** Un calendario de estudio compartido; viajar o cambiar la zona del dispositivo no cambia el día. */
export const ZONA_ESTUDIO = 'America/New_York'
export interface FechaEstudio { anio: number; mes: number; dia: number }
const DIA = 86_400_000
const formato = new Intl.DateTimeFormat('en-US', { timeZone: ZONA_ESTUDIO, calendar: 'gregory', numberingSystem: 'latn',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })

export function partesEstudio(ts: number): FechaEstudio & { hora: number; minuto: number; segundo: number } {
  const p = Object.fromEntries(formato.formatToParts(ts).map(v => [v.type, v.value]))
  return { anio: Number(p.year), mes: Number(p.month), dia: Number(p.day),
    hora: Number(p.hour), minuto: Number(p.minute), segundo: Number(p.second) }
}

export function desplazarFechaEstudio(f: FechaEstudio, dias: number): FechaEstudio {
  const utc = new Date(Date.UTC(f.anio, f.mes - 1, f.dia + dias))
  return { anio: utc.getUTCFullYear(), mes: utc.getUTCMonth() + 1, dia: utc.getUTCDate() }
}

/** Hora de calendario en Nueva York. Las 03:00 y el mediodía existen y no son ambiguos durante DST. */
export function instanteEstudio(f: FechaEstudio, hora = 3): number {
  const objetivo = Date.UTC(f.anio, f.mes - 1, f.dia, hora)
  let instante = objetivo
  for (let paso = 0; paso < 3; paso++) {
    const p = partesEstudio(instante)
    const observado = Date.UTC(p.anio, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo)
    const ajuste = objetivo - observado
    instante += ajuste
    if (!ajuste) break
  }
  return instante
}

export function instanteEstudioISO(iso: string, hora = 3): number {
  const [anio, mes, dia] = iso.split('-').map(Number)
  return instanteEstudio({ anio, mes, dia }, hora)
}

export function fechaEstudio(ahora: number, corteHora = 3): FechaEstudio {
  const p = partesEstudio(ahora)
  const fecha = { anio: p.anio, mes: p.mes, dia: p.dia }
  return p.hora < corteHora ? desplazarFechaEstudio(fecha, -1) : fecha
}

export function inicioDiaEstudio(ahora: number, corteHora = 3): number {
  return instanteEstudio(fechaEstudio(ahora, corteHora), corteHora)
}

export function finDiaEstudio(ahora: number, corteHora = 3): number {
  return instanteEstudio(desplazarFechaEstudio(fechaEstudio(ahora, corteHora), 1), corteHora)
}

export function numeroDiaEstudio(f: FechaEstudio): number { return Date.UTC(f.anio, f.mes - 1, f.dia) / DIA }
export function diaSemanaEstudio(f: FechaEstudio): number { return new Date(Date.UTC(f.anio, f.mes - 1, f.dia)).getUTCDay() }
export function fechaISOEstudio(f: FechaEstudio): string {
  return `${f.anio}-${String(f.mes).padStart(2, '0')}-${String(f.dia).padStart(2, '0')}`
}

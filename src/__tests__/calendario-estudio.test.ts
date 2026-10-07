import { afterEach, describe, expect, it } from 'vitest'
import { diaSemanaEstudio, fechaEstudio, fechaISOEstudio, instanteEstudio, ZONA_ESTUDIO } from '../lib/calendario-estudio'
import { finDelDia, inicioDelDia, limitesSemana, tipoDeDia } from '../lib/dia'
import { diaDeLaMeta, fechaDelDia, inicioDelDiaMeta } from '../lib/meta'
import { tituloDeHoy } from '../lib/nuevo-hoy'

const zonaAnterior = process.env.TZ
afterEach(() => { if (zonaAnterior === undefined) delete process.env.TZ; else process.env.TZ = zonaAnterior })

describe('un solo calendario de Nueva York para Hoy y la meta', () => {
  it.each(['UTC', 'Asia/Tokyo', 'Pacific/Honolulu', 'America/New_York'])('el dispositivo en %s conserva el corte NY, las fechas y la semana', zona => {
    process.env.TZ = zona
    const antes = Date.parse('2026-10-07T02:59:59.999-04:00'), corte = Date.parse('2026-10-07T03:00:00-04:00')
    expect(diaDeLaMeta(antes)).toBe(12)
    expect(diaDeLaMeta(corte)).toBe(13)
    expect(inicioDelDia(corte)).toBe(corte)
    expect(inicioDelDiaMeta(13)).toBe(corte)
    expect(fechaISOEstudio(fechaEstudio(antes))).toBe('2026-10-06')
    expect(tituloDeHoy('Nuevo', corte)).toBe('Nuevo de hoy · 7 oct')
    expect(tituloDeHoy('Cajas', antes)).toBe('Cajas de hoy · 6 oct')
    expect(limitesSemana(Date.parse('2026-09-28T02:59:59-04:00'))).toEqual({ inicio: '2026-09-21', fin: '2026-09-27' })
    expect(limitesSemana(Date.parse('2026-09-28T03:00:00-04:00'))).toEqual({ inicio: '2026-09-28', fin: '2026-10-04' })
    expect(tipoDeDia(Date.parse('2026-09-26T02:59:59-04:00'))).toBe('vacio')
    expect(tipoDeDia(Date.parse('2026-09-26T03:00:00-04:00'))).toBe('finde')
    expect(new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_ESTUDIO, dateStyle: 'short' }).format(fechaDelDia(60)))
      .toBe(new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_ESTUDIO, dateStyle: 'short' }).format(Date.parse('2026-11-23T12:00:00-05:00')))
  })

  it('el cambio de otoño añade una hora al intervalo, no un día a la ventana', () => {
    const corteOctubre = Date.parse('2026-10-31T03:00:00-04:00'), corteNoviembre = Date.parse('2026-11-01T03:00:00-05:00')
    expect(finDelDia(corteOctubre)).toBe(corteNoviembre)
    expect(corteNoviembre - corteOctubre).toBe(25 * 3_600_000)
    expect(diaDeLaMeta(corteOctubre)).toBe(37)
    expect(diaDeLaMeta(corteNoviembre)).toBe(38)
    for (const horaRepetida of ['2026-11-01T01:59:59-04:00', '2026-11-01T01:59:59-05:00']) {
      const ts = Date.parse(horaRepetida)
      expect(inicioDelDia(ts)).toBe(corteOctubre)
      expect(finDelDia(ts)).toBe(corteNoviembre)
      expect(diaDeLaMeta(ts)).toBe(37)
    }
  })

  it('el cambio de primavera acorta el intervalo sin perder el corte ni la fecha de estudio', () => {
    const sabado = Date.parse('2026-03-07T03:00:00-05:00'), domingo = Date.parse('2026-03-08T03:00:00-04:00')
    expect(finDelDia(sabado)).toBe(domingo)
    expect(domingo - sabado).toBe(23 * 3_600_000)
    expect(instanteEstudio({ anio: 2026, mes: 3, dia: 8 })).toBe(domingo)
    expect(fechaISOEstudio(fechaEstudio(domingo))).toBe('2026-03-08')
    expect(diaSemanaEstudio(fechaEstudio(domingo))).toBe(0)
  })
})

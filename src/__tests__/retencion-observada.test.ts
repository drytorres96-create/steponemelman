import { describe,it,expect } from 'vitest'
import { nuevoProgreso,DIA } from '../srs/fsrs'
import type { Intento } from '../srs/tipos'
import { evidenciaDiferida, porcentajeObservado } from '../lib/retencion-observada'
const intento=(dia:number,extra:Partial<Intento>={}):Intento=>({ts:dia*DIA,calificacion:3,resultado:'correcta',interaccion:'recuperacion_libre',recuperacion_activa:true,pistas_usadas:0,fuente_consultada:false,explicacion_previa:false,pregunta_version:'v1',ms:1000,tipo_error:'ninguno',confianza_declarada:null,...extra})
const medir=(intentos:Intento[],desde=0,hasta=100*DIA)=>evidenciaDiferida([{...nuevoProgreso('X'),intentos}],desde,hasta)
describe('evidencia observada, separada del modelo SRS',()=>{
 it('no inventa cero por ciento sin observaciones',()=>expect(porcentajeObservado(medir([]).retencion)).toBeNull())
 it('incluye exactamente treinta días, excluye intervalos menores',()=>{
  expect(medir([intento(1),intento(31)]).retencion).toEqual({favorables:1,n:1})
  expect(medir([intento(1),intento(30)]).retencion.n).toBe(0)
 })
 it('parcial cuenta como fallo y la repetición exige veinticuatro horas',()=>{
  expect(medir([intento(1,{resultado:'incorrecta'}),intento(2,{resultado:'parcial'})]).repeticion).toEqual({favorables:1,n:1})
  expect(medir([intento(1,{resultado:'incorrecta'}),intento(1.5,{resultado:'incorrecta'})]).repeticion.n).toBe(0)
 })
 it('una corrección sin ayuda baja la repetición y conserva el denominador',()=>expect(medir([intento(1,{resultado:'parcial'}),intento(3)]).repeticion).toEqual({favorables:0,n:1}))
 it('no cuenta ayudas, revisiones o condiciones desconocidas',()=>{
  for(const extra of [{pistas_usadas:1},{fuente_consultada:true},{explicacion_previa:true},{resultado:'revision' as const},{fuente_consultada:undefined}]) expect(medir([intento(1),intento(31,extra)]).retencion.n).toBe(0)
 })
 it('la exposición intermedia reinicia el intervalo aunque sea asistida',()=>expect(medir([intento(1),intento(29,{pistas_usadas:1}),intento(31)]).retencion.n).toBe(0))
 it('no compara versiones distintas ni resultados fuera de la ventana',()=>{
  expect(medir([intento(1),intento(31,{pregunta_version:'v2'})]).retencion.n).toBe(0)
  expect(medir([intento(1),intento(31)],32*DIA).retencion.n).toBe(0)
  expect(medir([intento(1),intento(31)],0,30*DIA).retencion.n).toBe(0)
 })
})

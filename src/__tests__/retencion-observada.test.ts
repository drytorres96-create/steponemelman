import { describe,it,expect } from 'vitest'
import { nuevoProgreso,DIA } from '../srs/fsrs'
import type { Intento } from '../srs/tipos'
import { evidenciaDiferida, evidenciaPorTopic, porcentajeObservado } from '../lib/retencion-observada'
import type { Concepto } from '../schema/concept'
const intento=(dia:number,extra:Partial<Intento>={}):Intento=>({ts:dia*DIA,calificacion:3,resultado:'correcta',interaccion:'recuperacion_libre',recuperacion_activa:true,pistas_usadas:0,fuente_consultada:false,explicacion_previa:false,pregunta_version:'v1',ms:1000,tipo_error:'ninguno',confianza_declarada:null,...extra})
const medir=(intentos:Intento[],desde=0,hasta=100*DIA)=>evidenciaDiferida([{...nuevoProgreso('X'),intentos}],desde,hasta)
describe('evidencia observada, separada del modelo SRS',()=>{
 it('el límite de treinta días se decide por el instante exacto y excluye respuestas futuras',()=>{
  const primero=intento(1),segundo=intento(31)
  expect(medir([primero,{...segundo,ts:segundo.ts-1}]).retencion.n).toBe(0)
  expect(medir([primero,segundo],0,segundo.ts-1).retencion.n).toBe(0)
  expect(medir([primero,segundo],0,segundo.ts).retencion).toEqual({favorables:1,n:1})
 })
 it('cambiar una calificación no sustituye el resultado observado',()=>{
  expect(medir([intento(1),intento(31,{resultado:'incorrecta',calificacion:4})]).retencion).toEqual({favorables:0,n:1})
  expect(medir([intento(1),intento(31,{resultado:'correcta',calificacion:1})]).retencion).toEqual({favorables:1,n:1})
 })
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
 it('excluye versiones ausentes o vacías, aunque el resto del intento sea independiente',()=>{
  for(const pregunta_version of [undefined,'','   ']) expect(medir([intento(1),intento(31,{pregunta_version})]).retencion.n).toBe(0)
 })
 it('mantiene denominadores separados para recuerdo, discriminación y aplicación',()=>{
  const progresos = [
   {...nuevoProgreso('R'),intentos:[intento(1),intento(31)]},
   {...nuevoProgreso('D'),intentos:[intento(1,{resultado:'incorrecta',interaccion:'direccion'}),intento(31,{resultado:'parcial',interaccion:'direccion',tipo_evidencia:'recuerdo'})]},
   {...nuevoProgreso('A'),intentos:[intento(1,{resultado:'incorrecta',interaccion:'caso_clinico',tipo_evidencia:'aplicacion'}),intento(31,{interaccion:'caso_clinico',tipo_evidencia:'aplicacion'})]},
  ]
  const antes = JSON.stringify(progresos)
  const e = evidenciaDiferida(progresos,0,100*DIA)
  expect(e.retencion).toEqual({favorables:2,n:3})
  expect(e.repeticion).toEqual({favorables:1,n:2})
  expect(e.porTipo.recuerdo).toEqual({retencion:{favorables:1,n:1},repeticion:{favorables:0,n:0}})
  expect(e.porTipo.discriminacion).toEqual({retencion:{favorables:0,n:1},repeticion:{favorables:1,n:1}})
  expect(e.porTipo.aplicacion).toEqual({retencion:{favorables:1,n:1},repeticion:{favorables:0,n:1}})
  expect(JSON.stringify(progresos)).toBe(antes)
 })
 it('un caso antiguo sin aplicación explícita se cuenta como discriminación',()=>{
  const e = medir([intento(1,{interaccion:'caso_clinico'}),intento(31,{interaccion:'caso_clinico'})])
  expect(e.porTipo.aplicacion.retencion.n).toBe(0)
  expect(e.porTipo.discriminacion.retencion.n).toBe(1)
 })
 it('agrupa por clasificación primaria sin duplicar IDs entre módulos ni suponer temas cerrados',()=>{
  const c = {concept_id:'X',clasificacion:{disciplina_primaria:'Bioquímica',sistema_primario:'Endocrino'}} as Concepto
  const progreso = {X:{...nuevoProgreso('X'),intentos:[intento(1),intento(31)]}}
  const filas = evidenciaPorTopic([c,c],progreso,[{id:1,name:'BIOQUIMICA',status:2},{id:2,name:'Endocrino',status:2},{id:3,name:'Genética',status:1}],0,100*DIA)
  expect(filas.map(f=>[f.nombre,f.retencion])).toEqual([['BIOQUIMICA',{favorables:1,n:1}],['Endocrino',{favorables:0,n:0}]])
 })
})

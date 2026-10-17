import { describe, expect, it } from 'vitest'
import { barajar, corregir, extraerJSON, respuestaEsperada, validarEjercicio, validarEjercicios, type Ejercicio } from '../lib/practica-activa'

const e = (extra: Record<string, unknown>) => ({ explicacion: 'Esto es así por el mecanismo descrito en la pregunta.', ...extra })
const vf = (n: number) => e({ tipo: 'verdadero_falso', enunciado: `La afirmación número ${n} del caso es verdadera.`, verdadero: true })

describe('validación de ejercicios que escribe Claude', () => {
  it('acepta cada tipo bien formado y los deja en forma canónica', () => {
    expect(validarEjercicio(e({ tipo: 'completar', enunciado: 'El paso limitante lo cataliza la ______ de tipo uno.', respuesta: ' fosfofructocinasa ', aceptadas: ['PFK', 'pfk', 'fosfofructocinasa'] })))
      .toMatchObject({ enunciado: 'El paso limitante lo cataliza la ____ de tipo uno.', respuesta: 'fosfofructocinasa', aceptadas: ['PFK'] })
    expect(validarEjercicio(e({ tipo: 'opcion_unica', enunciado: '¿Qué hormona sube en el ayuno?', opciones: ['Glucagón', 'Insulina', 'Leptina'], correcta: 'glucagón' })))
      .toMatchObject({ correcta: 'Glucagón' })
    expect(validarEjercicio(e({ tipo: 'seleccion_multiple', enunciado: 'Marca las que suben en el ayuno.', opciones: ['A1', 'B2', 'C3', 'D4'], correctas: ['A1', 'C3'] }))).not.toBeNull()
    expect(validarEjercicio(e({ tipo: 'ordenar', enunciado: 'Ordena los pasos de la cascada.', pasos: ['uno', 'dos', 'tres'] }))).not.toBeNull()
    expect(validarEjercicio(e({ tipo: 'emparejar', enunciado: 'Empareja cada hormona con su tejido.', pares: [{ izquierda: 'a', derecha: 'x' }, { izquierda: 'b', derecha: 'y' }, { izquierda: 'c', derecha: 'z' }] }))).not.toBeNull()
  })

  it('descarta lo que enseñaría algo incorrecto: clave fuera de las opciones, opciones repetidas, todo marcado', () => {
    expect(validarEjercicio(e({ tipo: 'opcion_unica', enunciado: '¿Cuál es correcta aquí?', opciones: ['A1', 'B2', 'C3'], correcta: 'D4' }))).toBeNull()
    expect(validarEjercicio(e({ tipo: 'opcion_unica', enunciado: '¿Cuál es correcta aquí?', opciones: ['A1', 'a1', 'C3'], correcta: 'A1' }))).toBeNull()
    expect(validarEjercicio(e({ tipo: 'seleccion_multiple', enunciado: 'Marca las correctas del caso.', opciones: ['A1', 'B2', 'C3', 'D4'], correctas: ['A1', 'B2', 'C3', 'D4'] }))).toBeNull()
    expect(validarEjercicio(e({ tipo: 'seleccion_multiple', enunciado: 'Marca las correctas del caso.', opciones: ['A1', 'B2', 'C3', 'D4'], correctas: ['A1', 'Z9'] }))).toBeNull()
    expect(validarEjercicio(e({ tipo: 'ordenar', enunciado: 'Ordena los pasos de la cascada.', pasos: ['uno', 'Uno', 'tres'] }))).toBeNull()
  })

  it('el hueco debe ser uno, la palabra clave corta y no estar ya escrita en el enunciado', () => {
    const base = { tipo: 'completar', respuesta: 'glucagón', aceptadas: [] }
    expect(validarEjercicio(e({ ...base, enunciado: 'No hay hueco en esta frase del caso.' }))).toBeNull()
    expect(validarEjercicio(e({ ...base, enunciado: 'Hay ____ dos ____ huecos en la frase.' }))).toBeNull()
    expect(validarEjercicio(e({ ...base, enunciado: 'El glucagón sube y por eso el ____ actúa.' }))).toBeNull()
    expect(validarEjercicio(e({ ...base, respuesta: 'una respuesta con demasiadas palabras largas', enunciado: 'La frase tiene el hueco ____ al final.' }))).toBeNull()
  })

  it('la pista se queda solo si orienta: nunca contiene la respuesta y su fallo no tumba el ejercicio', () => {
    const base = { tipo: 'completar', enunciado: 'El paso limitante lo cataliza la ____ de tipo uno.', respuesta: 'fosfofructocinasa', aceptadas: [] }
    expect(validarEjercicio(e({ ...base, pista: 'Fosforila la fructosa-6-fosfato.' }))).toMatchObject({ pista: 'Fosforila la fructosa-6-fosfato.' })
    expect(validarEjercicio(e({ ...base, pista: 'Se llama fosfofructocinasa, sin más.' }))).not.toHaveProperty('pista')
    expect(validarEjercicio(e({ ...base, pista: 42 }))).not.toBeNull()
    expect(validarEjercicio(e({ ...base, pista: 'x' }))).not.toHaveProperty('pista')
  })

  it('una ronda necesita al menos tres ejercicios distintos y se limita a ocho', () => {
    expect(validarEjercicios({ ejercicios: [vf(1), vf(2)] })).toBeNull()
    expect(validarEjercicios({ ejercicios: [vf(1), vf(1), vf(1)] })).toBeNull()
    expect(validarEjercicios({ ejercicios: [vf(1), { tipo: 'roto' }, vf(2), vf(3)] })).toHaveLength(3)
    expect(validarEjercicios({ ejercicios: Array.from({ length: 20 }, (_, n) => vf(n)) })).toHaveLength(8)
    expect(validarEjercicios(null)).toBeNull(); expect(validarEjercicios({ ejercicios: 'no' })).toBeNull()
  })

  it('extrae el JSON aunque venga con cercas o prosa alrededor', () => {
    expect(extraerJSON('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(extraerJSON('Aquí tienes: {"a":{"b":2}} ¡suerte!')).toEqual({ a: { b: 2 } })
    expect(extraerJSON('sin json')).toBeNull(); expect(extraerJSON('{roto')).toBeNull()
  })
})

describe('barajado estable', () => {
  it('la misma semilla da el mismo orden, otra semilla otro, y no pierde ni repite elementos', () => {
    const lista = ['a', 'b', 'c', 'd', 'e', 'f']
    expect(barajar(lista, 'x')).toEqual(barajar(lista, 'x'))
    expect([...barajar(lista, 'x')].sort()).toEqual(lista)
    expect(new Set(['x', 'y', 'z', 'w', 'v'].map(s => barajar(lista, s).join(''))).size).toBeGreaterThan(1)
    expect(lista).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  })
})

describe('corrección sin red', () => {
  const completar = validarEjercicio(e({ tipo: 'completar', enunciado: 'El paso limitante lo cataliza la ____ de tipo uno.', respuesta: 'fosfofructocinasa', aceptadas: ['PFK'] })) as Ejercicio
  it('completar acepta variantes y abreviaturas, avisa de una errata y rechaza otro concepto', () => {
    expect(corregir(completar, { tipo: 'completar', valor: 'Fosfofructocinasa' })).toEqual({ correcta: true })
    expect(corregir(completar, { tipo: 'completar', valor: ' pfk ' }).correcta).toBe(true)
    expect(corregir(completar, { tipo: 'completar', valor: 'fosfofructocinaza' })).toMatchObject({ correcta: true, aviso: expect.stringContaining('fosfofructocinasa') })
    expect(corregir(completar, { tipo: 'completar', valor: 'hexocinasa' }).correcta).toBe(false)
    expect(corregir(completar, { tipo: 'verdadero_falso', valor: true }).correcta).toBe(false)
  })
  it('selección múltiple exige exactamente el conjunto; ordenar y emparejar exigen todo', () => {
    const mult = validarEjercicio(e({ tipo: 'seleccion_multiple', enunciado: 'Marca las que suben en el ayuno.', opciones: ['A1', 'B2', 'C3', 'D4'], correctas: ['A1', 'C3'] })) as Ejercicio
    expect(corregir(mult, { tipo: 'seleccion_multiple', valor: ['C3', 'A1'] }).correcta).toBe(true)
    expect(corregir(mult, { tipo: 'seleccion_multiple', valor: ['A1'] }).correcta).toBe(false)
    expect(corregir(mult, { tipo: 'seleccion_multiple', valor: ['A1', 'C3', 'B2'] }).correcta).toBe(false)
    const orden = validarEjercicio(e({ tipo: 'ordenar', enunciado: 'Ordena los pasos de la cascada.', pasos: ['uno', 'dos', 'tres'] })) as Ejercicio
    expect(corregir(orden, { tipo: 'ordenar', valor: ['uno', 'dos', 'tres'] }).correcta).toBe(true)
    expect(corregir(orden, { tipo: 'ordenar', valor: ['dos', 'uno', 'tres'] }).correcta).toBe(false)
    const pares = validarEjercicio(e({ tipo: 'emparejar', enunciado: 'Empareja cada hormona con su tejido.', pares: [{ izquierda: 'a', derecha: 'x' }, { izquierda: 'b', derecha: 'y' }, { izquierda: 'c', derecha: 'z' }] })) as Ejercicio
    expect(corregir(pares, { tipo: 'emparejar', valor: { a: 'x', b: 'y', c: 'z' } }).correcta).toBe(true)
    expect(corregir(pares, { tipo: 'emparejar', valor: { a: 'x', b: 'z', c: 'y' } }).correcta).toBe(false)
    expect(respuestaEsperada(orden)).toBe('1. uno  →  2. dos  →  3. tres')
  })
})

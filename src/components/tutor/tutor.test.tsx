// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ejercicio } from '../../lib/practica-activa'
import type { OrigenChat } from '../../lib/contexto-chat'

const mock = vi.hoisted(() => ({ preguntar: vi.fn(), practica: vi.fn() }))
vi.mock('../../lib/chat-claude', () => ({ preguntarAlTutor: mock.preguntar, pedirPractica: mock.practica }))
import { TutorClaude, type PropsTutor } from './TutorClaude'
import { PAUSA_REVISION_MS, pistaDe } from './PracticaActiva'
import { bloquesDe } from './TextoClaude'

const origen: OrigenChat = { tipo: 'concepto', resultado: 'parcial', presentacion: { conceptId: 'QA-1', answer: 'beta', questionId: 'QA:0',
  version: 'qa', formatVersion: 3, index: 0, route: 'repaso', retry: false } }
const ronda = (n = 1): Ejercicio[] => [
  { tipo: 'completar', enunciado: `La enzima limitante de la glucólisis es la ____ de tipo ${n}.`, respuesta: 'fosfofructocinasa', aceptadas: ['PFK'],
    explicacion: 'Es el paso limitante y lo regulan el ATP y el citrato.', pista: 'Fosforila la fructosa-6-fosfato.' },
  { tipo: 'verdadero_falso', enunciado: `La insulina estimula la gluconeogénesis hepática (${n}).`, verdadero: false, explicacion: 'La insulina la inhibe: favorece el almacenamiento.' },
  { tipo: 'opcion_unica', enunciado: `¿Qué hormona sube en el ayuno (${n})?`, opciones: ['Glucagón', 'Insulina', 'Leptina', 'Somatostatina'], correcta: 'Glucagón',
    explicacion: 'El glucagón activa la glucogenólisis y la gluconeogénesis.' },
  { tipo: 'seleccion_multiple', enunciado: `Marca las que aumentan en el ayuno (${n}).`, opciones: ['Glucagón', 'Cortisol', 'Insulina', 'Malonil-CoA', 'Lipólisis'],
    correctas: ['Glucagón', 'Cortisol', 'Lipólisis'], explicacion: 'Insulina y malonil-CoA dominan en el estado alimentado.' },
  { tipo: 'ordenar', enunciado: `Ordena la cascada (${n}).`, pasos: ['Cae la glucemia', 'Sube el glucagón', 'Sube el AMPc', 'Se activa la glucogenólisis'],
    explicacion: 'La señal baja por la vía del AMPc y la proteína cinasa A.' },
  { tipo: 'emparejar', enunciado: `Empareja (${n}).`, pares: [{ izquierda: 'Glucagón', derecha: 'Hígado' }, { izquierda: 'Adrenalina', derecha: 'Músculo' },
    { izquierda: 'Insulina', derecha: 'Tejido graso' }], explicacion: 'Cada hormona actúa sobre su tejido diana.' },
]

let host: HTMLDivElement, root: Root
const props = (extra: Partial<PropsTutor> = {}): PropsTutor => ({ origen, estado: 'parcial', numero: 3, semilla: 'QA:0', ...extra })
const pintar = async (extra: Partial<PropsTutor> = {}) => { await act(async () => root.render(<TutorClaude {...props(extra)} />)) }
const botones = () => [...host.querySelectorAll('button')]
const boton = (nombre: string | RegExp) => botones().find(b => typeof nombre === 'string'
  ? b.textContent?.trim() === nombre || b.getAttribute('aria-label') === nombre
  : nombre.test(b.textContent ?? '') || nombre.test(b.getAttribute('aria-label') ?? ''))
const clic = async (nombre: string | RegExp) => { const b = boton(nombre); expect(b, String(nombre)).toBeTruthy(); await act(async () => b!.click()) }
const escribir = async (el: HTMLInputElement, valor: string) => { await act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, valor); el.dispatchEvent(new Event('input', { bubbles: true })) }) }
const esperar = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
const abrirPractica = async () => { mock.practica.mockResolvedValueOnce({ estado: 'ok', ejercicios: ronda() }); await clic('Recuperación activa'); await act(async () => { await Promise.resolve() }) }
const comprobar = async () => { await clic('Comprobar'); await esperar(PAUSA_REVISION_MS + 20) }

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers(); vi.clearAllMocks()
  mock.preguntar.mockReset(); mock.practica.mockReset()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers() })

describe('tutor de la pregunta', () => {
  it('aparece con cualquier resultado y no consulta nada hasta que lo pides', async () => {
    for (const [estado, pastilla] of [['correcta', 'Correcta'], ['parcial', 'Parcialmente correcta'], ['incorrecta', 'Incorrecta']] as const) {
      await pintar({ estado })
      expect(host.querySelector('.tutor')).not.toBeNull()
      expect(host.textContent).toContain('Claude'); expect(host.textContent).toContain('Tu tutor de esta pregunta')
      expect(host.querySelector('.tutor-contexto')!.textContent).toContain(pastilla)
      expect(host.querySelector('.tutor-contexto')!.textContent).toContain('Pregunta 3')
    }
    expect(mock.preguntar).not.toHaveBeenCalled(); expect(mock.practica).not.toHaveBeenCalled()
  })

  it('ofrece las tres sugerencias con su etiqueta, el stem killer solo si aplica, y las del ítem', async () => {
    await pintar({ sugerencias: ['¿Por qué no es «Hipotiroidismo»?', 'Otra más', 'Una tercera que sobra'] })
    for (const t of ['Mecanismo paso a paso', 'Key learning point', 'Stem killer', '¿Por qué no es «Hipotiroidismo»?', 'Recuperación activa']) expect(boton(t), t).toBeTruthy()
    expect(host.textContent).toContain('Explora este caso')
    expect(boton('Una tercera que sobra')).toBeUndefined()
    await pintar({ stemKiller: false })
    expect(boton('Stem killer')).toBeUndefined()
  })

  it('una sugerencia del ítem que repite una cápsula fija no aparece dos veces', async () => {
    await pintar({ sugerencias: ['Explícame el mecanismo paso a paso', '¿Por qué no es «Hipotiroidismo»?'] })
    expect(botones().filter(b => /mecanismo/i.test(b.textContent ?? ''))).toHaveLength(1)
    expect(boton('¿Por qué no es «Hipotiroidismo»?')).toBeTruthy()
  })

  it('una sugerencia se vuelve tu burbuja, llama a Claude con el texto exacto y pinta su respuesta', async () => {
    mock.preguntar.mockResolvedValue({ estado: 'ok', texto: 'La cadena es:\n1. Cae el **flujo** renal.\n2. Sube la `creatinina`.\n- Dato que manda: la oliguria.', fuente: { title: 'Melman · Renal', page: 12 } })
    await pintar()
    await clic('Mecanismo paso a paso')
    expect(mock.preguntar).toHaveBeenCalledWith(origen, 'Explícame el mecanismo paso a paso', [], expect.any(AbortSignal))
    expect(host.querySelector('.tutor-turno--yo .tutor-burbuja')!.textContent).toBe('Explícame el mecanismo paso a paso')
    const respuesta = host.querySelectorAll('.tutor-turno--ia .tutor-burbuja')
    const ultima = respuesta[respuesta.length - 1]
    expect(ultima.querySelector('strong')!.textContent).toBe('flujo')
    expect(ultima.querySelector('code')!.textContent).toBe('creatinina')
    expect(ultima.querySelectorAll('ol li')).toHaveLength(2)
    expect(ultima.querySelectorAll('ul li')).toHaveLength(1)
    expect(ultima.textContent).toContain('Material: Melman · Renal · p. 12')
    // Usada, la sugerencia deja de ofrecerse; las demás siguen.
    expect(boton('Mecanismo paso a paso')).toBeUndefined(); expect(boton('Key learning point')).toBeTruthy()
  })

  it('la conversación se manda como parejas yo → ia y el texto escrito sale por el campo', async () => {
    mock.preguntar.mockResolvedValueOnce({ estado: 'ok', texto: 'Primera respuesta de Claude, bastante larga.' })
      .mockResolvedValueOnce({ estado: 'ok', texto: 'Segunda respuesta de Claude, también larga.' })
    await pintar()
    await clic('Key learning point')
    const campo = host.querySelector<HTMLInputElement>('input[aria-label="Tu pregunta para Claude"]')!
    expect(campo.placeholder).toBe('Pregunta algo sobre este caso…')
    await escribir(campo, '¿Y si la presión fuera normal?')
    await clic('Enviar pregunta')
    expect(mock.preguntar).toHaveBeenLastCalledWith(origen, '¿Y si la presión fuera normal?',
      [{ rol: 'yo', texto: '¿Cuál es el key learning point de este ejercicio?' }, { rol: 'ia', texto: 'Primera respuesta de Claude, bastante larga.' }], expect.any(AbortSignal))
    expect(campo.value).toBe('')
  })

  it('mientras Claude piensa no deja enviar otra cosa; un error se explica y se reintenta sin duplicar tu mensaje', async () => {
    let resolver!: (v: unknown) => void
    mock.preguntar.mockReturnValueOnce(new Promise(r => { resolver = r }))
    await pintar()
    await clic('Stem killer')
    expect(host.querySelector('.tutor-burbuja--pensando')).not.toBeNull()
    expect(boton('Key learning point')).toBeUndefined()
    expect(boton('Enviar pregunta')!.disabled).toBe(true)
    await act(async () => resolver({ estado: 'sin_ia', motivo: 'Claude está saturado en este momento.' }))
    expect(host.querySelector('[role="alert"]')!.textContent).toContain('Claude está saturado en este momento.')
    mock.preguntar.mockResolvedValueOnce({ estado: 'ok', texto: 'Aquí tienes la respuesta ya sin problemas.' })
    await clic('Reintentar')
    expect(mock.preguntar).toHaveBeenCalledTimes(2)
    expect(mock.preguntar.mock.calls[1][1]).toBe('¿Hay un stem killer en esta pregunta?')
    expect(host.querySelectorAll('.tutor-turno--yo')).toHaveLength(1)
    expect(host.querySelector('[role="alert"]')).toBeNull()
    expect(host.textContent).toContain('Aquí tienes la respuesta ya sin problemas.')
  })

  it('ampliar el chat cambia su estado accesible y «Ver pregunta» / «Siguiente pregunta» solo existen si se pasan', async () => {
    await pintar()
    expect(boton(/Ver pregunta/)).toBeUndefined(); expect(boton(/Siguiente pregunta/)).toBeUndefined()
    const onVer = vi.fn(), onSig = vi.fn()
    await pintar({ onVerPregunta: onVer, onSiguiente: onSig })
    await clic(/Ver pregunta/); expect(onVer).toHaveBeenCalledOnce()
    await clic(/Siguiente pregunta/); expect(onSig).toHaveBeenCalledOnce()
    const ampliar = boton('Ampliar el chat')!
    expect(ampliar.getAttribute('aria-expanded')).toBe('false')
    await act(async () => ampliar.click())
    expect(boton('Reducir el chat')!.getAttribute('aria-expanded')).toBe('true')
    expect(host.querySelector('.tutor--amplio')).not.toBeNull()
  })
})

describe('recuperación activa dentro del chat', () => {
  it('Claude prepara la ronda y la tarjeta muestra progreso, formato y acciones', async () => {
    let resolver!: (v: unknown) => void
    mock.practica.mockReturnValueOnce(new Promise(r => { resolver = r }))
    await pintar()
    await clic('Recuperación activa')
    expect(host.textContent).toContain('Claude está escribiendo los ejercicios')
    expect(mock.practica).toHaveBeenCalledWith(origen, [], expect.any(AbortSignal))
    await act(async () => resolver({ estado: 'ok', ejercicios: ronda() }))
    const tarjeta = host.querySelector('.tutor-practica')!
    expect(tarjeta.textContent).toContain('Recuperación activa'); expect(tarjeta.textContent).toContain('1 de 6')
    expect(tarjeta.querySelectorAll('.tutor-progreso i')).toHaveLength(6)
    expect(tarjeta.querySelector('.tutor-capsula-formato')!.textContent).toBe('Palabra clave')
    expect(tarjeta.textContent).toContain('Completa el concepto clave')
    for (const t of ['Cambiar formato', 'Una pista', 'No lo recuerdo', 'Comprobar']) expect(boton(t), t).toBeTruthy()
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Palabra que completa la frase"]')!.placeholder).toBe('Escribe tu respuesta…')
    expect(boton('Comprobar')!.disabled).toBe(true)
  })

  it('«Comprobar» pasa por «Revisando…», revela el resultado con la explicación y rellena el segmento', async () => {
    await pintar(); await abrirPractica()
    await escribir(host.querySelector<HTMLInputElement>('input.tutor-campo')!, 'Fosfofructocinasa')
    await clic('Comprobar')
    expect(boton(/Revisando/)!.disabled).toBe(true)
    expect(host.querySelector('.tutor-resultado')).toBeNull()
    await esperar(PAUSA_REVISION_MS + 20)
    const r = host.querySelector('.tutor-resultado')!
    expect(r.getAttribute('data-estado')).toBe('ok'); expect(r.textContent).toContain('Correcto')
    expect(r.textContent).toContain('Es el paso limitante')
    expect(host.querySelector('.tutor-progreso i')!.className).toContain('hecho--ok')
    expect(document.activeElement).toBe(boton('Siguiente ejercicio'))
  })

  it('una respuesta equivocada enseña la correcta; una abreviatura aceptada cuenta', async () => {
    await pintar(); await abrirPractica()
    await escribir(host.querySelector<HTMLInputElement>('input.tutor-campo')!, 'hexocinasa')
    await comprobar()
    const r = host.querySelector('.tutor-resultado')!
    expect(r.getAttribute('data-estado')).toBe('mal'); expect(r.textContent).toContain('Todavía no')
    expect(r.querySelector('.tutor-esperada')!.textContent).toContain('fosfofructocinasa')
    expect(host.querySelector('.tutor-hueco')!.textContent).toBe('fosfofructocinasa')
    await clic('Siguiente ejercicio'); expect(host.querySelector('.tutor-practica')!.textContent).toContain('2 de 6')
  })

  it('«Una pista» usa la de Claude o deriva una; «No lo recuerdo» enseña la respuesta sin contar como acierto', async () => {
    await pintar(); await abrirPractica()
    await clic('Una pista')
    expect(host.querySelector('.tutor-pista')!.textContent).toContain('Fosforila la fructosa-6-fosfato.')
    expect(boton('Una pista')!.disabled).toBe(true)
    await clic('No lo recuerdo')
    const r = host.querySelector('.tutor-resultado')!
    expect(r.getAttribute('data-estado')).toBe('sin'); expect(r.textContent).toContain('fosfofructocinasa')
    expect(host.querySelector('.tutor-progreso i')!.className).toContain('hecho--sin')
    // Pistas derivadas: orientan, no resuelven.
    const [vf, unica, multiple, ordenar, emparejar] = ronda().slice(1)
    expect(pistaDe(unica)).not.toContain('Glucagón»  es'); expect(pistaDe(multiple)).toBe('Hay 3 respuestas correctas.')
    expect(pistaDe(ordenar)).toContain('Cae la glucemia'); expect(pistaDe(emparejar)).toContain('Glucagón')
    expect(pistaDe(vf)).toContain('causa → efecto')
    expect(pistaDe({ ...ronda()[0], pista: undefined } as Ejercicio)).toBe('Empieza por «f» y tiene 17 letras.')
  })

  it('«Cambiar formato» ofrece solo los tipos que aún quedan y trae ese ejercicio ahora', async () => {
    await pintar(); await abrirPractica()
    await clic('Cambiar formato')
    const ofrecidos = [...host.querySelectorAll('.tutor-formatos button')].map(b => b.textContent)
    expect(ofrecidos).toEqual(['Verdadero o falso', 'Una respuesta', 'Selección múltiple', 'Ordenar pasos', 'Emparejar'])
    await clic('Ordenar pasos')
    expect(host.querySelector('.tutor-capsula-formato')!.textContent).toBe('Ordenar pasos')
    expect(host.textContent).toContain('Ordena los pasos'); expect(host.textContent).toContain('1 de 6')
    // El ejercicio que se dejó atrás no se pierde: sigue pendiente.
    await clic('Cambiar formato')
    expect([...host.querySelectorAll('.tutor-formatos button')].map(b => b.textContent)).toContain('Palabra clave')
  })

  it('cada tipo de ejercicio se responde y se corrige', async () => {
    await pintar(); await abrirPractica()
    await clic('No lo recuerdo'); await clic('Siguiente ejercicio')
    // verdadero o falso
    await clic('Falso'); expect(boton('Comprobar')!.disabled).toBe(false); await comprobar()
    expect(host.querySelector('.tutor-resultado')!.getAttribute('data-estado')).toBe('ok'); await clic('Siguiente ejercicio')
    // una respuesta
    await clic(/Insulina/); await comprobar()
    expect(host.querySelector('.tutor-resultado')!.getAttribute('data-estado')).toBe('mal')
    expect(host.querySelector('.tutor-opcion[data-estado="correcta"]')!.textContent).toContain('Glucagón'); await clic('Siguiente ejercicio')
    // selección múltiple: todas o nada
    for (const o of ['Glucagón', 'Cortisol', 'Lipólisis']) await clic(new RegExp(o))
    await comprobar(); expect(host.querySelector('.tutor-resultado')!.getAttribute('data-estado')).toBe('ok'); await clic('Siguiente ejercicio')
    // ordenar: pulsar los pasos en orden
    for (const p of ['Cae la glucemia', 'Sube el glucagón', 'Sube el AMPc', 'Se activa la glucogenólisis']) await clic(new RegExp(`^${p}$`))
    await comprobar(); expect(host.querySelector('.tutor-resultado')!.getAttribute('data-estado')).toBe('ok'); await clic('Siguiente ejercicio')
    // emparejar
    const selects = [...host.querySelectorAll<HTMLSelectElement>('.tutor-pares select')]
    expect(boton('Comprobar')!.disabled).toBe(true)
    const destino: Record<string, string> = { Glucagón: 'Hígado', Adrenalina: 'Músculo', Insulina: 'Hígado' }
    for (const s of selects) await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(s, destino[s.getAttribute('aria-label')!.replace('Empareja: ', '')])
      s.dispatchEvent(new Event('change', { bubbles: true })) })
    await comprobar()
    expect(host.querySelector('.tutor-resultado')!.getAttribute('data-estado')).toBe('mal')
    expect(host.querySelector('.tutor-pares')!.textContent).toContain('Tejido graso')
  })

  it('al terminar se recoge en un resumen compacto, repasa las falladas y pide otra ronda sin repetir', async () => {
    await pintar(); await abrirPractica()
    await escribir(host.querySelector<HTMLInputElement>('input.tutor-campo')!, 'PFK'); await comprobar()
    await clic('Siguiente ejercicio')
    for (let n = 0; n < 4; n++) { await clic('No lo recuerdo'); await clic('Siguiente ejercicio') }
    await clic('No lo recuerdo')
    expect(boton('Ver resumen')).toBeTruthy(); await clic('Ver resumen')
    const resumen = host.querySelector('.tutor-practica--resumen')!
    expect(resumen.textContent).toContain('Ronda 1'); expect(resumen.textContent).toContain('1 de 6')
    expect(resumen.textContent).toContain('1 correcta · 1 sin pista')
    expect(resumen.querySelectorAll('.tutor-resumen-capsulas li')).toHaveLength(6)
    expect(resumen.querySelector('details')!.textContent).toContain('Ver lo que falló')
    // Repasar las falladas: vuelven solo esas cinco.
    await clic('Repasar las falladas')
    expect(host.querySelector('.tutor-practica')!.textContent).toContain('1 de 5')
    await clic('No lo recuerdo'); await clic('Terminar ronda')
    expect(host.querySelector('.tutor-practica--resumen')).not.toBeNull()
    // Otra ronda: Claude recibe los enunciados ya vistos.
    mock.practica.mockResolvedValueOnce({ estado: 'ok', ejercicios: ronda(2) })
    await clic('Otra ronda con ideas nuevas'); await act(async () => { await Promise.resolve() })
    const evitar = mock.practica.mock.calls[1][1] as string[]
    expect(evitar).toHaveLength(6); expect(evitar[0]).toContain('tipo 1')
    expect(host.textContent).toContain('Ronda 1'); expect(host.textContent).toContain('1 de 6')
    expect(host.querySelectorAll('.tutor-practica--resumen')).toHaveLength(1)
    // Solo la última ronda ofrece seguir.
    expect(boton('Otra ronda con ideas nuevas')).toBeUndefined()
  })

  it('si Claude no devuelve ejercicios lo dice y deja reintentar sin dejar la tarjeta a medias', async () => {
    mock.practica.mockResolvedValueOnce({ estado: 'sin_ia', motivo: 'Claude no devolvió ejercicios utilizables. Puedes volver a intentarlo.' })
    await pintar(); await clic('Recuperación activa'); await act(async () => { await Promise.resolve() })
    expect(host.querySelector('.tutor-practica')).toBeNull()
    expect(host.querySelector('[role="alert"]')!.textContent).toContain('Claude no devolvió ejercicios utilizables')
    mock.practica.mockResolvedValueOnce({ estado: 'ok', ejercicios: ronda() })
    await clic('Reintentar'); await act(async () => { await Promise.resolve() })
    expect(host.querySelector('.tutor-practica')!.textContent).toContain('1 de 6')
  })
})

describe('texto de Claude', () => {
  it('interpreta listas y énfasis sin dejar pasar HTML', () => {
    expect(bloquesDe('Intro\nsigue\n\n1. Uno\n2. Dos\n\n- a\n- b\n\n<img src=x onerror=alert(1)>')).toEqual([
      { tipo: 'p', lineas: ['Intro', 'sigue'] }, { tipo: 'ol', items: ['Uno', 'Dos'] }, { tipo: 'ul', items: ['a', 'b'] },
      { tipo: 'p', lineas: ['<img src=x onerror=alert(1)>'] }])
  })
})

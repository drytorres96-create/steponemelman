import { describe, expect, it } from 'vitest'
import { analizarEnunciado, normalizarLinea, normalizarTexto } from './texto'

describe('normalizarLinea', () => {
  it('repara edades partidas por la extracción', () => {
    expect(normalizarLinea('A 57-year- old man comes to the physician')).toBe('A 57-year-old man comes to the physician')
    expect(normalizarLinea('A 1 -year- old boy is admitted')).toBe('A 1-year-old boy is admitted')
    expect(normalizarLinea('A 6 -month-old girl')).toBe('A 6-month-old girl')
  })

  it('quita el espacio anterior a la puntuación de cierre', () => {
    expect(normalizarLinea('Myeloid cells (immature and mature )')).toBe('Myeloid cells (immature and mature)')
    expect(normalizarLinea('67 %')).toBe('67%')
    expect(normalizarLinea('shows pallor .')).toBe('shows pallor.')
  })

  it('restituye el exponente de las unidades de volumen', () => {
    expect(normalizarLinea('150,000/mm 3')).toBe('150,000/mm³')
    expect(normalizarLinea('1.73 m 2')).toBe('1.73 m²')
  })

  it('cierra el espacio que la extracción dejó dentro de una unidad', () => {
    expect(normalizarLinea('74,000/ mm 3')).toBe('74,000/mm³')
    expect(normalizarLinea('12 mg/ dL')).toBe('12 mg/dL')
  })

  it('no altera cifras, unidades ni términos médicos', () => {
    expect(normalizarLinea('8 g/dL')).toBe('8 g/dL')
    expect(normalizarLinea('Na+ 140 mEq/L')).toBe('Na+ 140 mEq/L')
    expect(normalizarLinea('Philadelphia (Ph1) chromosome')).toBe('Philadelphia (Ph1) chromosome')
  })

  it('conserva una lectura dudosa en lugar de adivinarla', () => {
    expect(normalizarLinea("8 g.' dL")).toContain("g.'")
    expect(normalizarLinea('50:QQ0/ mm 3')).toContain('50:QQ0')
  })
})

describe('normalizarTexto', () => {
  it('une los saltos introducidos al ajustar el ancho de página', () => {
    const crudo = 'including an admission to the hospital at the\nage of 2 weeks because of fever.'
    expect(normalizarTexto(crudo)).toBe('including an admission to the hospital at the age of 2 weeks because of fever.')
  })

  it('no une líneas que son valores consecutivos', () => {
    expect(normalizarTexto('increased\nincreased\nnormal')).toBe('increased\nincreased\nnormal')
  })
})

describe('analizarEnunciado', () => {
  it('reconstruye una tabla de laboratorio partida en dos columnas', () => {
    const crudo = [
      'A 57-year- old man comes to the physician because of joint pain. Laboratory studies show:',
      'Hemoglobin', 'Hematocrit', 'Leukocyte count', 'Platelet count',
      '8 g/dL', '25%', '150,000/mm 3', '250,000/mm 3',
      'A chimeric protein with which of the following activities is most likely encoded?',
    ].join('\n')
    const bloques = analizarEnunciado(crudo)

    const tabla = bloques.find(b => b.tipo === 'laboratorio')
    expect(tabla).toBeDefined()
    if (tabla?.tipo !== 'laboratorio') throw new Error('se esperaba una tabla')
    expect(tabla.filas).toEqual([
      { etiqueta: 'Hemoglobin', valor: '8 g/dL', dudoso: false },
      { etiqueta: 'Hematocrit', valor: '25%', dudoso: false },
      { etiqueta: 'Leukocyte count', valor: '150,000/mm³', dudoso: false },
      { etiqueta: 'Platelet count', valor: '250,000/mm³', dudoso: false },
    ])
    expect(bloques[bloques.length - 1]).toEqual({
      tipo: 'parrafo',
      texto: 'A chimeric protein with which of the following activities is most likely encoded?',
    })
  })

  it('empareja valores cualitativos con su etiqueta', () => {
    const crudo = [
      'Examination of the contents of the duodenum postprandially',
      'show:',
      'Trypsinogen', 'Proelastase', 'Lipase', 'Amylase',
      'increased', 'increased', 'normal', 'normal',
      'A deficiency of which of the following enzymes is the most likely cause?',
    ].join('\n')
    const bloques = analizarEnunciado(crudo)
    const tabla = bloques.find(b => b.tipo === 'laboratorio')
    if (tabla?.tipo !== 'laboratorio') throw new Error('se esperaba una tabla')
    expect(tabla.filas.map(f => `${f.etiqueta}=${f.valor}`)).toEqual([
      'Trypsinogen=increased', 'Proelastase=increased', 'Lipase=normal', 'Amylase=normal',
    ])
  })

  it('marca el valor cuya lectura es dudosa sin sustituirlo', () => {
    const crudo = [
      'Laboratory studies show:',
      'Leukocyte count', 'Platelet count',
      '150,000/mm 3', '50:QQ0/ mm 3',
      'Which of the following is the most likely diagnosis?',
    ].join('\n')
    const tabla = analizarEnunciado(crudo).find(b => b.tipo === 'laboratorio')
    if (tabla?.tipo !== 'laboratorio') throw new Error('se esperaba una tabla')
    expect(tabla.filas[0].dudoso).toBe(false)
    expect(tabla.filas[1].dudoso).toBe(true)
    expect(tabla.filas[1].valor).toContain('50:QQ0')
  })

  it('deja el texto intacto cuando el bloque no encaja en etiquetas y valores', () => {
    const crudo = [
      'Laboratory studies show:',
      'Hemoglobin', 'Hematocrit', 'Leukocyte count',
      '8 g/dL', '25%',
      'Which of the following is the most likely diagnosis?',
    ].join('\n')
    const bloques = analizarEnunciado(crudo)
    expect(bloques.every(b => b.tipo === 'parrafo')).toBe(true)
  })

  it('no fabrica una tabla en un enunciado de prosa continua', () => {
    const crudo = 'A 24-year-old woman comes to the physician because of fatigue. Which of the following is the most likely cause?'
    expect(analizarEnunciado(crudo)).toEqual([{ tipo: 'parrafo', texto: crudo }])
  })

  it('conserva íntegro el texto de las etiquetas y los valores', () => {
    const crudo = [
      'Laboratory studies show:',
      'Myeloid cells (immature and mature )', 'Philadelphia (Ph1) chromosome',
      '90%', 'present',
      'Which of the following is most likely?',
    ].join('\n')
    const tabla = analizarEnunciado(crudo).find(b => b.tipo === 'laboratorio')
    if (tabla?.tipo !== 'laboratorio') throw new Error('se esperaba una tabla')
    expect(tabla.filas[0].etiqueta).toBe('Myeloid cells (immature and mature)')
    expect(tabla.filas[1].valor).toBe('present')
  })
})

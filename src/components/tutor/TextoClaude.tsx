import type { ReactNode } from 'react'

/**
 * Pinta la respuesta de Claude sin HTML crudo: párrafos, listas con viñetas o numeradas y
 * negrita, cursiva y código en línea. Todo lo demás se muestra como texto, nunca se interpreta.
 */

const EN_LINEA = /(\*\*[^*\n]+\*\*|`[^`\n]+`|(?<![*\w])\*[^*\s][^*\n]*?\*(?![*\w]))/g

function enLinea(texto: string, clave: string): ReactNode[] {
  const partes: ReactNode[] = []
  let ultimo = 0, n = 0
  for (const m of texto.matchAll(EN_LINEA)) {
    const inicio = m.index ?? 0
    if (inicio > ultimo) partes.push(texto.slice(ultimo, inicio))
    const t = m[0]
    const k = `${clave}-${n++}`
    if (t.startsWith('**')) partes.push(<strong key={k}>{t.slice(2, -2)}</strong>)
    else if (t.startsWith('`')) partes.push(<code key={k}>{t.slice(1, -1)}</code>)
    else partes.push(<em key={k}>{t.slice(1, -1)}</em>)
    ultimo = inicio + t.length
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo))
  return partes
}

type Bloque = { tipo: 'p'; lineas: string[] } | { tipo: 'ul' | 'ol'; items: string[] }

export function bloquesDe(texto: string): Bloque[] {
  const bloques: Bloque[] = []
  for (const cruda of texto.replace(/\r\n?/g, '\n').split('\n')) {
    const linea = cruda.trimEnd()
    if (!linea.trim()) { bloques.push({ tipo: 'p', lineas: [] }); continue }
    const vineta = /^\s*(?:[-*•])\s+(.*)$/.exec(linea)
    const numero = /^\s*\d{1,2}[.)]\s+(.*)$/.exec(linea)
    const ultimo = bloques[bloques.length - 1]
    if (vineta || numero) {
      const tipo = vineta ? 'ul' : 'ol'
      const item = (vineta ?? numero)![1]
      if (ultimo?.tipo === tipo) ultimo.items.push(item)
      else bloques.push({ tipo, items: [item] })
    } else {
      const limpia = linea.replace(/^#{1,4}\s+/, '')
      if (ultimo?.tipo === 'p') ultimo.lineas.push(limpia)
      else bloques.push({ tipo: 'p', lineas: [limpia] })
    }
  }
  return bloques.filter(b => b.tipo !== 'p' || b.lineas.length)
}

export function TextoClaude({ texto }: { texto: string }) {
  return <>{bloquesDe(texto).map((b, i) => b.tipo === 'p'
    ? <p key={i}>{b.lineas.map((l, j) => <span key={j}>{j > 0 && <br />}{enLinea(l, `${i}-${j}`)}</span>)}</p>
    : b.tipo === 'ul'
      ? <ul key={i}>{b.items.map((it, j) => <li key={j}>{enLinea(it, `${i}-${j}`)}</li>)}</ul>
      : <ol key={i}>{b.items.map((it, j) => <li key={j}>{enLinea(it, `${i}-${j}`)}</li>)}</ol>)}</>
}

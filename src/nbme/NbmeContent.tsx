import type { NbmeContentBlock } from './types'

/** Only explicit, validated source blocks become tables. Never infer missing cells. */
export function NbmeContent({ text, blocks }: { text: string; blocks?: NbmeContentBlock[] }) {
  const content: NbmeContentBlock[] = blocks ?? text.replace(/\r\n?/g, '\n')
    .split(/\n[\t ]*\n+/).filter(part => part.trim()).map(part => ({ type: 'paragraph', text: part.trim() }))
  return <div className="nbme-content">{content.map((block, index) => block.type === 'table'
    ? <div className="nbme-data-scroll" role="region" aria-label={block.caption || 'Tabla de la pregunta'} tabIndex={0} key={index}>
      <table className="nbme-data-table">
        {block.caption && <caption>{block.caption}</caption>}
        <thead><tr>{block.headers.map((header, column) => <th scope="col" key={column}>{header}</th>)}</tr></thead>
        <tbody>{block.rows.map((row, line) => <tr key={line}>{row.map((cell, column) => <td key={column}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
    : <p key={index} className={block.type === 'prompt' ? 'nbme-prompt' : undefined}>{block.text}</p>)}</div>
}

/** Una invitación que no abre un modal ni interrumpe el siguiente ejercicio. */
export function PausaDeBloque({ onParar }: { onParar: () => void }) {
  return <details className="session-block-pause">
    <summary>Bloque terminado · pausa opcional</summary>
    <p className="mini">Puedes seguir a tu ritmo o parar por ahora. Tu avance queda guardado.</p>
    <button className="btn fantasma" onClick={onParar}>Parar por ahora</button>
  </details>
}

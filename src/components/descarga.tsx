import { useState } from 'react'
import { Modal } from './comunes'

/**
 * Entrega de archivos que funciona también dentro de un visor que bloquea las descargas:
 * intenta la descarga y, además, ofrece el contenido para copiar al portapapeles.
 */
export function useDescarga() {
  const [dato, setDato] = useState<{ nombre: string; contenido: string } | null>(null)
  const [copiado, setCopiado] = useState(false)

  const entregar = (nombre: string, contenido: string, tipo: string) => {
    try {
      const url = URL.createObjectURL(new Blob([contenido], { type: tipo }))
      const a = document.createElement('a')
      a.href = url; a.download = nombre; a.rel = 'noopener'
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 3000)
    } catch { /* el visor puede bloquear la descarga */ }
    setDato({ nombre, contenido }); setCopiado(false)
  }

  const dialogo = dato ? (
    <Modal titulo={dato.nombre} onCerrar={() => setDato(null)} ancho={820}>
      <p className="sutil">
        Si la descarga no se inició (algunos visores la bloquean), copia el contenido y pégalo en un archivo
        con este nombre.
      </p>
      <div className="fila" style={{ marginBottom: 10 }}>
        <button className="btn principal pequeno" onClick={async () => {
          try { await navigator.clipboard.writeText(dato.contenido); setCopiado(true) }
          catch { setCopiado(false) }
        }}>{copiado ? 'Copiado' : 'Copiar al portapapeles'}</button>
        <span className="mini">{(dato.contenido.length / 1024).toFixed(0)} KB</span>
      </div>
      <textarea readOnly rows={14} value={dato.contenido} onFocus={e => e.currentTarget.select()}
        style={{ fontFamily: 'var(--mono)', fontSize: '.75rem' }} aria-label="Contenido del archivo" />
    </Modal>
  ) : null

  return { entregar, dialogo }
}

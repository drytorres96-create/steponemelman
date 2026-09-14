import { useEffect, useRef, useState } from 'react'
import { porcentajeRestante, useCuotaIA } from '../lib/cuota-ia'

const RADIO = 30
const PERIMETRO = 2 * Math.PI * RADIO
const DURACION_MS = 900

/**
 * Cuenta desde el valor anterior hasta el nuevo.
 *
 * El primer valor no se anima: al entrar se quiere leer el dato, no ver un contador
 * arrancando de cero. Los cambios posteriores sí, porque ahí el movimiento es la
 * información —algo acaba de gastar— y es lo que hace que se note sin avisar.
 */
function useNumeroAnimado(destino: number | null): number {
  const [valor, setValor] = useState(destino ?? 0)
  const anterior = useRef<number | null>(null)
  useEffect(() => {
    // Mientras no hay cuota no hay dato: el primero que llega es el que aparece directo.
    if (destino === null) return
    const quieto = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    if (anterior.current === null || quieto || typeof requestAnimationFrame !== 'function') {
      anterior.current = destino; setValor(destino); return
    }
    const desde = anterior.current
    anterior.current = destino
    if (desde === destino) return
    const inicio = performance.now()
    let ticket = 0
    const paso = (ahora: number) => {
      const t = Math.min(1, (ahora - inicio) / DURACION_MS)
      // Desaceleración: sale rápido y se posa, en vez de terminar de golpe.
      setValor(Math.round(desde + (destino - desde) * (1 - (1 - t) ** 3)))
      if (t < 1) ticket = requestAnimationFrame(paso)
    }
    ticket = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(ticket)
  }, [destino])
  return valor
}

/**
 * Lo que queda hoy de la IA gratuita.
 *
 * La primera versión cabía en 40 px y pintaba la cifra del color del anillo: a ese tamaño
 * el número no se leía, que es justo lo único que hacía falta leer. Ahora el anillo manda
 * en el raíl, la cifra va en el color del texto —contraste de sobra— y el porcentaje cuenta
 * hasta su nuevo valor cuando algo gasta, para que el cambio no pase desapercibido.
 *
 * No hay descuento optimista: lo que se pinta es lo que el servidor ha contabilizado.
 */
export function MedidorIA() {
  const cuota = useCuotaIA()
  const porcentaje = cuota ? porcentajeRestante(cuota) : 0
  const mostrado = useNumeroAnimado(cuota ? porcentaje : null)
  if (!cuota) return null

  const agotado = porcentaje === 0
  const bajo = porcentaje <= 20
  const estado = !cuota.activa ? 'Ayuda de IA desactivada en este despliegue'
    : agotado ? 'Sin cuota hoy · vuelve a las 00:00 UTC'
    : `${porcentaje} % disponible · se renueva a las 00:00 UTC`

  return <div className={`medidor-ia${bajo ? ' medidor-bajo' : ''}${agotado ? ' medidor-cero' : ''}${!cuota.activa ? ' medidor-apagado' : ''}`}>
    <span className="editorial-eyebrow medidor-titulo">IA gratis hoy</span>
    <div className="medidor-anillo">
      <svg viewBox="0 0 70 70" aria-hidden="true">
        <circle className="medidor-pista" cx="35" cy="35" r={RADIO} />
        <circle className="medidor-arco" cx="35" cy="35" r={RADIO}
          strokeDasharray={PERIMETRO} strokeDashoffset={PERIMETRO * (1 - porcentaje / 100)} />
      </svg>
      <span className="medidor-valor" aria-hidden="true">{mostrado}<i>%</i></span>
    </div>
    <p className="medidor-detalle" role="status">{estado}</p>
  </div>
}

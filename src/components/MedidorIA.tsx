import { porcentajeRestante, useCuotaIA } from '../lib/cuota-ia'

const RADIO = 17
const PERIMETRO = 2 * Math.PI * RADIO

/**
 * Lo que queda hoy de la IA gratuita, en un anillo.
 *
 * El presupuesto existía desde 1.12.0 pero solo se veía después de usar la IA, y en una
 * línea de texto dentro de una tarjeta. Aquí está siempre a la vista, en el sitio donde ya
 * se mira el estado de la aplicación, y baja solo después de cada uso.
 *
 * El anillo transiciona en lugar de saltar: el cambio se ve ocurrir, que es lo que hace
 * que el número signifique algo. No hay descuento optimista —lo que se pinta es lo que el
 * servidor ha contabilizado—, porque un uso servido desde caché no gasta nada.
 */
export function MedidorIA() {
  const cuota = useCuotaIA()
  if (!cuota) return null

  const porcentaje = porcentajeRestante(cuota)
  const agotado = porcentaje === 0
  const bajo = porcentaje <= 20
  const titulo = !cuota.activa ? 'La ayuda de IA está desactivada en este despliegue'
    : agotado ? 'Sin cuota gratuita hoy; se renueva a las 00:00 UTC'
    : `Queda el ${porcentaje} % del presupuesto gratuito de hoy · se renueva a las 00:00 UTC`

  return <div className={`medidor-ia${bajo ? ' medidor-bajo' : ''}${!cuota.activa ? ' medidor-apagado' : ''}`} title={titulo}>
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <circle className="medidor-pista" cx="20" cy="20" r={RADIO} />
      <circle className="medidor-arco" cx="20" cy="20" r={RADIO}
        strokeDasharray={PERIMETRO} strokeDashoffset={PERIMETRO * (1 - porcentaje / 100)} />
    </svg>
    <span className="medidor-cifra" aria-hidden="true">{porcentaje}</span>
    <div className="medidor-texto">
      <span className="medidor-rotulo">IA gratis hoy</span>
      <span className="medidor-detalle" role="status">
        {!cuota.activa ? 'Desactivada' : agotado ? 'Agotada · vuelve a las 00:00 UTC' : `${porcentaje} % disponible`}
      </span>
    </div>
  </div>
}

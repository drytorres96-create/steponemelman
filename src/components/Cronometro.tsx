import { tiempoLegible } from '../lib/tiempo'

const PERIMETRO = 2 * Math.PI * 44

/** Reloj de sesión en un anillo lateral: fuera de la columna de lectura, visible sin robar el foco. */
export function Cronometro({ msVisibles, presupuesto, sinLimite }: { msVisibles: number; presupuesto: number; sinLimite: boolean }) {
  const total = presupuesto * 60000
  const excedido = msVisibles >= total
  const fraccion = Math.min(1, total > 0 ? msVisibles / total : 0)
  const aviso = sinLimite ? 'Has elegido continuar'
    : excedido ? 'Termina esta pregunta; después puedes pausar o continuar.'
    : 'Incluye preguntas y explicaciones'
  return <div className={`cronometro${excedido && !sinLimite ? ' excedido' : ''}`}>
    <div className="cronometro-anillo" role="timer"
      aria-label={`${tiempoLegible(msVisibles)} de ${presupuesto} minutos de sesión. ${aviso}`}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <linearGradient id="cronometro-trazo" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--cian)" /><stop offset="55%" stopColor="var(--violeta-2)" />
            <stop offset="100%" stopColor="var(--magenta)" />
          </linearGradient>
        </defs>
        <circle className="cronometro-pista" cx="50" cy="50" r="44" />
        <circle className="cronometro-avance" cx="50" cy="50" r="44"
          strokeDasharray={PERIMETRO} strokeDashoffset={PERIMETRO * (1 - fraccion)} />
      </svg>
      <div className="cronometro-lectura" aria-hidden="true">
        <b>{tiempoLegible(msVisibles)}</b><span>{presupuesto} min</span>
      </div>
    </div>
    {excedido && !sinLimite && <p className="cronometro-aviso">{aviso}</p>}
  </div>
}

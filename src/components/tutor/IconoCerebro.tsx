/**
 * Cerebro de Claude para el tutor de la pregunta. Trazo, no relleno: hereda `currentColor`,
 * así sirve igual en el avatar (terracota sobre jade), en los botones y en las cápsulas.
 */
export function IconoCerebro({ tamano = 20, className }: { tamano?: number; className?: string }) {
  return <svg className={className} width={tamano} height={tamano} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {/* Hemisferio izquierdo y derecho */}
    <path d="M12 5.4c0-1.3-1.1-2.3-2.4-2.2-1.2.1-2.1 1-2.2 2.1-1.7.1-2.9 1.5-2.7 3.1-1.2.7-1.7 2.2-1 3.4-.8 1.2-.6 2.8.5 3.7-.1 1.6 1.2 2.9 2.7 2.8.5 1.2 1.7 2 3.1 1.8.7-.1 1.3-.5 1.7-1V5.4Z"/>
    <path d="M12 5.4c0-1.3 1.1-2.3 2.4-2.2 1.2.1 2.1 1 2.2 2.1 1.7.1 2.9 1.5 2.7 3.1 1.2.7 1.7 2.2 1 3.4.8 1.2.6 2.8-.5 3.7.1 1.6-1.2 2.9-2.7 2.8-.5 1.2-1.7 2-3.1 1.8-.7-.1-1.3-.5-1.7-1V5.4Z"/>
    {/* Pliegues */}
    <path d="M9.3 9.2c.9-.1 1.7.4 2 1.2"/>
    <path d="M14.7 9.2c-.9-.1-1.7.4-2 1.2"/>
    <path d="M8.2 14c1 0 1.9-.5 2.3-1.4"/>
    <path d="M15.8 14c-1 0-1.9-.5-2.3-1.4"/>
  </svg>
}

import type { CSSProperties } from 'react'

/** Public, decorative scenery is independent of study content and user state. */
export type CinematicScene = 'forest' | 'dawn' | 'constellation' | 'lens' | 'ribbons' | 'horizon' | 'stone' | 'smoke' | 'sunrise' | 'sunset'

function SceneImage({ scene, className = '', priority = false, sizes = '100vw' }: {
  scene: CinematicScene; className?: string; priority?: boolean; sizes?: string
}) {
  const warm = scene === 'sunrise' || scene === 'sunset'
  return <picture className={`medical-image ${className}`} aria-hidden="true">
    <source media="(max-width: 760px)" srcSet={`/images/cinematic/${scene}-mobile.webp`} />
    <img src={`/images/cinematic/${scene}-desktop.webp`} sizes={sizes} width={warm ? 1672 : 1536} height={warm ? 941 : 1024}
      alt="" aria-hidden="true" loading={priority ? 'eager' : 'lazy'} decoding="async" />
  </picture>
}

export function CinematicBackdrop({ scene, quiet = false }: { scene: CinematicScene; quiet?: boolean }) {
  const focus: Record<CinematicScene, string> = {
    forest: '78% 38%', dawn: '76% 30%', constellation: '72% 30%', lens: '78% 50%',
    ribbons: '78% 40%', horizon: '80% 40%', stone: '78% 55%', smoke: '78% 45%',
    sunrise: '72% 35%', sunset: '72% 40%',
  }
  return <div className={`cinematic-backdrop${quiet ? ' cinematic-backdrop-quiet' : ''}`}
    style={{ '--scene-focus': focus[scene] } as CSSProperties} aria-hidden="true">
    {!quiet && <SceneImage scene={scene} priority />}
  </div>
}

export function MedicalImage({ scene, className = '', priority = false, sizes }: {
  scene: 'membrane' | 'fluid' | 'organic'; className?: string; priority?: boolean; sizes?: string
}) {
  const artwork: Record<typeof scene, CinematicScene> = { membrane: 'lens', fluid: 'ribbons', organic: 'constellation' }
  return <SceneImage scene={artwork[scene]} className={className} priority={priority} sizes={sizes} />
}

export function CrystalOrbit() {
  return <svg className="crystal-orbit" viewBox="0 0 160 150" fill="none" aria-hidden="true">
    <ellipse cx="80" cy="75" rx="59" ry="23" transform="rotate(-35 80 75)" />
    <ellipse cx="80" cy="75" rx="59" ry="23" transform="rotate(35 80 75)" />
    <ellipse cx="80" cy="75" rx="23" ry="59" />
    <circle cx="80" cy="75" r="7" /><circle cx="129" cy="41" r="3" />
  </svg>
}

export function Brand() {
  return <div className="marca editorial-brand"><span className="brand-mark" aria-hidden="true">
    <svg viewBox="0 0 32 32" fill="none"><path d="M13 4h6v9h9v6h-9v9h-6v-9H4v-6h9V4Z" fill="currentColor" /></svg>
  </span><span className="brand-wordmark">StepOne<span>Melman</span></span></div>
}

export function NavigationIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    inicio: 'M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10Z',
    modulos: 'M12 5v16M12 5C9 3 5 3 2 4v15c4-1 7-1 10 2 3-3 6-3 10-2V4c-3-1-7-1-10 1Z',
    progreso: 'M4 3v17h17M9 15v-4m5 4V7m5 8V4',
    repaso: 'M3 10a9 9 0 1 1 2 8M3 4v6h6M12 7v5l3 2',
    recuperacion: 'M3 10a9 9 0 1 1 2 8M3 4v6h6M12 7v5l3 2',
    semana: 'M4 6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6Zm0 4h16M8 3v4m8-4v4',
    arrow: 'M4 12h16m-6-6 6 6-6 6',
  }
  return <svg className="navigation-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.modulos} /></svg>
}

export function StudyHero() {
  return <header className="editorial-hero">
    <MedicalImage scene="organic" sizes="(max-width: 760px) 100vw, 65vw" />
    <div className="editorial-hero-copy"><p className="editorial-eyebrow">Plan diario clásico</p><h1>Tu estudio <em>de hoy.</em></h1><p>Puedes pausar y retomar cuando lo necesites.</p></div>
  </header>
}

export function ScreenHeading({ eyebrow, title, description, scene = 'organic' }: {
  eyebrow: string; title: string; description: string; scene?: 'membrane' | 'fluid' | 'organic'
}) {
  return <header className={`screen-heading screen-heading-${scene}`}>
    <div><p className="editorial-eyebrow">{eyebrow}</p><h1>{title}</h1><p className="sutil">{description}</p></div>
    <MedicalImage scene={scene} sizes="(max-width: 600px) 140px, 240px" />
  </header>
}

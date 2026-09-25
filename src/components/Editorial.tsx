import { useEffect, useState } from 'react'

/** Public, decorative scenery is independent of study content and user state. */
export type CinematicScene = 'forest' | 'dawn' | 'constellation' | 'lens' | 'ribbons' | 'horizon' | 'stone' | 'smoke' | 'sunrise' | 'sunset' | 'luminous/ocean'
/** Cut-out objects with real transparency: they cross the edge of a glass panel. */
export type CinematicObject = 'crystal' | 'optical-violet' | 'neural-violet' | 'forest'

/** Literal paths. A URL assembled while painting the fixed layer ends up as a 404 request. */
const FONDOS = [
  { id: 'constellation', ancho: '/images/cinematic/constellation-desktop.webp', estrecho: '/images/cinematic/constellation-mobile.webp' },
  { id: 'smoke', ancho: '/images/cinematic/smoke-desktop.webp', estrecho: '/images/cinematic/smoke-mobile.webp' },
  { id: 'lens', ancho: '/images/cinematic/lens-desktop.webp', estrecho: '/images/cinematic/lens-mobile.webp' },
  { id: 'horizon', ancho: '/images/cinematic/horizon-desktop.webp', estrecho: '/images/cinematic/horizon-mobile.webp' },
  { id: 'dawn', ancho: '/images/cinematic/dawn-desktop.webp', estrecho: '/images/cinematic/dawn-mobile.webp' },
  { id: 'ribbons', ancho: '/images/cinematic/ribbons-desktop.webp', estrecho: '/images/cinematic/ribbons-mobile.webp' },
  { id: 'stone', ancho: '/images/cinematic/stone-desktop.webp', estrecho: '/images/cinematic/stone-mobile.webp' },
  { id: 'forest', ancho: '/images/cinematic/forest-desktop.webp', estrecho: '/images/cinematic/forest-mobile.webp' },
] as const satisfies readonly { id: CinematicScene; ancho: string; estrecho: string }[]

const OBJETOS = {
  crystal: { src: '/images/cinematic/foreground/crystal.webp', ancho: 760, alto: 760 },
  'optical-violet': { src: '/images/cinematic/foreground/optical-violet.webp', ancho: 860, alto: 860 },
  'neural-violet': { src: '/images/cinematic/foreground/neural-violet.webp', ancho: 860, alto: 860 },
  forest: { src: '/images/cinematic/foreground/forest.webp', ancho: 1100, alto: 619 },
} as const satisfies Record<CinematicObject, { src: string; ancho: number; alto: number }>

function SceneImage({ scene, className = '', priority = false, sizes = '100vw' }: {
  scene: CinematicScene; className?: string; priority?: boolean; sizes?: string
}) {
  const wide = scene === 'sunrise' || scene === 'sunset' || scene === 'luminous/ocean'
  return <picture className={`medical-image ${className}`} aria-hidden="true">
    <source media="(max-width: 760px)" srcSet={`/images/cinematic/${scene}-mobile.webp`} />
    <img src={`/images/cinematic/${scene}-desktop.webp`} sizes={sizes} width={wide ? 1672 : 1536} height={wide ? 941 : 1024}
      alt="" aria-hidden="true" loading={priority ? 'eager' : 'lazy'} decoding="async" />
  </picture>
}

/**
 * La escena ocupa la ventana entera: las fotografías se apilan y solo cambia la opacidad,
 * de modo que cambiar de vista funde una en otra en vez de recargar la capa. Una escena ya
 * vista se queda montada; así el fundido de vuelta no vuelve a pedir la imagen.
 */
export function CinematicBackdrop({ scene, quiet = false }: { scene: CinematicScene; quiet?: boolean }) {
  const [montadas, setMontadas] = useState<CinematicScene[]>(() => [scene])
  const [activa, setActiva] = useState<CinematicScene>(scene)
  useEffect(() => { setMontadas(m => m.includes(scene) ? m : [...m, scene]) }, [scene])
  useEffect(() => {
    // La capa nueva se pinta a opacidad cero y sube en el siguiente cuadro: sin esto no hay fundido.
    if (!montadas.includes(scene)) return
    const cuadro = requestAnimationFrame(() => setActiva(scene))
    return () => cancelAnimationFrame(cuadro)
  }, [scene, montadas])
  return <div className={`cinematic-backdrop${quiet ? ' cinematic-backdrop-quiet' : ''}`} data-scene={scene} aria-hidden="true">
    {montadas.map(id => {
      const fondo = FONDOS.find(f => f.id === id)
      return fondo && <picture key={id} className="cine-escena" data-activa={id === activa ? 'true' : 'false'}>
        <source media="(max-width: 760px)" srcSet={fondo.estrecho} />
        <img src={fondo.ancho} alt="" aria-hidden="true" decoding="async" />
      </picture>
    })}
    <div className="cine-velo" /><div className="cine-haz" /><div className="cine-niebla" />
    <div className="cine-halo" /><div className="cine-vineta" />
  </div>
}

/** La fotografía de la cabecera va dentro del cristal, con su propio velo para el texto. */
export function ScenePhoto({ scene }: { scene: CinematicScene }) {
  return <div className="panel-escena" aria-hidden="true">
    <SceneImage scene={scene} priority sizes="(max-width: 760px) 100vw, 62vw" />
  </div>
}

/** A complete photographic environment, contained within the access panel. */
export function AccessScene() {
  return <div className="access-scene" aria-hidden="true">
    <SceneImage scene="luminous/ocean" priority sizes="(max-width: 760px) 100vw, 48vw" />
  </div>
}

/** A continuous environment in its own grid cell, never underneath progress or actions. */
export function CinematicWindow({ scene = 'luminous/ocean', caption = 'Un espacio para concentrarte.', object }: {
  scene?: CinematicScene; caption?: string; object?: CinematicObject
}) {
  const objeto = object ? OBJETOS[object] : null
  return <figure className="scene-window" data-scene={scene} aria-hidden="true">
    {/* Carga perezosa: en escritorio está a la vista y baja enseguida; en el teléfono el
        panel no se muestra y su fotografía no llega a pedirse. */}
    <div className="scene-pan"><SceneImage scene={scene} sizes="(max-width: 760px) 100vw, 30vw" /></div>
    {/* Solo el objeto recortado cruza el borde del panel; los paneles nunca se tocan entre sí. */}
    {objeto && <img className="scene-object" src={objeto.src} width={objeto.ancho} height={objeto.alto}
      alt="" aria-hidden="true" loading="lazy" decoding="async" />}
    <figcaption><span className="scene-glint" />{caption}</figcaption>
  </figure>
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
    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor"><circle cx="20" cy="20" r="15" strokeWidth=".75" /><ellipse cx="20" cy="20" rx="19" ry="6" transform="rotate(-35 20 20)" strokeWidth="1" /><circle cx="20" cy="20" r="2.5" fill="currentColor" stroke="none" /><circle cx="34" cy="10" r="2" fill="currentColor" stroke="none" /></svg>
  </span><span className="brand-wordmark">Melman<span>Step One</span></span></div>
}

export function NavigationIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    hoy: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z',
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
  return <header className="editorial-hero" data-depth-scene>
    <ScenePhoto scene="dawn" />
    <div className="editorial-hero-copy"><p className="editorial-eyebrow">Plan diario clásico</p><h1>Tu estudio <em>de hoy.</em></h1><p>Puedes pausar y retomar cuando lo necesites.</p></div>
  </header>
}

/** El paisaje de la columna derecha lo pone la aplicación; aquí la foto vive dentro del cristal. */
export function ScreenHeading({ eyebrow, title, description, scene = 'organic', landscape = 'constellation' }: {
  eyebrow: string; title: string; description: string; scene?: 'membrane' | 'fluid' | 'organic'; landscape?: CinematicScene;
}) {
  return <header className={`screen-heading screen-heading-${scene}`} data-depth-scene>
    <ScenePhoto scene={landscape} />
    <div className="screen-heading-copy"><p className="editorial-eyebrow">{eyebrow}</p><h1>{title}</h1><p className="sutil">{description}</p></div>
  </header>
}

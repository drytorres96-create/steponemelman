/** Decorative artwork is deliberately separate from the private medical content. */
export function MedicalImage({ scene, className = '', priority = false, sizes = '(max-width: 760px) 100vw, 50vw' }: {
  scene: 'membrane' | 'fluid' | 'organic'; className?: string; priority?: boolean; sizes?: string
}) {
  const directory = scene === 'organic' ? 'v171' : 'v170'
  return <img className={`medical-image ${className}`} src={`/images/${directory}/${scene}-768.webp`}
    srcSet={`/images/${directory}/${scene}-768.webp 768w, /images/${directory}/${scene}-1536.webp 1536w`}
    sizes={sizes} width={1536} height={1024} alt="" aria-hidden="true"
    loading={priority ? 'eager' : 'lazy'} decoding="async" />
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
    <MedicalImage scene="organic" priority sizes="(max-width: 760px) 100vw, 65vw" />
    <div className="editorial-hero-copy"><p className="editorial-eyebrow">Aprender con intención</p><h1>Tu estudio{' '}<br /><em>de hoy.</em></h1><p>Un siguiente paso. Puedes pausar y retomar cuando lo necesites.</p><span className="hero-signature">Comprende. Conecta. Recuerda.</span></div>
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
